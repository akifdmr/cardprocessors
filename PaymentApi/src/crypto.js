const crypto = require("crypto");
const env = require("./config/env");

const ENCRYPTION_KEY = Buffer.from(env.encryptionKeyBase64, "base64");

if (ENCRYPTION_KEY.length !== 32) {
  throw new Error("APP_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes");
}

function encrypt(plainText) {
  if (!plainText) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(encodedPayload) {
  if (!encodedPayload) {
    return null;
  }

  const raw = Buffer.from(encodedPayload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString("utf8");
}

module.exports = {
  encrypt,
  decrypt
};
