const axios = require("axios");
const { getProviderConfig } = require("../providers");

const OPERATION_PATHS = {
  sale: "sale",
  charge: "sale",
  authorize: "authorize",
  auth: "authorize",
  ach: "ach",
  ach_sale: "ach",
  echeck: "ach",
  verification: "verification",
  verify: "verification",
  capture: "capture",
  refund: "refund",
  void: "void",
  reversal: "void",
  transaction: "transaction",
  transaction_detail: "transaction"
};

const PATH_ENV_NAMES = {
  sale: "PROPELRPAY_SALE_PATH",
  authorize: "PROPELRPAY_AUTH_PATH",
  verification: "PROPELRPAY_VERIFY_PATH",
  capture: "PROPELRPAY_CAPTURE_PATH",
  refund: "PROPELRPAY_REFUND_PATH",
  void: "PROPELRPAY_VOID_PATH",
  transaction: "PROPELRPAY_TRANSACTION_PATH"
};

const TRANSACTION_OPERATIONS = new Set(["capture", "refund", "void", "reversal"]);
const ACH_OPERATIONS = new Set(["ach", "ach_sale", "echeck"]);

const STORED_CREDENTIAL_SCENARIOS = {
  one_time_online_purchase: {
    label: "One-Time Online Purchase",
    ecomind: "E",
    cof: "C",
    cofscheduled: "N",
    profile: "Y",
    cofpermission: "Y"
  },
  one_time_phone_purchase: {
    label: "One-Time Phone Purchase",
    ecomind: "T",
    cof: "C",
    cofscheduled: "N",
    profile: "Y",
    cofpermission: "Y"
  },
  one_time_phone_stored_profile: {
    label: "One-Time Phone Purchase with Stored Profile",
    ecomind: "T",
    cof: "C",
    cofscheduled: "N"
  },
  online_one_time_zero_auth: {
    label: "Online One-Time $0 Authorization",
    ecomind: "E",
    cof: "C",
    cofscheduled: "N",
    profile: "Y",
    cofpermission: "Y",
    amount: "0.00",
    allowZeroAmount: true
  },
  online_subscription_zero_auth: {
    label: "Online Subscription $0 Authorization",
    ecomind: "R",
    cof: "M",
    cofscheduled: "N",
    profile: "Y",
    cofpermission: "Y",
    amount: "0.00",
    allowZeroAmount: true
  },
  online_subscription_initial_payment: {
    label: "Online Subscription Initial Payment",
    ecomind: "R",
    cof: "M",
    cofscheduled: "Y",
    profile: "Y",
    cofpermission: "Y"
  },
  online_subscription_returning_customer: {
    label: "Online Subscription Returning Customer",
    ecomind: "R",
    cof: "M",
    cofscheduled: "Y"
  },
  split_charge_in_stock: {
    label: "Split Charge: In-Stock Charge",
    ecomind: "E",
    cof: "C",
    cofscheduled: "N"
  },
  split_charge_remainder: {
    label: "Split Charge: Remainder Charge",
    ecomind: "E",
    cof: "M",
    cofscheduled: "N"
  }
};

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
  const config = getProviderConfig("propelrpay");
  const missing = [];
  const authConfigured = Boolean(config.apiKey || config.basicAuth || (config.authUsername && config.authPassword));
  if (!config.baseUrl) missing.push("PROPELRPAY_API_BASE_URL");
  if (!authConfigured) missing.push("PROPELRPAY_API_KEY or PROPELRPAY_BASIC_AUTH or PROPELRPAY_AUTH_USERNAME/PROPELRPAY_AUTH_PASSWORD");

  return {
    configured: missing.length === 0,
    baseUrl: config.baseUrl || null,
    authHeader: config.authHeader,
    authScheme: config.authScheme,
    authMode: config.basicAuth || (config.authUsername && config.authPassword) ? "basic" : "api_key",
    timeoutMs: config.timeoutMs,
    missing,
    paths: config.paths || {},
    pathStatus: Object.fromEntries(
      Object.entries(config.paths || {}).map(([key, value]) => [key, Boolean(value)])
    )
  };
}

