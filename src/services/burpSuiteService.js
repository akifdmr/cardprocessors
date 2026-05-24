const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const env = require("../config/env");

const MAX_EVENTS = 150;
const MAX_OTP_MESSAGES = 50;
const DEFAULT_HOLD_SECONDS = 60;
const SECRET_KEYS = /pass|password|secret|token|authorization|api[-_]?key|cvv|cvc|pan|card|otp|code/i;

let installed = false;
let responseOverrideRules = [];
const trafficEvents = [];
const pendingResponses = new Map();
const otpMessages = [];

const runtime = {
  active: false,
  proxyEnabled: false,
  proxyUrl: env.burpSuite.proxyUrl,
  scopeHosts: [],
  allowInsecureTls: false,
  otpCaptureArmed: false,
  otpPathKeyword: "otp",
  holdSeconds: DEFAULT_HOLD_SECONDS
};

function normalizeHost(host) {
  return String(host || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function bool(value) {
  return value === true || ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function isProduction() {
  return String(env.nodeEnv || "").toLowerCase() === "production";
}

function configuredHosts() {
  return [...(env.burpSuite.scopeHosts || []), ...(runtime.scopeHosts || [])]
    .map(normalizeHost)
    .filter(Boolean);
}

function getScopedHosts() {
  return Array.from(new Set(configuredHosts()));
}

function isRuntimeEnabled() {
  return runtime.active || env.burpSuite.enabled || env.burpSuite.responseOverridesEnabled;
}

function isProxyEnabled() {
  return Boolean((runtime.active && runtime.proxyEnabled) || env.burpSuite.enabled);
}

function isHostScoped(hostname) {
  const host = normalizeHost(hostname);
  const scopedHosts = getScopedHosts();
  if (scopedHosts.length === 0) return false;
  return scopedHosts.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
}

function resolveRequestUrl(config) {
  try {
    return new URL(config.url, config.baseURL || undefined);
  } catch (_error) {
    return null;
  }
}

function parseProxyConfig(proxyUrl) {
  const parsed = new URL(proxyUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("BURP_PROXY_URL must start with http:// or https://");
  }

  const proxy = {
    protocol: parsed.protocol.replace(":", ""),
    host: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80))
  };

  if (parsed.username || parsed.password) {
    proxy.auth = {
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password)
    };
  }

  return proxy;
}

function loadResponseOverrides() {
  responseOverrideRules = [];
  if (!env.burpSuite.responseOverridesEnabled || !env.burpSuite.responseOverridesFile) {
    return;
  }

  const overridePath = path.resolve(process.cwd(), env.burpSuite.responseOverridesFile);
  const parsed = JSON.parse(fs.readFileSync(overridePath, "utf8"));
  const rules = Array.isArray(parsed) ? parsed : parsed.rules;
  if (!Array.isArray(rules)) {
    throw new Error("BURP_RESPONSE_OVERRIDES_FILE must contain a JSON array or {\"rules\": []}");
  }

  responseOverrideRules = rules.filter((rule) => rule && rule.enabled !== false);
}

function requestMatchesRule(config, requestUrl, rule) {
  if (!isHostScoped(requestUrl.hostname)) return false;

  const method = String(config.method || "get").toUpperCase();
  if (rule.method && String(rule.method).toUpperCase() !== method) return false;

  if (rule.host && normalizeHost(rule.host) !== normalizeHost(requestUrl.hostname)) return false;
  if (rule.path && requestUrl.pathname !== rule.path) return false;
  if (rule.pathPrefix && !requestUrl.pathname.startsWith(rule.pathPrefix)) return false;

  return Boolean(rule.path || rule.pathPrefix);
}

function findResponseOverride(config) {
  if (!env.burpSuite.responseOverridesEnabled || responseOverrideRules.length === 0) {
    return null;
  }

  const requestUrl = resolveRequestUrl(config);
  if (!requestUrl) return null;
  return responseOverrideRules.find((rule) => requestMatchesRule(config, requestUrl, rule)) || null;
}

function applyResponseOverride(response, rule) {
  const status = Number(rule.status || 200);
  return {
    ...response,
    status,
    statusText: rule.statusText || (status >= 200 && status < 300 ? "OK" : response.statusText),
    headers: {
      ...(response.headers || {}),
      ...(rule.headers || {}),
      "x-local-burp-response-override": rule.name || "enabled"
    },
    data: Object.prototype.hasOwnProperty.call(rule, "body") ? rule.body : response.data
  };
}

function safeClone(value, depth = 0) {
  if (depth > 5) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 4000) return `${value.slice(0, 4000)}...[truncated]`;
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeClone(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value).slice(0, 80).map(([key, item]) => [
      key,
      SECRET_KEYS.test(key) ? "[redacted]" : safeClone(item, depth + 1)
    ])
  );
}

