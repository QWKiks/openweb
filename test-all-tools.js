#!/usr/bin/env node
/**
 * Comprehensive Tool Test Suite for OpenWeb MCP
 *
 * Tests every registered tool through the full pipeline:
 *   test controller → daemon → extension → daemon → test controller
 *
 * Usage:
 *   1. Start daemon: npm start
 *   2. Load extension in Chrome (must be connected)
 *   3. Run: node test-all-tools.js
 *
 * Categories:
 *   A. Global tools     — no tab context needed
 *   B. Page inspection  — snapshot, screenshot, get_text, evaluate
 *   C. Navigation       — navigate, history, scroll, wait
 *   D. Mouse & keyboard   — click, mouse_click, hover, send_keys, key_type
 *   E. Forms            — fill, select, upload
 *   F. Browser control    — viewport, console, cookie, dialog, emulate, session
 *   G. Network          — network, intercept
 *   H. Advanced         — content_script, drag_drop, save_as_pdf, bookmark, extension
 */

import WebSocket from "ws";

const DAEMON_URL = "ws://127.0.0.1:10086/ws";
const TIMEOUT_MS = 15000;

const ANSI = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

let ws;
let reqCounter = 0;
const pending = new Map();
let passCount = 0;
let failCount = 0;
let skipCount = 0;

function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  const color = { ok: ANSI.green, fail: ANSI.red, info: ANSI.cyan, warn: ANSI.yellow, skip: ANSI.gray }[level] || "";
  console.log(`${color}[${ts}] ${msg}${ANSI.reset}`);
}

function pass(name, detail = "") {
  passCount++;
  log("ok", `  ✓ ${name}${detail ? " — " + detail : ""}`);
}

function fail(name, err) {
  failCount++;
  log("fail", `  ✗ ${name}: ${err}`);
}

function skip(name, reason) {
  skipCount++;
  log("skip", `  ⊘ ${name}: ${reason}`);
}

function heading(title) {
  console.log(`\n${ANSI.bold}${title}${ANSI.reset}`);
}

function connectController() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(DAEMON_URL);
    const t = setTimeout(() => reject(new Error("connect timeout")), 5000);

    ws.on("open", () => ws.send(JSON.stringify({ type: "register" })));

    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === "register_ack") { clearTimeout(t); resolve(); return; }
      if (msg.type === "tool_result" && msg.responseToRequestId) {
        const r = pending.get(msg.responseToRequestId);
        if (r) { pending.delete(msg.responseToRequestId); r(msg.payload); }
      }
    });

    ws.on("error", (err) => { clearTimeout(t); reject(err); });
  });
}

