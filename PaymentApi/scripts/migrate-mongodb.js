const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "..");
const nodeEnv = process.env.NODE_ENV || "development";

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, `.env.${nodeEnv}`), override: true });

const { client, ensureMongoSchema, getMongoErrorSummary } = require("../src/db");
const env = require("../src/config/env");

ensureMongoSchema()
  .then(() => {
    console.log(`MongoDB schema ready for NODE_ENV=${nodeEnv} database=${env.databaseName}`);
  })
  .catch((error) => {
    const summary = getMongoErrorSummary(error);
    console.error(`MongoDB migration failed: ${summary.code}: ${summary.message}`);
    if (summary.detail) {
      console.error(summary.detail);
    }
    process.exitCode = 1;
  })
  .finally(() => client.close());
