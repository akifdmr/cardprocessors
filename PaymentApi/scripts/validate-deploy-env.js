#!/usr/bin/env node

const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "..");
const nodeEnv = process.env.NODE_ENV || "production";
dotenv.config({ path: path.join(rootDir, ".env") });

const shouldLoadEnvSpecificDotenv = nodeEnv !== "production" || process.env.LOAD_DOTENV === "true";
if (shouldLoadEnvSpecificDotenv) {
  dotenv.config({ path: path.join(rootDir, `.env.${nodeEnv}`), override: true });
}

const required = [
  "APP_ENCRYPTION_KEY_BASE64",
  "BOOTSTRAP_ADMIN_PASSWORD"
];

function usableEnvValue(value) {
  const text = String(value || "").trim();
  return text && text !== "..." && !/^<.+>$/.test(text) ? text : "";
}

const databaseUrl = process.env.DATABASE_URL ||
  process.env.MONGODB_CONNECTIONSTRING ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  "";

const missing = required.filter((name) => !String(process.env[name] || "").trim());
if (!usableEnvValue(databaseUrl)) {
  missing.push("DATABASE_URL (or MONGODB_CONNECTIONSTRING/MONGODB_URI/MONGO_URL)");
}

if (missing.length) {
  console.error(`[!] Missing required deploy environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

if (!/^mongodb(\+srv)?:\/\//.test(databaseUrl)) {
  console.error("[!] Database URL must start with mongodb:// or mongodb+srv://");
  process.exit(1);
}

let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  console.error("[!] DATABASE_URL is not a valid MongoDB URL");
  process.exit(1);
}

const authMechanism = String(parsedDatabaseUrl.searchParams.get("authMechanism") || "").toUpperCase();
const certificateFile = process.env.MONGODB_TLS_CERT_KEY_FILE ||
  process.env.MONGODB_TLS_CERTIFICATE_KEY_FILE ||
  process.env.MONGODB_SSL_CERT_KEY_FILE;
const fallbackUsername = usableEnvValue(process.env.MONGODB_USERNAME);
const fallbackPassword = usableEnvValue(process.env.MONGODB_PASSWORD);

if (authMechanism === "MONGODB-X509" && !certificateFile && !(fallbackUsername && fallbackPassword)) {
  console.error("[!] Database URL uses MONGODB-X509 but no certificate is configured. Use an Atlas database-user URL with the username and URL-encoded password embedded, or provide MONGODB_USERNAME and MONGODB_PASSWORD for the runtime fallback.");
  process.exit(1);
}

if (authMechanism !== "MONGODB-X509" && (!parsedDatabaseUrl.username || !parsedDatabaseUrl.password) && !(fallbackUsername && fallbackPassword)) {
  console.error("[!] Database URL must contain the Atlas database username and password, or MONGODB_USERNAME and MONGODB_PASSWORD must be configured");
  process.exit(1);
}

let encryptionKey;
try {
  encryptionKey = Buffer.from(process.env.APP_ENCRYPTION_KEY_BASE64, "base64");
} catch {
  encryptionKey = Buffer.alloc(0);
}
if (encryptionKey.length !== 32) {
  console.error("[!] APP_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes");
  process.exit(1);
}

if (String(process.env.BOOTSTRAP_ADMIN_PASSWORD).length < 12) {
  console.error("[!] BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters");
  process.exit(1);
}

console.log("[+] Required deploy environment is valid");
