const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { client, db } = require("../src/db");

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeExpiry(value) {
  const parts = String(value || "").trim().split(/[/-]/).map((part) => digitsOnly(part));
  let [month, year] = parts;
  if (!month || !year) return null;
  month = month.padStart(2, "0");
  if (year.length === 2) year = `20${year}`;
  if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^\d{4}$/.test(year)) return null;
  return { month, year };
}

function isExpired(expiry, now = new Date()) {
  const year = Number(expiry.year);
  const month = Number(expiry.month);
  return year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
}

function maskPan(value) {
  const digits = digitsOnly(value);
  if (digits.length < 10) return null;
  return `${digits.slice(0, 6)}******${digits.slice(-4)}`;
}

function makeRecordHash(pan, expiry) {
  return crypto
    .createHash("sha256")
    .update(`${digitsOnly(pan)}|${expiry.month}|${expiry.year}`)
    .digest("hex")
    .slice(0, 24);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deepPick(source, paths) {
  for (const candidatePath of paths) {
    const value = candidatePath.split(".").reduce((current, key) => {
      if (current == null || typeof current !== "object") return undefined;
      return current[key];
    }, source);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function normalizeCardType(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("debit")) return "debit";
  if (text.includes("credit")) return "credit";
  return null;
}

function normalizeBinResult(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    countryCode: deepPick(data, [
      "country.alpha2",
      "country.code",
      "countryCode",
      "country_code",
      "data.country.alpha2",
      "data.country.code"
    ]),
    bank: deepPick(data, [
      "bank.name",
      "issuer.name",
      "bank",
      "issuer",
      "data.bank.name",
      "data.issuer.name",
      "data.bank"
    ]),
    cardType: normalizeCardType(deepPick(data, [
      "type",
      "card_type",
      "funding",
      "scheme.type",
      "data.type",
      "data.card_type"
    ])),
    cardLevel: deepPick(data, [
      "level",
      "category",
      "card_level",
      "data.level",
      "data.category"
    ])
  };
}

function parseLine(line, lineNumber) {
  const raw = String(line || "").trim();
  if (!raw) return null;
  const parts = raw.split("|");
  const panDigits = digitsOnly(parts[0]);
  const expiry = normalizeExpiry(parts[1]);
  const maskedPan = maskPan(panDigits);

  if (!maskedPan || !expiry) {
    return {
      valid: false,
      lineNumber,
      reason: !maskedPan ? "invalid_pan" : "invalid_expiry"
    };
  }

  const hash = makeRecordHash(panDigits, expiry);
  return {
    valid: true,
    lineNumber,
    bin: panDigits.slice(0, 6),
    last4: panDigits.slice(-4),
    maskedPan,
    expiry,
    expired: isExpired(expiry),
    recordHash: hash,
    correlationId: `card-${String(lineNumber).padStart(6, "0")}-${hash}`,
    holderName: String(parts[3] || "").trim() || null
  };
}

async function fetchBincheckIo(bin, template) {
  const url = template.replace(/\{bin\}/g, encodeURIComponent(bin));
  const apiKey = process.env.BINCHECK_IO_API_KEY || process.env.RAPIDAPI_KEY;
  const apiHost = process.env.BINCHECK_IO_API_HOST;
  const response = await axios.get(url, {
    timeout: 20000,
    validateStatus: () => true,
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "CardMarket masked BIN importer",
      ...(apiKey ? { "x-rapidapi-key": apiKey } : {}),
      ...(apiHost ? { "x-rapidapi-host": apiHost } : {})
    }
  });

  const contentType = String(response.headers["content-type"] || "");
  const raw = contentType.includes("json") || typeof response.data === "object"
    ? response.data
    : { rawText: String(response.data || "").slice(0, 2000) };

  return {
    provider: "bincheck.io",
    url,
    httpStatus: response.status,
    ok: response.status >= 200 && response.status < 300,
    raw,
    normalized: normalizeBinResult(raw)
  };
}

async function main() {
  const inputPath = path.resolve(process.cwd(), argValue("--input", "datas/data.txt"));
  const delayMs = Number(argValue("--delay-ms", "1000")) || 1000;
  const limit = Number(argValue("--limit", "0")) || 0;
  const dryRun = hasArg("--dry-run");
  const template = argValue("--bincheck-url", process.env.BINCHECK_IO_URL_TEMPLATE || "https://bincheck.io/details/{bin}");

  const text = await fs.readFile(inputPath, "utf8");
  const parsed = text
    .split(/\r?\n/)
    .map((line, index) => parseLine(line, index + 1))
    .filter(Boolean);
  const valid = parsed.filter((item) => item.valid);
  const active = valid.filter((item) => !item.expired).slice(0, limit > 0 ? limit : undefined);
  const expired = valid.filter((item) => item.expired);
  const invalid = parsed.filter((item) => !item.valid);
  const mongo = dryRun ? null : await db.getDb();
  const collection = mongo ? mongo.collection("uncheckedCards") : null;
  const binCache = new Map();
  const summary = {
    input: path.relative(process.cwd(), inputPath),
    totalLines: parsed.length,
    activeCount: active.length,
    expiredSkippedCount: expired.length,
    invalidSkippedCount: invalid.length,
    insertedOrUpdatedCount: 0,
    binLookups: 0,
    dryRun,
    storesRawPan: false,
    storesCvv: false
  };

  for (const item of active) {
    if (!binCache.has(item.bin)) {
      if (binCache.size > 0) await sleep(delayMs);
      summary.binLookups += 1;
      try {
        binCache.set(item.bin, await fetchBincheckIo(item.bin, template));
      } catch (error) {
        binCache.set(item.bin, {
          provider: "bincheck.io",
          ok: false,
          error: error.message,
          raw: null,
          normalized: {}
        });
      }
    }

    const binResult = binCache.get(item.bin);
    const normalized = binResult.normalized || {};
    const now = new Date().toISOString();
    const doc = {
      sourceLineNumber: item.lineNumber,
      correlationId: item.correlationId,
      recordHash: item.recordHash,
      maskedPan: item.maskedPan,
      bin: item.bin,
      last4: item.last4,
      exp: `${item.expiry.month}/${item.expiry.year}`,
      expMonth: item.expiry.month,
      expYear: item.expiry.year,
      zip: "00000",
      holderName: item.holderName,
      countryCode: normalized.countryCode || null,
      bank: normalized.bank || null,
      cardType: normalized.cardType || null,
      cardLevel: normalized.cardLevel || null,
      binCheckProvider: "bincheck.io",
      binCheckStatus: binResult.ok ? "passed" : "failed",
      binResponseRaw: binResult.raw || null,
      binCheckError: binResult.error || null,
      checked: false,
      live: false,
      updatedAt: now
    };

    if (dryRun) {
      summary.insertedOrUpdatedCount += 1;
      continue;
    }

    await collection.updateOne(
      { correlationId: item.correlationId },
      {
        $setOnInsert: { id: uuidv4(), createdAt: now },
        $set: doc
      },
      { upsert: true }
    );
    summary.insertedOrUpdatedCount += 1;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close().catch(() => {});
  });
