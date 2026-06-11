const state = {
  token: "",
  user: null,
  cards: [],
  checksByCardId: {},
  selectedCardId: null,
  users: [],
  auditLogs: [],
  unchargebackCases: [],
  providerReports: null,
  paymentProcessorLogs: null,
  paymentProcessorHealth: null,
  paymentProcessorJsonModels: {},
  paymentProcessorLogById: {},
  providerOperationCatalog: null,
  burpSuite: {
    status: null,
    events: [],
    pending: [],
    otpMessages: [],
    selectedPendingId: null
  },
  cloverIframe: {
    config: null,
    clover: null,
    mounted: false,
    loading: null
  },
  paymentProviders: null,
  providerDataLoading: null,
  voiceProviders: null,
  voiceDevice: null,
  activeVoiceCall: null,
  pendingRequests: 0,
  loadingButtons: new Set()
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
  providerReportsList: document.getElementById("providerReportsList"),
  providerReportsRefresh: document.getElementById("providerReportsRefresh"),
  paymentProcessorFilterForm: document.getElementById("paymentProcessorFilterForm"),
  paymentProcessorMenu: document.getElementById("paymentProcessorMenu"),
  paymentProcessorSummary: document.getElementById("paymentProcessorSummary"),
  paymentProcessorLogsList: document.getElementById("paymentProcessorLogsList"),
  paymentProcessorLogsRefresh: document.getElementById("paymentProcessorLogsRefresh"),
  paymentProcessorOperationPanel: document.getElementById("paymentProcessorOperationPanel"),
  paymentProcessorOperationClose: document.getElementById("paymentProcessorOperationClose"),
  paymentProcessorOperationForm: document.getElementById("paymentProcessorOperationForm"),
  paymentProcessorOperationDynamicFields: document.getElementById("paymentProcessorOperationDynamicFields"),
  paymentProcessorOperationResult: document.getElementById("paymentProcessorOperationResult"),
  manualPaymentForm: document.getElementById("manualPaymentForm"),
  manualPaymentResult: document.getElementById("manualPaymentResult"),
  manualPaymentCardSummary: document.getElementById("manualPaymentCardSummary"),
  cardPaymentProviderListPanel: document.getElementById("cardPaymentProviderListPanel"),
  cardPaymentProviderList: document.getElementById("cardPaymentProviderList"),
  cardPaymentOperationWorkspace: document.getElementById("cardPaymentOperationWorkspace"),
  cardPaymentSelectedTitle: document.getElementById("cardPaymentSelectedTitle"),
  cardPaymentProviderBack: document.getElementById("cardPaymentProviderBack"),
  cardPaymentOperationTabs: document.getElementById("cardPaymentOperationTabs"),
  cardPaymentProviderView: document.getElementById("cardPaymentProviderView"),
  cardPaymentMethodView: document.getElementById("cardPaymentMethodView"),
  cardPaymentDynamicFields: document.getElementById("cardPaymentDynamicFields"),
  cardPaymentReportList: document.getElementById("cardPaymentReportList"),
  cardPaymentReportsRefresh: document.getElementById("cardPaymentReportsRefresh"),
  providerOperationForm: document.getElementById("providerOperationForm"),
  providerOperationResult: document.getElementById("providerOperationResult"),
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
  paypalNvpTestButton: document.getElementById("paypalNvpTestButton"),
  paypalManagerStatusResult: document.getElementById("paypalManagerStatusResult"),
  paypalManagerInquiryForm: document.getElementById("paypalManagerInquiryForm"),
  paypalManagerInquiryResult: document.getElementById("paypalManagerInquiryResult"),
  paypalBinCheckForm: document.getElementById("paypalBinCheckForm"),
  paypalBinCheckResult: document.getElementById("paypalBinCheckResult"),
  ipLookupForm: document.getElementById("ipLookupForm"),
  ipLookupResult: document.getElementById("ipLookupResult"),
  balanceCheckForm: document.getElementById("balanceCheckForm"),
  balanceCheckResult: document.getElementById("balanceCheckResult"),
  cloverVerifyForm: document.getElementById("cloverVerifyForm"),
  cloverVerifyResult: document.getElementById("cloverVerifyResult"),
  paypalLiveCheckForm: document.getElementById("paypalLiveCheckForm"),
  paypalLiveCheckResult: document.getElementById("paypalLiveCheckResult"),
  paypalSaleForm: document.getElementById("paypalSaleForm"),
  paypalSaleResult: document.getElementById("paypalSaleResult"),
  paypalAuthForm: document.getElementById("paypalAuthForm"),
  paypalAuthResult: document.getElementById("paypalAuthResult"),
  paypalCaptureForm: document.getElementById("paypalCaptureForm"),
  paypalCaptureResult: document.getElementById("paypalCaptureResult"),
  paypalVoidForm: document.getElementById("paypalVoidForm"),
  paypalVoidResult: document.getElementById("paypalVoidResult"),
  cloverPreauthForm: document.getElementById("cloverPreauthForm"),
  cloverPreauthResult: document.getElementById("cloverPreauthResult"),
  cloverRefundForm: document.getElementById("cloverRefundForm"),
  cloverRefundResult: document.getElementById("cloverRefundResult"),
  cloverIframeCheckoutForm: document.getElementById("cloverIframeCheckoutForm"),
  cloverIframeInitButton: document.getElementById("cloverIframeInitButton"),
  cloverIframeStatus: document.getElementById("cloverIframeStatus"),
  cloverIframeResult: document.getElementById("cloverIframeResult"),
  cloverIframeCardNumber: document.getElementById("cloverIframeCardNumber"),
  cloverIframeCardDate: document.getElementById("cloverIframeCardDate"),
  cloverIframeCardCvv: document.getElementById("cloverIframeCardCvv"),
  cloverIframeCardPostalCode: document.getElementById("cloverIframeCardPostalCode"),
  cloverLearningForm: document.getElementById("cloverLearningForm"),
  cloverLearningStatus: document.getElementById("cloverLearningStatus"),
  cloverLearningResult: document.getElementById("cloverLearningResult"),
  cloverLearningRefreshButton: document.getElementById("cloverLearningRefreshButton"),
  unchargebackForm: document.getElementById("unchargebackForm"),
  unchargebackResult: document.getElementById("unchargebackResult"),
  unchargebackList: document.getElementById("unchargebackList"),
  burpStartForm: document.getElementById("burpStartForm"),
  burpStopButton: document.getElementById("burpStopButton"),
  burpRefreshButton: document.getElementById("burpRefreshButton"),
  burpArmOtpForm: document.getElementById("burpArmOtpForm"),
  burpStatus: document.getElementById("burpStatus"),
  burpTrafficList: document.getElementById("burpTrafficList"),
  burpPendingList: document.getElementById("burpPendingList"),
  burpReleaseForm: document.getElementById("burpReleaseForm"),
  burpOtpSendForm: document.getElementById("burpOtpSendForm"),
  burpOtpSendResult: document.getElementById("burpOtpSendResult"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalEyebrow: document.getElementById("modalEyebrow"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
  pageSections: document.querySelectorAll("[data-page]"),
  routeLinks: document.querySelectorAll("[data-route-link]"),
  checkerTabs: document.querySelectorAll("[data-checker-tab]"),
  checkerPanels: document.querySelectorAll("[data-checker-panel]")
};

const API_PREFIX = "/api";
const MANUAL_CARD_VALUE = "__manual";
const CLOVER_IFRAME_SCRIPT_ID = "clover-iframe-sdk";
const PROCESSOR_ATTEMPT_TYPES = ["auth_check", "sale_check", "capture", "refund", "void", "live_check", "bin_check", "balance_check", "iframe_verify"];
const PROCESSOR_STATUSES = ["approved", "success", "failed", "declined", "recorded", "unknown"];
const CARD_PAYMENT_CARD_INPUT_FIELDS = new Set(["pan", "source", "expiry", "cvv2", "cvv", "expMonth", "expYear"]);

const CARD_PAYMENT_FIELD_CONFIG = {
  cardId: {
    label: "Saved Card",
    className: "full-span",
    type: "select",
    options: () => getSavedCardSelectOptions()
  },
  pan: { label: "Card Number", className: "full-span", autocomplete: "off", inputmode: "numeric" },
  source: { label: "Source Token", className: "full-span", autocomplete: "off", placeholder: "Clover source token" },
  expiry: { label: "SKT (MMYY)", autocomplete: "off", inputmode: "numeric", maxlength: "4", placeholder: "1228" },
  cvv2: { label: "CVV", autocomplete: "off", inputmode: "numeric", maxlength: "4" },
  cvv: { label: "CVV", autocomplete: "off", inputmode: "numeric", maxlength: "4" },
  expMonth: {
    label: "Exp Month",
    type: "select",
    options: () => [
      { value: "", label: "Month" },
      ...Array.from({ length: 12 }, (_, index) => {
        const value = String(index + 1).padStart(2, "0");
        return { value, label: value };
      })
    ]
  },
  expYear: {
    label: "Exp Year",
    type: "select",
    options: () => {
      const currentYear = new Date().getFullYear();
      return [
        { value: "", label: "Year" },
        ...Array.from({ length: 16 }, (_, index) => {
          const value = String(currentYear + index);
          return { value, label: value };
        })
      ];
    }
  },
  cardholderName: { label: "Holder Name", className: "full-span", autocomplete: "cc-name" },
  billingAddressLine1: { label: "Street", className: "full-span", autocomplete: "address-line1" },
  billingCity: { label: "City", autocomplete: "address-level2" },
  billingState: { label: "State", autocomplete: "address-level1" },
  billingZip: { label: "Billing ZIP" },
  billingCountry: { label: "Country", maxlength: "2", defaultValue: "US" },
  addressFields: { label: "Address", className: "full-span", component: "address" },
  amount: { label: "Amount", type: "text", inputmode: "decimal", defaultValue: "1000" },
  sequenceAmount1: { label: "Request 1 Amount", type: "text", inputmode: "decimal", defaultValue: "1,100.12" },
  sequenceAmount2: { label: "Request 2 Amount", type: "text", inputmode: "decimal", defaultValue: "1,100.25" },
  merchid: { label: "Merchant ID", placeholder: "Provider merchid" },
  retref: { label: "Retref", className: "full-span", autocomplete: "off", placeholder: "Provider retref" },
  routingNumber: { label: "Routing Number", autocomplete: "off", inputmode: "numeric", maxlength: "9" },
  accountNumber: { label: "Account Number", className: "full-span", autocomplete: "off", inputmode: "numeric" },
  accountHolderName: { label: "Account Holder", className: "full-span", autocomplete: "off", defaultValue: "ACH Test Account" },
  achEntryCode: {
    label: "ACH Entry Code",
    type: "select",
    defaultValue: "WEB",
    options: [
      { value: "WEB", label: "WEB" },
      { value: "PPD", label: "PPD" },
      { value: "CCD", label: "CCD" }
    ]
  },
  balanceAmount: { label: "Balance Amount", type: "number", step: "0.01" },
  currency: { label: "Currency", maxlength: "3", defaultValue: "USD" },
  reference: { label: "Reference / Order", className: "full-span" },
  transactionId: { label: "Transaction Id", className: "full-span" },
  authorizationPnref: { label: "Authorization PNREF", className: "full-span" },
  token: { label: "Token", className: "full-span", autocomplete: "off" },
  ip: { label: "Customer IP", placeholder: "127.0.0.1" },
  description: { label: "Description", className: "full-span" },
  note: { label: "Note", className: "full-span" },
  captureComplete: {
    label: "Complete Capture",
    type: "select",
    options: [
      { value: "true", label: "yes" },
      { value: "false", label: "no" }
    ],
    defaultValue: "true"
  }
};

function ensureBusyIndicator() {
  let indicator = document.getElementById("globalBusyIndicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "globalBusyIndicator";
    indicator.className = "global-busy";
    indicator.setAttribute("role", "status");
    indicator.setAttribute("aria-live", "polite");
    indicator.innerHTML = `<span class="busy-spinner"></span><strong>İşlem yapılıyor</strong>`;
    document.body.appendChild(indicator);
  }
  return indicator;
}

function setButtonLoading(button, loading) {
  if (!button) {
    return;
  }

  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent.trim();
    }
    button.disabled = true;
    button.classList.add("is-loading");
    button.textContent = "İşlem yapılıyor...";
    state.loadingButtons.add(button);
    return;
  }

  button.disabled = false;
  button.classList.remove("is-loading");
  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
  state.loadingButtons.delete(button);
}

function rememberActionButton(button) {
  if (!button || !button.matches("button")) {
    return;
  }
  setButtonLoading(button, true);
}

function setGlobalBusy(active) {
  const indicator = ensureBusyIndicator();
  indicator.classList.toggle("active", active);
  document.body.classList.toggle("has-pending-action", active);
  if (!active) {
    Array.from(state.loadingButtons).forEach((button) => setButtonLoading(button, false));
  }
}

function beginRequest() {
  state.pendingRequests += 1;
  window.ActionLoader?.set(true);
  setGlobalBusy(true);
}

function endRequest() {
  state.pendingRequests = Math.max(0, state.pendingRequests - 1);
  if (state.pendingRequests === 0) {
    window.ActionLoader?.set(false);
    setGlobalBusy(false);
  }
}

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
  beginRequest();
  try {
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
      const error = new Error(data?.failureReason || data?.responseMessage || data?.error || "Request failed");
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } finally {
    endRequest();
  }
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

