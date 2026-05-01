const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { getProviderConfig } = require("../providers");
const { validateCardInput } = require("./cardValidationService");

function getPayPalConfig() {
  return getProviderConfig("paypal");
}

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requireRestConfig() {
  const config = getPayPalConfig();
  if (!config.clientId) {
    throw new Error("Missing PAYPAL_CLIENT_ID");
  }
  if (!config.clientSecret) {
    throw new Error("Missing PAYPAL_CLIENT_SECRET");
  }
  return config;
}

function getMissingNvpFields(nvp) {
  return [
    ["PAYPAL_API_USER", nvp.username],
    ["PAYPAL_API_PASSWORD", nvp.password],
    ["PAYPAL_API_SIGNATURE", nvp.signature]
  ].filter(([, value]) => !value).map(([name]) => name);
}

function requireNvpConfig() {
  const config = getPayPalConfig();
  const missing = getMissingNvpFields(config.nvp);
  if (missing.length > 0) {
    throw new Error(`Missing PayPal NVP configuration: ${missing.join(", ")}`);
  }
  return config.nvp;
}

function getMissingManagerFields(manager) {
  return [
    ["PAYPAL_MANAGER_PARTNER", manager.partner],
    ["PAYPAL_MANAGER_VENDOR", manager.vendor],
    ["PAYPAL_MANAGER_USER", manager.user],
    ["PAYPAL_MANAGER_PASSWORD", manager.password]
  ].filter(([, value]) => !value).map(([name]) => name);
}

function requireManagerConfig() {
  const config = getPayPalConfig();
  const missing = getMissingManagerFields(config.manager);
  if (missing.length > 0) {
    throw new Error(`Missing PayPal Manager configuration: ${missing.join(", ")}`);
  }
  return config.manager;
}

function encodePayflowBody(params) {
  return new URLSearchParams(params).toString();
}

function parsePayflowResponse(text) {
  return Object.fromEntries(new URLSearchParams(text));
}

function parseNvpResponse(text) {
  return Object.fromEntries(new URLSearchParams(text));
}

function sanitizePayflowResponse(response) {
  const blocked = new Set(["PWD", "USER", "VENDOR", "PARTNER", "ACCT", "CVV2"]);
  return Object.fromEntries(
    Object.entries(response).filter(([key]) => !blocked.has(key.toUpperCase()))
  );
}

function formatAmount(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw inputError("amount must be a positive number or zero");
  }
  return numericAmount.toFixed(2);
}

function normalizeExpiryParts(expMonth, expYear) {
  const month = String(expMonth || "").padStart(2, "0");
  const rawYear = String(expYear || "");
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^\d{4}$/.test(year)) {
    throw inputError("expMonth and expYear are required");
  }
  return { month, year };
}

function formatPayflowExpiry(expMonth, expYear) {
  const { month, year } = normalizeExpiryParts(expMonth, expYear);
  return `${month}${year.slice(-2)}`;
}

function formatNvpExpiry(expMonth, expYear) {
  const { month, year } = normalizeExpiryParts(expMonth, expYear);
  return `${month}${year}`;
}

function getResultStatus(result) {
  if (result.RESULT === "0") {
    return "approved";
  }
  if (result.RESULT === "126") {
    return "review";
  }
  if (result.RESULT) {
    return "declined";
  }
  return "unknown";
}

function getNvpStatus(result) {
  const ack = String(result.ACK || "").toLowerCase();
  if (ack === "success" || ack === "successwithwarning") {
    return "approved";
  }
  if (ack === "failure" || ack === "failurewithwarning") {
    return "declined";
  }
  return "unknown";
}

function getNvpErrorMessage(result) {
  return result.L_LONGMESSAGE0 || result.L_SHORTMESSAGE0 || result.ACK || null;
}

function getCreditCardType(brand) {
  const normalized = String(brand || "").toLowerCase();
  if (normalized.includes("visa")) return "Visa";
  if (normalized.includes("master")) return "MasterCard";
  if (normalized.includes("amex") || normalized.includes("american")) return "Amex";
  if (normalized.includes("discover")) return "Discover";
  return undefined;
}

function splitCardholderName(payload) {
  const nameParts = String(payload.cardholderName || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: payload.firstName || nameParts[0] || "Card",
    lastName: payload.lastName || nameParts.slice(1).join(" ") || "Holder"
  };
}

