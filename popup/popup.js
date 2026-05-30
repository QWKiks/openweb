import { init as initI18n, t as _t, getEffectiveLocale, AVAILABLE_LOCALES, LOCALE_NAMES, getLanguage, setLanguage } from "../lib/i18n.js";

const $ = (id) => document.getElementById(id);

const connectedView   = $("connected-view");
const disconnectedView = $("disconnected-view");
const devSettings     = $("dev-settings");
const trustDialog     = $("trust-dialog");
const statusBadge     = $("status-badge");
const statusLabel     = $("status-label");

let devMode = false;
let clickCount = 0;
const CLICKS_TO_ENABLE = 7;
let listenersAttached = false;
let currentTheme = "auto";

let t = (key, subs) => {
  let s = chrome.i18n.getMessage(key);
  if (subs) subs.forEach((v, i) => s = s.replace(`$${i + 1}$`, v));
  return s || key;
};

const THEME_KEY = "OpenWeb_theme";

function applyTheme(theme) {
  currentTheme = theme;
  const effective = theme === "auto"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  document.documentElement.setAttribute("data-theme", effective);
}

async function loadTheme() {
  try {
    const result = await chrome.storage.local.get(THEME_KEY);
    applyTheme(result[THEME_KEY] || "auto");
  } catch {
    applyTheme("auto");
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentTheme === "auto") applyTheme("auto");
  });
}

async function setTheme(theme) {
  currentTheme = theme;
  await chrome.storage.local.set({ [THEME_KEY]: theme });
  applyTheme(theme);
}

function initUI() {
  $("version").textContent = `v${chrome.runtime.getManifest().version}`;
  $("status-label").textContent = t("notReadyMessage");
  $("guide-text").textContent = t("guideText");
  $("open-dev-btn").textContent = t("openDevSettings");

  $("dev-advanced-label").textContent = t("devAdvancedSettings");
  $("dev-exit-btn").textContent = t("devExit");
  $("dev-url-label").textContent = t("devServerUrlLabel");
  $("dev-test-btn").textContent = t("devTest");
  $("dev-save-btn").textContent = t("devSave");
  $("dev-reset-btn").textContent = t("devReset");
  $("trust-title").textContent = t("devTrustWarningTitle");
  $("trust-body").textContent = t("devTrustWarningBody");
  $("trust-cancel").textContent = t("devTrustCancel");
  $("trust-confirm").textContent = t("devTrustConfirm");

  $("mcp-label").textContent = t("mcpLabel");
  $("mcp-hint").textContent = t("mcpHint");
  $("stat-actions-label").textContent = t("statActionsLabel");
  $("stat-uptime-label").textContent = t("statUptimeLabel");
  updateMcpConfig();

  $("language-label").textContent = t("languageLabel");
  $("rate-limit-label").textContent = t("rateLimitLabel");
  $("theme-label").textContent = t("themeLabel");
  $("theme-option-auto").textContent = t("themeAuto");
  $("theme-option-light").textContent = t("themeLight");
  $("theme-option-dark").textContent = t("themeDark");
  $("theme-select").value = currentTheme;

  populateLanguageSelector();

  if (!listenersAttached) {
    listenersAttached = true;
    attachEventListeners();
  }
}

function populateLanguageSelector() {
  const select = $("language-select");
  if (select.options.length > 0) return;

  const autoOption = document.createElement("option");
  autoOption.value = "";
  autoOption.textContent = t("languageAuto");
  select.appendChild(autoOption);

  for (const locale of AVAILABLE_LOCALES) {
    const option = document.createElement("option");
    option.value = locale;
    option.textContent = LOCALE_NAMES[locale] || locale;
    select.appendChild(option);
  }

  select.addEventListener("change", async () => {
    const value = select.value || null;
    await setLanguage(value);
    await initI18n();
    t = _t;
    initUI();
  });

  getLanguage().then(locale => { select.value = locale || ""; });
}

