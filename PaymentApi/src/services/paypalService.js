const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { getProviderConfig } = require("../providers");
const { validateCardInput } = require("./cardValidationService");
const { getProviderMessage } = require("../utils/errorUtils");

const RAPIDAPI_BIN_CHECKER_HOST =
  process.env.RAPIDAPI_BIN_CHECKER_HOST || "bin-ip-checker.p.rapidapi.com";
const RAPIDAPI_BIN_CHECKER_URL =
  process.env.RAPIDAPI_BIN_CHECKER_URL || `https://${RAPIDAPI_BIN_CHECKER_HOST}/`;
const BIN_CHECKER_FALLBACK_URL =
  process.env.BIN_CHECKER_FALLBACK_URL || "https://lookup.binlist.net";

function getPayPalConfig() {
  return getProviderConfig("paypal");
}

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requireRapidApiBinCheckerKey() {
  const apiKey = process.env.RAPIDAPI_BIN_CHECKER_KEY || process.env.X_RAPIDAPI_KEY;
  if (!apiKey) {
    throw inputError("Missing RAPIDAPI_BIN_CHECKER_KEY");
  }
  return apiKey;
}

function getRapidApiBinCheckerKey() {
  return process.env.RAPIDAPI_BIN_CHECKER_KEY || process.env.X_RAPIDAPI_KEY || null;
}

function getMissingNvpFields(nvp) {
  return [
    ["PAYPAL_API_USERNAME", nvp.username],
    ["PAYPAL_API_PASSWORD", nvp.password],
    ["PAYPAL_API_SIGNATURE", nvp.signature]
  ].filter(([, value]) => !value).map(([name]) => name);
}