function parseRequestBody(data) {
  if (!data) return null;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (_error) {
      return data.length > 4000 ? `${data.slice(0, 4000)}...[truncated]` : data;
    }
  }
  return data;
}

function publicHeaders(headers) {
  return safeClone(headers || {});
}

function buildRequestSnapshot(config) {
  const requestUrl = resolveRequestUrl(config);
  return {
    id: config.__burpSuiteRequestId || null,
    method: String(config.method || "get").toUpperCase(),
    url: requestUrl ? requestUrl.toString() : config.url,
    host: requestUrl ? requestUrl.hostname : null,
    path: requestUrl ? `${requestUrl.pathname}${requestUrl.search || ""}` : null,
    headers: publicHeaders(config.headers),
    body: safeClone(parseRequestBody(config.data))
  };
}

function buildResponseModel(response) {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: publicHeaders(response.headers),
    body: response.data
  };
}

function pushTrafficEvent(event) {
  trafficEvents.unshift({
    id: event.id || uuidv4(),
    createdAt: new Date().toISOString(),
    ...event
  });
  trafficEvents.splice(MAX_EVENTS);
}

function pushOtpMessage(message) {
  otpMessages.unshift({
    id: message.id || uuidv4(),
    createdAt: new Date().toISOString(),
    ...safeClone(message)
  });
  otpMessages.splice(MAX_OTP_MESSAGES);
}

function isPrivateIpv4(hostname) {
  const parts = String(hostname || "").split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function isAllowedOtpTarget(targetUrl) {
  const parsed = new URL(targetUrl);
  const hostname = parsed.hostname.toLowerCase();
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    isPrivateIpv4(hostname) ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".internal");
}

function generateOtp(length = 6) {
  const digits = Math.max(4, Math.min(Number(length) || 6, 10));
  const max = 10 ** digits;
  return String(Math.floor(Math.random() * max)).padStart(digits, "0");
}

function shouldCaptureOtp(config) {
  if (!runtime.active || !runtime.otpCaptureArmed) return false;
  const requestUrl = resolveRequestUrl(config);
  if (!requestUrl || !isHostScoped(requestUrl.hostname)) return false;
  const keyword = String(runtime.otpPathKeyword || "otp").toLowerCase();
  return `${requestUrl.pathname}${requestUrl.search}`.toLowerCase().includes(keyword);
}

function waitForResponseDecision(response, pendingId) {
  const holdMs = Math.max(5, Math.min(Number(runtime.holdSeconds || DEFAULT_HOLD_SECONDS), 120)) * 1000;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingResponses.delete(pendingId);
      pushTrafficEvent({
        type: "otp-timeout",
        status: "timeout",
        request: buildRequestSnapshot(response.config || {}),
        response: buildResponseModel(response)
      });
      resolve(response);
    }, holdMs);

    pendingResponses.set(pendingId, {
      id: pendingId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + holdMs).toISOString(),
      request: buildRequestSnapshot(response.config || {}),
      response: buildResponseModel(response),
      resolve: (nextResponse) => {
        clearTimeout(timer);
        pendingResponses.delete(pendingId);
        resolve(nextResponse);
      }
    });
  });
}

function markRequest(config) {
  const requestUrl = resolveRequestUrl(config);
  if (!requestUrl || !isHostScoped(requestUrl.hostname)) return config;

  const nextConfig = { ...config };
  nextConfig.__burpSuiteRequestId = uuidv4();

  if (isProxyEnabled()) {
    nextConfig.proxy = parseProxyConfig(runtime.proxyUrl || env.burpSuite.proxyUrl);
  }

  const allowInsecureTls = Boolean(runtime.allowInsecureTls || env.burpSuite.allowInsecureTls);
  if (allowInsecureTls && requestUrl.protocol === "https:") {
    nextConfig.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }
  if (allowInsecureTls && requestUrl.protocol === "http:") {
    nextConfig.httpAgent = new http.Agent();
  }

  pushTrafficEvent({
    type: "request",
    status: "sent",
    request: buildRequestSnapshot(nextConfig)
  });

  return nextConfig;
}

async function handleResponse(response) {
  const config = response.config || {};
  const requestUrl = resolveRequestUrl(config);
  if (!requestUrl || !isHostScoped(requestUrl.hostname)) {
    return response;
  }

  const rule = findResponseOverride(config);
  if (rule) {
    const overridden = applyResponseOverride(response, rule);
    pushTrafficEvent({
      type: "response-override",
      status: overridden.status,
      request: buildRequestSnapshot(config),
      response: buildResponseModel(overridden)
    });
    return overridden;
  }

  if (shouldCaptureOtp(config)) {
    runtime.otpCaptureArmed = false;
    const pendingId = config.__burpSuiteRequestId || uuidv4();
    pushTrafficEvent({
      id: pendingId,
      type: "otp-captured",
      status: "pending",
      request: buildRequestSnapshot(config),
      response: buildResponseModel(response)
    });
    return waitForResponseDecision(response, pendingId);
  }

  pushTrafficEvent({
    type: "response",
    status: response.status,
    request: buildRequestSnapshot(config),
    response: buildResponseModel(response)
  });
  return response;
}

