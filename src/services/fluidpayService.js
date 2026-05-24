const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { getProviderConfig } = require("../providers");
const { validateCardInput } = require("./cardValidationService");

const VALID_TRANSACTION_TYPES = new Set(["sale", "authorize", "verification", "credit"]);

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function getFluidPayConfig() {
  const config = getProviderConfig("fluidpay");
  if (!config.apiKey) {
    throw inputError("Missing FLUIDPAY_API_KEY");
  }
  return {
    baseUrl: String(config.baseUrl || "https://sandbox.fluidpay.com").replace(/\/+$/, ""),
    apiKey: String(config.apiKey).trim(),
    processorId: String(config.processorId || "").trim(),
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
      ? config.timeoutMs
      : 180000
  };
}

function getStatus() {
  const config = getProviderConfig("fluidpay");
  const missing = config.apiKey ? [] : ["FLUIDPAY_API_KEY"];
  return {
    configured: missing.length === 0,
    baseUrl: config.baseUrl,
    processorId: config.processorId || null,
    timeoutMs: config.timeoutMs,
    missing
  };
}

function removeEmptyFields(payload) {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => removeEmptyFields(item))
      .filter((item) => item !== undefined && item !== null && item !== "");
  }

  if (payload && typeof payload === "object") {
    return Object.fromEntries(
      Object.entries(payload)
        .map(([key, value]) => [key, removeEmptyFields(value)])
        .filter(([, value]) => {
          if (value === undefined || value === null || value === "") {
            return false;
          }
          if (Array.isArray(value)) {
            return value.length > 0;
          }
          if (value && typeof value === "object") {
            return Object.keys(value).length > 0;
          }
          return true;
        })
    );
  }

  return payload;
}

function requirePositiveInteger(value, fieldName) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw inputError(`${fieldName} must be a positive integer in cents`);
  }
  return amount;
}

function splitCardholderName(payload) {
  const nameParts = String(payload.cardholderName || payload.name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: payload.firstName || nameParts[0] || undefined,
    lastName: payload.lastName || nameParts.slice(1).join(" ") || undefined
  };
}

function formatExpirationDate(expMonth, expYear) {
  const month = String(expMonth || "").padStart(2, "0");
  const rawYear = String(expYear || "");
  const year = rawYear.length === 2 ? rawYear : rawYear.slice(-2);

  if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^\d{2}$/.test(year)) {
    throw inputError("expMonth and expYear are required");
  }

  return `${month}/${year}`;
}

function buildCardPaymentMethod(payload) {
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
    paymentMethod: {
      card: removeEmptyFields({
        entry_type: payload.entryType || "keyed",
        number: validation.normalizedPan,
        expiration_date: formatExpirationDate(payload.expMonth, payload.expYear),
        cvc: payload.cvc || payload.cvv || payload.cvv2
      })
    },
    card: {
      first6: validation.first6,
      last4: validation.last4,
      brand: validation.brand,
      maskedPan: validation.maskedPan
    }
  };
}

function buildPaymentMethod(payload) {
  if (payload.paymentMethod && typeof payload.paymentMethod === "object") {
    return {
      paymentMethod: payload.paymentMethod,
      card: null
    };
  }

  if (payload.token) {
    return {
      paymentMethod: { token: payload.token },
      card: null
    };
  }

  if (payload.customerId) {
    return {
      paymentMethod: {
        customer: removeEmptyFields({
          id: payload.customerId,
          payment_method_id: payload.paymentMethodId,
          payment_method_type: payload.paymentMethodType,
          billing_address_id: payload.billingAddressId,
          shipping_address_id: payload.shippingAddressId
        })
      },
      card: null
    };
  }

  return buildCardPaymentMethod(payload);
}

