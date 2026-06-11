const { v4: uuidv4 } = require("uuid");
const { db } = require("../db");

const ALLOWED_IFRAME_ATTRIBUTES = new Set([
  "src",
  "title",
  "width",
  "height",
  "loading",
  "allow",
  "allowfullscreen",
  "referrerpolicy"
]);

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

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

function parseAttributes(attributeText) {
  const attributes = {};
  const pattern = /([a-zA-Z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = pattern.exec(attributeText))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";

    if (name.startsWith("on")) {
      throw inputError("Iframe event handler attributes are not allowed");
    }
    if (!ALLOWED_IFRAME_ATTRIBUTES.has(name)) {
      throw inputError(`Iframe attribute is not allowed: ${name}`);
    }

    attributes[name] = value;
  }

  return attributes;
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sanitizeIframeEmbed(embedHtml) {
  const html = String(embedHtml || "").trim();
  const iframeMatch = html.match(/^<iframe\b([^>]*)>\s*<\/iframe>$/i);
  const selfClosingMatch = html.match(/^<iframe\b([^>]*)\/>$/i);
  const attributeText = iframeMatch?.[1] || selfClosingMatch?.[1] || null;

  if (!attributeText) {
    throw inputError("Only a single iframe embed is allowed");
  }

  const attributes = parseAttributes(attributeText);
  const src = String(attributes.src || "").trim();

  if (!/^https?:\/\//i.test(src)) {
    throw inputError("Iframe src must be an http or https URL");
  }

  const sanitizedAttributes = {
    src,
    title: attributes.title || "Unchargeback embed",
    width: attributes.width || "100%",
    height: attributes.height || "320",
    loading: attributes.loading || "lazy",
    referrerpolicy: attributes.referrerpolicy || "no-referrer"
  };

  if (attributes.allow) {
    sanitizedAttributes.allow = attributes.allow;
  }
  if (Object.prototype.hasOwnProperty.call(attributes, "allowfullscreen")) {
    sanitizedAttributes.allowfullscreen = "";
  }

  const serialized = Object.entries(sanitizedAttributes)
    .map(([name, value]) => value === "" ? name : `${name}="${escapeAttribute(value)}"`)
    .join(" ");

  return {
    html: `<iframe ${serialized}></iframe>`,
    src
  };
}

function requireText(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw inputError(`${fieldName} is required`);
  }
  return normalized;
}

function normalizePrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw inputError("contentPrice must be a non-negative number");
  }
  return numeric;
}

async function listCases() {
  const mongo = await db.getDb();
  const rows = await mongo.collection("unchargeback_cases")
    .find({}, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .toArray();
  return rows.map(row);
}

async function createCase(payload, actorUserId) {
  const mongo = await db.getDb();
  const timestamp = now();
  const doc = {
    id: uuidv4(),
    case_id: String(payload.caseId || "").trim() || null,
    transaction_id: String(payload.transactionId || "").trim() || null,
    card_id: String(payload.cardId || "").trim() || null,
    owner_name: requireText(payload.ownerName, "ownerName"),
    owner_number: requireText(payload.ownerNumber, "ownerNumber"),
    content_price: normalizePrice(payload.contentPrice),
    status: String(payload.status || "new").trim(),
    due_date: String(payload.dueDate || "").trim() || null,
    notes: String(payload.notes || "").trim() || null,
    widget_embed_html: null,
    widget_src: null,
    content_embed_html: null,
    content_src: null,
    created_by_user_id: actorUserId || null,
    created_at: timestamp,
    updated_at: timestamp
  };

  await mongo.collection("unchargeback_cases").insertOne(doc);
  return row(doc);
}

async function updateEmbed(caseId, kind, embedHtml) {
  if (!["widget", "content"].includes(kind)) {
    throw inputError("kind must be widget or content");
  }

  const sanitized = sanitizeIframeEmbed(embedHtml);
  const mongo = await db.getDb();
  const update = {
    [`${kind}_embed_html`]: sanitized.html,
    [`${kind}_src`]: sanitized.src,
    updated_at: now()
  };
  const result = await mongo.collection("unchargeback_cases").findOneAndUpdate(
    { id: caseId },
    { $set: update },
    { returnDocument: "after", projection: { _id: 0 } }
  );

  if (!result) {
    const error = new Error("Unchargeback case not found");
    error.statusCode = 404;
    throw error;
  }

  return row(result);
}

module.exports = {
  createCase,
  listCases,
  sanitizeIframeEmbed,
  updateEmbed
};
