/**
 * WebSocket Monitor Tool
 * Intercepts WebSocket send/receive messages on the active page.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class WebSocketMonitorTool {
  name = "websocket_monitor";

  async execute(args) {
    const action = args.action || "capture";
    const maxMessages = args.maxMessages || 100;

    const tab = await getActiveTab();
    await attach(tab.id);

    if (action === "capture") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          window.__wsMessages = window.__wsMessages || [];
          
          if (!window.__wsIntercepted) {
            const OriginalWebSocket = window.WebSocket;
            window.WebSocket = function(url, protocols) {
              const ws = new OriginalWebSocket(url, protocols);
              ws.__url = url;
              
              const originalSend = ws.send.bind(ws);
              ws.send = function(data) {
                window.__wsMessages.push({
                  type: "send",
                  url: ws.__url,
                  data: typeof data === "string" ? data : "[Binary/Blob]",
                  timestamp: Date.now(),
                });
                if (window.__wsMessages.length > ${maxMessages}) window.__wsMessages.shift();
                return originalSend(data);
              };
              
              const originalOnMessage = ws.onmessage;
              ws.onmessage = function(event) {
                window.__wsMessages.push({
                  type: "receive",
                  url: ws.__url,
                  data: typeof event.data === "string" ? event.data : "[Binary/Blob]",
                  timestamp: Date.now(),
                });
                if (window.__wsMessages.length > ${maxMessages}) window.__wsMessages.shift();
                if (originalOnMessage) originalOnMessage.call(this, event);
              };
              
              ws.addEventListener("message", (event) => {
                window.__wsMessages.push({
                  type: "receive",
                  url: ws.__url,
                  data: typeof event.data === "string" ? event.data : "[Binary/Blob]",
                  timestamp: Date.now(),
                });
                if (window.__wsMessages.length > ${maxMessages}) window.__wsMessages.shift();
              });
              
              return ws;
            };
            window.WebSocket.prototype = OriginalWebSocket.prototype;
            window.__wsIntercepted = true;
          }
          
          return {
            status: "interceptors_installed",
            messageCount: window.__wsMessages.length,
          };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) throw new Error(`websocket_monitor: ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    if (action === "read") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const msgs = window.__wsMessages || [];
          return {
            messageCount: msgs.length,
            messages: msgs.slice(-${maxMessages}),
          };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) throw new Error(`websocket_monitor: ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    if (action === "clear") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => { window.__wsMessages = []; return { status: "cleared" }; })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) throw new Error(`websocket_monitor: ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    throw new Error(`websocket_monitor: unknown action "${action}". Use: capture, read, clear`);
  }
}