function collectNvpErrors(result) {
  return Object.keys(result)
    .filter((key) => key.startsWith("L_ERRORCODE"))
    .map((key) => {
      const index = key.replace("L_ERRORCODE", "");
      return {
        code: result[`L_ERRORCODE${index}`],
        short: result[`L_SHORTMESSAGE${index}`],
        long: result[`L_LONGMESSAGE${index}`],
        severity: result[`L_SEVERITYCODE${index}`]
      };
    });
}

function buildCardTransactionParams({
  pan,
  expMonth,
  expYear,
  cvv2,
  amount,
  invoiceNumber,
  billingAddressLine1,
  billingZip,
  cardholderName,
  firstName,
  lastName,
  comment
}) {
  const validation = validateCardInput({
    pan,
    expMonth,
    expYear,
    cardholderName,
    billingZip
  });

  if (!validation.isValid) {
    throw inputError(`Invalid card input: ${validation.issues.join(", ")}`);
  }
  const params = {
    TENDER: "C",
    ACCT: validation.normalizedPan,
    EXPDATE: formatPayflowExpiry(expMonth, expYear),
    AMT: formatAmount(amount),
    INVNUM: invoiceNumber || uuidv4().replace(/-/g, "").slice(0, 20)
  };

  if (cvv2) {
    params.CVV2 = String(cvv2);
  }
  if (billingAddressLine1) {
    params.BILLTOSTREET = billingAddressLine1;
  }
  if (billingZip) {
    params.BILLTOZIP = billingZip;
  }
  if (firstName) {
    params.BILLTOFIRSTNAME = firstName;
  }
  if (lastName) {
    params.BILLTOLASTNAME = lastName;
  }
  if (cardholderName && !firstName && !lastName) {
    const [derivedFirstName, ...rest] = String(cardholderName).trim().split(/\s+/);
    params.BILLTOFIRSTNAME = derivedFirstName;
    if (rest.length > 0) {
      params.BILLTOLASTNAME = rest.join(" ");
    }
  }
  if (comment) {
    params.COMMENT1 = comment;
  }

  return {
    params,
    card: {
      first6: validation.first6,
      last4: validation.last4,
      brand: validation.brand,
      maskedPan: validation.maskedPan
    }
  };
}

function summarizePayflowResult(result) {
  return {
    resultCode: result.RESULT || null,
    status: getResultStatus(result),
    responseMessage: result.RESPMSG || null,
    pnref: result.PNREF || null,
    authCode: result.AUTHCODE || null,
    avsAddress: result.AVSADDR || null,
    avsZip: result.AVSZIP || null,
    cvv2Match: result.CVV2MATCH || null,
    raw: result
  };
}

