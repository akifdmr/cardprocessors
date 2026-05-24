const axios = require("axios");

function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID
  };
}

function getMissingVerifyFields(config = getTwilioConfig()) {
  return [
    ["TWILIO_ACCOUNT_SID", config.accountSid],
    ["TWILIO_AUTH_TOKEN", config.authToken],
    ["TWILIO_VERIFY_SERVICE_SID", config.verifyServiceSid]
  ].filter(([, value]) => !value).map(([key]) => key);
}

function ensureVerifyConfig() {
  const config = getTwilioConfig();
  const missing = getMissingVerifyFields(config);
  if (missing.length > 0) {
    const error = new Error(`Missing Twilio Verify configuration: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
  return config;
}

async function startPhoneVerification(phoneNumber, channel = "sms") {
  const config = ensureVerifyConfig();
  const response = await axios.post(
    `https://verify.twilio.com/v2/Services/${config.verifyServiceSid}/Verifications`,
    new URLSearchParams({
      To: phoneNumber,
      Channel: channel
    }).toString(),
    {
      auth: {
        username: config.accountSid,
        password: config.authToken
      },
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      timeout: 15000
    }
  );

  return {
    sid: response.data.sid,
    status: response.data.status,
    channel: response.data.channel,
    to: response.data.to
  };
}

async function checkPhoneVerification(phoneNumber, code) {
  const config = ensureVerifyConfig();
  const response = await axios.post(
    `https://verify.twilio.com/v2/Services/${config.verifyServiceSid}/VerificationCheck`,
    new URLSearchParams({
      To: phoneNumber,
      Code: code
    }).toString(),
    {
      auth: {
        username: config.accountSid,
        password: config.authToken
      },
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      timeout: 15000
    }
  );

  return {
    sid: response.data.sid,
    status: response.data.status,
    valid: Boolean(response.data.valid),
    to: response.data.to
  };
}

function getVerifyStatus() {
  const config = getTwilioConfig();
  const missing = getMissingVerifyFields(config);
  return {
    configured: missing.length === 0,
    missing
  };
}

module.exports = {
  checkPhoneVerification,
  getVerifyStatus,
  startPhoneVerification
};
