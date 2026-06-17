function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function readable(value) {
  const text = String(value || "").trim();
  if (!text || ["api only", "unknown", "null", "undefined"].includes(text.toLowerCase())) return null;
  return text;
}

function isLiveResponse(response = {}) {
  const statuses = [
    normalizeStatus(response.status),
    normalizeStatus(response.result?.status),
    normalizeStatus(response.providerResponse?.status)
  ];
  const codes = [
    normalizeStatus(response.resultCode),
    normalizeStatus(response.result?.resultCode),
    normalizeStatus(response.providerResponse?.resultCode)
  ];
  const messages = [
    normalizeStatus(response.responseMessage),
    normalizeStatus(response.result?.responseMessage),
    normalizeStatus(response.providerResponse?.responseMessage),
    normalizeStatus(response.result?.message),
    normalizeStatus(response.providerResponse?.message)
  ];

  return Boolean(
    response.success === true ||
    response.ok === true ||
    statuses.some((status) => ["verified", "approved", "authorized", "passed", "success", "captured"].includes(status)) ||
    codes.some((code) => ["clover_card_verified", "approved", "success", "0", "00"].includes(code)) ||
    messages.some((message) => message.includes("approved") || message.includes("authorized") || message.includes("verified"))
  );
}

function toCompactLiveCheckerResponse(response = {}) {
  const IsLive = isLiveResponse(response);
  const binCheck = response.binCheck || {};
  const summary = binCheck.summary || {};
  const details = binCheck.details || {};
  const countryName = readable(summary.country) ||
    readable(details["ISO Country Name"]) ||
    null;
  const CountryCode = readable(summary.countryCode) ||
    readable(details["ISO Country Code A2"]) ||
    readable(details["ISO Country Code A3"]) ||
    null;
  const issuer = readable(summary.issuer) ||
    readable(details["Issuer Name / Bank"]) ||
    readable(details["Issuer"]) ||
    null;
  const CardType = readable(summary.type) ||
    readable(details["Card Type"]) ||
    null;
  const Segment = readable(summary.level) ||
    readable(details["Card Level"]) ||
    null;
  const binTitle = readable(response.binCheckLine) ||
    [countryName || CountryCode, issuer, CardType, Segment].filter(Boolean).join("/") ||
    null;
  const providerResponse = response.providerResponse || response.result || {};
  const referenceId = response.providerReferenceId ||
    response.transactionId ||
    providerResponse.providerReferenceId ||
    providerResponse.transactionId ||
    providerResponse.cloverChargeId ||
    providerResponse.pnref ||
    null;
  const responseMessage = readable(response.responseMessage) ||
    readable(response.failureReason) ||
    readable(providerResponse.responseMessage) ||
    readable(providerResponse.failureReason) ||
    readable(providerResponse.error) ||
    null;

  return {
    countryName,
    counryName: countryName,
    CountryCode,
    CardType,
    Segment,
    binTitle,
    IsLive,
    isLive: IsLive,
    status: response.status || providerResponse.status || null,
    resultCode: response.resultCode || providerResponse.resultCode || null,
    responseMessage,
    referenceId,
    provider: response.provider || null,
    operation: response.operation || null
  };
}

module.exports = {
  isLiveResponse,
  toCompactLiveCheckerResponse
};