async function getAccessToken() {
  const config = requireRestConfig();
  const response = await axios.post(
    `${config.baseUrl}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      auth: {
        username: config.clientId,
        password: config.clientSecret
      },
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      timeout: 15000
    }
  );

  return response.data;
}

async function testRestConnection() {
  const token = await getAccessToken();
  return {
    ok: true,
    tokenType: token.token_type,
    expiresIn: token.expires_in,
    scopeCount: typeof token.scope === "string" ? token.scope.split(" ").filter(Boolean).length : 0
  };
}

function getManagerStatus() {
  const manager = getPayPalConfig().manager;
  const missing = getMissingManagerFields(manager);
  return {
    configured: missing.length === 0,
    baseUrl: manager.baseUrl,
    partner: manager.partner || null,
    vendor: manager.vendor || null,
    user: manager.user || null,
    missing
  };
}

async function submitManagerRequest(params) {
  const manager = requireManagerConfig();
  const response = await axios.post(
    manager.baseUrl,
    encodePayflowBody({
      PARTNER: manager.partner,
      VENDOR: manager.vendor,
      USER: manager.user,
      PWD: manager.password,
      VERBOSITY: "HIGH",
      ...params
    }),
    {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "X-VPS-REQUEST-ID": uuidv4()
      },
      timeout: 30000,
      transformResponse: [(data) => data]
    }
  );

  return sanitizePayflowResponse(parsePayflowResponse(response.data));
}

async function submitNvpRequest(params) {
  const nvp = requireNvpConfig();
  const response = await axios.post(
    nvp.baseUrl,
    new URLSearchParams({
      USER: nvp.username,
      PWD: nvp.password,
      SIGNATURE: nvp.signature,
      VERSION: nvp.version,
      ...params
    }).toString(),
    {
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      timeout: 30000,
      transformResponse: [(data) => data]
    }
  );

  return parseNvpResponse(response.data);
}

function getNvpStatusSummary() {
  const nvp = getPayPalConfig().nvp;
  const missing = getMissingNvpFields(nvp);
  return {
    configured: missing.length === 0,
    baseUrl: nvp.baseUrl,
    username: nvp.username || null,
    missing
  };
}

async function testNvpConnection() {
  const result = await submitNvpRequest({
    METHOD: "GetBalance",
    RETURNALLCURRENCIES: "0"
  });

  const balances = Object.entries(result)
    .filter(([key]) => /^L_AMT\d+$/.test(key))
    .map(([key, amount]) => {
      const index = key.replace("L_AMT", "");
      return {
        amount,
        currency: result[`L_CURRENCYCODE${index}`] || result.CURRENCYCODE || null
      };
    });

  return {
    ok: getNvpStatus(result) === "approved",
    resultCode: result.ACK || null,
    responseMessage: getNvpErrorMessage(result),
    correlationId: result.CORRELATIONID || null,
    accountStatus: getNvpStatus(result),
    balances,
    raw: result
  };
}

async function testManagerConnection() {
  const result = await submitManagerRequest({
    TRXTYPE: "I",
    TENDER: "C",
    ORIGID: "000000000000"
  });

  return {
    ok: result.RESULT === "0",
    resultCode: result.RESULT || null,
    responseMessage: result.RESPMSG || null,
    raw: result
  };
}

async function inquireManagerTransaction({ origId, custRef, startTime, endTime }) {
  if (!origId && !custRef) {
    throw inputError("origId or custRef is required");
  }

  const params = {
    TRXTYPE: "I",
    TENDER: "C"
  };

  if (origId) {
    params.ORIGID = origId;
  }
  if (custRef) {
    params.CUSTREF = custRef;
  }
  if (startTime) {
    params.STARTTIME = startTime;
  }
  if (endTime) {
    params.ENDTIME = endTime;
  }

  return submitManagerRequest(params);
}

async function liveCheckCard(payload) {
  const { params, card } = buildCardTransactionParams({
    ...payload,
    amount: payload.amount ?? 0
  });
  const result = await submitManagerRequest({
    TRXTYPE: "A",
    ...params
  });

  return {
    ...summarizePayflowResult(result),
    checkType: "live_check",
    amount: params.AMT,
    card
  };
}

async function authorizeCardNvp(payload) {
  if (payload.amount == null || Number(payload.amount) < 0) {
    throw inputError("amount is required for authorization");
  }

  const { params, card } = buildCardTransactionParams(payload);
  const { firstName, lastName } = splitCardholderName(payload);
  const creditCardType = getCreditCardType(card.brand);
  const request = {
    METHOD: "DoDirectPayment",
    PAYMENTACTION: payload.paymentAction || "Authorization",
    CREDITCARDTYPE: creditCardType,
    ACCT: params.ACCT,
    EXPDATE: formatNvpExpiry(payload.expMonth, payload.expYear),
    CVV2: payload.cvv || params.CVV2,
    AMT: params.AMT,
    CURRENCYCODE: payload.currency || "USD",
    FIRSTNAME: firstName,
    LASTNAME: lastName,
    STREET: payload.billingAddressLine1 || payload.street || undefined,
    CITY: payload.billingCity || payload.city || undefined,
    STATE: payload.billingState || payload.state || undefined,
    ZIP: payload.billingZip || undefined,
    COUNTRYCODE: payload.billingCountry || "US",
    IPADDRESS: payload.ipAddress || "127.0.0.1",
    INVNUM: params.INVNUM
  };

  const result = await submitNvpRequest(
    Object.fromEntries(Object.entries(request).filter(([, value]) => value != null && value !== ""))
  );

  return {
    resultCode: result.ACK || null,
    status: getNvpStatus(result),
    responseMessage: getNvpErrorMessage(result),
    pnref: result.TRANSACTIONID || null,
    authCode: result.CORRELATIONID || null,
    avsAddress: result.AVSCODE || null,
    avsZip: result.AVSCODE || null,
    cvv2Match: result.CVV2MATCH || null,
    errors: collectNvpErrors(result),
    raw: result,
    checkType: "auth_check",
    processor: "paypal_nvp",
    amount: params.AMT,
    card
  };
}

function getCountryAlpha3(alpha2) {
  const countries = {
    ID: "IDN",
    US: "USA",
    TR: "TUR",
    GB: "GBR",
    CA: "CAN",
    DE: "DEU",
    FR: "FRA"
  };
  return countries[String(alpha2 || "").toUpperCase()] || null;
}

function formatBinDetails(bin, lookup = {}, fallbackBrand = "UNKNOWN") {
  const countryAlpha2 = lookup.country?.alpha2 || null;
  return {
    "BIN/IIN": bin,
    "Card Brand": String(lookup.scheme || fallbackBrand || "UNKNOWN").toUpperCase(),
    "Card Type": String(lookup.type || "API Only").toUpperCase(),
    "Card Level": lookup.brand || "API Only",
    "Issuer Name / Bank": lookup.bank?.name || "API Only",
    "Issuer's / Bank's Website": lookup.bank?.url || "API Only",
    "Issuer / Bank Phone": lookup.bank?.phone || "API Only",
    "Commercial Card?": "API Only",
    "Prepaid Card?": typeof lookup.prepaid === "boolean" ? (lookup.prepaid ? "YES" : "NO") : "API Only",
    "Reloadable Card?": "API Only",
    "ISO Country Name": lookup.country?.name || "API Only",
    "Country Flag": lookup.country?.emoji || lookup.country?.name || "API Only",
    "ISO Country Code A2": countryAlpha2 || "API Only",
    "ISO Country Code A3": getCountryAlpha3(countryAlpha2) || "API Only",
    "ISO Country Currency": lookup.country?.currency || "API Only"
  };
}

async function lookupBinDetails(bin) {
  try {
    const response = await axios.get(`https://lookup.binlist.net/${bin}`, {
      timeout: 8000,
      headers: { accept: "application/json" }
    });
    return response.data || {};
  } catch {
    return {};
  }
}

