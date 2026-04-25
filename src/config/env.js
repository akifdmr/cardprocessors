const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

module.exports = {
  nodeEnv: optionalEnv("NODE_ENV", "production"),
  port: Number(optionalEnv("PORT", "3000")),
  databaseUrl: requireEnv("DATABASE_URL"),
  encryptionKeyBase64: requireEnv("APP_ENCRYPTION_KEY_BASE64"),
  bootstrapAdmin: {
    username: optionalEnv("BOOTSTRAP_ADMIN_USERNAME", "admin"),
    password: optionalEnv("BOOTSTRAP_ADMIN_PASSWORD"),
    displayName: optionalEnv("BOOTSTRAP_ADMIN_DISPLAY_NAME", "System Admin")
  },
  providers: {
    clover: {
      baseUrl: optionalEnv("CLOVER_API_BASE_URL", "https://api.clover.com"),
      merchantId: optionalEnv("CLOVER_MERCHANT_ID"),
      apiKey: optionalEnv("CLOVER_API_KEY")
    },
    paypal: {
      baseUrl: optionalEnv("PAYPAL_API_BASE_URL", "https://api-m.paypal.com"),
      clientId: optionalEnv("PAYPAL_CLIENT_ID"),
      clientSecret: optionalEnv("PAYPAL_CLIENT_SECRET")
    }
  }
};
