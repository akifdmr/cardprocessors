const state = {
  token: "",
  user: null,
  cards: [],
  checksByCardId: {},
  selectedCardId: null,
  users: [],
  auditLogs: [],
  paymentProviders: null,
  voiceProviders: null,
  voiceDevice: null,
  activeVoiceCall: null
};

const elements = {
  loginView: document.getElementById("loginView"),
  appView: document.getElementById("appView"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  welcomeTitle: document.getElementById("welcomeTitle"),
  identityName: document.getElementById("identityName"),
  identityRole: document.getElementById("identityRole"),
  logoutButton: document.getElementById("logoutButton"),
  cardsTableBody: document.getElementById("cardsTableBody"),
  metricCards: document.getElementById("metricCards"),
  metricEnrolled: document.getElementById("metricEnrolled"),
  metricChecks: document.getElementById("metricChecks"),
  addCardToggle: document.getElementById("addCardToggle"),
  cardWorkspace: document.getElementById("cardWorkspace"),
  cardCreatePanel: document.getElementById("cardCreatePanel"),
  selectedCardPanel: document.getElementById("selectedCardPanel"),
  addressFieldsToggle: document.getElementById("addressFieldsToggle"),
  addressFields: document.getElementById("addressFields"),
  cardOptions: document.getElementById("cardOptions"),
  cardForm: document.getElementById("cardForm"),
  checkForm: document.getElementById("checkForm"),
  checksList: document.getElementById("checksList"),
  selectedCardTitle: document.getElementById("selectedCardTitle"),
  selectedCardMeta: document.getElementById("selectedCardMeta"),
  enrollmentForm: document.getElementById("enrollmentForm"),
  enrollmentDetails: document.getElementById("enrollmentDetails"),
  adminUsersPanel: document.getElementById("adminUsersPanel"),
  userForm: document.getElementById("userForm"),
  usersList: document.getElementById("usersList"),
  auditLogsList: document.getElementById("auditLogsList"),
  paymentProvidersList: document.getElementById("paymentProvidersList"),
  voiceProvidersList: document.getElementById("voiceProvidersList"),
  validationForm: document.getElementById("validationForm"),
  validationResult: document.getElementById("validationResult"),
  maskForm: document.getElementById("maskForm"),
  maskResult: document.getElementById("maskResult"),
  callForm: document.getElementById("callForm"),
  callResult: document.getElementById("callResult"),
  providerVerificationForm: document.getElementById("providerVerificationForm"),
  providerVerificationResult: document.getElementById("providerVerificationResult"),
  paypalRestTestForm: document.getElementById("paypalRestTestForm"),
  paypalRestTestResult: document.getElementById("paypalRestTestResult"),
  paypalManagerTestForm: document.getElementById("paypalManagerTestForm"),
  paypalManagerStatusResult: document.getElementById("paypalManagerStatusResult"),
  paypalManagerInquiryForm: document.getElementById("paypalManagerInquiryForm"),
  paypalManagerInquiryResult: document.getElementById("paypalManagerInquiryResult"),
  paypalBinCheckForm: document.getElementById("paypalBinCheckForm"),
  paypalBinCheckResult: document.getElementById("paypalBinCheckResult"),
  paypalLiveCheckForm: document.getElementById("paypalLiveCheckForm"),
  paypalLiveCheckResult: document.getElementById("paypalLiveCheckResult"),
  paypalAuthForm: document.getElementById("paypalAuthForm"),
  paypalAuthResult: document.getElementById("paypalAuthResult"),
  paypalCaptureForm: document.getElementById("paypalCaptureForm"),
  paypalCaptureResult: document.getElementById("paypalCaptureResult"),
  cloverPreauthForm: document.getElementById("cloverPreauthForm"),
  cloverPreauthResult: document.getElementById("cloverPreauthResult"),
  cloverRefundForm: document.getElementById("cloverRefundForm"),
  cloverRefundResult: document.getElementById("cloverRefundResult"),
  cloverVoidForm: document.getElementById("cloverVoidForm"),
  cloverVoidResult: document.getElementById("cloverVoidResult"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalEyebrow: document.getElementById("modalEyebrow"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
  pageSections: document.querySelectorAll("[data-page]"),
  routeLinks: document.querySelectorAll("[data-route-link]")
};

const API_PREFIX = "/api";

function setView(loggedIn) {
  elements.loginView.hidden = loggedIn;
  elements.appView.hidden = !loggedIn;
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${state.token}`
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (response.status === 401) {
    if (path === "/auth/login") {
      throw new Error(data?.error || "Invalid credentials");
    }

    if (state.token) {
      logout();
      throw new Error("Session expired");
    }

    throw new Error(data?.error || "Authentication required");
  }

  if (!response.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

async function getTwilioDeviceConstructor() {
  if (window.Twilio?.Device) {
    return window.Twilio.Device;
  }

  const module = await import("https://esm.sh/@twilio/voice-sdk@2.12.3");
  return module.Device;
}

async function ensureVoiceDevice() {
  if (state.voiceDevice) {
    return state.voiceDevice;
  }

  const token = await api("/voice/token");
  const Device = await getTwilioDeviceConstructor();
  const device = new Device(token.token, {
    closeProtection: true,
    codecPreferences: ["opus", "pcmu"]
  });

  device.on("error", (error) => {
    renderCallResult(null, error.message || "Voice device error");
  });

  state.voiceDevice = device;
  return device;
}

function logout() {
  fetch(`${API_PREFIX}/auth/logout`, { method: "POST" }).catch(() => {});
  state.token = "";
  state.user = null;
  state.cards = [];
  state.selectedCardId = null;
  localStorage.removeItem("clover_panel_token");
  setView(false);
  window.location.hash = "#/";
}

function can(permission) {
  return Boolean(state.user?.permissions?.[permission]);
}

function currentCard() {
  return state.cards.find((card) => card.id === state.selectedCardId) || null;
}

function parseMaybeJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formToObject(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
}

function removeEmptyFields(payload) {
  for (const [key, value] of Object.entries(payload)) {
    if (value === "") {
      delete payload[key];
    }
  }
  return payload;
}

function updateIdentity() {
  if (!state.user) {
    return;
  }

  elements.welcomeTitle.textContent = `Welcome, ${state.user.displayName || state.user.username}`;
  elements.identityName.textContent = state.user.username;
  elements.identityRole.textContent = state.user.role;
  elements.adminUsersPanel.hidden = !can("canManageUsers");
  elements.routeLinks.forEach((link) => {
    if (link.dataset.routeLink === "users") {
      link.hidden = !can("canManageUsers");
    }
  });
}

function getCurrentRoute() {
  const hash = window.location.hash || "#/cards";
  return hash.replace(/^#\//, "") || "cards";
}

function renderRoute() {
  const route = getCurrentRoute();
  const allowedRoutes = new Set(["cards", "provision", "charge", "checkers", "users", "logs"]);
  const requestedRoute = allowedRoutes.has(route) ? route : "cards";
  const activeRoute = requestedRoute === "users" && !can("canManageUsers") ? "cards" : requestedRoute;

  if (activeRoute !== route) {
    window.location.hash = `#/${activeRoute}`;
    return;
  }

  elements.pageSections.forEach((section) => {
    const sectionRoute = section.dataset.page;
    section.hidden = sectionRoute !== activeRoute;
  });

  elements.routeLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.routeLink === activeRoute);
  });
}

