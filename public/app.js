const state = {
  token: localStorage.getItem("clover_panel_token") || "",
  user: null,
  cards: [],
  checksByCardId: {},
  selectedCardId: null,
  users: [],
  auditLogs: []
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

  if (response.status === 401) {
    logout();
    throw new Error("Session expired");
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

function logout() {
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

function updateIdentity() {
  if (!state.user) {
    return;
  }

  elements.welcomeTitle.textContent = `Welcome, ${state.user.displayName || state.user.username}`;
  elements.identityName.textContent = state.user.username;
  elements.identityRole.textContent = state.user.role;
  elements.adminUsersPanel.hidden = !can("canManageUsers");
}

function getCurrentRoute() {
  const hash = window.location.hash || "#/dashboard";
  return hash.replace(/^#\//, "") || "dashboard";
}

function renderRoute() {
  const route = getCurrentRoute();
  const allowedRoutes = new Set(["dashboard", "cards", "users", "logs"]);
  const activeRoute = allowedRoutes.has(route) ? route : "dashboard";

  elements.pageSections.forEach((section) => {
    const sectionRoute = section.dataset.page;
    section.hidden = sectionRoute !== activeRoute;
  });

  elements.routeLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.routeLink === activeRoute);
  });
}

function updateMetrics() {
  const checks = Object.values(state.checksByCardId).flat();
  elements.metricCards.textContent = String(state.cards.length);
  elements.metricEnrolled.textContent = String(state.cards.filter((card) => card.is_enrolled).length);
  elements.metricChecks.textContent = String(checks.length);
}

function enrollmentButtonLabel(card) {
  if (card.is_enrolled) {
    return "Enrolled";
  }
  return "Enroll";
}

function renderCards() {
  elements.cardsTableBody.innerHTML = "";

  for (const card of state.cards) {
    const row = document.createElement("tr");
    const canCreateEnrollment = can("canCreateEnrollment") && !card.is_enrolled;
    const canViewEnrollment = can("canViewEnrollment") && card.is_enrolled;

    row.innerHTML = `
      <td>${card.provider}</td>
      <td>${card.masked_pan}</td>
      <td>${card.cardholder_name || "-"}</td>
      <td>${card.exp_month}/${card.exp_year}</td>
      <td>${card.verification_status}</td>
      <td>${card.is_enrolled ? "yes" : "no"}</td>
      <td>
        <div class="row-actions">
          <button class="small ghost" data-action="select" data-card-id="${card.id}">Open</button>
          ${canCreateEnrollment ? `<button class="small primary" data-action="enroll" data-card-id="${card.id}">${enrollmentButtonLabel(card)}</button>` : ""}
          ${canViewEnrollment ? `<button class="small ghost" data-action="view-enroll" data-card-id="${card.id}">View Enroll</button>` : ""}
        </div>
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
        <strong>${item.attempt_type}</strong> · ${item.status}
        <div>${item.provider} · ${item.created_at}</div>
        <div>Amount: ${item.amount ?? "-"} ${item.currency || ""}</div>
        <div>Balance: ${item.balance_amount ?? "-"}</div>
        <pre>${escapeHtml(JSON.stringify(item.raw_response, null, 2))}</pre>
      </article>
    `).join("")
    : `<article class="list-card">No checks yet for this card.</article>`;
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
    elements.selectedCardTitle.textContent = "No card selected";
    elements.selectedCardMeta.textContent = "Select a card from the table to view checks and enrollment actions.";
    elements.checkForm.hidden = true;
    elements.enrollmentForm.hidden = true;
    renderEnrollmentDetails(null);
    renderChecks();
    return;
  }

  elements.selectedCardTitle.textContent = `${card.masked_pan} · ${card.provider}`;
  elements.selectedCardMeta.textContent = `${card.cardholder_name || "Unknown holder"} · ${card.billing_zip || "No ZIP"} · ${card.brand || "Unknown brand"}`;

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

async function loadCards() {
  state.cards = await api("/cards");
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
  await loadUsers();
  await loadCards();
  await loadAuditLogs();
  renderRoute();
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

    state.token = data.token;
    localStorage.setItem("clover_panel_token", state.token);
    window.location.hash = "#/dashboard";
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

elements.cardForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = formToObject(elements.cardForm);
  if (payload.authCheckLimit === "") {
    delete payload.authCheckLimit;
  }

  try {
    await api("/cards", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    elements.cardForm.reset();
    await loadCards();
  } catch (error) {
    alert(error.message);
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

  if (action === "select" || action === "enroll") {
    await loadChecks(cardId);
    renderSelectedCard();
  }

  if (action === "view-enroll") {
    await loadEnrollment(cardId);
  }

  if (action === "enroll") {
    renderSelectedCard();
    elements.enrollmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

window.addEventListener("hashchange", renderRoute);

(async function init() {
  if (!state.token) {
    setView(false);
    return;
  }

  try {
    await bootAuthenticatedApp();
  } catch (_error) {
    logout();
  }
})();