function buildBillingAddress(payload) {
  const { firstName, lastName } = splitCardholderName(payload);
  return removeEmptyFields({
    first_name: firstName,
    last_name: lastName,
    company: payload.billingCompany,
    address_line_1: payload.billingAddressLine1 || payload.street,
    address_line_2: payload.billingAddressLine2,
    city: payload.billingCity || payload.city,
    state: payload.billingState || payload.state,
    postal_code: payload.billingZip || payload.zip || payload.postalCode,
    country: payload.billingCountry || payload.country || "US",
    email: payload.email,
    phone: payload.phone
  });
}

function buildTransactionRequest(payload, typeOverride) {
  const type = String(typeOverride || payload.type || "").toLowerCase();
  if (!VALID_TRANSACTION_TYPES.has(type)) {
    throw inputError("type must be sale, authorize, verification or credit");
  }

  const config = getFluidPayConfig();
  const { paymentMethod, card } = buildPaymentMethod(payload);
  const amount = requirePositiveInteger(payload.amount, "amount");

  const request = removeEmptyFields({
    type,
    amount,
    currency: String(payload.currency || "USD").toUpperCase(),
    processor_id: payload.processorId || config.processorId || undefined,
    payment_method: paymentMethod,
    billing_address: buildBillingAddress(payload),
    order_id: payload.orderId,
    po_number: payload.poNumber,
    description: payload.description,
    ip_address: payload.ipAddress,
    idempotency_key: payload.idempotencyKey || uuidv4(),
    idempotency_time: payload.idempotencyTime,
    create_vault_record: payload.createVaultRecord,
    create_vault_record_for: payload.createVaultRecordFor,
    email_receipt: payload.emailReceipt,
    email_address: payload.emailAddress || payload.email,
    custom_fields: payload.customFields
  });

  return { request, card };
}

async function submitFluidPayRequest(method, pathname, data) {
  const config = getFluidPayConfig();
  const response = await axios({
    method,
    url: `${config.baseUrl}${pathname}`,
    data,
    headers: {
      accept: "application/json",
      authorization: config.apiKey,
      "content-type": "application/json"
    },
    timeout: config.timeoutMs
  });

  return {
    body: response.data,
    correlationId: response.headers["x-correlation-id"] || response.headers["correlation-id"] || null
  };
}

function getResponseCode(data) {
  const code = data?.response_code || data?.response_body?.card?.response_code || data?.response?.card?.response_code;
  const numericCode = Number(code);
  return Number.isFinite(numericCode) ? numericCode : null;
}

function normalizeGatewayStatus(envelope) {
  const apiStatus = String(envelope?.status || "").toLowerCase();
  const data = envelope?.data || {};
  const response = String(data.response || data.response_body?.card?.response || data.response?.card?.status || "").toLowerCase();
  const responseCode = getResponseCode(data);

  if (apiStatus === "failed" || apiStatus === "error") {
    return "failed";
  }
  if (responseCode >= 100 && responseCode <= 199) {
    return "approved";
  }
  if (responseCode >= 200 && responseCode <= 299) {
    return "declined";
  }
  if (responseCode >= 300) {
    return "failed";
  }
  if (response === "approved") {
    return "approved";
  }
  if (response === "declined") {
    return "declined";
  }
  return apiStatus === "success" ? "unknown" : apiStatus || "unknown";
}

function summarizeTransaction({ body, correlationId }, { card = null, processor = "fluidpay_transaction" } = {}) {
  const data = body?.data || {};
  const cardResponse = data.response_body?.card || data.response?.card || {};

  return {
    status: normalizeGatewayStatus(body),
    resultCode: getResponseCode(data),
    responseMessage: body?.msg || cardResponse.processor_response_text || data.response || null,
    transactionId: data.id || null,
    type: data.type || null,
    gatewayStatus: data.status || null,
    processor,
    processorId: data.processor_id || cardResponse.processor_id || null,
    authCode: cardResponse.auth_code || null,
    avsResult: cardResponse.avs_response_code || null,
    cvvResult: cardResponse.cvv_response_code || null,
    amount: data.amount ?? null,
    currency: data.currency || null,
    correlationId,
    card,
    raw: body
  };
}

