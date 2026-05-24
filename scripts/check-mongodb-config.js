const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "..");
const nodeEnv = process.env.NODE_ENV || "development";

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, `.env.${nodeEnv}`), override: true });

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl.startsWith("mongodb://") && !databaseUrl.startsWith("mongodb+srv://")) {
  throw new Error("DATABASE_URL must be a MongoDB connection string.");
}

console.log("MongoDB config check passed.");