function errorResponsePayload(error) {
  return error?.data || {
    status: "failed",
    httpStatus: error?.status || null,
    responseMessage: error?.message || "Request failed",
    failureReason: error?.message || "Request failed"
  };
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

function getCardPaymentRouteProvider(route = getCurrentRoute()) {
  const match = String(route).match(/^card-payments\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function getPaymentProcessorRouteKey(route = getCurrentRoute()) {
  const match = String(route).match(/^payment-processors\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function renderRoute() {
  const route = getCurrentRoute();
  const routeBase = route.split("/")[0];
  const routeAliases = {
    "payment-test": "card-payments",
    "legacy-payment": "card-payments",
    "clover-checkout": "card-payments",
    "clover-learning": "checkers",
    "provider-reports": "providers",
    "unchargeback": "iwant-clips-profiles"
  };
  const normalizedRoute = routeAliases[route] || routeAliases[routeBase] || routeBase || route;
  const allowedRoutes = new Set(["checkers", "card-payments", "payment-processors", "cards", "providers", "burp-suite", "iwant-clips-profiles"]);
  const requestedRoute = allowedRoutes.has(normalizedRoute) ? normalizedRoute : "checkers";
  const activeRoute = requestedRoute;

  if (activeRoute !== route && !(activeRoute === "card-payments" && routeBase === "card-payments") && !(activeRoute === "payment-processors" && routeBase === "payment-processors")) {
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

  if (activeRoute === "providers" && state.user) {
    loadProviderReports().catch((error) => {
      elements.providerReportsList.innerHTML = `<article class="list-card"><strong>Provider Report Error</strong><div>${escapeHtml(error.message)}</div></article>`;
    });
  }
  if (activeRoute === "payment-processors" && state.user) {
    applyPaymentProcessorRouteFilter();
    ensureProviderDataLoaded().then(() => {
      renderPaymentProcessorMenu();
    }).catch((error) => {
      if (elements.paymentProcessorOperationResult) {
        elements.paymentProcessorOperationResult.innerHTML = `<article class="list-card"><strong>Processor Catalog Error</strong><div>${escapeHtml(error.message)}</div></article>`;
      }
    });
    loadPaymentProcessorLogs().catch((error) => {
      if (elements.paymentProcessorLogsList) {
        elements.paymentProcessorLogsList.innerHTML = `<article class="list-card"><strong>Processor Log Error</strong><div>${escapeHtml(error.message)}</div></article>`;
      }
    });
  }
  if (activeRoute === "card-payments" && state.user) {
    applyCardPaymentRouteProvider();
    renderCardPaymentProviderList();
    syncManualPaymentMode();
    ensureProviderDataLoaded().catch((error) => {
      if (elements.cardPaymentProviderList) {
        elements.cardPaymentProviderList.innerHTML = `<article class="list-card"><strong>Provider Catalog Error</strong><div>${escapeHtml(error.message)}</div></article>`;
      }
    });
    loadProviderReports().catch((error) => {
      if (elements.cardPaymentReportList) {
        elements.cardPaymentReportList.innerHTML = `<article class="list-card"><strong>Provider Report Error</strong><div>${escapeHtml(error.message)}</div></article>`;
      }
    });
  }
  if (activeRoute === "burp-suite" && state.user) {
    loadBurpSuiteTraffic().catch((error) => {
      elements.burpStatus.innerHTML = `<article class="list-card"><strong>Burp Status Error</strong><div>${escapeHtml(error.message)}</div></article>`;
    });
  }
  if (activeRoute === "checkers") {
    const activeCheckerTab = document.querySelector("[data-checker-tab].active")?.dataset.checkerTab || "ip";
    showCheckerTab(activeCheckerTab);
  }
  if (activeRoute === "checkers" && state.user) {
    loadCloverLearningStatus().catch((error) => {
      renderGenericProviderResult(elements.cloverLearningStatus, "Machine Learning Error", { error: error.message });
    });
  }
}

function showCheckerTab(activeTab) {
  elements.checkerTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.checkerTab === activeTab);
  });

  elements.checkerPanels.forEach((panel) => {
    panel.hidden = panel.dataset.checkerPanel !== activeTab;
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
      <div>${key === "clover" ? `Merchant ID: ${escapeHtml(provider.merchantId || "-")}` : key === "fluidpay" ? `API key: ${provider.configured ? "configured" : "missing config"}` : key === "globalpayments" ? `App credentials: ${provider.configured ? "configured" : "missing config"}` : key === "propelrpay" || key === "propelr" ? `API key: ${provider.configured ? "configured" : "missing config"}` : `REST: ${provider.restConfigured ? "configured" : "missing config"}`}</div>
      ${key === "fluidpay" ? `<div>Processor ID: ${escapeHtml(provider.processorId || "-")}</div>` : ""}
      ${key === "globalpayments" ? `<div>Mode: ${escapeHtml(provider.mode || "-")} · Account: ${escapeHtml(provider.accountName || "-")} · Channel: ${escapeHtml(provider.channel || "-")} · Key type: ${escapeHtml(provider.keyType || "-")}</div>` : ""}
      ${key === "propelrpay" || key === "propelr" ? `<pre>${escapeHtml(JSON.stringify(provider.operationPathsConfigured || {}, null, 2))}</pre>` : ""}
      ${provider.nvp ? `<div>NVP/SOAP: ${provider.nvp.configured ? "configured" : "missing config"} · ${escapeHtml(provider.nvp.baseUrl || "-")}</div>` : ""}
      ${provider.manager ? `<div>Manager: ${provider.manager.configured ? "configured" : "missing config"} · ${escapeHtml(provider.manager.baseUrl || "-")}</div>` : ""}
    </article>
  `).join("");
}

function getCardPaymentCatalog() {
  return state.providerOperationCatalog || {};
}

function getSelectedCardPaymentProvider() {
  const providerKey = elements.manualPaymentForm?.elements?.provider?.value || "propelr";
  return getCardPaymentCatalog()[providerKey] || getCardPaymentCatalog().propelr || null;
}

function getSelectedCardPaymentMethod() {
  const provider = getSelectedCardPaymentProvider();
  const operationKey = elements.manualPaymentForm?.elements?.operation?.value;
  return provider?.methods?.find((method) => method.key === operationKey) || provider?.methods?.[0] || null;
}

function getSelectedPaymentProcessorOperationProvider() {
  const providerKey = elements.paymentProcessorOperationForm?.elements?.provider?.value || getPaymentProcessorRouteKey() || "propelr";
  const catalog = getCardPaymentCatalog();
  return catalog[providerKey] || catalog[normalizeProcessorActionProvider(providerKey)] || catalog.propelr || Object.values(catalog)[0] || null;
}

function getSelectedPaymentProcessorOperationMethod() {
  const provider = getSelectedPaymentProcessorOperationProvider();
  const operationKey = elements.paymentProcessorOperationForm?.elements?.operation?.value;
  return provider?.methods?.find((method) => method.key === operationKey) || provider?.methods?.[0] || null;
}

function getCardPaymentProviderHref(providerKey) {
  return `#/card-payments/${encodeURIComponent(providerKey)}`;
}

function isCardPaymentProviderSelected() {
  return Boolean(getCardPaymentRouteProvider());
}

function applyCardPaymentRouteProvider() {
  const providerKey = getCardPaymentRouteProvider();
  const providerSelect = elements.manualPaymentForm?.elements?.provider;
  if (!providerSelect) {
    return;
  }
  if (!providerKey) {
    return;
  }
  const catalog = getCardPaymentCatalog();
  if (!catalog[providerKey]) {
    window.location.hash = "#/card-payments";
    return;
  }
  if (providerSelect.value !== providerKey) {
    providerSelect.value = providerKey;
    populateManualPaymentOperations({ preserve: false });
  }
}

function renderCardPaymentProviderList() {
  if (!elements.cardPaymentProviderList) {
    return;
  }
  const providers = Object.values(getCardPaymentCatalog());
  elements.cardPaymentProviderList.innerHTML = providers.length
    ? providers.map((provider) => `
      <a class="gateway-provider-row" href="${escapeHtml(getCardPaymentProviderHref(provider.key))}">
        <div>
          <strong>${escapeHtml(provider.label || provider.key)}</strong>
          <span>${escapeHtml(provider.description || "Payment provider")}</span>
        </div>
        <div class="gateway-provider-row-meta">
          <span class="status-pill ${provider.configured ? "status-good" : "status-bad"}">${provider.configured ? "configured" : "missing config"}</span>
          <span>${escapeHtml(provider.methods?.length || 0)} işlem</span>
        </div>
      </a>
    `).join("")
    : `<article class="list-card">Provider catalog loading.</article>`;
}

function syncCardPaymentPageMode() {
  const selected = isCardPaymentProviderSelected();
  if (elements.cardPaymentProviderListPanel) {
    elements.cardPaymentProviderListPanel.hidden = selected;
  }
  if (elements.cardPaymentOperationWorkspace) {
    elements.cardPaymentOperationWorkspace.hidden = !selected;
  }
}

function populateManualPaymentProviders({ preserve = true } = {}) {
  const form = elements.manualPaymentForm;
  const providerSelect = form?.elements?.provider;
  const catalog = getCardPaymentCatalog();
  const providers = Object.values(catalog);
  if (!providerSelect || providers.length === 0) {
    renderCardPaymentProviderList();
    return;
  }

  const routeProvider = getCardPaymentRouteProvider();
  const previous = routeProvider || (preserve ? providerSelect.value : "");
  providerSelect.innerHTML = providers
    .map((provider) => `<option value="${escapeHtml(provider.key)}">${escapeHtml(provider.label || provider.key)}</option>`)
    .join("");

  providerSelect.value = providers.some((provider) => provider.key === previous)
    ? previous
    : providers[0].key;
  renderCardPaymentProviderList();
}

function populateManualPaymentOperations({ preserve = true } = {}) {
  const form = elements.manualPaymentForm;
  const operationSelect = form?.elements?.operation;
  const provider = getSelectedCardPaymentProvider();
  if (!operationSelect || !provider?.methods?.length) {
    renderCardPaymentOperationTabs(provider, null);
    return;
  }

  const previous = preserve ? operationSelect.value : "";
  operationSelect.innerHTML = provider.methods
    .map((method) => `<option value="${escapeHtml(method.key)}">${escapeHtml(method.label)}</option>`)
    .join("");

  const nextValue = provider.methods.some((method) => method.key === previous)
    ? previous
    : provider.methods[0].key;
  operationSelect.value = nextValue;
  renderCardPaymentOperationTabs(provider, getSelectedCardPaymentMethod());
}

function populatePaymentProcessorOperationProviders({ preserve = true } = {}) {
  const form = elements.paymentProcessorOperationForm;
  const providerSelect = form?.elements?.provider;
  const providers = Object.values(getCardPaymentCatalog());
  if (!providerSelect || providers.length === 0) {
    return;
  }

  const routeProvider = getPaymentProcessorRouteKey();
  const previous = routeProvider || (preserve ? providerSelect.value : "");
  providerSelect.innerHTML = providers
    .map((provider) => `<option value="${escapeHtml(provider.key)}">${escapeHtml(provider.label || provider.key)}</option>`)
    .join("");
  providerSelect.value = providers.some((provider) => provider.key === previous)
    ? previous
    : providers[0].key;
}

function populatePaymentProcessorOperationMethods({ preserve = true } = {}) {
  const form = elements.paymentProcessorOperationForm;
  const operationSelect = form?.elements?.operation;
  const provider = getSelectedPaymentProcessorOperationProvider();
  if (!operationSelect || !provider?.methods?.length) {
    return;
  }

  const previous = preserve ? operationSelect.value : "";
  operationSelect.innerHTML = provider.methods
    .map((method) => `<option value="${escapeHtml(method.key)}">${escapeHtml(method.label)}</option>`)
    .join("");
  operationSelect.value = provider.methods.some((method) => method.key === previous)
    ? previous
    : provider.methods[0].key;
}

function renderPaymentProcessorOperationFields() {
  const target = elements.paymentProcessorOperationDynamicFields;
  if (!target) {
    return;
  }
  const form = elements.paymentProcessorOperationForm;
  const provider = getSelectedPaymentProcessorOperationProvider();
  const method = getSelectedPaymentProcessorOperationMethod();
  if (!provider || !method) {
    target.innerHTML = `<div class="summary-empty">Processor ve işlem seçimi bekleniyor.</div>`;
    return;
  }

  const currentValues = form ? formToObject(form) : {};
  const requiredFields = new Set(method.required || []);
  const fields = getCardPaymentMethodFields(provider, method);
  target.innerHTML = fields.map((name) => {
    const config = CARD_PAYMENT_FIELD_CONFIG[name];
    const defaultValue = typeof config.defaultValue === "function"
      ? config.defaultValue({ provider, method })
      : config.defaultValue;
    const value = currentValues[name] ?? defaultValue ?? "";
    const required = requiredFields.has(name) && name !== "cardId";
    return renderCardPaymentInput(name, config, value, required, { provider, method });
  }).join("");
}

function mountSharedCardComponents() {
  if (!window.CardInputComponent) {
    return;
  }
  document.querySelectorAll("[data-card-component]").forEach((target) => {
    if (target.dataset.cardComponentMounted === "true") {
      return;
    }
    const type = target.dataset.cardComponent;
    const configs = {
      bin: { includePan: false, includeBin: true, includeExpiry: false, includeCvv: false, includeHolder: false, includeAddress: false, binRequired: true },
      live: { includePan: true, includeBin: false, includeExpiry: true, includeCvv: true, cvvName: "cvv2", includeHolder: true, includeAddress: true, panRequired: true },
      balance: { includePan: true, includeBin: false, includeExpiry: true, includeCvv: false, includeHolder: true, includeAddress: true },
      clover: { includePan: true, includeBin: true, includeExpiry: true, includeCvv: false, includeHolder: true, includeAddress: true }
    };
    target.innerHTML = window.CardInputComponent.renderCardFields(configs[type] || {});
    target.dataset.cardComponentMounted = "true";
  });
}

function syncPaymentProcessorOperationForm({ preserve = true } = {}) {
  populatePaymentProcessorOperationProviders({ preserve });
  populatePaymentProcessorOperationMethods({ preserve });
  renderPaymentProcessorOperationFields();
}

function openPaymentProcessorOperation(providerKey, methodKey) {
  const form = elements.paymentProcessorOperationForm;
  if (!form || !elements.paymentProcessorOperationPanel) {
    return;
  }
  elements.paymentProcessorOperationPanel.hidden = false;
  syncPaymentProcessorOperationForm({ preserve: true });
  if (providerKey && form.elements.provider) {
    form.elements.provider.value = providerKey;
    populatePaymentProcessorOperationMethods({ preserve: false });
  }
  if (methodKey && form.elements.operation) {
    form.elements.operation.value = methodKey;
  }
  renderPaymentProcessorOperationFields();
  if (elements.paymentProcessorOperationResult) {
    elements.paymentProcessorOperationResult.innerHTML = "";
  }
  elements.paymentProcessorOperationPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closePaymentProcessorOperation() {
  if (!elements.paymentProcessorOperationPanel) {
    return;
  }
  elements.paymentProcessorOperationPanel.hidden = true;
  if (elements.paymentProcessorOperationResult) {
    elements.paymentProcessorOperationResult.innerHTML = "";
  }
}

function renderCardPaymentOperationTabs(provider, method) {
  if (!elements.cardPaymentOperationTabs) {
    return;
  }
  elements.cardPaymentOperationTabs.innerHTML = provider?.methods?.length
    ? provider.methods.map((item) => `
      <button
        type="button"
        class="gateway-tab small ${item.key === method?.key ? "active" : ""}"
        data-card-payment-operation="${escapeHtml(item.key)}"
      >${escapeHtml(item.label)}</button>
    `).join("")
    : `<span class="summary-empty">No operations for this provider.</span>`;
}

function renderCardPaymentProviderView(provider, method) {
  if (!elements.cardPaymentProviderView || !elements.cardPaymentMethodView) {
    return;
  }

  if (!provider || !method) {
    elements.cardPaymentProviderView.innerHTML = `<div class="summary-empty">Provider catalog not loaded.</div>`;
    elements.cardPaymentMethodView.innerHTML = "";
    elements.cardPaymentMethodView.hidden = true;
    return;
  }

  elements.cardPaymentMethodView.hidden = true;
  elements.cardPaymentProviderView.innerHTML = `
    <div class="gateway-selection-summary">
      <div>
        <span>Provider</span>
        <strong>${escapeHtml(provider.label || provider.key)}</strong>
      </div>
      <div>
        <span>İşlem</span>
        <strong>${escapeHtml(method.label)}</strong>
      </div>
      <div>
        <span>Durum</span>
        <strong class="${provider.configured ? "status-good-text" : "status-bad-text"}">${provider.configured ? "configured" : "missing config"}</strong>
      </div>
    </div>
  `;
  elements.cardPaymentMethodView.innerHTML = "";
}

function collectCardPaymentFormValues() {
  if (!elements.manualPaymentForm) {
    return {};
  }
  return formToObject(elements.manualPaymentForm);
}

function getCardPaymentMethodFields(provider, method) {
  const fields = method?.fields || [];
  const hasCardInput = fields.some((name) => CARD_PAYMENT_CARD_INPUT_FIELDS.has(name));
  const values = [];
  if (hasCardInput) {
    values.push("cardId");
  }
  fields.forEach((name) => {
    if (CARD_PAYMENT_FIELD_CONFIG[name] && !values.includes(name)) {
      values.push(name);
    }
  });
  if (hasCardInput && !fields.includes("source")) {
    ["cardholderName", "addressFields"].forEach((name) => {
      if (!values.includes(name)) {
        values.push(name);
      }
    });
  }
  if (fields.includes("amount") && !fields.includes("currency") && provider?.key !== "propelr") {
    values.push("currency");
  }
  if (!values.includes("reference") && ["sale", "auth", "verification"].includes(method?.operation) && provider?.key !== "propelr") {
    values.push("reference");
  }
  return values;
}

function renderCardPaymentInput(name, config, value, required, context = {}) {
  if (config.component === "address") {
    return window.CardInputComponent?.renderAddressFields({ open: false }) || "";
  }
  if (window.CardInputComponent && name === "expMonth") {
    return `
      <label${config.className ? ` class="${escapeHtml(config.className)}"` : ""}>
        <span>${escapeHtml(config.label)}</span>
        <select name="expMonth" ${required ? "required" : ""}>${window.CardInputComponent.monthOptions(value)}</select>
      </label>
    `;
  }
  if (window.CardInputComponent && name === "expYear") {
    return `
      <label${config.className ? ` class="${escapeHtml(config.className)}"` : ""}>
        <span>${escapeHtml(config.label)}</span>
        <select name="expYear" ${required ? "required" : ""}>${window.CardInputComponent.yearOptions(value)}</select>
      </label>
    `;
  }
  const labelClass = config.className ? ` class="${escapeHtml(config.className)}"` : "";
  const attrs = [
    `name="${escapeHtml(name)}"`,
    config.type && config.type !== "select" ? `type="${escapeHtml(config.type)}"` : "",
    config.autocomplete ? `autocomplete="${escapeHtml(config.autocomplete)}"` : "",
    config.inputmode ? `inputmode="${escapeHtml(config.inputmode)}"` : "",
    config.maxlength ? `maxlength="${escapeHtml(config.maxlength)}"` : "",
    config.step ? `step="${escapeHtml(config.step)}"` : "",
    config.list ? `list="${escapeHtml(config.list)}"` : "",
    config.placeholder ? `placeholder="${escapeHtml(config.placeholder)}"` : "",
    required ? "required" : ""
  ].filter(Boolean).join(" ");

  if (config.type === "select") {
    const options = typeof config.options === "function"
      ? config.options({ ...context, name, value })
      : config.options || [];
    return `
      <label${labelClass}>
        <span>${escapeHtml(config.label)}</span>
        <select name="${escapeHtml(name)}" ${required ? "required" : ""}>
          ${options.map((option) => `
            <option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? "selected" : ""}>${escapeHtml(option.label)}</option>
          `).join("")}
        </select>
      </label>
    `;
  }

  return `
    <label${labelClass}>
      <span>${escapeHtml(config.label)}</span>
      <input ${attrs} value="${escapeHtml(value ?? "")}">
    </label>
  `;
}

function renderCardPaymentDynamicFields(provider, method) {
  if (!elements.cardPaymentDynamicFields) {
    return;
  }

  if (!provider || !method) {
    elements.cardPaymentDynamicFields.innerHTML = `<div class="summary-empty">Provider ve metod seçimi bekleniyor.</div>`;
    if (elements.manualPaymentCardSummary) {
      elements.manualPaymentCardSummary.hidden = true;
    }
    return;
  }

  const currentValues = collectCardPaymentFormValues();
  const requiredFields = new Set(method.required || []);
  const propelrConfig = state.paymentProviders?.propelrpay || state.paymentProviders?.propelr || {};
  const isPropelrMerchantConfigured = Boolean(propelrConfig.merchantConfigured);
  const fields = getCardPaymentMethodFields(provider, method).filter((name) => {
    return name !== "merchid" || provider.key !== "propelr" || !isPropelrMerchantConfigured;
  });

  elements.cardPaymentDynamicFields.innerHTML = fields.map((name) => {
    const config = CARD_PAYMENT_FIELD_CONFIG[name];
    const defaultValue = typeof config.defaultValue === "function"
      ? config.defaultValue({ provider, method })
      : config.defaultValue;
    const value = currentValues[name] ?? defaultValue ?? "";
    const required = requiredFields.has(name) && name !== "cardId";
    return renderCardPaymentInput(name, config, value, required, { provider, method });
  }).join("");

  const amount = elements.manualPaymentForm?.elements?.amount;
  if (amount) {
    amount.placeholder = provider.key === "propelr" ? "1100.12" : "1000";
  }
  syncManualPaymentCardSearch();
}

function formatProviderGroupLabel(group) {
  return String(group || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMissingConfig(missing) {
  if (!missing) {
    return "-";
  }
  if (Array.isArray(missing)) {
    return missing.length ? missing.join(", ") : "-";
  }
  return Object.entries(missing)
    .map(([key, values]) => `${key}: ${Array.isArray(values) && values.length ? values.join(", ") : "-"}`)
    .join(" | ");
}

function renderProviderTransaction(item) {
  const raw = item.raw_response || item.details || {};
  const message = raw.result?.responseMessage || raw.verification?.responseMessage || raw.binCheck?.status || raw.responseMessage || raw.error || "-";
  return `
    <article class="list-card provider-transaction">
      <div class="pretty-message-head">
        <strong>${escapeHtml(item.attempt_type || item.action || "-")}</strong>
        <span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status || "-")}</span>
      </div>
      ${renderKeyValueDetails({
        "Provider": item.provider || item.entity_type,
        "Message": message,
        "Created": item.created_at,
        "Amount": item.amount,
        "Currency": item.currency,
        "Reference": item.provider_reference_id || item.entity_id
      })}
    </article>
  `;
}

function renderProviderReportsInto(target) {
  if (!target) {
    return;
  }
  const report = state.providerReports;
  if (!report) {
    target.innerHTML = `<article class="list-card">Provider report not loaded yet.</article>`;
    return;
  }

  const envHelp = report.envHelp || {};
  const envHelpHtml = `
    <article class="list-card provider-report-card">
      <strong>Dev Config Eksikleri</strong>
      <div class="summary-grid provider-report-summary">
        <div><span>FluidPay Missing</span><strong>${escapeHtml(formatMissingConfig(envHelp.fluidpay?.missing))}</strong></div>
        <div><span>Global Payments Missing</span><strong>${escapeHtml(formatMissingConfig(envHelp.globalpayments?.missing))}</strong></div>
        <div><span>PropelrPay Missing</span><strong>${escapeHtml(formatMissingConfig(envHelp.propelrpay?.missing))}</strong></div>
        <div><span>Clover Missing</span><strong>${escapeHtml(formatMissingConfig(envHelp.clover?.missing))}</strong></div>
        <div><span>Clover Tokenize</span><strong>${escapeHtml(formatMissingConfig(envHelp.clover?.iframeMissing))}</strong></div>
      </div>
    </article>
  `;

  target.innerHTML = envHelpHtml + Object.entries(report.groups || {}).map(([group, providers]) => `
    <section class="provider-report-group">
      <div class="section-head provider-report-group-head">
        <div>
          <p class="eyebrow">${escapeHtml(formatProviderGroupLabel(group))}</p>
          <h3>${escapeHtml(providers.length)} Provider</h3>
        </div>
      </div>
      ${providers.map((provider) => `
        <article class="list-card provider-report-card">
          <div class="provider-report-top">
            <div>
              <strong>${escapeHtml(provider.label)}</strong>
              <div>${escapeHtml(provider.capabilities.join(", "))}</div>
            </div>
            <span class="status-pill ${provider.configured ? "status-good" : "status-bad"}">${provider.configured ? "configured" : "missing config"}</span>
          </div>
          <div class="summary-grid provider-report-summary">
            <div><span>Missing</span><strong>${escapeHtml(formatMissingConfig(provider.missing))}</strong></div>
            <div><span>Optional Missing</span><strong>${escapeHtml(formatMissingConfig(provider.optionalMissing))}</strong></div>
            <div><span>Transactions</span><strong>${escapeHtml(provider.transactionCount || 0)}</strong></div>
            <div><span>Audit Logs</span><strong>${escapeHtml(provider.auditCount || 0)}</strong></div>
          </div>
          <div class="provider-report-notes">
            ${(provider.configNotes || []).map((note) => `<div>${escapeHtml(note)}</div>`).join("")}
          </div>
          <details open>
            <summary>Transactions (${escapeHtml(provider.transactions.length)})</summary>
            <div class="provider-report-items">
              ${provider.transactions.length ? provider.transactions.map(renderProviderTransaction).join("") : `<article class="list-card">No transactions yet.</article>`}
            </div>
          </details>
          <details>
            <summary>Audit Logs (${escapeHtml(provider.auditLogs.length)})</summary>
            <div class="provider-report-items">
              ${provider.auditLogs.length ? provider.auditLogs.map((log) => renderProviderTransaction({
                ...log,
                action: log.action,
                status: log.status,
                entity_type: log.entity_type,
                entity_id: log.entity_id,
                details: log.details
              })).join("") : `<article class="list-card">No audit logs yet.</article>`}
            </div>
          </details>
        </article>
      `).join("")}
    </section>
  `).join("");
}

function renderProviderReports() {
  renderProviderReportsInto(elements.providerReportsList);
  renderCardPaymentReportSummary();
}

function renderCardPaymentReportSummary() {
  if (!elements.cardPaymentReportList) {
    return;
  }
  const report = state.providerReports;
  if (!report) {
    elements.cardPaymentReportList.innerHTML = `<article class="list-card">Report not loaded yet.</article>`;
    return;
  }

  const providers = Object.values(report.groups || {}).flat();
  const totalTransactions = providers.reduce((sum, provider) => sum + Number(provider.transactionCount || 0), 0);
  const totalAuditLogs = providers.reduce((sum, provider) => sum + Number(provider.auditCount || 0), 0);
  const configuredCount = providers.filter((provider) => provider.configured).length;
  const selectedProviderKey = elements.manualPaymentForm?.elements?.provider?.value;
  const selectedReportKey = selectedProviderKey === "propelr" ? "propelrpay" : selectedProviderKey;
  const selectedProvider = providers.find((provider) => provider.key === selectedReportKey || provider.provider === selectedReportKey);

  elements.cardPaymentReportList.innerHTML = `
    <article class="list-card gateway-report-summary">
      <div class="summary-grid provider-report-summary">
        <div><span>Providers</span><strong>${escapeHtml(configuredCount)} / ${escapeHtml(providers.length)}</strong></div>
        <div><span>Transactions</span><strong>${escapeHtml(totalTransactions)}</strong></div>
        <div><span>Audit Logs</span><strong>${escapeHtml(totalAuditLogs)}</strong></div>
      </div>
    </article>
    ${selectedProvider ? `
      <article class="list-card gateway-report-summary">
        <div class="provider-report-top">
          <div>
            <strong>${escapeHtml(selectedProvider.label)}</strong>
            <div>${escapeHtml(selectedProvider.capabilities?.join(", ") || "-")}</div>
          </div>
          <span class="status-pill ${selectedProvider.configured ? "status-good" : "status-bad"}">${selectedProvider.configured ? "configured" : "missing config"}</span>
        </div>
        ${renderKeyValueDetails({
          "Missing": formatMissingConfig(selectedProvider.missing),
          "Transactions": selectedProvider.transactionCount || 0,
          "Audit Logs": selectedProvider.auditCount || 0
        })}
      </article>
    ` : ""}
  `;
}

function applyPaymentProcessorRouteFilter() {
  const processor = getPaymentProcessorRouteKey();
  const select = elements.paymentProcessorFilterForm?.elements?.processor;
  if (processor && select && select.value !== processor) {
    select.value = processor;
  }
  const operationProvider = elements.paymentProcessorOperationForm?.elements?.provider;
  if (processor && operationProvider && !elements.paymentProcessorOperationPanel?.hidden && operationProvider.value !== processor) {
    operationProvider.value = processor;
    populatePaymentProcessorOperationMethods({ preserve: false });
    renderPaymentProcessorOperationFields();
  }
}

function getPaymentProcessorFilters() {
  const form = elements.paymentProcessorFilterForm;
  const payload = removeEmptyFields(form ? formToObject(form) : {});
  const routeProcessor = getPaymentProcessorRouteKey();
  if (routeProcessor && !payload.processor) {
    payload.processor = routeProcessor;
  }
  ["amountMin"].forEach((key) => {
    if (payload[key]) {
      payload[key] = String(payload[key]).replace(/,/g, "");
    }
  });
  return payload;
}

function getPaymentProcessorQueryString() {
  const filters = getPaymentProcessorFilters();
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });
  return params.toString();
}

function renderPaymentProcessorOptions() {
  const data = state.paymentProcessorLogs || {};
  const processors = data.processors || [];
  const form = elements.paymentProcessorFilterForm;
  const processorSelect = form?.elements?.processor;
  if (!form) {
    return;
  }
  const previousProcessor = processorSelect?.value || getPaymentProcessorRouteKey();
  if (processorSelect && processors.length) {
    processorSelect.innerHTML = `<option value="">All</option>` + processors.map((processor) => `
    <option value="${escapeHtml(processor.key)}">${escapeHtml(processor.label || processor.key)}</option>
  `).join("");
    if (processors.some((processor) => processor.key === previousProcessor)) {
      processorSelect.value = previousProcessor;
    }
  }

  const renderSelectOptions = (select, values, previous) => {
    if (!select) return;
    const uniqueValues = [...new Set(values.filter(Boolean))].sort();
    select.innerHTML = `<option value="">All</option>` + uniqueValues
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("");
    if (previous && uniqueValues.includes(previous)) {
      select.value = previous;
    }
  };

  renderSelectOptions(
    form.elements.attemptType,
    [...PROCESSOR_ATTEMPT_TYPES, ...(data.facets?.attemptTypes || [])],
    data.filters?.attemptType || form.elements.attemptType?.value
  );
  renderSelectOptions(
    form.elements.status,
    [...PROCESSOR_STATUSES, ...(data.facets?.statuses || [])],
    data.filters?.status || form.elements.status?.value
  );

  const userSelect = form.elements.createdByUserId;
  if (userSelect) {
    const previousUser = data.filters?.createdByUserId || userSelect.value;
    const users = data.facets?.users || [];
    userSelect.innerHTML = `<option value="">All</option>` + users.map((user) => `
      <option value="${escapeHtml(user.id)}">${escapeHtml(user.displayName || user.username || user.id)}</option>
    `).join("");
    if (previousUser && users.some((user) => user.id === previousUser)) {
      userSelect.value = previousUser;
    }
  }

}

function renderPaymentProcessorMenu() {
  if (!elements.paymentProcessorMenu) {
    return;
  }
  const processors = state.paymentProcessorLogs?.processors || [];
  const selected = elements.paymentProcessorFilterForm?.elements?.processor?.value || getPaymentProcessorRouteKey();
  elements.paymentProcessorMenu.innerHTML = window.PaymentProcessorListComponent?.render({
    processors,
    selected,
    healthClass: getProcessorHealthClass,
    healthPillClass: getProcessorHealthPillClass,
    healthLabel: getProcessorHealthLabel,
    actionRenderer: renderPaymentProcessorOperationButtons
  }) || `<article class="list-card">Processor list loading.</article>`;
  renderProcessorHealthDots();
}

function renderPaymentProcessorOperationButtons(processorKey) {
  const provider = getCardPaymentCatalog()[processorKey] || getCardPaymentCatalog()[normalizeProcessorActionProvider(processorKey)];
  const methods = provider?.methods || [];
  if (!methods.length) {
    return `<span class="muted">İşlem yok</span>`;
  }
  return methods.map((method) => `
    <button
      type="button"
      class="ghost small"
      data-payment-processor-new-operation="${escapeHtml(method.key)}"
      data-payment-processor-provider="${escapeHtml(provider.key)}"
    >${escapeHtml(method.label || method.key)}</button>
  `).join("");
}

function getProcessorHealth(keyOrProcessor) {
  const key = typeof keyOrProcessor === "string" ? keyOrProcessor : keyOrProcessor?.key;
  if (!key) {
    return null;
  }
  return state.paymentProcessorHealth?.processors?.[key] ||
    state.paymentProcessorLogs?.health?.processors?.[key] ||
    keyOrProcessor?.health ||
    null;
}

function getProcessorHealthClass(health) {
  if (!health) {
    return "unknown";
  }
  if (health.status === "healthy" || health.healthy === true) {
    return "healthy";
  }
  if (health.status === "checking") {
    return "checking";
  }
  if (health.status === "unhealthy" || health.healthy === false) {
    return "unhealthy";
  }
  return "unknown";
}

function getProcessorHealthLabel(health, configured) {
  if (health?.status === "healthy" || health?.healthy === true) {
    return "healthy";
  }
  if (health?.status === "checking") {
    return "checking";
  }
  if (health?.status === "unhealthy" || health?.healthy === false) {
    return health?.message || "unhealthy";
  }
  return configured ? "not checked" : "missing";
}

function getProcessorHealthPillClass(health, configured) {
  if (health?.status === "healthy" || health?.healthy === true) {
    return "status-good";
  }
  if (health?.status === "checking") {
    return "status-warn";
  }
  if (health?.status === "unhealthy" || health?.healthy === false || !configured) {
    return "status-bad";
  }
  return "status-warn";
}

function renderProcessorHealthDots() {
  document.querySelectorAll("[data-processor-health]").forEach((dot) => {
    const health = getProcessorHealth(dot.dataset.processorHealth);
    dot.classList.remove("healthy", "unhealthy", "checking", "unknown");
    dot.classList.add(getProcessorHealthClass(health));
    const label = getProcessorHealthLabel(health, true);
    dot.title = label;
    dot.setAttribute("aria-label", label);
  });
}

function renderPaymentProcessorSummary() {
  if (!elements.paymentProcessorSummary) {
    return;
  }
  const data = state.paymentProcessorLogs || {};
  const filters = data.filters || {};
  elements.paymentProcessorSummary.innerHTML = `
    <div><span>Processor</span><strong>${escapeHtml(filters.processor || "all")}</strong></div>
    <div><span>İşlem Tipi</span><strong>${escapeHtml(filters.attemptType || "all")}</strong></div>
    <div><span>Result</span><strong>${escapeHtml(filters.status || "all")}</strong></div>
    <div><span>Kayıt</span><strong>${escapeHtml(data.count || 0)}</strong></div>
  `;
}

function formatMoneyForDisplay(value) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  const amount = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(amount)) {
    return String(value);
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatMoneyInputValue(value) {
  const raw = String(value || "").replace(/[^\d.]/g, "");
  if (!raw) return "";
  const [whole, ...rest] = raw.split(".");
  const decimal = rest.join("").slice(0, 2);
  const formattedWhole = whole ? Number(whole).toLocaleString("en-US") : "";
  return rest.length ? `${formattedWhole}.${decimal}` : formattedWhole;
}

function formatProcessorMoneyInput(input) {
  const cursorAtEnd = input.selectionStart === input.value.length;
  input.value = formatMoneyInputValue(input.value);
  if (cursorAtEnd) {
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function openJsonModal(title, payload) {
  openModal({
    eyebrow: "JSON Debug",
    title,
    body: `<pre class="json-modal-pre">${escapeHtml(JSON.stringify(payload || {}, null, 2))}</pre>`
  });
}

function hasJsonModelValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
}

function getPaymentProcessorLogKey(log) {
  return String(log.id || `${log.processor || log.provider || "processor"}-${log.created_at || Date.now()}`);
}

function getProcessorTransactionId(log) {
  return log.provider_reference_id ||
    log.transactionId ||
    log.responseModel?.transactionId ||
    log.responseModel?.result?.transactionId ||
    log.responseModel?.result?.retref ||
    log.responseModel?.result?.cloverChargeId ||
    log.responseModel?.providerResponse?.transactionId ||
    log.responseModel?.providerResponse?.retref ||
    log.raw_response?.result?.transactionId ||
    log.raw_response?.result?.retref ||
    log.raw_response?.result?.cloverChargeId ||
    log.raw_response?.providerResponse?.transactionId ||
    log.raw_response?.providerResponse?.retref ||
    log.raw_response?.request?.transactionId ||
    log.raw_response?.request?.retref ||
    log.requestModel?.transactionId ||
    log.requestModel?.retref ||
    null;
}

function normalizeProcessorActionProvider(value) {
  const provider = String(value || "").toLowerCase();
  if (provider === "propelr" || provider === "propelrpay") {
    return "propelrpay";
  }
  if (provider === "globalpayments" || provider === "global-payments" || provider === "portico") {
    return "globalpayments";
  }
  return provider;
}

function canRunProcessorRowAction(log) {
  const provider = normalizeProcessorActionProvider(log.processor || log.provider);
  return Boolean(getProcessorTransactionId(log) && ["propelrpay", "fluidpay", "globalpayments", "paypal"].includes(provider));
}

function renderProcessorRowActions(log, logKey) {
  if (!canRunProcessorRowAction(log)) {
    const provider = normalizeProcessorActionProvider(log.processor || log.provider);
    if (!["propelrpay", "fluidpay", "globalpayments", "paypal"].includes(provider)) {
      return `<span class="muted">Destek yok</span>`;
    }
    return `<span class="muted">Transaction yok</span>`;
  }
  const provider = normalizeProcessorActionProvider(log.processor || log.provider);
  const actions = provider === "paypal" ? [
    { key: "void", label: "İptal" },
    { key: "capture", label: "Capture" }
  ] : [
    { key: "void", label: "İptal" },
    { key: "refund", label: "İade" },
    { key: "capture", label: "Capture" },
    { key: "capture_tip", label: "Tip + Capture" }
  ];
  return `
    <div class="processor-row-actions">
      ${actions.map((action) => `
        <button type="button" class="ghost small" data-processor-action="${escapeHtml(action.key)}" data-processor-log-id="${escapeHtml(logKey)}">${escapeHtml(action.label)}</button>
      `).join("")}
    </div>
  `;
}

function renderPaymentProcessorLog(log) {
  const canViewJsonModels = state.paymentProcessorLogs?.canViewJsonModels === true && state.user?.role === "admin";
  const logKey = getPaymentProcessorLogKey(log);
  const requestId = `request-${logKey}`;
  const responseId = `response-${logKey}`;
  const transactionId = getProcessorTransactionId(log);
  state.paymentProcessorLogById[logKey] = log;
  if (canViewJsonModels) {
    state.paymentProcessorJsonModels[requestId] = log.requestModel || {};
    state.paymentProcessorJsonModels[responseId] = log.responseModel || {};
  }
  const hasRequest = canViewJsonModels && hasJsonModelValue(log.requestModel);
  const hasResponse = canViewJsonModels && hasJsonModelValue(log.responseModel);
  return `
    <tr>
      <td>
        <strong>${escapeHtml(log.attempt_type || "-")}</strong>
        <div class="muted">${escapeHtml(log.processor || log.provider || "-")}</div>
      </td>
      <td>${escapeHtml(formatMoneyForDisplay(log.amount))}</td>
      <td>${escapeHtml(log.card?.maskedPan || "-")}</td>
      <td class="processor-transaction-id">${escapeHtml(transactionId || "-")}</td>
      <td>${escapeHtml(log.actor?.displayName || log.actor?.username || log.created_by_user_id || "-")}</td>
      <td><span class="status-pill ${statusClass(log.status)}">${escapeHtml(log.status || "-")}</span></td>
      <td class="processor-table-actions">${renderProcessorRowActions(log, logKey)}</td>
      ${canViewJsonModels ? `
      <td class="processor-table-action">
        <button type="button" class="ghost small" data-json-modal="${escapeHtml(requestId)}" data-json-title="Request JSON" ${hasRequest ? "" : "disabled"}>Request</button>
      </td>
      <td class="processor-table-action">
        <button type="button" class="ghost small" data-json-modal="${escapeHtml(responseId)}" data-json-title="Response JSON" ${hasResponse ? "" : "disabled"}>Response</button>
      </td>
      ` : ""}
    </tr>
  `;
}

function renderPaymentProcessorLogs() {
  renderPaymentProcessorOptions();
  renderPaymentProcessorMenu();
  renderPaymentProcessorSummary();
  if (!elements.paymentProcessorLogsList) {
    return;
  }
  const logs = state.paymentProcessorLogs?.logs || [];
  const canViewJsonModels = state.paymentProcessorLogs?.canViewJsonModels === true && state.user?.role === "admin";
  state.paymentProcessorJsonModels = {};
  state.paymentProcessorLogById = {};
  elements.paymentProcessorLogsList.innerHTML = logs.length
    ? `
      <table class="processor-table">
        <colgroup>
          <col>
          <col>
          <col>
          <col class="processor-transaction-col">
          <col>
          <col>
          <col class="processor-actions-col">
          ${canViewJsonModels ? `
          <col class="processor-action-col">
          <col class="processor-action-col">
          ` : ""}
        </colgroup>
        <thead>
          <tr>
            <th>İşlem</th>
            <th>Miktar</th>
            <th>Kart</th>
            <th>Transaction Id</th>
            <th>İşlemi Yapan</th>
            <th>Status</th>
            <th>Actions</th>
            ${canViewJsonModels ? `
            <th>Request</th>
            <th>Response</th>
            ` : ""}
          </tr>
        </thead>
        <tbody>${logs.map(renderPaymentProcessorLog).join("")}</tbody>
      </table>
    `
    : `<article class="list-card">Bu filtrelerle işlem logu yok.</article>`;
}

function renderBurpStatus() {
  if (!elements.burpStatus) {
    return;
  }
  const status = state.burpSuite.status || {};
  elements.burpStatus.innerHTML = `
    <article class="list-card pretty-message ${status.active ? "status-good" : "status-warn"}">
      <div class="pretty-message-head">
        <strong>${status.active ? "Burp Active" : "Burp Stopped"}</strong>
        <span class="status-pill ${status.otpCaptureArmed ? "status-warn" : status.active ? "status-good" : "status-bad"}">${status.otpCaptureArmed ? "OTP armed" : status.active ? "running" : "stopped"}</span>
      </div>
      ${renderKeyValueDetails({
        "Proxy": status.proxyEnabled ? status.proxyUrl : "off",
        "Scope": Array.isArray(status.scopeHosts) && status.scopeHosts.length ? status.scopeHosts.join(", ") : "-",
        "Pending": status.pendingResponses || 0,
        "Hold": status.holdSeconds ? `${status.holdSeconds}s` : "-",
        "Keyword": status.otpPathKeyword || "-"
      })}
    </article>
  `;
}

function renderBurpTraffic() {
  if (!elements.burpTrafficList) {
    return;
  }
  const events = state.burpSuite.events || [];
  elements.burpTrafficList.innerHTML = events.length ? events.map((event) => `
    <article class="list-card burp-event ${event.type === "otp-captured" ? "burp-event-pending" : ""}">
      <div class="pretty-message-head">
        <strong>${escapeHtml(event.type || "event")}</strong>
        <span class="status-pill ${statusClass(event.status)}">${escapeHtml(event.status || "-")}</span>
      </div>
      ${renderKeyValueDetails({
        "Method": event.request?.method,
        "Host": event.request?.host,
        "Path": event.request?.path,
        "Created": event.createdAt
      })}
      <details>
        <summary>Request / response</summary>
        <pre>${escapeHtml(JSON.stringify({
          request: event.request,
          response: event.response
        }, null, 2))}</pre>
      </details>
    </article>
  `).join("") : `<article class="list-card">No traffic captured yet.</article>`;
}

function renderBurpPending() {
  if (!elements.burpPendingList || !elements.burpReleaseForm) {
    return;
  }
  const pending = state.burpSuite.pending || [];
  elements.burpPendingList.innerHTML = pending.length ? pending.map((item) => `
    <article class="list-card burp-pending-card">
      <div class="pretty-message-head">
        <strong>${escapeHtml(item.request?.method || "-")} ${escapeHtml(item.request?.path || "-")}</strong>
        <button type="button" class="ghost small" data-burp-pending-id="${escapeHtml(item.id)}">Edit Response</button>
      </div>
      ${renderKeyValueDetails({
        "Host": item.request?.host,
        "Status": item.response?.status,
        "Expires": item.expiresAt
      })}
    </article>
  `).join("") : `<article class="list-card">No pending response.</article>`;

  if (!pending.some((item) => item.id === state.burpSuite.selectedPendingId)) {
    state.burpSuite.selectedPendingId = null;
    elements.burpReleaseForm.hidden = true;
  }
}

function renderBurpOtpMessages() {
  if (!elements.burpOtpSendResult) {
    return;
  }

  const messages = state.burpSuite.otpMessages || [];
  elements.burpOtpSendResult.innerHTML = messages.length ? messages.slice(0, 5).map((item) => `
    <article class="list-card">
      <div class="pretty-message-head">
        <strong>${escapeHtml(item.channel || "otp")} · ${escapeHtml(item.recipient || "-")}</strong>
        <span class="status-pill status-good">received</span>
      </div>
      ${renderKeyValueDetails({
        "Purpose": item.purpose,
        "Created": item.createdAt,
        "Expires": item.expiresAt
      })}
      <details>
        <summary>Inbox payload</summary>
        <pre>${escapeHtml(JSON.stringify(item.body || item, null, 2))}</pre>
      </details>
    </article>
  `).join("") : `<article class="list-card">No local OTP messages yet.</article>`;
}

function renderBurpSuite() {
  renderBurpStatus();
  renderBurpTraffic();
  renderBurpPending();
  renderBurpOtpMessages();
}

function renderCloverLearningRun(result) {
  if (!elements.cloverLearningResult) {
    return;
  }

  const output = result?.output || {};
  const validCards = output.validCards || output.cards || [];
  const attempts = output.attempts || [];

  elements.cloverLearningResult.innerHTML = `
    <article class="list-card pretty-message ${statusClass(result?.status || (result?.ok ? "completed" : "partial"))}">
      <div class="pretty-message-head">
        <strong>${escapeHtml(result?.message || "Machine learning run completed")}</strong>
        <span class="status-pill ${statusClass(result?.status || "-")}">${escapeHtml(result?.status || "-")}</span>
      </div>
      <div class="summary-grid">
        <div><span>Requested</span><strong>${escapeHtml(output.requestedCount ?? result?.input?.quantity ?? "-")}</strong></div>
        <div><span>Valid</span><strong>${escapeHtml(output.validCount ?? validCards.length)}</strong></div>
        <div><span>Invalid</span><strong>${escapeHtml(output.invalidCount ?? "-")}</strong></div>
        <div><span>Total Attempts</span><strong>${escapeHtml(output.totalAttempts ?? attempts.length)}</strong></div>
        <div><span>BIN</span><strong>${escapeHtml(result?.input?.bin || "-")}</strong></div>
        <div><span>Mode</span><strong>${escapeHtml(result?.mode || "-")}</strong></div>
      </div>
    </article>
    <section class="history-tabs">
      <section>
        <h4>Valid Results</h4>
        ${validCards.length ? validCards.map((card, index) => `
          <article class="list-card">
            <div class="pretty-message-head">
              <strong>#${index + 1} ${escapeHtml(card.maskedPan || "-")}</strong>
              <span class="status-pill status-good">valid</span>
            </div>
            ${renderKeyValueDetails({
              "First6": card.first6,
              "Last4": card.last4,
              "Expiry": card.expiry || `${card.expMonth || "--"}/${card.expYear || "--"}`,
              "CVV Length": card.cvvLength,
              "Verified": card.verifiedAt,
              "Tokenized": card.tokenized ? "yes" : "no"
            })}
          </article>
        `).join("") : `<article class="list-card">No valid result for this run.</article>`}
      </section>
      <section>
        <h4>Attempts</h4>
        ${attempts.length ? attempts.slice(0, 80).map((attempt) => `
          <article class="list-card">
            <div class="pretty-message-head">
              <strong>Attempt ${escapeHtml(attempt.attempt || "-")} · ${escapeHtml(attempt.card?.maskedPan || "-")}</strong>
              <span class="status-pill ${statusClass(attempt.status)}">${escapeHtml(attempt.status || "-")}</span>
            </div>
            ${renderKeyValueDetails({
              "Error": attempt.errorCode,
              "Provider": attempt.providerStatus,
              "Message": attempt.providerMessage,
              "Checked": attempt.checkedAt
            })}
          </article>
        `).join("") : `<article class="list-card">No attempts recorded.</article>`}
      </section>
    </section>
    <details class="raw-details">
      <summary>Raw result</summary>
      <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>
    </details>
  `;
}

function selectBurpPending(pendingId) {
  const pending = (state.burpSuite.pending || []).find((item) => item.id === pendingId);
  if (!pending || !elements.burpReleaseForm) {
    return;
  }

  state.burpSuite.selectedPendingId = pending.id;
  elements.burpReleaseForm.hidden = false;
  elements.burpReleaseForm.elements.pendingId.value = pending.id;
  elements.burpReleaseForm.elements.status.value = pending.response?.status || 200;
  elements.burpReleaseForm.elements.headers.value = JSON.stringify(pending.response?.headers || {}, null, 2);
  elements.burpReleaseForm.elements.body.value = JSON.stringify(pending.response?.body ?? {}, null, 2);
  elements.burpReleaseForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  if (["approved", "verified", "passed", "success", "captured", "recorded"].includes(status)) return "status-good";
  if (["declined", "failed", "invalid", "error"].includes(status)) return "status-bad";
  return "status-warn";
}

function renderCardOptions() {
  if (!elements.cardOptions) {
    return;
  }

  elements.cardOptions.innerHTML = state.cards.map((card) => `
    <option value="${escapeHtml(card.id)}" label="${escapeHtml(formatSavedCardOptionLabel(card))}"></option>
  `).join("");

  document.querySelectorAll("[data-card-select]").forEach((select) => {
    const selected = select.value || MANUAL_CARD_VALUE;
    select.innerHTML = `
      <option value="${MANUAL_CARD_VALUE}">Manual Card</option>
      ${state.cards.map((card) => `
        <option value="${escapeHtml(card.id)}">${escapeHtml(formatSavedCardOptionLabel(card))}</option>
      `).join("")}
    `;
    select.value = state.cards.some((card) => card.id === selected) ? selected : MANUAL_CARD_VALUE;
    syncCardSelect(select);
  });
}

function formatCardDisplayNumber(card) {
  if (card.first6 && card.last4) {
    return `${card.first6}******${card.last4}`;
  }
  return card.masked_pan || card.id;
}

function formatCardExpiry(card) {
  const month = card?.exp_month || card?.expMonth || "--";
  const year = card?.exp_year || card?.expYear || "----";
  return `${month}/${year}`;
}

function formatShortToken(value) {
  const token = String(value || "");
  if (!token) {
    return "-";
  }
  if (token.length <= 14) {
    return token;
  }
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

function formatSavedCardOptionLabel(card) {
  return [
    formatCardDisplayNumber(card),
    card.brand || "-",
    formatCardExpiry(card),
    card.cardholder_name || "-",
    card.provider || "-"
  ].filter(Boolean).join(" · ");
}

function getSavedCardSelectOptions() {
  return [
    { value: MANUAL_CARD_VALUE, label: "Manual Card" },
    ...state.cards.map((card) => ({
      value: card.id,
      label: formatSavedCardOptionLabel(card)
    }))
  ];
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

function getProcessorActionConfig(action) {
  const configs = {
    void: {
      title: "İşlemi İptal Et",
      operation: "void",
      submitLabel: "İptal Et",
      amount: false,
      tip: false
    },
    refund: {
      title: "İade Oluştur",
      operation: "refund",
      submitLabel: "İade Et",
      amount: true,
      amountLabel: "İade Miktarı",
      amountRequired: true,
      tip: false
    },
    capture: {
      title: "Provizyonu Capture Et",
      operation: "capture",
      submitLabel: "Capture",
      amount: true,
      amountLabel: "Capture Miktarı",
      amountRequired: false,
      tip: false
    },
    capture_tip: {
      title: "Tip ile Capture Et",
      operation: "capture",
      submitLabel: "Tip + Capture",
      amount: true,
      amountLabel: "Capture Miktarı",
      amountRequired: false,
      tip: true
    }
  };
  return configs[action] || null;
}

function openProcessorActionModal(log, action) {
  const config = getProcessorActionConfig(action);
  const transactionId = getProcessorTransactionId(log);
  const provider = normalizeProcessorActionProvider(log.processor || log.provider);
  if (!config || !transactionId || !provider) {
    return;
  }
  const displayAmount = formatMoneyForDisplay(log.amount);
  openModal({
    eyebrow: "Processor Action",
    title: config.title,
    body: `
      <form id="processorActionForm" class="processor-action-form">
        <input type="hidden" name="provider" value="${escapeHtml(provider)}">
        <input type="hidden" name="operation" value="${escapeHtml(config.operation)}">
        <input type="hidden" name="transactionId" value="${escapeHtml(transactionId)}">
        <input type="hidden" name="retref" value="${escapeHtml(transactionId)}">
        <input type="hidden" name="currency" value="${escapeHtml(log.currency || "USD")}">
        ${log.card_id || log.cardId ? `<input type="hidden" name="cardId" value="${escapeHtml(log.card_id || log.cardId)}">` : ""}
        <div class="processor-action-summary">
          <div><span>Provider</span><strong>${escapeHtml(provider)}</strong></div>
          <div><span>İşlem</span><strong>${escapeHtml(log.attempt_type || "-")}</strong></div>
          <div><span>Transaction</span><strong>${escapeHtml(transactionId)}</strong></div>
          <div><span>Mevcut Miktar</span><strong>${escapeHtml(displayAmount)}</strong></div>
        </div>
        <div class="processor-action-fields">
          ${config.amount ? `
            <label>
              <span>${escapeHtml(config.amountLabel || "Miktar")}</span>
              <input name="amount" inputmode="decimal" data-money-format value="${escapeHtml(log.amount ?? "")}" ${config.amountRequired ? "required" : ""}>
            </label>
          ` : ""}
          ${config.tip ? `
            <label>
              <span>Tip Miktarı</span>
              <input name="gratuityAmount" inputmode="decimal" data-money-format value="">
            </label>
          ` : ""}
        </div>
        <div class="form-actions">
          <button type="button" class="ghost" data-modal-close>Vazgeç</button>
          <button type="submit">${escapeHtml(config.submitLabel)}</button>
        </div>
      </form>
    `
  });
}

async function submitProcessorAction(form) {
  const payload = removeEmptyFields(formToObject(form));
  if (payload.amount) {
    payload.amount = String(payload.amount).replace(/,/g, "");
  }
  if (payload.gratuityAmount) {
    payload.gratuityAmount = String(payload.gratuityAmount).replace(/,/g, "");
  }
  let result;
  if (payload.provider === "paypal" && payload.operation === "capture") {
    payload.authorizationPnref = payload.transactionId || payload.retref;
    result = await api("/providers/paypal/manager/cards/capture", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } else if (payload.provider === "paypal" && payload.operation === "void") {
    payload.authorizationPnref = payload.transactionId || payload.retref;
    result = await api("/providers/paypal/direct-payment/cards/void", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } else {
    result = await api("/provider-operations/cards", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  await loadPaymentProcessorLogs();
  await loadProviderReports();
  openJsonModal("Processor Action Result", result);
}

async function submitPaymentProcessorOperationForm(form) {
  const payload = applySelectedCardPayload(
    form,
    removeEmptyFields(formToObject(form))
  );
  const selectedMethod = getSelectedPaymentProcessorOperationMethod();
  const selectedMethodKey = payload.operation;
  const isPropelr = payload.provider === "propelr" || payload.provider === "propelrpay";
  const isPayPal = payload.provider === "paypal";
  const isPropelrSequence = isPropelr && selectedMethodKey === "amount_sequence";
  const isTransactionDetail = isPropelr && selectedMethodKey === "transaction_detail";

  if (selectedMethod?.operation) {
    payload.operation = selectedMethod.operation;
  }
  if (payload.amount && !isPropelr) {
    payload.amount = Number(String(payload.amount).replace(/,/g, ""));
  }
  if (!payload.bin && payload.pan) {
    payload.bin = String(payload.pan).replace(/\D/g, "").slice(0, 6);
  }
  if (!payload.reference && !isPropelr) {
    payload.reference = `processor-${payload.provider}-${Date.now()}`;
  }
  if (isPropelr) {
    if (isPropelrSequence) {
      payload.amounts = [payload.sequenceAmount1 || "1,100.12", payload.sequenceAmount2 || "1,100.25"];
      delete payload.amount;
    }
    delete payload.sequenceAmount1;
    delete payload.sequenceAmount2;
  }
  const actionComponent = window.PaymentProcessorActionComponents?.[normalizeProcessorActionProvider(payload.provider)];
  if (actionComponent?.normalizePayload) {
    actionComponent.normalizePayload(payload);
  }

  let result;
  if (isPayPal && selectedMethodKey === "sale") {
    result = await api("/providers/paypal/direct-payment/cards/sale", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paymentProcessorOperationResult, "PayPal Sale", result);
  } else if (isPayPal && selectedMethodKey === "auth") {
    result = await api("/providers/paypal/manager/cards/auth", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paymentProcessorOperationResult, "PayPal Authorize", result);
  } else if (isPayPal && selectedMethodKey === "capture") {
    result = await api("/providers/paypal/manager/cards/capture", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paymentProcessorOperationResult, "PayPal Capture", result);
  } else if (isPayPal && selectedMethodKey === "void") {
    result = await api("/providers/paypal/direct-payment/cards/void", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paymentProcessorOperationResult, "PayPal Void", result);
  } else if (isPropelrSequence) {
    result = await api("/providers/propelr/amount-sequence", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paymentProcessorOperationResult, "Propelr 2 Request", result);
  } else if (isTransactionDetail) {
    result = await api(`/providers/propelr/transactions/${encodeURIComponent(payload.transactionId)}`);
    renderGenericProviderResult(elements.paymentProcessorOperationResult, "Propelr Transaction Detail", result);
  } else {
    result = await api("/provider-operations/cards", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderProviderOperationResult(result, elements.paymentProcessorOperationResult);
  }

  await loadPaymentProcessorLogs();
  await loadProviderReports();
  return result;
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
    const verifyCheck = latestCheck(card.id, "auth_check");
    const balanceCheck = latestCheck(card.id, "balance_check");
    const liveClass = liveCheck ? statusClass(liveCheck.status) : "status-warn";
    const binClass = binCheck ? statusClass(binCheck.status) : "status-warn";
    const verifyClass = verifyCheck ? statusClass(verifyCheck.status) : "status-warn";
    const safeCardId = escapeHtml(card.id);

    row.innerHTML = `
      <td>${escapeHtml(formatCardDisplayNumber(card))}</td>
      <td>${escapeHtml(balanceCheck?.balance_amount ?? balanceCheck?.amount ?? "-")}</td>
      <td>${escapeHtml(card.cardholder_name || "-")}</td>
      <td>
        <span class="status-pill ${binClass}">BIN ${escapeHtml(binCheck?.status || "none")}</span>
        <span class="status-pill ${liveClass}">LIVE ${escapeHtml(liveCheck?.status || "none")}</span>
        <span class="status-pill ${verifyClass}">VERIFY ${escapeHtml(verifyCheck?.status || "none")}</span>
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
    ? items.map(renderAttemptSummary).join("")
    : `<article class="list-card">No checks yet for this card.</article>`;
}

function attemptMessage(item) {
  const raw = item.raw_response || {};
  return raw.result?.responseMessage ||
    raw.verification?.responseMessage ||
    raw.binCheck?.status ||
    raw.message ||
    item.provider_reference_id ||
    "-";
}

function renderAttemptSummary(item) {
  return `
    <article class="list-card">
      <div class="pretty-message-head">
        <strong>${escapeHtml(item.attempt_type || "-")}</strong>
        <span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status || "-")}</span>
      </div>
      ${renderKeyValueDetails({
        "Provider": item.provider,
        "Message": attemptMessage(item),
        "Reference": item.provider_reference_id,
        "Amount": item.amount,
        "Currency": item.currency,
        "Balance": item.balance_amount,
        "Created": item.created_at,
        "User": item.created_by_user_id
      })}
    </article>
  `;
}

function renderCardHistory(cardId) {
  const card = state.cards.find((item) => item.id === cardId);
  const checks = checksForCard(cardId);
  const logs = state.auditLogs.filter((log) => log.entity_type === "card" && log.entity_id === cardId);
  const checkItems = checks.filter((item) => ["bin_check", "live_check", "balance_check", "auth_check", "iframe_verify"].includes(item.attempt_type));
  const processItems = checks.filter((item) => !["bin_check", "live_check", "balance_check", "auth_check", "iframe_verify"].includes(item.attempt_type));
  const body = `
    <article class="list-card">
      <strong>${escapeHtml(card?.masked_pan || cardId)}</strong>
      <div>${escapeHtml(card?.cardholder_name || "-")} · ${escapeHtml(card?.provider || "-")}</div>
    </article>
    <div class="history-tabs">
      <section>
        <h4>Check List</h4>
        ${checkItems.length ? checkItems.map(renderAttemptSummary).join("") : `<article class="list-card">No check records yet.</article>`}
      </section>
      <section>
        <h4>Process List</h4>
        ${processItems.length ? processItems.map(renderAttemptSummary).join("") : `<article class="list-card">No process records yet.</article>`}
      </section>
      ${can("canManageUsers") ? `
        <section>
          <h4>Logs</h4>
          ${logs.length ? logs.map((log) => `
            <article class="list-card">
              <div class="pretty-message-head">
                <strong>${escapeHtml(log.action)}</strong>
                <span class="status-pill ${statusClass(log.status)}">${escapeHtml(log.status)}</span>
              </div>
              ${renderKeyValueDetails({
                "Entity": log.entity_type,
                "Created": log.created_at,
                "Actor": log.actor_user_id
              })}
            </article>
          `).join("") : `<article class="list-card">No logs yet.</article>`}
        </section>
      ` : ""}
    </div>
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
  elements.selectedCardTitle.textContent = formatCardDisplayNumber(card);
  elements.selectedCardMeta.textContent = `${card.cardholder_name || "Unknown holder"} · ${card.brand || "Unknown brand"} · ${card.verification_status || "pending"}`;

  const showCheckForm = can("canRunLiveCheck") || can("canRunBinCheck") || can("canRunBalanceCheck") || can("canRunAuthCheck");
  elements.checkForm.hidden = !showCheckForm;
  elements.enrollmentForm.hidden = !(can("canCreateEnrollment") && !card.is_enrolled);
  fillCardDrivenForms(card);
  renderChecks();
}

function setFormValue(form, name, value) {
  if (form?.elements?.[name] && value != null && value !== "") {
    form.elements[name].value = value;
  }
}

function assignFormValue(form, name, value = "") {
  if (form?.elements?.[name]) {
    form.elements[name].value = value == null ? "" : value;
  }
}

function getCardById(cardId) {
  return state.cards.find((card) => card.id === cardId) || null;
}

function isManualCardValue(value) {
  return !value || value === MANUAL_CARD_VALUE;
}

function syncCardSelect(select) {
  const manualFields = document.getElementById(select.dataset.manualTarget || "");
  const card = getCardById(select.value);
  if (manualFields) {
    manualFields.hidden = Boolean(card);
    if (!card) {
      clearManualFields(manualFields);
      assignFormValue(select.form, "source", "");
    }
  }
  renderCardSummary(select, card);
  if (card && select.form) {
    fillTransactionFormFromCard(select.form, card);
  }
}

function clearManualFields(container) {
  container.querySelectorAll("input, select, textarea").forEach((field) => {
    if (field.name === "billingCountry") {
      field.value = "US";
      return;
    }
    field.value = "";
  });
}

function renderCardSummary(select, card) {
  const target = document.getElementById(select.dataset.summaryTarget || "");
  if (!target) {
    return;
  }

  if (!card) {
    target.innerHTML = `
      <div class="summary-empty">Manual card entry</div>
    `;
    return;
  }

  target.innerHTML = `
    <div class="summary-grid">
      <div><span>Card</span><strong>${escapeHtml(formatCardDisplayNumber(card))}</strong></div>
      <div><span>Holder</span><strong>${escapeHtml(card.cardholder_name || "-")}</strong></div>
      <div><span>Expiry</span><strong>${escapeHtml(card.exp_month || "--")}/${escapeHtml(card.exp_year || "----")}</strong></div>
      <div><span>Brand</span><strong>${escapeHtml(card.brand || "-")}</strong></div>
      <div><span>ZIP</span><strong>${escapeHtml(card.billing_zip || "-")}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(card.verification_status || "pending")}</strong></div>
    </div>
  `;
}

function renderManualPaymentSummary(card) {
  if (!elements.manualPaymentCardSummary) {
    return;
  }
  const hasCardSearch = Boolean(elements.manualPaymentForm?.elements?.cardId);
  elements.manualPaymentCardSummary.hidden = !hasCardSearch;
  if (!hasCardSearch) {
    elements.manualPaymentCardSummary.innerHTML = "";
    return;
  }
  if (!card) {
    elements.manualPaymentCardSummary.innerHTML = `<div class="summary-empty">Manual card entry</div>`;
    return;
  }
  elements.manualPaymentCardSummary.innerHTML = `
    <div class="summary-grid">
      <div><span>Card</span><strong>${escapeHtml(formatCardDisplayNumber(card))}</strong></div>
      <div><span>Provider</span><strong>${escapeHtml(card.provider || "-")}</strong></div>
      <div><span>Token</span><strong>${escapeHtml(formatShortToken(card.provider_payment_token))}</strong></div>
      <div><span>Holder</span><strong>${escapeHtml(card.cardholder_name || "-")}</strong></div>
      <div><span>Expiry</span><strong>${escapeHtml(formatCardExpiry(card))}</strong></div>
      <div><span>Brand</span><strong>${escapeHtml(card.brand || "-")}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(card.verification_status || "pending")}</strong></div>
    </div>
  `;
}

function syncManualPaymentCardSearch() {
  const cardId = elements.manualPaymentForm?.elements?.cardId?.value;
  const card = getCardById(cardId);
  renderManualPaymentSummary(card);
  if (card) {
    fillTransactionFormFromCard(elements.manualPaymentForm, card);
  }
}

function applySelectedCardPayload(form, payload, { includeBilling = true } = {}) {
  const card = getCardById(payload.cardId);
  if (!card) {
    delete payload.cardId;
    return payload;
  }

  payload.pan = card.pan;
  payload.expMonth = card.exp_month;
  payload.expYear = card.exp_year;
  payload.cardholderName = card.cardholder_name;
  payload.source = payload.source || card.provider_payment_token;
  payload.providerPaymentToken = card.provider_payment_token;
  payload.first6 = card.first6;
  payload.last4 = card.last4;

  if (includeBilling) {
    payload.billingAddressLine1 = card.billing_address_line1;
    payload.billingCity = card.billing_city;
    payload.billingState = card.billing_state;
    payload.billingZip = card.billing_zip;
    payload.billingCountry = card.billing_country || payload.billingCountry;
  }

  const nameParts = String(card.cardholder_name || "").trim().split(/\s+/).filter(Boolean);
  payload.firstName = payload.firstName || nameParts[0];
  payload.lastName = payload.lastName || nameParts.slice(1).join(" ");
  return removeEmptyFields(payload);
}

function fillCardDrivenForms(card) {
  const forms = [
    elements.providerVerificationForm,
    elements.manualPaymentForm,
    elements.cloverVerifyForm,
    elements.providerOperationForm,
    elements.paypalBinCheckForm,
    elements.paypalLiveCheckForm,
    elements.balanceCheckForm,
    elements.paypalSaleForm,
    elements.paypalAuthForm,
    elements.paypalCaptureForm,
    elements.paypalVoidForm
  ];

  forms.forEach((form) => {
    setFormValue(form, "cardId", card.id);
    const select = form?.elements?.cardId;
    const manualFields = document.getElementById(select?.dataset?.manualTarget || "");
    if (manualFields) {
      manualFields.hidden = true;
    }
    if (select) {
      renderCardSummary(select, card);
    }
    fillTransactionFormFromCard(form, card);
  });
  setFormValue(elements.paypalBinCheckForm, "bin", card.first6);
  setFormValue(elements.paypalLiveCheckForm, "pan", card.pan);
  setFormValue(elements.cloverVerifyForm, "source", card.provider_payment_token);
  setFormValue(elements.cloverVerifyForm, "bin", card.first6);
}

function fillTransactionFormFromCard(form, card) {
  if (!form || !card) {
    return;
  }
  const nameParts = String(card.cardholder_name || "").trim().split(/\s+/).filter(Boolean);
  assignFormValue(form, "pan", card.pan);
  assignFormValue(form, "expMonth", card.exp_month);
  assignFormValue(form, "expYear", card.exp_year);
  assignFormValue(form, "expiry", `${String(card.exp_month || "").padStart(2, "0")}${String(card.exp_year || "").slice(-2)}`);
  assignFormValue(form, "cardholderName", card.cardholder_name);
  assignFormValue(form, "source", card.provider_payment_token);
  assignFormValue(form, "bin", card.first6);
  assignFormValue(form, "firstName", nameParts[0]);
  assignFormValue(form, "lastName", nameParts.slice(1).join(" "));
  assignFormValue(form, "billingAddressLine1", card.billing_address_line1);
  assignFormValue(form, "billingCity", card.billing_city);
  assignFormValue(form, "billingState", card.billing_state);
  assignFormValue(form, "street", card.billing_address_line1);
  assignFormValue(form, "city", card.billing_city);
  assignFormValue(form, "state", card.billing_state);
  assignFormValue(form, "billingZip", card.billing_zip);
  assignFormValue(form, "billingCountry", card.billing_country || "US");
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
        <div class="pretty-message-head">
          <strong>${escapeHtml(log.action)}</strong>
          <span class="status-pill ${statusClass(log.status)}">${escapeHtml(log.status)}</span>
        </div>
        ${renderKeyValueDetails({
          "Entity": log.entity_type,
          "Entity Id": log.entity_id,
          "Created": log.created_at,
          "Actor": log.actor_user_id
        })}
      </article>
    `).join("")
    : `<article class="list-card">No audit logs found.</article>`;
}

function renderUnchargebackCases() {
  if (!elements.unchargebackList) {
    return;
  }

  elements.unchargebackList.innerHTML = state.unchargebackCases.length
    ? state.unchargebackCases.map((item) => `
      <article class="list-card unchargeback-item">
        <div class="unchargeback-main">
          <div>
            <strong>${escapeHtml(item.owner_name || "-")}</strong>
            <div>Number: ${escapeHtml(item.owner_number || "-")}</div>
            <div>Price: ${escapeHtml(formatMoney(item.content_price))}</div>
            <div>Case: ${escapeHtml(item.case_id || "-")} · Tx: ${escapeHtml(item.transaction_id || "-")}</div>
          </div>
          <div class="unchargeback-actions">
            <button type="button" class="${item.widget_embed_html ? "ghost" : "danger"}" data-unchargeback-action="widget" data-case-id="${escapeHtml(item.id)}">
              Tip Widget
            </button>
            <button type="button" class="${item.content_embed_html ? "ghost" : "danger"}" data-unchargeback-action="content" data-case-id="${escapeHtml(item.id)}">
              Content
            </button>
          </div>
        </div>
        <div class="unchargeback-preview">
          <span>Preview</span>
          ${item.widget_embed_html ? item.widget_embed_html : `<div class="preview-empty">No widget</div>`}
        </div>
      </article>
    `).join("")
    : `<article class="list-card">No unchargeback cases yet.</article>`;
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  return numeric.toLocaleString(undefined, {
    style: "currency",
    currency: "USD"
  });
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
  if (!target) {
    return;
  }
  const status = payload?.status || payload?.result?.status || (payload?.success === true || payload?.ok === true ? "success" : payload?.success === false || payload?.ok === false ? "failed" : (/error/i.test(title) ? "failed" : "success"));
  const message = payload?.failureReason || payload?.responseMessage || payload?.result?.responseMessage || payload?.message || payload?.error || payload?.verificationStatus || "İşlem tamamlandı";
  const details = {
    "Operation Id": payload?.operationId,
    "HTTP Status": payload?.httpStatus,
    "Status": status,
    "Result Code": payload?.resultCode || payload?.result?.resultCode,
    "Failure Reason": payload?.failureReason,
    "Transaction Id": payload?.transactionId || payload?.result?.transactionId || payload?.cloverChargeId,
    "Reference": payload?.correlationId || payload?.reference,
    "Amount": payload?.amount || payload?.result?.amount,
    "Currency": payload?.currency || payload?.result?.currency
  };

  target.innerHTML = `
    <article class="list-card pretty-message ${statusClass(status)}">
      <div class="pretty-message-head">
        <strong>${escapeHtml(title)}</strong>
        <span class="status-pill ${statusClass(status)}">${escapeHtml(status || "-")}</span>
      </div>
      <p>${escapeHtml(message)}</p>
      ${renderKeyValueDetails(details)}
      <details class="raw-details">
        <summary>Raw response</summary>
        <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
      </details>
    </article>
  `;
}

function renderKeyValueDetails(items = {}) {
  return Object.entries(items).map(([label, value]) => `
    <div class="kv-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `).join("");
}

function renderBinCheckResult(result, target = elements.paypalBinCheckResult) {
  const details = result?.details || {};
  const ipDetails = result?.ipDetails || null;

  target.innerHTML = `
    ${renderCardIntelligenceLayout({
      title: "BIN/IIN Result",
      status: result?.status,
      bin: result?.bin,
      ip: result?.ip,
      details,
      ipDetails
    })}
  `;
}

function pickDetail(details, keys) {
  for (const key of keys) {
    if (details?.[key] !== undefined && details?.[key] !== null && details?.[key] !== "" && details?.[key] !== "API Only") {
      return details[key];
    }
  }
  return null;
}

function renderCardIntelligenceLayout({ title, status, bin, ip, details = {}, ipDetails = {}, live = null } = {}) {
  return `
    <article class="list-card bin-result">
      <div class="pretty-message-head">
        <strong>${escapeHtml(title || "Card Intelligence")}</strong>
        <span class="status-pill ${statusClass(status)}">${escapeHtml(status || "-")}</span>
      </div>
      <div class="summary-grid card-intelligence-summary">
        <div><span>BIN/IIN</span><strong>${escapeHtml(bin || details["BIN/IIN"] || "-")}</strong></div>
        <div><span>Banka</span><strong>${escapeHtml(pickDetail(details, ["Issuer Name / Bank"]) || "-")}</strong></div>
        <div><span>Scheme</span><strong>${escapeHtml(pickDetail(details, ["Card Scheme"]) || "-")}</strong></div>
        <div><span>Brand</span><strong>${escapeHtml(pickDetail(details, ["Card Brand"]) || "-")}</strong></div>
        <div><span>Tip</span><strong>${escapeHtml(pickDetail(details, ["Card Type"]) || "-")}</strong></div>
        <div><span>Seviye</span><strong>${escapeHtml(pickDetail(details, ["Card Level"]) || "-")}</strong></div>
        <div><span>Ülke</span><strong>${escapeHtml(pickDetail(details, ["ISO Country Name", "ISO Country Code A2"]) || "-")}</strong></div>
        <div><span>Currency</span><strong>${escapeHtml(pickDetail(details, ["Card Currency", "ISO Country Currency"]) || "-")}</strong></div>
        <div><span>Commercial</span><strong>${escapeHtml(pickDetail(details, ["Commercial Card?"]) || "-")}</strong></div>
        <div><span>Prepaid</span><strong>${escapeHtml(pickDetail(details, ["Prepaid Card?"]) || "-")}</strong></div>
        ${live ? `
          <div><span>Live Result</span><strong>${escapeHtml(live.status || "-")}</strong></div>
          <div><span>Provider Message</span><strong>${escapeHtml(live.responseMessage || "-")}</strong></div>
        ` : ""}
      </div>
      <strong class="result-subtitle">Kart / BIN Detayları</strong>
      ${renderKeyValueDetails(details)}
      ${ip || Object.keys(ipDetails || {}).length ? `
        <strong class="result-subtitle">IP Detayları</strong>
        ${renderKeyValueDetails(ipDetails)}
      ` : ""}
    </article>
  `;
}

function renderLiveAndBinCheckResult({ live, binCheck }, target = elements.paypalLiveCheckResult) {
  const details = binCheck?.details || {};
  const ipDetails = binCheck?.ipDetails || null;
  target.innerHTML = `
    <article class="list-card pretty-message ${statusClass(live?.status)}">
      <div class="pretty-message-head">
        <strong>Live Check</strong>
        <span class="status-pill ${statusClass(live?.status)}">${escapeHtml(live?.status || "-")}</span>
      </div>
      ${renderKeyValueDetails({
        "Result Code": live?.resultCode,
        "Response Message": live?.responseMessage,
        "PNREF": live?.pnref,
        "Auth Code": live?.authCode,
        "AVS Address": live?.avsAddress,
        "AVS ZIP": live?.avsZip,
        "CVV Match": live?.cvv2Match,
        "Amount": live?.amount,
        "Card": live?.card?.maskedPan,
        "Brand": live?.card?.brand,
        "First6": live?.card?.first6,
        "Last4": live?.card?.last4
      })}
    </article>
    ${renderCardIntelligenceLayout({
      title: "Live Check ile Gelen BIN Detayları",
      status: binCheck?.status,
      bin: binCheck?.bin,
      ip: binCheck?.ip,
      details,
      ipDetails,
      live
    })}
  `;
}

function renderCloverVerifyResult(result) {
  const card = result?.card || {};
  const verification = result?.verification || {};
  const binCheck = result?.binCheck || {};
  const fraudChecks = verification.fraudChecks || {};
  const binDetails = binCheck.details || {};
  const ipDetails = binCheck.ipDetails || null;

  elements.cloverVerifyResult.innerHTML = `
    <article class="list-card">
      <strong>Card Snapshot</strong>
      ${renderKeyValueDetails({
        "Mode": card.mode,
        "Card": card.maskedPan,
        "BIN": card.first6,
        "Last4": card.last4,
        "Holder": card.cardholderName,
        "Expiry": card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear}` : null,
        "Source Token": card.sourceToken
      })}
    </article>
    <article class="list-card">
      <strong>Clover Verification</strong>
      <div>Status: <span class="status-pill ${statusClass(verification.status)}">${escapeHtml(verification.status || "-")}</span></div>
      <div>Mode: ${escapeHtml(verification.verificationMode || "-")}</div>
      <div>Preauth submitted: ${verification.submittedToClover ? "yes" : "no"}</div>
      ${verification.cloverChargeId ? `<div>Charge: ${escapeHtml(verification.cloverChargeId)}</div>` : ""}
      ${verification.amount ? `<div>Amount: ${escapeHtml(verification.amount)} ${escapeHtml(verification.currency || "")}</div>` : ""}
      ${renderKeyValueDetails({
        "CVC Check": fraudChecks.cvcCheck,
        "Address Check": fraudChecks.addressLine1Check,
        "ZIP Check": fraudChecks.addressZipCheck
      })}
      ${verification.message ? `<div>${escapeHtml(verification.message)}</div>` : ""}
      ${verification.error ? `<pre>${escapeHtml(JSON.stringify({ error: verification.error }, null, 2))}</pre>` : ""}
    </article>
    <article class="list-card bin-result">
      <strong>BIN/IIN Result</strong>
      <div>Status: <span class="status-pill ${statusClass(binCheck.status)}">${escapeHtml(binCheck.status || "-")}</span></div>
      ${renderKeyValueDetails(binDetails)}
      ${ipDetails ? `
        <strong class="result-subtitle">IP Check</strong>
        ${renderKeyValueDetails(ipDetails)}
      ` : ""}
      <pre>${escapeHtml(JSON.stringify({
        status: binCheck.status,
        bin: binCheck.bin,
        ip: binCheck.ip,
        source: binCheck.source,
        error: binCheck.error || undefined
      }, null, 2))}</pre>
    </article>
  `;
}

function renderProviderOperationResult(result, target = elements.providerOperationResult) {
  const card = result?.card || {};
  const persistedCard = result?.persistedCard || {};
  const providerResult = result?.result || {};
  const binCheck = result?.binCheck || null;
  const tokenization = result?.tokenization || null;
  const binDetails = binCheck?.details || {};
  const ipDetails = binCheck?.ipDetails || null;

  if (!target) {
    return;
  }

  const operationTitle = `${result?.provider || "Provider"} ${result?.operation || "operation"}`;
  const status = result?.status || providerResult.status || (result?.success === true ? "success" : result?.success === false ? "failed" : "unknown");
  const providerMessage = result?.failureReason || result?.responseMessage || providerResult.responseMessage || providerResult.error || "İşlem tamamlandı";

  target.innerHTML = `
    <article class="list-card pretty-message ${statusClass(status)}">
      <div class="pretty-message-head">
        <strong>${escapeHtml(operationTitle)}</strong>
        <span class="status-pill ${statusClass(status)}">${escapeHtml(status || "-")}</span>
      </div>
      <p>${escapeHtml(providerMessage)}</p>
      ${renderKeyValueDetails({
        "Operation Id": result?.operationId,
        "HTTP Status": result?.httpStatus,
        "Success": result?.success === undefined ? null : result.success ? "yes" : "no",
        "Provider": result?.provider,
        "Operation": result?.operation,
        "Response Message": result?.responseMessage,
        "Failure Reason": result?.failureReason,
        "Transaction Id": providerResult.transactionId || providerResult.cloverChargeId,
        "Auth Code": providerResult.authCode,
        "Result Code": result?.resultCode || providerResult.resultCode,
        "COF": providerResult.storedCredential?.cof,
        "Scheduled": providerResult.storedCredential?.cofscheduled,
        "Ecom Ind": providerResult.storedCredential?.ecomind,
        "Amount": result?.amount?.requestedAmount || providerResult.amount,
        "Submitted Amount": result?.amount?.submittedAmount || providerResult.submittedAmount,
        "Provider Amount": result?.amount?.providerAmount || providerResult.providerAmount,
        "Currency": providerResult.currency,
        "AVS": providerResult.avsResult,
        "CVV": providerResult.cvvResult,
        "Online / CNP": providerResult.status === "approved" ? "accepted by provider" : "not approved",
        "MOTO": providerResult.entryMode === "MOTO" ? "requested" : "not returned by provider",
        "MCC": binDetails.mcc || binDetails.merchantCategoryCode || binDetails.merchant_category_code,
        "Tokenized": tokenization?.ok ? "yes" : null,
        "Verification Mode": providerResult.verificationMode,
        "Submitted to Clover": providerResult.submittedToClover === undefined ? null : providerResult.submittedToClover ? "yes" : "no"
      })}
    </article>
    <article class="list-card">
      <strong>Mapped Card Data</strong>
      ${renderKeyValueDetails({
        "Card Id": result?.cardId,
        "Stored Provider": persistedCard.provider,
        "Card": persistedCard.maskedPan || card.maskedPan,
        "BIN": persistedCard.first6 || card.first6,
        "Last4": persistedCard.last4 || card.last4,
        "Brand": persistedCard.brand || card.brand,
        "Expiry": persistedCard.expMonth && persistedCard.expYear ? `${persistedCard.expMonth}/${persistedCard.expYear}` : (card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear}` : null),
        "Holder": card.cardholderName,
        "Source Token": card.sourceToken
      })}
    </article>
    ${binCheck ? `
      <article class="list-card bin-result">
        <strong>BIN/IIN Result</strong>
        <div>Status: <span class="status-pill ${statusClass(binCheck.status)}">${escapeHtml(binCheck.status || "-")}</span></div>
        ${renderKeyValueDetails(binDetails)}
        ${ipDetails ? `
          <strong class="result-subtitle">IP Check</strong>
          ${renderKeyValueDetails(ipDetails)}
        ` : ""}
      </article>
    ` : ""}
    <article class="list-card">
      <strong>Raw Provider Result</strong>
      <details class="raw-details">
        <summary>Raw response</summary>
        <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>
      </details>
    </article>
  `;
}

function syncManualPaymentMode() {
  syncCardPaymentPageMode();
  renderCardPaymentProviderList();
  if (!isCardPaymentProviderSelected()) {
    if (elements.manualPaymentResult) {
      elements.manualPaymentResult.innerHTML = "";
    }
    return;
  }

  const provider = getSelectedCardPaymentProvider();
  const method = getSelectedCardPaymentMethod();

  if (elements.cardPaymentSelectedTitle) {
    elements.cardPaymentSelectedTitle.textContent = provider?.label || "Card Payment";
  }
  renderCardPaymentProviderView(provider, method);
  renderCardPaymentOperationTabs(provider, method);
  renderCardPaymentDynamicFields(provider, method);
  renderCardPaymentReportSummary();
}

function loadExternalScript(id, src) {
  const existing = document.getElementById(id);
  if (existing) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

function renderCloverIframeStatus(config) {
  if (!elements.cloverIframeStatus) {
    return;
  }

  elements.cloverIframeStatus.innerHTML = `
    <article class="list-card">
      <strong>Clover Tokenize</strong>
      <div>Status: <span class="status-pill ${config.configured ? "status-good" : "status-bad"}">${config.configured ? "configured" : "missing config"}</span></div>
      <div>Merchant: ${escapeHtml(config.merchantId || "-")}</div>
      <div>SDK: ${escapeHtml(config.sdkUrl || "-")}</div>
      <div>Missing: ${escapeHtml((config.missing || []).join(", ") || "-")}</div>
    </article>
  `;
}

function renderCloverIframeResult(result) {
  const verification = result?.verification || {};
  const card = result?.card || {};
  const savedCard = result?.savedCard || {};
  const binCheck = result?.binCheck || {};
  const fraudChecks = verification.fraudChecks || {};
  const binDetails = binCheck.details || {};
  elements.cloverIframeResult.innerHTML = `
    <article class="list-card">
      <strong>Tokenize Verification</strong>
      <div>Status: <span class="status-pill ${statusClass(verification.status)}">${escapeHtml(verification.status || "-")}</span></div>
      <div>Mode: ${escapeHtml(verification.verificationMode || "-")}</div>
      <div>Submitted to Clover: ${verification.submittedToClover ? "yes" : "no"}</div>
      ${verification.cloverChargeId ? `<div>Charge: ${escapeHtml(verification.cloverChargeId)}</div>` : ""}
      ${verification.amount ? `<div>Amount: ${escapeHtml(verification.amount)} ${escapeHtml(verification.currency || "")}</div>` : ""}
      ${renderKeyValueDetails({
        "Card Id": result?.cardId,
        "Card": card.maskedPan,
        "Stored Card": savedCard.maskedPan,
        "BIN": savedCard.first6 || card.first6,
        "Last4": savedCard.last4 || card.last4,
        "Holder": card.cardholderName,
        "Source Token": card.sourceToken || verification.sourceToken,
        "CVC Check": fraudChecks.cvcCheck,
        "Address Check": fraudChecks.addressLine1Check,
        "ZIP Check": fraudChecks.addressZipCheck
      })}
      ${verification.message ? `<div>${escapeHtml(verification.message)}</div>` : ""}
      ${verification.error ? `<pre>${escapeHtml(JSON.stringify({ error: verification.error }, null, 2))}</pre>` : ""}
    </article>
    <article class="list-card bin-result">
      <strong>BIN/IIN Result</strong>
      <div>Status: <span class="status-pill ${statusClass(binCheck.status)}">${escapeHtml(binCheck.status || "-")}</span></div>
      ${renderKeyValueDetails(binDetails)}
    </article>
  `;
}

async function initializeCloverIframeCheckout() {
  if (!elements.cloverIframeCheckoutForm) {
    return null;
  }
  if (state.cloverIframe.loading) {
    return state.cloverIframe.loading;
  }
  if (state.cloverIframe.mounted) {
    return state.cloverIframe.config;
  }

  state.cloverIframe.loading = (async () => {
    const config = await api("/providers/clover/iframe-config");
    state.cloverIframe.config = config;
    renderCloverIframeStatus(config);

    if (!config.configured) {
      throw new Error(`Missing ${config.missing.join(", ")}`);
    }

    await loadExternalScript(CLOVER_IFRAME_SCRIPT_ID, config.sdkUrl);
    if (!window.Clover) {
      throw new Error("Clover iframe SDK did not initialize");
    }

    const clover = new window.Clover(config.apiAccessKey, {
      merchantId: config.merchantId,
      locale: config.locale || "en-US"
    });
    const iframeElements = clover.elements();
    const styles = {
      body: {
        fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace",
        fontSize: "14px"
      },
      input: {
        color: "#e7f4ed"
      }
    };

    const cardNumber = iframeElements.create("CARD_NUMBER", styles);
    const cardDate = iframeElements.create("CARD_DATE", styles);
    const cardCvv = iframeElements.create("CARD_CVV", styles);
    const cardPostalCode = iframeElements.create("CARD_POSTAL_CODE", styles);

    cardNumber.mount("#cloverIframeCardNumber");
    cardDate.mount("#cloverIframeCardDate");
    cardCvv.mount("#cloverIframeCardCvv");
    cardPostalCode.mount("#cloverIframeCardPostalCode");

    state.cloverIframe.clover = clover;
    state.cloverIframe.mounted = true;
    return config;
  })();

  try {
    return await state.cloverIframe.loading;
  } finally {
    state.cloverIframe.loading = null;
  }
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

async function loadUnchargebackCases() {
  const result = await api("/unchargeback/cases");
  state.unchargebackCases = result.data || [];
  renderUnchargebackCases();
}

async function loadProviderReports() {
  state.providerReports = await api("/provider-reports?limit=0");
  renderProviderReports();
}

async function loadPaymentProcessorLogs() {
  const query = getPaymentProcessorQueryString();
  state.paymentProcessorLogs = await api(`/payment-processors/logs${query ? `?${query}` : ""}`);
  state.paymentProcessorHealth = state.paymentProcessorLogs.health || state.paymentProcessorHealth;
  renderPaymentProcessorLogs();
  renderProcessorHealthDots();
}

async function loadPaymentProcessorHealth() {
  state.paymentProcessorHealth = await api("/payment-processors/health");
  renderProcessorHealthDots();
}

async function loadCloverLearningStatus() {
  const status = await api("/providers/clover/learning/status");
  renderGenericProviderResult(elements.cloverLearningStatus, "Machine Learning Scaffold", status);
}

async function loadBurpSuiteTraffic() {
  const result = await api("/security/burp-suite/traffic?limit=60");
  state.burpSuite.status = result.status;
  state.burpSuite.events = result.events || [];
  state.burpSuite.pending = result.pending || [];
  state.burpSuite.otpMessages = result.otpMessages || [];
  renderBurpSuite();
}

async function ensureProviderDataLoaded() {
  if (state.providerOperationCatalog && state.paymentProviders) {
    return;
  }
  if (!state.providerDataLoading) {
    state.providerDataLoading = loadProviderData().finally(() => {
      state.providerDataLoading = null;
    });
  }
  await state.providerDataLoading;
}

async function loadProviderData() {
  state.paymentProviders = await api("/config/providers");
  state.providerOperationCatalog = await api("/provider-operations/catalog");
  state.voiceProviders = await api("/provider-router/status");
  renderPaymentProviders();
  renderVoiceProviders();
  populateManualPaymentProviders({ preserve: true });
  populateManualPaymentOperations({ preserve: true });
  syncManualPaymentMode();
  syncPaymentProcessorOperationForm({ preserve: true });
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
  await loadUnchargebackCases();
  await loadProviderData();
  await loadProviderReports();
  await loadPaymentProcessorHealth().catch(() => {});
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

elements.providerReportsRefresh?.addEventListener("click", async () => {
  try {
    await loadProviderReports();
  } catch (error) {
    elements.providerReportsList.innerHTML = `<article class="list-card"><strong>Provider Report Error</strong><div>${escapeHtml(error.message)}</div></article>`;
  }
});

elements.paymentProcessorFilterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const processor = elements.paymentProcessorFilterForm?.elements?.processor?.value || "";
  if (processor && getPaymentProcessorRouteKey() !== processor) {
    window.location.hash = `#/payment-processors/${encodeURIComponent(processor)}`;
    return;
  }
  if (!processor && getPaymentProcessorRouteKey()) {
    window.location.hash = "#/payment-processors";
    return;
  }
  try {
    await loadPaymentProcessorLogs();
  } catch (error) {
    elements.paymentProcessorLogsList.innerHTML = `<article class="list-card"><strong>Processor Log Error</strong><div>${escapeHtml(error.message)}</div></article>`;
  }
});

elements.paymentProcessorFilterForm?.addEventListener("change", (event) => {
  if (event.target?.name === "processor") {
    const processor = event.target.value;
    window.location.hash = processor ? `#/payment-processors/${encodeURIComponent(processor)}` : "#/payment-processors";
  }
});

elements.paymentProcessorFilterForm?.addEventListener("input", (event) => {
  if (event.target?.matches("[data-money-format]")) {
    formatProcessorMoneyInput(event.target);
  }
});

elements.paymentProcessorLogsRefresh?.addEventListener("click", async () => {
  try {
    await loadPaymentProcessorLogs();
  } catch (error) {
    elements.paymentProcessorLogsList.innerHTML = `<article class="list-card"><strong>Processor Log Error</strong><div>${escapeHtml(error.message)}</div></article>`;
  }
});

elements.paymentProcessorLogsList?.addEventListener("click", (event) => {
  const jsonButton = event.target.closest("[data-json-modal]");
  if (jsonButton) {
    if (state.user?.role !== "admin" || state.paymentProcessorLogs?.canViewJsonModels !== true) {
      return;
    }
    const modelId = jsonButton.dataset.jsonModal;
    openJsonModal(jsonButton.dataset.jsonTitle || "JSON", state.paymentProcessorJsonModels[modelId] || {});
    return;
  }

  const actionButton = event.target.closest("[data-processor-action]");
  if (actionButton) {
    const log = state.paymentProcessorLogById[actionButton.dataset.processorLogId];
    if (!log || !canRunProcessorRowAction(log)) {
      return;
    }
    openProcessorActionModal(log, actionButton.dataset.processorAction);
  }
});

elements.paymentProcessorMenu?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-payment-processor-new-operation]");
  if (!button) {
    return;
  }
  event.preventDefault();
  openPaymentProcessorOperation(button.dataset.paymentProcessorProvider, button.dataset.paymentProcessorNewOperation);
});

elements.paymentProcessorOperationClose?.addEventListener("click", closePaymentProcessorOperation);

elements.paymentProcessorOperationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await submitPaymentProcessorOperationForm(elements.paymentProcessorOperationForm);
  } catch (error) {
    const payload = errorResponsePayload(error);
    if (payload?.provider || payload?.operationId) {
      renderProviderOperationResult(payload, elements.paymentProcessorOperationResult);
    } else {
      renderGenericProviderResult(elements.paymentProcessorOperationResult, "Processor Operation Error", payload);
    }
  }
});

elements.paymentProcessorOperationForm?.addEventListener("change", (event) => {
  if (event.target?.name === "provider") {
    populatePaymentProcessorOperationMethods({ preserve: false });
    renderPaymentProcessorOperationFields();
    return;
  }
  if (event.target?.name === "operation") {
    renderPaymentProcessorOperationFields();
    return;
  }
  if (event.target?.name === "cardId") {
    const card = state.cards.find((item) => item.id === event.target.value);
    if (card) {
      fillTransactionFormFromCard(elements.paymentProcessorOperationForm, card);
    }
  }
});

elements.paymentProcessorOperationForm?.addEventListener("input", (event) => {
  if (event.target?.matches("[data-money-format]")) {
    formatProcessorMoneyInput(event.target);
  }
});

elements.cardPaymentReportsRefresh?.addEventListener("click", async () => {
  try {
    await loadProviderReports();
  } catch (error) {
    if (elements.cardPaymentReportList) {
      elements.cardPaymentReportList.innerHTML = `<article class="list-card"><strong>Provider Report Error</strong><div>${escapeHtml(error.message)}</div></article>`;
    }
  }
});

elements.burpRefreshButton?.addEventListener("click", async () => {
  try {
    await loadBurpSuiteTraffic();
  } catch (error) {
    renderGenericProviderResult(elements.burpStatus, "Burp Refresh Error", { error: error.message });
  }
});

elements.burpStartForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = removeEmptyFields(formToObject(elements.burpStartForm));
  payload.proxyEnabled = elements.burpStartForm.elements.proxyEnabled.checked;
  payload.allowInsecureTls = elements.burpStartForm.elements.allowInsecureTls.checked;
  payload.holdSeconds = Number(payload.holdSeconds || 60);

  try {
    state.burpSuite.status = await api("/security/burp-suite/start", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await loadBurpSuiteTraffic();
  } catch (error) {
    renderGenericProviderResult(elements.burpStatus, "Burp Start Error", { error: error.message });
  }
});

elements.burpStopButton?.addEventListener("click", async () => {
  try {
    state.burpSuite.status = await api("/security/burp-suite/stop", { method: "POST" });
    await loadBurpSuiteTraffic();
  } catch (error) {
    renderGenericProviderResult(elements.burpStatus, "Burp Stop Error", { error: error.message });
  }
});

elements.burpArmOtpForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = removeEmptyFields(formToObject(elements.burpArmOtpForm));
  payload.holdSeconds = Number(payload.holdSeconds || 60);

  try {
    state.burpSuite.status = await api("/security/burp-suite/otp/arm", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await loadBurpSuiteTraffic();
  } catch (error) {
    renderGenericProviderResult(elements.burpStatus, "OTP Capture Error", { error: error.message });
  }
});

elements.burpOtpSendForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = removeEmptyFields(formToObject(elements.burpOtpSendForm));
  payload.codeLength = Number(payload.codeLength || 6);
  payload.armCapture = elements.burpOtpSendForm.elements.armCapture.checked;
  payload.pathKeyword = "otp";

  try {
    const result = await api("/security/burp-suite/otp/send", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.burpOtpSendResult, "OTP Send", result);
    await loadBurpSuiteTraffic();
  } catch (error) {
    renderGenericProviderResult(elements.burpOtpSendResult, "OTP Send Error", { error: error.message });
  }
});

elements.burpPendingList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-burp-pending-id]");
  if (!button) {
    return;
  }
  selectBurpPending(button.dataset.burpPendingId);
});