function getConfig(operation = null) {
  const config = getProviderConfig("propelrpay");
  const status = getStatus();
  if (!status.configured) {
    throw inputError(`Missing ${status.missing.join(", ")}`);
  }

  const pathKey = operation ? OPERATION_PATHS[operation] : null;
  const operationPath = pathKey ? config.paths?.[pathKey] || getDefaultPath(config.baseUrl, pathKey) : null;
  if (pathKey && !operationPath) {
    throw inputError(`Missing ${PATH_ENV_NAMES[pathKey] || `PROPELRPAY_${pathKey.toUpperCase()}_PATH`}`);
  }

  return {
    baseUrl: String(config.baseUrl).replace(/\/+$/, ""),
    apiKey: String(config.apiKey || "").trim(),
    basicAuth: String(config.basicAuth || "").trim(),
    authUsername: String(config.authUsername || "").trim(),
    authPassword: String(config.authPassword || ""),
    merchantId: String(config.merchantId || "").trim(),
    authHeader: String(config.authHeader || "Authorization"),
    authScheme: String(config.authScheme || "Basic"),
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 180000,
    paths: config.paths || {},
    operationPath
  };
}

function getDefaultPath(baseUrl, pathKey) {
  const url = String(baseUrl || "").toLowerCase();
  if (!url.includes("cardconnect") && !url.includes("cardpointe")) {
    return "";
  }

  if (pathKey === "sale" || pathKey === "authorize" || pathKey === "verification") return "/auth";
  if (pathKey === "ach") return "/auth";
  if (pathKey === "capture") return "/capture";
  if (pathKey === "refund") return "/refund";
  if (pathKey === "void") return "/void";
  if (pathKey === "transaction") return "/inquire/{transactionId}";
  return "";
}

function normalizeRoutingNumber(payload = {}) {
  return String(payload.bankaba || payload.routingNumber || payload.routing_number || payload.aba || "").replace(/\D/g, "");
}

function normalizeBankAccountNumber(payload = {}) {
  return String(payload.bankAccountNumber || payload.accountNumber || payload.account_number || payload.account || "").replace(/\D/g, "");
}

function buildAchRequest(payload, operation, config, merchid, scenario) {
  const bankaba = normalizeRoutingNumber(payload);
  const account = normalizeBankAccountNumber(payload);
  const requestAmount = payload.amount == null || payload.amount === ""
    ? scenario?.amount
    : payload.amount;

  if (!bankaba || !/^\d{9}$/.test(bankaba)) {
    throw inputError("routing number must be 9 digits");
  }
  if (!account || account.length < 4 || account.length > 19) {
    throw inputError("bank account number length is invalid");
  }

  const request = removeEmptyFields({
    merchid,
    account,
    bankaba,
    amount: requestAmount == null ? undefined : normalizeAmount(requestAmount),
    name: payload.accountHolderName || payload.name || "ACH Test Account",
    phone: payload.phone || payload.accountHolderPhone,
    postal: payload.postal || payload.billingZip || payload.zip,
    ecomind: payload.ecomind || scenario?.ecomind || "E",
    achEntryCode: payload.achEntryCode || payload.secCode || "WEB",
    accttype: payload.accttype || payload.accountType,
    capture: operation === "ach" || operation === "ach_sale" || operation === "echeck" ? "Y" : payload.capture
  });

  return {
    request,
    card: {
      paymentType: "ach",
      maskedAccount: `****${account.slice(-4)}`,
      routingLast4: bankaba.slice(-4)
    },
    transactionId: null,
    storedCredentialScenario: scenario
  };
}

function normalizeAmount(value, { allowZero = false } = {}) {
  const amount = String(value ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) < 0 || (!allowZero && Number(amount) <= 0)) {
    throw inputError(allowZero ? "amount must be a non-negative decimal amount" : "amount must be a positive decimal amount");
  }
  return amount;
}

