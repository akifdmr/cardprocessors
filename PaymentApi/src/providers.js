const env = require("./config/env");

function getProviderConfig(provider) {
  const config = env.providers[provider];
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return config;
}

function getPublicProviderConfig() {
  return {
    clover: {
      baseUrl: env.providers.clover.baseUrl,
      merchantId: env.providers.clover.merchantId,
      ecommerceConfigured: Boolean(env.providers.clover.apiKey && env.providers.clover.merchantId),
      tokenizationConfigured: Boolean(env.providers.clover.publicToken && env.providers.clover.merchantId)
    },
    paypal: {
      baseUrl: env.providers.paypal.baseUrl,
      environment: env.providers.paypal.environment,
      restConfigured: Boolean(
        env.providers.paypal.clientId &&
        env.providers.paypal.clientSecret
      ),
      nvp: {
        baseUrl: env.providers.paypal.nvp.baseUrl,
        configured: Boolean(
          env.providers.paypal.nvp.username &&
          env.providers.paypal.nvp.password &&
          env.providers.paypal.nvp.signature
        )
      },
      manager: {
        baseUrl: env.providers.paypal.manager.baseUrl,
        configured: Boolean(
          env.providers.paypal.manager.partner &&
          env.providers.paypal.manager.vendor &&
          env.providers.paypal.manager.user &&
          env.providers.paypal.manager.password
        )
      }
    },
    amazonpay: {
      baseUrl: env.providers.amazonpay.baseUrl,
      storeConfigured: Boolean(env.providers.amazonpay.storeId),
      merchantConfigured: Boolean(env.providers.amazonpay.merchantId),
      publicKeyConfigured: Boolean(env.providers.amazonpay.publicKeyId),
      privateKeyConfigured: Boolean(
        env.providers.amazonpay.privateKey ||
        env.providers.amazonpay.privateKeyBase64 ||
        env.providers.amazonpay.privateKeyFile
      ),
      region: env.providers.amazonpay.region,
      sandbox: env.providers.amazonpay.sandbox,
      currency: env.providers.amazonpay.currency,
      authAmount: env.providers.amazonpay.authAmount,
      configured: Boolean(
        env.providers.amazonpay.storeId &&
        env.providers.amazonpay.merchantId &&
        env.providers.amazonpay.publicKeyId &&
        (
          env.providers.amazonpay.privateKey ||
          env.providers.amazonpay.privateKeyBase64 ||
          env.providers.amazonpay.privateKeyFile
        )
      )
    },
    fluidpay: {
      baseUrl: env.providers.fluidpay.baseUrl,
      processorId: env.providers.fluidpay.processorId || null,
      configured: Boolean(env.providers.fluidpay.apiKey)
    },
    braintree: {
      baseUrl: env.providers.braintree.baseUrl,
      merchantAccountId: env.providers.braintree.merchantAccountId || null,
      configured: Boolean(
        env.providers.braintree.merchantId &&
        env.providers.braintree.publicKey &&
        env.providers.braintree.privateKey
      )
    },
    nmi: {
      baseUrl: env.providers.nmi.baseUrl,
      configured: Boolean(env.providers.nmi.paymentApiKey),
      clientKeyConfigured: Boolean(env.providers.nmi.clientKey),
      componentTokenConfigured: Boolean(env.providers.nmi.componentTokenKey),
      transactionPath: env.providers.nmi.transactionPath,
      queryPath: env.providers.nmi.queryPath
    },
    zoho: {
      baseUrl: env.providers.zoho.baseUrl || null,
      accountsUrl: env.providers.zoho.accountsUrl || null,
      organizationIdConfigured: Boolean(env.providers.zoho.organizationId),
      accountIdConfigured: Boolean(env.providers.zoho.accountId),
      configured: Boolean(env.providers.zoho.baseUrl && (
        env.providers.zoho.apiKey ||
        env.providers.zoho.accessToken ||
        (env.providers.zoho.clientId && env.providers.zoho.clientSecret && env.providers.zoho.refreshToken)
      )),
      operationPathsConfigured: Object.fromEntries(
        Object.entries(env.providers.zoho.paths || {}).map(([key, value]) => [key, Boolean(value)])
      )
    },
    globalpayments: {
      mode: env.providers.globalpayments.mode,
      baseUrl: env.providers.globalpayments.baseUrl,
      accountName: env.providers.globalpayments.accountName || null,
      channel: env.providers.globalpayments.channel,
      merchantConfigured: Boolean(env.providers.globalpayments.merchantId),
      siteConfigured: Boolean(env.providers.globalpayments.siteId),
      deviceConfigured: Boolean(env.providers.globalpayments.deviceId),
      keyType: env.providers.globalpayments.keyType || null,
      configured: Boolean(env.providers.globalpayments.appId && env.providers.globalpayments.appKey)
    },
    propelrpay: {
      baseUrl: env.providers.propelrpay.baseUrl || null,
      merchantConfigured: Boolean(env.providers.propelrpay.merchantId),
      configured: Boolean(env.providers.propelrpay.baseUrl && (
        env.providers.propelrpay.apiKey ||
        env.providers.propelrpay.basicAuth ||
        (env.providers.propelrpay.authUsername && env.providers.propelrpay.authPassword)
      )),
      operationPathsConfigured: Object.fromEntries(
        Object.entries(env.providers.propelrpay.paths || {}).map(([key, value]) => [key, Boolean(value)])
      )
    },
    propelr: {
      baseUrl: env.providers.propelrpay.baseUrl || null,
      merchantConfigured: Boolean(env.providers.propelrpay.merchantId),
      configured: Boolean(env.providers.propelrpay.baseUrl && (
        env.providers.propelrpay.apiKey ||
        env.providers.propelrpay.basicAuth ||
        (env.providers.propelrpay.authUsername && env.providers.propelrpay.authPassword)
      )),
      operationPathsConfigured: Object.fromEntries(
        Object.entries(env.providers.propelrpay.paths || {}).map(([key, value]) => [key, Boolean(value)])
      )
    },
    quiklie: {
      baseUrl: env.providers.quiklie.baseUrl || null,
      merchantConfigured: Boolean(env.providers.quiklie.merchantId),
      configured: Boolean(env.providers.quiklie.baseUrl && env.providers.quiklie.apiKey),
      operationPathsConfigured: Object.fromEntries(
        Object.entries(env.providers.quiklie.paths || {}).map(([key, value]) => [key, Boolean(value)])
      )
    },
    jokerChecker: {
      baseUrl: env.providers.jokerChecker.baseUrl,
      configured: Boolean(env.providers.jokerChecker.baseUrl),
      capabilities: ["bin_check"],
      disabledCapabilities: ["full_card_check", "live_check", "balance_check", "bulk_card_file"]
    }
  };
}

module.exports = {
  getProviderConfig,
  getPublicProviderConfig
};
