const axios = require("axios");
const crypto = require("crypto");
const { getProviderConfig } = require("../providers");
const { validateCardInput } = require("./cardValidationService");

const DEFAULT_PATHS = {
  processPayment: "/api/v2/process-payment",
  status: "/actuator/health",
  transaction: "/api/v1/transaction-status/:transactionId",
  verifyOtp: "/api/v1/verify-otp"
};

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function removeEmptyFields(payload) {
  if (Array.isArray(payload)) {
    return payload.map(removeEmptyFields).filter((value) => value !== undefined && value !== null && value !== "");
  }
  if (payload && typeof payload === "object") {
    return Object.fromEntries(
      Object.entries(payload)
        .map(([key, value]) => [key, removeEmptyFields(value)])
        .filter(([, value]) => {
          if (value === undefined || value === null || value === "") return false;
          if (Array.isArray(value)) return value.length > 0;
          if (value && typeof value === "object") return Object.keys(value).length > 0;
          return true;
        })
    );
  }
  return payload;
}

function normalizePath(value) {
  const path = String(value || "").trim();
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeAmount(value, fieldName = "amount") {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw inputError(`${fieldName} must be a positive decimal amount`);
  }
  return Number(amount.toFixed(2));
}

function splitName(value) {
  const clean = String(value || "").trim();
  if (!clean) return { firstName: "Card", lastName: "Holder", fullName: "CARD HOLDER" };
  const parts = clean.split(/\s+/);
  const firstName = parts.shift() || clean;
  const lastName = parts.join(" ") || firstName;
  return { firstName, lastName, fullName: clean.toUpperCase() };
}

function buildReference(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function getStatus() {
  const config = getProviderConfig("quiklie");
  const missing = [];
  if (!config.baseUrl) missing.push("QUIKLIE_PAYMENT_API_BASE_URL");
  if (!config.apiKey) missing.push("QUIKLIE_PAYMENT_API_KEY");
  if (!config.merchantId) missing.push("QUIKLIE_PAYMENT_MERCHANT_ID");
  const paths = {
    ...DEFAULT_PATHS,
    ...(config.paths || {}),
    processPayment: config.paths?.processPayment || config.paths?.sale || config.paths?.authorize || config.paths?.verification || DEFAULT_PATHS.processPayment,
    transaction: config.paths?.transaction || DEFAULT_PATHS.transaction,
    verifyOtp: config.paths?.verifyOtp || DEFAULT_PATHS.verifyOtp,
    status: config.paths?.status || DEFAULT_PATHS.status
  };
  return {
    configured: missing.length === 0,
    baseUrl: config.baseUrl || null,
    authHeader: "x-api-key",
    sourceHeader: "x-source",
    source: "api",
    merchantIdConfigured: Boolean(config.merchantId),
    midType: "TWO_D",
    timeoutMs: config.timeoutMs,
    missing,
    paths,
    pathStatus: Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, Boolean(value)]))
  };
}

function getConfig() {
  const config = getProviderConfig("quiklie");
  const status = getStatus();
  if (!status.configured) {
    throw inputError(`Missing ${status.missing.join(", ")}`);
  }
  return {
    baseUrl: String(config.baseUrl || "").replace(/\/+$/, ""),
    apiKey: String(config.apiKey || "").trim(),
    merchantId: String(config.merchantId || "").trim(),
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 180000,
    paths: status.paths
  };
}

function authHeaders(config) {
  return {
    "x-api-key": config.apiKey,
    "x-source": "api"
  };
}

function buildPaymentPayload(payload = {}) {
  const config = getConfig();
  const validation = validateCardInput({
    pan: payload.pan || payload.cardNumber,
    expMonth: payload.expMonth,
    expYear: payload.expYear,
    cardholderName: payload.cardholderName || payload.name,
    billingZip: payload.billingZip || payload.zip || payload.postalCode || "00000"
  });
  if (!validation.isValid) {
    throw inputError(`Invalid card input: ${validation.issues.join(", ")}`);
  }

  const names = splitName(payload.cardholderName || payload.name);
  const transactionReferenceId = String(
    payload.transactionReferenceId ||
    payload.reference ||
    payload.orderId ||
    buildReference("QKTX")
  );
  if (transactionReferenceId.length < 10) {
    throw inputError("transactionReferenceId must be at least 10 characters");
  }

  const customerReferenceId = String(
    payload.customerReferenceId ||
    payload.customerId ||
    buildReference("CUST")
  );
  const zipCode = payload.billingZip || payload.zip || payload.postalCode || "00000";

  return {
    request: removeEmptyFields({
      merchantId: payload.merchantId || payload.merchid || config.merchantId,
      firstName: payload.firstName || names.firstName,
      lastName: payload.lastName || names.lastName,
      email: payload.email || "customer@example.com",
      phone: payload.phone || payload.billingPhone || "0000000000",
      amount: normalizeAmount(payload.amount ?? 1, "amount"),
      currencyCode: String(payload.currencyCode || payload.currency || "USD").toUpperCase(),
      address: payload.address || payload.billingAddressLine1 || payload.street || "N/A",
      zipCode,
      midType: "TWO_D",
      city: payload.city || payload.billingCity || "N/A",
      state: payload.state || payload.billingState || "N/A",
      country: String(payload.country || payload.billingCountry || "US").toUpperCase(),
      ipAddress: payload.ipAddress || payload.ip || "127.0.0.1",
      callbackUrl: payload.callbackUrl,
      redirectUrl: payload.redirectUrl,
      customerReferenceId,
      transactionReferenceId,
      cardNumber: validation.normalizedPan,
      cardHolderName: names.fullName,
      cardExpiryMonth: String(payload.expMonth).padStart(2, "0"),
      cardExpiryYear: String(payload.expYear),
      cardCvv: payload.cvv || payload.cvv2 || payload.cvc
    }),
    card: {
      first6: validation.first6,
      last4: validation.last4,
      brand: validation.brand,
      maskedPan: validation.maskedPan
    }
  };
}

