const crypto = require("crypto");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { getProviderConfig } = require("../providers");
const { validateCardInput } = require("./cardValidationService");

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
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
  const config = getProviderConfig("globalpayments");
  const missing = [];
  const mode = String(config.mode || "ucp").toLowerCase();
  if (mode === "ucp" && !config.appId) missing.push("GLOBALPAYMENTS_APP_ID or GLOBALPAYMENTS_PUBLIC_API_KEY");
  if (!config.appKey) missing.push("GLOBALPAYMENTS_APP_KEY or GLOBALPAYMENTS_SECRET_API_KEY");

  return {
    configured: missing.length === 0,
    mode,
    baseUrl: config.baseUrl,
    merchantConfigured: Boolean(config.merchantId),
    siteConfigured: Boolean(config.siteId),
    deviceConfigured: Boolean(config.deviceId),
    website: config.website || null,
    keyType: config.keyType || null,
    accountName: config.accountName,
    channel: config.channel,
    country: config.country,
    version: config.version,
    timeoutMs: config.timeoutMs,
    missing
  };
}

function getConfig() {
  const config = getProviderConfig("globalpayments");
  const status = getStatus();
  if (!status.configured) {
    throw inputError(`Missing ${status.missing.join(", ")}`);
  }

  return {
    mode: status.mode,
    baseUrl: String(config.baseUrl || (status.mode === "portico" ? "https://cert.api2.heartlandportico.com/Hps.Exchange.PosGateway/PosGatewayService.asmx" : "https://apis.sandbox.globalpay.com/ucp")).replace(/\/+$/, ""),
    appId: String(config.appId || "").trim(),
    appKey: String(config.appKey).trim(),
    merchantId: String(config.merchantId || "").trim(),
    siteId: String(config.siteId || "").trim(),
    deviceId: String(config.deviceId || "").trim(),
    developerId: String(config.developerId || "000000").trim(),
    versionNumber: String(config.versionNumber || "0000").trim(),
    keyType: String(config.keyType || "").trim(),
    accountName: String(config.accountName || "Transaction_Processing").trim(),
    channel: String(config.channel || "CNP").trim().toUpperCase(),
    country: String(config.country || "US").trim().toUpperCase(),
    version: String(config.version || "2021-03-22").trim(),
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 180000
  };
}

function requirePositiveInteger(value, fieldName) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw inputError(`${fieldName} must be a positive integer in cents`);
  }
  return amount;
}

function expiryYearTwoDigits(expYear) {
  const rawYear = String(expYear || "");
  const year = rawYear.length === 2 ? rawYear : rawYear.slice(-2);
  if (!/^\d{2}$/.test(year)) {
    throw inputError("expYear is required");
  }
  return year;
}

