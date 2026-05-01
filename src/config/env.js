const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || "development";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({
  path: path.resolve(process.cwd(), `.env.${nodeEnv}`),
  override: true
});

const paypalEnv = process.env.PAYPAL_ENV || "live";

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
  nodeEnv: optionalEnv("NODE_ENV", nodeEnv),
  port: Number(optionalEnv("PORT", "3000")),
  databaseUrl: requireEnv("DATABASE_URL"),
  databaseName: optionalEnv("MONGODB_DATABASE", "cloverapp"),
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
      apiKey: optionalEnv("CLOVER_API_KEY"),
      deviceHost: optionalEnv("CLOVER_DEVICE_HOST"),
      deviceId: optionalEnv("CLOVER_DEVICE_ID"),
      posId: optionalEnv("CLOVER_POS_ID")
    },
    paypal: {
      baseUrl: optionalEnv("PAYPAL_API_BASE_URL", "https://api-m.paypal.com"),
      clientId: optionalEnv("PAYPAL_CLIENT_ID"),
      clientSecret: optionalEnv("PAYPAL_CLIENT_SECRET"),
      nvp: {
        baseUrl: optionalEnv(
          "PAYPAL_NVP_BASE_URL",
          paypalEnv === "sandbox"
            ? "https://api-3t.sandbox.paypal.com/nvp"
            : "https://api-3t.paypal.com/nvp"
        ),
        username: optionalEnv("PAYPAL_NVP_USERNAME") || optionalEnv("PAYPAL_API_USER") || optionalEnv("PAYPAL_API_USERNAME"),
        password: optionalEnv("PAYPAL_NVP_PASSWORD") || optionalEnv("PAYPAL_API_PASSWORD"),
        signature: optionalEnv("PAYPAL_NVP_SIGNATURE") || optionalEnv("PAYPAL_API_SIGNATURE"),
        version: optionalEnv("PAYPAL_NVP_VERSION", "204.0")
      },
      manager: {
        baseUrl: optionalEnv("PAYPAL_MANAGER_BASE_URL", "https://pilot-payflowpro.paypal.com"),
        partner: optionalEnv("PAYPAL_MANAGER_PARTNER", "PayPal"),
        vendor: optionalEnv("PAYPAL_MANAGER_VENDOR"),
        user: optionalEnv("PAYPAL_MANAGER_USER"),
        password: optionalEnv("PAYPAL_MANAGER_PASSWORD") || optionalEnv("PAYPAL_MANAGER_PWD")
      }
    }
  }
};