function showCardsRoute() {
  if (window.location.hash !== "#/cards") {
    window.location.hash = "#/cards";
  }
  renderRoute();
}

function renderPaymentProviders() {
  if (!state.paymentProviders) {
    elements.paymentProvidersList.innerHTML = `<article class="list-card">Provider config not loaded yet.</article>`;
    return;
  }

  elements.paymentProvidersList.innerHTML = Object.entries(state.paymentProviders).map(([key, provider]) => `
    <article class="list-card">
      <strong>${escapeHtml(key.toUpperCase())}</strong>
      <div>Base URL: ${escapeHtml(provider.baseUrl || "-")}</div>
      <div>${key === "clover" ? `Merchant ID: ${escapeHtml(provider.merchantId || "-")}` : `REST: ${provider.restConfigured ? "configured" : "missing config"}`}</div>
      ${provider.nvp ? `<div>NVP/SOAP: ${provider.nvp.configured ? "configured" : "missing config"} · ${escapeHtml(provider.nvp.baseUrl || "-")}</div>` : ""}
      ${provider.manager ? `<div>Manager: ${provider.manager.configured ? "configured" : "missing config"} · ${escapeHtml(provider.manager.baseUrl || "-")}</div>` : ""}
    </article>
  `).join("");
}

function renderVoiceProviders() {
  if (!state.voiceProviders) {
    elements.voiceProvidersList.innerHTML = `<article class="list-card">Voice provider status not loaded yet.</article>`;
    return;
  }

  elements.voiceProvidersList.innerHTML = `
    <article class="list-card">
      <div><span class="status-pill">Primary ${escapeHtml(state.voiceProviders.primaryProvider)}</span></div>
      <div style="margin-top:10px">${state.voiceProviders.providers.map((provider) => `
        <div><strong>${escapeHtml(provider.name)}</strong> · supports unverified: ${provider.supportsUnverified ? "yes" : "no"}</div>
      `).join("")}</div>
    </article>
  `;
}