async function handleErrorResponse(error) {
  const response = error.response;
  const config = response?.config || error.config || {};
  const requestUrl = resolveRequestUrl(config);
  if (!requestUrl || !isHostScoped(requestUrl.hostname)) {
    return Promise.reject(error);
  }

  if (!response) {
    pushTrafficEvent({
      type: "network-error",
      status: error.code || "error",
      request: buildRequestSnapshot(config),
      response: {
        status: 0,
        statusText: error.message,
        headers: {},
        body: { error: error.message, code: error.code || null }
      }
    });
    return Promise.reject(error);
  }

  const rule = findResponseOverride(config);
  if (rule || shouldCaptureOtp(config)) {
    return handleResponse(response);
  }

  pushTrafficEvent({
    type: "response-error",
    status: response.status,
    request: buildRequestSnapshot(config),
    response: buildResponseModel(response)
  });
  return Promise.reject(error);
}

function installBurpSuiteIntegration(logger = console) {
  if (installed) return getStatus();
  if (isProduction() && isRuntimeEnabled()) {
    throw new Error("Burp Suite integration is disabled in NODE_ENV=production");
  }

  loadResponseOverrides();

  axios.interceptors.request.use((config) => {
    if (!isRuntimeEnabled()) return config;
    if (isProduction()) return config;
    return markRequest(config);
  });

  axios.interceptors.response.use(
    (response) => handleResponse(response),
    async (error) => {
      if (error && (error.config || error.response?.config)) {
        return handleErrorResponse(error);
      }
      return Promise.reject(error);
    }
  );

  installed = true;
  if (isRuntimeEnabled()) {
    logger.info(`Burp Suite integration enabled for scoped hosts: ${getScopedHosts().join(", ") || "-"}`);
  }
  return getStatus();
}

function startRuntime(options = {}) {
  if (isProduction()) {
    throw new Error("Burp Suite integration is disabled in NODE_ENV=production");
  }

  const scopeHosts = String(options.scopeHosts || "")
    .split(",")
    .map(normalizeHost)
    .filter(Boolean);
  if (scopeHosts.length === 0) {
    throw new Error("scopeHosts is required");
  }

  runtime.active = true;
  runtime.proxyEnabled = options.proxyEnabled === undefined ? true : bool(options.proxyEnabled);
  runtime.proxyUrl = options.proxyUrl || env.burpSuite.proxyUrl || "http://127.0.0.1:8080";
  runtime.scopeHosts = scopeHosts;
  runtime.allowInsecureTls = bool(options.allowInsecureTls);
  runtime.holdSeconds = Number(options.holdSeconds || DEFAULT_HOLD_SECONDS);
  installBurpSuiteIntegration();
  return getStatus();
}

function stopRuntime() {
  runtime.active = false;
  runtime.proxyEnabled = false;
  runtime.otpCaptureArmed = false;
  for (const pending of pendingResponses.values()) {
    pending.resolve({
      ...pending.response,
      config: {},
      data: pending.response.body
    });
  }
  pendingResponses.clear();
  return getStatus();
}

function armOtpCapture(options = {}) {
  if (!runtime.active) {
    throw new Error("Burp Suite integration must be started first");
  }
  runtime.otpCaptureArmed = true;
  runtime.otpPathKeyword = String(options.pathKeyword || "otp").trim() || "otp";
  runtime.holdSeconds = Number(options.holdSeconds || runtime.holdSeconds || DEFAULT_HOLD_SECONDS);
  return getStatus();
}

