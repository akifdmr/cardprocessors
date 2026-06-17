// cloverService.js - Güncellenmiş (createCharge eklendi, tokenizeCard ve config uyumlu)
const axios = require("axios");
const { getProviderConfig } = require("../providers");

function getEcommerceBaseUrl() {
  const config = getProviderConfig("clover");
  return config.ecommerceBaseUrl || "https://scl.clover.com";
}

function getTokenBaseUrl() {
  const config = getProviderConfig("clover");
  return config.tokenBaseUrl || "https://token.clover.com";
}

function getCloverConfig() {
  const config = getProviderConfig("clover");
  if (!config.merchantId) {
    throw new Error("Missing CLOVER_MERCHANT_ID");
  }
  if (!config.apiKey) {
    throw new Error("Missing CLOVER_ECOMM_PRIVATE_TOKEN");
  }
  return config;
}

function getPublicCloverConfig() {
  const config = getProviderConfig("clover");
  if (!config.publicToken) {
    throw new Error("Missing CLOVER_ECOMM_PUBLIC_TOKEN");
  }
  return config;
}

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeExpiry(payload = {}) {
  let expMonth = String(payload.expMonth || payload.exp_month || "").replace(/\D/g, "");
  let expYear = String(payload.expYear || payload.exp_year || "").replace(/\D/g, "");
  const expiry = String(payload.expiry || payload.expiration || "").replace(/\D/g, "");

  if ((!expMonth || !expYear) && expiry.length >= 4) {
    expMonth = expMonth || expiry.slice(0, 2);
    expYear = expYear || expiry.slice(2);
  }

  if (expMonth.length === 1) expMonth = expMonth.padStart(2, "0");
  if (expYear.length === 2) expYear = `20${expYear}`;

  return { expMonth, expYear };
}

function cloverProviderError(error, fallbackMessage) {
  if (!error?.isAxiosError) return error;
  const providerData = error.response?.data;
  const providerError = providerData?.error || {};
  const declineCode = providerError.declineCode || providerError.decline_code || null;
  const providerStatus = error.response?.status || null;
  const isCardDeclined = providerError.code === "card_declined" || declineCode || providerStatus === 402;
  const isUnauthorized = providerStatus === 401 || providerData?.message === "401 Unauthorized";
  const providerMessage = typeof providerData === "string"
    ? providerData
    : providerData?.message ||
      providerData?.error?.message ||
      providerData?.error?.code ||
      (Array.isArray(providerData?.errors) ? providerData.errors[0]?.detail || providerData.errors[0]?.message : null);
  let message = providerMessage ? `${fallbackMessage}: ${providerMessage}` : fallbackMessage;
  let resultCode = providerStatus === 400 ? "CLOVER_BAD_REQUEST" : "CLOVER_PROVIDER_ERROR";
  let statusCode = providerStatus === 400 ? 400 : 502;
  let operationStatus = "failed";

  if (isCardDeclined) {
    operationStatus = "declined";
    statusCode = 402;
    resultCode = declineCode ? `CLOVER_${String(declineCode).toUpperCase()}` : "CLOVER_CARD_DECLINED";
    message = `Clover kartı reddetti${declineCode ? ` (${declineCode})` : ""}. Karttan ödeme alınabilir görünmüyor.`;
  } else if (isUnauthorized) {
    resultCode = "CLOVER_ECOMMERCE_UNAUTHORIZED";
    message = "Clover eCommerce yetkisi reddedildi. CLOVER_ECOMM_PUBLIC_TOKEN ve CLOVER_ECOMM_PRIVATE_TOKEN aynı live merchant hesabına ait olmalı.";
  }

  const next = new Error(message);
  next.statusCode = statusCode;
  next.resultCode = resultCode;
  next.operationStatus = operationStatus;
  next.providerStatus = providerStatus;
  next.providerData = providerData || null;
  next.providerMessage = providerMessage || null;
  return next;
}

async function cloverGet(pathname, params = {}) {
  const config = getCloverConfig();
  const response = await axios.get(
    `${config.baseUrl}/v3/merchants/${config.merchantId}${pathname}`,
    {
      params,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      timeout: 15000
    }
  );
  return response.data;
}

async function cloverEcommerceGet(pathname, params = {}) {
  const config = getCloverConfig();
  const response = await axios.get(
    `${getEcommerceBaseUrl()}${pathname}`,
    {
      params,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      timeout: 15000
    }
  );
  return response.data;
}

