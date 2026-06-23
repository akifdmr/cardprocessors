const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "..");
const nodeEnv = process.env.NODE_ENV || "development";

dotenv.config({ path: path.join(rootDir, ".env") });

const shouldLoadEnvSpecificDotenv = nodeEnv !== "production" || process.env.LOAD_DOTENV === "true";
if (shouldLoadEnvSpecificDotenv) {
  dotenv.config({ path: path.join(rootDir, `.env.${nodeEnv}`), override: true });
}

const env = require("../src/config/env");

const databaseUrl = env.databaseUrl || "";
if (!databaseUrl.startsWith("mongodb://") && !databaseUrl.startsWith("mongodb+srv://")) {
  throw new Error("DATABASE_URL, MONGODB_URI or MONGODB_CONNECTIONSTRING must be a MongoDB connection string.");
}

const authMode = env.mongo.tlsCertificateKeyFile
  ? "x509-certificate"
  : env.mongo.usesDerivedPasswordAuth ? "password-derived-from-env" : "connection-string";

console.log(`MongoDB config check passed. source=${env.mongo.source} authMode=${authMode} hasCertificate=${Boolean(env.mongo.tlsCertificateKeyFile)}`);
