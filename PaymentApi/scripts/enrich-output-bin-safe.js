const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const paymentApiRoot = path.resolve(__dirname, "..");

try {
  require("dotenv").config({ path: path.join(paymentApiRoot, ".env") });
} catch (_) {}

// ----- Yardımcı fonksiyonlar -----
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

function cleanText(value, fallback = "UNKNOWN") {
  const text = String(value || "").trim();
  if (!text || ["api only", "unknown", "null", "undefined"].includes(text.toLowerCase())) return fallback;
  return text.replace(/\s+/g, " ");
}

function normalizeExpiry(value) {
  const parts = String(value || "").trim().split(/[/-]/).map((part) => digitsOnly(part));
  let [month, year] = parts;
  if (!month || !year) return null;
  month = month.padStart(2, "0");
  if (year.length === 2) year = `20${year}`;
  if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^\d{4}$/.test(year)) return null;
  return { month, year, label: `${month}/${year}` };
}

function isExpired(expiry, now = new Date()) {
  const year = Number(expiry.year);
  const month = Number(expiry.month);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return year < currentYear || (year === currentYear && month < currentMonth);
}

function maskPan(value) {
  const pan = digitsOnly(value);
  if (pan.length < 10) return null;
  return `${pan.slice(0, 6)}******${pan.slice(-4)}`;
}