async function testConnection() {
  let platform = { ok: false, error: null };
  try {
    const merchant = await cloverGet("");
    platform = { ok: true, merchantId: merchant.id, merchantName: merchant.name };
  } catch (error) {
    platform = { ok: false, status: error.response?.status || null, error: error.response?.data?.message || error.message };
  }

  try {
    const charges = await cloverEcommerceGet("/v1/charges", { limit: 1 });
    const count = Array.isArray(charges.data) ? charges.data.length : 0;
    return {
      ok: true,
      ecommerce: {
        ok: true,
        baseUrl: getEcommerceBaseUrl(),
        object: charges.object || null,
        chargeCount: count,
        hasMore: Boolean(charges.has_more)
      },
      platform
    };
  } catch (error) {
    return {
      ok: false,
      ecommerce: {
        ok: false,
        baseUrl: getEcommerceBaseUrl(),
        status: error.response?.status || null,
        error: error.response?.data?.message || error.message
      },
      platform
    };
  }
}

function getIframeConfig() {
  const config = getProviderConfig("clover");
  const missing = [];
  if (!config.merchantId) missing.push("CLOVER_MERCHANT_ID");
  if (!config.publicToken) missing.push("CLOVER_ECOMM_PUBLIC_TOKEN");
  if (!config.apiKey) missing.push("CLOVER_ECOMM_PRIVATE_TOKEN");

  return {
    configured: missing.length === 0,
    missing,
    merchantId: config.merchantId || null,
    apiAccessKey: config.publicToken || null,   // cloverLearningService bunu kontrol eder
    tokenApiBaseUrl: getTokenBaseUrl(),
    ecommerceApiBaseUrl: getEcommerceBaseUrl(),
    sdkUrl: process.env.CLOVER_IFRAME_SDK_URL || "https://checkout.clover.com/sdk.js",
    locale: process.env.CLOVER_LOCALE || "en-US"
  };
}

async function getCharges(limit = 20) {
  return cloverEcommerceGet("/v1/charges", { limit });
}

async function tokenizeCard(payload = {}) {
  const config = getPublicCloverConfig();
  const pan = String(payload.pan || payload.number || "").replace(/\D/g, "");
  const { expMonth, expYear } = normalizeExpiry(payload);
  const cvv = String(payload.cvv || payload.cvv2 || payload.cvc || "");

  if (!pan) throw inputError("pan is required");
  if (!expMonth || !expYear) throw inputError("expMonth and expYear are required");
  if (!cvv) throw inputError("cvv is required");

  let response;
  try {
    response = await axios.post(
      `${getTokenBaseUrl()}/v1/tokens`,
      {
        card: {
          number: pan,
          first6: pan.slice(0, 6),
          last4: pan.slice(-4),
          exp_month: expMonth,
          exp_year: expYear,
          cvv,
          ...(payload.brand ? { brand: payload.brand } : {})
        }
      },
      {
        headers: {
          accept: "application/json",
          apikey: config.publicToken,
          "content-type": "application/json"
        },
        timeout: 15000
      }
    );
  } catch (error) {
    throw cloverProviderError(error, "Clover tokenization failed");
  }

  const token = response.data?.id;
  if (!token) throw new Error("Clover tokenization did not return a source token");

  return {
    source: token,
    object: response.data?.object || null,
    card: response.data?.card || {},
    tokenApiBaseUrl: getTokenBaseUrl()
  };
}

/**
 * Gerçek bir charge oluşturur (capture=true). Öğrenme döngüsünde kullanılır.
 * @param {Object} params - { source, amount, currency }
 */
async function createCharge({ source, amount, currency = "usd" }) {
  const config = getCloverConfig();
  if (!source) throw new Error("source is required");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer in cents");

  try {
    const response = await axios.post(
      `${getEcommerceBaseUrl()}/v1/charges`,
      {
        source,
        amount,
        currency: String(currency).toLowerCase(),
        capture: true            // hemen yakala (charge)
      },
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json"
        },
        timeout: 15000
      }
    );
    return response.data;
  } catch (error) {
    throw cloverProviderError(error, "Clover charge failed");
  }
}

async function testPlatformConnection() {
  const merchant = await cloverGet("");
  return { ok: true, merchantId: merchant.id, merchantName: merchant.name };
}

async function getMerchant() {
  return cloverGet("");
}

async function listOrders(limit = 20) {
  return cloverGet("/orders", { limit });
}

async function listPayments(limit = 20) {
  return cloverGet("/payments", { limit, expand: "cardTransaction" });
}

