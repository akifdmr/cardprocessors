const axios = require("axios");
const { getProviderConfig } = require("../providers");

function getEcommerceBaseUrl() {
  const config = getProviderConfig("clover");
  return config.ecommerceBaseUrl || "https://scl.clover.com";
}

function getTokenBaseUrl() {
  const config = getProviderConfig("clover");
  return config.tokenBaseUrl || "https://token.clover.com";
}

function getCloverConfig() {
  const config = getProviderConfig("clover");
  if (!config.merchantId) {
    throw new Error("Missing CLOVER_MERCHANT_ID");
  }
  if (!config.apiKey) {
    throw new Error("Missing CLOVER_API_TOKEN or CLOVER_API_KEY");
  }
  return config;
}

function getPublicCloverConfig() {
  const config = getProviderConfig("clover");
  if (!config.publicToken) {
    throw new Error("Missing CLOVER_PUBLIC_TOKEN");
  }
  return config;
}

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function cloverGet(pathname, params = {}) {
  const config = getCloverConfig();
  const response = await axios.get(
    `${config.baseUrl}/v3/merchants/${config.merchantId}${pathname}`,
    {
      params,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      timeout: 15000
    }
  );

  return response.data;
}

async function cloverEcommerceGet(pathname, params = {}) {
  const config = getCloverConfig();
  const response = await axios.get(
    `${getEcommerceBaseUrl()}${pathname}`,
    {
      params,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      timeout: 15000
    }
  );

  return response.data;
}

async function testConnection() {
  let platform = {
    ok: false,
    error: null
  };

  try {
    const merchant = await cloverGet("");
    platform = {
      ok: true,
      merchantId: merchant.id,
      merchantName: merchant.name
    };
  } catch (error) {
    platform = {
      ok: false,
      status: error.response?.status || null,
      error: error.response?.data?.message || error.message
    };
  }

  try {
    const charges = await cloverEcommerceGet("/v1/charges", { limit: 1 });
    const count = Array.isArray(charges.data) ? charges.data.length : 0;
    return {
      ok: true,
      ecommerce: {
        ok: true,
        baseUrl: getEcommerceBaseUrl(),
        object: charges.object || null,
        chargeCount: count,
        hasMore: Boolean(charges.has_more)
      },
      platform
    };
  } catch (error) {
    return {
      ok: false,
      ecommerce: {
        ok: false,
        baseUrl: getEcommerceBaseUrl(),
        status: error.response?.status || null,
        error: error.response?.data?.message || error.message
      },
      platform
    };
  }
}

function getIframeConfig() {
  const config = getProviderConfig("clover");
  const missing = [];
  if (!config.merchantId) missing.push("CLOVER_MERCHANT_ID");
  if (!config.publicToken) missing.push("CLOVER_PUBLIC_TOKEN");
  if (!config.apiKey) missing.push("CLOVER_API_TOKEN");

  return {
    configured: missing.length === 0,
    missing,
    merchantId: config.merchantId || null,
    apiAccessKey: config.publicToken || null,
    tokenApiBaseUrl: getTokenBaseUrl(),
    ecommerceApiBaseUrl: getEcommerceBaseUrl(),
    sdkUrl: process.env.CLOVER_IFRAME_SDK_URL || "https://checkout.clover.com/sdk.js",
    locale: process.env.CLOVER_LOCALE || "en-US"
  };
}

async function getCharges(limit = 20) {
  return cloverEcommerceGet("/v1/charges", { limit });
}

async function tokenizeCard(payload = {}) {
  const config = getPublicCloverConfig();
  const pan = String(payload.pan || payload.number || "").replace(/\D/g, "");
  const expMonth = String(payload.expMonth || payload.exp_month || "").padStart(2, "0");
  const expYear = String(payload.expYear || payload.exp_year || "");
  const cvv = String(payload.cvv || payload.cvv2 || payload.cvc || "");

  if (!pan) {
    throw inputError("pan is required");
  }
  if (!expMonth || !expYear) {
    throw inputError("expMonth and expYear are required");
  }
  if (!cvv) {
    throw inputError("cvv is required");
  }

  const response = await axios.post(
    `${getTokenBaseUrl()}/v1/tokens`,
    {
      card: {
        number: pan,
        first6: pan.slice(0, 6),
        last4: pan.slice(-4),
        exp_month: expMonth,
        exp_year: expYear.length === 2 ? `20${expYear}` : expYear,
        cvv,
        ...(payload.brand ? { brand: payload.brand } : {})
      }
    },
    {
      headers: {
        accept: "application/json",
        apikey: config.publicToken,
        "content-type": "application/json"
      },
      timeout: 15000
    }
  );

  const token = response.data?.id;
  if (!token) {
    throw new Error("Clover tokenization did not return a source token");
  }

  return {
    source: token,
    object: response.data?.object || null,
    card: response.data?.card || {},
    tokenApiBaseUrl: getTokenBaseUrl()
  };
}

async function testPlatformConnection() {
  const merchant = await cloverGet("");
  return {
    ok: true,
    merchantId: merchant.id,
    merchantName: merchant.name
  };
}

async function getMerchant() {
  return cloverGet("");
}

async function listOrders(limit = 20) {
  return cloverGet("/orders", { limit });
}

async function listPayments(limit = 20) {
  return cloverGet("/payments", {
    limit,
    expand: "cardTransaction"
  });
}

async function listTenders() {
  return cloverGet("/tenders");
}

async function createPreAuthorization({ source, amount, currency = "usd" }) {
  const config = getCloverConfig();

  if (!source) {
    throw new Error("source is required");
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("amount must be a positive integer in cents");
  }

  const response = await axios.post(
    `${getEcommerceBaseUrl()}/v1/charges`,
    {
      source,
      amount,
      currency: String(currency).toLowerCase(),
      capture: false
    },
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json"
      },
      timeout: 15000
    }
  );

  return response.data;
}

function normalizeFraudChecks(charge) {
  const source = charge?.source || {};
  return {
    cvcCheck: source.cvc_check || charge?.cvc_check || null,
    addressLine1Check: source.address_line1_check || charge?.address_line1_check || null,
    addressZipCheck: source.address_zip_check || charge?.address_zip_check || null
  };
}

async function verifyCard({ source }) {
  getCloverConfig();
  if (!source) {
    throw new Error("source is required");
  }

  return {
    status: String(source).startsWith("clv_") ? "token_ready" : "review",
    verificationMode: "token_only",
    submittedToClover: false,
    sourceToken: `${String(source).slice(0, 6)}...${String(source).slice(-4)}`,
    message: "Preauth is disabled for verification. Use Clover tokenization to create the source token; authorize/preauth is a separate operation.",
    fraudChecks: {
      cvcCheck: null,
      addressLine1Check: null,
      addressZipCheck: null
    }
  };
}

async function refundOrder({
  orderId,
  amount,
  currency = "usd"
}) {
  const config = getCloverConfig();

  if (!orderId) {
    throw new Error("orderId is required");
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("amount must be a positive integer in cents");
  }

  const response = await axios.post(
    `${getEcommerceBaseUrl()}/v1/orders/${orderId}/returns`,
    {
      refund_amounts: [
        {
          amount,
          currency: String(currency).toLowerCase()
        }
      ]
    },
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json"
      },
      timeout: 15000
    }
  );

  return response.data;
}

module.exports = {
  createPreAuthorization,
  getCharges,
  getIframeConfig,
  getMerchant,
  listOrders,
  listPayments,
  listTenders,
  refundOrder,
  testConnection,
  testPlatformConnection,
  tokenizeCard,
  verifyCard
};