function recordHash(pan, expiry) {
  return crypto
    .createHash("sha256")
    .update(`${digitsOnly(pan)}|${expiry.month}|${expiry.year}`)
    .digest("hex")
    .slice(0, 32);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLine(line, index) {
  const raw = String(line || "").trim();
  if (!raw) return null;

  const parts = raw.split("|").map((part) => part.trim());
  const pan = digitsOnly(parts[0]);
  const expiry = normalizeExpiry(parts[1]);
  const cvv = digitsOnly(parts[2]);
  const maskedPan = maskPan(pan);

  if (!maskedPan || !expiry) {
    return {
      valid: false,
      lineNumber: index + 1,
      raw,
      reason: !maskedPan ? "invalid_pan" : "invalid_expiry"
    };
  }

  return {
    valid: true,
    lineNumber: index + 1,
    raw,
    pan,
    bin: pan.slice(0, 6),
    last4: pan.slice(-4),
    maskedPan,
    cvv: cvv || "",
    recordHash: recordHash(pan, expiry),
    expiry,
    name: cleanText(parts[3], ""),
    existingBinLabel: cleanText(parts[4], "UNKNOWN/UNKNOWN/UNKNOWN/UNKNOWN")
  };
}

// ----- Live Checker API (tek kaynak) -----
async function callLiveChecker(card) {
  const payload = {
    provider: "clover",
    operation: "verification",
    pan: card.pan,
    expMonth: card.expiry.month,
    expYear: card.expiry.year,
    cvv: card.cvv,
    zip: "00000",
    compact: true
  };
  const response = await axios.post("http://localhost:5173/api/checkers/live-checker", payload, {
    withCredentials: true,
    timeout: 15000
  });
  const data = response.data || {};
  const isLive = data.isLive ?? data.IsLive ?? false;
  return {
    isLive,
    referenceId: data.referenceId || data.id || null,
    countryName: data.countryName || data.counryName || null,
    countryCode: data.CountryCode || null,
    cardType: data.CardType || null,
    segment: data.Segment || null,
    binTitle: data.binTitle || null,
    message: data.message || ""
  };
}

// ----- DB yazma (CheckedCards) -----
async function writeCheckedCards(liveItems, batchId) {
  const db = require("../src/db");
  await db.ensureMongoSchema();
  const mongo = await db.getDb();
  const collection = mongo.collection("CheckedCards");
  await collection.createIndex({ id: 1 }, { unique: true });

  const now = new Date().toISOString();
  let upserted = 0;

  for (const item of liveItems) {
    const doc = {
      id: `checked-${item.recordHash}`,
      CountryCode: item.liveData.countryCode || null,
      CardType: item.liveData.cardType || "unknown",
      Segment: item.liveData.segment || "UNKNOWN",
      maskedPan: item.maskedPan,
      expMonth: item.expiry.month,
      expYear: item.expiry.year,
      holderName: item.name || null,
      zip: "00000",
      balance: 0,
      binlabel: item.liveData.binTitle || item.existingBinLabel,
      createdAt: now,
      updatedAt: now
    };
    const result = await collection.replaceOne({ id: doc.id }, doc, { upsert: true });
    if (result.upsertedCount > 0 || result.modifiedCount > 0) upserted++;
  }
  return upserted;
}

// ----- Rapor satırı formatı -----
const reportHeaders = [
  "cardNumber", "expMonth", "expYear", "holderName", "zip",
  "balance", "binlabel", "CountryCode", "CardType", "Segment", "isLive", "referenceId"
];

function formatReportLine(item) {
  if (!item.valid) {
    return `INVALID|line=${item.lineNumber}|${item.reason}`;
  }
  const live = item.liveData || {};
  return [
    item.maskedPan,
    item.expiry.month,
    item.expiry.year,
    item.name || "",
    "00000",
    "none",
    live.binTitle || item.existingBinLabel,
    live.countryCode || "",
    live.cardType || "",
    live.segment || "",
    item.isLive ? "live" : "not_live",
    item.referenceId || ""
  ].map(v => String(v).replace(/[|\r\n]/g, " ")).join("|");
}

// ----- Ana fonksiyon -----
async function main() {
  const inputPath = path.resolve(paymentApiRoot, argValue("--input", "datas/output.txt"));
  let liveOutputPath = path.resolve(paymentApiRoot, argValue("--output", "datas/live_report.txt"));
  const deadOutputPath = path.resolve(paymentApiRoot, "datas/dead_report.txt");
  const delayMs = Number(argValue("--delay-ms", "2000")) || 2000;
  const quiet = hasArg("--quiet");
  const shouldWrite = hasArg("--write");
  const skipDb = hasArg("--skip-db");
  const includeHeader = !hasArg("--no-header");
  const batchId = `batch-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  if (inputPath === liveOutputPath && !hasArg("--allow-overwrite")) {
    liveOutputPath = path.join(path.dirname(liveOutputPath), `live_${path.basename(liveOutputPath)}`);
    if (!quiet) console.log(`[output] live rapor yolu değiştirildi: ${liveOutputPath}`);
  }

  const text = await fs.readFile(inputPath, "utf8");
  const rows = text.split(/\r?\n/).map(parseLine).filter(Boolean);
  const valid = rows.filter(r => r.valid);
  const invalid = rows.filter(r => !r.valid);
  const active = valid.filter(r => !isExpired(r.expiry));
  const expired = valid.filter(r => isExpired(r.expiry));

  if (!quiet) console.log(`[başlangıç] toplam=${rows.length}, aktif=${active.length}, süresi dolmuş=${expired.length}, geçersiz=${invalid.length}`);

  const liveCards = [];       // isLive=true
  const deadCards = [];       // isLive=false (aktif kartlardan)

  for (let i = 0; i < active.length; i++) {
    const card = active[i];
    if (i > 0 && delayMs > 0) {
      if (!quiet) console.log(`[delay] ${delayMs}ms bekleniyor... (${i+1}/${active.length})`);
      await sleep(delayMs);
    }

    let result;
    try {
      if (!quiet) console.log(`[live-check] ${i+1}/${active.length} PAN=${card.maskedPan}`);
      result = await callLiveChecker(card);
    } catch (err) {
      if (!quiet) console.log(`[live-check] HATA: ${err.message}`);
      result = { isLive: false, referenceId: null, countryName: null, countryCode: null, cardType: null, segment: null, binTitle: null, message: err.message };
    }

    card.isLive = result.isLive;
    card.referenceId = result.referenceId;
    card.liveData = {
      countryName: result.countryName,
      countryCode: result.countryCode,
      cardType: result.cardType,
      segment: result.segment,
      binTitle: result.binTitle
    };

    if (result.isLive) {
      if (!quiet) console.log(`[live-check] CANLI -> ${card.maskedPan} (${result.binTitle || "?"})`);
      liveCards.push(card);
    } else {
      if (!quiet) console.log(`[live-check] KAPALI -> ${card.maskedPan}`);
      deadCards.push(card);
    }
  }

  // Tüm çıktı öğeleri (canlı, kapalı, süresi dolmuş, geçersiz) -> live raporuna yazılır
  const allOutput = [...liveCards, ...deadCards, ...expired, ...invalid];

  const liveReportLines = [];
  if (includeHeader) liveReportLines.push(reportHeaders.join("|"));
  for (const item of allOutput) {
    liveReportLines.push(formatReportLine(item));
  }

  // Dead raporu sadece kapalı kartlar (deadCards)
  const deadReportLines = [];
  if (includeHeader) deadReportLines.push(reportHeaders.join("|"));
  for (const item of deadCards) {
    deadReportLines.push(formatReportLine(item));
  }

  if (shouldWrite) {
    // Live raporu yaz
    const liveBackup = `${liveOutputPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await fs.copyFile(inputPath, liveBackup);
    await fs.writeFile(liveOutputPath, liveReportLines.join("\n") + "\n", "utf8");
    console.log(`[dosya] live raporu güncellendi: ${liveOutputPath}`);
    console.log(`[yedek] ${liveBackup}`);

    // Dead raporu yaz (üzerine yaz, yedek gerekmez)
    await fs.writeFile(deadOutputPath, deadReportLines.join("\n") + "\n", "utf8");
    console.log(`[dosya] dead raporu oluşturuldu: ${deadOutputPath}`);
  } else {
    console.log(liveReportLines.join("\n"));
    console.log("\n[kuru çalıştırma] --write ekleyerek dosyaları oluşturun.");
  }

  let dbWritten = 0;
  if (shouldWrite && !skipDb && liveCards.length > 0) {
    dbWritten = await writeCheckedCards(liveCards, batchId);
    console.log(`[DB] ${dbWritten} canlı kart CheckedCards'e yazıldı.`);
  }

  console.log(JSON.stringify({
    batchId,
    total: rows.length,
    live: liveCards.length,
    dead: deadCards.length,
    expired: expired.length,
    invalid: invalid.length,
    delayMs,
    wrote: shouldWrite,
    dbUpserted: dbWritten
  }, null, 2));
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