async function binCheckCard({ pan, bin }) {
  const normalized = String(bin || pan || "").replace(/\D/g, "").slice(0, 6);
  if (normalized.length !== 6) {
    throw inputError("BIN/IIN must be 6 digits");
  }

  const fallbackBrand = normalized.startsWith("4") ? "VISA" : "UNKNOWN";
  const lookup = await lookupBinDetails(normalized);

  return {
    status: "passed",
    bin: normalized,
    details: formatBinDetails(normalized, lookup, fallbackBrand),
    source: Object.keys(lookup).length ? "binlist" : "local_fallback"
  };
}

async function authorizeCard(payload) {
  if (payload.amount == null || Number(payload.amount) <= 0) {
    throw inputError("amount is required for authorization");
  }

  const { params, card } = buildCardTransactionParams(payload);
  const result = await submitManagerRequest({
    TRXTYPE: "A",
    ...params
  });

  return {
    ...summarizePayflowResult(result),
    checkType: "auth_check",
    amount: params.AMT,
    card
  };
}

async function captureAuthorization({
  authorizationPnref,
  amount,
  captureComplete = true
}) {
  if (!authorizationPnref) {
    throw inputError("authorizationPnref is required");
  }
  if (amount == null || Number(amount) <= 0) {
    throw inputError("amount is required for capture");
  }

  const result = await submitManagerRequest({
    TRXTYPE: "D",
    ORIGID: authorizationPnref,
    AMT: formatAmount(amount),
    CAPTURECOMPLETE: captureComplete ? "Y" : "N"
  });

  return {
    ...summarizePayflowResult(result),
    originalPnref: authorizationPnref,
    amount: formatAmount(amount),
    captureComplete: Boolean(captureComplete)
  };
}

async function captureAuthorizationNvp({
  authorizationPnref,
  amount,
  captureComplete = true,
  currency = "USD"
}) {
  if (!authorizationPnref) {
    throw inputError("authorizationPnref is required");
  }
  if (amount == null || Number(amount) <= 0) {
    throw inputError("amount is required for capture");
  }

  const formattedAmount = formatAmount(amount);
  const result = await submitNvpRequest({
    METHOD: "DoCapture",
    AUTHORIZATIONID: authorizationPnref,
    AMT: formattedAmount,
    CURRENCYCODE: currency,
    COMPLETETYPE: captureComplete ? "Complete" : "NotComplete"
  });

  return {
    resultCode: result.ACK || null,
    status: getNvpStatus(result),
    responseMessage: getNvpErrorMessage(result),
    pnref: result.TRANSACTIONID || null,
    authCode: result.CORRELATIONID || null,
    raw: result,
    originalPnref: authorizationPnref,
    amount: formattedAmount,
    captureComplete: Boolean(captureComplete),
    processor: "paypal_nvp"
  };
}

module.exports = {
  authorizeCard,
  authorizeCardNvp,
  binCheckCard,
  captureAuthorization,
  captureAuthorizationNvp,
  getNvpStatus: getNvpStatusSummary,
  getManagerStatus,
  inquireManagerTransaction,
  liveCheckCard,
  testNvpConnection,
  testManagerConnection,
  testRestConnection
};
