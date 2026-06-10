import { register, getToolNames } from "./tools/registry.js";
import { wsClient, setTrackToolCall, setTrackError, setRateLimit as setWsRateLimit } from "./lib/ws-client.js";

import { NavigateTool } from "./tools/navigate.js";
import { FindTabTool } from "./tools/find-tab.js";
import { EvaluateTool } from "./tools/evaluate.js";
import { NetworkTool } from "./tools/network.js";
import { SnapshotTool } from "./tools/snapshot.js";
import { ClickTool } from "./tools/click.js";
import { FillTool } from "./tools/fill.js";
import { SendKeysTool } from "./tools/send-keys.js";
import { ScreenshotTool } from "./tools/screenshot.js";
import { SaveAsPdfTool } from "./tools/save-as-pdf.js";
import { UploadTool } from "./tools/upload.js";
import { CloseTabTool } from "./tools/close-tab.js";
import { ListTabsTool } from "./tools/list-tabs.js";
import { HoverTool } from "./tools/hover.js";
import { SelectTool } from "./tools/select.js";
import { GetTextTool } from "./tools/get-text.js";
import { HistoryTool } from "./tools/history.js";
import { ConsoleTool } from "./tools/console.js";
import { DialogTool } from "./tools/dialog.js";
import { EmulateTool } from "./tools/emulate.js";
import { ScrollTool } from "./tools/scroll.js";
import { WaitTool } from "./tools/wait.js";
import { DragDropTool } from "./tools/drag-drop.js";
import { BookmarkTool } from "./tools/bookmark.js";
import { ExtensionTool } from "./tools/extension.js";
import { SecurityScanTool } from "./tools/security-scan.js";
import { AuditTool } from "./tools/audit.js";
import { CoverageTool } from "./tools/coverage.js";
import { ShadowDomTool } from "./tools/shadow-dom.js";
import { IframeTool } from "./tools/iframe-tool.js";
import { DesignCloneTool } from "./tools/design-clone.js";
import { DomMutationsTool } from "./tools/dom-mutations.js";
import { ServiceWorkerTool } from "./tools/service-worker.js";
import { SwaggerParserTool } from "./tools/swagger-parser.js";
import { ResponsiveTestTool } from "./tools/responsive-test.js";
import { ColorPaletteTool } from "./tools/color-palette.js";
import { GetMarkdownTool } from "./tools/get-markdown.js";
import { GetElementBoundsTool } from "./tools/get-element-bounds.js";
import { HumanizeTool } from "./tools/humanize.js";
import { FormFillTool } from "./tools/form-fill.js";
import { DismissOverlayTool } from "./tools/dismiss-overlay.js";
import { WaitStaleTool } from "./tools/wait-stale.js";
import { FindByTextTool } from "./tools/find-by-text.js";
import { SelectAutocompleteTool } from "./tools/select-autocomplete.js";
import { StateTool, SessionTool, SessionManagerTool, CookieTool, LocalStorageTool } from "./tools/state.js";
import { A11yAuditTool } from "./tools/a11y-audit.js";
import { BrokenLinksTool } from "./tools/broken-links.js";
import { FormAuditTool } from "./tools/form-audit.js";
import { PerformanceAuditTool } from "./tools/performance-audit.js";
import { SeoAuditTool } from "./tools/seo-audit.js";
import { ExtractPageTool } from "./tools/extract-page.js";
import { ClickAndVerifyTool } from "./tools/click-and-verify.js";
import { DiscoverToolsTool } from "./tools/discover-tools.js";
import { SpeechToTextTool } from "./tools/speech-to-text.js";
import { TranslateTool } from "./tools/translate.js";
import { SolveCaptchaTool } from "./tools/solve-captcha.js";
import { StealthTool } from "./tools/stealth.js";

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
register(new StateTool());
register(new CoverageTool());
register(new ShadowDomTool());
register(new IframeTool());
register(new DesignCloneTool());
register(new DomMutationsTool());
register(new ServiceWorkerTool());
register(new SwaggerParserTool());
register(new ResponsiveTestTool());
register(new ColorPaletteTool());
register(new FormFillTool());
register(new DismissOverlayTool());
register(new WaitStaleTool());
register(new FindByTextTool());
register(new SelectAutocompleteTool());
register(new A11yAuditTool());
register(new BrokenLinksTool());
register(new FormAuditTool());
register(new PerformanceAuditTool());
register(new SeoAuditTool());
register(new ExtractPageTool());
register(new ClickAndVerifyTool());
register(new DiscoverToolsTool());
register(new SpeechToTextTool());
register(new TranslateTool());
register(new SolveCaptchaTool());
register(new StealthTool());

const RATE_LIMIT_KEY = "OpenWeb_rate_limit";
const DEFAULT_RATE_LIMIT = 0; 

let rateLimitPerSec = DEFAULT_RATE_LIMIT;

                                           
async function loadRateLimit() {
  try {
    const result = await chrome.storage.local.get(RATE_LIMIT_KEY);
    rateLimitPerSec = result[RATE_LIMIT_KEY] ?? DEFAULT_RATE_LIMIT;
  } catch {
    rateLimitPerSec = DEFAULT_RATE_LIMIT;
  }
}
loadRateLimit().then(() => setWsRateLimit(rateLimitPerSec));

                                     
export async function setRateLimit(perSec) {
  rateLimitPerSec = perSec;
  await chrome.storage.local.set({ [RATE_LIMIT_KEY]: perSec });
  setWsRateLimit(perSec);
}

                             
export function getRateLimit() {
  return rateLimitPerSec;
}

const metrics = {
  toolCallCount: 0,
  errorCount: 0,
  totalDurationMs: 0,
  connectedAt: null,
  lastError: null,
};
const actionLog = []; 

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

setTrackToolCall(trackToolCall);
setTrackError(trackError);

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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "keepalive") {
    port.onMessage.addListener((msg) => {
      if (msg.type === "ping") port.postMessage({ type: "pong" });
    });
  }
});

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
const KEEPALIVE_INTERVAL_MS = 25000; 

async function ensureOffscreen() {
  if (!chrome.offscreen) return; 

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
    

  }
}

if (chrome.offscreen) {
  ensureOffscreen();
  setInterval(() => { ensureOffscreen(); }, KEEPALIVE_INTERVAL_MS);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && wsClient.isConnected()) {
    wsClient.send({ type: "page_changed", url: tab.url, title: tab.title });
  }
});

wsClient.reconnectIfNeeded();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "OpenWeb-reconnect") {
    wsClient.reconnectIfNeeded();
  }
});

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

  

  return true;
});
