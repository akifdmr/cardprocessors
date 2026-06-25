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

function getStatus() {
  const config = getProviderConfig("authorizenet");
  const missing = [];
  if (!config.apiLoginId) missing.push("AUTHORIZE_NET_API_LOGIN_ID or AUTHORIZE_LOGIN_ID");
  if (!config.transactionKey) missing.push("AUTHORIZE_NET_TRANSACTION_KEY or AUTHORIZE_TRANSACTION_KEY");
  return {
    configured: missing.length === 0,
    environment: config.environment,
    baseUrl: config.baseUrl,
    publicClientKeyConfigured: Boolean(config.publicClientKey),
    signatureKeyConfigured: Boolean(config.signatureKey),
    timeoutMs: config.timeoutMs,
    verificationAmount: config.verificationAmount,
    missing
  };
}

function getConfig() {
  const config = getProviderConfig("authorizenet");
  const status = getStatus();
  if (!status.configured) {
    throw inputError(`Missing ${status.missing.join(", ")}`);
  }
  return {
    baseUrl: String(config.baseUrl || "").trim(),
    apiLoginId: String(config.apiLoginId || "").trim(),
    transactionKey: String(config.transactionKey || "").trim(),
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 180000,
    verificationAmount: normalizeAmount(config.verificationAmount || "0.01", "verificationAmount")
  };
}

function normalizeAmount(value, fieldName = "amount") {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw inputError(`${fieldName} must be a positive decimal amount`);
  }
  return amount.toFixed(2);
}

function expirationDate(expMonth, expYear) {
  const month = String(expMonth || "").padStart(2, "0");
  const rawYear = String(expYear || "");
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^\d{4}$/.test(year)) {
    throw inputError("expMonth and expYear are required");
  }
  return `${year}-${month}`;
}

function splitName(payload) {
  const parts = String(payload.cardholderName || payload.name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: payload.firstName || parts[0] || undefined,
    lastName: payload.lastName || parts.slice(1).join(" ") || undefined
  };
}

