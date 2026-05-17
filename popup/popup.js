/**
 * WebBridge Open — Popup Script
 * Uses async i18n module for runtime language switching.
 */

// ── i18n (async) ────────────────────────────────────────────────────────────
let _msg = (key) => chrome.i18n.getMessage(key); // sync fallback before init

async function initI18n() {
  const i18n = await import("../lib/i18n.js");
  await i18n.init();
  _msg = i18n.getMessage; // Replace with async version
  return i18n;
}

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

// ── Init ────────────────────────────────────────────────────────────────────
async function initUI() {
  const i18n = await initI18n();

  $("version").textContent = `v${chrome.runtime.getManifest().version}`;
  $("status-label").textContent = await _msg("notReadyMessage");
  $("guide-text").textContent = await _msg("guideText");
  $("open-dev-btn").textContent = await _msg("openDevSettings");

  $("dev-advanced-label").textContent = await _msg("devAdvancedSettings");
  $("dev-exit-btn").textContent = await _msg("devExit");
  $("dev-url-label").textContent = await _msg("devServerUrlLabel");
  $("dev-test-btn").textContent = await _msg("devTest");
  $("dev-save-btn").textContent = await _msg("devSave");
  $("dev-reset-btn").textContent = await _msg("devReset");
  $("trust-title").textContent = await _msg("devTrustWarningTitle");
  $("trust-body").textContent = await _msg("devTrustWarningBody");
  $("trust-cancel").textContent = await _msg("devTrustCancel");
  $("trust-confirm").textContent = await _msg("devTrustConfirm");

  // MCP section
  $("mcp-label").textContent = await _msg("mcpLabel");
  $("mcp-hint").textContent = await _msg("mcpHint");
  $("stat-tools-label").textContent = await _msg("statToolsLabel");
  $("stat-actions-label").textContent = await _msg("statActionsLabel");
  $("stat-uptime-label").textContent = await _msg("statUptimeLabel");
  $("log-label").textContent = await _msg("logLabel");
  await updateMcpConfig();

  // Language selector
  await initLanguageSelector(i18n);

  // Attach event listeners only once
  if (!listenersAttached) {
    listenersAttached = true;
    attachEventListeners();
  }
}

async function initLanguageSelector(i18n) {
  const select = $("language-select");
  $("language-label").textContent = await _msg("languageLabel");

  // Only populate options once
  if (select.options.length === 0) {
    const autoText = await _msg("languageAuto");
    const autoOption = document.createElement("option");
    autoOption.value = "";
    autoOption.textContent = autoText;
    select.appendChild(autoOption);

    for (const locale of i18n.AVAILABLE_LOCALES) {
      const option = document.createElement("option");
      option.value = locale;
      option.textContent = i18n.LOCALE_NAMES[locale] || locale;
      select.appendChild(option);
    }

    // Handle change — only attached once
    select.addEventListener("change", async () => {
      const value = select.value || null;
      await i18n.setLanguage(value);
      // Re-apply all labels with new language
      await initUI();
    });
  }

  // Update current value (may have changed)
  const current = await i18n.getLanguage();
  select.value = current || "";
}

// ── Status ───────────────────────────────────────────────────────────────────
async function updateStatus(status) {
  if (status.connected) {
    connectedView.classList.remove("hidden");
    disconnectedView.classList.add("hidden");
    statusBadge.className = "status connected";
    statusLabel.textContent = await _msg("readyMessage");
    $("server-url").textContent = status.serverUrl || "";

    // Update metrics
    const m = status.metrics || {};
    $("tool-count").textContent = m.toolCount || 0;
    $("action-count").textContent = m.toolCallCount || 0;
    $("uptime").textContent = formatUptime(m.uptime || 0);

    // Update action log
    const logEntries = m.actionLog || [];
    const logEl = $("log-entries");
    logEl.innerHTML = "";
    for (const entry of logEntries.slice(0, 8)) {
      const div = document.createElement("div");
      div.className = "log-entry";
      div.innerHTML = `<span class="log-entry-name${entry.error ? " log-entry-error" : ""}">${entry.name}</span><span class="log-entry-time">${entry.time}</span>`;
      logEl.appendChild(div);
    }
  } else {
    connectedView.classList.add("hidden");
    disconnectedView.classList.remove("hidden");
    statusBadge.className = "status disconnected";
    statusLabel.textContent = await _msg("notReadyMessage");
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

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  updateStatus(status);
}

// ── SVG icons ───────────────────────────────────────────────────────────────
const COPY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

function enableDevMode() {
  devMode = true;
  devSettings.classList.remove("hidden");
  $("dev-click-hint").textContent = "";
  clickCount = 0;
}

// ── Event Listeners (attached once) ─────────────────────────────────────────
function attachEventListeners() {
  // Copy URL
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

  // Open dev settings
  $("open-dev-btn").addEventListener("click", () => {
    enableDevMode();
  });

  // Dev mode (7 clicks on connected view)
  $("dev-mode-trigger").addEventListener("click", async () => {
    if (devMode) return;
    clickCount++;
    const remaining = CLICKS_TO_ENABLE - clickCount;
    if (remaining > 0) {
      $("dev-click-hint").textContent = await _msg("devClickHint", [String(remaining)]);
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

  // Test
  $("dev-test-btn").addEventListener("click", async () => {
    const url = $("dev-server-url").value.trim();
    if (!url) return showDevStatus(await _msg("devUrlEmpty"), "error");
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      return showDevStatus(await _msg("devUrlWrongProtocol"), "error");
    }

    $("dev-test-btn").textContent = await _msg("devTesting");
    $("dev-test-btn").disabled = true;

    const result = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION", url });

    $("dev-test-btn").textContent = await _msg("devTest");
    $("dev-test-btn").disabled = false;

    if (result.ok) {
      showDevStatus(await _msg("devTestOk"), "success");
    } else {
      showDevStatus(await _msg("devTestFailed"), "error");
    }
  });

  // Save & connect
  $("dev-save-btn").addEventListener("click", async () => {
    const url = $("dev-server-url").value.trim();
    if (!url) return showDevStatus(await _msg("devUrlEmpty"), "error");
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      return showDevStatus(await _msg("devUrlWrongProtocol"), "error");
    }

    trustDialog.classList.remove("hidden");
    if (url.startsWith("ws://")) {
      $("trust-insecure").classList.remove("hidden");
      $("trust-insecure").textContent = await _msg("devTrustWarningInsecure");
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
    showDevStatus(await _msg("devSaved"), "success");
    setTimeout(refreshStatus, 500);
  });

  // Reset
  $("dev-reset-btn").addEventListener("click", () => {
    $("dev-server-url").value = "ws://127.0.0.1:10086/ws";
    showDevStatus("", "");
  });

  // Copy MCP config
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
}

// ── Dev status ───────────────────────────────────────────────────────────────
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

// ── MCP Config ───────────────────────────────────────────────────────────────
async function updateMcpConfig() {
  const mcpPath = "mcp-server.js";
  const config = {
    mcpServers: {
      webbridge: {
        command: "node",
        args: [mcpPath],
      },
    },
  };
  $("mcp-config").textContent = JSON.stringify(config, null, 2);
  $("mcp-status-badge").textContent = await _msg("mcpBadgeReady");
  $("mcp-status-badge").classList.remove("off");
}

// ── Boot ─────────────────────────────────────────────────────────────────────
initUI().then(() => refreshStatus());
