/**
 * WebBridge Open — Background Service Worker
 * Entry point that initializes all tools, the WebSocket client,
 * and message handlers for the popup.
 */

import { register, getToolNames } from "./tools/registry.js";
import { wsClient, setTrackToolCall, setTrackError, setRateLimit as setWsRateLimit } from "./lib/ws-client.js";

import { NavigateTool } from "./tools/navigate.js";
import { FindTabTool } from "./tools/find-tab.js";
import { EvaluateTool } from "./tools/evaluate.js";
import { NetworkTool } from "./tools/network.js";
import { SnapshotTool } from "./tools/snapshot.js";
import { ClickTool } from "./tools/click.js";
import { FillTool } from "./tools/fill.js";
import { KeyTypeTool } from "./tools/key-type.js";
import { SendKeysTool } from "./tools/send-keys.js";
import { ScreenshotTool } from "./tools/screenshot.js";
import { SaveAsPdfTool } from "./tools/save-as-pdf.js";
import { UploadTool } from "./tools/upload.js";
import { CloseTabTool } from "./tools/close-tab.js";
import { ListTabsTool } from "./tools/list-tabs.js";
import { HoverTool } from "./tools/hover.js";
import { SelectTool } from "./tools/select.js";
import { GetTextTool } from "./tools/get-text.js";
import { CookieTool } from "./tools/cookie.js";
import { HistoryTool } from "./tools/history.js";
import { InterceptTool } from "./tools/intercept.js";
import { ViewportTool } from "./tools/viewport.js";
import { ConsoleTool } from "./tools/console.js";
import { DialogTool } from "./tools/dialog.js";
import { EmulateTool } from "./tools/emulate.js";
import { SessionTool } from "./tools/session.js";
import { ScrollTool } from "./tools/scroll.js";
import { WaitTool } from "./tools/wait.js";
import { DragDropTool } from "./tools/drag-drop.js";
import { BookmarkTool } from "./tools/bookmark.js";
import { ExtensionTool } from "./tools/extension.js";
import { SecurityScanTool } from "./tools/security-scan.js";
import { AuditTool } from "./tools/audit.js";
import { LocalStorageTool } from "./tools/local-storage.js";
import { WebSocketMonitorTool } from "./tools/websocket-monitor.js";
import { HarExportTool } from "./tools/har-export.js";
import { CoverageTool } from "./tools/coverage.js";
import { RedirectChainTool } from "./tools/redirect-chain.js";
import { ShadowDomTool } from "./tools/shadow-dom.js";
import { IframeTool } from "./tools/iframe-tool.js";
import { DesignCloneTool } from "./tools/design-clone.js";
import { DomMutationsTool } from "./tools/dom-mutations.js";
import { ServiceWorkerTool } from "./tools/service-worker.js";
import { ApiDiscoveryTool } from "./tools/api-discovery.js";
import { SwaggerParserTool } from "./tools/swagger-parser.js";
import { ResponsiveTestTool } from "./tools/responsive-test.js";
import { ColorPaletteTool } from "./tools/color-palette.js";
import { GetMarkdownTool } from "./tools/get-markdown.js";
import { GetElementBoundsTool } from "./tools/get-element-bounds.js";
import { HumanizeTool } from "./tools/humanize.js";
import { SessionManagerTool } from "./tools/session-manager.js";
import { TableExtractTool } from "./tools/table-extract.js";
import { FormFillTool } from "./tools/form-fill.js";

// ── Register all tools ──────────────────────────────────────────────────────
register(new NavigateTool());
register(new FindTabTool());
register(new EvaluateTool());
register(new GetMarkdownTool());
register(new GetElementBoundsTool());
register(new HumanizeTool());
register(new SessionManagerTool());
register(new NetworkTool());
register(new SnapshotTool());
register(new ClickTool());
register(new FillTool());
register(new KeyTypeTool());
register(new SendKeysTool());
register(new ScreenshotTool());
register(new SaveAsPdfTool());
register(new UploadTool());
register(new CloseTabTool());
register(new ListTabsTool());
register(new HoverTool());
register(new SelectTool());
register(new GetTextTool());
register(new CookieTool());
register(new HistoryTool());
register(new InterceptTool());
register(new ViewportTool());
register(new ConsoleTool());
register(new DialogTool());
register(new EmulateTool());
register(new SessionTool());
register(new ScrollTool());
register(new WaitTool());
register(new DragDropTool());
register(new BookmarkTool());
register(new ExtensionTool());
register(new SecurityScanTool());
register(new AuditTool());
register(new LocalStorageTool());
register(new WebSocketMonitorTool());
register(new HarExportTool());
register(new CoverageTool());
register(new RedirectChainTool());
register(new ShadowDomTool());
register(new IframeTool());
register(new DesignCloneTool());
register(new DomMutationsTool());
register(new ServiceWorkerTool());
register(new ApiDiscoveryTool());
register(new SwaggerParserTool());
register(new ResponsiveTestTool());
register(new ColorPaletteTool());
register(new TableExtractTool());
register(new FormFillTool());

// ── Rate Limiting ────────────────────────────────────────────────────────────
const RATE_LIMIT_KEY = "webbridge_rate_limit";
const DEFAULT_RATE_LIMIT = 0; // 0 = unlimited
let rateLimitPerSec = DEFAULT_RATE_LIMIT;

/** Load rate limit setting from storage */
async function loadRateLimit() {
  try {
    const result = await chrome.storage.local.get(RATE_LIMIT_KEY);
    rateLimitPerSec = result[RATE_LIMIT_KEY] ?? DEFAULT_RATE_LIMIT;
  } catch {
    rateLimitPerSec = DEFAULT_RATE_LIMIT;
  }
}
loadRateLimit().then(() => setWsRateLimit(rateLimitPerSec));