function buildPaymentMethod(payload) {
  if (payload.paymentMethod && typeof payload.paymentMethod === "object") {
    return { paymentMethod: payload.paymentMethod, card: null };
  }

  const token = payload.token || payload.providerPaymentToken || payload.paymentMethodId;
  if (token) {
    return {
      paymentMethod: removeEmptyFields({
        id: token,
        name: payload.cardholderName || payload.name,
        entry_mode: payload.entryMode || "ECOM"
      }),
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
    paymentMethod: removeEmptyFields({
      name: payload.cardholderName || payload.name,
      entry_mode: payload.entryMode || "ECOM",
      storage_mode: payload.storageMode,
      card: {
        number: validation.normalizedPan,
        expiry_month: String(payload.expMonth).padStart(2, "0"),
        expiry_year: expiryYearTwoDigits(payload.expYear),
        cvv: payload.cvc || payload.cvv || payload.cvv2,
        cvv_indicator: payload.cvc || payload.cvv || payload.cvv2 ? "PRESENT" : undefined,
        avs_address: payload.billingAddressLine1 || payload.street,
        avs_postal_code: payload.billingZip || payload.zip || payload.postalCode
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

function buildBaseRequest(payload) {
  const config = getConfig();
  const { paymentMethod, card } = buildPaymentMethod(payload);

  return {
    config,
    card,
    request: removeEmptyFields({
      account_name: payload.accountName || config.accountName,
      channel: payload.channel || config.channel,
      amount: payload.amount == null ? undefined : String(requirePositiveInteger(payload.amount, "amount")),
      currency: String(payload.currency || "USD").toUpperCase(),
      reference: payload.reference || payload.orderId || uuidv4(),
      country: String(payload.country || config.country).toUpperCase(),
      capture_mode: payload.captureMode,
      description: payload.description,
      ip_address: payload.ipAddress,
      payment_method: paymentMethod
    })
  };
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlElement(name, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

function amountToDollars(value, fieldName = "amount") {
  return (requirePositiveInteger(value, fieldName) / 100).toFixed(2);
}

function expiryYearFourDigits(expYear) {
  const rawYear = String(expYear || "");
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  if (!/^\d{4}$/.test(year)) {
    throw inputError("expYear is required");
  }
  return year;
}

function parseCardholderName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || undefined,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined
  };
}

function buildPorticoCardData(payload) {
  const token = payload.token || payload.providerPaymentToken || payload.paymentMethodId;
  const tokenRequest = payload.tokenRequest || payload.requestToken || payload.storageMode === "ON_SUCCESS" ? "Y" : "N";
  if (token) {
    return {
      xml: [
        "<CardData>",
        "<TokenData>",
        xmlElement("TokenValue", token),
        "<CardPresent>N</CardPresent>",
        "<ReaderPresent>N</ReaderPresent>",
        "</TokenData>",
        "<TokenRequest>N</TokenRequest>",
        "</CardData>"
      ].join(""),
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
    xml: [
      "<CardData>",
      "<ManualEntry>",
      xmlElement("CardNbr", validation.normalizedPan),
      xmlElement("ExpMonth", String(payload.expMonth).padStart(2, "0")),
      xmlElement("ExpYear", expiryYearFourDigits(payload.expYear)),
      "<CardPresent>N</CardPresent>",
      "<ReaderPresent>N</ReaderPresent>",
      xmlElement("CVV2", payload.cvc || payload.cvv || payload.cvv2),
      "</ManualEntry>",
      xmlElement("TokenRequest", tokenRequest),
      "</CardData>"
    ].join(""),
    card: {
      first6: validation.first6,
      last4: validation.last4,
      brand: validation.brand,
      maskedPan: validation.maskedPan
    }
  };
}

function buildPorticoCardholderData(payload) {
  const { firstName, lastName } = parseCardholderName(payload.cardholderName || payload.name);
  return [
    "<CardHolderData>",
    xmlElement("CardHolderFirstName", firstName),
    xmlElement("CardHolderLastName", lastName),
    xmlElement("CardHolderAddr", payload.billingAddressLine1 || payload.street),
    xmlElement("CardHolderCity", payload.billingCity || payload.city),
    xmlElement("CardHolderState", payload.billingState || payload.state),
    xmlElement("CardHolderZip", payload.billingZip || payload.zip || payload.postalCode),
    "</CardHolderData>"
  ].join("");
}

function buildPorticoEnvelope(config, transactionXml, clientTxnId = uuidv4()) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    "<soap:Body>",
    '<PosRequest xmlns="http://Hps.Exchange.PosGateway">',
    "<Ver1.0>",
    "<Header>",
    xmlElement("SecretAPIKey", config.appKey),
    xmlElement("SiteTrace", clientTxnId.slice(0, 16)),
    xmlElement("DeveloperID", config.developerId),
    xmlElement("VersionNbr", config.versionNumber),
    xmlElement("ClientTxnId", clientTxnId),
    "</Header>",
    "<Transaction>",
    transactionXml,
    "</Transaction>",
    "</Ver1.0>",
    "</PosRequest>",
    "</soap:Body>",
    "</soap:Envelope>"
  ].join("");
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlTag(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[^:>]+:)?${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : null;
}

function parsePorticoResponse(xml) {
  return {
    gatewayRspCode: xmlTag(xml, "GatewayRspCode"),
    gatewayRspMsg: xmlTag(xml, "GatewayRspMsg"),
    rspCode: xmlTag(xml, "RspCode"),
    rspText: xmlTag(xml, "RspText"),
    authCode: xmlTag(xml, "AuthCode"),
    avsResult: xmlTag(xml, "AVSRsltCode") || xmlTag(xml, "AVSRsltText"),
    cvvResult: xmlTag(xml, "CVVRsltCode") || xmlTag(xml, "CVVRsltText"),
    transactionId: xmlTag(xml, "GatewayTxnId"),
    clientTxnId: xmlTag(xml, "ClientTxnId"),
    tokenValue: xmlTag(xml, "TokenValue"),
    rawStatus: xmlTag(xml, "Status") || xmlTag(xml, "TxnStatus")
  };
}

async function submitPorticoTransaction(transactionXml, { clientTxnId } = {}) {
  const config = getConfig();
  const response = await axios.post(
    config.baseUrl,
    buildPorticoEnvelope(config, transactionXml, clientTxnId),
    {
      headers: {
        "content-type": "text/xml; charset=utf-8",
        SOAPAction: ""
      },
      timeout: config.timeoutMs
    }
  );

  return {
    body: parsePorticoResponse(response.data),
    correlationId: response.headers["x-request-id"] || null
  };
}

function summarizePorticoTransaction({ body, correlationId }, { card = null, amount = null, currency = "USD", processor = "globalpayments_portico_transaction" } = {}) {
  const success = body.gatewayRspCode === "0" && (!body.rspCode || ["00", "0", "85"].includes(body.rspCode));
  return {
    status: success ? "approved" : "declined",
    resultCode: body.rspCode || body.gatewayRspCode || null,
    responseMessage: body.rspText || body.gatewayRspMsg || null,
    transactionId: body.transactionId || null,
    type: processor,
    gatewayStatus: body.gatewayRspCode || null,
    processor,
    authCode: body.authCode || null,
    avsResult: body.avsResult || null,
    cvvResult: body.cvvResult || null,
    amount,
    currency,
    correlationId: correlationId || body.clientTxnId || null,
    card,
    providerPaymentToken: body.tokenValue || null,
    raw: removeEmptyFields({
      gatewayRspCode: body.gatewayRspCode,
      gatewayRspMsg: body.gatewayRspMsg,
      rspCode: body.rspCode,
      rspText: body.rspText,
      authCode: body.authCode,
      avsResult: body.avsResult,
      cvvResult: body.cvvResult,
      transactionId: body.transactionId,
      clientTxnId: body.clientTxnId,
      tokenValue: body.tokenValue ? "[present]" : null
    })
  };
}

async function submitPorticoCardOperation(payload, transactionName, { amount, processor } = {}) {
  const { xml: cardData, card } = buildPorticoCardData(payload);
  const transactionXml = [
    `<${transactionName}>`,
    "<Block1>",
    transactionName === "CreditSale" || transactionName === "CreditAuth"
      ? "<AllowDup>Y</AllowDup><AllowPartialAuth>N</AllowPartialAuth>"
      : "",
    amount ? xmlElement("Amt", amount) : "",
    buildPorticoCardholderData(payload),
    cardData,
    "</Block1>",
    `</${transactionName}>`
  ].join("");
  const result = await submitPorticoTransaction(transactionXml, { clientTxnId: payload.idempotencyKey || payload.reference || payload.orderId });
  return summarizePorticoTransaction(result, {
    card,
    amount: amount ? Math.round(Number(amount) * 100) : null,
    currency: String(payload.currency || "USD").toUpperCase(),
    processor
  });
}

async function submitPorticoReferenceOperation(payload, transactionName, { processor } = {}) {
  if (!payload.transactionId) throw inputError("transactionId is required");
  const referenceFields = [
    xmlElement("GatewayTxnId", payload.transactionId),
    payload.amount == null ? "" : xmlElement("Amt", amountToDollars(payload.amount))
  ].join("");
  const transactionXml = transactionName === "CreditAddToBatch"
    ? [`<${transactionName}>`, referenceFields, `</${transactionName}>`].join("")
    : [`<${transactionName}>`, "<Block1>", referenceFields, "</Block1>", `</${transactionName}>`].join("");
  const result = await submitPorticoTransaction(transactionXml, { clientTxnId: payload.idempotencyKey || payload.reference || payload.orderId });
  return summarizePorticoTransaction(result, {
    amount: payload.amount == null ? null : requirePositiveInteger(payload.amount, "amount"),
    currency: String(payload.currency || "USD").toUpperCase(),
    processor
  });
}

function extractAccessToken(data) {
  return data?.token || data?.access_token || data?.accessToken || data?.data?.token || data?.data?.access_token || null;
}

async function createAccessToken() {
  const config = getConfig();
  const nonce = uuidv4().replace(/-/g, "");
  const secret = crypto.createHash("sha512").update(`${nonce}${config.appKey}`).digest("hex");
  const response = await axios.post(`${config.baseUrl}/accesstoken`, {
    app_id: config.appId,
    nonce,
    secret,
    grant_type: "client_credentials"
  }, {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "X-GP-Version": config.version
    },
    timeout: config.timeoutMs
  });

  const token = extractAccessToken(response.data);
  if (!token) {
    throw inputError("Global Payments access token response did not include a token");
  }
  return {
    token,
    raw: response.data,
    correlationId: response.headers["x-gp-correlation-id"] || response.headers["x-correlation-id"] || null
  };
}

async function submitRequest(method, pathname, data, { idempotencyKey } = {}) {
  const config = getConfig();
  const access = await createAccessToken();
  const response = await axios({
    method,
    url: `${config.baseUrl}${pathname}`,
    data,
    headers: removeEmptyFields({
      accept: "application/json",
      authorization: `Bearer ${access.token}`,
      "content-type": "application/json",
      "X-GP-Version": config.version,
      "X-GP-Idempotency": idempotencyKey || uuidv4()
    }),
    timeout: config.timeoutMs
  });

  return {
    body: response.data,
    correlationId: response.headers["x-gp-correlation-id"] || response.headers["x-correlation-id"] || access.correlationId || null
  };
}

function mapStatus(status, successStatuses = []) {
  const normalized = String(status || "").toUpperCase();
  if (successStatuses.includes(normalized)) return "approved";
  if (["DECLINED", "NOT_VERIFIED", "REJECTED"].includes(normalized)) return "declined";
  if (["FAILED", "ERROR"].includes(normalized)) return "failed";
  if (normalized) return normalized.toLowerCase();
  return "unknown";
}

function paymentCard(data) {
  return data?.payment_method?.card || data?.payment_method?.card_details || {};
}

function summarizeTransaction({ body, correlationId }, { card = null, processor = "globalpayments_transaction" } = {}) {
  const gpCard = paymentCard(body);
  return {
    status: mapStatus(body?.status, ["CAPTURED", "PREAUTHORIZED", "SUCCESS", "VERIFIED"]),
    resultCode: body?.action?.result_code || body?.payment_method?.result || null,
    responseMessage: body?.payment_method?.message || body?.action?.result_code || null,
    transactionId: body?.id || null,
    type: body?.type || null,
    gatewayStatus: body?.status || null,
    processor,
    authCode: gpCard.authcode || null,
    avsResult: gpCard.avs_postal_code_result || gpCard.avs_address_result || null,
    cvvResult: gpCard.cvv_result || null,
    amount: body?.amount ?? null,
    currency: body?.currency || null,
    correlationId,
    card: card || {
      maskedPan: gpCard.masked_number_last4 || null,
      brand: gpCard.brand || null
    },
    raw: body
  };
}

function summarizeVerification({ body, correlationId }, { card = null } = {}) {
  const gpCard = paymentCard(body);
  return {
    status: mapStatus(body?.status, ["VERIFIED"]),
    resultCode: body?.action?.result_code || body?.payment_method?.result || null,
    responseMessage: body?.payment_method?.message || body?.action?.result_code || null,
    transactionId: body?.id || null,
    type: "verification",
    gatewayStatus: body?.status || null,
    processor: "globalpayments_verification",
    authCode: gpCard.authcode || null,
    avsResult: gpCard.avs_postal_code_result || gpCard.avs_address_result || null,
    cvvResult: gpCard.cvv_result || null,
    amount: null,
    currency: body?.currency || null,
    correlationId,
    card: card || {
      maskedPan: gpCard.masked_number_last4 || null,
      brand: gpCard.brand || null
    },
    raw: body
  };
}

async function saleCard(payload) {
  if (getConfig().mode === "portico") {
    return submitPorticoCardOperation(payload, "CreditSale", {
      amount: amountToDollars(payload.amount, "amount"),
      processor: "globalpayments_portico_sale"
    });
  }

  const { request, card } = buildBaseRequest({
    ...payload,
    captureMode: payload.captureMode || "AUTO"
  });
  const result = await submitRequest("post", "/transactions", {
    ...request,
    type: "SALE"
  }, { idempotencyKey: payload.idempotencyKey });
  return summarizeTransaction(result, { card, processor: "globalpayments_sale" });
}

async function authorizeCard(payload) {
  if (getConfig().mode === "portico") {
    return submitPorticoCardOperation(payload, "CreditAuth", {
      amount: amountToDollars(payload.amount, "amount"),
      processor: "globalpayments_portico_authorize"
    });
  }

  const { request, card } = buildBaseRequest({
    ...payload,
    captureMode: payload.captureMode || "LATER"
  });
  const result = await submitRequest("post", "/transactions", {
    ...request,
    type: "SALE"
  }, { idempotencyKey: payload.idempotencyKey });
  return summarizeTransaction(result, { card, processor: "globalpayments_authorize" });
}

async function verifyCard(payload) {
  if (getConfig().mode === "portico") {
    return submitPorticoCardOperation(payload, "CreditAccountVerify", {
      processor: "globalpayments_portico_verification"
    });
  }

  const { request, card } = buildBaseRequest(payload);
  const result = await submitRequest("post", "/verifications", request, { idempotencyKey: payload.idempotencyKey });
  return summarizeVerification(result, { card });
}

async function captureTransaction({ transactionId, amount, gratuityAmount, reference, description, idempotencyKey }) {
  if (getConfig().mode === "portico") {
    return submitPorticoReferenceOperation({ transactionId, amount, reference, description, idempotencyKey }, "CreditAddToBatch", {
      processor: "globalpayments_portico_capture"
    });
  }

  if (!transactionId) throw inputError("transactionId is required");
  const result = await submitRequest("post", `/transactions/${encodeURIComponent(transactionId)}/capture`, removeEmptyFields({
    amount: amount == null ? undefined : String(requirePositiveInteger(amount, "amount")),
    gratuity_amount: gratuityAmount == null ? undefined : String(Number(gratuityAmount)),
    reference,
    description
  }), { idempotencyKey });
  return summarizeTransaction(result, { processor: "globalpayments_capture" });
}

async function refundTransaction({ transactionId, amount, reference, description, idempotencyKey }) {
  if (getConfig().mode === "portico") {
    return submitPorticoReferenceOperation({ transactionId, amount, reference, description, idempotencyKey }, "CreditReturn", {
      processor: "globalpayments_portico_refund"
    });
  }

  if (!transactionId) throw inputError("transactionId is required");
  const result = await submitRequest("post", `/transactions/${encodeURIComponent(transactionId)}/refund`, removeEmptyFields({
    amount: amount == null ? undefined : String(requirePositiveInteger(amount, "amount")),
    reference,
    description
  }), { idempotencyKey });
  return summarizeTransaction(result, { processor: "globalpayments_refund" });
}

async function reverseTransaction({ transactionId, amount, reference, description, idempotencyKey }) {
  if (getConfig().mode === "portico") {
    return submitPorticoReferenceOperation({ transactionId, amount, reference, description, idempotencyKey }, "CreditVoid", {
      processor: "globalpayments_portico_void"
    });
  }

  if (!transactionId) throw inputError("transactionId is required");
  const result = await submitRequest("post", `/transactions/${encodeURIComponent(transactionId)}/reversal`, removeEmptyFields({
    amount: amount == null ? undefined : String(requirePositiveInteger(amount, "amount")),
    reference,
    description
  }), { idempotencyKey });
  return summarizeTransaction(result, { processor: "globalpayments_reversal" });
}

async function getTransaction(transactionId) {
  if (!transactionId) throw inputError("transactionId is required");
  if (getConfig().mode === "portico") {
    throw inputError("Portico transaction fetch requires the Portico reporting API; use local provider logs for stored transaction attempts");
  }

  const result = await submitRequest("get", `/transactions/${encodeURIComponent(transactionId)}`);
  return summarizeTransaction(result, { processor: "globalpayments_get_transaction" });
}

async function testConnection() {
  const config = getConfig();
  if (config.mode === "portico") {
    await axios.get(`${config.baseUrl}?op=DoTransaction`, { timeout: config.timeoutMs });
    return {
      ok: true,
      configured: true,
      mode: "portico",
      baseUrl: config.baseUrl,
      responseMessage: "Portico endpoint reachable; Secret API Key is validated during card operations"
    };
  }

  const result = await createAccessToken();
  return {
    ok: Boolean(result.token),
    configured: true,
    mode: "ucp",
    baseUrl: config.baseUrl,
    responseMessage: "Access token created",
    correlationId: result.correlationId
  };
}

module.exports = {
  authorizeCard,
  captureTransaction,
  getStatus,
  getTransaction,
  refundTransaction,
  reverseTransaction,
  saleCard,
  testConnection,
  verifyCard
};