function requireNvpConfig() {
  const nvp = getPayPalConfig().nvp;
  const missing = getMissingNvpFields(nvp);
  if (missing.length > 0) {
    throw inputError(`Missing PayPal NVP/SOAP configuration: ${missing.join(", ")}`);
  }
  return {
    baseUrl: String(nvp.baseUrl || "").trim(),
    username: String(nvp.username || "").trim(),
    password: String(nvp.password || "").trim(),
    signature: String(nvp.signature || "").trim(),
    version: String(nvp.version || "204.0").trim()
  };
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
  const manager = getPayPalConfig().manager;
  const missing = getMissingManagerFields(manager);
  if (missing.length > 0) {
    throw inputError(`Missing PayPal Manager configuration: ${missing.join(", ")}`);
  }
  return manager;
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

function getNestedValue(source, path) {
  return path.split(".").reduce((value, key) => {
    if (value == null) {
      return undefined;
    }
    return value[key];
  }, source);
}

function pickFirst(source, paths, fallback = null) {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return fallback;
}

function firstMeaningful(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "string" && ["api only", "unknown", "null", "undefined"].includes(value.trim().toLowerCase())) continue;
    return value;
  }
  return null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function yesNo(value) {
  const normalized = normalizeBoolean(value);
  if (normalized !== null) {
    return normalized ? "YES" : "NO";
  }
  return value || "API Only";
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

function getBinPayload(responseData) {
  return responseData?.BIN || responseData?.bin || responseData?.data || responseData?.result || responseData || {};
}

function getIpPayload(responseData) {
  return responseData?.IP || responseData?.ip || {};
}

function cleanDetailValue(value) {
  if (typeof value === "string") {
    return value.replace(/\r/g, "").trim();
  }
  return value;
}

function formatBinDetails(bin, responseData) {
  const lookup = getBinPayload(responseData);
  const countryAlpha2 = firstMeaningful(pickFirst(lookup, ["country.alpha2", "country.code", "country.alpha_2", "country_code", "alpha2"]));
  const countryAlpha3 = firstMeaningful(pickFirst(lookup, ["country.alpha3", "country.alpha_3", "country_code3", "alpha3"]), getCountryAlpha3(countryAlpha2));
  const countryName = firstMeaningful(pickFirst(lookup, ["country.name", "country", "country_name"]));
  const bankName = firstMeaningful(pickFirst(lookup, ["issuer.name", "bank.name", "issuer_name", "issuer", "bank"]));
  const scheme = firstMeaningful(pickFirst(lookup, ["scheme", "network", "card_scheme", "brand"]));
  const brand = firstMeaningful(pickFirst(lookup, ["brand", "card_brand", "scheme", "network"]));
  const type = firstMeaningful(pickFirst(lookup, ["type", "card_type", "funding"]));
  const level = firstMeaningful(pickFirst(lookup, ["level", "category", "product.name", "product", "card_level"]));
  const currency = firstMeaningful(pickFirst(lookup, ["currency", "country.currency", "currency_code"]));

  return {
    "BIN/IIN": String(pickFirst(lookup, ["number", "bin"], bin)),
    "BIN Length": pickFirst(lookup, ["length"], String(bin).length),
    "Card Scheme": scheme ? String(scheme).toUpperCase() : "API Only",
    "Card Brand": brand ? String(brand).toUpperCase() : "API Only",
    "Card Type": type ? String(type).toUpperCase() : "API Only",
    "Card Level": level || "API Only",
    "Commercial Card?": yesNo(pickFirst(lookup, ["is_commercial", "commercial"], null)),
    "Prepaid Card?": yesNo(pickFirst(lookup, ["is_prepaid", "prepaid"], null)),
    "Reloadable Card?": yesNo(pickFirst(lookup, ["reloadable", "is_reloadable"], null)),
    "Card Currency": currency || "API Only",
    "Issuer Name / Bank": bankName || "API Only",
    "Issuer's / Bank's Website": pickFirst(lookup, ["issuer.website", "bank.url", "bank.website"], "API Only"),
    "Issuer / Bank Phone": pickFirst(lookup, ["issuer.phone", "bank.phone"], "API Only"),
    "ISO Country Name": countryName || "API Only",
    "Country Native Name": pickFirst(lookup, ["country.native"], "API Only"),
    "Country Flag": pickFirst(lookup, ["country.flag", "country.emoji"], "API Only"),
    "Country Numeric Code": pickFirst(lookup, ["country.numeric"], "API Only"),
    "Country Capital": pickFirst(lookup, ["country.capital"], "API Only"),
    "ISO Country Code A2": countryAlpha2 || "API Only",
    "ISO Country Code A3": countryAlpha3 || "API Only",
    "ISO Country Currency": pickFirst(lookup, ["country.currency"], "API Only"),
    "Country Currency Name": pickFirst(lookup, ["country.currency_name"], "API Only"),
    "Country Currency Symbol": pickFirst(lookup, ["country.currency_symbol"], "API Only"),
    "Country Region": pickFirst(lookup, ["country.region"], "API Only"),
    "Country Subregion": pickFirst(lookup, ["country.subregion"], "API Only"),
    "Country IDD": pickFirst(lookup, ["country.idd"], "API Only"),
    "Country Language": pickFirst(lookup, ["country.language"], "API Only"),
    "Country Language Code": pickFirst(lookup, ["country.language_code"], "API Only")
  };
}

function summarizeBinDetails(bin, responseData) {
  const lookup = getBinPayload(responseData);
  const details = formatBinDetails(bin, responseData);
  return {
    bin: details["BIN/IIN"],
    country: firstMeaningful(details["ISO Country Name"], details["ISO Country Code A2"], pickFirst(lookup, ["country", "country_name"])),
    countryCode: firstMeaningful(details["ISO Country Code A2"], pickFirst(lookup, ["country.code", "country.alpha2", "alpha2"])),
    issuer: firstMeaningful(details["Issuer Name / Bank"], pickFirst(lookup, ["issuer", "bank"])),
    scheme: firstMeaningful(details["Card Scheme"], details["Card Brand"]),
    brand: firstMeaningful(details["Card Brand"], details["Card Scheme"]),
    type: firstMeaningful(details["Card Type"], pickFirst(lookup, ["funding"])),
    level: firstMeaningful(details["Card Level"], pickFirst(lookup, ["product", "category"])),
    commercial: firstMeaningful(details["Commercial Card?"], pickFirst(lookup, ["commercial", "is_commercial"])),
    prepaid: firstMeaningful(details["Prepaid Card?"], pickFirst(lookup, ["prepaid", "is_prepaid"])),
    currency: firstMeaningful(details["Card Currency"], details["ISO Country Currency"]),
    usefulLabel: [
      firstMeaningful(details["ISO Country Name"], details["ISO Country Code A2"]),
      firstMeaningful(details["Issuer Name / Bank"]),
      firstMeaningful(details["Card Level"]),
      firstMeaningful(details["Card Type"]),
      firstMeaningful(details["Card Scheme"], details["Card Brand"])
    ].filter(Boolean).join(" / ")
  };
}

function formatIpDetails(responseData) {
  const lookup = getIpPayload(responseData);
  const proxy = lookup.proxy || {};

  return Object.fromEntries(Object.entries({
    "IP Address": pickFirst(lookup, ["IP", "address"], "API Only"),
    "IP Version": pickFirst(lookup, ["ip_version"], "API Only"),
    "Valid IP?": yesNo(pickFirst(lookup, ["valid"], null)),
    "BIN/IP Country Match?": yesNo(pickFirst(lookup, ["IP_BIN_match"], null)),
    "BIN/IP Match Message": pickFirst(lookup, ["IP_BIN_match_message"], "API Only"),
    "Country Code": pickFirst(lookup, ["alpha2"], "API Only"),
    "Country Flag": pickFirst(lookup, ["flag"], "API Only"),
    "Country": pickFirst(lookup, ["country"], "API Only"),
    "Region": pickFirst(lookup, ["region"], "API Only"),
    "City": pickFirst(lookup, ["city"], "API Only"),
    "Latitude": pickFirst(lookup, ["latitude"], "API Only"),
    "Longitude": pickFirst(lookup, ["longitude"], "API Only"),
    "ZIP Code": pickFirst(lookup, ["zip_code"], "API Only"),
    "ISP": pickFirst(lookup, ["isp"], "API Only"),
    "ASN": pickFirst(lookup, ["asn"], "API Only"),
    "Time Zone": pickFirst(lookup, ["time_zone"], "API Only"),
    "Current Time": pickFirst(lookup, ["current_time"], "API Only"),
    "Proxy?": yesNo(pickFirst(lookup, ["is_proxy"], null)),
    "Proxy Type": pickFirst(proxy, ["type"], "API Only"),
    "Proxy Country": pickFirst(proxy, ["country_name"], "API Only"),
    "Proxy Region": pickFirst(proxy, ["region_name"], "API Only"),
    "Proxy City": pickFirst(proxy, ["city_name"], "API Only"),
    "Proxy ISP": pickFirst(proxy, ["isp"], "API Only"),
    "Proxy Domain": pickFirst(proxy, ["domain"], "API Only"),
    "Proxy Usage": pickFirst(proxy, ["usage_type"], "API Only"),
    "Proxy AS": pickFirst(proxy, ["as"], "API Only"),
    "Proxy Last Seen": pickFirst(proxy, ["last_seen"], "API Only"),
    "Proxy Threat": pickFirst(proxy, ["threat"], "API Only"),
    "Proxy Provider": pickFirst(proxy, ["provider"], "API Only")
  }).map(([key, value]) => [key, cleanDetailValue(value)]));
}

async function binCheckCard({ pan, bin, ip }) {
  const normalized = String(bin || pan || "").replace(/\D/g, "").slice(0, 6);
  if (normalized.length !== 6) {
    throw inputError("BIN/IIN must be 6 digits");
  }
  const lookupIp = String(ip || "").trim();
  const requestBody = lookupIp
    ? { bin: normalized, ip: lookupIp }
    : { bin: normalized };
  const requestParams = lookupIp
    ? { bin: normalized, ip: lookupIp }
    : { bin: normalized };

  let response;
  const rapidApiKey = getRapidApiBinCheckerKey();
  try {
    if (!rapidApiKey) {
      throw inputError("Missing RAPIDAPI_BIN_CHECKER_KEY");
    }
    response = await axios.post(RAPIDAPI_BIN_CHECKER_URL, requestBody, {
      params: requestParams,
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": RAPIDAPI_BIN_CHECKER_HOST,
        "x-rapidapi-key": rapidApiKey
      },
      timeout: 15000
    });
  } catch (rapidApiError) {
    try {
      const fallback = await axios.get(`${BIN_CHECKER_FALLBACK_URL.replace(/\/+$/, "")}/${normalized}`, {
        headers: { accept: "application/json" },
        timeout: 15000
      });
      const fallbackData = {
        data: {
          number: fallback.data?.number?.iin || normalized,
          length: fallback.data?.number?.length || normalized.length,
          scheme: fallback.data?.scheme,
          brand: fallback.data?.brand,
          type: fallback.data?.type,
          is_prepaid: fallback.data?.prepaid,
          country: {
            name: fallback.data?.country?.name,
            alpha2: fallback.data?.country?.alpha2,
            currency: fallback.data?.country?.currency,
            emoji: fallback.data?.country?.emoji
          },
          bank: {
            name: fallback.data?.bank?.name,
            website: fallback.data?.bank?.url,
            phone: fallback.data?.bank?.phone
          }
        }
      };
      return {
        status: "passed",
        bin: normalized,
        ip: lookupIp || null,
        summary: summarizeBinDetails(normalized, fallbackData),
        details: formatBinDetails(normalized, fallbackData),
        ipDetails: lookupIp ? formatIpDetails({}) : null,
        source: "binlist_fallback",
        providerWarning: getProviderMessage(rapidApiError),
        raw: fallback.data || {}
      };
    } catch (fallbackError) {
      const providerMessage = getProviderMessage(rapidApiError);
      return {
        status: "failed",
        bin: normalized,
        ip: lookupIp || null,
        responseMessage: providerMessage,
        failureReason: providerMessage,
        resultCode: rapidApiError?.response?.status === 429 ? "RAPIDAPI_QUOTA_EXCEEDED" : "BIN_CHECK_FAILED",
        providerStatus: rapidApiError?.response?.status || null,
        fallbackError: getProviderMessage(fallbackError),
        summary: summarizeBinDetails(normalized, {}),
        details: formatBinDetails(normalized, {}),
        ipDetails: lookupIp ? formatIpDetails({}) : null,
        source: "rapidapi_bin_ip_checker",
        raw: rapidApiError?.response?.data || null
      };
    }
  }

  const responseData = response.data || {};
  const lookup = getBinPayload(responseData);
  const valid = normalizeBoolean(pickFirst(lookup, ["valid", "is_valid"], true));
  const success = normalizeBoolean(pickFirst(responseData, ["success"], true));
  const code = Number(responseData.code || response.status || 200);

  return {
    status: valid === false || success === false || code >= 400 ? "failed" : "passed",
    bin: normalized,
    ip: lookupIp || null,
    summary: summarizeBinDetails(normalized, responseData),
    details: formatBinDetails(normalized, responseData),
    ipDetails: lookupIp ? formatIpDetails(responseData) : null,
    source: "rapidapi_bin_ip_checker",
    raw: responseData
  };
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
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw inputError("amount must be a positive number");
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

function formatNvpExpiry(expMonth, expYear) {
  const { month, year } = normalizeExpiryParts(expMonth, expYear);
  return `${month}${year}`;
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

function buildDirectPaymentRequest(payload, paymentAction) {
  const validation = validateCardInput({
    pan: payload.pan || payload.cardNumber,
    expMonth: payload.expMonth,
    expYear: payload.expYear,
    cardholderName: payload.cardholderName,
    billingZip: payload.billingZip || payload.zip
  });

  if (!validation.isValid) {
    throw inputError(`Invalid card input: ${validation.issues.join(", ")}`);
  }

  const { firstName, lastName } = splitCardholderName(payload);
  const amount = formatAmount(payload.amount);

  return {
    request: removeEmptyFields({
      METHOD: "DoDirectPayment",
      PAYMENTACTION: paymentAction,
      CREDITCARDTYPE: payload.cardType || getCreditCardType(validation.brand),
      ACCT: validation.normalizedPan,
      EXPDATE: formatNvpExpiry(payload.expMonth, payload.expYear),
      CVV2: payload.cvv2 || payload.cvv,
      AMT: amount,
      CURRENCYCODE: payload.currency || "USD",
      FIRSTNAME: firstName,
      LASTNAME: lastName,
      STREET: payload.billingAddressLine1 || payload.street,
      CITY: payload.billingCity || payload.city,
      STATE: payload.billingState || payload.state,
      ZIP: payload.billingZip || payload.zip,
      COUNTRYCODE: payload.billingCountry || payload.countryCode || "US",
      IPADDRESS: payload.ipAddress || "127.0.0.1",
      INVNUM: payload.invoiceNumber || uuidv4().replace(/-/g, "").slice(0, 20),
      CUSTOM: payload.cardId || undefined,
      COMMENT1: payload.comment
    }),
    amount,
    card: {
      first6: validation.first6,
      last4: validation.last4,
      brand: validation.brand,
      maskedPan: validation.maskedPan
    }
  };
}

function removeEmptyFields(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
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

async function submitManagerRequest(params) {
  const manager = requireManagerConfig();
  const response = await axios.post(
    manager.baseUrl,
    new URLSearchParams({
      PARTNER: manager.partner,
      VENDOR: manager.vendor,
      USER: manager.user,
      PWD: manager.password,
      VERBOSITY: "HIGH",
      ...params
    }).toString(),
    {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "X-VPS-REQUEST-ID": uuidv4()
      },
      timeout: 30000,
      transformResponse: [(data) => data]
    }
  );

  return sanitizePayflowResponse(parseNvpResponse(response.data));
}

function summarizeDirectPaymentResult(result, { amount, card, checkType, processor = "paypal_nvp_directpayment" } = {}) {
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
    checkType,
    processor,
    amount,
    card
  };
}

async function directPaymentCard(payload, paymentAction) {
  const { request, amount, card } = buildDirectPaymentRequest(payload, paymentAction);
  const result = await submitNvpRequest(request);
  return summarizeDirectPaymentResult(result, {
    amount,
    card,
    checkType: paymentAction === "Sale" ? "sale_check" : "auth_check"
  });
}

async function saleCardNvp(payload) {
  return directPaymentCard(payload, "Sale");
}

async function authorizeCardNvp(payload) {
  return directPaymentCard(payload, "Authorization");
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
    errors: collectNvpErrors(result),
    raw: result,
    originalPnref: authorizationPnref,
    amount: formattedAmount,
    captureComplete: Boolean(captureComplete),
    processor: "paypal_nvp_docapture"
  };
}

