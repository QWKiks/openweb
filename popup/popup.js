/**
 * WebBridge Open — Popup Script
 */

function msg(key) {
  return chrome.i18n.getMessage(key);
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

// ── Init ────────────────────────────────────────────────────────────────────
function initUI() {
  $("version").textContent = `v${chrome.runtime.getManifest().version}`;
  $("status-label").textContent = msg("notReadyMessage");
  $("guide-text").textContent = msg("guideText");
  $("open-dev-btn").textContent = msg("openDevSettings");

  $("dev-advanced-label").textContent = msg("devAdvancedSettings");
  $("dev-exit-btn").textContent = msg("devExit");
  $("dev-url-label").textContent = msg("devServerUrlLabel");
  $("dev-test-btn").textContent = msg("devTest");
  $("dev-save-btn").textContent = msg("devSave");
  $("dev-reset-btn").textContent = msg("devReset");
  $("trust-title").textContent = msg("devTrustWarningTitle");
  $("trust-body").textContent = msg("devTrustWarningBody");
  $("trust-cancel").textContent = msg("devTrustCancel");
  $("trust-confirm").textContent = msg("devTrustConfirm");

  // MCP section
  $("mcp-label").textContent = msg("mcpLabel");
  $("mcp-hint").textContent = msg("mcpHint");
  updateMcpConfig();
}

// ── Status ───────────────────────────────────────────────────────────────────
function updateStatus(status) {
  if (status.connected) {
    connectedView.classList.remove("hidden");
    disconnectedView.classList.add("hidden");
    statusBadge.className = "status connected";
    statusLabel.textContent = msg("readyMessage");
    $("server-url").textContent = status.serverUrl || "";
  } else {
    connectedView.classList.add("hidden");
    disconnectedView.classList.remove("hidden");
    statusBadge.className = "status disconnected";
    statusLabel.textContent = msg("notReadyMessage");
  }
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  updateStatus(status);
}

// ── Copy ─────────────────────────────────────────────────────────────────────
const COPY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

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

// ── Open dev settings ────────────────────────────────────────────────────────
$("open-dev-btn").addEventListener("click", () => {
  enableDevMode();
});

// ── Dev mode (7 clicks on connected view) ────────────────────────────────────
$("dev-mode-trigger").addEventListener("click", () => {
  if (devMode) return;
  clickCount++;
  const remaining = CLICKS_TO_ENABLE - clickCount;
  if (remaining > 0) {
    $("dev-click-hint").textContent = msg("devClickHint").replace("$N$", remaining);
  } else {
    enableDevMode();
  }
});

function enableDevMode() {
  devMode = true;
  devSettings.classList.remove("hidden");
  $("dev-click-hint").textContent = "";
  clickCount = 0;
}

$("dev-exit-btn").addEventListener("click", () => {
  devMode = false;
  devSettings.classList.add("hidden");
  trustDialog.classList.add("hidden");
  clickCount = 0;
});

// ── Test ─────────────────────────────────────────────────────────────────────
$("dev-test-btn").addEventListener("click", async () => {
  const url = $("dev-server-url").value.trim();
  if (!url) return showDevStatus(msg("devUrlEmpty"), "error");
  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    return showDevStatus(msg("devUrlWrongProtocol"), "error");
  }

  $("dev-test-btn").textContent = msg("devTesting");
  $("dev-test-btn").disabled = true;

  const result = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION", url });

  $("dev-test-btn").textContent = msg("devTest");
  $("dev-test-btn").disabled = false;

  if (result.ok) {
    showDevStatus(msg("devTestOk"), "success");
  } else {
    showDevStatus(msg("devTestFailed"), "error");
  }
});

// ── Save & connect ──────────────────────────────────────────────────────────
$("dev-save-btn").addEventListener("click", () => {
  const url = $("dev-server-url").value.trim();
  if (!url) return showDevStatus(msg("devUrlEmpty"), "error");
  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    return showDevStatus(msg("devUrlWrongProtocol"), "error");
  }

  trustDialog.classList.remove("hidden");
  if (url.startsWith("ws://")) {
    $("trust-insecure").classList.remove("hidden");
    $("trust-insecure").textContent = msg("devTrustWarningInsecure");
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
  showDevStatus(msg("devSaved"), "success");
  setTimeout(refreshStatus, 500);
});

// ── Reset ────────────────────────────────────────────────────────────────────
$("dev-reset-btn").addEventListener("click", () => {
  $("dev-server-url").value = "ws://127.0.0.1:10086/ws";
  showDevStatus("", "");
});

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
function updateMcpConfig() {
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
  $("mcp-status-badge").textContent = msg("mcpBadgeReady");
  $("mcp-status-badge").classList.remove("off");
}

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

// ── Boot ─────────────────────────────────────────────────────────────────────
initUI();
refreshStatus();
