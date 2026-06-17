const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

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
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return year < currentYear || (year === currentYear && month < currentMonth);
}

function maskPan(pan) {
  const digits = digitsOnly(pan);
  if (digits.length < 10) return null;
  return `${digits.slice(0, 6)}******${digits.slice(-4)}`;
}

function recordHash(pan, expiry) {
  return crypto
    .createHash("sha256")
    .update(`${digitsOnly(pan)}|${expiry.month}|${expiry.year}`)
    .digest("hex")
    .slice(0, 24);
}

function csvValue(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function toCsv(rows, headers) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))
  ].join("\n") + (rows.length ? "\n" : "");
}

function parseLine(line, lineNumber) {
  const raw = String(line || "").trim();
  if (!raw) return null;
  const parts = raw.split("|");
  const pan = digitsOnly(parts[0]);
  const expiry = normalizeExpiry(parts[1]);
  const maskedPan = maskPan(pan);

  if (!maskedPan || !expiry) {
    return {
      lineNumber,
      valid: false,
      reason: !maskedPan ? "invalid_pan" : "invalid_expiry"
    };
  }

  return {
    lineNumber,
    valid: true,
    pan,
    bin: pan.slice(0, 6),
    last4: pan.slice(-4),
    maskedPan,
    expiry,
    expired: isExpired(expiry),
    recordHash: recordHash(pan, expiry),
    correlationId: `card-${String(lineNumber).padStart(6, "0")}-${recordHash(pan, expiry)}`
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, limit) }, run));
  return results;
}

async function loadBinCheck() {
  const paypalService = require("../src/services/paypalService");
  return async function binCheck(bin) {
    const result = await paypalService.binCheckCard({ bin });
    const online = result.source !== "offline_bin_prefix_fallback";
    return {
      status: online ? result.status : "failed",
      source: result.source,
      online,
      summary: result.summary || {},
      warning: online
        ? result.providerWarning || null
        : result.providerWarning || result.fallbackError || "Online BIN lookup failed; offline prefix fallback was rejected.",
      fallbackError: result.fallbackError || null
    };
  };
}

