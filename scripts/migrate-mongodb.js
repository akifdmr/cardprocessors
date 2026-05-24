const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "..");
const nodeEnv = process.env.NODE_ENV || "development";

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, `.env.${nodeEnv}`), override: true });

const { client, ensureMongoSchema } = require("../src/db");
const env = require("../src/config/env");

ensureMongoSchema()
  .then(() => {
    console.log(`MongoDB schema ready for NODE_ENV=${nodeEnv} database=${env.databaseName}`);
  })
  .finally(() => client.close());
