const fs = require("fs");
const path = require("path");
const Client = require("@amazonpay/amazon-pay-api-sdk-nodejs");
const { v4: uuidv4 } = require("uuid");
const { getProviderConfig } = require("../providers");

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

function normalizeAmount(value, fallback, fieldName = "amount") {
  const raw = value === undefined || value === null || value === "" ? fallback : value;
  const amount = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw inputError(`${fieldName} must be a positive decimal amount`);
  }
  return amount.toFixed(2);
}

function normalizeStringList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeStringList(parsed, fallback);
    } catch (_) {}
    return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return fallback;
}

function normalizeObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      throw inputError("deliverySpecifications must be valid JSON");
    }
  }
  return null;
}

function loadPrivateKey(config) {
  if (config.privateKey) {
    return String(config.privateKey).replace(/\\n/g, "\n");
  }
  if (config.privateKeyBase64) {
    return Buffer.from(String(config.privateKeyBase64), "base64").toString("utf8");
  }
  if (config.privateKeyFile) {
    const keyPath = path.isAbsolute(config.privateKeyFile)
      ? config.privateKeyFile
      : path.resolve(process.cwd(), config.privateKeyFile);
    return fs.readFileSync(keyPath, "utf8");
  }
  return "";
}

function getStatus() {
  const config = getProviderConfig("amazonpay");
  const missing = [];
  if (!config.storeId) missing.push("AMAZON_PAY_STORE_ID");
  if (!config.merchantId) missing.push("AMAZON_PAY_MERCHANT_ID");
  if (!config.publicKeyId) missing.push("AMAZON_PAY_PUBLIC_KEY_ID or AMAZON_PAY_APIKEY");
  if (!(config.privateKey || config.privateKeyBase64 || config.privateKeyFile)) {
    missing.push("AMAZON_PAY_PRIVATE_KEY or AMAZON_PAY_PRIVATE_KEY_BASE64 or AMAZON_PAY_PRIVATE_KEY_FILE");
  }

  return {
    configured: missing.length === 0,
    storeConfigured: Boolean(config.storeId),
    merchantConfigured: Boolean(config.merchantId),
    publicKeyConfigured: Boolean(config.publicKeyId),
    privateKeyConfigured: Boolean(config.privateKey || config.privateKeyBase64 || config.privateKeyFile),
    region: config.region,
    sandbox: config.sandbox,
    ledgerCurrency: config.currency,
    authAmount: config.authAmount,
    timeoutMs: config.timeoutMs,
    testChargePermissionConfigured: Boolean(config.testChargePermissionId),
    missing
  };
}

function getLegacyWidgetStatus() {
  const config = getProviderConfig("amazonpay");
  const missing = [];
  if (!config.legacySellerId) missing.push("AMAZON_SELLER_ID or AMAZON_PAY_LEGACY_SELLER_ID");
  if (!config.legacyAccessKey) missing.push("AMAZON_MWS_KEY_ID or AMAZON_PAY_LEGACY_ACCESS_KEY");
  if (!config.legacyLwaClientId) missing.push("AMAZON_CLIENT_ID or AMAZON_PAY_STORE_ID or AMAZON_PAY_LEGACY_LWA_CLIENT_ID");
  if (!config.legacyReturnUrl) missing.push("AMAZON_PAY_LEGACY_RETURN_URL");
  if (!config.legacyCancelReturnUrl) missing.push("AMAZON_PAY_LEGACY_CANCEL_RETURN_URL");
  if (!config.legacySignature) missing.push("AMAZON_PAY_LEGACY_SIGNATURE");
  return {
    configured: missing.length === 0,
    sellerConfigured: Boolean(config.legacySellerId),
    accessKeyConfigured: Boolean(config.legacyAccessKey),
    lwaClientConfigured: Boolean(config.legacyLwaClientId),
    secretAccessKeyConfigured: Boolean(config.legacySecretAccessKey),
    signatureConfigured: Boolean(config.legacySignature),
    returnUrl: config.legacyReturnUrl || null,
    cancelReturnUrl: config.legacyCancelReturnUrl || null,
    missing
  };
}

