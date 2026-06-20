const { MongoClient, ServerApiVersion } = require("mongodb");
const { v4: uuidv4 } = require("uuid");
const env = require("./config/env");

const mongoClientOptions = {
  serverSelectionTimeoutMS: env.mongo.serverSelectionTimeoutMs,
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
};

if (env.mongo.tlsCertificateKeyFile) {
  mongoClientOptions.tlsCertificateKeyFile = env.mongo.tlsCertificateKeyFile;
}

const client = new MongoClient(env.databaseUrl, mongoClientOptions);
let databasePromise;

function now() {
  return new Date().toISOString();
}

function row(doc) {
  if (!doc) {
    return null;
  }
  const { _id, ...rest } = doc;
  return rest;
}

function normalizeSql(text) {
  return String(text).replace(/\s+/g, " ").trim().toLowerCase();
}

function makeInsertRow(fields, values) {
  return Object.fromEntries(fields.map((field, index) => [field, values[index] ?? null]));
}

async function getDb() {
  if (!databasePromise) {
    databasePromise = client.connect()
      .then(() => client.db(env.databaseName))
      .catch((error) => {
        databasePromise = null;
        throw error;
      });
  }
  return databasePromise;
}

function getMongoErrorSummary(error) {
  const cause = error?.cause || error?.reason || error;
  const message = String(cause?.message || error?.message || "Unknown MongoDB error");
  const isTlsInternalError = message.includes("tlsv1 alert internal error");

  if (isTlsInternalError) {
    return {
      code: "MONGODB_TLS_INTERNAL_ERROR",
      message: "MongoDB TLS handshake failed. Check Atlas auth mode, client certificate settings, and IP allowlist.",
      detail: "The previous config requested MONGODB-X509 without a client certificate; password auth is derived when MONGODB_USERNAME and MONGODB_PASSWORD are present."
    };
  }

  return {
    code: error?.codeName || error?.code || error?.name || "MONGODB_ERROR",
    message
  };
}

async function getMongoStatus() {
  const authMode = env.mongo.tlsCertificateKeyFile
    ? "x509-certificate"
    : env.mongo.usesDerivedPasswordAuth ? "password-derived-from-env" : "connection-string";

  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return {
      ok: true,
      database: env.databaseName,
      source: env.mongo.source,
      hasCertificate: Boolean(env.mongo.tlsCertificateKeyFile),
      authMode
    };
  } catch (error) {
    return {
      ok: false,
      database: env.databaseName,
      source: env.mongo.source,
      hasCertificate: Boolean(env.mongo.tlsCertificateKeyFile),
      authMode,
      error: getMongoErrorSummary(error)
    };
  }
}

async function ensureMongoSchema() {
  const db = await getDb();
  await Promise.all([
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db.collection("user_sessions").createIndex({ token_hash: 1 }, { unique: true }),
    db.collection("user_sessions").createIndex({ user_id: 1 }),
    db.collection("cards").createIndex({ provider: 1, provider_payment_token: 1 }, { unique: true }),
    db.collection("verification_attempts").createIndex({ card_id: 1, created_at: -1 }),
    db.collection("enrollment_profiles").createIndex({ card_id: 1 }, { unique: true }),
    db.collection("card_phone_numbers").createIndex({ card_id: 1, created_at: -1 }),
    db.collection("unchargeback_cases").createIndex({ created_at: -1 }),
    db.collection("unchargeback_cases").createIndex({ case_id: 1 }),
    db.collection("funding_accounts").createIndex({ created_at: -1 }),
    db.collection("funding_accounts").createIndex({ account_fingerprint: 1 }, { unique: true, sparse: true }),
    db.collection("debt_cards").createIndex({ created_at: -1 }),
    db.collection("debt_cards").createIndex({ owner_name: 1, bank_name: 1 }),
    db.collection("debt_payments").createIndex({ debt_card_id: 1, payment_date: -1 }),
    db.collection("debt_payments").createIndex({ funding_account_id: 1, payment_date: -1 }),
    db.collection("debt_payments").createIndex({ repayment_status: 1, payment_status: 1 }),
    db.collection("uncheckedCards").createIndex({ correlationId: 1 }, { unique: true }),
    db.collection("uncheckedCards").createIndex({ checked: 1, live: 1, createdAt: -1 }),
    db.collection("uncheckedCards").createIndex({ bin: 1, createdAt: -1 }),
    db.collection("checkedLiveCards").createIndex({ uncheckedCardId: 1, createdAt: -1 }),
    db.collection("checkedLiveCards").createIndex({ provider: 1, live: 1, createdAt: -1 }),
    db.collection("validCardLists").createIndex({ id: 1 }, { unique: true }),
    db.collection("validCardLists").createIndex({ batchId: 1, lineNumber: 1 }),
    db.collection("validCardLists").createIndex({ first6: 1, last4: 1, expMonth: 1, expYear: 1 }),
    db.collection("validCardLists").createIndex({ validationMode: 1, updatedAt: -1 }),
    db.collection("binLookupCache").createIndex({ bin: 1 }, { unique: true }),
    db.collection("binLookupCache").createIndex({ updatedAt: -1 }),
    db.collection("audit_logs").createIndex({ entity_type: 1, entity_id: 1, created_at: -1 })
  ]);
}

