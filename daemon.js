/**
 * WebBridge Open — WebSocket Daemon
 *
 * Start:  node daemon.js
 * Default: ws://127.0.0.1:10086/ws
 *
 * Routes messages between AI clients and the browser extension:
 *   AI client → daemon → extension  (tool_call)
 *   extension → daemon → AI client  (tool_result)
 */

import { WebSocketServer } from "ws";

const PORT = 10086;
const PATH = "/ws";

const wss = new WebSocketServer({ port: PORT, path: PATH });

/** @type {Set<WebSocket>} extension clients */
const extensions = new Set();
/** @type {Set<WebSocket>} AI / controller clients */
const controllers = new Set();

/** Pending tool_results keyed by requestId */
const pendingResults = new Map();

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[+] client connected from ${ip}`);

  let role = null; // "extension" | "controller"

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.log("[!] invalid JSON:", raw.toString().slice(0, 80));
      return;
    }

    switch (msg.type) {
      case "hello": {
        // Extension sends hello on connect
        role = "extension";
        extensions.add(ws);
        console.log(
          `[hello] extension v${msg.payload?.extensionVersion ?? "?"} connected`
        );
        ws.send(JSON.stringify({ type: "hello_ack" }));
        break;
      }

      case "register": {
        // AI client registers itself
        role = "controller";
        controllers.add(ws);
        console.log("[register] controller connected");
        ws.send(JSON.stringify({ type: "register_ack" }));
        break;
      }

      case "pong":
        break;

      case "tool_call": {
        // From controller → forward to ALL extensions
        const rid = msg.requestId;
        console.log(
          `[tool_call] → ${msg.payload?.name} (req ${rid})`
        );
        const json = JSON.stringify(msg);
        for (const ext of extensions) {
          if (ext.readyState === ext.OPEN) ext.send(json);
        }

        // Also store a promise resolver if someone is waiting
        if (pendingResults.has(rid)) {
          // nobody waiting yet, that's fine
        }
        break;
      }

      case "tool_result": {
        // From extension → forward to ALL controllers
        const rid = msg.responseToRequestId;
        const payload = msg.payload;
        if (payload.error) {
          console.log(`[tool_result:${rid}] ERROR: ${payload.error}`);
        } else {
          const data = payload.data;
          const summary =
            typeof data === "object" ? JSON.stringify(data).slice(0, 120) : data;
          console.log(`[tool_result:${rid}] ${summary}`);
        }
        const json = JSON.stringify(msg);
        for (const ctrl of controllers) {
          if (ctrl.readyState === ctrl.OPEN) ctrl.send(json);
        }

        // Resolve pending promise
        if (pendingResults.has(rid)) {
          pendingResults.get(rid)(msg);
          pendingResults.delete(rid);
        }
        break;
      }

      default:
        console.log(`[?] unknown message type: ${msg.type}`);
    }
  });

  ws.on("close", () => {
    console.log(`[-] ${role || "client"} disconnected`);
    extensions.delete(ws);
    controllers.delete(ws);
  });

  ws.on("error", (err) => {
    console.log("[!] ws error:", err.message);
    extensions.delete(ws);
    controllers.delete(ws);
  });

  // Ping every 30s
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);
  ws.on("close", () => clearInterval(pingInterval));
});

// ── Interactive REPL ─────────────────────────────────────────────────────────
import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "openweb> ",
});

let reqCounter = 0;

rl.prompt();

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) { rl.prompt(); return; }

  if (trimmed === "help") {
    console.log(`
Commands:
  navigate <url>           Open URL in browser
  snapshot                 Get accessibility tree
  screenshot               Take screenshot
  click <selector>         Click element
  fill <selector> <value>  Fill form field
  hover <selector>         Hover over element
  select <selector> <val>  Select option in <select>
  scroll <dir>             Scroll page (down/up/top/bottom)
  get_text [selector]      Get page or element text
  history <cmd>            back, forward, refresh
  cookie <cmd> [name]      get, set, delete cookies
  console <cmd>            start, stop, list, clear
  dialog <cmd>             list, handle, auto
  viewport <cmd> [w] [h]   set, get, reset
  emulate <cmd>            device, geolocation, user_agent, reset
  session <cmd>             save, restore, clear, info
  intercept <cmd>          start, stop, add_rule, list_rules
  wait <type> [selector]   selector, navigation, network_idle
  evaluate <code>          Run JS on page
  list_tabs                List open tabs
  raw <json>               Send raw tool_call JSON
  clients                  Show connected clients
  help                     This message
  quit                     Exit daemon