async function createTransaction(payload, typeOverride) {
  const { request, card } = buildTransactionRequest(payload, typeOverride);
  const result = await submitFluidPayRequest("post", "/api/transaction", request);
  return summarizeTransaction(result, {
    card,
    processor: `fluidpay_${request.type}`
  });
}

async function captureTransaction({
  transactionId,
  amount,
  taxAmount,
  shippingAmount,
  taxExempt,
  orderId,
  poNumber,
  ipAddress
}) {
  if (!transactionId) {
    throw inputError("transactionId is required");
  }

  const body = removeEmptyFields({
    amount: amount == null ? undefined : requirePositiveInteger(amount, "amount"),
    tax_amount: taxAmount == null ? undefined : Number(taxAmount),
    shipping_amount: shippingAmount == null ? undefined : Number(shippingAmount),
    tax_exempt: taxExempt,
    order_id: orderId,
    po_number: poNumber,
    ip_address: ipAddress
  });

  const result = await submitFluidPayRequest("post", `/api/transaction/${encodeURIComponent(transactionId)}/capture`, body);
  return summarizeTransaction(result, { processor: "fluidpay_capture" });
}

async function voidTransaction({ transactionId }) {
  if (!transactionId) {
    throw inputError("transactionId is required");
  }

  const result = await submitFluidPayRequest("post", `/api/transaction/${encodeURIComponent(transactionId)}/void`);
  return {
    status: result.body?.status === "success" ? "approved" : "failed",
    resultCode: null,
    responseMessage: result.body?.msg || null,
    transactionId,
    processor: "fluidpay_void",
    correlationId: result.correlationId,
    raw: result.body
  };
}

async function refundTransaction({ transactionId, amount, surcharge }) {
  if (!transactionId) {
    throw inputError("transactionId is required");
  }

  const body = removeEmptyFields({
    amount: amount == null ? undefined : requirePositiveInteger(amount, "amount"),
    surcharge: surcharge == null ? undefined : Number(surcharge)
  });

  const result = await submitFluidPayRequest("post", `/api/transaction/${encodeURIComponent(transactionId)}/refund`, body);
  return summarizeTransaction(result, { processor: "fluidpay_refund" });
}

async function getTransaction(transactionId) {
  if (!transactionId) {
    throw inputError("transactionId is required");
  }

  const result = await submitFluidPayRequest("get", `/api/transaction/${encodeURIComponent(transactionId)}`);
  return {
    status: result.body?.status || "unknown",
    responseMessage: result.body?.msg || null,
    transactionId,
    processor: "fluidpay_get_transaction",
    correlationId: result.correlationId,
    raw: result.body
  };
}

async function searchTransactions(criteria = {}) {
  const body = removeEmptyFields(criteria);
  const result = await submitFluidPayRequest("post", "/api/transaction/search", body);
  return {
    ok: result.body?.status === "success",
    status: result.body?.status || "unknown",
    responseMessage: result.body?.msg || null,
    totalCount: result.body?.total_count ?? null,
    processor: "fluidpay_transaction_search",
    correlationId: result.correlationId,
    raw: result.body
  };
}

async function testConnection() {
  const result = await searchTransactions({ limit: 1 });
  return {
    ok: Boolean(result.ok),
    configured: true,
    baseUrl: getFluidPayConfig().baseUrl,
    responseMessage: result.responseMessage,
    correlationId: result.correlationId,
    totalCount: result.totalCount,
    raw: result.raw
  };
}

module.exports = {
  authorizeCard: (payload) => createTransaction(payload, "authorize"),
  captureTransaction,
  createTransaction,
  getStatus,
  getTransaction,
  refundTransaction,
  saleCard: (payload) => createTransaction(payload, "sale"),
  searchTransactions,
  testConnection,
  voidTransaction
};
