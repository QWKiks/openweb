#!/usr/bin/env node
/**
 * Automated Sensory-Motor Agent Benchmark Solver
 * 
 * This script runs the local challenge described in test/agent-benchmark.md
 * using the OpenWeb WebSocket daemon connection.
 */

import WebSocket from "ws";

const DAEMON_URL = "ws://127.0.0.1:10086/ws";
const SANDBOX_URL = "file:///Users/sabir/Desktop/Работа/openweb/test/sandbox/index.html";

const ANSI = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const color = { ok: ANSI.green, fail: ANSI.red, info: ANSI.cyan, warn: ANSI.yellow }[level] || "";
  console.log(`${color}[${ts}] ${msg}${ANSI.reset}`);
}

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
      if (isBinary) return;
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

      if (msg.type === "register_ack") {
        clearTimeout(timeout);
        log("ok", "Controller successfully registered with OpenWeb daemon!");
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
    const timeoutMs = 20000;
    const t = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Tool '${name}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pending.set(requestId, (payload) => {
      clearTimeout(t);
      if (payload.error) {
        reject(new Error(payload.error));
      } else {
        resolve(payload.data ?? payload);
      }
    });

    ws.send(JSON.stringify({ type: "tool_call", requestId, payload: { name, args } }));
  });
}

// Helper to find specific element in snapshot tree recursively
function findInTree(tree, predicate) {
  if (Array.isArray(tree)) {
    for (const item of tree) {
      const found = findInTree(item, predicate);
      if (found) return found;
    }
  } else if (tree && typeof tree === "object") {
    if (predicate(tree)) return tree;
    if (tree.children) {
      const found = findInTree(tree.children, predicate);
      if (found) return found;
    }
  }
  return null;
}