function getLegacyWidgetConfig(payload = {}) {
  const config = getProviderConfig("amazonpay");
  const status = getLegacyWidgetStatus();
  if (!status.configured) {
    throw inputError(`Missing Amazon Pay legacy widget configuration: ${status.missing.join(", ")}`);
  }
  const amount = normalizeAmount(payload.amount, payload.amount || "1.00");
  return {
    scriptUrl: "https://static-na.payments-amazon.com/OffAmazonPayments/us/js/Widgets.js",
    widgetType: "expressPaymentButton",
    signature: payload.signature || config.legacySignature,
    sellerId: config.legacySellerId,
    accessKey: config.legacyAccessKey,
    lwaClientId: config.legacyLwaClientId,
    returnUrl: payload.returnUrl || config.legacyReturnUrl,
    cancelReturnUrl: payload.cancelReturnUrl || config.legacyCancelReturnUrl,
    currencyCode: String(payload.currency || config.currency || "USD").toUpperCase(),
    amount,
    note: payload.note || "",
    shippingAddressRequired: payload.shippingAddressRequired === true ? "true" : "false",
    paymentAction: payload.paymentAction || "Authorize"
  };
}

function getConfig() {
  const config = getProviderConfig("amazonpay");
  const status = getStatus();
  if (!status.configured) {
    throw inputError(`Missing Amazon Pay configuration: ${status.missing.join(", ")}`);
  }
  return {
    storeId: String(config.storeId).trim(),
    merchantId: String(config.merchantId).trim(),
    publicKeyId: String(config.publicKeyId).trim(),
    privateKey: loadPrivateKey(config),
    region: String(config.region || "us").trim().toLowerCase(),
    sandbox: Boolean(config.sandbox),
    algorithm: config.algorithm || "",
    currency: String(config.currency || "USD").trim().toUpperCase(),
    authAmount: normalizeAmount(config.authAmount, "0.20", "AMAZON_PAY_AUTH_AMOUNT"),
    checkoutReviewReturnUrl: String(config.checkoutReviewReturnUrl || "").trim(),
    checkoutResultReturnUrl: String(config.checkoutResultReturnUrl || "").trim(),
    testChargePermissionId: String(config.testChargePermissionId || "").trim(),
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 180000
  };
}

function client() {
  const config = getConfig();
  return {
    config,
    webStoreClient: new Client.WebStoreClient({
      publicKeyId: config.publicKeyId,
      privateKey: config.privateKey,
      region: config.region,
      sandbox: config.sandbox,
      ...(config.algorithm ? { algorithm: config.algorithm } : {})
    })
  };
}

function idempotencyHeaders(value) {
  return {
    "x-amz-pay-idempotency-key": String(value || uuidv4()).replace(/-/g, "")
  };
}

function responseData(response) {
  return response?.data || response || {};
}

function normalizeChargeResponse(data, request, operation) {
  const statusDetails = data.statusDetails || {};
  const amount = data.chargeAmount?.amount || data.captureAmount?.amount || request?.chargeAmount?.amount || request?.captureAmount?.amount || null;
  return {
    status: ["Authorized", "Captured", "Chargeable", "Open"].includes(statusDetails.state) ? "approved" : String(statusDetails.state || data.status || "submitted").toLowerCase(),
    resultCode: statusDetails.reasonCode || data.reasonCode || null,
    responseMessage: statusDetails.reasonDescription || statusDetails.state || "Amazon Pay request submitted",
    transactionId: data.chargeId || data.refundId || data.chargePermissionId || null,
    chargeId: data.chargeId || null,
    chargePermissionId: data.chargePermissionId || request?.chargePermissionId || null,
    refundId: data.refundId || null,
    amount,
    currency: data.chargeAmount?.currencyCode || data.captureAmount?.currencyCode || request?.chargeAmount?.currencyCode || request?.captureAmount?.currencyCode || null,
    providerStatus: statusDetails.state || data.status || null,
    providerReasonCode: statusDetails.reasonCode || null,
    providerResponse: data,
    request,
    type: operation
  };
}

