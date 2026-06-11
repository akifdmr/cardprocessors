const axios = require("axios");
const braintree = require("braintree");
const { getProviderConfig } = require("../providers");
const { validateCardInput } = require("./cardValidationService");

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function getBraintreeConfig() {
  const config = getProviderConfig("braintree");
  const missing = [];
  if (!config.merchantId) missing.push("BRAINTREE_MERCHANT_ID");
  if (!config.publicKey) missing.push("BRAINTREE_PUBLIC_KEY");
  if (!config.privateKey) missing.push("BRAINTREE_PRIVATE_KEY");
  if (missing.length) {
    throw inputError(`Missing Braintree configuration: ${missing.join(", ")}`);
  }
  return {
    environment: String(config.environment || "sandbox").toLowerCase(),
    baseUrl: String(config.baseUrl || "https://payments.sandbox.braintree-api.com/graphql").replace(/\/+$/, ""),
    merchantId: String(config.merchantId).trim(),
    publicKey: String(config.publicKey).trim(),
    privateKey: String(config.privateKey).trim(),
    merchantAccountId: String(config.merchantAccountId || "").trim(),
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 180000
  };
}

function getStatus() {
  const config = getProviderConfig("braintree");
  const missing = [
    ["BRAINTREE_MERCHANT_ID", config.merchantId],
    ["BRAINTREE_PUBLIC_KEY", config.publicKey],
    ["BRAINTREE_PRIVATE_KEY", config.privateKey]
  ].filter(([, value]) => !value).map(([name]) => name);
  return {
    configured: missing.length === 0,
    environment: config.environment || "sandbox",
    baseUrl: config.baseUrl,
    merchantAccountId: config.merchantAccountId || null,
    timeoutMs: config.timeoutMs,
    missing
  };
}

function getGateway() {
  const config = getBraintreeConfig();
  return new braintree.BraintreeGateway({
    environment: config.environment === "production" ? braintree.Environment.Production : braintree.Environment.Sandbox,
    merchantId: config.merchantId,
    publicKey: config.publicKey,
    privateKey: config.privateKey
  });
}

