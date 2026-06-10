import { executeTool } from "../tools/registry.js";
import { validateIncomingMessage } from "./message-validator.js";

let _trackToolCallFn = null;
let _trackErrorFn = null;

export function setTrackToolCall(fn) { _trackToolCallFn = fn; }
export function setTrackError(fn) { _trackErrorFn = fn; }

function trackToolCall(name, durationMs, error) {
  if (_trackToolCallFn) _trackToolCallFn(name, durationMs, error);
}

function reportError(message) {
  if (_trackErrorFn) _trackErrorFn(message);
}

let _rateLimitPerSec = 0;
const _callTimestamps = [];

async function restoreRateLimit() {
  try {
    const data = await chrome.storage.session.get("rateLimitPerSec");
    if (data.rateLimitPerSec !== undefined) {
      _rateLimitPerSec = data.rateLimitPerSec;
    }
  } catch {}
}
restoreRateLimit();

export function setRateLimit(perSec) {
  _rateLimitPerSec = perSec;
  try {
    chrome.storage.session.set({ rateLimitPerSec: perSec });
  } catch {}
}

function checkRateLimit() {
  if (_rateLimitPerSec <= 0) return true; 

  const now = Date.now();
  const windowMs = 1000;
  

  while (_callTimestamps.length > 0 && _callTimestamps[0] <= now - windowMs) {
    _callTimestamps.shift();
  }
  if (_callTimestamps.length >= _rateLimitPerSec) return false;
  _callTimestamps.push(now);
  return true;
}

const DEFAULT_WS_URL = "ws://127.0.0.1:10086/ws";
const RECONNECT_ALARM_NAME = "OpenWeb-reconnect";
const INITIAL_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

const STORAGE_KEYS = {
  SHOULD_RECONNECT: "ws_should_reconnect",
  WS_URL: "ws_url",
};



class WebSocketClient {
  constructor() {
                                 
    this.socket = null;
                                                          
    this.state = "disconnected";
    this.currentUrl = "";
    this.shouldReconnect = false;
    this.reconnectTimer = null;
    this.isDisconnecting = false;
    this.reconnectDelay = INITIAL_RECONNECT_MS;
    this.heartbeatInterval = null;
  }

  isConnected() {
    return this.state === "connected";
  }

  getServerUrl() {
    return this.currentUrl;
  }

     
                                   
                                                        
     
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
        this.reconnectDelay = INITIAL_RECONNECT_MS; 

        console.log("[ws] connected to", wsUrl);

        

        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
          this.send({ type: "heartbeat" });
        }, 15000);
        this.send({
          type: "hello",
          payload: {
            extensionVersion: chrome.runtime.getManifest().version,
          },
        });
      });

      ws.addEventListener("message", async (event) => {
        try {
          

          if (event.data instanceof Blob) {
            

            console.log("[ws] received binary frame, ignoring");
            return;
          }
          const msg = JSON.parse(event.data);
          if (!validateIncomingMessage(msg)) {
            console.error("[ws] incoming message validation failed:", msg);
            return;
          }
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
          reportError("WebSocket disconnected");
          if (!this.isDisconnecting && this.shouldReconnect) {
            this.scheduleReconnect();
          }
        }
      });

      ws.addEventListener("error", (err) => {
        console.error("[ws] error:", err);
        reportError("WebSocket error");
      });
    } catch (err) {
      this.state = "disconnected";
      console.error("[ws] connect failed:", err);
      reportError("WebSocket connect failed: " + (err?.message || "unknown"));
      if (this.shouldReconnect) this.scheduleReconnect();
    }
  }

     
                                                    
                        
                                                       
     
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

     
                                                             
                                                     
                           
     
  async hotReload(newUrl) {
    if (newUrl === this.currentUrl && this.state === "connected") return;

    this.isDisconnecting = false;
    this.stopHeartbeat();

    

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.state = "disconnected";

    

    await this.connect(newUrl);
  }

     
                                          
     
  async disconnect() {
    this.isDisconnecting = true;
    this.shouldReconnect = false;
    this.stopHeartbeat();
    this.clearReconnectTimer();
    await chrome.storage.session.set({ [STORAGE_KEYS.SHOULD_RECONNECT]: false });
    await chrome.alarms.clear(RECONNECT_ALARM_NAME);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.state = "disconnected";
  }

     
                                                            
     
  async reconnectIfNeeded() {
    if (this.state === "connected" || this.state === "connecting" || this.reconnectTimer) return;

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
    chrome.alarms.create(RECONNECT_ALARM_NAME, { delayInMinutes: Math.max(delay / 60000, 1) });
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    chrome.alarms.clear(RECONNECT_ALARM_NAME);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

     
                                          
                        
     
  handleMessage(msg) {
    console.log("[ws] handleMessage:", msg.type);
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

     
                                                
                        
     
  async handleToolCall(msg) {
    const { name, args } = msg.payload || {};
    console.log("[ws] handleToolCall:", name, "requestId:", msg.requestId);
    if (!name) {
      this.send({
        type: "tool_result",
        responseToRequestId: msg.requestId,
        payload: { error: "missing tool name" },
      });
      return;
    }
    

    const toolArgs = { ...args };
    if (toolArgs.tabId != null) {
      toolArgs._tabId = toolArgs.tabId;
      delete toolArgs.tabId;
    }
    

    const allowed = checkRateLimit();
    if (!allowed) {
      this.send({
        type: "tool_result",
        responseToRequestId: msg.requestId,
        payload: { error: "Rate limit exceeded — too many tool calls per second" },
      });
      return;
    }
    const startTime = Date.now();
    try {
      const result = await executeTool(name, toolArgs);
      const durationMs = Date.now() - startTime;
      trackToolCall(name, durationMs, null);
      this.send({
        type: "tool_result",
        responseToRequestId: msg.requestId,
        payload: { data: result },
      });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      trackToolCall(name, durationMs, err.message);
      this.send({
        type: "tool_result",
        responseToRequestId: msg.requestId,
        payload: { error: err.message },
      });
    }
  }

     
                                            
                        
     
  send(msg) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }
}

                         
export const wsClient = new WebSocketClient();