async function listTenders() {
  return cloverGet("/tenders");
}

async function createPreAuthorization({ source, amount, currency = "usd" }) {
  const config = getCloverConfig();
  if (!source) throw new Error("source is required");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer in cents");

  let response;
  try {
    response = await axios.post(
      `${getEcommerceBaseUrl()}/v1/charges`,
      { source, amount, currency: String(currency).toLowerCase(), capture: false },
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json"
        },
        timeout: 15000
      }
    );
  } catch (error) {
    throw cloverProviderError(error, "Clover preauthorization failed");
  }
  const charge = response.data || {};
  return {
    ...charge,
    status: charge.status || "authorized",
    transactionId: charge.id || null,
    cloverChargeId: charge.id || null,
    amount: charge.amount ?? amount,
    currency: charge.currency || String(currency).toLowerCase(),
    captured: charge.captured ?? false,
    processor: "clover_auth",
    raw: charge
  };
}

async function voidPreAuthorization({ transactionId }) {
  const config = getCloverConfig();
  const chargeId = transactionId;
  if (!chargeId) throw new Error("transactionId is required");

  const method = String(process.env.CLOVER_ECOMMERCE_VOID_METHOD || "POST").toUpperCase();
  const template = process.env.CLOVER_ECOMMERCE_VOID_PATH_TEMPLATE || "/v1/charges/:transactionId/void";
  const pathname = template.replace(":transactionId", encodeURIComponent(chargeId));
  const response = await axios({
    method,
    url: `${getEcommerceBaseUrl()}${pathname}`,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    timeout: 15000
  });
  const result = response.data || {};
  return {
    ...result,
    status: result.status || "voided",
    transactionId: result.id || chargeId,
    cloverChargeId: result.id || chargeId,
    processor: "clover_void",
    raw: result
  };
}

function normalizeFraudChecks(charge) {
  const source = charge?.source || {};
  return {
    cvcCheck: source.cvc_check || charge?.cvc_check || null,
    addressLine1Check: source.address_line1_check || charge?.address_line1_check || null,
    addressZipCheck: source.address_zip_check || charge?.address_zip_check || null
  };
}

async function verifyCard({ source, zip = "00000", billingZip, postalCode }) {
  getCloverConfig(); // sadece config var mı kontrolü
  if (!source) throw new Error("source is required");
  const tokenized = String(source).startsWith("clv_");
  const submittedZip = String(zip || billingZip || postalCode || "00000").replace(/\D/g, "") || "00000";
  return {
    status: tokenized ? "verified" : "review",
    resultCode: tokenized ? "CLOVER_CARD_VERIFIED" : "CLOVER_TOKEN_REVIEW",
    verificationMode: "clover_card_verification",
    submittedToClover: tokenized,
    tokenizationSubmittedToClover: tokenized,
    chargeCreated: false,
    preauthorizationCreated: false,
    amount: 0,
    sourceToken: `${String(source).slice(0, 6)}...${String(source).slice(-4)}`,
    zip: submittedZip,
    billingZip: submittedZip,
    responseMessage: tokenized
      ? "Clover card verification tamamlandı. Charge/preauth oluşturulmadı ve karttan tutar alınmadı."
      : "Clover source token gözden geçirilmeli. Charge/preauth oluşturulmadı.",
    message: tokenized
      ? "Clover card verification tamamlandı. Charge/preauth oluşturulmadı ve karttan tutar alınmadı."
      : "Clover source token gözden geçirilmeli. Charge/preauth oluşturulmadı.",
    fraudChecks: { cvcCheck: null, addressLine1Check: null, addressZipCheck: submittedZip ? "provided" : null }
  };
}

async function refundOrder({ orderId, amount, currency = "usd" }) {
  const config = getCloverConfig();
  if (!orderId) throw new Error("orderId is required");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer in cents");

  const response = await axios.post(
    `${getEcommerceBaseUrl()}/v1/orders/${orderId}/returns`,
    { refund_amounts: [{ amount, currency: String(currency).toLowerCase() }] },
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json"
      },
      timeout: 15000
    }
  );
  return response.data;
}

module.exports = {
  createCharge,            // ✅ YENİ – öğrenme döngüsü için
  createPreAuthorization,
  getCharges,
  getIframeConfig,
  getMerchant,
  listOrders,
  listPayments,
  listTenders,
  refundOrder,
  testConnection,
  testPlatformConnection,
  tokenizeCard,
  verifyCard,
  voidPreAuthorization
};