function getStoredCredentialScenario(payload = {}) {
  const key = String(payload.storedCredentialScenario || payload.paymentScenario || "").trim();
  if (!key) {
    return null;
  }
  return STORED_CREDENTIAL_SCENARIOS[key] ? { key, ...STORED_CREDENTIAL_SCENARIOS[key] } : null;
}

function buildStoredCredentialFields(payload = {}, operation = "") {
  const scenario = getStoredCredentialScenario(payload);
  const fields = removeEmptyFields({
    ecomind: payload.ecomind || scenario?.ecomind,
    cof: payload.cof || scenario?.cof,
    cofscheduled: payload.cofscheduled || scenario?.cofscheduled,
    profile: payload.profile || scenario?.profile,
    cofpermission: payload.cofpermission || scenario?.cofpermission
  });

  if ((operation === "sale" || operation === "charge") && payload.capture == null) {
    fields.capture = "Y";
  }

  return {
    fields,
    scenario
  };
}

function normalizeExpiry(payload) {
  if (payload.expiry) {
    return String(payload.expiry).replace(/\D/g, "");
  }
  const expMonth = String(payload.expMonth || payload.exp_month || "").replace(/\D/g, "").padStart(2, "0");
  const expYear = String(payload.expYear || payload.exp_year || "").replace(/\D/g, "");
  if (!expMonth || !expYear) {
    return "";
  }
  return `${expMonth}${expYear.slice(-2)}`;
}

function buildPaymentMethod(payload) {
  const token = payload.token || payload.providerPaymentToken || payload.source || payload.paymentMethodId;
  if (token) {
    return {
      paymentMethod: {
        token,
        id: token
      },
      card: null
    };
  }

  const account = String(payload.account || payload.pan || payload.cardNumber || "").replace(/\D/g, "");
  const expiry = normalizeExpiry(payload);
  if (!account) {
    throw inputError("account is required");
  }
  if (account.length < 12 || account.length > 19) {
    throw inputError("account length is invalid");
  }
  if (!/^\d{4}$/.test(expiry)) {
    throw inputError("expiry must be MMYY");
  }

  return {
    paymentMethod: {
      card: removeEmptyFields({
        number: account,
        exp_month: expiry.slice(0, 2),
        exp_year: expiry.slice(2),
        cvv: payload.cvc || payload.cvv || payload.cvv2,
        name: payload.cardholderName || payload.name,
        billing_zip: payload.billingZip || payload.zip || payload.postalCode,
        billing_address: payload.billingAddressLine1 || payload.street
      })
    },
    card: {
      first6: account.slice(0, 6),
      last4: account.slice(-4),
      brand: null,
      maskedPan: `**** **** **** ${account.slice(-4)}`
    }
  };
}

function buildOperationRequest(payload, operation, config) {
  const transactionId = payload.transactionId || payload.retref || payload.authorizationId || payload.providerReferenceId;
  const merchid = payload.merchid || payload.merchantId || payload.merchant_id || config.merchantId;
  const { fields: storedCredentialFields, scenario } = buildStoredCredentialFields(payload, operation);
  if (!merchid) {
    throw inputError("merchid is required");
  }
  if (TRANSACTION_OPERATIONS.has(operation)) {
    if (!transactionId) {
      throw inputError("transactionId is required");
    }
    const request = removeEmptyFields({
      merchid,
      retref: transactionId,
      amount: payload.amount == null ? undefined : normalizeAmount(payload.amount)
    });
    return { request, card: null, transactionId };
  }

  if (ACH_OPERATIONS.has(operation)) {
    return buildAchRequest(payload, operation, config, merchid, scenario);
  }

  const { paymentMethod, card } = buildPaymentMethod(payload);
  const account = payload.account || paymentMethod.token || paymentMethod.card?.number;
  const expiry = normalizeExpiry(payload);
  const requestAmount = payload.amount == null || payload.amount === ""
    ? scenario?.amount
    : payload.amount;
  const allowZeroAmount = Boolean(payload.allowZeroAmount || scenario?.allowZeroAmount);
  const request = removeEmptyFields({
    merchid,
    account,
    expiry,
    amount: requestAmount == null ? undefined : normalizeAmount(requestAmount, { allowZero: allowZeroAmount }),
    capture: operation === "sale" || operation === "charge" ? "Y" : payload.capture,
    ...storedCredentialFields
  });

  return { request, card, transactionId, storedCredentialScenario: scenario };
}

