/**
 * WebBridge Open — Background Service Worker
 * Entry point that initializes all tools, the WebSocket client,
 * and message handlers for the popup.
 */

import { register } from "./tools/registry.js";
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

// ── Reconnect WebSocket on service worker wake-up ───────────────────────────
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
          });
          break;

        case "CONNECT":
          await wsClient.connect(message.url);
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