function buildCardPayment(payload) {
  const token = payload.token || payload.providerPaymentToken || payload.paymentToken;
  if (token) {
    return {
      payment: {
        opaqueData: {
          dataDescriptor: payload.dataDescriptor || "COMMON.ACCEPT.INAPP.PAYMENT",
          dataValue: token
        }
      },
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
    payment: {
      creditCard: removeEmptyFields({
        cardNumber: validation.normalizedPan,
        expirationDate: expirationDate(payload.expMonth, payload.expYear),
        cardCode: payload.cvc || payload.cvv || payload.cvv2
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

function buildRefundPayment(payload) {
  const last4 = String(payload.last4 || payload.cardLast4 || payload.pan || payload.cardNumber || "").replace(/\D/g, "").slice(-4);
  if (!last4) {
    return undefined;
  }
  return {
    creditCard: {
      cardNumber: last4,
      expirationDate: payload.expirationDate || "XXXX"
    }
  };
}

function buildBillTo(payload) {
  const { firstName, lastName } = splitName(payload);
  return removeEmptyFields({
    firstName,
    lastName,
    company: payload.billingCompany,
    address: payload.billingAddressLine1 || payload.street || payload.address,
    city: payload.billingCity || payload.city,
    state: payload.billingState || payload.state,
    zip: payload.billingZip || payload.zip || payload.postalCode,
    country: payload.billingCountry || payload.country,
    phoneNumber: payload.phone,
    email: payload.email
  });
}

async function submitAuthorizeNet(payload) {
  const config = getConfig();
  const response = await axios.post(
    config.baseUrl,
    payload,
    {
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      timeout: config.timeoutMs
    }
  );
  return response.data || {};
}

function transactionStatus(responseCode, operation) {
  if (String(responseCode) === "1") {
    if (operation === "authOnlyTransaction") return "authorized";
    if (operation === "priorAuthCaptureTransaction" || operation === "authCaptureTransaction") return "captured";
    if (operation === "refundTransaction") return "refunded";
    if (operation === "voidTransaction") return "voided";
    return "approved";
  }
  if (String(responseCode) === "2") return "declined";
  if (String(responseCode) === "4") return "held_for_review";
  return "failed";
}

function responseMessage(data) {
  const transaction = data.transactionResponse || {};
  return transaction.messages?.[0]?.description ||
    transaction.errors?.[0]?.errorText ||
    data.messages?.message?.[0]?.text ||
    data.messages?.message?.[0]?.code ||
    null;
}

function summarizeCreateTransaction(data, { operation, request, card = null } = {}) {
  const transaction = data.transactionResponse || {};
  return {
    status: transactionStatus(transaction.responseCode, operation),
    resultCode: transaction.transId && transaction.transId !== "0" ? transaction.responseCode : (transaction.errors?.[0]?.errorCode || data.messages?.resultCode || transaction.responseCode || null),
    responseMessage: responseMessage(data),
    authCode: transaction.authCode || null,
    transactionId: transaction.transId && transaction.transId !== "0" ? transaction.transId : null,
    providerReferenceId: transaction.transId && transaction.transId !== "0" ? transaction.transId : null,
    amount: request.transactionRequest?.amount || null,
    currency: request.transactionRequest?.currencyCode || "USD",
    avsResult: transaction.avsResultCode || null,
    cvvResult: transaction.cvvResultCode || null,
    accountNumber: transaction.accountNumber || null,
    accountType: transaction.accountType || null,
    processor: `authorizenet_${operation}`,
    card,
    raw: data
  };
}

async function createTransaction(payload, transactionType) {
  const config = getConfig();
  const { payment, card } = buildCardPayment(payload);
  const amount = transactionType === "authOnlyTransaction" && (payload.amount === undefined || payload.amount === null || payload.amount === "")
    ? config.verificationAmount
    : normalizeAmount(payload.amount, "amount");
  const request = removeEmptyFields({
    createTransactionRequest: {
      merchantAuthentication: {
        name: config.apiLoginId,
        transactionKey: config.transactionKey
      },
      refId: payload.reference || payload.orderId,
      transactionRequest: {
        transactionType,
        amount,
        currencyCode: String(payload.currency || "USD").toUpperCase(),
        payment,
        order: removeEmptyFields({
          invoiceNumber: payload.invoiceNumber || payload.orderId || payload.reference,
          description: payload.description
        }),
        billTo: buildBillTo(payload),
        customerIP: payload.ipAddress || payload.ip,
        customer: removeEmptyFields({
          id: payload.customerId,
          email: payload.email
        })
      }
    }
  });
  const data = await submitAuthorizeNet(request);
  return summarizeCreateTransaction(data, { operation: transactionType, request: request.createTransactionRequest, card });
}

async function referenceTransaction(payload, transactionType) {
  const config = getConfig();
  const transactionId = payload.transactionId || payload.transId || payload.refTransId || payload.retref;
  if (!transactionId) {
    throw inputError("transactionId is required");
  }
  const transactionRequest = removeEmptyFields({
    transactionType,
    refTransId: transactionId,
    amount: transactionType === "voidTransaction" ? undefined : normalizeAmount(payload.amount, "amount"),
    currencyCode: String(payload.currency || "USD").toUpperCase(),
    payment: transactionType === "refundTransaction" ? buildRefundPayment(payload) : undefined
  });
  const request = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: config.apiLoginId,
        transactionKey: config.transactionKey
      },
      refId: payload.reference || payload.orderId,
      transactionRequest
    }
  };
  const data = await submitAuthorizeNet(removeEmptyFields(request));
  return summarizeCreateTransaction(data, { operation: transactionType, request: request.createTransactionRequest });
}

async function getTransaction(transactionId) {
  if (!transactionId) {
    throw inputError("transactionId is required");
  }
  const config = getConfig();
  const request = {
    getTransactionDetailsRequest: {
      merchantAuthentication: {
        name: config.apiLoginId,
        transactionKey: config.transactionKey
      },
      transId: transactionId
    }
  };
  const data = await submitAuthorizeNet(request);
  const transaction = data.transaction || {};
  return {
    status: data.messages?.resultCode === "Ok" ? "success" : "failed",
    resultCode: data.messages?.message?.[0]?.code || null,
    responseMessage: data.messages?.message?.[0]?.text || null,
    transactionId,
    amount: transaction.authAmount || transaction.settleAmount || null,
    currency: transaction.currencyCode || "USD",
    transactionStatus: transaction.transactionStatus || null,
    processor: "authorizenet_transaction_detail",
    raw: data
  };
}

async function testConnection() {
  const config = getConfig();
  return {
    ok: true,
    configured: true,
    status: "configured",
    environment: getProviderConfig("authorizenet").environment,
    baseUrl: config.baseUrl,
    responseMessage: "Authorize.net credentials are loaded; gateway validation happens on transaction calls"
  };
}

module.exports = {
  authorizeCard: (payload) => createTransaction(payload, "authOnlyTransaction"),
  captureTransaction: (payload) => referenceTransaction(payload, "priorAuthCaptureTransaction"),
  getStatus,
  getTransaction,
  refundTransaction: (payload) => referenceTransaction(payload, "refundTransaction"),
  saleCard: (payload) => createTransaction(payload, "authCaptureTransaction"),
  testConnection,
  verifyCard: (payload) => createTransaction(payload, "authOnlyTransaction"),
  voidTransaction: (payload) => referenceTransaction(payload, "voidTransaction")
};