/** Set rate limit (0 = unlimited) */
export async function setRateLimit(perSec) {
  rateLimitPerSec = perSec;
  await chrome.storage.local.set({ [RATE_LIMIT_KEY]: perSec });
  setWsRateLimit(perSec);
}

/** Get current rate limit */
export function getRateLimit() {
  return rateLimitPerSec;
}

// ── Metrics & Action Log ────────────────────────────────────────────────────
const metrics = {
  toolCallCount: 0,
  errorCount: 0,
  totalDurationMs: 0,
  connectedAt: null,
  lastError: null,
};
const actionLog = []; // { name, time, error? }
const MAX_LOG_ENTRIES = 20;

export function trackToolCall(name, durationMs, error) {
  metrics.toolCallCount++;
  metrics.totalDurationMs += durationMs;
  if (error) {
    metrics.errorCount++;
    metrics.lastError = { message: error, time: Date.now() };
  }
  const entry = {
    name,
    time: new Date().toLocaleTimeString(),
    error: error || null,
    durationMs,
  };
  actionLog.unshift(entry);
  if (actionLog.length > MAX_LOG_ENTRIES) actionLog.pop();
  // Broadcast to DevTools panels
  broadcastToDevTools({ type: "TOOL_CALL_EVENT", data: entry });
}

export function trackError(message) {
  metrics.errorCount++;
  metrics.lastError = { message, time: Date.now() };
  const entry = {
    name: "system",
    time: new Date().toLocaleTimeString(),
    error: message,
    durationMs: 0,
  };
  actionLog.unshift(entry);
  if (actionLog.length > MAX_LOG_ENTRIES) actionLog.pop();
  broadcastToDevTools({ type: "TOOL_CALL_EVENT", data: entry });
}

// Wire callbacks into ws-client (avoids circular dynamic imports)
setTrackToolCall(trackToolCall);
setTrackError(trackError);

// ── DevTools Panel Connections ──────────────────────────────────────────────
const devtoolsPorts = new Set();

function broadcastToDevTools(msg) {
  for (const port of devtoolsPorts) {
    try { port.postMessage(msg); } catch { devtoolsPorts.delete(port); }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "devtools-panel") {
    devtoolsPorts.add(port);
    port.onMessage.addListener((msg) => {
      if (msg.type === "GET_METRICS") {
        port.postMessage({ type: "METRICS_SNAPSHOT", data: getMetrics() });
      }
    });
    port.onDisconnect.addListener(() => {
      devtoolsPorts.delete(port);
    });
  }
});

export function getMetrics() {
  const uptime = metrics.connectedAt ? Date.now() - metrics.connectedAt : 0;
  return {
    toolCallCount: metrics.toolCallCount,
    errorCount: metrics.errorCount,
    avgDurationMs: metrics.toolCallCount > 0 ? Math.round(metrics.totalDurationMs / metrics.toolCallCount) : 0,
    uptime,
    actionLog,
    toolCount: getToolNames().length,
    rateLimitPerSec,
    lastError: metrics.lastError,
  };
}

// ── Keepalive port from offscreen document ────────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "keepalive") {
    port.onMessage.addListener((msg) => {
      if (msg.type === "ping") port.postMessage({ type: "pong" });
    });
  }
});

// ── Offscreen keepalive for MV3 service worker (Chrome only) ───────────────
const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
const KEEPALIVE_INTERVAL_MS = 25000; // Chrome kills SW after 30s idle

async function ensureOffscreen() {
  if (!chrome.offscreen) return; // Firefox MV2 doesn't have offscreen API
  try {
    const existing = await chrome.offscreen.hasDocument();
    if (!existing) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ["MESSAGES"],
        justification: "Persistent port connection keeps service worker alive for WebSocket",
      });
    }
  } catch {
    // offscreen API may not be available in all contexts
  }
}

// Ensure offscreen is created early and kept alive
if (chrome.offscreen) {
  ensureOffscreen();
  setInterval(() => { ensureOffscreen(); }, KEEPALIVE_INTERVAL_MS);
}

// ── Reconnect WebSocket on service worker wake-up ───────────────────────────
if (chrome.offscreen) ensureOffscreen();
wsClient.reconnectIfNeeded();

// ── Alarm-based reconnection fallback ───────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "webbridge-reconnect") {
    wsClient.reconnectIfNeeded();
  }
});

// ── Message handler for popup communication ─────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "GET_STATUS":
          sendResponse({
            connected: wsClient.isConnected(),
            serverUrl: wsClient.getServerUrl(),
            metrics: getMetrics(),
          });
          break;

        case "CONNECT":
          await wsClient.connect(message.url);
          metrics.connectedAt = Date.now();
          sendResponse({ success: true });
          break;

        case "HOT_RELOAD":
          await wsClient.hotReload(message.url);
          sendResponse({ success: true });
          break;

        case "DISCONNECT":
          await wsClient.disconnect();
          sendResponse({ success: true });
          break;

        case "TEST_CONNECTION":
          sendResponse(await wsClient.testConnection(message.url));
          break;

        case "SET_RATE_LIMIT":
          await setRateLimit(message.perSec ?? 0);
          sendResponse({ success: true, rateLimitPerSec: message.perSec ?? 0 });
          break;

        case "GENERATE_CONNECTION": {
          const resp = await fetch(`${message.serverBase}/api/connections`, {
            method: "POST",
          });
          if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
          sendResponse(await resp.json());
          break;
        }

        default:
          sendResponse({ error: `unknown type: ${message.type}` });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();

  // Return true to indicate async sendResponse
  return true;
});
