#!/usr/bin/env node
/**
 * End-to-End Test for OpenWeb MCP Pipeline
 *
 * Tests the full flow: test client → daemon → extension → daemon → test client
 *
 * Usage:
 *   1. Start daemon: npm start (in another terminal)
 *   2. Load extension in Chrome (must be connected)
 *   3. Run: node test-e2e.js
 *
 * Tests:
 *   - Daemon accepts controller connections
 *   - Extension is connected to daemon
 *   - tool_call is forwarded to extension as TEXT (not binary)
 *   - Extension responds with tool_result
 *   - Daemon forwards result back to controller as TEXT
 */

import WebSocket from "ws";

const DAEMON_URL = "ws://127.0.0.1:10086/ws";
const TIMEOUT_MS = 10000;

const ANSI = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  const color = { ok: ANSI.green, fail: ANSI.red, info: ANSI.cyan, warn: ANSI.yellow }[level] || "";
  console.log(`${color}[${ts}] ${msg}${ANSI.reset}`);
}

function pass(name) { log("ok", `✓ ${name}`); }
function fail(name, err) { log("fail", `✗ ${name}: ${err}`); process.exitCode = 1; }

let ws;
let reqCounter = 0;
const pending = new Map();

function connectController() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(DAEMON_URL);
    const timeout = setTimeout(() => reject(new Error("connect timeout")), 5000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "register" }));
    });

    ws.on("message", (raw, isBinary) => {
      // Test: verify daemon sends TEXT frames (not binary)
      if (isBinary) {
        fail("daemon should send text frames", `received binary frame of ${raw.length} bytes`);
        return;
      }
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) {
        fail("daemon sent valid JSON", e.message);
        return;
      }

      if (msg.type === "register_ack") {
        clearTimeout(timeout);
        pass("controller registration");
        resolve();
        return;
      }

      if (msg.type === "tool_result" && msg.responseToRequestId) {
        const resolver = pending.get(msg.responseToRequestId);
        if (resolver) {
          pending.delete(msg.responseToRequestId);
          resolver(msg.payload);
        }
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function callTool(name, args = {}) {
  return new Promise((resolve, reject) => {
    const requestId = String(++reqCounter);
    const timeoutMs = TIMEOUT_MS;
    const t = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`tool '${name}' timeout after ${timeoutMs}ms — extension didn't respond`));
    }, timeoutMs);

    pending.set(requestId, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });

    ws.send(JSON.stringify({ type: "tool_call", requestId, payload: { name, args } }));
  });
}

async function main() {
  log("info", `${ANSI.bold}OpenWeb End-to-End Test${ANSI.reset}`);
  log("info", `Daemon: ${DAEMON_URL}`);

  // Test 1: Connect to daemon
  try {
    await connectController();
  } catch (e) {
    fail("connect to daemon", e.message);
    log("warn", "Is the daemon running? Run: npm start");
    process.exit(1);
  }

  // Test 2: list_tabs (global tool, no tab context needed)
  try {
    const result = await callTool("list_tabs");
    if (result.error) {
      fail("list_tabs", result.error);
    } else {
      const tabs = result.data?.tabs ?? result.data;
      if (Array.isArray(tabs)) {
        pass(`list_tabs returned ${tabs.length} tabs`);
      } else {
        fail("list_tabs", `unexpected shape: ${JSON.stringify(result).slice(0, 100)}`);
      }
    }
  } catch (e) {
    fail("list_tabs", e.message);
    log("warn", "Is the Chrome extension loaded and connected to the daemon?");
  }

  // Test 3: navigate (most common tool)
  try {
    const result = await callTool("navigate", { url: "https://example.com", newTab: true });
    if (result.error) {
      fail("navigate", result.error);
    } else {
      pass(`navigate to example.com (tabId: ${result.data?.tabId})`);
      // Close the tab we just opened
      if (result.data?.tabId) {
        await callTool("close_tab", { tabId: result.data.tabId });
        pass(`close_tab ${result.data.tabId}`);
      }
    }
  } catch (e) {
    fail("navigate", e.message);
  }

  // Test 4: Unknown tool — should return error from extension
  try {
    const result = await callTool("nonexistent_tool_xyz");
    if (result.error && result.error.includes("Unknown tool")) {
      pass("unknown tool returns proper error");
    } else {
      fail("unknown tool error", `unexpected response: ${JSON.stringify(result).slice(0, 100)}`);
    }
  } catch (e) {
    fail("unknown tool error", e.message);
  }

  log("info", `\n${ANSI.bold}Summary${ANSI.reset}`);
  if (process.exitCode) {
    log("fail", "Some tests FAILED — check daemon logs and Service Worker console");
  } else {
    log("ok", "All tests PASSED — pipeline is working");
  }

  ws.close();
  process.exit(process.exitCode || 0);
}

main().catch((e) => {
  fail("test runner", e.message);
  process.exit(1);
});
