/**
 * WebSocket Client
 * Connects to the WebBridge daemon, handles reconnection, and routes messages.
 */

import { executeTool } from "../tools/registry.js";

const DEFAULT_WS_URL = "ws://127.0.0.1:10086/ws";
const RECONNECT_ALARM_NAME = "webbridge-reconnect";
const INITIAL_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

const STORAGE_KEYS = {
  SHOULD_RECONNECT: "ws_should_reconnect",
  WS_URL: "ws_url",
};

class WebSocketClient {
  constructor() {
    /** @type {WebSocket|null} */
    this.socket = null;
    /** @type {"disconnected"|"connecting"|"connected"} */
    this.state = "disconnected";
    this.currentUrl = "";
    this.shouldReconnect = false;
    this.reconnectTimer = null;
    this.isDisconnecting = false;
    this.reconnectDelay = INITIAL_RECONNECT_MS;
  }

  isConnected() {
    return this.state === "connected";
  }

  getServerUrl() {
    return this.currentUrl;
  }

  /**
   * Connect to a WebSocket server.
   * @param {string} [url] - WebSocket URL to connect to
   */
  async connect(url) {
    if (
      url &&
      url !== this.currentUrl &&
      (this.state === "connecting" || this.state === "connected")
    ) {
      await this.disconnect();
    }
    if (this.state === "connecting" || this.state === "connected") return;

    this.isDisconnecting = false;
    this.shouldReconnect = true;
    this.state = "connecting";

    const wsUrl = url || this.currentUrl;
    this.currentUrl = wsUrl;

    await Promise.all([
      chrome.storage.session.set({
        [STORAGE_KEYS.SHOULD_RECONNECT]: true,
        [STORAGE_KEYS.WS_URL]: wsUrl,
      }),
      wsUrl ? chrome.storage.local.set({ local_url: wsUrl }) : Promise.resolve(),
    ]);

    try {
      const ws = new WebSocket(wsUrl);
      this.socket = ws;

      ws.addEventListener("open", () => {
        if (this.isDisconnecting) {
          ws.close();
          return;
        }
        this.state = "connected";
        this.clearReconnectTimer();
        this.reconnectDelay = INITIAL_RECONNECT_MS; // Reset backoff on success
        console.log("[ws] connected to", wsUrl);
        this.send({
          type: "hello",
          payload: {
            extensionVersion: chrome.runtime.getManifest().version,
          },
        });
      });

      ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (err) {
          console.error("[ws] invalid message:", err);
        }
      });

      ws.addEventListener("close", () => {
        if (this.socket === ws) {
          this.state = "disconnected";
          this.socket = null;
          console.log("[ws] disconnected");
          if (!this.isDisconnecting && this.shouldReconnect) {
            this.scheduleReconnect();
          }
        }
      });

      ws.addEventListener("error", (err) => {
        console.error("[ws] error:", err);
      });
    } catch (err) {
      this.state = "disconnected";
      console.error("[ws] connect failed:", err);
      if (this.shouldReconnect) this.scheduleReconnect();
    }
  }

  /**
   * Test a WebSocket connection without keeping it.
   * @param {string} url
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  testConnection(url) {
    return new Promise((resolve) => {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        resolve({ ok: false, reason: err?.message || "invalid url" });
        return;
      }

      const timeout = setTimeout(() => {
        try { ws.close(); } catch {}
        resolve({ ok: false, reason: "timeout" });
      }, 5000);

      let settled = false;

      ws.addEventListener("open", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          resolve({ ok: true });
        }
      });

      ws.addEventListener("error", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          resolve({ ok: false, reason: "connect failed" });
        }
      });
    });
  }

  /**
   * Disconnect from the WebSocket server.
   */
  async disconnect() {
    this.isDisconnecting = true;
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    await chrome.storage.session.set({ [STORAGE_KEYS.SHOULD_RECONNECT]: false });
    await chrome.alarms.clear(RECONNECT_ALARM_NAME);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.state = "disconnected";
  }

  /**
   * Reconnect if needed (called on service worker wake-up).
   */
  async reconnectIfNeeded() {
    if (this.state === "connected" || this.state === "connecting") return;

    const sessionData = await chrome.storage.session.get([
      STORAGE_KEYS.SHOULD_RECONNECT,
      STORAGE_KEYS.WS_URL,
    ]);
    if (sessionData[STORAGE_KEYS.SHOULD_RECONNECT] && sessionData[STORAGE_KEYS.WS_URL]) {
      this.shouldReconnect = true;
      await this.connect(sessionData[STORAGE_KEYS.WS_URL]);
      return;
    }

    const localData = await chrome.storage.local.get(["local_url"]);
    if (localData.local_url) {
      this.shouldReconnect = true;
      await this.connect(localData.local_url);
      return;
    }

    this.shouldReconnect = true;
    await this.connect(DEFAULT_WS_URL);
  }

  scheduleReconnect() {
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_MS);
    console.log(`[ws] reconnecting in ${delay}ms (backoff)`);
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.currentUrl);
    }, delay);
    chrome.alarms.create(RECONNECT_ALARM_NAME, { delayInMinutes: Math.max(delay / 60000, 0.1) });
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    chrome.alarms.clear(RECONNECT_ALARM_NAME);
  }

  /**
   * Handle an incoming WebSocket message.
   * @param {object} msg
   */
  handleMessage(msg) {
    switch (msg.type) {
      case "ping":
        this.send({ type: "pong" });
        break;
      case "hello_ack":
        break;
      case "tool_call":
        this.handleToolCall(msg);
        break;
      default:
        console.log("[ws] unhandled message type:", msg.type);
    }
  }

  /**
   * Handle a tool_call message from the server.
   * @param {object} msg
   */
  async handleToolCall(msg) {
    const { name, args } = msg.payload || {};
    if (!name) {
      this.send({
        type: "tool_result",
        responseToRequestId: msg.requestId,
        payload: { error: "missing tool name" },
      });
      return;
    }
    try {
      const result = await executeTool(name, args || {});
      this.send({
        type: "tool_result",
        responseToRequestId: msg.requestId,
        payload: { data: result },
      });
    } catch (err) {
      this.send({
        type: "tool_result",
        responseToRequestId: msg.requestId,
        payload: { error: err.message },
      });
    }
  }

  /**
   * Send a JSON message over the WebSocket.
   * @param {object} msg
   */
  send(msg) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }
}

/** Singleton instance */
export const wsClient = new WebSocketClient();