function runGateway(method) {
  return new Promise((resolve, reject) => {
    method((error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
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

function normalizeAmount(value) {
  const normalized = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw inputError("amount must be a positive decimal value");
  }
  return normalized.toFixed(2);
}

function buildCardPayload(payload) {
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
    creditCard: removeEmptyFields({
      number: validation.normalizedPan,
      expirationMonth: String(payload.expMonth).padStart(2, "0"),
      expirationYear: String(payload.expYear),
      cvv: payload.cvv || payload.cvv2,
      cardholderName: payload.cardholderName || payload.name,
      billingAddress: {
        postalCode: payload.billingZip || payload.zip || payload.postalCode,
        streetAddress: payload.billingAddressLine1 || payload.street,
        extendedAddress: payload.billingAddressLine2,
        locality: payload.billingCity || payload.city,
        region: payload.billingState || payload.state,
        countryCodeAlpha2: payload.billingCountry || payload.country || "US"
      }
    }),
    card: {
      first6: validation.first6,
      last4: validation.last4,
      brand: validation.brand,
      maskedPan: validation.maskedPan
    }
  };
}

async function graphqlRequest(query, variables = {}) {
  const config = getBraintreeConfig();
  const response = await axios.post(
    config.baseUrl,
    { query, variables },
    {
      auth: { username: config.publicKey, password: config.privateKey },
      headers: {
        "Braintree-Version": "2019-01-01",
        "Content-Type": "application/json"
      },
      timeout: config.timeoutMs
    }
  );
  if (Array.isArray(response.data?.errors) && response.data.errors.length) {
    const message = response.data.errors.map((item) => item.message).filter(Boolean).join("; ");
    throw inputError(message || "Braintree GraphQL error");
  }
  return {
    body: response.data,
    requestId: response.headers["x-request-id"] || response.headers["braintree-request-id"] || null
  };
}

async function testConnection() {
  const result = await graphqlRequest("query { ping }");
  return {
    ok: result.body?.data?.ping === true || result.body?.data?.ping === "pong" || result.body?.data?.ping != null,
    configured: true,
    status: result.body?.data?.ping ? "ok" : "unknown",
    responseMessage: result.body?.data?.ping ? "Braintree GraphQL ping succeeded" : "Braintree GraphQL ping returned no value",
    baseUrl: getBraintreeConfig().baseUrl,
    requestId: result.requestId,
    raw: result.body
  };
}

async function generateClientToken(payload = {}) {
  const gateway = getGateway();
  const request = removeEmptyFields({
    customerId: payload.customerId || payload.customer_id
  });
  const result = await runGateway((done) => gateway.clientToken.generate(request, done));
  if (!result?.clientToken) {
    throw inputError("Braintree client token could not be generated");
  }
  return {
    ok: true,
    configured: true,
    clientToken: result.clientToken
  };
}

async function tokenizeCreditCard(payload) {
  const { creditCard, card } = buildCardPayload(payload);
  const query = `
    mutation TokenizeCreditCard($input: TokenizeCreditCardInput!) {
      tokenizeCreditCard(input: $input) {
        paymentMethod {
          id
          details {
            ... on CreditCardDetails {
              brandCode
              last4
              bin
              expirationMonth
              expirationYear
            }
          }
        }
      }
    }
  `;
  const result = await graphqlRequest(query, { input: { creditCard } });
  const paymentMethod = result.body?.data?.tokenizeCreditCard?.paymentMethod;
  return {
    paymentMethodId: paymentMethod?.id,
    card: {
      ...card,
      brand: paymentMethod?.details?.brandCode || card.brand,
      first6: paymentMethod?.details?.bin || card.first6,
      last4: paymentMethod?.details?.last4 || card.last4
    },
    raw: result.body,
    requestId: result.requestId
  };
}

function transactionInput(payload, paymentMethodId) {
  const config = getBraintreeConfig();
  return removeEmptyFields({
    paymentMethodId,
    transaction: {
      amount: normalizeAmount(payload.amount),
      merchantAccountId: payload.merchantAccountId || config.merchantAccountId || undefined,
      orderId: payload.orderId || payload.reference,
      descriptor: payload.descriptor,
      customFields: payload.customFields
    }
  });
}

function normalizeTransaction(result, processor, fallbackId = null) {
  const transaction = result?.transaction || result?.refund || result?.reversal || {};
  const status = String(transaction.status || result?.status || "").toLowerCase();
  return {
    status: ["submitted_for_settlement", "settling", "settled", "authorized", "settlement_pending"].includes(status) ? "approved" : status || "unknown",
    resultCode: transaction.status || null,
    responseMessage: transaction.status || null,
    transactionId: transaction.id || fallbackId,
    processor,
    amount: transaction.amount?.value || transaction.amount || null,
    currency: transaction.amount?.currencyCode || null,
    raw: result
  };
}

function normalizeGatewayTransaction(result, processor, fallbackId = null) {
  const transaction = result?.transaction || {};
  const status = String(transaction.status || "").toLowerCase();
  return {
    status: ["submitted_for_settlement", "settling", "settled", "authorized", "settlement_pending"].includes(status) ? "approved" : status || (result?.success ? "approved" : "failed"),
    resultCode: transaction.status || result?.message || null,
    responseMessage: result?.message || transaction.status || null,
    transactionId: transaction.id || fallbackId,
    processor,
    amount: transaction.amount || null,
    currency: transaction.currencyIsoCode || null,
    raw: {
      success: result?.success,
      message: result?.message || null,
      transaction
    }
  };
}

async function checkoutNonce(payload = {}) {
  const gateway = getGateway();
  const nonce = payload.paymentMethodNonce || payload.nonce;
  if (!nonce) throw inputError("paymentMethodNonce is required");
  const operation = String(payload.operation || "sale").toLowerCase();
  const config = getBraintreeConfig();
  const submitForSettlement = payload.submitForSettlement === undefined
    ? operation !== "auth" && operation !== "authorize"
    : Boolean(payload.submitForSettlement);
  const request = removeEmptyFields({
    amount: normalizeAmount(payload.amount),
    paymentMethodNonce: nonce,
    deviceData: payload.deviceData,
    merchantAccountId: payload.merchantAccountId || config.merchantAccountId || undefined,
    orderId: payload.orderId || payload.reference,
    options: {
      submitForSettlement
    }
  });
  const result = await runGateway((done) => gateway.transaction.sale(request, done));
  return normalizeGatewayTransaction(result, `braintree_${operation}`);
}

async function submitPaymentMutation(mutationName, payload, processor) {
  const paymentMethodId = payload.paymentMethodId || payload.nonce || payload.token || (await tokenizeCreditCard(payload)).paymentMethodId;
  if (!paymentMethodId) throw inputError("paymentMethodId is required");
  const query = `
    mutation RunBraintreePayment($input: ${mutationName}Input!) {
      ${mutationName.charAt(0).toLowerCase()}${mutationName.slice(1)}(input: $input) {
        transaction {
          id
          status
          amount { value currencyCode }
        }
      }
    }
  `;
  const result = await graphqlRequest(query, { input: transactionInput(payload, paymentMethodId) });
  return normalizeTransaction(result.body?.data?.[`${mutationName.charAt(0).toLowerCase()}${mutationName.slice(1)}`], processor);
}

async function captureTransaction(payload) {
  const transactionId = payload.transactionId || payload.retref;
  if (!transactionId) throw inputError("transactionId is required");
  const query = `
    mutation CaptureBraintreeTransaction($input: CaptureTransactionInput!) {
      captureTransaction(input: $input) {
        transaction { id status amount { value currencyCode } }
      }
    }
  `;
  const result = await graphqlRequest(query, {
    input: removeEmptyFields({
      transactionId,
      amount: payload.amount ? normalizeAmount(payload.amount) : undefined
    })
  });
  return normalizeTransaction(result.body?.data?.captureTransaction, "braintree_capture", transactionId);
}

async function refundTransaction(payload) {
  const transactionId = payload.transactionId || payload.retref;
  if (!transactionId) throw inputError("transactionId is required");
  const query = `
    mutation RefundBraintreeTransaction($input: RefundTransactionInput!) {
      refundTransaction(input: $input) {
        refund { id status amount { value currencyCode } }
      }
    }
  `;
  const result = await graphqlRequest(query, {
    input: removeEmptyFields({
      transactionId,
      amount: payload.amount ? normalizeAmount(payload.amount) : undefined
    })
  });
  return normalizeTransaction(result.body?.data?.refundTransaction, "braintree_refund", transactionId);
}

async function voidTransaction(payload) {
  const transactionId = payload.transactionId || payload.retref;
  if (!transactionId) throw inputError("transactionId is required");
  const query = `
    mutation ReverseBraintreeTransaction($input: ReverseTransactionInput!) {
      reverseTransaction(input: $input) {
        reversal { id status amount { value currencyCode } }
      }
    }
  `;
  const result = await graphqlRequest(query, { input: { transactionId } });
  return normalizeTransaction(result.body?.data?.reverseTransaction, "braintree_void", transactionId);
}

async function verifyCard(payload) {
  const tokenized = await tokenizeCreditCard(payload);
  return {
    status: tokenized.paymentMethodId ? "approved" : "failed",
    resultCode: tokenized.paymentMethodId ? "TOKENIZED" : "TOKENIZE_FAILED",
    responseMessage: tokenized.paymentMethodId ? "Braintree payment method tokenized" : "Tokenization failed",
    transactionId: tokenized.paymentMethodId,
    processor: "braintree_verification",
    card: tokenized.card,
    raw: tokenized.raw
  };
}

module.exports = {
  authorizeCard: (payload) => submitPaymentMutation("AuthorizePaymentMethod", payload, "braintree_authorize"),
  captureTransaction,
  checkoutNonce,
  generateClientToken,
  getStatus,
  refundTransaction,
  saleCard: (payload) => submitPaymentMutation("ChargePaymentMethod", payload, "braintree_sale"),
  testConnection,
  tokenizeCreditCard,
  verifyCard,
  voidTransaction
};