async function voidAuthorizationNvp({ authorizationPnref, note }) {
  if (!authorizationPnref) {
    throw inputError("authorizationPnref is required");
  }

  const result = await submitNvpRequest(removeEmptyFields({
    METHOD: "DoVoid",
    AUTHORIZATIONID: authorizationPnref,
    NOTE: note
  }));

  return {
    resultCode: result.ACK || null,
    status: getNvpStatus(result),
    responseMessage: getNvpErrorMessage(result),
    pnref: result.AUTHORIZATIONID || authorizationPnref,
    authCode: result.CORRELATIONID || null,
    errors: collectNvpErrors(result),
    raw: result,
    originalPnref: authorizationPnref,
    processor: "paypal_nvp_dovoid"
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

async function testRestConnection() {
  const config = getPayPalConfig();
  if (!config.clientId || !config.clientSecret) {
    throw inputError("Missing PayPal REST client configuration");
  }

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

  return {
    ok: true,
    tokenType: response.data.token_type,
    expiresIn: response.data.expires_in,
    scopeCount: typeof response.data.scope === "string"
      ? response.data.scope.split(" ").filter(Boolean).length
      : 0
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

  return submitManagerRequest(removeEmptyFields({
    TRXTYPE: "I",
    TENDER: "C",
    ORIGID: origId,
    CUSTREF: custRef,
    STARTTIME: startTime,
    ENDTIME: endTime
  }));
}

async function liveCheckCard(payload) {
  return authorizeCardNvp({
    ...payload,
    amount: payload.amount || 1
  });
}

module.exports = {
  authorizeCardNvp,
  binCheckCard,
  captureAuthorizationNvp,
  getManagerStatus,
  getNvpStatus: getNvpStatusSummary,
  inquireManagerTransaction,
  liveCheckCard,
  saleCardNvp,
  testManagerConnection,
  testNvpConnection,
  testRestConnection,
  voidAuthorizationNvp
};
