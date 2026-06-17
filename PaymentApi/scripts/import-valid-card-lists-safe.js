const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const { db, ensureMongoSchema, client } = require("../src/db");

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

function cleanText(value, fallback = null) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text || ["unknown", "null", "undefined", "api only"].includes(text.toLowerCase())) return fallback;
  return text;
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

function luhnValid(pan) {
  const digits = digitsOnly(pan);
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (shouldDouble) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function maskPan(pan) {
  const digits = digitsOnly(pan);
  if (digits.length < 10) return null;
  return `${digits.slice(0, 6)}******${digits.slice(-4)}`;
}

function fingerprint(pan, expiry) {
  return crypto
    .createHash("sha256")
    .update(`${digitsOnly(pan)}|${expiry.month}|${expiry.year}`)
    .digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseExistingBinLabel(value) {
  const parts = String(value || "")
    .split("/")
    .map((part) => cleanText(part))
    .filter(Boolean);
  return {
    country: parts[0] || null,
    bank: parts[1] || null,
    cardType: parts[2] || null,
    segment: parts[3] || null,
    raw: parts.length ? parts.join("/") : null
  };
}

function parseLine(line, index) {
  const raw = String(line || "").trim();
  if (!raw) return null;

  const parts = raw.split("|").map((part) => part.trim());
  const pan = digitsOnly(parts[0]);
  const expiry = normalizeExpiry(parts[1]);
  const maskedPan = maskPan(pan);
  const holderName = cleanText(parts[3]);
  const sourceBinLabel = parseExistingBinLabel(parts[4]);

  if (!maskedPan || !expiry) {
    return {
      ok: false,
      lineNumber: index + 1,
      raw,
      reason: !maskedPan ? "invalid_pan" : "invalid_expiry"
    };
  }

  if (isExpired(expiry)) {
    return {
      ok: false,
      lineNumber: index + 1,
      raw,
      maskedPan,
      reason: "expired"
    };
  }

  if (!luhnValid(pan)) {
    return {
      ok: false,
      lineNumber: index + 1,
      raw,
      maskedPan,
      reason: "luhn_failed"
    };
  }

  const hash = fingerprint(pan, expiry);
  return {
    ok: true,
    lineNumber: index + 1,
    raw,
    id: `valid-offline-${hash.slice(0, 24)}`,
    recordHash: hash,
    maskedPan,
    first6: pan.slice(0, 6),
    last4: pan.slice(-4),
    expMonth: expiry.month,
    expYear: expiry.year,
    holderName,
    sourceBinLabel
  };
}

function buildDoc(card, batchId) {
  const now = new Date().toISOString();
  return {
    id: card.id,
    batchId,
    lineNumber: card.lineNumber,
    validationMode: "offline_luhn_expiry",
    liveChecked: false,
    liveStatus: "not_run",
    maskedPan: card.maskedPan,
    first6: card.first6,
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
    holderName: card.holderName,
    CountryCode: card.sourceBinLabel.country,
    CardType: card.sourceBinLabel.cardType,
    Segment: card.sourceBinLabel.segment,
    Bank: card.sourceBinLabel.bank,
    binlabel: card.sourceBinLabel.raw,
    recordHash: card.recordHash,
    storesRawPan: false,
    storesCvv: false,
    updatedAt: now,
    createdAt: now
  };
}

async function main() {
  const inputPath = path.resolve(process.cwd(), argValue("--input", "datas/output.txt"));
  const delayMs = Math.max(0, Number(argValue("--delay-ms", "1000")) || 0);
  const limit = Math.max(0, Number(argValue("--limit", "0")) || 0);
  const dryRun = hasArg("--dry-run");
  const quiet = hasArg("--quiet");
  const batchId = argValue("--batch-id", `valid-offline-${new Date().toISOString().replace(/[:.]/g, "-")}`);

  const text = await fs.readFile(inputPath, "utf8");
  const parsed = text
    .split(/\r?\n/)
    .map(parseLine)
    .filter(Boolean);
  const rows = limit > 0 ? parsed.slice(0, limit) : parsed;
  const validRows = rows.filter((row) => row.ok);
  const invalidRows = rows.filter((row) => !row.ok);
  const invalidByReason = invalidRows.reduce((acc, row) => {
    acc[row.reason] = (acc[row.reason] || 0) + 1;
    return acc;
  }, {});

  let upserted = 0;
  let modified = 0;
  const mongo = dryRun ? null : await db.getDb();
  if (!dryRun) {
    await ensureMongoSchema();
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!quiet) {
      const label = row.ok ? row.maskedPan : row.maskedPan || `line=${row.lineNumber}`;
      console.log(`[${index + 1}/${rows.length}] ${row.ok ? "offline-valid" : row.reason} ${label}`);
    }

    if (row.ok && !dryRun) {
      const result = await mongo.collection("validCardLists").updateOne(
        { id: row.id },
        {
          $setOnInsert: {
            id: row.id,
            createdAt: new Date().toISOString()
          },
          $set: buildDoc(row, batchId)
        },
        { upsert: true }
      );
      upserted += result.upsertedCount || 0;
      modified += result.modifiedCount || 0;
    }

    if (delayMs > 0 && index < rows.length - 1) {
      await sleep(delayMs);
    }
  }

  const summary = {
    input: path.relative(process.cwd(), inputPath),
    batchId,
    totalProcessed: rows.length,
    offlineValid: validRows.length,
    skipped: invalidRows.length,
    skippedByReason: invalidByReason,
    delayMs,
    dryRun,
    collection: "validCardLists",
    upserted,
    modified,
    liveChecked: false,
    storesRawPan: false,
    storesCvv: false
  };
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("FATAL:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close().catch(() => {});
  });