function normalizeChargePermissionResponse(data, request = {}, operation = "charge_permission_detail") {
  const statusDetails = data.statusDetails || {};
  const providerState = statusDetails.state || null;
  const status = ["Chargeable", "Open"].includes(providerState)
    ? "verified"
    : ["Closed", "Canceled", "Cancelled", "Declined"].includes(providerState)
      ? "declined"
      : providerState
        ? "review"
        : "submitted";
  return {
    status,
    resultCode: statusDetails.reasonCode || null,
    responseMessage: statusDetails.reasonDescription || statusDetails.state || "Amazon Pay charge permission fetched",
    transactionId: data.chargePermissionId || request.chargePermissionId || null,
    chargePermissionId: data.chargePermissionId || request.chargePermissionId || null,
    providerStatus: statusDetails.state || null,
    providerReasonCode: statusDetails.reasonCode || null,
    providerResponse: data,
    request,
    type: operation
  };
}

function chargePermissionIdFrom(payload) {
  return payload.chargePermissionId ||
    payload.providerPaymentToken ||
    payload.source ||
    payload.token ||
    payload.amazonChargePermissionId;
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

async function createCheckoutSession(payload = {}) {
  const { config, webStoreClient } = client();
  const checkoutReviewReturnUrl = payload.checkoutReviewReturnUrl || config.checkoutReviewReturnUrl;
  const checkoutResultReturnUrl = payload.checkoutResultReturnUrl || config.checkoutResultReturnUrl;
  if (!checkoutReviewReturnUrl || !checkoutResultReturnUrl) {
    throw inputError("checkoutReviewReturnUrl and checkoutResultReturnUrl are required for Amazon Pay checkout session");
  }
  const scopes = normalizeStringList(payload.scopes, ["name", "email", "phoneNumber", "billingAddress"]);
  const deliverySpecifications = normalizeObject(payload.deliverySpecifications);
  const request = removeEmptyFields({
    webCheckoutDetails: {
      checkoutReviewReturnUrl,
      checkoutResultReturnUrl
    },
    storeId: payload.storeId || config.storeId,
    scopes,
    deliverySpecifications,
    paymentDetails: {
      paymentIntent: payload.paymentIntent || "Authorize",
      canHandlePendingAuthorization: payload.canHandlePendingAuthorization === true,
      chargeAmount: {
        amount: normalizeAmount(payload.amount, config.authAmount),
        currencyCode: String(payload.currency || config.currency).toUpperCase()
      }
    },
    merchantMetadata: {
      merchantReferenceId: payload.reference || payload.orderId || uuidv4(),
      merchantStoreName: payload.storeName,
      noteToBuyer: payload.noteToBuyer,
      customInformation: payload.customInformation
    }
  });
  const response = await webStoreClient.createCheckoutSession(request, idempotencyHeaders(payload.idempotencyKey));
  const data = responseData(response);
  return {
    status: "submitted",
    responseMessage: "Amazon Pay checkout session created",
    checkoutSessionId: data.checkoutSessionId,
    webCheckoutDetails: data.webCheckoutDetails || null,
    providerResponse: data,
    request
  };
}

async function completeCheckoutSession(payload = {}) {
  const { config, webStoreClient } = client();
  const checkoutSessionId = payload.checkoutSessionId || payload.sessionId;
  if (!checkoutSessionId) {
    throw inputError("checkoutSessionId is required");
  }
  const request = removeEmptyFields({
    chargeAmount: {
      amount: normalizeAmount(payload.amount, config.authAmount),
      currencyCode: String(payload.currency || config.currency).toUpperCase()
    }
  });
  const response = await webStoreClient.completeCheckoutSession(checkoutSessionId, request);
  const data = responseData(response);
  return {
    status: data.statusDetails?.state ? String(data.statusDetails.state).toLowerCase() : "submitted",
    resultCode: data.statusDetails?.reasonCode || null,
    responseMessage: data.statusDetails?.reasonDescription || data.statusDetails?.state || "Amazon Pay checkout session completed",
    checkoutSessionId: data.checkoutSessionId || checkoutSessionId,
    chargePermissionId: data.chargePermissionId || null,
    chargeId: data.chargeId || null,
    transactionId: data.chargeId || data.chargePermissionId || data.checkoutSessionId || checkoutSessionId,
    amount: request.chargeAmount.amount,
    currency: request.chargeAmount.currencyCode,
    providerStatus: data.statusDetails?.state || null,
    providerResponse: data,
    request,
    type: "complete_checkout_session"
  };
}

async function verifyCard(payload = {}) {
  return getChargePermission(payload);
}

async function authorizeCard(payload = {}) {
  const { config, webStoreClient } = client();
  const chargePermissionId = chargePermissionIdFrom(payload);
  if (!chargePermissionId) {
    throw inputError("chargePermissionId is required for Amazon Pay auth");
  }
  const request = removeEmptyFields({
    chargePermissionId,
    chargeAmount: {
      amount: normalizeAmount(payload.amount, config.authAmount),
      currencyCode: String(payload.currency || config.currency).toUpperCase()
    },
    captureNow: false,
    canHandlePendingAuthorization: payload.canHandlePendingAuthorization === true,
    softDescriptor: payload.softDescriptor,
    merchantMetadata: {
      merchantReferenceId: payload.reference || payload.orderId || uuidv4(),
      merchantStoreName: payload.storeName,
      noteToBuyer: payload.noteToBuyer,
      customInformation: payload.customInformation
    }
  });
  const response = await webStoreClient.createCharge(request, idempotencyHeaders(payload.idempotencyKey));
  return normalizeChargeResponse(responseData(response), request, "auth");
}

async function saleCard(payload = {}) {
  const { config, webStoreClient } = client();
  const chargePermissionId = chargePermissionIdFrom(payload);
  if (!chargePermissionId) {
    throw inputError("chargePermissionId is required for Amazon Pay sale");
  }
  const request = removeEmptyFields({
    chargePermissionId,
    chargeAmount: {
      amount: normalizeAmount(payload.amount, config.authAmount),
      currencyCode: String(payload.currency || config.currency).toUpperCase()
    },
    captureNow: true,
    canHandlePendingAuthorization: payload.canHandlePendingAuthorization === true,
    softDescriptor: payload.softDescriptor,
    merchantMetadata: {
      merchantReferenceId: payload.reference || payload.orderId || uuidv4(),
      merchantStoreName: payload.storeName,
      noteToBuyer: payload.noteToBuyer,
      customInformation: payload.customInformation
    }
  });
  const response = await webStoreClient.createCharge(request, idempotencyHeaders(payload.idempotencyKey));
  return normalizeChargeResponse(responseData(response), request, "sale");
}

async function captureTransaction(payload = {}) {
  const { config, webStoreClient } = client();
  const chargeId = payload.chargeId || payload.transactionId || payload.retref;
  if (!chargeId) {
    throw inputError("transactionId or chargeId is required");
  }
  const request = removeEmptyFields({
    captureAmount: {
      amount: normalizeAmount(payload.amount, config.authAmount),
      currencyCode: String(payload.currency || config.currency).toUpperCase()
    },
    softDescriptor: payload.softDescriptor
  });
  const response = await webStoreClient.captureCharge(chargeId, request, idempotencyHeaders(payload.idempotencyKey));
  return normalizeChargeResponse(responseData(response), request, "capture");
}

async function refundTransaction(payload = {}) {
  const { config, webStoreClient } = client();
  const chargeId = payload.chargeId || payload.transactionId || payload.retref;
  if (!chargeId) {
    throw inputError("transactionId or chargeId is required");
  }
  const request = removeEmptyFields({
    chargeId,
    refundAmount: {
      amount: normalizeAmount(payload.amount, config.authAmount),
      currencyCode: String(payload.currency || config.currency).toUpperCase()
    },
    softDescriptor: payload.softDescriptor
  });
  const response = await webStoreClient.createRefund(request, idempotencyHeaders(payload.idempotencyKey));
  return normalizeChargeResponse(responseData(response), request, "refund");
}

async function voidTransaction(payload = {}) {
  const { webStoreClient } = client();
  const chargeId = payload.chargeId || payload.transactionId || payload.retref;
  if (!chargeId) {
    throw inputError("transactionId or chargeId is required");
  }
  const request = removeEmptyFields({
    cancellationReason: payload.reason || payload.note || "Auth check cancelled"
  });
  const response = await webStoreClient.cancelCharge(chargeId, request);
  return normalizeChargeResponse(responseData(response), request, "void");
}

async function getTransaction(transactionId) {
  if (!transactionId) {
    throw inputError("transactionId is required");
  }
  const { webStoreClient } = client();
  const response = await webStoreClient.getCharge(transactionId);
  return normalizeChargeResponse(responseData(response), { transactionId }, "transaction_detail");
}

async function getChargePermission(payload = {}) {
  const chargePermissionId = typeof payload === "string" ? payload : chargePermissionIdFrom(payload);
  if (!chargePermissionId) {
    throw inputError("chargePermissionId is required");
  }
  const { webStoreClient } = client();
  const response = await webStoreClient.getChargePermission(chargePermissionId);
  return normalizeChargePermissionResponse(responseData(response), { chargePermissionId });
}

async function updateChargePermission(payload = {}) {
  const chargePermissionId = chargePermissionIdFrom(payload);
  if (!chargePermissionId) {
    throw inputError("chargePermissionId is required");
  }
  const request = removeEmptyFields({
    merchantMetadata: {
      merchantReferenceId: payload.reference || payload.orderId || payload.merchantReferenceId,
      merchantStoreName: payload.storeName || payload.merchantStoreName,
      noteToBuyer: payload.noteToBuyer || payload.note,
      customInformation: payload.customInformation
    }
  });
  if (!Object.keys(request).length) {
    throw inputError("At least one update field is required");
  }
  const { webStoreClient } = client();
  const response = await webStoreClient.updateChargePermission(chargePermissionId, request, payload.headers || null);
  return normalizeChargePermissionResponse(responseData(response), { chargePermissionId, ...request }, "update_charge_permission");
}

async function closeChargePermission(payload = {}) {
  const chargePermissionId = chargePermissionIdFrom(payload);
  if (!chargePermissionId) {
    throw inputError("chargePermissionId is required");
  }
  const request = removeEmptyFields({
    closureReason: payload.closureReason || payload.reason || payload.note || "No more charges required",
    cancelPendingCharges: booleanValue(payload.cancelPendingCharges, false)
  });
  const { webStoreClient } = client();
  const response = await webStoreClient.closeChargePermission(chargePermissionId, request, payload.headers || null);
  return normalizeChargePermissionResponse(responseData(response), { chargePermissionId, ...request }, "close_charge_permission");
}

async function testConnection(payload = {}) {
  const status = getStatus();
  if (!status.configured) {
    return { ok: false, configured: false, missing: status.missing, responseMessage: "missing configuration" };
  }
  const { config, webStoreClient } = client();
  const chargePermissionId = payload.chargePermissionId || config.testChargePermissionId;
  if (!chargePermissionId) {
    return {
      ok: false,
      configured: true,
      status: "signing_ready",
      responseMessage: "Amazon Pay signing config is loaded; set AMAZON_PAY_TEST_CHARGE_PERMISSION_ID or pass chargePermissionId for a live API probe",
      region: config.region,
      sandbox: config.sandbox,
      storeConfigured: Boolean(config.storeId)
    };
  }
  const result = await getChargePermission(chargePermissionId);
  const data = result.providerResponse || {};
  return {
    ok: true,
    configured: true,
    status: data.statusDetails?.state || "ok",
    responseMessage: data.statusDetails?.reasonDescription || "Amazon Pay charge permission fetched",
    chargePermissionId: data.chargePermissionId || chargePermissionId,
    providerResponse: data
  };
}

module.exports = {
  getStatus,
  getLegacyWidgetStatus,
  getLegacyWidgetConfig,
  testConnection,
  createCheckoutSession,
  completeCheckoutSession,
  authorizeCard,
  verifyCard,
  saleCard,
  captureTransaction,
  refundTransaction,
  voidTransaction,
  getTransaction,
  getChargePermission,
  updateChargePermission,
  closeChargePermission
};
