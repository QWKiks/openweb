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
import { timingSafeEqual, randomBytes } from "crypto";
import { createServer } from "http";

const PORT = 10086;
const PATH = "/ws";

// ── Security Configuration ────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 10000;  // 10 seconds
const RATE_LIMIT_MAX_MSG = 100;       // max messages per window per IP
const RATE_LIMIT_MAX_BURST = 20;      // max messages in a single second

/** @type {Map<string, { count: number, reset: number, burst: number, burstReset: number }>} */
const rateLimits = new Map();

/** @type {Set<string>} recent nonces to prevent replay */
const recentNonces = new Set();
setInterval(() => recentNonces.clear(), 120000); // clear every 2 min

function isOriginAllowed(origin, roleHint) {
  if (!origin || origin === "null") return true; // Node.js clients have no origin
  if (origin.startsWith("chrome-extension://")) return roleHint === "extension" || roleHint === "any";
  if (origin.startsWith("http://localhost") || origin.startsWith("https://localhost")) return true;
  if (origin.startsWith("http://127.0.0.1") || origin.startsWith("https://127.0.0.1")) return true;
  return false;
}

function checkRateLimit(ip) {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return { allowed: true };
  const now = Date.now();
  let rl = rateLimits.get(ip);
  if (!rl) {
    rl = { count: 0, reset: now + RATE_LIMIT_WINDOW_MS, burst: 0, burstReset: now + 1000 };
    rateLimits.set(ip, rl);
  }
  if (now > rl.reset) {
    rl.count = 0; rl.reset = now + RATE_LIMIT_WINDOW_MS;
  }
  if (now > rl.burstReset) {
    rl.burst = 0; rl.burstReset = now + 1000;
  }
  rl.count++;
  rl.burst++;
  if (rl.burst > RATE_LIMIT_MAX_BURST) return { allowed: false, reason: "burst" };
  if (rl.count > RATE_LIMIT_MAX_MSG) return { allowed: false, reason: "window" };
  return { allowed: true };
}

// Auth: Bearer token for controller connections (optional, set via WEBBRIDGE_TOKEN env)
const AUTH_TOKEN = process.env.WEBBRIDGE_TOKEN || null;

// #7: Reject ws:// connections when auth token is configured (token exposed on unencrypted ws://)
const BIND_HOST = AUTH_TOKEN ? "127.0.0.1" : undefined; // Only bind localhost when auth is active
const REQUIRE_TLS = AUTH_TOKEN;

const wss = new WebSocketServer({ port: PORT, host: BIND_HOST, path: PATH, perMessageDeflate: false, maxPayload: 50 * 1024 * 1024 });

// Verify auth on upgrade for controller connections
wss.on("headers", (headers, req) => {
  // Auth is checked on the "register" message instead of upgrade
  // so extensions can always connect without a token
});

/** @type {Set<WebSocket>} extension clients */
const extensions = new Set();
/** @type {Set<WebSocket>} AI / controller clients */
const controllers = new Set();

/** Active request counts per extension (for load-aware routing) */
const extActiveRequests = new Map();

/** Pending tool_results keyed by requestId */
const pendingResults = new Map();

/** Route tool_calls to specific extension: requestId → WebSocket */
const requestToExtension = new Map();

/** Round-robin index for multi-extension routing */
let rrIndex = 0;

function pickExtension() {
  const exts = [...extensions].filter(ws => ws.readyState === ws.OPEN);
  if (exts.length === 0) return null;
  if (exts.length === 1) return exts[0];

  // Load-aware: pick extension with fewest active requests
  exts.sort((a, b) => (extActiveRequests.get(a) || 0) - (extActiveRequests.get(b) || 0));
  return exts[0];
}

/** Heartbeat tracking: extension → last heartbeat timestamp */
const extensionHeartbeats = new Map();
const STALE_THRESHOLD_MS = 45000;

