const braintreeService = require("./braintreeService");
const paypalService = require("./paypalService");

const SUPPORTED_PROVIDERS = new Set(["braintree", "paypal"]);

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function requireSandbox(provider) {
  if (provider === "braintree") {
    const status = braintreeService.getStatus();
    if (String(status.environment || "").toLowerCase() !== "sandbox") {
      throw inputError("Token auth + void verification is restricted to Braintree sandbox");
    }
    return;
  }

  if (provider === "paypal" && !paypalService.isSandboxRestConfigured()) {
    throw inputError("Token auth + void verification is restricted to PayPal sandbox");
  }
}

function isApproved(result = {}) {
  return ["approved", "authorized", "success", "completed", "created"].includes(
    String(result.status || "").toLowerCase()
  );
}

function authorizationId(provider, result = {}) {
  if (provider === "paypal") {
    return result.authorizationId || result.transactionId || null;
  }
  return result.transactionId || null;
}

async function authorize(provider, payload) {
  if (provider === "braintree") {
    return braintreeService.authorizeCard({
      paymentMethodId: payload.paymentMethodToken,
      amount: payload.amount,
      currency: payload.currency,
      reference: payload.reference
    });
  }

  return paypalService.authorizeVaultedPaymentMethod({
    vaultId: payload.paymentMethodToken,
    amount: payload.amount,
    currency: payload.currency,
    reference: payload.reference
  });
}

async function voidAuthorization(provider, transactionId) {
  if (provider === "braintree") {
    return braintreeService.voidTransaction({ transactionId });
  }
  return paypalService.voidRestAuthorization({ authorizationId: transactionId });
}

async function authThenVoid(payload = {}) {
  const provider = normalizeProvider(payload.provider);
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw inputError("provider must be braintree or paypal");
  }
  if (!payload.paymentMethodToken) {
    throw inputError("A vaulted provider payment token is required");
  }

  requireSandbox(provider);

  const amount = Number(payload.amount || 1);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1) {
    throw inputError("Sandbox verification amount must be greater than 0 and at most 1.00");
  }

  const currency = String(payload.currency || "USD").toUpperCase();
  const authorized = await authorize(provider, {
    paymentMethodToken: payload.paymentMethodToken,
    amount: amount.toFixed(2),
    currency,
    reference: payload.reference
  });
  const transactionId = authorizationId(provider, authorized);

  if (!isApproved(authorized) || !transactionId) {
    return {
      status: "failed",
      provider,
      amount: amount.toFixed(2),
      currency,
      authorized,
      voided: null,
      transactionId,
      responseMessage: authorized.responseMessage || "Authorization was not approved"
    };
  }

  try {
    const voided = await voidAuthorization(provider, transactionId);
    return {
      status: isApproved(voided) ? "verified" : "void_failed",
      provider,
      amount: amount.toFixed(2),
      currency,
      authorized,
      voided,
      transactionId,
      responseMessage: isApproved(voided)
        ? "Sandbox authorization approved and voided"
        : (voided.responseMessage || "Authorization succeeded but void failed")
    };
  } catch (error) {
    return {
      status: "void_failed",
      provider,
      amount: amount.toFixed(2),
      currency,
      authorized,
      voided: null,
      transactionId,
      responseMessage: `Authorization succeeded but void failed: ${error.message}`
    };
  }
}

module.exports = {
  authThenVoid,
  isApproved,
  supportedProviders: [...SUPPORTED_PROVIDERS]
};
