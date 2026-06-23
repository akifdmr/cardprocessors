const axios = require("axios");
const env = require("../config/env");

const config = env.providers.jokerChecker;

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeBin(value) {
  const bin = String(value || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(bin)) {
    throw inputError("Joker Checker yalnızca 6 haneli BIN/IIN kabul eder");
  }
  return bin;
}

function normalizeItem(item = {}, requestedBin) {
  const bin = normalizeBin(item.bin || requestedBin);
  const brand = item.brand || null;
  const type = item.type || null;
  const level = item.level || null;
  const bank = item.bank || null;
  const countryCode = item.country || null;
  const countryName = item.country_name || null;

  return {
    status: "passed",
    resultCode: "JOKER_BIN_LOOKUP_OK",
    bin,
    source: "joker_checker",
    sourceLabel: "Joker BIN Checker",
    confidence: bank || countryName ? "medium" : "low",
    dataQuality: bank || countryName ? "issuer_metadata" : "network_only",
    summary: {
      bin,
      scheme: brand,
      brand,
      type,
      level,
      issuer: bank,
      countryCode,
      country: countryName || countryCode,
      usefulLabel: [countryName || countryCode, bank, type, level, brand].filter(Boolean).join(" / ")
    },
    details: {
      "BIN/IIN": bin,
      "Card Scheme": brand,
      "Card Brand": brand,
      "Card Type": type,
      "Card Level": level,
      "Issuer Name / Bank": bank,
      "ISO Country Code A2": countryCode,
      "ISO Country Name": countryName
    }
  };
}

async function checkBins(values) {
  const cards = [...new Set((Array.isArray(values) ? values : [values]).map(normalizeBin))];
  if (!cards.length) throw inputError("En az bir BIN/IIN gerekli");
  if (cards.length > 100) throw inputError("Tek istekte en fazla 100 BIN/IIN sorgulanabilir");

  const response = await axios.post(`${config.baseUrl.replace(/\/+$/, "")}/bincheck`, cards, {
    timeout: config.timeoutMs,
    headers: { "Content-Type": "application/json" }
  });
  const upstreamResults = Array.isArray(response.data?.results) ? response.data.results : [];
  const byBin = new Map(upstreamResults.map((item) => [String(item?.bin || ""), item]));

  return {
    status: "passed",
    resultCode: "JOKER_BIN_LOOKUP_OK",
    total: cards.length,
    source: "joker_checker",
    sourceLabel: "Joker BIN Checker",
    results: cards.map((bin) => normalizeItem(byBin.get(bin) || { bin }, bin))
  };
}

async function checkBin(value) {
  const batch = await checkBins([value]);
  return batch.results[0];
}

async function testConnection() {
  const response = await axios.get(`${config.baseUrl.replace(/\/+$/, "")}/`, {
    timeout: config.timeoutMs
  });
  return {
    ok: response.status >= 200 && response.status < 300,
    configured: true,
    status: response.status >= 200 && response.status < 300 ? "healthy" : "unhealthy",
    responseMessage: response.data?.status || `HTTP ${response.status}`,
    baseUrl: config.baseUrl
  };
}

function getStatus() {
  return {
    configured: Boolean(config.baseUrl),
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    capabilities: ["bin_check"],
    disabledCapabilities: ["full_card_check", "live_check", "balance_check", "bulk_card_file"]
  };
}

module.exports = {
  checkBin,
  checkBins,
  getStatus,
  normalizeBin,
  testConnection
};
