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
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeAmount(value, fieldName = "amount") {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw inputError(`${fieldName} must be a positive decimal amount`);
  }
  return amount.toFixed(2);
}

function getStatus() {
  const config = getProviderConfig("zoho");
  const hasStaticAuth = Boolean(config.apiKey || config.accessToken);
  const hasOauthRefresh = Boolean(config.clientId && config.clientSecret && config.refreshToken);
  const missing = [];
  if (!config.baseUrl) missing.push("ZOHO_PAYMENTS_API_BASE_URL");
  if (!hasStaticAuth && !hasOauthRefresh) {
    missing.push("ZOHO_PAYMENTS_ACCESS_TOKEN or ZOHO_PAYMENTS_API_KEY or OAuth refresh credentials");
  }
  return {
    configured: missing.length === 0,
    baseUrl: config.baseUrl || null,
    accountsUrl: config.accountsUrl || null,
    organizationIdConfigured: Boolean(config.organizationId),
    accountIdConfigured: Boolean(config.accountId),
    authMode: config.accessToken ? "access_token" : config.apiKey ? "api_key" : hasOauthRefresh ? "oauth_refresh" : "missing",
    timeoutMs: config.timeoutMs,
    pathStatus: Object.fromEntries(
      Object.entries(config.paths || {}).map(([key, value]) => [key, Boolean(value)])
    ),
    missing
  };
}

function getConfig() {
  const config = getProviderConfig("zoho");
  const status = getStatus();
  if (!status.configured) {
    throw inputError(`Missing Zoho Payments configuration: ${status.missing.join(", ")}`);
  }
  return {
    baseUrl: String(config.baseUrl || "").replace(/\/+$/, ""),
    accountsUrl: String(config.accountsUrl || "https://accounts.zoho.com").replace(/\/+$/, ""),
    apiKey: String(config.apiKey || "").trim(),
    accessToken: String(config.accessToken || "").trim(),
    clientId: String(config.clientId || "").trim(),
    clientSecret: String(config.clientSecret || "").trim(),
    refreshToken: String(config.refreshToken || "").trim(),
    organizationId: String(config.organizationId || "").trim(),
    accountId: String(config.accountId || "").trim(),
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 180000,
    paths: config.paths || {}
  };
}

async function refreshAccessToken(config) {
  if (!(config.clientId && config.clientSecret && config.refreshToken)) {
    return null;
  }
  const body = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token"
  });
  const response = await axios.post(`${config.accountsUrl}/oauth/v2/token`, body.toString(), {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    timeout: config.timeoutMs
  });
  return response.data?.access_token || null;
}

async function authHeaders(config) {
  const token = config.accessToken || await refreshAccessToken(config);
  if (token) {
    return { Authorization: `Zoho-oauthtoken ${token}` };
  }
  if (config.apiKey) {
    return { Authorization: `Bearer ${config.apiKey}` };
  }
  return {};
}

function operationPath(config, operation) {
  const aliases = {
    authorize: "authorize",
    auth: "authorize",
    charge: "sale",
    sale: "sale",
    verification: "verification",
    verify: "verification",
    live: "verification",
    capture: "capture",
    refund: "refund",
    void: "void",
    reversal: "void",
    transaction_detail: "transaction"
  };
  const key = aliases[operation] || operation;
  const path = normalizePath(config.paths[key]);
  if (!path) {
    throw inputError(`ZOHO_PAYMENTS_${key.toUpperCase()}_PATH is required for ${operation}`);
  }
  return path;
}