function updateMetrics() {
  const checks = Object.values(state.checksByCardId).flat();
  elements.metricCards.textContent = String(state.cards.length);
  elements.metricEnrolled.textContent = String(state.cards.filter((card) => card.is_enrolled).length);
  elements.metricChecks.textContent = String(checks.length);
}

function checksForCard(cardId) {
  return state.checksByCardId[cardId] || [];
}

function latestCheck(cardId, type) {
  return checksForCard(cardId).find((item) => item.attempt_type === type) || null;
}

function checksByStatus(cardId, type, statuses = []) {
  const wanted = new Set(statuses);
  return checksForCard(cardId).filter((item) => item.attempt_type === type && (!statuses.length || wanted.has(item.status)));
}

function statusClass(value) {
  const status = String(value || "").toLowerCase();
  if (["approved", "verified", "passed", "success"].includes(status)) return "status-good";
  if (["declined", "failed", "invalid"].includes(status)) return "status-bad";
  return "status-warn";
}

function renderCardOptions() {
  if (!elements.cardOptions) {
    return;
  }

  elements.cardOptions.innerHTML = state.cards.map((card) => `
    <option value="${escapeHtml(card.id)}">${escapeHtml(card.masked_pan || card.id)} · ${escapeHtml(card.cardholder_name || "-")}</option>
  `).join("");
}

function openModal({ eyebrow = "History", title = "Card History", body = "" }) {
  elements.modalEyebrow.textContent = eyebrow;
  elements.modalTitle.textContent = title;
  elements.modalBody.innerHTML = body;
  elements.modalOverlay.hidden = false;
}

function closeModal() {
  elements.modalOverlay.hidden = true;
  elements.modalBody.innerHTML = "";
}

function enrollmentButtonLabel(card) {
  if (card.is_enrolled) {
    return "Enrolled";
  }
  return "Enroll";
}

function renderCards() {
  elements.cardsTableBody.innerHTML = "";
  renderCardOptions();

  for (const card of state.cards) {
    const row = document.createElement("tr");
    const canCreateEnrollment = can("canCreateEnrollment") && !card.is_enrolled;
    const canViewEnrollment = can("canViewEnrollment") && card.is_enrolled;
    const binCheck = latestCheck(card.id, "bin_check");
    const liveCheck = latestCheck(card.id, "live_check");
    const balanceCheck = latestCheck(card.id, "balance_check");
    const liveClass = liveCheck ? statusClass(liveCheck.status) : "status-warn";
    const binClass = binCheck ? statusClass(binCheck.status) : "status-warn";
    const safeCardId = escapeHtml(card.id);

    row.innerHTML = `
      <td>${escapeHtml(card.masked_pan || "-")}</td>
      <td>${escapeHtml(balanceCheck?.balance_amount ?? balanceCheck?.amount ?? "-")}</td>
      <td>${escapeHtml(card.cardholder_name || "-")}</td>
      <td>
        <span class="status-pill ${binClass}">BIN ${escapeHtml(binCheck?.status || "none")}</span>
        <span class="status-pill ${liveClass}">LIVE ${escapeHtml(liveCheck?.status || "none")}</span>
      </td>
      <td>
        <div class="row-actions">
          <button class="small ghost" data-action="select" data-card-id="${safeCardId}">Open</button>
          <button class="small ghost" data-action="verify-number" data-card-id="${safeCardId}">Verify Number</button>
          <button class="small ghost" data-action="history" data-card-id="${safeCardId}">History</button>
          ${canCreateEnrollment ? `<button class="small primary" data-action="enroll" data-card-id="${safeCardId}">${escapeHtml(enrollmentButtonLabel(card))}</button>` : ""}
          ${canViewEnrollment ? `<button class="small ghost" data-action="view-enroll" data-card-id="${safeCardId}">View Enroll</button>` : ""}
        </div>
      </td>
      <td>
        <button class="small primary" data-action="call-card" data-card-id="${safeCardId}">Call</button>
      </td>
    `;
    elements.cardsTableBody.appendChild(row);
  }
}