function callTool(name, args = {}) {
  return new Promise((resolve, reject) => {
    const requestId = String(++reqCounter);
    const t = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`timeout ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    pending.set(requestId, (payload) => { clearTimeout(t); resolve(payload); });
    ws.send(JSON.stringify({ type: "tool_call", requestId, payload: { name, args } }));
  });
}

async function runTest(name, fn, opts = {}) {
  try {
    const result = await fn();
    if (result && result.error) fail(name, result.error);
    else pass(name, opts.detail || "");
    return result;
  } catch (e) {
    fail(name, e.message);
    return { error: e.message };
  }
}

async function runSkipped(name, reason) {
  skip(name, reason);
  return { skipped: true };
}

// ── Main test suite ─────────────────────────────────────────────────────────
async function main() {
  log("info", `${ANSI.bold}OpenWeb All-Tools Test Suite${ANSI.reset}`);
  log("info", `Daemon: ${DAEMON_URL}`);

  try { await connectController(); }
  catch (e) {
    log("fail", `Cannot connect to daemon: ${e.message}`);
    log("warn", "Run: npm start   (and ensure Chrome extension is loaded)");
    process.exit(1);
  }
  log("ok", "Controller registered");

  // ── Category A: Global tools (no tab needed) ──────────────────────────────
  heading("A. Global Tools (no tab context)");

  const listTabs = await runTest("list_tabs", async () => {
    const r = await callTool("list_tabs");
    if (r.error) return r;
    const tabs = r.data?.tabs ?? r.data;
    if (!Array.isArray(tabs)) return { error: "not an array" };
    return { data: { count: tabs.length } };
  }, { detail: "returns tab list" });

  await runTest("bookmark (list)", async () => {
    const r = await callTool("bookmark", { cmd: "list" });
    return r.error ? r : { data: { ok: true } };
  }, { detail: "lists bookmarks" });

  await runTest("extension (list)", async () => {
    const r = await callTool("extension", { cmd: "list" });
    return r.error ? r : { data: { ok: true } };
  }, { detail: "lists extensions" });

  // ── Category B: Page inspection ────────────────────────────────────────
  heading("B. Page Inspection (needs active tab)");

  // Open a test page first
  let testTabId;
  const navResult = await runTest("navigate (setup)", async () => {
    const r = await callTool("navigate", { url: "https://example.com", newTab: true });
    if (r.error) return r;
    testTabId = r.data?.tabId;
    return { data: { tabId: testTabId } };
  }, { detail: "opened example.com" });

  if (!testTabId) {
    log("fail", "Cannot continue without an active tab — navigate failed");
  } else {
    // Small delay for page load
    await new Promise(r => setTimeout(r, 800));

    await runTest("snapshot", async () => {
      const r = await callTool("snapshot");
      if (r.error) return r;
      const hasTree = r.data?.tree || r.data?.snapshot || typeof r.data === "string";
      return hasTree ? { data: { ok: true } } : { error: "no tree returned" };
    }, { detail: "returns accessibility tree" });

    await runTest("get_text", async () => {
      const r = await callTool("get_text");
      if (r.error) return r;
      const text = typeof r.data === "string" ? r.data : r.data?.text;
      return text && text.length > 0 ? { data: { length: text.length } } : { error: "empty text" };
    }, { detail: "returns page text" });

    await runTest("get_text (structured format)", async () => {
      const r = await callTool("get_text", { format: "structured" });
      if (r.error) return r;
      const data = r.data;
      const ok = data && data.title && data.url && data.html;
      return ok ? { data: { ok: true } } : { error: "invalid structured source response" };
    }, { detail: "returns structured source/metadata" });

    await runTest("evaluate", async () => {
      const r = await callTool("evaluate", { code: "document.title + ' — ' + location.href" });
      if (r.error) return r;
      const val = r.data?.result ?? r.data;
      const str = typeof val === "string" ? val : JSON.stringify(val);
      return str.includes("example.com") ? { data: { result: str } } : { error: `unexpected: ${str}` };
    }, { detail: "JS evaluation works" });

    await runTest("screenshot", async () => {
      const r = await callTool("screenshot");
      if (r.error) return r;
      const b64 = r.data?.data ?? r.data;
      return b64 && b64.length > 100 ? { data: { size: b64.length } } : { error: "empty screenshot" };
    }, { detail: "returns base64 image" });

    // ── Category C: Navigation & scrolling ────────────────────────────────
    heading("C. Navigation & Scrolling");

    await runTest("history (refresh)", async () => {
      const r = await callTool("history", { cmd: "refresh" });
      return r.error ? r : { data: { ok: true } };
    });

    await runTest("scroll", async () => {
      const r = await callTool("scroll", { direction: "bottom" });
      if (r.error) return r;
      await new Promise(r => setTimeout(r, 200));
      const r2 = await callTool("scroll", { direction: "top" });
      return r2.error ? r2 : { data: { ok: true } };
    });

    await runTest("wait (selector)", async () => {
      const r = await callTool("wait", { type: "selector", selector: "body" });
      return r.error ? r : { data: { ok: true } };
    });

    // ── Category D: Mouse & keyboard ────────────────────────────────────
    heading("D. Mouse & Keyboard");

    await runTest("hover", async () => {
      const r = await callTool("hover", { selector: "body" });
      return r.error ? r : { data: { ok: true } };
    });

    await runTest("click (physical)", async () => {
      const r = await callTool("click", { selector: "body", physical: true });
      return r.error ? r : { data: { ok: true } };
    });

    // Navigate to a page with an input for key_type test
    await callTool("navigate", { url: "https://httpbin.org/forms/post" });
    await new Promise(r => setTimeout(r, 1500));

    await runTest("click + fill + key_type", async () => {
      // Use a simple page with inputs (DuckDuckGo search)
      await callTool("navigate", { url: "https://duckduckgo.com", newTab: false });
      await new Promise(r => setTimeout(r, 1500));
      const r1 = await callTool("click", { selector: "#searchbox_input" });
      if (r1.error) {
        // Fallback: try body click
        const r1b = await callTool("click", { selector: "body" });
        if (r1b.error) return { error: `click failed: ${r1b.error}` };
      }
      const r2 = await callTool("fill", { selector: "#searchbox_input", value: "OpenWeb test" });
      if (r2.error) return { error: `fill failed: ${r2.error}` };
      const r3 = await callTool("key_type", { text: "123" });
      if (r3.error) return { error: `key_type failed: ${r3.error}` };
      return { data: { ok: true } };
    }, { detail: "click → fill → type" });

    await runTest("send_keys", async () => {
      const r = await callTool("send_keys", { keys: "Tab" });
      return r.error ? r : { data: { ok: true } };
    });

    // ── Category E: Forms ────────────────────────────────────────────────
    heading("E. Forms");

    await runSkipped("select", "no <select> element on test pages — requires dedicated test page with dropdown");

    await runSkipped("upload", "requires file input interaction — not reliably testable in E2E");

    // ── Category F: Browser control ──────────────────────────────────────
    heading("F. Browser Control");

    await runTest("viewport (get)", async () => {
      const r = await callTool("viewport", { cmd: "get" });
      if (r.error) return r;
      const vp = r.data;
      return vp && (vp.width || vp.viewport?.width) ? { data: vp } : { error: "no viewport data" };
    });

    await runTest("console (list)", async () => {
      const r = await callTool("console", { cmd: "list" });
      return r.error ? r : { data: { ok: true } };
    });

    await runTest("cookie (get)", async () => {
      const r = await callTool("cookie", { cmd: "get" });
      return r.error ? r : { data: { ok: true } };
    });

    await runTest("session (info)", async () => {
      const r = await callTool("session", { cmd: "info" });
      return r.error ? r : { data: { ok: true } };
    });

    await runTest("dialog (auto)", async () => {
      const r = await callTool("dialog", { cmd: "auto" });
      return r.error ? r : { data: { ok: true } };
    });

    await runTest("emulate (reset)", async () => {
      const r = await callTool("emulate", { cmd: "reset" });
      return r.error ? r : { data: { ok: true } };
    });

    // ── Category G: Network ──────────────────────────────────────────────
    heading("G. Network");

    await runTest("network (list)", async () => {
      const r = await callTool("network", { cmd: "list" });
      return r.error ? r : { data: { ok: true } };
    });

    await runTest("intercept (start+stop)", async () => {
      const r1 = await callTool("intercept", { cmd: "start" });
      if (r1.error) return r1;
      await new Promise(r => setTimeout(r, 100));
      const r2 = await callTool("intercept", { cmd: "stop" });
      return r2.error ? r2 : { data: { ok: true } };
    });

    // ── Category H: Advanced ────────────────────────────────────────────
    heading("H. Advanced / Misc");

    await runTest("content_script (evaluate)", async () => {
      // content_script is a fallback for chrome:// pages; test on a safe page
      await callTool("navigate", { url: "https://example.com", newTab: false });
      await new Promise(r => setTimeout(r, 500));
      const r = await callTool("content_script", { action: "evaluate", code: "document.title" });
      if (r.error && r.error.includes("Use CDP tools")) {
        // Expected on normal pages — content_script is fallback only
        return { data: { ok: true, note: "fallback for chrome:// pages" } };
      }
      return r.error ? r : { data: { ok: true } };
    });

    await runTest("drag_drop", async () => {
      // May fail if page has no draggable elements — that's ok
      const r = await callTool("drag_drop", { source: "body", target: "body" });
      return r.error ? r : { data: { ok: true } };
    });

    await runTest("save_as_pdf", async () => {
      const r = await callTool("save_as_pdf", { file_name: "test.pdf" });
      if (r.error) return r;
      const b64 = r.data?.data ?? r.data;
      return b64 && b64.length > 100 ? { data: { size: b64.length } } : { error: "empty PDF" };
    });

    await runTest("find_tab", async () => {
      // After navigating to example.com, search for it
      const r = await callTool("find_tab", { url: "example.com" });
      if (r.error) return r;
      return r.data && (r.data.tabId || r.data.id) ? { data: { found: true } } : { error: "no tab found" };
    });

    // ── Cleanup ─────────────────────────────────────────────────────────
    heading("Cleanup");
    await runTest("close_tab (cleanup)", async () => {
      const r = await callTool("close_tab", { tabId: testTabId });
      return r.error ? r : { data: { ok: true } };
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(50));
  const total = passCount + failCount + skipCount;
  log("ok", `${passCount}/${total} passed`);
  if (failCount) log("fail", `${failCount}/${total} failed`);
  if (skipCount) log("skip", `${skipCount}/${total} skipped`);
  console.log("=".repeat(50));

  ws.close();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  log("fail", `Test runner crashed: ${e.message}`);
  process.exit(1);
});