elements.burpReleaseForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.burpReleaseForm);
  const pendingId = payload.pendingId;
  let headers;
  let body;

  try {
    headers = payload.headers ? JSON.parse(payload.headers) : {};
    body = payload.body ? JSON.parse(payload.body) : {};
  } catch (error) {
    renderGenericProviderResult(elements.burpStatus, "Response JSON Error", { error: error.message });
    return;
  }

  try {
    await api(`/security/burp-suite/pending/${encodeURIComponent(pendingId)}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        status: Number(payload.status || 200),
        headers,
        body
      })
    });
    elements.burpReleaseForm.hidden = true;
    state.burpSuite.selectedPendingId = null;
    await loadBurpSuiteTraffic();
  } catch (error) {
    renderGenericProviderResult(elements.burpStatus, "Response Release Error", { error: error.message });
  }
});

elements.unchargebackForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = removeEmptyFields(formToObject(elements.unchargebackForm));
  payload.contentPrice = Number(payload.contentPrice);

  try {
    const created = await api("/unchargeback/cases", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    elements.unchargebackForm.reset();
    renderGenericProviderResult(elements.unchargebackResult, "Unchargeback Case Created", created);
    await loadUnchargebackCases();
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.unchargebackResult, "Unchargeback Error", { error: error.message });
  }
});

elements.unchargebackList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-unchargeback-action]");
  if (!button) {
    return;
  }

  const kind = button.dataset.unchargebackAction;
  const caseId = button.dataset.caseId;
  const label = kind === "widget" ? "Tip Widget" : "Content";
  const embedHtml = window.prompt(`${label} iframe embed HTML`);
  if (!embedHtml) {
    return;
  }

  try {
    const updated = await api(`/unchargeback/cases/${caseId}/${kind}`, {
      method: "POST",
      body: JSON.stringify({ embedHtml })
    });
    renderGenericProviderResult(elements.unchargebackResult, `${label} Saved`, {
      id: updated.id,
      src: updated[`${kind}_src`]
    });
    await loadUnchargebackCases();
    await loadAuditLogs();
  } catch (error) {
    window.alert(error.message);
    renderGenericProviderResult(elements.unchargebackResult, `${label} Error`, { error: error.message });
  }
});

elements.checkerTabs.forEach((tab) => {
  tab.addEventListener("click", () => showCheckerTab(tab.dataset.checkerTab));
});

document.addEventListener("change", (event) => {
  const select = event.target.closest("[data-card-select]");
  if (select) {
    syncCardSelect(select);
  }
});

document.addEventListener("submit", (event) => {
  rememberActionButton(event.submitter);
}, true);

document.addEventListener("click", (event) => {
  const openDropdowns = document.querySelectorAll(".nav-dropdown[open]");
  const activeDropdown = event.target.closest(".nav-dropdown");
  openDropdowns.forEach((dropdown) => {
    const clickedDropdownLink = dropdown.contains(event.target) && event.target.closest(".nav-dropdown-menu a");
    if (!activeDropdown || clickedDropdownLink) {
      dropdown.open = false;
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  document.querySelectorAll(".nav-dropdown[open]").forEach((dropdown) => {
    dropdown.open = false;
  });
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.type === "submit") {
    return;
  }
  if (button.matches("[data-card-payment-operation], [data-checker-tab]")) {
    return;
  }
  rememberActionButton(button);
  window.setTimeout(() => {
    if (state.pendingRequests === 0) {
      setButtonLoading(button, false);
    }
  }, 1200);
}, true);

elements.modalClose?.addEventListener("click", closeModal);
elements.modalOverlay?.addEventListener("click", (event) => {
  if (event.target === elements.modalOverlay) {
    closeModal();
  }
});
elements.modalBody?.addEventListener("click", (event) => {
  if (event.target.closest("[data-modal-close]")) {
    closeModal();
  }
});
elements.modalBody?.addEventListener("input", (event) => {
  if (event.target?.matches("[data-money-format]")) {
    formatProcessorMoneyInput(event.target);
  }
});
elements.modalBody?.addEventListener("submit", async (event) => {
  if (event.target?.id !== "processorActionForm") {
    return;
  }
  event.preventDefault();
  try {
    await submitProcessorAction(event.target);
  } catch (error) {
    const payload = errorResponsePayload(error);
    openJsonModal("Processor Action Error", payload);
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-address-toggle]");
  if (!button) {
    return;
  }
  const block = button.closest(".shared-address-block");
  const fields = block?.querySelector("[data-address-fields]");
  if (!fields) {
    return;
  }
  fields.hidden = !fields.hidden;
  button.textContent = fields.hidden ? "Adres Bilgisi Ekle" : "Adres Bilgisi Kapat";
});
document.addEventListener("input", (event) => {
  if (event.target?.matches("[data-money-format]")) {
    formatProcessorMoneyInput(event.target);
  }
  if (event.target?.matches("[data-card-number]")) {
    event.target.value = String(event.target.value || "").replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
  }
  if (event.target?.matches("[data-bin-input]")) {
    event.target.value = String(event.target.value || "").replace(/\D/g, "").slice(0, 6);
  }
});

elements.cardForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = removeEmptyFields(formToObject(elements.cardForm));
  const pan = String(payload.pan || "").replace(/\D/g, "");
  payload.pan = pan;

  if (pan.length < 12) {
    alert("Card number is required");
    return;
  }

  payload.provider = "globalpayments";
  payload.first6 = pan.slice(0, 6);
  payload.last4 = pan.slice(-4);
  payload.maskedPan = `${payload.first6}******${payload.last4}`;
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

elements.paypalNvpTestButton?.addEventListener("click", async () => {
  try {
    const result = await api("/providers/paypal/nvp/test", { method: "POST" });
    renderGenericProviderResult(elements.paypalManagerStatusResult, "PayPal NVP Account", result);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalManagerStatusResult, "PayPal NVP Error", { error: error.message });
  }
});

elements.ipLookupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = removeEmptyFields(formToObject(elements.ipLookupForm));

  try {
    const result = await api("/providers/paypal/manager/cards/bin-check", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderBinCheckResult(result, elements.ipLookupResult);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.ipLookupResult, "IP Lookup Error", { error: error.message });
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
  const payload = applySelectedCardPayload(
    elements.paypalBinCheckForm,
    removeEmptyFields(formToObject(elements.paypalBinCheckForm)),
    { includeBilling: false }
  );
  if (!payload.bin && payload.first6) {
    payload.bin = payload.first6;
  }

  try {
    const result = await api("/providers/paypal/manager/cards/bin-check", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderBinCheckResult(result);
    if (payload.cardId) {
      await refreshCardChecks(payload.cardId);
    }
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalBinCheckResult, "RapidAPI BIN Check Error", { error: error.message });
  }
});

elements.balanceCheckForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = applySelectedCardPayload(
    elements.balanceCheckForm,
    removeEmptyFields(formToObject(elements.balanceCheckForm)),
    { includeBilling: false }
  );
  payload.amount = payload.amount ? Number(String(payload.amount).replace(/,/g, "")) : undefined;
  payload.balanceAmount = payload.balanceAmount ? Number(String(payload.balanceAmount).replace(/,/g, "")) : undefined;

  try {
    const result = await api("/checkers/balance", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.balanceCheckResult, "Balance Check", result);
    if (payload.cardId) {
      await refreshCardChecks(payload.cardId);
    }
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.balanceCheckResult, "Balance Check Error", { error: error.message });
  }
});

elements.cloverVerifyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = applySelectedCardPayload(
    elements.cloverVerifyForm,
    removeEmptyFields(formToObject(elements.cloverVerifyForm)),
    { includeBilling: false }
  );
  if (!payload.bin && payload.first6) {
    payload.bin = payload.first6;
  }
  payload.amount = Number(payload.amount || 1);

  try {
    const result = await api("/providers/clover/cards/verify-with-bin", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderCloverVerifyResult(result);
    await loadCards();
    if (payload.cardId) {
      await refreshCardChecks(payload.cardId);
    }
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.cloverVerifyResult, "Clover Verify + BIN Error", { error: error.message });
  }
});

elements.providerOperationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = applySelectedCardPayload(
    elements.providerOperationForm,
    removeEmptyFields(formToObject(elements.providerOperationForm))
  );
  if (payload.amount) {
    payload.amount = Number(payload.amount);
  }
  if (!payload.bin && payload.first6) {
    payload.bin = payload.first6;
  }
  if (payload.token && !payload.providerPaymentToken) {
    payload.providerPaymentToken = payload.token;
  }

  try {
    const result = await api("/provider-operations/cards", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderProviderOperationResult(result);
    await loadCards();
    if (result.cardId) {
      await refreshCardChecks(result.cardId);
    }
    await loadAuditLogs();
    await loadProviderReports();
  } catch (error) {
    const payload = errorResponsePayload(error);
    if (payload?.provider || payload?.operationId) {
      renderProviderOperationResult(payload, elements.providerOperationResult);
    } else {
      renderGenericProviderResult(elements.providerOperationResult, "Provider Operation Error", payload);
    }
  }
});

elements.manualPaymentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = applySelectedCardPayload(
    elements.manualPaymentForm,
    removeEmptyFields(formToObject(elements.manualPaymentForm))
  );
  const selectedMethod = getSelectedCardPaymentMethod();
  const selectedMethodKey = payload.operation;
  const isPropelr = payload.provider === "propelr" || payload.provider === "propelrpay";
  const isPropelrSequence = isPropelr && selectedMethodKey === "amount_sequence";
  const isTransactionDetail = isPropelr && selectedMethodKey === "transaction_detail";
  if (selectedMethod?.operation) {
    payload.operation = selectedMethod.operation;
  }
  if (payload.amount && !isPropelr) {
    payload.amount = Number(String(payload.amount).replace(/,/g, ""));
  }
  if (payload.balanceAmount) {
    payload.balanceAmount = Number(payload.balanceAmount);
  }
  if (!payload.bin && payload.pan) {
    payload.bin = String(payload.pan).replace(/\D/g, "").slice(0, 6);
  }
  if (!payload.reference && !isPropelr) {
    payload.reference = `manual-${payload.provider}-${Date.now()}`;
  }
  if (isPropelr) {
    payload.account = payload.account || String(payload.pan || "").replace(/\D/g, "");
    if (!payload.expiry && payload.expMonth && payload.expYear) {
      payload.expiry = `${String(payload.expMonth).padStart(2, "0")}${String(payload.expYear).slice(-2)}`;
    }
    payload.expiry = String(payload.expiry || "").replace(/\D/g, "");
    if (isPropelrSequence) {
      payload.amounts = [payload.sequenceAmount1 || "1,100.12", payload.sequenceAmount2 || "1,100.25"];
      delete payload.amount;
    }
    delete payload.cvv2;
    delete payload.expMonth;
    delete payload.expYear;
    delete payload.cardholderName;
    delete payload.billingZip;
    delete payload.billingCountry;
    delete payload.balanceAmount;
    delete payload.currency;
    delete payload.reference;
    delete payload.sequenceAmount1;
    delete payload.sequenceAmount2;
  }

  try {
    let result;
    if (isPropelrSequence) {
      result = await api("/providers/propelr/amount-sequence", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      renderGenericProviderResult(elements.manualPaymentResult, "Propelr 2 Request", result);
      return;
    } else if (isTransactionDetail) {
      result = await api(`/providers/propelr/transactions/${encodeURIComponent(payload.transactionId)}`);
      renderGenericProviderResult(elements.manualPaymentResult, "Propelr Transaction Detail", result);
      return;
    } else if (payload.operation === "bin_check") {
      result = await api("/providers/paypal/manager/cards/bin-check", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      renderBinCheckResult(result, elements.manualPaymentResult);
    } else if (payload.operation === "balance_check") {
      result = await api("/checkers/balance", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      renderGenericProviderResult(elements.manualPaymentResult, "Balance Check", result);
    } else {
      result = await api("/provider-operations/cards", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      renderProviderOperationResult(result, elements.manualPaymentResult);
    }
    await loadCards();
    if (result.cardId) {
      await refreshCardChecks(result.cardId);
    }
    await loadAuditLogs();
  } catch (error) {
    const payload = errorResponsePayload(error);
    if (payload?.provider || payload?.operationId) {
      renderProviderOperationResult(payload, elements.manualPaymentResult);
    } else {
      renderGenericProviderResult(elements.manualPaymentResult, "Provider Error", payload);
    }
  }
});

elements.manualPaymentForm?.elements?.operation?.addEventListener("change", syncManualPaymentMode);
elements.manualPaymentForm?.elements?.provider?.addEventListener("change", () => {
  const providerKey = elements.manualPaymentForm?.elements?.provider?.value;
  if (providerKey) {
    window.location.hash = getCardPaymentProviderHref(providerKey);
  }
  populateManualPaymentOperations({ preserve: false });
  syncManualPaymentMode();
});
elements.cardPaymentOperationTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-card-payment-operation]");
  if (!button || !elements.manualPaymentForm?.elements?.operation) {
    return;
  }
  elements.manualPaymentForm.elements.operation.value = button.dataset.cardPaymentOperation;
  syncManualPaymentMode();
});
elements.manualPaymentForm?.addEventListener("input", (event) => {
  if (event.target?.name === "cardId") {
    syncManualPaymentCardSearch();
  }
});
elements.manualPaymentForm?.addEventListener("change", (event) => {
  if (event.target?.name === "cardId") {
    syncManualPaymentCardSearch();
  }
});
populateManualPaymentProviders({ preserve: true });
populateManualPaymentOperations({ preserve: true });
mountSharedCardComponents();
syncManualPaymentMode();
syncPaymentProcessorOperationForm({ preserve: true });
renderManualPaymentSummary(null);

elements.cloverIframeInitButton?.addEventListener("click", async () => {
  try {
    await initializeCloverIframeCheckout();
  } catch (error) {
    renderGenericProviderResult(elements.cloverIframeStatus, "Clover Tokenize Error", { error: error.message });
  }
});

elements.cloverIframeCheckoutForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await initializeCloverIframeCheckout();
    const payload = removeEmptyFields(formToObject(elements.cloverIframeCheckoutForm));
    payload.amount = Number(payload.amount || 1);
    const tokenResult = await state.cloverIframe.clover.createToken();
    const source = tokenResult?.token;
    if (!source) {
      throw new Error(JSON.stringify(tokenResult?.errors || tokenResult || "Clover tokenization failed"));
    }

    const result = await api("/providers/clover/cards/iframe-verify", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        source,
        cardDetails: tokenResult?.card || tokenResult?.cardData || tokenResult?.paymentMethod || null
      })
    });
    renderCloverIframeResult(result);
    await loadCards();
    await loadAuditLogs();
    await loadProviderReports();
  } catch (error) {
    renderGenericProviderResult(elements.cloverIframeResult, "Clover Tokenize Verification Error", { error: error.message });
  }
});

elements.cloverLearningRefreshButton?.addEventListener("click", async () => {
  try {
    await loadCloverLearningStatus();
  } catch (error) {
    renderGenericProviderResult(elements.cloverLearningStatus, "Machine Learning Error", { error: error.message });
  }
});

elements.cloverLearningForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = removeEmptyFields(formToObject(elements.cloverLearningForm));
    if (payload.quantity) {
      payload.quantity = Number(payload.quantity);
    }
    if (payload.maxAttempts) {
      payload.maxAttempts = Number(payload.maxAttempts);
    }
    const result = await api("/providers/clover/learning/runs", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    console.log("[clover-machine-learning:response]", result);
    renderCloverLearningRun(result);
  } catch (error) {
    renderGenericProviderResult(elements.cloverLearningResult, "Machine Learning Run", { error: error.message });
  }
});

elements.paypalLiveCheckForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = applySelectedCardPayload(
    elements.paypalLiveCheckForm,
    removeEmptyFields(formToObject(elements.paypalLiveCheckForm))
  );
  payload.amount = Number(String(payload.amount || 0).replace(/,/g, ""));
  if (!payload.bin && payload.first6) {
    payload.bin = payload.first6;
  }

  try {
    const [liveResult, binResult] = await Promise.allSettled([
      api("/providers/paypal/manager/cards/live-check", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
      api("/providers/paypal/manager/cards/bin-check", {
        method: "POST",
        body: JSON.stringify(payload)
      })
    ]);
    const live = liveResult.status === "fulfilled" ? liveResult.value : errorResponsePayload(liveResult.reason);
    const binCheck = binResult.status === "fulfilled" ? binResult.value : errorResponsePayload(binResult.reason);
    renderLiveAndBinCheckResult({ live, binCheck });
    if (payload.cardId) {
      await refreshCardChecks(payload.cardId);
    }
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalLiveCheckResult, "PayPal Live Check Error", { error: error.message });
  }
});

elements.paypalSaleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = applySelectedCardPayload(
    elements.paypalSaleForm,
    removeEmptyFields(formToObject(elements.paypalSaleForm))
  );
  payload.amount = Number(payload.amount);

  try {
    const result = await api("/providers/paypal/direct-payment/cards/sale", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paypalSaleResult, "PayPal Sale", result);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalSaleResult, "PayPal Sale Error", { error: error.message });
  }
});

elements.paypalAuthForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = applySelectedCardPayload(
    elements.paypalAuthForm,
    removeEmptyFields(formToObject(elements.paypalAuthForm))
  );
  payload.amount = Number(payload.amount);
  payload.paymentAction = "Authorization";

  try {
    const result = await api("/providers/paypal/manager/cards/auth", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderGenericProviderResult(elements.paypalAuthResult, "PayPal Authorization", result);
    await loadCards();
    if (payload.cardId) {
      await refreshCardChecks(payload.cardId);
    }
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

  if (isManualCardValue(payload.cardId)) {
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

elements.paypalVoidForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(elements.paypalVoidForm);

  if (isManualCardValue(payload.cardId)) {
    delete payload.cardId;
  }
  if (!payload.authorizationPnref) {
    delete payload.authorizationPnref;
  }

  try {
    const result = await api("/providers/paypal/direct-payment/cards/void", {
      method: "POST",
      body: JSON.stringify(removeEmptyFields(payload))
    });
    renderGenericProviderResult(elements.paypalVoidResult, "PayPal Void", result);
    await loadAuditLogs();
  } catch (error) {
    renderGenericProviderResult(elements.paypalVoidResult, "PayPal Void Error", { error: error.message });
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
  if (elements.manualPaymentForm?.elements?.cardId) {
    elements.manualPaymentForm.elements.cardId.value = cardId;
    syncManualPaymentCardSearch();
  }
  if (elements.paypalBinCheckForm?.elements?.cardId) {
    elements.paypalBinCheckForm.elements.cardId.value = cardId;
  }
  if (elements.paypalLiveCheckForm?.elements?.cardId) {
    elements.paypalLiveCheckForm.elements.cardId.value = cardId;
  }
  if (elements.balanceCheckForm?.elements?.cardId) {
    elements.balanceCheckForm.elements.cardId.value = cardId;
  }
  if (elements.paypalSaleForm?.elements?.cardId) {
    elements.paypalSaleForm.elements.cardId.value = cardId;
  }
  if (elements.paypalAuthForm?.elements?.cardId) {
    elements.paypalAuthForm.elements.cardId.value = cardId;
  }
  if (elements.paypalCaptureForm?.elements?.cardId) {
    elements.paypalCaptureForm.elements.cardId.value = cardId;
  }
  if (elements.paypalVoidForm?.elements?.cardId) {
    elements.paypalVoidForm.elements.cardId.value = cardId;
  }
  if (elements.unchargebackForm?.elements?.cardId) {
    elements.unchargebackForm.elements.cardId.value = cardId;
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

setInterval(() => {
  if (state.user && getCurrentRoute() === "burp-suite") {
    loadBurpSuiteTraffic().catch(() => {});
  }
}, 1000);

(async function init() {
  localStorage.removeItem("clover_panel_token");

  try {
    await bootAuthenticatedApp();
  } catch (_error) {
    logout();
  }
})();