async function updateStatus(status) {
  if (status.connected) {
    connectedView.classList.remove("hidden");
    disconnectedView.classList.add("hidden");
    statusBadge.className = "status connected";
    statusLabel.textContent = t("readyMessage");
    $("server-url").textContent = status.serverUrl || "";

    const m = status.metrics || {};
    $("action-count").textContent = m.toolCallCount || 0;
    $("uptime").textContent = formatUptime(m.uptime || 0);

    const errorBanner = $("error-banner");
    if (m.lastError && Date.now() - m.lastError.time < 30000) {
      $("error-banner-text").textContent = m.lastError.message;
      errorBanner.classList.remove("hidden");
    } else {
      errorBanner.classList.add("hidden");
    }
  } else {
    connectedView.classList.add("hidden");
    disconnectedView.classList.remove("hidden");
    statusBadge.className = "status disconnected";
    statusLabel.textContent = t("notReadyMessage");
  }
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

const COPY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

function enableDevMode() {
  devMode = true;
  devSettings.classList.remove("hidden");
  $("dev-click-hint").textContent = "";
  clickCount = 0;
}

function attachEventListeners() {
  $("copy-url-btn").addEventListener("click", async () => {
    const text = $("default-url").textContent;
    await navigator.clipboard.writeText(text);
    const btn = $("copy-url-btn");
    btn.innerHTML = CHECK_SVG;
    btn.classList.add("copied");
    setTimeout(() => {
      btn.innerHTML = COPY_SVG;
      btn.classList.remove("copied");
    }, 1500);
  });

  $("open-dev-btn").addEventListener("click", () => {
    enableDevMode();
  });

  $("dev-mode-trigger").addEventListener("click", () => {
    if (devMode) return;
    clickCount++;
    const remaining = CLICKS_TO_ENABLE - clickCount;
    if (remaining > 0) {
      $("dev-click-hint").textContent = t("devClickHint", [String(remaining)]);
    } else {
      enableDevMode();
    }
  });

  $("dev-exit-btn").addEventListener("click", () => {
    devMode = false;
    devSettings.classList.add("hidden");
    trustDialog.classList.add("hidden");
    clickCount = 0;
  });

  $("dev-test-btn").addEventListener("click", async () => {
    const url = $("dev-server-url").value.trim();
    if (!url) return showDevStatus(t("devUrlEmpty"), "error");
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      return showDevStatus(t("devUrlWrongProtocol"), "error");
    }

    $("dev-test-btn").textContent = t("devTesting");
    $("dev-test-btn").disabled = true;

    const result = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION", url });

    $("dev-test-btn").textContent = t("devTest");
    $("dev-test-btn").disabled = false;

    if (result.ok) {
      showDevStatus(t("devTestOk"), "success");
    } else {
      showDevStatus(t("devTestFailed"), "error");
    }
  });

  $("dev-save-btn").addEventListener("click", async () => {
    const url = $("dev-server-url").value.trim();
    if (!url) return showDevStatus(t("devUrlEmpty"), "error");
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      return showDevStatus(t("devUrlWrongProtocol"), "error");
    }

    trustDialog.classList.remove("hidden");
    if (url.startsWith("ws://")) {
      $("trust-insecure").classList.remove("hidden");
      $("trust-insecure").textContent = t("devTrustWarningInsecure");
    } else {
      $("trust-insecure").classList.add("hidden");
    }
  });

  $("trust-cancel").addEventListener("click", () => {
    trustDialog.classList.add("hidden");
  });

  $("trust-confirm").addEventListener("click", async () => {
    const url = $("dev-server-url").value.trim();
    trustDialog.classList.add("hidden");

    await chrome.runtime.sendMessage({ type: "CONNECT", url });
    showDevStatus(t("devSaved"), "success");
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "GET_STATUS" }).then(s => s && updateStatus(s)).catch(() => {});
    }, 500);
  });

  $("dev-reset-btn").addEventListener("click", () => {
    $("dev-server-url").value = "ws://127.0.0.1:10086/ws";
    showDevStatus("", "");
  });

  $("copy-mcp-btn").addEventListener("click", async () => {
    const text = $("mcp-config").textContent;
    await navigator.clipboard.writeText(text);
    const btn = $("copy-mcp-btn");
    btn.innerHTML = CHECK_SVG;
    btn.classList.add("copied");
    setTimeout(() => {
      btn.innerHTML = COPY_SVG;
      btn.classList.remove("copied");
    }, 1500);
  });

  $("mcp-toggle").addEventListener("click", () => {
    const body = $("mcp-body");
    const chevron = $("mcp-chevron");
    body.classList.toggle("collapsed");
    chevron.classList.toggle("collapsed");
  });

  $("rate-limit-input").addEventListener("change", async () => {
    const val = parseInt($("rate-limit-input").value, 10);
    const perSec = isNaN(val) || val < 0 ? 0 : val;
    $("rate-limit-input").value = perSec;
    await chrome.runtime.sendMessage({ type: "SET_RATE_LIMIT", perSec });
  });

  $("theme-select").addEventListener("change", async () => {
    await setTheme($("theme-select").value);
  });

  $("error-banner-close").addEventListener("click", () => {
    $("error-banner").classList.add("hidden");
  });
}

function showDevStatus(text, type) {
  const el = $("dev-status-msg");
  if (!text) {
    el.classList.add("hidden");
    return;
  }
  el.textContent = text;
  el.className = `dev-status ${type}`;
  el.classList.remove("hidden");
  if (type === "success") {
    setTimeout(() => el.classList.add("hidden"), 3000);
  }
}

function updateMcpConfig() {
  const mcpPath = "mcp-server.js";
  const config = {
    mcpServers: {
      openweb: {
        command: "node",
        args: [mcpPath],
      },
    },
  };
  $("mcp-config").textContent = JSON.stringify(config, null, 2);
  $("mcp-status-badge").textContent = "";
  $("mcp-status-badge").classList.remove("off");
}

let metricsInterval = null;

async function boot() {
  await loadTheme();
  initUI();
  

  await initI18n();
  t = _t;
  initUI();
  

  chrome.runtime.sendMessage({ type: "GET_STATUS" }).then(status => {
    if (!status) return;
    $("rate-limit-input").value = status.metrics?.rateLimitPerSec ?? 0;
    updateStatus(status);
  });
  

  metricsInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }).then(s => s && updateStatus(s)).catch(() => {});
  }, 5000);
}

boot();

window.addEventListener("beforeunload", () => {
  if (metricsInterval) clearInterval(metricsInterval);
});