async function main() {
  const inputPath = path.resolve(process.cwd(), argValue("--input", "datas/data.txt"));
  const outputDir = path.resolve(process.cwd(), argValue("--out-dir", "datas/processed"));
  const runBinCheck = hasArg("--bin-check");
  const concurrency = Number(argValue("--concurrency", "3")) || 3;

  const text = await fs.readFile(inputPath, "utf8");
  const parsed = text
    .split(/\r?\n/)
    .map((line, index) => parseLine(line, index + 1))
    .filter(Boolean);

  const valid = parsed.filter((item) => item.valid);
  const active = valid.filter((item) => !item.expired);
  const expired = valid.filter((item) => item.expired);
  const invalid = parsed.filter((item) => !item.valid);

  let binLookup = null;
  if (runBinCheck) {
    const binCheck = await loadBinCheck();
    
    const cache = new Map();
    await mapLimit(active, concurrency, async (item) => {
      if (!cache.has(item.bin)) {
        cache.set(item.bin, binCheck(item.bin).catch((error) => ({
          status: "failed",
          source: "bin_check_error",
          online: false,
          summary: {},
          warning: error.message,
          fallbackError: null
        })));
      }
      item.binCheck = await cache.get(item.bin);
    });
    binLookup = Object.fromEntries(await Promise.all(
      Array.from(cache.entries()).map(async ([bin, promise]) => [bin, await promise])
    ));
  }

  await fs.mkdir(outputDir, { recursive: true });

  const activeSafe = active.map((item) => ({
    lineNumber: item.lineNumber,
    correlationId: item.correlationId,
    recordHash: item.recordHash,
    maskedPan: item.maskedPan,
    bin: item.bin,
    last4: item.last4,
    expMonth: item.expiry.month,
    expYear: item.expiry.year,
    bank: item.binCheck?.summary?.issuer || null,
    cardLevel: item.binCheck?.summary?.level || null,
    cardBrand: item.binCheck?.summary?.brand || null,
    cardType: item.binCheck?.summary?.type || null,
    country: item.binCheck?.summary?.country || null,
    binCheckResult: item.binCheck || null
  }));

  const expiredSafe = expired.map((item) => ({
    lineNumber: item.lineNumber,
    correlationId: item.correlationId,
    recordHash: item.recordHash,
    maskedPan: item.maskedPan,
    bin: item.bin,
    last4: item.last4,
    expMonth: item.expiry.month,
    expYear: item.expiry.year
  }));

  const processorRows = active.map((item) => ({
    correlationId: item.correlationId,
    lineNumber: item.lineNumber,
    maskedPan: item.maskedPan,
    bin: item.bin,
    last4: item.last4,
    expMonth: item.expiry.month,
    expYear: item.expiry.year,
    binStatus: item.binCheck?.status || "",
    binSource: item.binCheck?.source || "",
    bank: item.binCheck?.summary?.issuer || "",
    cardLevel: item.binCheck?.summary?.level || "",
    cardBrand: item.binCheck?.summary?.brand || "",
    cardType: item.binCheck?.summary?.type || "",
    issuer: item.binCheck?.summary?.issuer || "",
    country: item.binCheck?.summary?.country || "",
    warning: item.binCheck?.warning || ""
  }));

  const debugMap = active.map((item) => ({
    correlationId: item.correlationId,
    lineNumber: item.lineNumber,
    recordHash: item.recordHash,
    maskedPan: item.maskedPan,
    bin: item.bin,
    last4: item.last4,
    expMonth: item.expiry.month,
    expYear: item.expiry.year,
    sourceFile: path.relative(process.cwd(), inputPath),
    sourceLineNumber: item.lineNumber,
    processorReference: null,
    providerStatus: null,
    providerMessage: null,
    note: "Use correlationId in processor notes/logs to match responses back to the source line without exposing full PAN or CVV."
  }));

  const summary = {
    generatedAt: new Date().toISOString(),
    input: path.relative(process.cwd(), inputPath),
    outputDir: path.relative(process.cwd(), outputDir),
    totalLines: parsed.length,
    activeCount: active.length,
    expiredCount: expired.length,
    invalidCount: invalid.length,
    binCheck: runBinCheck ? "enabled_bin_only" : "disabled",
    onlineBinSuccessCount: active.filter((item) => item.binCheck?.online).length,
    onlineBinFailedCount: runBinCheck ? active.filter((item) => !item.binCheck?.online).length : 0,
    note: "Expired records are excluded from active outputs. Outputs intentionally exclude full PAN, CVV, names, emails, phones, IPs, and raw source lines."
  };

  await fs.writeFile(
    path.join(outputDir, "active-cards.masked.jsonl"),
    activeSafe.map((item) => JSON.stringify(item)).join("\n") + (activeSafe.length ? "\n" : "")
  );
  await fs.writeFile(
    path.join(outputDir, "active-cards.online-bin.jsonl"),
    activeSafe.map((item) => JSON.stringify(item)).join("\n") + (activeSafe.length ? "\n" : "")
  );
  await fs.writeFile(
    path.join(outputDir, "expired-cards.masked.jsonl"),
    expiredSafe.map((item) => JSON.stringify(item)).join("\n") + (expiredSafe.length ? "\n" : "")
  );
  await fs.writeFile(
    path.join(outputDir, "invalid-lines.jsonl"),
    invalid.map((item) => JSON.stringify(item)).join("\n") + (invalid.length ? "\n" : "")
  );
  await fs.writeFile(
    path.join(outputDir, "processor-debug-map.jsonl"),
    debugMap.map((item) => JSON.stringify(item)).join("\n") + (debugMap.length ? "\n" : "")
  );
  await fs.writeFile(
    path.join(outputDir, "active-cards.processor.csv"),
    toCsv(processorRows, [
      "correlationId",
      "lineNumber",
      "maskedPan",
      "bin",
      "last4",
      "expMonth",
      "expYear",
      "binStatus",
      "binSource",
      "bank",
      "cardLevel",
      "cardBrand",
      "cardType",
      "issuer",
      "country",
      "warning"
    ])
  );
  await fs.writeFile(path.join(outputDir, "summary.json"), JSON.stringify({ ...summary, binLookup }, null, 2));

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