function renderChecks() {
  const cardId = state.selectedCardId;
  const items = state.checksByCardId[cardId] || [];

  if (!cardId) {
    elements.checksList.innerHTML = "";
    return;
  }

  elements.checksList.innerHTML = items.length
    ? items.map((item) => `
      <article class="list-card">
        <strong>${escapeHtml(item.attempt_type || "-")}</strong> · ${escapeHtml(item.status || "-")}
        <div>${escapeHtml(item.provider || "-")} · ${escapeHtml(item.created_at || "-")}</div>
        <div>Amount: ${escapeHtml(item.amount ?? "-")} ${escapeHtml(item.currency || "")}</div>
        <div>Balance: ${escapeHtml(item.balance_amount ?? "-")}</div>
        <pre>${escapeHtml(JSON.stringify(item.raw_response, null, 2))}</pre>
      </article>
    `).join("")
    : `<article class="list-card">No checks yet for this card.</article>`;
}

function renderCardHistory(cardId) {
  const card = state.cards.find((item) => item.id === cardId);
  const checks = checksForCard(cardId);
  const logs = state.auditLogs.filter((log) => log.entity_type === "card" && log.entity_id === cardId);
  const body = `
    <article class="list-card">
      <strong>${escapeHtml(card?.masked_pan || cardId)}</strong>
      <div>${escapeHtml(card?.cardholder_name || "-")} · ${escapeHtml(card?.provider || "-")}</div>
    </article>
    ${checks.length ? checks.map((item) => `
      <article class="list-card">
        <strong>${escapeHtml(item.attempt_type)}</strong> · <span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
        <div>${escapeHtml(item.provider)} · ${escapeHtml(item.created_at)}</div>
        <div>Amount: ${escapeHtml(item.amount ?? "-")} ${escapeHtml(item.currency || "")}</div>
        <div>Balance: ${escapeHtml(item.balance_amount ?? "-")}</div>
        <div>User: ${escapeHtml(item.created_by_user_id || "-")}</div>
        <pre>${escapeHtml(JSON.stringify(item.raw_response, null, 2))}</pre>
      </article>
    `).join("") : `<article class="list-card">No card checks yet.</article>`}
    ${can("canManageUsers") && logs.length ? logs.map((log) => `
      <article class="list-card">
        <strong>${escapeHtml(log.action)}</strong> · <span class="status-pill ${statusClass(log.status)}">${escapeHtml(log.status)}</span>
        <div>${escapeHtml(log.created_at)} · Actor: ${escapeHtml(log.actor_user_id || "-")}</div>
        <pre>${escapeHtml(JSON.stringify(log.details, null, 2))}</pre>
      </article>
    `).join("") : ""}
  `;

  openModal({
    eyebrow: "Admin History",
    title: "Card Logs",
    body
  });
}

function renderEnrollmentDetails(data) {
  if (!data) {
    elements.enrollmentDetails.hidden = true;
    elements.enrollmentDetails.innerHTML = "";
    return;
  }

  elements.enrollmentDetails.hidden = false;
  elements.enrollmentDetails.innerHTML = `
    <article class="list-card">
      <strong>Enrollment Details</strong>
      <div>Bank URL: ${escapeHtml(data.enrollBankUrl || "-")}</div>
      <div>Username: ${escapeHtml(data.username || "-")}</div>
      <div>Password: ${escapeHtml(data.password || "-")}</div>
      <div>SSN Last4: ${escapeHtml(data.holderSsnLast4 || "-")}</div>
      <div>DOB: ${escapeHtml(data.holderDob || "-")}</div>
      <pre>${escapeHtml(data.freeText || "")}</pre>
    </article>
  `;
}

