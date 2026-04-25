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
      clientId: env.providers.paypal.clientId
    }
  };
}

module.exports = {
  getProviderConfig,
  getPublicProviderConfig
};
