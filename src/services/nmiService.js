const axios = require("axios");
const { getProviderConfig } = require("../providers");
const { validateCardInput } = require("./cardValidationService");

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
  return path.startsWith("/") ? path : `/${path}`;
}

function getStatus() {
  const config = getProviderConfig("nmi");
  const missing = [];
  if (!config.paymentApiKey) missing.push("NMI_PAYMENT_API_KEY or NMI_SECURITY_KEY");
  return {
    configured: missing.length === 0,
    baseUrl: config.baseUrl,
    clientKeyConfigured: Boolean(config.clientKey),
    clientSecretConfigured: Boolean(config.clientSecret),
    componentTokenConfigured: Boolean(config.componentTokenKey),
    transactionPath: config.transactionPath,
    queryPath: config.queryPath,
    timeoutMs: config.timeoutMs,
    missing
  };
}

function getConfig() {
  const config = getProviderConfig("nmi");
  const status = getStatus();
  if (!status.configured) {
    throw inputError(`Missing ${status.missing.join(", ")}`);
  }
  return {
    baseUrl: String(config.baseUrl || "https://secure.nmi.com").replace(/\/+$/, ""),
    paymentApiKey: String(config.paymentApiKey || "").trim(),
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 180000,
    transactionPath: normalizePath(config.transactionPath || "/api/transact.php"),
    queryPath: normalizePath(config.queryPath || "/api/query.php"),
    defaultBillingCountry: String(config.defaultBillingCountry || "US").toUpperCase()
  };
}

function normalizeAmount(value, fieldName = "amount") {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw inputError(`${fieldName} must be a positive decimal amount`);
  }
  return amount.toFixed(2);
}

function expiryMmyy(expMonth, expYear) {
  const month = String(expMonth || "").padStart(2, "0");
  const rawYear = String(expYear || "");
  const year = rawYear.length === 2 ? rawYear : rawYear.slice(-2);
  if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^\d{2}$/.test(year)) {
    throw inputError("expMonth and expYear are required");
  }
  return `${month}${year}`;
}

function splitName(payload) {
  const parts = String(payload.cardholderName || payload.name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: payload.firstName || parts[0] || undefined,
    lastName: payload.lastName || parts.slice(1).join(" ") || undefined
  };
}

function buildCardFields(payload) {
  const token = payload.token || payload.providerPaymentToken || payload.paymentToken || payload.customerVaultId;
  if (token) {
    return {
      fields: { customer_vault_id: token },
      card: null
    };
  }

  const validation = validateCardInput({
    pan: payload.pan || payload.cardNumber,
    expMonth: payload.expMonth,
    expYear: payload.expYear,
    cardholderName: payload.cardholderName || payload.name,
    billingZip: payload.billingZip || payload.zip || payload.postalCode
  });

  if (!validation.isValid) {
    throw inputError(`Invalid card input: ${validation.issues.join(", ")}`);
  }

  return {
    fields: {
      ccnumber: validation.normalizedPan,
      ccexp: expiryMmyy(payload.expMonth, payload.expYear),
      cvv: payload.cvc || payload.cvv || payload.cvv2
    },
    card: {
      first6: validation.first6,
      last4: validation.last4,
      brand: validation.brand,
      maskedPan: validation.maskedPan
    }
  };
}

function buildBillingFields(payload, config) {
  const { firstName, lastName } = splitName(payload);
  return removeEmptyFields({
    first_name: firstName,
    last_name: lastName,
    address1: payload.billingAddressLine1 || payload.street,
    address2: payload.billingAddressLine2,
    city: payload.billingCity || payload.city,
    state: payload.billingState || payload.state,
    zip: payload.billingZip || payload.zip || payload.postalCode,
    country: payload.billingCountry || payload.country || config.defaultBillingCountry,
    email: payload.email,
    phone: payload.phone,
    ipaddress: payload.ipAddress || payload.ip
  });
}

function parseNmiBody(raw) {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw || "");
  if (text.trim().startsWith("<")) {
    const entries = {};
    for (const tag of ["error_response", "response", "response_code", "responsetext", "transactionid", "authcode", "avsresponse", "cvvresponse"]) {
      const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
      if (match) entries[tag] = match[1].trim();
    }
    if (entries.error_response && !entries.responsetext) {
      entries.responsetext = entries.error_response;
    }
    return entries;
  }
  return Object.fromEntries(new URLSearchParams(text));
}