function result(rows = [], rowCount = rows.length) {
  return { rows: rows.map(row), rowCount };
}

async function query(text, params = []) {
  const db = await getDb();
  const sql = normalizeSql(text);

  if (sql === "select 1") {
    await db.command({ ping: 1 });
    return result([{ one: 1 }]);
  }

  if (sql.startsWith("select id from users where username")) {
    const doc = await db.collection("users").findOne({ username: params[0] }, { projection: { _id: 0, id: 1 } });
    return result(doc ? [doc] : []);
  }

  if (sql.startsWith("insert into users")) {
    const fields = [
      "username",
      "password_hash",
      "display_name",
      "role",
      "can_balance_check",
      "can_view_balance",
      "is_active"
    ];
    const doc = {
      id: uuidv4(),
      ...makeInsertRow(fields, params),
      created_at: now(),
      updated_at: now()
    };
    if (sql.includes("'admin'")) {
      doc.role = "admin";
      doc.can_balance_check = true;
      doc.can_view_balance = true;
      doc.is_active = true;
    }
    await db.collection("users").insertOne(doc);
    return result([{ id: doc.id }], 1);
  }

  if (sql.startsWith("select id, username, password_hash")) {
    const doc = await db.collection("users").findOne({ username: params[0] }, { projection: { _id: 0 } });
    return result(doc ? [doc] : []);
  }

  if (sql.startsWith("insert into user_sessions")) {
    const days = Number(params[2] || 7);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const doc = {
      id: uuidv4(),
      user_id: params[0],
      token_hash: params[1],
      expires_at: expiresAt,
      revoked_at: null,
      created_at: now()
    };
    await db.collection("user_sessions").insertOne(doc);
    return result([{ id: doc.id, expires_at: doc.expires_at }], 1);
  }

  if (sql.includes("from user_sessions s join users u")) {
    const session = await db.collection("user_sessions").findOne({
      token_hash: params[0],
      revoked_at: null,
      expires_at: { $gt: now() }
    });
    if (!session) {
      return result([]);
    }
    const user = await db.collection("users").findOne({ id: session.user_id });
    if (!user) {
      return result([]);
    }
    return result([{
      session_id: session.id,
      expires_at: session.expires_at,
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      can_balance_check: user.can_balance_check,
      can_view_balance: user.can_view_balance,
      is_active: user.is_active
    }]);
  }

  if (sql.startsWith("select id from cards where id")) {
    const doc = await db.collection("cards").findOne({ id: params[0] }, { projection: { _id: 0, id: 1 } });
    return result(doc ? [doc] : []);
  }

  if (sql.startsWith("select id, username, display_name")) {
    const rows = await db.collection("users").find({}, { projection: { _id: 0, password_hash: 0 } })
      .sort({ created_at: -1 })
      .toArray();
    return result(rows);
  }

  if (sql.startsWith("select id, provider, provider_customer_id")) {
    const rows = await db.collection("cards").find({}, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .toArray();
    const rowsWithNumbers = await Promise.all(rows.map(async (card) => {
      const number = await db.collection("card_phone_numbers")
        .find({ card_id: card.id }, { projection: { _id: 0 } })
        .sort({ is_verified: -1, created_at: -1 })
        .limit(1)
        .next();
      return {
        ...card,
        masking_number: number?.masked_number || null,
        masking_number_verified: Boolean(number?.is_verified)
      };
    }));
    return result(rowsWithNumbers);
  }

  if (sql.startsWith("insert into cards")) {
    const fields = [
      "provider",
      "provider_customer_id",
      "provider_payment_token",
      "pan_encrypted",
      "masked_pan",
      "first6",
      "last4",
      "brand",
      "exp_month",
      "exp_year",
      "cardholder_name",
      "billing_address_line1",
      "billing_address_line2",
      "billing_city",
      "billing_state",
      "billing_zip",
      "billing_country",
      "auth_check_limit",
      "is_enrolled",
      "verification_status",
      "avs_result",
      "auth_result_code",
      "provider_reference_id",
      "notes"
    ];
    const doc = {
      id: uuidv4(),
      ...makeInsertRow(fields, params),
      created_at: now(),
      updated_at: now()
    };
    await db.collection("cards").insertOne(doc);
    return result([{ id: doc.id }], 1);
  }

  if (sql.startsWith("update cards set verification_status")) {
    const update = {
      verification_status: params[0],
      avs_result: params[1],
      auth_result_code: params[2],
      provider_reference_id: params[3],
      updated_at: now()
    };
    if (params[4] != null) {
      update.notes = params[4];
    }
    const write = await db.collection("cards").updateOne({ id: params[5] }, { $set: update });
    return result([], write.modifiedCount);
  }

  if (sql.startsWith("update cards set provider = 'paypal'")) {
    const update = {
      provider: "paypal",
      updated_at: now()
    };
    if (params[0] != null) update.provider_reference_id = params[0];
    if (params[1] != null) update.avs_result = params[1];
    if (params[2] != null) update.auth_result_code = params[2];
    update.verification_status = params[3];
    const write = await db.collection("cards").updateOne({ id: params[4] }, { $set: update });
    return result([], write.modifiedCount);
  }

  if (sql.startsWith("update cards set is_enrolled")) {
    const write = await db.collection("cards").updateOne(
      { id: params[0] },
      { $set: { is_enrolled: true, updated_at: now() } }
    );
    return result([], write.modifiedCount);
  }

  if (sql.startsWith("insert into verification_attempts")) {
    const fields = [
      "card_id",
      "provider",
      "attempt_type",
      "status",
      "amount",
      "currency",
      "provider_reference_id",
      "raw_response",
      "balance_amount",
      "created_by_user_id"
    ];
    let doc;
    if (sql.includes("'paypal', 'bin_check'")) {
      doc = {
        id: uuidv4(),
        card_id: params[0],
        provider: "paypal",
        attempt_type: "bin_check",
        status: params[1],
        amount: null,
        currency: "USD",
        provider_reference_id: null,
        raw_response: params[2],
        balance_amount: null,
        created_by_user_id: params[3],
        created_at: now()
      };
    } else if (sql.includes("'paypal', 'live_check'")) {
      doc = {
        id: uuidv4(),
        card_id: params[0],
        provider: "paypal",
        attempt_type: "live_check",
        status: params[1],
        amount: params[2],
        currency: "USD",
        provider_reference_id: params[3],
        raw_response: params[4],
        balance_amount: null,
        created_by_user_id: params[5],
        created_at: now()
      };
    } else if (sql.includes("'paypal', 'auth_check'")) {
      doc = {
        id: uuidv4(),
        card_id: params[0],
        provider: "paypal",
        attempt_type: "auth_check",
        status: params[1],
        amount: params[2],
        currency: "USD",
        provider_reference_id: params[3],
        raw_response: params[4],
        balance_amount: null,
        created_by_user_id: params[5],
        created_at: now()
      };
    } else {
      doc = {
        id: uuidv4(),
        ...makeInsertRow(fields, params),
        created_at: now()
      };
    }
    await db.collection("verification_attempts").insertOne(doc);
    return result([{ id: doc.id, created_at: doc.created_at }], 1);
  }

  if (sql.startsWith("select id, provider, attempt_type")) {
    const rows = await db.collection("verification_attempts")
      .find({ card_id: params[0] }, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .toArray();
    return result(rows);
  }

  if (sql.startsWith("select provider_reference_id from verification_attempts")) {
    const doc = await db.collection("verification_attempts").findOne({
      card_id: params[0],
      provider: "paypal",
      attempt_type: "auth_check",
      status: "approved",
      provider_reference_id: { $ne: null }
    }, { sort: { created_at: -1 }, projection: { _id: 0, provider_reference_id: 1 } });
    return result(doc ? [doc] : []);
  }

  if (sql.startsWith("insert into enrollment_profiles")) {
    const fields = [
      "card_id",
      "enroll_bank_url",
      "username_encrypted",
      "password_encrypted",
      "holder_ssn_last4",
      "holder_ssn_encrypted",
      "holder_dob_encrypted",
      "free_text_encrypted"
    ];
    const update = {
      ...makeInsertRow(fields, params),
      updated_at: now()
    };
    const existing = await db.collection("enrollment_profiles").findOne({ card_id: params[0] });
    const id = existing?.id || uuidv4();
    await db.collection("enrollment_profiles").updateOne(
      { card_id: params[0] },
      { $set: update, $setOnInsert: { id, created_at: now() } },
      { upsert: true }
    );
    return result([{ id }], 1);
  }

  if (sql.startsWith("select id from enrollment_profiles")) {
    const doc = await db.collection("enrollment_profiles").findOne({ card_id: params[0] }, { projection: { _id: 0, id: 1 } });
    return result(doc ? [doc] : []);
  }

  if (sql.includes("from enrollment_profiles where card_id")) {
    const doc = await db.collection("enrollment_profiles").findOne({ card_id: params[0] }, { projection: { _id: 0 } });
    return result(doc ? [doc] : []);
  }

  if (sql.startsWith("insert into card_phone_numbers")) {
    const fields = [
      "card_id",
      "phone_number",
      "masked_number",
      "verification_code",
      "is_verified",
      "added_by"
    ];
    const doc = {
      id: uuidv4(),
      ...makeInsertRow(fields, params),
      created_at: now(),
      updated_at: now()
    };
    await db.collection("card_phone_numbers").insertOne(doc);
    return result([doc], 1);
  }

  if (sql.includes("from card_phone_numbers where id")) {
    const doc = await db.collection("card_phone_numbers").findOne({ id: params[0] }, { projection: { _id: 0 } });
    return result(doc ? [doc] : []);
  }

  if (sql.includes("from card_phone_numbers where card_id")) {
    const cursor = db.collection("card_phone_numbers").find({ card_id: params[0] }, { projection: { _id: 0 } });
    const rows = sql.includes("limit 1")
      ? await cursor.sort({ is_verified: -1, created_at: -1 }).limit(1).toArray()
      : await cursor.sort({ created_at: -1 }).toArray();
    return result(rows);
  }

  if (sql.startsWith("select id, card_id, phone_number") && sql.includes("from card_phone_numbers order by")) {
    const rows = await db.collection("card_phone_numbers").find({}, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .toArray();
    return result(rows);
  }

  if (sql.startsWith("update card_phone_numbers")) {
    const write = await db.collection("card_phone_numbers").updateOne(
      { id: params[0] },
      { $set: { is_verified: true, verification_code: null, updated_at: now() } }
    );
    return result([], write.modifiedCount);
  }

  if (sql.startsWith("insert into audit_logs")) {
    const doc = {
      id: uuidv4(),
      entity_type: params[0],
      entity_id: params[1] ?? null,
      action: params[2],
      status: params[3],
      actor_user_id: params[4] ?? null,
      details: params[5] ?? null,
      created_at: now()
    };
    await db.collection("audit_logs").insertOne(doc);
    return result([], 1);
  }

  if (sql.includes("from audit_logs")) {
    const filter = {};
    let limit = Number(params[params.length - 1] || 100);
    if (sql.includes("entity_type = $1")) {
      filter.entity_type = params[0];
      if (sql.includes("entity_id = $2")) {
        filter.entity_id = params[1];
      }
    } else if (sql.includes("entity_id = $1")) {
      filter.entity_id = params[0];
    }
    const rows = await db.collection("audit_logs").find(filter, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
    return result(rows);
  }

  throw new Error(`Unsupported Mongo query compatibility SQL: ${text}`);
}

module.exports = {
  client,
  db: { getDb },
  ensureMongoSchema,
  getMongoErrorSummary,
  getMongoStatus,
  query
};