function normalizeStatusCode(value) {
  const code = String(value || "").trim();
  const statusMap = {
    "1": "approved",
    "2": "authentication_required",
    "3": "otp_required",
    "4": "pending",
    "5": "declined",
    "6": "refunded",
    "7": "refund_failed",
    "8": "chargeback"
  };
  return statusMap[code] || null;
}

function normalizeResponse(data, operation, request = {}, card = null) {
  const body = data && typeof data === "object" ? data : { raw: data };
  const rawStatus = String(body.status || body.quikleeStatus || "").trim();
  const statusFromCode = normalizeStatusCode(body.statusCode);
  const statusText = rawStatus.toLowerCase();
  const status = statusFromCode ||
    (["success", "approved"].includes(statusText) ? "approved" :
      statusText.includes("3ds") ? "authentication_required" :
        statusText.includes("otp") ? "otp_required" :
          statusText.includes("pending") ? "pending" :
            statusText.includes("declined") || statusText.includes("failed") ? "declined" :
              statusText || "unknown");

  return {
    status,
    resultCode: body.statusCode || body.status || null,
    responseMessage: body.message || body.quikleeMessage || body.status || null,
    transactionId: body.qkpaymentId || body.quickleePaymentId || body.transactionId || body.paymentId || request.transactionReferenceId || null,
    paymentId: body.qkpaymentId || body.quickleePaymentId || body.transactionId || null,
    customerReferenceId: body.customerReferenceId || request.customerReferenceId || null,
    transactionReferenceId: body.transactionReferenceId || request.transactionReferenceId || null,
    redirectUrl: body.quikleeRedirectUrl || body.redirectUrl || null,
    amount: body.amount ?? request.amount ?? null,
    currency: body.currency || body.currencyCode || request.currencyCode || "USD",
    midType: request.midType || "TWO_D",
    processor: `quiklie_${operation}`,
    card,
    raw: body
  };
}

async function processPayment(payload, operation = "sale") {
  const config = getConfig();
  const { request, card } = buildPaymentPayload(payload);
  const response = await axios.post(`${config.baseUrl}${normalizePath(config.paths.processPayment)}`, request, {
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...authHeaders(config)
    },
    timeout: config.timeoutMs
  });
  return normalizeResponse(response.data, operation, request, card);
}

async function verifyOtp(payload = {}) {
  const config = getConfig();
  const transactionId = payload.transactionId || payload.paymentId || payload.qkpaymentId;
  if (!transactionId) throw inputError("transactionId is required");
  if (!payload.otp) throw inputError("otp is required");
  const request = { transactionId, otp: String(payload.otp) };
  const response = await axios.post(`${config.baseUrl}${normalizePath(config.paths.verifyOtp)}`, request, {
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...authHeaders(config)
    },
    timeout: config.timeoutMs
  });
  return normalizeResponse(response.data, "verify_otp", request);
}

async function getTransaction(transactionId) {
  if (!transactionId) throw inputError("transactionId is required");
  const config = getConfig();
  const path = normalizePath(config.paths.transaction).replace(":transactionId", encodeURIComponent(transactionId));
  const response = await axios.get(`${config.baseUrl}${path}`, {
    headers: {
      accept: "application/json",
      ...authHeaders(config)
    },
    timeout: config.timeoutMs
  });
  return normalizeResponse(response.data, "transaction_detail", { transactionReferenceId: transactionId });
}

async function testConnection() {
  const config = getConfig();
  const healthPath = normalizePath(config.paths.status);
  const response = await axios.get(`${config.baseUrl}${healthPath}`, {
    headers: { accept: "application/json" },
    timeout: config.timeoutMs
  });
  return {
    ok: response.status >= 200 && response.status < 300,
    configured: true,
    status: response.status >= 200 && response.status < 300 ? "ok" : "unknown",
    baseUrl: config.baseUrl,
    midType: "TWO_D",
    responseMessage: "Quiklie Payment status request completed",
    raw: response.data
  };
}

module.exports = {
  authorizeCard: (payload) => processPayment(payload, "sale"),
  captureTransaction: () => {
    throw inputError("Quiklie S2S V2 document does not define a capture endpoint");
  },
  getStatus,
  getTransaction,
  refundTransaction: () => {
    throw inputError("Quiklie S2S V2 document does not define a refund endpoint");
  },
  saleCard: (payload) => processPayment(payload, "sale"),
  testConnection,
  verifyCard: (payload) => processPayment(payload, "sale"),
  verifyOtp,
  voidTransaction: () => {
    throw inputError("Quiklie S2S V2 document does not define a void endpoint");
  }
};