function mapStatus(body, operation) {
  const response = String(body.response || "");
  const responseText = String(body.responsetext || body.response_text || "").toLowerCase();
  if (response === "1") {
    if (operation === "auth") return "authorized";
    if (operation === "validate") return "verified";
    if (operation === "capture") return "captured";
    if (operation === "refund") return "refunded";
    if (operation === "void") return "voided";
    return "approved";
  }
  if (response === "2") return "declined";
  if (responseText.includes("approved")) return "approved";
  return "failed";
}

function summarizeResponse(body, { operation, card = null, request = {} } = {}) {
  const transactionId = body.transactionid || body.transaction_id || body.transaction || request.transactionid || null;
  return {
    status: mapStatus(body, operation),
    resultCode: body.response_code || body.response || null,
    responseMessage: body.responsetext || body.response_text || null,
    authCode: body.authcode || null,
    transactionId,
    amount: request.amount || body.amount || null,
    currency: request.currency || "USD",
    avsResult: body.avsresponse || null,
    cvvResult: body.cvvresponse || null,
    processor: `nmi_${operation}`,
    card,
    raw: body
  };
}

async function postForm(pathname, fields) {
  const config = getConfig();
  const body = new URLSearchParams(removeEmptyFields({
    security_key: config.paymentApiKey,
    ...fields
  }));
  const response = await axios.post(
    `${config.baseUrl}${pathname}`,
    body.toString(),
    {
      headers: {
        accept: "application/x-www-form-urlencoded, text/plain, */*",
        "content-type": "application/x-www-form-urlencoded"
      },
      timeout: config.timeoutMs,
      transformResponse: [(data) => data]
    }
  );
  return parseNmiBody(response.data);
}

async function submitPayment(payload, type) {
  const config = getConfig();
  const { fields: paymentFields, card } = buildCardFields(payload);
  const transactionType = type === "auth" || type === "authorize"
    ? "auth"
    : type === "verification" || type === "verify" || type === "validate"
      ? "validate"
      : "sale";
  const request = removeEmptyFields({
    type: transactionType,
    amount: transactionType === "validate" && (payload.amount === undefined || payload.amount === null || payload.amount === "")
      ? undefined
      : normalizeAmount(payload.amount, "amount"),
    currency: String(payload.currency || "USD").toUpperCase(),
    orderid: payload.reference || payload.orderId,
    orderdescription: payload.description,
    ponumber: payload.poNumber,
    tax: payload.tax == null ? undefined : normalizeAmount(payload.tax, "tax"),
    shipping: payload.shipping == null ? undefined : normalizeAmount(payload.shipping, "shipping"),
    ...paymentFields,
    ...buildBillingFields(payload, config)
  });
  const body = await postForm(config.transactionPath, request);
  return summarizeResponse(body, { operation: transactionType, card, request });
}

async function submitReferenceOperation(payload, type) {
  const config = getConfig();
  const transactionId = payload.transactionId || payload.retref || payload.transactionid;
  if (!transactionId) {
    throw inputError("transactionId is required");
  }
  const request = removeEmptyFields({
    type,
    transactionid: transactionId,
    amount: payload.amount == null || payload.amount === "" ? undefined : normalizeAmount(payload.amount, "amount"),
    currency: String(payload.currency || "USD").toUpperCase()
  });
  const body = await postForm(config.transactionPath, request);
  return summarizeResponse(body, { operation: type, request });
}

async function getTransaction(transactionId) {
  if (!transactionId) {
    throw inputError("transactionId is required");
  }
  const config = getConfig();
  const body = await postForm(config.queryPath, { transaction_id: transactionId });
  return {
    status: body.response === "1" || body.nm_response === "1" ? "success" : "unknown",
    resultCode: body.response_code || body.response || null,
    responseMessage: body.responsetext || body.response_text || null,
    transactionId,
    processor: "nmi_query",
    raw: body
  };
}

async function testConnection() {
  const config = getConfig();
  return {
    ok: true,
    configured: true,
    status: "configured",
    baseUrl: config.baseUrl,
    responseMessage: "NMI Payment API key is loaded; gateway validation happens on sale/auth/validate operations"
  };
}

module.exports = {
  authorizeCard: (payload) => submitPayment(payload, "auth"),
  captureTransaction: (payload) => submitReferenceOperation(payload, "capture"),
  getStatus,
  getTransaction,
  refundTransaction: (payload) => submitReferenceOperation(payload, "refund"),
  saleCard: (payload) => submitPayment(payload, "sale"),
  testConnection,
  verifyCard: (payload) => submitPayment(payload, "validate"),
  voidTransaction: (payload) => submitReferenceOperation(payload, "void")
};
