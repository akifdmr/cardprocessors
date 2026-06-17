const crypto = require("crypto");
const cloverService = require("./cloverService");
const amazonPayService = require("./amazonPayService");
const paypalService = require("./paypalService");
const liveCheckerService = require("./liveCheckerService");

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeExpiry(value) {
  const text = String(value || "").trim();
  const compact = digitsOnly(text);
  let month = "";
  let year = "";
  if (text.includes("/") || text.includes("-")) {
    const parts = text.split(/[/-]/).map((part) => digitsOnly(part));
    month = parts[0] || "";
    year = parts[1] || "";
  } else if (compact.length === 4) {
    month = compact.slice(0, 2);
    year = compact.slice(2);
  } else if (compact.length === 6) {
    month = compact.slice(0, 2);
    year = compact.slice(2);
  }
  month = month.padStart(2, "0");
  if (year.length === 2) year = `20${year}`;
  if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^\d{4}$/.test(year)) {
    return null;
  }
  return { month, year, label: `${month}/${year.slice(-2)}` };
}

function normalizeCardInput(payload = {}) {
  const pan = digitsOnly(payload.pan || payload.cardNumber || payload.cardnumber || payload.number);
  const expiry = normalizeExpiry(payload.exp || payload.expiry || `${payload.expMonth || ""}/${payload.expYear || ""}`);
  if (pan.length < 12 || pan.length > 19) {
    throw inputError("cardnumber must be 12-19 digits");
  }
  if (!expiry) {
    throw inputError("exp must be MM/YY or MM/YYYY");
  }
  return {
    pan,
    expMonth: expiry.month,
    expYear: expiry.year,
    exp: expiry.label,
    cvv: String(payload.cvv || payload.cvv2 || payload.cvc || "").trim(),
    zip: String(payload.zip || payload.billingZip || payload.postalCode || "00000").trim() || "00000",
    holderName: String(payload.holderName || payload.cardholderName || payload.name || "").trim(),
    address: String(payload.address || payload.billingAddress || "").trim(),
    phone: String(payload.phone || "").trim()
  };
}

function parseCardLine(line) {
  const parts = String(line || "").trim().split("|");
  return normalizeCardInput({
    cardNumber: parts[0],
    exp: parts[1],
    cvv: parts[2],
    zip: parts[3],
    holderName: parts[4],
    address: parts.slice(5).join("|")
  });
}

function maskPan(pan) {
  const digits = digitsOnly(pan);
  if (digits.length < 10) return null;
  return `${digits.slice(0, 6)}******${digits.slice(-4)}`;
}

function recordHash(card) {
  return crypto
    .createHash("sha256")
    .update(`${digitsOnly(card.pan)}|${card.expMonth}|${card.expYear}`)
    .digest("hex")
    .slice(0, 24);
}

async function binCheckCard(payload = {}) {
  const card = payload.pan || payload.cardNumber ? normalizeCardInput(payload) : payload;
  return paypalService.binCheckCard({
    pan: card.pan || payload.pan,
    bin: payload.bin || digitsOnly(card.pan || payload.pan).slice(0, 6),
    ip: payload.ip
  });
}

async function liveCheckCard(payload = {}) {
  const provider = String(payload.provider || "clover").toLowerCase();
  const amount = Number(payload.amount || 1);
  const currency = payload.currency || "usd";

  if (provider === "amazonpay") {
    const chargePermissionId = payload.chargePermissionId ||
      payload.providerPaymentToken ||
      payload.source ||
      payload.token;
    if (!chargePermissionId) {
      throw inputError("Amazon Pay liveCheck requires chargePermissionId/providerPaymentToken");
    }
    const result = await amazonPayService.verifyCard({
      ...payload,
      chargePermissionId,
      providerPaymentToken: chargePermissionId,
      source: chargePermissionId,
      token: chargePermissionId,
      amount,
      currency
    });
    return {
      ...result,
      provider: "amazonpay",
      operation: "live",
      isLive: liveCheckerService.isLiveResponse(result)
    };
  }

  if (provider !== "clover") {
    throw inputError("liveCheck service supports clover or amazonpay");
  }

  const source = payload.source || payload.providerPaymentToken || payload.token;
  let tokenization = null;
  let cloverSource = source;
  let normalizedCard = null;
  if (!cloverSource) {
    normalizedCard = normalizeCardInput(payload);
    tokenization = await cloverService.tokenizeCard({
      pan: normalizedCard.pan,
      expMonth: normalizedCard.expMonth,
      expYear: normalizedCard.expYear,
      cvv2: normalizedCard.cvv,
      zip: normalizedCard.zip
    });
    cloverSource = tokenization.source;
  }

  const result = payload.liveMode === "preauth"
    ? await cloverService.createPreAuthorization({ source: cloverSource, amount, currency })
    : await cloverService.verifyCard({
        source: cloverSource,
        zip: payload.zip || normalizedCard?.zip,
        billingZip: payload.billingZip || normalizedCard?.zip,
        postalCode: payload.postalCode || normalizedCard?.zip
      });

  return {
    ...result,
    provider: "clover",
    operation: "live",
    providerReferenceId: result.transactionId || result.cloverChargeId || null,
    tokenization,
    isLive: liveCheckerService.isLiveResponse(result)
  };
}

async function checkCard(payload = {}) {
  const live = await liveCheckCard(payload);
  const binCheck = await binCheckCard(payload);
  return {
    status: liveCheckerService.isLiveResponse(live) ? "passed" : "review",
    live,
    binCheck,
    compact: liveCheckerService.toCompactLiveCheckerResponse({
      ...live,
      binCheck
    })
  };
}

module.exports = {
  binCheckCard,
  checkCard,
  liveCheckCard,
  maskPan,
  normalizeCardInput,
  parseCardLine,
  recordHash
};
