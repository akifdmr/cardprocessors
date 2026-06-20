const crypto = require("crypto");
const cloverService = require("./cloverService");
const amazonPayService = require("./amazonPayService");
const paypalService = require("./paypalService");
const liveCheckerService = require("./liveCheckerService");
const { db } = require("../db");

const BIN_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

async function enrichBinWithPayPalVault(result, payload = {}) {
  if (
    String(payload.provider || "").toLowerCase() !== "paypal" ||
    !(payload.providerPaymentToken || payload.paymentTokenId || payload.vaultId)
  ) {
    return result;
  }

  let paypalVault;
  try {
    paypalVault = await paypalService.getVaultedPaymentMethodMetadata(payload);
  } catch (error) {
    const isLocalPlaceholder = error.code === "PAYPAL_VAULT_TOKEN_REQUIRED";
    return {
      ...result,
      paypalVault: {
        status: isLocalPlaceholder ? "not_vaulted" : "unavailable",
        source: "paypal_vault",
        sourceLabel: "PayPal Vault",
        resultCode: error.code || "PAYPAL_VAULT_LOOKUP_FAILED",
        error: error.message
      }
    };
  }

  return {
    ...result,
    sourceLabel: `${result.sourceLabel || result.source} + PayPal Vault`,
    verificationSources: [
      {
        source: result.source,
        label: result.sourceLabel || result.source,
        role: "issuer_bin_metadata"
      },
      {
        source: "paypal_vault",
        label: "PayPal Vault",
        role: "stored_card_metadata"
      }
    ],
    paypalVault,
    summary: {
      ...result.summary,
      brand: paypalVault.card?.brand || result.summary?.brand || null,
      countryCode: paypalVault.card?.countryCode || result.summary?.countryCode || null,
      paypalCardholder: paypalVault.card?.name || null,
      paypalLast4: paypalVault.card?.last4 || null,
      paypalExpiry: paypalVault.card?.expiry || null
    }
  };
}

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
  const fieldAfterCvv = (index) => {
    const value = String(parts[index] || "").trim();
    const isZip = /^\d{5}$/.test(value);
    return {
      zip: isZip ? value : "00000",
      holderName: isZip ? parts[index + 1] : value,
      address: parts.slice(isZip ? index + 2 : index + 1).join("|")
    };
  };
  const month = digitsOnly(parts[1]);
  const year = digitsOnly(parts[2]);
  const cvvAfterYear = String(parts[3] || "").trim();
  if (parts.length >= 4 && /^(0?[1-9]|1[0-2])$/.test(month) && /^(\d{2}|\d{4})$/.test(year) && cvvAfterYear) {
    const afterCvv = fieldAfterCvv(4);
    return normalizeCardInput({
      cardNumber: parts[0],
      exp: `${month}/${year}`,
      cvv: parts[3],
      zip: afterCvv.zip,
      holderName: afterCvv.holderName,
      address: afterCvv.address
    });
  }
  const afterCvv = fieldAfterCvv(3);
  return normalizeCardInput({
    cardNumber: parts[0],
    exp: parts[1],
    cvv: parts[2],
    zip: afterCvv.zip,
    holderName: afterCvv.holderName,
    address: afterCvv.address
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
  const normalizedBin = digitsOnly(payload.bin || card.pan || payload.pan).slice(0, 6);
  const hasIpLookup = Boolean(String(payload.ip || "").trim());
  let database = null;
  try {
    database = await db.getDb();
    const cached = hasIpLookup
      ? null
      : await database.collection("binLookupCache").findOne({ bin: normalizedBin }, { projection: { _id: 0 } });
    if (cached?.result && Date.now() - new Date(cached.updatedAt).getTime() <= BIN_CACHE_MAX_AGE_MS) {
      return enrichBinWithPayPalVault({
        ...cached.result,
        cached: true,
        cacheSource: "mongodb"
      }, payload);
    }
  } catch {
    database = null;
  }

  const result = await paypalService.binCheckCard({
    pan: card.pan || payload.pan,
    bin: normalizedBin,
    ip: payload.ip
  });

  if (["limited", "failed"].includes(String(result.status || "").toLowerCase()) && database) {
    const historical = await database.collection("uncheckedCards").findOne(
      {
        bin: normalizedBin,
        $or: [
          { bank: { $exists: true, $nin: [null, ""] } },
          { countryCode: { $exists: true, $nin: [null, ""] } },
          { cardType: { $exists: true, $nin: [null, ""] } }
        ]
      },
      {
        projection: {
          _id: 0,
          bank: 1,
          countryCode: 1,
          cardType: 1,
          cardLevel: 1
        }
      }
    );
    if (historical) {
      const network = result.summary?.brand || result.summary?.scheme || null;
      const recovered = {
        ...result,
        status: "fallback",
        resultCode: "LOCAL_BIN_HISTORY_FALLBACK",
        source: "local_bin_history",
        sourceLabel: "Local verified BIN history",
        confidence: "medium",
        dataQuality: "partial",
        summary: {
          ...result.summary,
          bin: normalizedBin,
          countryCode: historical.countryCode || null,
          country: historical.countryCode || null,
          issuer: historical.bank || null,
          type: historical.cardType || null,
          level: historical.cardLevel || null,
          scheme: result.summary?.scheme || network,
          brand: result.summary?.brand || network,
          usefulLabel: [
            historical.countryCode,
            historical.bank,
            historical.cardType,
            historical.cardLevel,
            network
          ].filter(Boolean).join(" / ")
        }
      };
      if (!hasIpLookup) {
        await database.collection("binLookupCache").updateOne(
          { bin: normalizedBin },
          { $set: { bin: normalizedBin, result: recovered, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
      }
      return enrichBinWithPayPalVault(recovered, payload);
    }
  }

  if (!hasIpLookup && database && ["passed", "fallback"].includes(String(result.status || "").toLowerCase())) {
    const cacheResult = { ...result };
    delete cacheResult.raw;
    await database.collection("binLookupCache").updateOne(
      { bin: normalizedBin },
      { $set: { bin: normalizedBin, result: cacheResult, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  }

  return enrichBinWithPayPalVault(result, payload);
}

async function liveCheckCard(payload = {}) {
  const provider = String(payload.provider || "clover").toLowerCase();
  const amount = Number(payload.amount || 0.1);
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
  let live;
  try {
    live = await liveCheckCard(payload);
  } catch (error) {
    live = {
      status: "failed",
      resultCode: error.resultCode || error.code || "LIVE_CHECK_FAILED",
      responseMessage: error.message,
      error: error.message,
      provider: String(payload.provider || "clover").toLowerCase(),
      operation: "live",
      isLive: false
    };
  }
  let binCheck;
  try {
    binCheck = await binCheckCard(payload);
  } catch (error) {
    binCheck = {
      status: "review",
      error: error.message,
      fallbackError: error.message,
      source: "unavailable",
      bin: digitsOnly(payload.pan || payload.cardNumber || payload.bin).slice(0, 6)
    };
  }
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
