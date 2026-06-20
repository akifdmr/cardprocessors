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
const braintreeEnv = process.env.BRAINTREE_ENV || "sandbox";
const nmiEnv = process.env.NMI_ENV || "production";
const zohoPaymentsEnv = process.env.ZOHO_PAYMENTS_ENV || process.env.ZOHO_PAYMENT_ENV || "production";
const amazonPayPublicKeyId = optionalEnv("AMAZON_PAY_PUBLIC_KEY_ID") || optionalEnv("AMAZON_PAY_APIKEY");
const amazonPaySandboxEnv = optionalEnv("AMAZON_PAY_SANDBOX");
const amazonPaySandbox = amazonPayPublicKeyId.toUpperCase().startsWith("SANDBOX")
  ? true
  : amazonPayPublicKeyId.toUpperCase().startsWith("LIVE")
    ? false
    : amazonPaySandboxEnv
      ? boolEnv("AMAZON_PAY_SANDBOX")
      : false;
const databaseName = process.env.MONGODB_DATABASE || "cloverapp";

function usableEnvValue(value) {
  const text = String(value || "").trim();
  return text && text !== "..." && !/^<.+>$/.test(text) ? text : "";
}

function requireEnv(name) {
  const value = usableEnvValue(process.env[name]);
  if (!value) {
    console.error(`:${process.env.NODE_ENV} ortaminda eksik veya tanimsiz element var: ${name}`);
    // throw new Error(`:${process.env} ortaminda eksik veya tanimsiz element var`);
  }
  return value;
}

