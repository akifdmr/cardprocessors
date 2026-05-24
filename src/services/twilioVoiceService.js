const crypto = require("crypto");

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(header, payload, secret) {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function getVoiceConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    apiKeySid: process.env.TWILIO_API_KEY_SID,
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET,
    twimlAppSid: process.env.TWILIO_TWIML_APP_SID
  };
}

function getMissingVoiceFields(config = getVoiceConfig()) {
  return [
    ["TWILIO_ACCOUNT_SID", config.accountSid],
    ["TWILIO_API_KEY_SID", config.apiKeySid],
    ["TWILIO_API_KEY_SECRET", config.apiKeySecret],
    ["TWILIO_TWIML_APP_SID", config.twimlAppSid]
  ].filter(([, value]) => !value).map(([key]) => key);
}

function createVoiceAccessToken(identity) {
  const config = getVoiceConfig();
  const missing = getMissingVoiceFields(config);
  if (missing.length > 0) {
    const error = new Error(`Missing Twilio Voice SDK configuration: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = 60 * 60;
  const safeIdentity = String(identity || "operator")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 121);

  const payload = {
    jti: `${config.apiKeySid}-${now}`,
    iss: config.apiKeySid,
    sub: config.accountSid,
    exp: now + ttl,
    grants: {
      identity: safeIdentity,
      voice: {
        outgoing: {
          application_sid: config.twimlAppSid
        },
        incoming: {
          allow: false
        }
      }
    }
  };

  return {
    token: signJwt({ typ: "JWT", alg: "HS256" }, payload, config.apiKeySecret),
    identity: safeIdentity,
    expiresAt: new Date((now + ttl) * 1000).toISOString()
  };
}

function getVoiceStatus() {
  const missing = getMissingVoiceFields();
  return {
    configured: missing.length === 0,
    missing
  };
}

module.exports = {
  createVoiceAccessToken,
  getVoiceStatus
};