function renderSelectedCard() {
  const card = currentCard();
  if (!card) {
    elements.selectedCardPanel.hidden = true;
    elements.cardWorkspace.classList.add("single-column");
    elements.selectedCardTitle.textContent = "No card selected";
    elements.selectedCardMeta.textContent = "Select a card from the table to view checks and enrollment actions.";
    elements.checkForm.hidden = true;
    elements.enrollmentForm.hidden = true;
    renderEnrollmentDetails(null);
    renderChecks();
    return;
  }

  elements.selectedCardPanel.hidden = false;
  elements.cardWorkspace.classList.toggle("single-column", elements.cardCreatePanel.hidden);
  elements.selectedCardTitle.textContent = card.masked_pan || card.id;
  elements.selectedCardMeta.textContent = `${card.cardholder_name || "Unknown holder"} · ${card.brand || "Unknown brand"} · ${card.verification_status || "pending"}`;

  const showCheckForm = can("canRunLiveCheck") || can("canRunBinCheck") || can("canRunBalanceCheck") || can("canRunAuthCheck");
  elements.checkForm.hidden = !showCheckForm;
  elements.enrollmentForm.hidden = !(can("canCreateEnrollment") && !card.is_enrolled);
  renderChecks();
}

function renderUsers() {
  if (!can("canManageUsers")) {
    elements.usersList.innerHTML = "";
    return;
  }

  elements.usersList.innerHTML = state.users.length
    ? state.users.map((user) => `
      <article class="list-card">
        <strong>${escapeHtml(user.username)}</strong> · ${escapeHtml(user.role)}
        <div>${escapeHtml(user.display_name || "-")}</div>
        <div>Balance check: ${user.can_balance_check ? "yes" : "no"}</div>
        <div>View balance: ${user.can_view_balance ? "yes" : "no"}</div>
        <div>Active: ${user.is_active ? "yes" : "no"}</div>
      </article>
    `).join("")
    : `<article class="list-card">No users found.</article>`;
}

function renderAuditLogs() {
  elements.auditLogsList.innerHTML = state.auditLogs.length
    ? state.auditLogs.map((log) => `
      <article class="list-card">
        <strong>${escapeHtml(log.action)}</strong> · ${escapeHtml(log.status)}
        <div>${escapeHtml(log.entity_type)} · ${escapeHtml(log.entity_id || "-")}</div>
        <div>${escapeHtml(log.created_at)}</div>
        <pre>${escapeHtml(JSON.stringify(log.details, null, 2))}</pre>
      </article>
    `).join("")
    : `<article class="list-card">No audit logs found.</article>`;
}

function renderValidationResult(result) {
  if (!result) {
    elements.validationResult.innerHTML = "";
    return;
  }

  elements.validationResult.innerHTML = `
    <article class="list-card">
      <div><span class="status-pill">${result.isValid ? "valid" : "invalid"}</span></div>
      <div>Masked PAN: ${escapeHtml(result.maskedPan || "-")}</div>
      <div>BIN: ${escapeHtml(result.first6 || "-")} · Last4: ${escapeHtml(result.last4 || "-")}</div>
      <div>Brand: ${escapeHtml(result.brand || "-")}</div>
      <pre>${escapeHtml(JSON.stringify(result.issues || [], null, 2))}</pre>
    </article>
  `;
}

function renderMaskResult(result) {
  if (!result) {
    elements.maskResult.innerHTML = "";
    return;
  }

  elements.maskResult.innerHTML = `
    <article class="list-card">
      <strong>Mask Session</strong>
      <div>Masked From: ${escapeHtml(result.maskedNumber || "-")}</div>
      <div>Masked To: ${escapeHtml(result.targetMasked || "-")}</div>
      <div>Session: ${escapeHtml(result.sessionId || "-")}</div>
      <div>Expires: ${escapeHtml(result.expiresAt || "-")}</div>
    </article>
  `;
}

function renderCallResult(result, error = null) {
  if (error) {
    elements.callResult.innerHTML = `<article class="list-card"><strong>Call Test Failed</strong><div>${escapeHtml(error)}</div></article>`;
    return;
  }

  if (!result) {
    elements.callResult.innerHTML = "";
    return;
  }

  elements.callResult.innerHTML = `
    <article class="list-card">
      <strong>Call Routed</strong>
      <div>Provider: ${escapeHtml(result.provider || "-")}</div>
      <div>Masked From: ${escapeHtml(result.maskedFrom || "-")}</div>
      <div>Masked To: ${escapeHtml(result.maskedTo || "-")}</div>
      <div>Call Id: ${escapeHtml(result.callId || "-")}</div>
    </article>
  `;
}

function renderProviderVerificationResult(result) {
  if (!result) {
    elements.providerVerificationResult.innerHTML = "";
    return;
  }

  elements.providerVerificationResult.innerHTML = `
    <article class="list-card">
      <strong>Verification Recorded</strong>
      <div>Card: ${escapeHtml(result.cardId || "-")}</div>
      <div>Status: ${escapeHtml(result.verificationStatus || "-")}</div>
    </article>
  `;
}