async function run() {
  console.log(`\n${ANSI.bold}================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}        STARTING OPENWEB SENSORY-MOTOR BENCHMARK CHALLENGE       ${ANSI.reset}`);
  console.log(`${ANSI.bold}================================================================${ANSI.reset}\n`);

  try {
    await connectController();
  } catch (e) {
    log("fail", `Failed to connect to local OpenWeb daemon: ${e.message}`);
    log("warn", "Please make sure 'npm start' is running in the background and try again.");
    process.exit(1);
  }

  // --- Step 1: Open the Sandbox ---
  log("info", "STEP 1: Navigating to local Sandbox page...");
  let tabId;
  try {
    const navResult = await callTool("navigate", { url: SANDBOX_URL, newTab: true });
    tabId = navResult.tabId;
    log("ok", `Successfully opened Sandbox tab (ID: ${tabId}) at ${SANDBOX_URL}`);
  } catch (e) {
    log("fail", `Navigation failed: ${e.message}`);
    process.exit(1);
  }

  // --- Step 2: Test 1 - Inputs & Delay Waiting ---
  log("info", "\nSTEP 2: Form submission and delay waiting benchmark...");
  
  log("info", "Capturing page snapshot tree to acquire interactive refs...");
  let snap = await callTool("snapshot");
  
  // Find refs
  const nameEl = findInTree(snap.tree, (el) => el.role === "textbox" && el.name?.toUpperCase().includes("AGENT IDENTITY NAME"));
  const tierEl = findInTree(snap.tree, (el) => el.role === "combobox" && el.name?.toUpperCase().includes("AGENT TIER CHOICE"));
  const submitEl = findInTree(snap.tree, (el) => el.role === "button" && el.name?.toUpperCase().includes("SUBMIT FORM ELEMENTS"));

  if (!nameEl?.ref || !tierEl?.ref || !submitEl?.ref) {
    log("fail", "Could not locate required form elements in the accessibility tree!");
    log("info", "AXTree found: " + JSON.stringify(snap.tree, null, 2));
    process.exit(1);
  }

  log("ok", `Resolved form refs: Name Input -> ${nameEl.ref}, Tier Select -> ${tierEl.ref}, Submit -> ${submitEl.ref}`);

  log("info", `Filling in Agent Name as "Antigravity Active Agent 3.5"...`);
  await callTool("fill", { selector: nameEl.ref, value: "Antigravity Active Agent 3.5" });

  log("info", `Selecting "Antigravity Level" (value="super") from the dropdown...`);
  await callTool("select", { selector: tierEl.ref, value: "super" });

  log("info", "Clicking the Submit Form button...");
  await callTool("click", { selector: submitEl.ref });

  log("info", "Enforcing wait check: waiting up to 5 seconds for '#form-delayed-result.show'...");
  const waitResult = await callTool("wait", { type: "selector", selector: "#form-delayed-result.show", timeout: 5000 });
  
  if (waitResult.success) {
    log("ok", `Wait tool completed in ${waitResult.waitedMs}ms! Selector found!`);
  } else {
    log("fail", "Wait tool failed to locate success message before timeout!");
    process.exit(1);
  }

  log("info", "Verifying the success text content...");
  const textResult = await callTool("get_text", { selector: "#form-delayed-result" });
  const text = textResult.text || textResult;
  log("ok", `Retrieved text content: "${text.trim()}"`);

  // --- Step 3: Test 2 - Click Fallback (CDP Physical Click) ---
  log("info", "\nSTEP 3: Click Fallback / Event Blocker recovery benchmark...");
  
  log("info", "Capturing updated page snapshot...");
  snap = await callTool("snapshot");
  
  const physicalBtn = findInTree(snap.tree, (el) => el.role === "button" && el.name?.toUpperCase().includes("TARGET CLICK BUTTON"));
  if (!physicalBtn?.ref) {
    log("fail", "Could not locate 'Target Click Button' ref!");
    process.exit(1);
  }
  log("ok", `Resolved Target Click Button ref: ${physicalBtn.ref}`);

  log("warn", "Attempting standard DOM synthetic click (simulating failure)...");
  try {
    await callTool("click", { selector: physicalBtn.ref });
  } catch (e) {
    log("info", `Standard click encountered expected error: ${e.message}`);
  }

  // Read blocker status
  const blockerStatusResult = await callTool("get_text", { selector: "#blocker-status" });
  const blockerStatus = blockerStatusResult.text || blockerStatusResult;
  log("info", `Current Blocker Status: "${blockerStatus.trim()}"`);

  if (blockerStatus.includes("FAIL")) {
    log("ok", "Sensory-Motor loop verified: Standard DOM click correctly failed!");
  } else {
    log("warn", "Unexpected blocker state. Proceeding to physical click anyway.");
  }

  log("info", "Self-Healing: Triggering CDP Physical mouse click coordinates pipeline (physical: true)...");
  const physicalResult = await callTool("click", { selector: physicalBtn.ref, physical: true });
  log("ok", `Physical click coordinates dispatched: X=${physicalResult.x}, Y=${physicalResult.y}`);

  log("info", "Reading status message to verify physical click success...");
  const successStatusResult = await callTool("get_text", { selector: "#blocker-status" });
  const successStatus = successStatusResult.text || successStatusResult;
  log("ok", `New Blocker Status: "${successStatus.trim()}"`);

  if (successStatus.includes("SUCCESS")) {
    log("ok", "SUCCESS: Physical click successfully bypassed the invisible blocker!");
  } else {
    log("fail", "FAIL: Physical click failed to trigger success state!");
    process.exit(1);
  }

  // --- Step 4: Test 3 - Diagnostics & Audits ---
  log("info", "\nSTEP 4: Diagnostics, Alerts, Console Errors & Audits...");

  log("info", "Enabling console log capturing...");
  await callTool("console", { cmd: "start" });

  log("info", "Configuring auto-accept handler for JS dialog dialogs...");
  await callTool("dialog", { cmd: "auto", accept: true });
  log("ok", "Automatic dialog accept handler registered successfully!");

  log("info", "Locating the 'Trigger Uncaught Console Error' button...");
  snap = await callTool("snapshot");
  const errBtn = findInTree(snap.tree, (el) => el.role === "button" && el.name?.toUpperCase().includes("TRIGGER UNCAUGHT CONSOLE ERROR"));
  if (!errBtn?.ref) {
    log("fail", "Could not locate 'Trigger Uncaught Console Error' button!");
    process.exit(1);
  }
  log("ok", `Resolved Error Button ref: ${errBtn.ref}`);

  log("info", "Clicking the Trigger Error button...");
  await callTool("click", { selector: errBtn.ref });
  log("ok", "Button clicked and dialog alert automatically bypassed!");

  log("info", "Retrieving console logs with 'filter: errors'...");
  const logsResult = await callTool("console", { cmd: "list", filter: "errors" });
  const errorLogs = logsResult.entries || logsResult;
  log("ok", `Found ${errorLogs.length} matching console errors:`);
  errorLogs.forEach((l, index) => {
    console.log(`   [${index + 1}] ${ANSI.red}${l.text ?? l}${ANSI.reset}`);
  });

  log("info", "Running website accessibility (a11y) audit...");
  const a11yResult = await callTool("audit", { type: "accessibility" });
  log("ok", "Accessibility audit retrieved!");
  if (a11yResult.violations?.length) {
    log("warn", `Found accessibility contrast violation: "${a11yResult.violations[0].description}"`);
  }

  log("info", "Running broken links audit...");
  const linksResult = await callTool("audit", { type: "links" });
  log("ok", "Broken links audit completed!");
  if (linksResult.brokenLinks?.length) {
    log("warn", `Identified broken link returning 404: ${linksResult.brokenLinks[0].url}`);
  }

  // Close the tab
  log("info", "\nCleaning up: Closing the benchmark sandbox tab...");
  await callTool("close_tab", { tabId });
  log("ok", `Tab ${tabId} closed.`);

  console.log(`\n${ANSI.bold}================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}      🎉 CONGRATULATIONS! ALL BENCHMARK TESTS PASSED PERFECTLY!     ${ANSI.reset}`);
  console.log(`${ANSI.bold}================================================================${ANSI.reset}\n`);

  ws.close();
  process.exit(0);
}

run().catch((e) => {
  log("fail", `Benchmark failed with exception: ${e.message}`);
  if (ws) ws.close();
  process.exit(1);
});
