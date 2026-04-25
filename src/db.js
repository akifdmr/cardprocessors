const Database = require("better-sqlite3");
const env = require("./config/env");

function normalizeSqlitePath(connectionString) {
  if (connectionString.startsWith("jdbc:sqlite:")) {
    return connectionString.slice("jdbc:sqlite:".length);
  }

  if (connectionString.startsWith("sqlite:")) {
    return connectionString.slice("sqlite:".length);
  }

  return connectionString;
}

function normalizeParams(text, params = []) {
  const normalizedText = text.replace(/\$\d+/g, "?");
  return {
    text: normalizedText,
    params: params.map((value) => {
      if (typeof value === "boolean") {
        return value ? 1 : 0;
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
        return JSON.stringify(value);
      }

      return value;
    })
  };
}

const sqlitePath = normalizeSqlitePath(env.databaseUrl);
const db = new Database(sqlitePath);
db.pragma("foreign_keys = ON");

async function query(text, params) {
  const normalized = normalizeParams(text, params);
  const statement = db.prepare(normalized.text);

  if (statement.reader) {
    const rows = statement.all(normalized.params);
    return {
      rows,
      rowCount: rows.length
    };
  }

  const result = statement.run(normalized.params);
  return {
    rows: [],
    rowCount: result.changes,
    lastInsertRowid: result.lastInsertRowid
  };
}

module.exports = {
  db,
  query
};
