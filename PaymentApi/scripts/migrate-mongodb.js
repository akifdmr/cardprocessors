#!/usr/bin/env node

const { client, ensureMongoSchema, getMongoStatus } = require("../src/db");

function isCreateIndexPermissionError(error) {
  const message = String(error?.message || "");
  return /not allowed to do action \[createIndex\]|createIndex(?:es)?.*(?:not authorized|requires authentication)|unauthorized/i.test(message);
}

async function migrate() {
  try {
    const status = await getMongoStatus();
    if (!status.ok) {
      throw new Error(status.error?.message || "MongoDB connection failed");
    }

    console.log(`[+] MongoDB connected: database=${status.database} authMode=${status.authMode}`);
    try {
      await ensureMongoSchema();
      console.log("[+] MongoDB indexes are ready");
    } catch (error) {
      if (!isCreateIndexPermissionError(error)) {
        throw error;
      }

      console.warn("[!] MongoDB index migration skipped: the Atlas database user cannot run createIndex on this database.");
      console.warn("[!] Grant the user dbAdmin/readWrite privileges on the target database, or run this migration once with a privileged Atlas database user.");
    }
  } catch (error) {
    console.error(`[!] MongoDB migration failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
}

migrate();
