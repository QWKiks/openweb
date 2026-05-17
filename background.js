/**
 * WebBridge Open — Background Service Worker
 * Entry point that initializes all tools, the WebSocket client,
 * and message handlers for the popup.
 */

import { register, getToolNames } from "./tools/registry.js";
import { wsClient } from "./lib/ws-client.js";

import { NavigateTool } from "./tools/navigate.js";
import { FindTabTool } from "./tools/find-tab.js";
import { EvaluateTool } from "./tools/evaluate.js";
import { NetworkTool } from "./tools/network.js";
import { SnapshotTool } from "./tools/snapshot.js";
import { ClickTool } from "./tools/click.js";
import { FillTool } from "./tools/fill.js";
import { MouseClickTool } from "./tools/mouse-click.js";
import { KeyTypeTool } from "./tools/key-type.js";
import { SendKeysTool } from "./tools/send-keys.js";
import { ScreenshotTool } from "./tools/screenshot.js";
import { SaveAsPdfTool } from "./tools/save-as-pdf.js";
import { UploadTool } from "./tools/upload.js";
import { CloseTabTool } from "./tools/close-tab.js";
import { ListTabsTool } from "./tools/list-tabs.js";
import { CloseSessionTool } from "./tools/close-session.js";
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
import { ContentScriptFallback } from "./tools/content-script.js";

// ── Register all tools ──────────────────────────────────────────────────────
register(new NavigateTool());
register(new FindTabTool());
register(new EvaluateTool());
register(new NetworkTool());
register(new SnapshotTool());
register(new ClickTool());
register(new FillTool());
register(new MouseClickTool());
register(new KeyTypeTool());
register(new SendKeysTool());
register(new ScreenshotTool());
register(new SaveAsPdfTool());
register(new UploadTool());
register(new CloseTabTool());
register(new ListTabsTool());
register(new CloseSessionTool());
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
register(new ContentScriptFallback());

// ── Metrics & Action Log ────────────────────────────────────────────────────
const metrics = {
  toolCallCount: 0,
  totalDurationMs: 0,
  connectedAt: null,
};
const actionLog = []; // { name, time, error? }
const MAX_LOG_ENTRIES = 20;

export function trackToolCall(name, durationMs, error) {
  metrics.toolCallCount++;
  metrics.totalDurationMs += durationMs;
  actionLog.unshift({
    name,
    time: new Date().toLocaleTimeString(),
    error: error || null,
    durationMs,
  });
  if (actionLog.length > MAX_LOG_ENTRIES) actionLog.pop();
}

export function getMetrics() {
  const uptime = metrics.connectedAt ? Date.now() - metrics.connectedAt : 0;
  return {
    toolCallCount: metrics.toolCallCount,
    avgDurationMs: metrics.toolCallCount > 0 ? Math.round(metrics.totalDurationMs / metrics.toolCallCount) : 0,
    uptime,
    actionLog,
    toolCount: getToolNames().length,
  };
}

// ── Reconnect WebSocket on service worker wake-up ───────────────────────────
wsClient.reconnectIfNeeded();

// ── Offscreen keepalive for MV3 service worker ──────────────────────────────
const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
const KEEPALIVE_INTERVAL_MS = 25000; // Chrome kills SW after 30s idle

async function ensureOffscreen() {
  try {
    const existing = await chrome.offscreen.hasDocument();
    if (!existing) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: "WORKERS",
        justification: "Keep service worker alive for WebSocket connection",
      });
    }
  } catch {
    // offscreen API may not be available in all contexts
  }
}

// Start keepalive when connected
const origConnect = wsClient.connect.bind(wsClient);
wsClient.connect = async function(url) {
  await origConnect(url);
  if (wsClient.isConnected()) {
    ensureOffscreen();
  }
};

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