function normalizeAmountSequence(payload) {
  if (Array.isArray(payload.amounts) && payload.amounts.length > 0) {
    return payload.amounts.map(normalizeAmount);
  }

  return ["1100.12", "1100.25"];
}

function headers(config) {
  let value = config.apiKey;
  if (/^basicx?$/i.test(config.authScheme) || config.basicAuth || (config.authUsername && config.authPassword)) {
    const encoded = config.basicAuth || Buffer.from(`${config.authUsername}:${config.authPassword}`, "utf8").toString("base64");
    value = `${config.authScheme || "Basic"} ${encoded}`;
  } else if (config.authScheme) {
    value = `${config.authScheme} ${config.apiKey}`;
  }
  return {
    accept: "application/json",
    "content-type": "application/json",
    [config.authHeader]: value
  };
}

function materializePath(pathTemplate, transactionId) {
  if (!pathTemplate) return "";
  const path = String(pathTemplate)
    .replaceAll("{transactionId}", encodeURIComponent(transactionId || ""))
    .replaceAll(":transactionId", encodeURIComponent(transactionId || ""));
  return path.startsWith("/") ? path : `/${path}`;
}

async function submitOperation(operation, payload = {}, options = {}) {
  const config = getConfig(operation);
  const { request, card, transactionId, storedCredentialScenario } = buildOperationRequest(payload, operation, config);
  const path = materializePath(config.operationPath, transactionId);
  if ((operation === "capture" || operation === "refund" || operation === "void" || operation === "reversal") && !transactionId && /transactionId|:transactionId/.test(config.operationPath)) {
    throw inputError("transactionId is required");
  }

  const response = await axios({
    method: "post",
    url: `${config.baseUrl}${path}`,
    data: request,
    headers: headers(config),
    timeout: config.timeoutMs
  });

  const result = summarizeResponse(response.data, {
    card,
    operation,
    requestedAmount: request.amount || null,
    correlationId: response.headers["x-correlation-id"] || response.headers["correlation-id"] || null
  });
  if (options.includeRequest) {
    result.request = {
      url: `${config.baseUrl}${path}`,
      body: request
    };
  }
  result.storedCredential = storedCredentialScenario ? {
    scenario: storedCredentialScenario.key,
    label: storedCredentialScenario.label,
    ecomind: request.ecomind || null,
    cof: request.cof || null,
    cofscheduled: request.cofscheduled || null,
    profile: request.profile || null,
    cofpermission: request.cofpermission || null
  } : null;
  return result;
}

function summarizeError(error) {
  return {
    message: error.response?.data?.message || error.response?.data?.error || error.message || "Request failed",
    statusCode: error.response?.status || error.statusCode || null,
    raw: error.response?.data || null
  };
}

async function runAmountSequence(payload = {}) {
  const operation = String(payload.sequenceOperation || payload.operation || "auth").toLowerCase();
  if (!["sale", "charge", "authorize", "auth", "verification", "verify"].includes(operation)) {
    throw inputError("sequence operation must be sale, authorize, or verification");
  }

  const amounts = normalizeAmountSequence(payload);
  const responses = [];

  for (const amount of amounts) {
    try {
      const result = await submitOperation(operation, {
        ...payload,
        amount
      }, { includeRequest: true });
      responses.push({
        ok: true,
        amount,
        request: result.request,
        result
      });
    } catch (error) {
      responses.push({
        ok: false,
        amount,
        error: summarizeError(error)
      });
    }
  }

  return {
    ok: responses.every((response) => response.ok),
    provider: "propelrpay",
    operation,
    amounts,
    responses
  };
}