function optionalEnv(name, fallback = "") {
  return usableEnvValue(process.env[name]) || fallback;
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

function hasMongoClientCertificateConfig() {
  return Boolean(
    optionalEnv("MONGODB_TLS_CERT_KEY_FILE") ||
    optionalEnv("MONGODB_TLS_CERTIFICATE_KEY_FILE") ||
    optionalEnv("MONGODB_SSL_CERT_KEY_FILE")
  );
}

function mongoClientCertificateKeyFile() {
  return optionalEnv("MONGODB_TLS_CERT_KEY_FILE") ||
    optionalEnv("MONGODB_TLS_CERTIFICATE_KEY_FILE") ||
    optionalEnv("MONGODB_SSL_CERT_KEY_FILE");
}

function getRawDatabaseUrl() {
  return optionalEnv("DATABASE_URL") ||
    optionalEnv("MONGODB_CONNECTIONSTRING") ||
    optionalEnv("MONGODB_URI") ||
    optionalEnv("MONGO_URL");
}

function resolveDatabaseUrl() {
  const rawDatabaseUrl = getRawDatabaseUrl();
  if (!rawDatabaseUrl) {
    return requireEnv("DATABASE_URL");
  }

  let parsed;
  try {
    parsed = new URL(rawDatabaseUrl);
  } catch (_error) {
    return rawDatabaseUrl;
  }

  const authMechanism = parsed.searchParams.get("authMechanism");
  const isX509 = authMechanism && authMechanism.toUpperCase() === "MONGODB-X509";
  const username = optionalEnv("MONGODB_USERNAME");
  const password = optionalEnv("MONGODB_PASSWORD");

  if (isX509 && !hasMongoClientCertificateConfig() && username && password) {
    parsed.username = username;
    parsed.password = password;
    parsed.pathname = "/";
    parsed.searchParams.delete("authMechanism");
    parsed.searchParams.delete("authSource");
    return parsed.toString();
  }

  return rawDatabaseUrl;
}

module.exports = {
  nodeEnv: optionalEnv("NODE_ENV", nodeEnv),
  port: Number(optionalEnv("PORT", "3000")),
  databaseUrl: resolveDatabaseUrl(),
  databaseName: optionalEnv("MONGODB_DATABASE", databaseName),
  mongo: {
    serverSelectionTimeoutMs: Number(optionalEnv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "10000")),
    tlsCertificateKeyFile: mongoClientCertificateKeyFile(),
    usesDerivedPasswordAuth: (() => {
      const rawDatabaseUrl = getRawDatabaseUrl() || "";
      return rawDatabaseUrl.includes("MONGODB-X509") && !hasMongoClientCertificateConfig() && Boolean(optionalEnv("MONGODB_USERNAME") && optionalEnv("MONGODB_PASSWORD"));
    })(),
    source: "live"
  },
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
      publicToken: optionalEnv("CLOVER_ECOMM_PUBLIC_TOKEN"),
      apiKey: optionalEnv("CLOVER_ECOMM_PRIVATE_TOKEN")
    },
    paypal: {
      environment: paypalEnv,
      baseUrl: optionalEnv(
        "PAYPAL_API_BASE_URL",
        paypalEnv === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com"
      ),
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
    amazonpay: {
      storeId: optionalEnv("AMAZON_PAY_STORE_ID"),
      merchantId: optionalEnv("AMAZON_PAY_MERCHANT_ID"),
      publicKeyId: amazonPayPublicKeyId,
      privateKey: optionalEnv("AMAZON_PAY_PRIVATE_KEY"),
      privateKeyBase64: optionalEnv("AMAZON_PAY_PRIVATE_KEY_BASE64"),
      privateKeyFile: optionalEnv("AMAZON_PAY_PRIVATE_KEY_FILE") || optionalEnv("AMAZON_PAY_PRIVATE_KEY_PATH"),
      clientSecret: optionalEnv("AMAZON_PAY_CLIENT_SECRET") || optionalEnv("AMAZON_CLIENT_SECRET"),
      baseUrl: optionalEnv("AMAZON_API_BASE_URL", "https://pay-api.amazon.com/:version"),
      region: optionalEnv("AMAZON_PAY_REGION", "us"),
      sandbox: amazonPaySandbox,
      algorithm: optionalEnv("AMAZON_PAY_SIGNING_ALGORITHM"),
      currency: optionalEnv("AMAZON_PAY_CURRENCY", "USD"),
      authAmount: optionalEnv("AMAZON_PAY_AUTH_AMOUNT", "0.20"),
      checkoutReviewReturnUrl: optionalEnv("AMAZON_PAY_CHECKOUT_REVIEW_RETURN_URL"),
      checkoutResultReturnUrl: optionalEnv("AMAZON_PAY_CHECKOUT_RESULT_RETURN_URL"),
      legacySellerId: optionalEnv("AMAZON_PAY_LEGACY_SELLER_ID") || optionalEnv("AMAZON_SELLER_ID") || optionalEnv("AMAZON_PAY_MERCHANT_ID"),
      legacyAccessKey: optionalEnv("AMAZON_PAY_LEGACY_ACCESS_KEY") || optionalEnv("AMAZON_MWS_KEY_ID"),
      legacySecretAccessKey: optionalEnv("AMAZON_PAY_LEGACY_SECRET_ACCESS_KEY") || optionalEnv("AMAZON_SECRET_ACCESS_KEY"),
      legacyLwaClientId: optionalEnv("AMAZON_PAY_LEGACY_LWA_CLIENT_ID") || optionalEnv("AMAZON_CLIENT_ID") || optionalEnv("AMAZON_PAY_STORE_ID"),
      legacyReturnUrl: optionalEnv("AMAZON_PAY_LEGACY_RETURN_URL", "https://softprofessionalservices.com/"),
      legacyCancelReturnUrl: optionalEnv("AMAZON_PAY_LEGACY_CANCEL_RETURN_URL", "https://softprofessionalservices.com/"),
      legacySignature: optionalEnv("AMAZON_PAY_LEGACY_SIGNATURE", "gMELqpRVQO6XVCNGdgikQnWN3CjTCt2TeIVqLaJTaHc%3D"),
      testChargePermissionId: optionalEnv("AMAZON_PAY_TEST_CHARGE_PERMISSION_ID"),
      timeoutMs: Number(optionalEnv("AMAZON_PAY_TIMEOUT_MS", "180000"))
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
    braintree: {
      environment: braintreeEnv,
      baseUrl: optionalEnv(
        "BRAINTREE_GRAPHQL_URL",
        braintreeEnv === "production"
          ? "https://payments.braintree-api.com/graphql"
          : "https://payments.sandbox.braintree-api.com/graphql"
      ),
      merchantId: optionalEnv("BRAINTREE_MERCHANT_ID"),
      publicKey: optionalEnv("BRAINTREE_PUBLIC_KEY"),
      privateKey: optionalEnv("BRAINTREE_PRIVATE_KEY"),
      merchantAccountId: optionalEnv("BRAINTREE_MERCHANT_ACCOUNT_ID"),
      timeoutMs: Number(optionalEnv("BRAINTREE_TIMEOUT_MS", "180000"))
    },
    nmi: {
      baseUrl: optionalEnv(
        "NMI_API_BASE_URL",
        nmiEnv === "sandbox" ? "https://secure.nmi.com" : "https://secure.nmi.com"
      ),
      paymentApiKey: optionalEnv("NMI_PAYMENT_API_KEY") || optionalEnv("NMI_SECURITY_KEY") || optionalEnv("NMI_API_SECURITY_KEY") || optionalEnv("NMI_PRIVATE_KEY"),
      clientKey: optionalEnv("NMI_CLIENT_KEY") || optionalEnv("NMI_TOKENIZATION_KEY") || optionalEnv("NMI_CHECKOUT_KEY"),
      clientSecret: optionalEnv("NMI_CLIENT_SECRET") || optionalEnv("NMI_API_PASSWORD"),
      componentTokenKey: optionalEnv("NMI_COMPONENT_TOKEN_KEY"),
      timeoutMs: Number(optionalEnv("NMI_TIMEOUT_MS", "180000")),
      transactionPath: optionalEnv("NMI_TRANSACTION_PATH", "/api/transact.php"),
      queryPath: optionalEnv("NMI_QUERY_PATH", "/api/query.php"),
      defaultBillingCountry: optionalEnv("NMI_DEFAULT_BILLING_COUNTRY", "US")
    },
    zoho: {
      baseUrl: optionalEnv("ZOHO_PAYMENTS_API_BASE_URL") ||
        optionalEnv("ZOHO_PAYMENT_API_BASE_URL") ||
        optionalEnv("ZOHO_API_BASE_URL") ||
        (zohoPaymentsEnv === "sandbox" ? optionalEnv("ZOHO_PAYMENTS_SANDBOX_API_BASE_URL") : ""),
      accountsUrl: optionalEnv("ZOHO_ACCOUNTS_BASE_URL", "https://accounts.zoho.com"),
      apiKey: optionalEnv("ZOHO_PAYMENTS_API_KEY") || optionalEnv("ZOHO_PAYMENT_API_KEY") || optionalEnv("ZOHO_API_KEY"),
      accessToken: optionalEnv("ZOHO_PAYMENTS_ACCESS_TOKEN") || optionalEnv("ZOHO_ACCESS_TOKEN"),
      clientId: optionalEnv("ZOHO_PAYMENTS_CLIENT_ID") || optionalEnv("ZOHO_CLIENT_ID"),
      clientSecret: optionalEnv("ZOHO_PAYMENTS_CLIENT_SECRET") || optionalEnv("ZOHO_CLIENT_SECRET"),
      refreshToken: optionalEnv("ZOHO_PAYMENTS_REFRESH_TOKEN") || optionalEnv("ZOHO_REFRESH_TOKEN"),
      organizationId: optionalEnv("ZOHO_PAYMENTS_ORGANIZATION_ID") || optionalEnv("ZOHO_ORGANIZATION_ID"),
      accountId: optionalEnv("ZOHO_PAYMENTS_ACCOUNT_ID") || optionalEnv("ZOHO_ACCOUNT_ID"),
      timeoutMs: Number(optionalEnv("ZOHO_PAYMENTS_TIMEOUT_MS") || optionalEnv("ZOHO_TIMEOUT_MS", "180000")),
      paths: {
        status: optionalEnv("ZOHO_PAYMENTS_STATUS_PATH") || optionalEnv("ZOHO_STATUS_PATH"),
        test: optionalEnv("ZOHO_PAYMENTS_TEST_PATH") || optionalEnv("ZOHO_TEST_PATH"),
        sale: optionalEnv("ZOHO_PAYMENTS_SALE_PATH") || optionalEnv("ZOHO_SALE_PATH"),
        authorize: optionalEnv("ZOHO_PAYMENTS_AUTH_PATH") || optionalEnv("ZOHO_AUTH_PATH"),
        verification: optionalEnv("ZOHO_PAYMENTS_VERIFY_PATH") || optionalEnv("ZOHO_VERIFY_PATH"),
        capture: optionalEnv("ZOHO_PAYMENTS_CAPTURE_PATH") || optionalEnv("ZOHO_CAPTURE_PATH"),
        refund: optionalEnv("ZOHO_PAYMENTS_REFUND_PATH") || optionalEnv("ZOHO_REFUND_PATH"),
        void: optionalEnv("ZOHO_PAYMENTS_VOID_PATH") || optionalEnv("ZOHO_VOID_PATH"),
        transaction: optionalEnv("ZOHO_PAYMENTS_TRANSACTION_PATH") || optionalEnv("ZOHO_TRANSACTION_PATH")
      }
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
    quiklie: {
      baseUrl: optionalEnv("QUIKLIE_PAYMENT_API_BASE_URL") || optionalEnv("QUIKLIE_API_BASE_URL") || optionalEnv("QUICKLIE_PAYMENT_API_BASE_URL") || optionalEnv("QUICKLIE_API_BASE_URL"),
      apiKey: optionalEnv("QUIKLIE_PAYMENT_API_KEY") || optionalEnv("QUIKLIE_API_KEY") || optionalEnv("QUICKLIE_PAYMENT_API_KEY") || optionalEnv("QUICKLIE_API_KEY"),
      merchantId: optionalEnv("QUIKLIE_PAYMENT_MERCHANT_ID") || optionalEnv("QUIKLIE_PAYMENT_USER_ID") || optionalEnv("QUIKLIE_MERCHANT_ID") || optionalEnv("QUIKLIE_USER_ID") || optionalEnv("QUICKLIE_PAYMENT_MERCHANT_ID") || optionalEnv("QUICKLIE_PAYMENT_USER_ID") || optionalEnv("QUICKLIE_MERCHANT_ID") || optionalEnv("QUICKLIE_USER_ID"),
      authHeader: optionalEnv("QUIKLIE_PAYMENT_AUTH_HEADER") || optionalEnv("QUIKLIE_AUTH_HEADER") || optionalEnv("QUICKLIE_PAYMENT_AUTH_HEADER") || optionalEnv("QUICKLIE_AUTH_HEADER", "x-api-key"),
      authScheme: optionalEnv("QUIKLIE_PAYMENT_AUTH_SCHEME") || optionalEnv("QUIKLIE_AUTH_SCHEME") || optionalEnv("QUICKLIE_PAYMENT_AUTH_SCHEME") || optionalEnv("QUICKLIE_AUTH_SCHEME", ""),
      timeoutMs: Number(optionalEnv("QUIKLIE_PAYMENT_TIMEOUT_MS") || optionalEnv("QUIKLIE_TIMEOUT_MS") || optionalEnv("QUICKLIE_PAYMENT_TIMEOUT_MS") || optionalEnv("QUICKLIE_TIMEOUT_MS", "180000")),
      paths: {
        status: optionalEnv("QUIKLIE_PAYMENT_STATUS_PATH") || optionalEnv("QUIKLIE_STATUS_PATH") || optionalEnv("QUICKLIE_PAYMENT_STATUS_PATH") || optionalEnv("QUICKLIE_STATUS_PATH", "/actuator/health"),
        test: optionalEnv("QUIKLIE_PAYMENT_TEST_PATH") || optionalEnv("QUIKLIE_TEST_PATH") || optionalEnv("QUICKLIE_PAYMENT_TEST_PATH") || optionalEnv("QUICKLIE_TEST_PATH"),
        processPayment: optionalEnv("QUIKLIE_PAYMENT_PROCESS_PATH") || optionalEnv("QUIKLIE_PROCESS_PAYMENT_PATH") || optionalEnv("QUICKLIE_PAYMENT_PROCESS_PATH") || optionalEnv("QUICKLIE_PROCESS_PAYMENT_PATH", "/api/v2/process-payment"),
        sale: optionalEnv("QUIKLIE_PAYMENT_SALE_PATH") || optionalEnv("QUIKLIE_SALE_PATH") || optionalEnv("QUICKLIE_PAYMENT_SALE_PATH") || optionalEnv("QUICKLIE_SALE_PATH", "/api/v2/process-payment"),
        authorize: optionalEnv("QUIKLIE_PAYMENT_AUTH_PATH") || optionalEnv("QUIKLIE_AUTH_PATH") || optionalEnv("QUICKLIE_PAYMENT_AUTH_PATH") || optionalEnv("QUICKLIE_AUTH_PATH", "/api/v2/process-payment"),
        verification: optionalEnv("QUIKLIE_PAYMENT_VERIFY_PATH") || optionalEnv("QUIKLIE_VERIFY_PATH") || optionalEnv("QUICKLIE_PAYMENT_VERIFY_PATH") || optionalEnv("QUICKLIE_VERIFY_PATH", "/api/v2/process-payment"),
        capture: optionalEnv("QUIKLIE_PAYMENT_CAPTURE_PATH") || optionalEnv("QUIKLIE_CAPTURE_PATH") || optionalEnv("QUICKLIE_PAYMENT_CAPTURE_PATH") || optionalEnv("QUICKLIE_CAPTURE_PATH"),
        refund: optionalEnv("QUIKLIE_PAYMENT_REFUND_PATH") || optionalEnv("QUIKLIE_REFUND_PATH") || optionalEnv("QUICKLIE_PAYMENT_REFUND_PATH") || optionalEnv("QUICKLIE_REFUND_PATH"),
        void: optionalEnv("QUIKLIE_PAYMENT_VOID_PATH") || optionalEnv("QUIKLIE_VOID_PATH") || optionalEnv("QUICKLIE_PAYMENT_VOID_PATH") || optionalEnv("QUICKLIE_VOID_PATH"),
        transaction: optionalEnv("QUIKLIE_PAYMENT_TRANSACTION_PATH") || optionalEnv("QUIKLIE_TRANSACTION_PATH") || optionalEnv("QUICKLIE_PAYMENT_TRANSACTION_PATH") || optionalEnv("QUICKLIE_TRANSACTION_PATH", "/api/v1/transaction-status/:transactionId"),
        verifyOtp: optionalEnv("QUIKLIE_PAYMENT_VERIFY_OTP_PATH") || optionalEnv("QUIKLIE_VERIFY_OTP_PATH") || optionalEnv("QUICKLIE_PAYMENT_VERIFY_OTP_PATH") || optionalEnv("QUICKLIE_VERIFY_OTP_PATH", "/api/v1/verify-otp")
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