function renderGenericProviderResult(target, title, payload) {
  target.innerHTML = `
    <article class="list-card">
      <strong>${escapeHtml(title)}</strong>
      <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadChecks(cardId) {
  state.checksByCardId[cardId] = await api(`/cards/${cardId}/checks`);
}

async function refreshCardChecks(cardId) {
  await loadChecks(cardId);
  updateMetrics();
  if (state.selectedCardId === cardId) {
    renderChecks();
  }
}

async function ensureCardPhoneNumber(cardId) {
  const existing = await api(`/numbers/card/${cardId}`);
  if (existing.data?.length) {
    return existing.data[0];
  }

  const phoneNumber = window.prompt("Card phone number");
  if (!phoneNumber) {
    throw new Error("Phone number is required");
  }

  const created = await api("/numbers/add", {
    method: "POST",
    body: JSON.stringify({
      cardId,
      phoneNumber,
      addedBy: state.user?.username || "panel"
    })
  });

  return created.data;
}

async function verifyCardNumber(cardId) {
  const number = await ensureCardPhoneNumber(cardId);
  if (!window.confirm(`Verify ${number.phoneNumber} with Twilio OTP?`)) {
    throw new Error("Verification cancelled");
  }
  const channel = window.prompt("Verification channel", "sms") || "sms";
  await api(`/numbers/${number.id}/twilio/start`, {
    method: "POST",
    body: JSON.stringify({ channel })
  });

  const code = window.prompt(`OTP code sent to ${number.phoneNumber}`);
  if (!code) {
    throw new Error("OTP code is required");
  }

  return api(`/numbers/${number.id}/twilio/check`, {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

async function callCardNumber(cardId) {
  await ensureCardPhoneNumber(cardId);
  const realTo = window.prompt("Number to call");
  if (!realTo) {
    throw new Error("Destination number is required");
  }

  return api("/calls/card", {
    method: "POST",
    body: JSON.stringify({ cardId, realTo })
  });
}

async function loadEnrollment(cardId) {
  try {
    const data = await api(`/cards/${cardId}/enrollment`);
    renderEnrollmentDetails(data);
  } catch (error) {
    renderEnrollmentDetails(null);
    alert(error.message);
  }
}

async function loadUsers() {
  if (!can("canManageUsers")) {
    state.users = [];
    renderUsers();
    return;
  }

  state.users = await api("/users");
  renderUsers();
}

async function loadAuditLogs() {
  state.auditLogs = await api("/audit-logs");
  renderAuditLogs();
}

async function loadProviderData() {
  state.paymentProviders = await api("/config/providers");
  state.voiceProviders = await api("/provider-router/status");
  renderPaymentProviders();
  renderVoiceProviders();
}

async function loadCards() {
  state.cards = await api("/cards");
  await Promise.all(state.cards.map(async (card) => {
    try {
      await loadChecks(card.id);
    } catch (_error) {
      state.checksByCardId[card.id] = [];
    }
  }));
  renderCards();
  updateMetrics();

  if (state.selectedCardId && state.cards.some((card) => card.id === state.selectedCardId)) {
    await loadChecks(state.selectedCardId);
  }

  renderSelectedCard();
}

async function bootAuthenticatedApp() {
  state.user = await api("/auth/me");
  setView(true);
  updateIdentity();
  showCardsRoute();
  await loadUsers();
  await loadCards();
  await loadAuditLogs();
  await loadProviderData();
  showCardsRoute();
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginError.hidden = true;

  const payload = formToObject(elements.loginForm);

  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    state.token = data.token || "";
    await bootAuthenticatedApp();
    elements.loginForm.reset();
  } catch (error) {
    elements.loginError.hidden = false;
    elements.loginError.textContent = error.message;
  }
});

elements.logoutButton.addEventListener("click", () => {
  logout();
});

elements.addCardToggle?.addEventListener("click", () => {
  elements.cardCreatePanel.hidden = !elements.cardCreatePanel.hidden;
  if (!elements.cardCreatePanel.hidden) {
    state.selectedCardId = null;
    renderSelectedCard();
  }
  elements.cardWorkspace.classList.toggle("single-column", elements.selectedCardPanel.hidden);
  if (!elements.cardCreatePanel.hidden) {
    elements.cardCreatePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

elements.addressFieldsToggle?.addEventListener("click", () => {
  elements.addressFields.hidden = !elements.addressFields.hidden;
});

elements.modalClose?.addEventListener("click", closeModal);
elements.modalOverlay?.addEventListener("click", (event) => {
  if (event.target === elements.modalOverlay) {
    closeModal();
  }
});

elements.cardForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = removeEmptyFields(formToObject(elements.cardForm));
  const pan = String(payload.pan || "").replace(/\D/g, "");
  delete payload.pan;
  delete payload.cvv2;

  if (pan.length < 12) {
    alert("Card number is required");
    return;
  }

  payload.provider = "paypal";
  payload.last4 = pan.slice(-4);
  payload.providerPaymentToken = `manual_${Date.now()}_${payload.last4}`;

  try {
    await api("/cards", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    elements.cardForm.reset();
    elements.addressFields.hidden = true;
    await loadCards();
    elements.cardCreatePanel.hidden = true;
    elements.cardWorkspace.classList.toggle("single-column", elements.selectedCardPanel.hidden);
  } catch (error) {
    alert(error.message);
  }
});

elements.validationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.validationForm);

  try {
    const result = await api("/cards/validate-input", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderValidationResult(result);
    await loadAuditLogs();
  } catch (error) {
    renderValidationResult({
      isValid: false,
      issues: [error.message]
    });
  }
});

elements.checkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const card = currentCard();
  if (!card) {
    return;
  }

  const payload = formToObject(elements.checkForm);
  if (payload.amount === "") {
    delete payload.amount;
  }
  if (payload.balanceAmount === "") {
    delete payload.balanceAmount;
  }
  payload.rawResponse = parseMaybeJson(payload.rawResponse);

  try {
    await api(`/cards/${card.id}/checks`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await loadChecks(card.id);
    updateMetrics();
    renderChecks();
    await loadAuditLogs();
    elements.checkForm.reset();
  } catch (error) {
    alert(error.message);
  }
});

elements.enrollmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const card = currentCard();
  if (!card) {
    return;
  }

  const payload = formToObject(elements.enrollmentForm);
  try {
    await api(`/cards/${card.id}/enrollment`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    elements.enrollmentForm.reset();
    await loadCards();
    await loadAuditLogs();
    if (can("canViewEnrollment")) {
      await loadEnrollment(card.id);
    }
  } catch (error) {
    alert(error.message);
  }
});

elements.maskForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.maskForm);

  try {
    const result = await api("/masks/create", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderMaskResult(result);
  } catch (error) {
    renderMaskResult({
      maskedNumber: "-",
      targetMasked: "-",
      sessionId: error.message,
      expiresAt: "-"
    });
  }
});

elements.callForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.callForm);

  try {
    const result = await api("/calls/initiate", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderCallResult(result);
  } catch (error) {
    renderCallResult(null, error.message);
  }
});

elements.providerVerificationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.providerVerificationForm);
  const cardId = payload.cardId;
  delete payload.cardId;

  try {
    const result = await api(`/cards/${cardId}/provider-verification`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderProviderVerificationResult(result);
    await loadCards();
    await loadAuditLogs();
  } catch (error) {
    renderProviderVerificationResult({
      cardId,
      verificationStatus: error.message
    });
  }
});

elements.paypalRestTestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const result = await api("/providers/paypal/rest/test");
    renderGenericProviderResult(elements.paypalRestTestResult, "PayPal REST Result", result);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalRestTestResult, "PayPal REST Error", { error: error.message });
  }
});

elements.paypalManagerTestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const status = await api("/providers/paypal/manager/status");
    const result = await api("/providers/paypal/manager/test", { method: "POST" });
    renderGenericProviderResult(elements.paypalManagerStatusResult, "PayPal Manager Result", { status, result });
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalManagerStatusResult, "PayPal Manager Error", { error: error.message });
  }
});

elements.paypalManagerInquiryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.paypalManagerInquiryForm);

  try {
    const result = await api("/providers/paypal/manager/inquiry", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paypalManagerInquiryResult, "PayPal Manager Inquiry", result);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalManagerInquiryResult, "PayPal Manager Inquiry Error", { error: error.message });
  }
});

elements.paypalBinCheckForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.paypalBinCheckForm);

  try {
    const result = await api("/providers/paypal/manager/cards/bin-check", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paypalBinCheckResult, "PayPal BIN Check", result);
    await refreshCardChecks(payload.cardId);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalBinCheckResult, "PayPal BIN Check Error", { error: error.message });
  }
});

elements.paypalLiveCheckForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.paypalLiveCheckForm);
  payload.amount = Number(payload.amount || 0);

  try {
    const result = await api("/providers/paypal/manager/cards/live-check", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paypalLiveCheckResult, "PayPal Live Check", result);
    await refreshCardChecks(payload.cardId);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalLiveCheckResult, "PayPal Live Check Error", { error: error.message });
  }
});

elements.paypalAuthForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.paypalAuthForm);
  payload.amount = Number(payload.amount);

  try {
    const result = await api("/providers/paypal/manager/cards/auth", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paypalAuthResult, "PayPal Authorization", result);
    await loadCards();
    await refreshCardChecks(payload.cardId);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalAuthResult, "PayPal Authorization Error", { error: error.message });
  }
});

elements.paypalCaptureForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.paypalCaptureForm);
  payload.amount = Number(payload.amount);
  payload.captureComplete = payload.captureComplete !== "false";

  if (!payload.cardId) {
    delete payload.cardId;
  }
  if (!payload.authorizationPnref) {
    delete payload.authorizationPnref;
  }

  try {
    const result = await api("/providers/paypal/manager/cards/capture", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paypalCaptureResult, "PayPal Capture", result);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalCaptureResult, "PayPal Capture Error", { error: error.message });
  }
});

elements.cloverPreauthForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.cloverPreauthForm);
  payload.amount = Number(payload.amount);

  try {
    const result = await api("/providers/clover/preauth", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.cloverPreauthResult, "Clover Preauth Result", result);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.cloverPreauthResult, "Clover Preauth Error", { error: error.message });
  }
});

elements.cloverRefundForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.cloverRefundForm);
  payload.amount = Number(payload.amount);

  try {
    const result = await api("/providers/clover/refund", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.cloverRefundResult, "Clover Refund Result", result);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.cloverRefundResult, "Clover Refund Error", { error: error.message });
  }
});

elements.cloverVoidForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.cloverVoidForm);

  try {
    const result = await api("/providers/clover/void", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.cloverVoidResult, "Clover Void Result", result);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.cloverVoidResult, "Clover Void Error", { error: error.message });
  }
});

elements.userForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.userForm);
  payload.canBalanceCheck = payload.canBalanceCheck === "on";
  payload.canViewBalance = payload.canViewBalance === "on";

  try {
    await api("/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    elements.userForm.reset();
    await loadUsers();
    await loadAuditLogs();
  } catch (error) {
    alert(error.message);
  }
});

elements.cardsTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const { action, cardId } = button.dataset;
  state.selectedCardId = cardId;
  if (elements.providerVerificationForm?.elements?.cardId) {
    elements.providerVerificationForm.elements.cardId.value = cardId;
  }
  if (elements.paypalBinCheckForm?.elements?.cardId) {
    elements.paypalBinCheckForm.elements.cardId.value = cardId;
  }
  if (elements.paypalLiveCheckForm?.elements?.cardId) {
    elements.paypalLiveCheckForm.elements.cardId.value = cardId;
  }
  if (elements.paypalAuthForm?.elements?.cardId) {
    elements.paypalAuthForm.elements.cardId.value = cardId;
  }
  if (elements.paypalCaptureForm?.elements?.cardId) {
    elements.paypalCaptureForm.elements.cardId.value = cardId;
  }

  if (action === "select" || action === "enroll") {
    await loadChecks(cardId);
    renderSelectedCard();
  }

  if (action === "view-enroll") {
    await loadEnrollment(cardId);
  }

  if (action === "verify-number") {
    try {
      const result = await verifyCardNumber(cardId);
      alert(result.success ? "Number verified" : "Verification failed");
      await loadCards();
    } catch (error) {
      alert(error.message);
    }
  }

  if (action === "history") {
    if (!can("canManageUsers")) {
      alert("Only admin can view history");
      return;
    }
    await loadChecks(cardId);
    await loadAuditLogs();
    renderCardHistory(cardId);
  }

  if (action === "call-card") {
    try {
      const result = await callCardNumber(cardId);
      renderCallResult(result);
      window.location.hash = "#/checkers";
    } catch (error) {
      alert(error.message);
    }
  }

  if (action === "enroll") {
    renderSelectedCard();
    elements.enrollmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

window.addEventListener("hashchange", renderRoute);

(async function init() {
  localStorage.removeItem("clover_panel_token");

  try {
    await bootAuthenticatedApp();
  } catch (_error) {
    logout();
  }
})();