async function getTransaction(transactionId) {
  if (!transactionId) {
    throw inputError("transactionId is required");
  }
  const config = getConfig("transaction");

  const response = await axios({
    method: "get",
    url: `${config.baseUrl}${materializePath(config.operationPath, transactionId)}`,
    headers: headers(config),
    timeout: config.timeoutMs
  });

  return summarizeResponse(response.data, {
    operation: "transaction_detail",
    correlationId: response.headers["x-correlation-id"] || response.headers["correlation-id"] || null
  });
}

function pickFirst(object, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((cursor, part) => cursor?.[part], object);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function normalizeStatus(value) {
  const status = String(value || "").toLowerCase();
  if (status === "a") return "approved";
  if (status === "b") return "failed";
  if (status === "c") return "declined";
  if (["approved", "success", "succeeded", "captured", "authorized", "verified"].includes(status)) return "approved";
  if (["declined", "rejected", "not_verified"].includes(status)) return "declined";
  if (["failed", "error"].includes(status)) return "failed";
  return status || "unknown";
}

function normalizeResponseAmount(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
}

function summarizeResponse(body, { card = null, operation, correlationId = null, requestedAmount = null } = {}) {
  const data = body?.data && typeof body.data === "object" ? body.data : body;
  const providerAmount = normalizeResponseAmount(pickFirst(data, ["amount", "transaction.amount"]));
  const amount = providerAmount && providerAmount !== "0.00" ? providerAmount : requestedAmount || providerAmount;
  return {
    status: normalizeStatus(pickFirst(data, ["status", "state", "result", "respstat", "response.status", "transaction.status"])),
    resultCode: pickFirst(data, ["result_code", "response_code", "code", "respcode", "response.code", "transaction.response_code"]),
    responseMessage: pickFirst(data, ["message", "response_message", "description", "resptext", "response.message", "error.message"]),
    transactionId: pickFirst(data, ["id", "transaction_id", "transactionId", "retref", "transaction.id", "data.id"]),
    type: operation || pickFirst(data, ["type", "transaction.type"]),
    processor: `propelrpay_${operation || "operation"}`,
    authCode: pickFirst(data, ["auth_code", "authorization_code", "authcode", "card.auth_code", "response.auth_code"]),
    avsResult: pickFirst(data, ["avs_result", "avs_response", "avsresp", "card.avs_result", "response.avs_result"]),
    cvvResult: pickFirst(data, ["cvv_result", "cvv_response", "cvvresp", "card.cvv_result", "response.cvv_result"]),
    amount,
    submittedAmount: requestedAmount || null,
    providerAmount,
    currency: pickFirst(data, ["currency", "transaction.currency"]),
    correlationId,
    card,
    raw: body
  };
}

async function testConnection() {
  const config = getConfig();
  if (!config.paths.transaction) {
    return {
      ok: true,
      configured: true,
      baseUrl: config.baseUrl,
      responseMessage: "Base credentials configured; no PROPELRPAY_TRANSACTION_PATH set for a non-monetary probe",
      pathStatus: getStatus().pathStatus
    };
  }
  return getTransaction("health");
}

module.exports = {
  authorizeCard: (payload) => submitOperation("authorize", payload),
  achSale: (payload) => submitOperation("ach_sale", payload),
  captureTransaction: (payload) => submitOperation("capture", payload),
  getStatus,
  getTransaction,
  refundTransaction: (payload) => submitOperation("refund", payload),
  reverseTransaction: (payload) => submitOperation("void", payload),
  runAmountSequence,
  saleCard: (payload) => submitOperation("sale", payload),
  testConnection,
  verifyCard: (payload) => submitOperation("verification", payload)
};