`);
    rl.prompt();
    return;
  }

  if (trimmed === "quit" || trimmed === "exit") {
    console.log("Shutting down...");
    wss.close();
    process.exit(0);
  }

  if (trimmed === "clients") {
    console.log(`Extensions: ${extensions.size}  Controllers: ${controllers.size}`);
    rl.prompt();
    return;
  }

  let toolCall;

  if (trimmed.startsWith("raw ")) {
    try {
      toolCall = JSON.parse(trimmed.slice(4));
    } catch (e) {
      console.log("Invalid JSON:", e.message);
      rl.prompt();
      return;
    }
  } else {
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    const toolMap = {
      navigate:   () => ({ name: "navigate", args: { url: parts[1], newTab: true } }),
      snapshot:   () => ({ name: "snapshot", args: {} }),
      screenshot: () => ({ name: "screenshot", args: {} }),
      click:      () => ({ name: "click", args: { selector: parts[1] } }),
      fill:       () => ({ name: "fill", args: { selector: parts[1], value: parts.slice(2).join(" ") } }),
      hover:      () => ({ name: "hover", args: { selector: parts[1] } }),
      select:     () => ({ name: "select", args: { selector: parts[1], value: parts[2] } }),
      scroll:     () => ({ name: "scroll", args: { direction: parts[1] || "down", amount: parseInt(parts[2]) || 3 } }),
      get_text:   () => ({ name: "get_text", args: parts[1] ? { selector: parts[1] } : {} }),
      history:    () => ({ name: "history", args: { cmd: parts[1] || "back" } }),
      cookie:     () => ({ name: "cookie", args: { cmd: parts[1] || "get", name: parts[2] } }),
      console:    () => ({ name: "console", args: { cmd: parts[1] || "list" } }),
      dialog:     () => ({ name: "dialog", args: { cmd: parts[1] || "list" } }),
      viewport:   () => ({ name: "viewport", args: { cmd: parts[1] || "get", width: parseInt(parts[2]) || 1280, height: parseInt(parts[3]) || 720 } }),
      emulate:    () => ({ name: "emulate", args: { cmd: parts[1] || "device", device: parts[2] } }),
      session:    () => ({ name: "session", args: { cmd: parts[1] || "info" } }),
      intercept:  () => ({ name: "intercept", args: { cmd: parts[1] || "list_rules" } }),
      wait:       () => ({ name: "wait", args: { type: parts[1] || "selector", selector: parts[2] } }),
      drag_drop:  () => ({ name: "drag_drop", args: { source: parts[1], target: parts[2] } }),
      evaluate:   () => ({ name: "evaluate", args: { code: parts.slice(1).join(" ") } }),
      list_tabs:  () => ({ name: "list_tabs", args: {} }),
      find_tab:   () => ({ name: "find_tab", args: { url: parts[1] } }),
      key_type:   () => ({ name: "key_type", args: { text: parts.slice(1).join(" ") } }),
      send_keys:  () => ({ name: "send_keys", args: { keys: parts.slice(1).join(" ") } }),
      network:    () => ({ name: "network", args: { cmd: parts[1] || "list" } }),
      close_tab:  () => ({ name: "close_tab", args: {} }),
    };

    const builder = toolMap[cmd];
    if (!builder) {
      console.log(`Unknown command: ${cmd}. Type "help" for list.`);
      rl.prompt();
      return;
    }

    const { name, args } = builder();
    const rid = String(++reqCounter);
    toolCall = {
      type: "tool_call",
      requestId: rid,
      payload: { name, args },
    };

    // Wait for result
    const resultPromise = new Promise((resolve) => {
      pendingResults.set(rid, resolve);
      setTimeout(() => {
        if (pendingResults.has(rid)) {
          pendingResults.delete(rid);
          resolve({ payload: { error: "timeout (30s)" } });
        }
      }, 30000);
    });

    // Send to extensions
    if (extensions.size === 0) {
      console.log("No extension connected. Open the extension first.");
      pendingResults.delete(rid);
      rl.prompt();
      return;
    }

    const json = JSON.stringify(toolCall);
    for (const ext of extensions) {
      if (ext.readyState === ext.OPEN) ext.send(json);
    }
    console.log(`→ ${name} (req ${rid})`);

    // Wait for result asynchronously
    resultPromise.then((result) => {
      const p = result.payload;
      if (p.error) {
        console.log(`✗ ERROR: ${p.error}`);
      } else {
        const d = p.data;
        if (typeof d === "object" && d !== null) {
          const s = JSON.stringify(d, null, 2);
          console.log(`✓ OK: ${s.length > 2000 ? s.slice(0, 2000) + "\n..." : s}`);
        } else {
          console.log(`✓ OK: ${d}`);
        }
      }
      rl.prompt();
    });
    return; // don't call rl.prompt() here, it'll be called after result
  }

  // raw path
  if (extensions.size === 0) {
    console.log("No extension connected.");
    rl.prompt();
    return;
  }

  const rid = toolCall.requestId || String(++reqCounter);
  if (!toolCall.requestId) toolCall.requestId = rid;

  const resultPromise = new Promise((resolve) => {
    pendingResults.set(rid, resolve);
    setTimeout(() => { pendingResults.delete(rid); resolve({ payload: { error: "timeout" } }); }, 30000);
  });

  for (const ext of extensions) {
    if (ext.readyState === ext.OPEN) ext.send(JSON.stringify(toolCall));
  }

  resultPromise.then((result) => {
    const p = result.payload;
    if (p.error) console.log(`✗ ERROR: ${p.error}`);
    else console.log(`✓ OK:`, typeof p.data === "object" ? JSON.stringify(p.data, null, 2).slice(0, 2000) : p.data);
    rl.prompt();
  });
});

console.log(`
╔══════════════════════════════════════════╗
║   OpenWeb — Daemon                       ║
║   Listening on ws://127.0.0.1:${PORT}${PATH}    ║
╚══════════════════════════════════════════╝

Type "help" for commands.
`);
