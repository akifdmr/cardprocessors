const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || "development";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({
  path: path.resolve(process.cwd(), `.env.${nodeEnv}`),
  override: true
});

const paypalEnv = process.env.PAYPAL_ENV || "live";
const fluidpayEnv = process.env.FLUIDPAY_ENV || "sandbox";
const globalPaymentsEnv = process.env.GLOBALPAYMENTS_ENV || "sandbox";

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

const globalPaymentsKeyType = optionalEnv("GLOBALPAYMENTS_KEY_TYPE").toUpperCase();
const globalPaymentsAppKey = optionalEnv("GLOBALPAYMENTS_APP_KEY") || optionalEnv("GLOBALPAYMENTS_SECRET_API_KEY");
const inferredGlobalPaymentsMode = ["CERT", "PROD", "LIVE"].includes(globalPaymentsKeyType) || /^skapi_/i.test(globalPaymentsAppKey)
  ? "portico"
  : "ucp";
const globalPaymentsMode = optionalEnv(
  "GLOBALPAYMENTS_API_MODE",
  inferredGlobalPaymentsMode
);
const globalPaymentsDefaultBaseUrl = globalPaymentsMode === "portico"
  ? globalPaymentsEnv === "production"
    ? "https://api2.heartlandportico.com/Hps.Exchange.PosGateway/PosGatewayService.asmx"
    : "https://cert.api2.heartlandportico.com/Hps.Exchange.PosGateway/PosGatewayService.asmx"
  : globalPaymentsEnv === "production"
    ? "https://apis.globalpay.com/ucp"
    : "https://apis.sandbox.globalpay.com/ucp";

