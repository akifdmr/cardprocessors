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
      merchantId: env.providers.clover.merchantId
    },
    paypal: {
      baseUrl: env.providers.paypal.baseUrl,
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
    }
  };
}

module.exports = {
  getProviderConfig,
  getPublicProviderConfig
};