async function sendOtpChallenge(options = {}) {
  if (isProduction()) {
    throw new Error("OTP test sender is disabled in NODE_ENV=production");
  }

  const targetUrl = String(options.targetUrl || "").trim();
  if (!targetUrl) {
    throw new Error("targetUrl is required");
  }
  if (!isAllowedOtpTarget(targetUrl)) {
    throw new Error("OTP test sender only supports localhost, private network, .local, .test, or .internal targets");
  }

  const challengeId = uuidv4();
  const code = generateOtp(options.codeLength);
  const now = Date.now();
  const expiresAt = new Date(now + Math.max(30, Math.min(Number(options.ttlSeconds) || 300, 900)) * 1000).toISOString();
  const payload = {
    eventType: "otp.challenge",
    challengeId,
    channel: String(options.channel || "sms"),
    recipient: String(options.recipient || "local-test"),
    purpose: String(options.purpose || "local-burp-test"),
    code,
    expiresAt,
    metadata: safeClone(options.metadata || {})
  };

  if (options.armCapture) {
    armOtpCapture({
      pathKeyword: options.pathKeyword || "otp",
      holdSeconds: options.holdSeconds || runtime.holdSeconds || DEFAULT_HOLD_SECONDS
    });
  }

  pushTrafficEvent({
    id: challengeId,
    type: "otp-send-start",
    status: "pending",
    request: {
      id: challengeId,
      method: "POST",
      url: targetUrl,
      host: new URL(targetUrl).hostname,
      path: new URL(targetUrl).pathname,
      headers: {},
      body: safeClone(payload)
    }
  });

  const response = await axios.post(targetUrl, payload, {
    timeout: 15000,
    headers: {
      "content-type": "application/json",
      "x-local-otp-simulator": "PaymentApi"
    }
  });

  pushTrafficEvent({
    id: challengeId,
    type: "otp-send-complete",
    status: response.status,
    request: buildRequestSnapshot(response.config || {}),
    response: buildResponseModel(response)
  });

  return {
    ok: true,
    challengeId,
    targetUrl,
    status: response.status,
    burpActive: runtime.active,
    proxyEnabled: isProxyEnabled(),
    scopeHosts: getScopedHosts(),
    response: safeClone(response.data)
  };
}

function recordOtpInbox(message = {}) {
  const record = {
    id: message.challengeId || uuidv4(),
    channel: message.channel || "unknown",
    recipient: message.recipient || "-",
    purpose: message.purpose || "-",
    expiresAt: message.expiresAt || null,
    body: safeClone(message)
  };
  pushOtpMessage(record);
  pushTrafficEvent({
    id: record.id,
    type: "otp-inbox",
    status: "received",
    request: {
      id: record.id,
      method: "POST",
      url: "/api/security/burp-suite/otp/inbox",
      host: "local-api",
      path: "/api/security/burp-suite/otp/inbox",
      headers: {},
      body: record.body
    }
  });
  return record;
}

function resolvePendingResponse(pendingId, model = {}) {
  const pending = pendingResponses.get(pendingId);
  if (!pending) {
    throw new Error("Pending response not found or already released");
  }

  const status = Number(model.status || pending.response.status || 200);
  const nextResponse = {
    status,
    statusText: model.statusText || (status >= 200 && status < 300 ? "OK" : pending.response.statusText),
    headers: {
      ...(pending.response.headers || {}),
      ...(model.headers || {}),
      "x-local-burp-ui-override": "true"
    },
    data: Object.prototype.hasOwnProperty.call(model, "body") ? model.body : pending.response.body,
    config: {}
  };

  pushTrafficEvent({
    id: pendingId,
    type: "otp-released",
    status,
    request: pending.request,
    response: buildResponseModel(nextResponse)
  });

  pending.resolve(nextResponse);
  return { ok: true, id: pendingId };
}

function getPendingResponses() {
  return Array.from(pendingResponses.values()).map((pending) => ({
    id: pending.id,
    createdAt: pending.createdAt,
    expiresAt: pending.expiresAt,
    request: pending.request,
    response: pending.response
  }));
}

function getTrafficEvents(limit = 50) {
  return trafficEvents.slice(0, Math.max(1, Math.min(Number(limit) || 50, MAX_EVENTS)));
}

function getOtpMessages(limit = 20) {
  return otpMessages.slice(0, Math.max(1, Math.min(Number(limit) || 20, MAX_OTP_MESSAGES)));
}

function getStatus() {
  return {
    installed,
    active: runtime.active,
    enabled: Boolean(env.burpSuite.enabled),
    proxyEnabled: isProxyEnabled(),
    proxyUrl: runtime.proxyUrl || env.burpSuite.proxyUrl,
    scopeHosts: getScopedHosts(),
    allowInsecureTls: Boolean(runtime.allowInsecureTls || env.burpSuite.allowInsecureTls),
    otpCaptureArmed: runtime.otpCaptureArmed,
    otpPathKeyword: runtime.otpPathKeyword,
    holdSeconds: runtime.holdSeconds,
    pendingResponses: pendingResponses.size,
    trafficEvents: trafficEvents.length,
    responseOverridesEnabled: Boolean(env.burpSuite.responseOverridesEnabled),
    responseOverridesFile: env.burpSuite.responseOverridesFile || null,
    responseOverrideRules: responseOverrideRules.length,
    productionBlocked: isProduction() && isRuntimeEnabled()
  };
}

module.exports = {
  armOtpCapture,
  getOtpMessages,
  getPendingResponses,
  getStatus,
  getTrafficEvents,
  installBurpSuiteIntegration,
  recordOtpInbox,
  resolvePendingResponse,
  sendOtpChallenge,
  startRuntime,
  stopRuntime
};