function parseCsvEnv(name) {
  return optionalEnv(name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function boolEnv(name, fallback = false) {
  const value = optionalEnv(name);
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
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
      tokenBaseUrl: optionalEnv("CLOVER_TOKEN_API") || optionalEnv("CLOVER_TOKEN_API_BASE_URL", "https://token.clover.com"),
      ecommerceBaseUrl: optionalEnv("CLOVER_ECOMMERCE_API") || optionalEnv("CLOVER_ECOMMERCE_API_BASE_URL", "https://scl.clover.com"),
      merchantId: optionalEnv("CLOVER_MERCHANT_ID"),
      publicToken: optionalEnv("CLOVER_PUBLIC_TOKEN"),
      apiKey: optionalEnv("CLOVER_API_TOKEN") || optionalEnv("CLOVER_API_KEY") || optionalEnv("CLOVER_PRIVATE_TOKEN") || optionalEnv("CLOVER_ACCESS_TOKEN")
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
        username: optionalEnv("PAYPAL_NVP_USERNAME") || optionalEnv("PAYPAL_API_USERNAME") || optionalEnv("PAYPAL_NVP_API_USERNAME") || optionalEnv("PAYPAL_API_USER"),
        password: optionalEnv("PAYPAL_NVP_PASSWORD") || optionalEnv("PAYPAL_NVP_API_PASSWORD") || optionalEnv("PAYPAL_API_PASSWORD"),
        signature: optionalEnv("PAYPAL_NVP_SIGNATURE") || optionalEnv("PAYPAL_NVP_API_SIGNATURE") || optionalEnv("PAYPAL_API_SIGNATURE"),
        version: optionalEnv("PAYPAL_NVP_VERSION", "204.0")
      },
      manager: {
        baseUrl: optionalEnv("PAYPAL_MANAGER_BASE_URL", "https://pilot-payflowpro.paypal.com"),
        partner: optionalEnv("PAYPAL_MANAGER_PARTNER", "PayPal"),
        vendor: optionalEnv("PAYPAL_MANAGER_VENDOR"),
        user: optionalEnv("PAYPAL_MANAGER_USER"),
        password: optionalEnv("PAYPAL_MANAGER_PASSWORD") || optionalEnv("PAYPAL_MANAGER_PWD")
      }
    },
    fluidpay: {
      baseUrl: optionalEnv(
        "FLUIDPAY_API_BASE_URL",
        fluidpayEnv === "production"
          ? "https://app.fluidpay.com"
          : "https://sandbox.fluidpay.com"
      ),
      apiKey: optionalEnv("FLUIDPAY_API_KEY"),
      processorId: optionalEnv("FLUIDPAY_PROCESSOR_ID"),
      timeoutMs: Number(optionalEnv("FLUIDPAY_TIMEOUT_MS", "180000"))
    },
    globalpayments: {
      mode: globalPaymentsMode,
      baseUrl: optionalEnv("GLOBALPAYMENTS_API_BASE_URL", globalPaymentsDefaultBaseUrl),
      appId: optionalEnv("GLOBALPAYMENTS_APP_ID") || optionalEnv("GLOBALPAYMENTS_PUBLIC_API_KEY"),
      appKey: optionalEnv("GLOBALPAYMENTS_APP_KEY") || optionalEnv("GLOBALPAYMENTS_SECRET_API_KEY"),
      merchantId: optionalEnv("GLOBALPAYMENTS_MERCHANT_ID") || optionalEnv("GLOBALPAYMENTS_MID"),
      siteId: optionalEnv("GLOBALPAYMENTS_SITE_ID"),
      deviceId: optionalEnv("GLOBALPAYMENTS_DEVICE_ID"),
      website: optionalEnv("GLOBALPAYMENTS_WEBSITE"),
      keyType: optionalEnv("GLOBALPAYMENTS_KEY_TYPE"),
      developerId: optionalEnv("GLOBALPAYMENTS_DEVELOPER_ID", "000000"),
      versionNumber: optionalEnv("GLOBALPAYMENTS_VERSION_NUMBER", "0000"),
      accountName: optionalEnv("GLOBALPAYMENTS_ACCOUNT_NAME", "Transaction_Processing"),
      channel: optionalEnv("GLOBALPAYMENTS_CHANNEL", "CNP"),
      country: optionalEnv("GLOBALPAYMENTS_COUNTRY", "US"),
      version: optionalEnv("GLOBALPAYMENTS_API_VERSION", "2021-03-22"),
      timeoutMs: Number(optionalEnv("GLOBALPAYMENTS_TIMEOUT_MS", "180000"))
    },
    propelrpay: {
      baseUrl: optionalEnv("PROPELRPAY_API_BASE_URL") || optionalEnv("PROPELR_API_BASE_URL"),
      apiKey: optionalEnv("PROPELRPAY_API_KEY") || optionalEnv("PROPELR_API_KEY"),
      basicAuth: optionalEnv("PROPELRPAY_BASIC_AUTH") || optionalEnv("PROPELR_BASIC_AUTH"),
      authUsername: optionalEnv("PROPELRPAY_AUTH_USERNAME") || optionalEnv("PROPELR_AUTH_USERNAME") || optionalEnv("PROPELRPAY_USERNAME") || optionalEnv("PROPELR_USERNAME"),
      authPassword: optionalEnv("PROPELRPAY_AUTH_PASSWORD") || optionalEnv("PROPELR_AUTH_PASSWORD") || optionalEnv("PROPELRPAY_PASSWORD") || optionalEnv("PROPELR_PASSWORD"),
      merchantId: optionalEnv("PROPELRPAY_MERCHANT_ID") || optionalEnv("PROPELR_MERCHANT_ID") || optionalEnv("PROPELRPAY_MERCHID") || optionalEnv("PROPELR_MERCHID") || optionalEnv("PROPELRPAY_UAT_MID") || optionalEnv("PROPELR_UAT_MID"),
      authHeader: optionalEnv("PROPELRPAY_AUTH_HEADER") || optionalEnv("PROPELR_AUTH_HEADER", "Authorization"),
      authScheme: optionalEnv("PROPELRPAY_AUTH_SCHEME") || optionalEnv("PROPELR_AUTH_SCHEME", "Basic"),
      timeoutMs: Number(optionalEnv("PROPELRPAY_TIMEOUT_MS") || optionalEnv("PROPELR_TIMEOUT_MS", "180000")),
      paths: {
        sale: optionalEnv("PROPELRPAY_SALE_PATH") || optionalEnv("PROPELR_SALE_PATH"),
        authorize: optionalEnv("PROPELRPAY_AUTH_PATH") || optionalEnv("PROPELR_AUTH_PATH"),
        verification: optionalEnv("PROPELRPAY_VERIFY_PATH") || optionalEnv("PROPELR_VERIFY_PATH"),
        capture: optionalEnv("PROPELRPAY_CAPTURE_PATH") || optionalEnv("PROPELR_CAPTURE_PATH"),
        refund: optionalEnv("PROPELRPAY_REFUND_PATH") || optionalEnv("PROPELR_REFUND_PATH"),
        void: optionalEnv("PROPELRPAY_VOID_PATH") || optionalEnv("PROPELR_VOID_PATH"),
        transaction: optionalEnv("PROPELRPAY_TRANSACTION_PATH") || optionalEnv("PROPELR_TRANSACTION_PATH")
      }
    },
    deepseeker: {
      baseUrl: optionalEnv("DEEPSEEKER_API_BASE_URL", "https://api.deepseeker.com/v1"),
      apiKey: optionalEnv("DEEPSEEKER_API_KEY"),
      timeoutMs: Number(optionalEnv("DEEPSEEKER_TIMEOUT_MS", "15000"))
    }
  },
  burpSuite: {
    enabled: boolEnv("BURP_PROXY_ENABLED"),
    proxyUrl: optionalEnv("BURP_PROXY_URL", "http://127.0.0.1:8080"),
    scopeHosts: parseCsvEnv("BURP_PROXY_SCOPE_HOSTS"),
    allowInsecureTls: boolEnv("BURP_PROXY_ALLOW_INSECURE_TLS"),
    responseOverridesEnabled: boolEnv("BURP_RESPONSE_OVERRIDES_ENABLED"),
    responseOverridesFile: optionalEnv("BURP_RESPONSE_OVERRIDES_FILE")
  }
};