function buildCard(payload) {
  const token = payload.token || payload.providerPaymentToken || payload.source || payload.paymentMethodId;
  if (token) {
    return {
      paymentMethodToken: token,
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
    paymentMethodToken: null,
    card: {
      number: validation.normalizedPan,
      expMonth: String(payload.expMonth).padStart(2, "0"),
      expYear: String(payload.expYear),
      cvv: payload.cvv || payload.cvv2 || payload.cvc,
      cardholderName: payload.cardholderName || payload.name,
      first6: validation.first6,
      last4: validation.last4,
      brand: validation.brand,
      maskedPan: validation.maskedPan
    }
  };
}

function buildPaymentPayload(payload, operation) {
  const config = getConfig();
  const { paymentMethodToken, card } = buildCard(payload);
  return removeEmptyFields({
    operation,
    amount: ["verification", "verify", "live"].includes(operation) && (payload.amount === undefined || payload.amount === "")
      ? undefined
      : normalizeAmount(payload.amount, "amount"),
    currency: String(payload.currency || "USD").toUpperCase(),
    reference: payload.reference || payload.orderId,
    description: payload.description,
    organization_id: payload.organizationId || config.organizationId,
    account_id: payload.accountId || config.accountId,
    payment_method_token: paymentMethodToken,
    card: card ? {
      number: card.number,
      exp_month: card.expMonth,
      exp_year: card.expYear,
      cvv: card.cvv,
      cardholder_name: card.cardholderName
    } : undefined,
    billing: {
      name: payload.cardholderName || payload.name,
      email: payload.email,
      phone: payload.phone,
      address_line1: payload.billingAddressLine1 || payload.street,
      address_line2: payload.billingAddressLine2,
      city: payload.billingCity || payload.city,
      state: payload.billingState || payload.state,
      zip: payload.billingZip || payload.zip || payload.postalCode,
      country: payload.billingCountry || payload.country || "US"
    },
    metadata: payload.metadata
  });
}

function buildReferencePayload(payload, operation) {
  const config = getConfig();
  const transactionId = payload.transactionId || payload.retref || payload.authorizationPnref;
  if (!transactionId) {
    throw inputError("transactionId is required");
  }
  return removeEmptyFields({
    operation,
    transaction_id: transactionId,
    amount: payload.amount === undefined || payload.amount === "" ? undefined : normalizeAmount(payload.amount, "amount"),
    currency: String(payload.currency || "USD").toUpperCase(),
    reason: payload.reason || payload.note,
    organization_id: payload.organizationId || config.organizationId,
    account_id: payload.accountId || config.accountId
  });
}

function normalizeResponse(data, operation, request = {}, card = null) {
  const body = data && typeof data === "object" ? data : { raw: data };
  const transaction = body.transaction || body.payment || body.charge || body.refund || body.data || body;
  const statusText = String(transaction.status || body.status || "").toLowerCase();
  const statusMap = {
    paid: "approved",
    succeeded: "approved",
    success: "approved",
    approved: "approved",
    authorized: "authorized",
    captured: "captured",
    refunded: "refunded",
    voided: "voided",
    canceled: "voided",
    cancelled: "voided"
  };
  const status = statusMap[statusText] || statusText || "unknown";
  return {
    status,
    resultCode: transaction.code || body.code || transaction.status || body.status || null,
    responseMessage: transaction.message || body.message || transaction.description || body.description || null,
    transactionId: transaction.transaction_id || transaction.payment_id || transaction.charge_id || transaction.id || body.id || request.transaction_id || null,
    amount: transaction.amount || request.amount || null,
    currency: transaction.currency || request.currency || "USD",
    processor: `zoho_${operation}`,
    card,
    raw: body
  };
}

async function zohoRequest(operation, request) {
  const config = getConfig();
  const path = operationPath(config, operation);
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    ...await authHeaders(config)
  };
  const response = await axios.post(`${config.baseUrl}${path}`, request, {
    headers,
    timeout: config.timeoutMs
  });
  return response.data;
}

async function submitPayment(payload, operation) {
  const request = buildPaymentPayload(payload, operation);
  const cardSnapshot = request.card ? {
    first6: String(request.card.number || "").slice(0, 6),
    last4: String(request.card.number || "").slice(-4),
    brand: null,
    maskedPan: `**** **** **** ${String(request.card.number || "").slice(-4)}`
  } : null;
  const data = await zohoRequest(operation, request);
  return normalizeResponse(data, operation, request, cardSnapshot);
}

async function submitReferenceOperation(payload, operation) {
  const request = buildReferencePayload(payload, operation);
  const data = await zohoRequest(operation, request);
  return normalizeResponse(data, operation, request);
}

async function getTransaction(transactionId) {
  if (!transactionId) throw inputError("transactionId is required");
  const config = getConfig();
  const path = operationPath(config, "transaction_detail").replace(":transactionId", encodeURIComponent(transactionId));
  const response = await axios.get(`${config.baseUrl}${path}`, {
    headers: {
      accept: "application/json",
      ...await authHeaders(config)
    },
    timeout: config.timeoutMs
  });
  return normalizeResponse(response.data, "transaction_detail", { transaction_id: transactionId });
}

async function testConnection() {
  const config = getConfig();
  const status = getStatus();
  const healthPath = normalizePath(config.paths.status || config.paths.test);
  if (!healthPath) {
    return {
      ok: true,
      configured: true,
      status: "configured",
      baseUrl: config.baseUrl,
      pathStatus: status.pathStatus,
      responseMessage: "Zoho Payments credentials are loaded; set ZOHO_PAYMENTS_STATUS_PATH or operation paths for live validation"
    };
  }
  const response = await axios.get(`${config.baseUrl}${healthPath}`, {
    headers: {
      accept: "application/json",
      ...await authHeaders(config)
    },
    timeout: config.timeoutMs
  });
  return {
    ok: response.status >= 200 && response.status < 300,
    configured: true,
    status: response.status >= 200 && response.status < 300 ? "ok" : "unknown",
    baseUrl: config.baseUrl,
    responseMessage: "Zoho Payments status request completed",
    raw: response.data
  };
}

module.exports = {
  authorizeCard: (payload) => submitPayment(payload, "authorize"),
  captureTransaction: (payload) => submitReferenceOperation(payload, "capture"),
  getStatus,
  getTransaction,
  refundTransaction: (payload) => submitReferenceOperation(payload, "refund"),
  saleCard: (payload) => submitPayment(payload, "sale"),
  testConnection,
  verifyCard: (payload) => submitPayment(payload, "verification"),
  voidTransaction: (payload) => submitReferenceOperation(payload, "void")
};
