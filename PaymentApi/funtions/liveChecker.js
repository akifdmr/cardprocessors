const DEFAULT_API_BASE_URL = "/api";
const DEFAULT_PROVIDER = "clover";
const DEFAULT_OPERATION = "verification";
const DEFAULT_DELAY_MS = 750;
const MAX_BATCH_SIZE = 10000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function maskPan(pan) {
  const normalized = normalizeDigits(pan);
  if (normalized.length < 10) return "****";
  return `${normalized.slice(0, 6)}******${normalized.slice(-4)}`;
}

function parseCardLine(line, index = 1, defaultZip = "00000") {
  const raw = String(line || "").trim();
  if (!raw) return null;

  const parts = raw.split("|").map((part) => part.trim());
  let [pan, expMonth, expYear, cvv2, billingZip] = parts;

  if (parts.length >= 3 && /[/-]/.test(parts[1])) {
    const expiry = parts[1].split(/[/-]/).map((part) => part.trim());
    pan = parts[0];
    expMonth = expiry[0];
    expYear = expiry[1];
    cvv2 = parts[2];
    billingZip = parts[3];
  }

  const normalizedPan = normalizeDigits(pan);
  const normalizedMonth = normalizeDigits(expMonth).padStart(2, "0");
  const normalizedYear = normalizeDigits(expYear);
  const normalizedCvv = normalizeDigits(cvv2);
  const normalizedZip = normalizeDigits(billingZip) || normalizeDigits(defaultZip) || "00000";

  if (!normalizedPan || !normalizedMonth || !normalizedYear || !normalizedCvv) {
    return {
      index,
      raw,
      error: "Format: pan|month|year|cvv|zip veya pan|month/year|cvv|zip"
    };
  }

  return {
    index,
    raw,
    pan: normalizedPan,
    expMonth: normalizedMonth,
    expYear: normalizedYear.length === 2 ? `20${normalizedYear}` : normalizedYear,
    cvv2: normalizedCvv,
    billingZip: normalizedZip,
    zip: normalizedZip,
    bin: normalizedPan.slice(0, 6),
    maskedPan: maskPan(normalizedPan)
  };
}

function isApproved(response = {}) {
  const text = [
    response.status,
    response.resultCode,
    response.responseMessage,
    response.result?.status,
    response.result?.resultCode,
    response.result?.responseMessage,
    response.binCheck?.isLive,
    response.checkedCard?.verifyStatus
  ].filter(Boolean).join(" ").toLowerCase();

  return response.isLive === true ||
    response.IsLive === true ||
    response.success === true ||
    response.ok === true ||
    text.includes("clover_card_verified") ||
    text.includes("verified") ||
    text.includes("approved") ||
    text.includes("authorized");
}

function compactResult(row, response = {}) {
  const bin = response.binCheck || {};
  const checkedCard = response.checkedCard || bin.checkedCard || null;
  const result = response.result || {};
  const status = isApproved(response) ? "LIVE" : "DECLINED";

  return {
    index: row.index,
    status,
    isLive: status === "LIVE",
    provider: response.provider || DEFAULT_PROVIDER,
    operation: response.operation || DEFAULT_OPERATION,
    maskedPan: row.maskedPan,
    resultCode: response.resultCode || result.resultCode || null,
    responseMessage: response.responseMessage || result.responseMessage || response.failureReason || null,
    referenceId: response.referenceId || response.providerReferenceId || result.transactionId || result.cloverChargeId || null,
    bin: checkedCard?.first6 || bin.bin || row.bin,
    country: checkedCard?.CountryCode || bin.summary?.countryCode || bin.details?.["ISO Country Code A2"] || null,
    cardType: checkedCard?.CardType || bin.summary?.type || bin.details?.["Card Type"] || null,
    cardLevel: checkedCard?.Segment || bin.summary?.level || bin.details?.["Card Level"] || null,
    bank: checkedCard?.Bank || checkedCard?.bank || bin.summary?.issuer || bin.details?.["Issuer Name / Bank"] || null,
    checkedCardId: checkedCard?.id || null,
    balance: checkedCard?.balanceAmount ?? checkedCard?.balance ?? 0
  };
}

async function callLiveChecker(card, options = {}) {
  const apiBaseUrl = String(options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const provider = options.provider || DEFAULT_PROVIDER;
  const operation = options.operation || DEFAULT_OPERATION;
  const response = await fetch(`${apiBaseUrl}/checkers/live-checker`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: JSON.stringify({
      ...card,
      provider,
      operation,
      compact: options.compact !== false
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.responseMessage || payload.error || `Live checker failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  return payload;
}

async function checkCard(cardLineOrPayload, options = {}) {
  const row = typeof cardLineOrPayload === "string"
    ? parseCardLine(cardLineOrPayload, options.index || 1, options.defaultZip)
    : { index: options.index || 1, ...cardLineOrPayload, maskedPan: cardLineOrPayload.maskedPan || maskPan(cardLineOrPayload.pan) };

  if (!row || row.error) {
    return {
      index: row?.index || options.index || 1,
      status: "ERROR",
      isLive: false,
      responseMessage: row?.error || "Empty card line"
    };
  }

  try {
    const response = await callLiveChecker(row, options);
    return compactResult(row, response);
  } catch (error) {
    return {
      index: row.index,
      status: "ERROR",
      isLive: false,
      maskedPan: row.maskedPan,
      responseMessage: error.message,
      raw: error.data || null
    };
  }
}

async function checkCards(cardLines, options = {}) {
  const lines = Array.isArray(cardLines)
    ? cardLines
    : String(cardLines || "").split(/\r?\n/);
  const cards = lines
    .slice(0, MAX_BATCH_SIZE)
    .map((line, index) => parseCardLine(line, index + 1, options.defaultZip))
    .filter(Boolean);
  const delayMs = Number.isFinite(Number(options.delayMs)) ? Math.max(Number(options.delayMs), 0) : DEFAULT_DELAY_MS;
  const results = [];

  for (const card of cards) {
    results.push(await checkCard(card, { ...options, index: card.index }));
    if (delayMs > 0 && results.length < cards.length) {
      await sleep(delayMs);
    }
  }

  return results;
}

if (typeof window !== "undefined") {
  window.liveChecker = {
    parseCardLine,
    checkCard,
    checkCards
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    parseCardLine,
    checkCard,
    checkCards,
    callLiveChecker,
    compactResult,
    isApproved,
    maskPan
  };
}