// #9: Periodically check for stale extensions — remove and close them
setInterval(() => {
  const now = Date.now();
  for (const [ws, lastBeat] of extensionHeartbeats) {
    if (now - lastBeat > STALE_THRESHOLD_MS) {
      console.log("[heartbeat] extension is stale (no heartbeat for 45s) — removing");
      extensions.delete(ws);
      extensionHeartbeats.delete(ws);
      // Clean up routing entries
      for (const [rid, ext] of requestToExtension) {
        if (ext === ws) requestToExtension.delete(rid);
      }
      try { ws.close(4002, "Stale — no heartbeat"); } catch {}
    }
  }
}, 15000);

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress || "unknown";
  const origin = req.headers.origin || "null";
  console.log(`[+] client connected from ${ip} origin=${origin}`);

  let role = null; // "extension" | "controller"
  let isRejected = false;

  ws.on("message", (raw, isBinary) => {
    if (isBinary) return; // reject binary frames
    // #8: Ignore all messages from rejected connections
    if (role === "rejected" || isRejected) return;

    // Rate limit check
    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      console.log(`[security] rate limit exceeded (${rl.reason}) from ${ip} — closing connection`);
      isRejected = true;
      ws.close(4008, "Rate limit exceeded");
      return;
    }

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
        if (!isOriginAllowed(origin, "extension")) {
          console.log(`[security] extension origin rejected: ${origin}`);
          isRejected = true;
          ws.close(4003, "Origin not allowed");
          return;
        }
        role = "extension";
        extensions.add(ws);
        console.log(
          `[hello] extension v${msg.payload?.extensionVersion ?? "?"} connected`
        );
        ws.send(JSON.stringify({ type: "hello_ack" }));
        break;
      }

      case "register": {
        // #8: If already rejected, ignore all messages
        if (role === "rejected" || isRejected) return;

        // Origin check for controllers
        if (!isOriginAllowed(origin, "controller")) {
          console.log(`[security] controller origin rejected: ${origin}`);
          isRejected = true;
          role = "rejected";
          ws.send(JSON.stringify({ type: "register_nack", error: "Origin not allowed" }));
          ws.close(4003, "Origin not allowed");
          return;
        }

        // Timestamp / nonce anti-replay check
        if (msg.timestamp) {
          const now = Date.now();
          const ts = Number(msg.timestamp);
          if (Number.isNaN(ts) || Math.abs(now - ts) > 30000) {
            console.log(`[security] register rejected — stale timestamp`);
            isRejected = true;
            role = "rejected";
            ws.send(JSON.stringify({ type: "register_nack", error: "Timestamp too old or invalid" }));
            ws.close(4009, "Stale timestamp");
            return;
          }
        }
        if (msg.nonce) {
          if (recentNonces.has(msg.nonce)) {
            console.log(`[security] register rejected — replayed nonce`);
            isRejected = true;
            role = "rejected";
            ws.send(JSON.stringify({ type: "register_nack", error: "Nonce replay detected" }));
            ws.close(4009, "Replay nonce");
            return;
          }
          recentNonces.add(msg.nonce);
        }

        // AI client registers itself — check auth if token is configured
        if (AUTH_TOKEN) {
          // #7: Reject if connection is not encrypted (ws://)
          const isSecure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
          if (!isSecure) {
            console.log("[register] rejected — unencrypted connection with auth token configured");
            role = "rejected";
            ws.send(JSON.stringify({ type: "register_nack", error: "Unencrypted connection not allowed when auth token is set. Use wss://." }));
            ws.close(4001, "Unauthorized");
            return;
          }

          // #6: Timing-safe token comparison
          const token = msg.token || "";
          const expected = AUTH_TOKEN;
          let tokenMatch = false;
          if (typeof token === "string" && typeof expected === "string" && token.length === expected.length) {
            try {
              tokenMatch = timingSafeEqual(Buffer.from(token), Buffer.from(expected));
            } catch {
              tokenMatch = false;
            }
          }
          if (!tokenMatch) {
            console.log("[register] auth failed — invalid token");
            role = "rejected";
            ws.send(JSON.stringify({ type: "register_nack", error: "Invalid or missing auth token" }));
            ws.close(4001, "Unauthorized");
            return;
          }
        }
        role = "controller";
        controllers.add(ws);
        console.log("[register] controller connected");
        ws.send(JSON.stringify({ type: "register_ack" }));
        break;
      }

      case "pong":
        break;

      case "heartbeat":
        if (role === "extension") {
          extensionHeartbeats.set(ws, Date.now());
        }
        break;

      case "tool_call": {
        // From controller → route to ONE extension (not broadcast)
        const rid = msg.requestId;
        console.log(
          `[tool_call] → ${msg.payload?.name} (req ${rid})`
        );

        // No extensions connected — immediate error
        if (extensions.size === 0) {
          console.log("[tool_call] no extension connected, returning error");
          const errorResult = JSON.stringify({
            type: "tool_result",
            responseToRequestId: rid,
            payload: { error: "No extension connected. Open the extension first." },
          });
          for (const ctrl of controllers) if (ctrl.readyState === ctrl.OPEN) ctrl.send(errorResult);
          break;
        }

        // Route to extension via load-aware picker
        const targetExt = pickExtension();
        if (targetExt) {
          requestToExtension.set(rid, targetExt);
          extActiveRequests.set(targetExt, (extActiveRequests.get(targetExt) || 0) + 1);
          // Forward as TEXT (raw is a Buffer from ws — sending Buffer makes it binary!)
          const rawText = raw.toString();
          targetExt.send(rawText);
          console.log(`[forward→ext] ${msg.payload?.name || msg.type} (req ${rid})`);

          // #11: TTL cleanup for pendingResults — auto-resolve with timeout error
          setTimeout(() => {
            if (requestToExtension.has(rid) && requestToExtension.get(rid) === targetExt) {
              requestToExtension.delete(rid);
              // Also clean up pendingResults if this request was pending
              if (pendingResults.has(rid)) {
                pendingResults.get(rid)({ payload: { error: "timeout (30s)" } });
                pendingResults.delete(rid);
              }
            }
          }, 30000);
        }
        break;
      }

      case "tool_result": {
        // From extension → route to the controller that made the request
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

        // Transparent proxy: forward raw to all controllers (as TEXT)
        const rawText = raw.toString();
        let fwdCount = 0;
        for (const ctrl of controllers) {
          if (ctrl.readyState === ctrl.OPEN) { ctrl.send(rawText); fwdCount++; }
        }
        console.log(`[forward→ctrl×${fwdCount}] tool_result (req ${rid})`);

        // Clean up routing
        const extForReq = requestToExtension.get(rid);
        requestToExtension.delete(rid);
        if (extForReq) {
          const count = (extActiveRequests.get(extForReq) || 0) - 1;
          extActiveRequests.set(extForReq, Math.max(0, count));
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
    extensionHeartbeats.delete(ws);
    extActiveRequests.delete(ws);
    // Clean up routing entries for this extension
    for (const [rid, ext] of requestToExtension) {
      if (ext === ws) requestToExtension.delete(rid);
    }
  });

  ws.on("error", (err) => {
    console.log("[!] ws error:", err.message);
    extensions.delete(ws);
    controllers.delete(ws);
    extensionHeartbeats.delete(ws);
    extActiveRequests.delete(ws);
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

const REPL_ENABLED = process.stdin.isTTY;
let rl;
let reqCounter = 0;

if (REPL_ENABLED) {
  rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "openweb> ",
  });
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
} // if (REPL_ENABLED)

// ── HTTP Health Endpoint ──────────────────────────────────────────────────
const healthServer = createServer((req, res) => {
  if (req.url === "/health") {
    const extLoad = [...extActiveRequests.entries()].map(([ws, count]) => count);
    const body = JSON.stringify({
      status: "ok",
      extensions: extensions.size,
      controllers: controllers.size,
      pendingRequests: requestToExtension.size,
      extensionLoad: extLoad,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});
healthServer.listen(PORT + 1, BIND_HOST || "127.0.0.1", () => {
  console.log(`[health] http://127.0.0.1:${PORT + 1}/health`);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] shutting down gracefully...`);

  // Reject all pending tool calls
  for (const [rid, resolve] of pendingResults) {
    resolve({ payload: { error: `Daemon shutting down (${signal})` } });
  }
  pendingResults.clear();

  // Close all WebSocket connections
  wss.clients.forEach(ws => ws.close(1001, "Server shutting down"));

  // Close servers
  wss.close(() => {
    healthServer.close(() => {
      rl.close();
      process.exit(0);
    });
  });

  // Force exit after 5s if graceful shutdown hangs
  setTimeout(() => {
    console.error("[!] forced exit after timeout");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

console.log(`
╔══════════════════════════════════════════╗
║   OpenWeb — Daemon                       ║
║   Listening on ws://127.0.0.1:${PORT}${PATH}    ║
╚══════════════════════════════════════════╝

Type "help" for commands.
`);
