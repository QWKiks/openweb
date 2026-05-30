#!/usr/bin/env node
   
                                                         
   
                                                       
                                           
                                         
                                                 
                                                    
   

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
      if (isBinary) return;
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

      if (msg.type === "register_ack") {
        clearTimeout(timeout);
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

async function main() {
  console.log(`\n${ANSI.bold}================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}        STARTING E2E TEST FOR PHASE 5 ADVANCED INNOVATIONS      ${ANSI.reset}`);
  console.log(`${ANSI.bold}================================================================${ANSI.reset}\n`);

  try {
    await connectController();
    pass("Controller registered with background daemon");
  } catch (e) {
    fail("Connect to daemon", e.message);
    process.exit(1);
  }

  let tabId;
  try {
    const navResult = await callTool("navigate", { url: SANDBOX_URL, newTab: true });
    tabId = navResult.tabId;
    pass(`Opened Sandbox tab (ID: ${tabId})`);
  } catch (e) {
    fail("Navigate to sandbox", e.message);
    ws.close();
    process.exit(1);
  }

  

  try {
    log("info", "Testing get_element_bounds (Visual Grounding)...");
    const bounds = await callTool("get_element_bounds");
    
    if (bounds.elements && Array.isArray(bounds.elements) && bounds.elements.length > 0) {
      pass(`get_element_bounds successfully found ${bounds.elements.length} visible interactive elements.`);
      const first = bounds.elements[0];
      log("info", `  First element located: Tag=${first.tag}, Name="${first.name}", Selector="${first.selector}", Center=(${first.x}, ${first.y})`);
      
      if (first.x > 0 && first.y > 0 && first.width > 0 && first.height > 0) {
        pass("Interactive element contains valid bounds coordinates!");
      } else {
        fail("Interactive bounds coordinates check", "Coordinates contain zero or invalid center values");
      }
    } else {
      fail("get_element_bounds check", "No elements returned in list");
    }
  } catch (e) {
    fail("get_element_bounds tool execution", e.message);
  }

  

  try {
    log("info", "Testing get_markdown (Reader Mode Extractor)...");
    const result = await callTool("get_markdown", { selector: "#card-form" });
    
    if (result.success && result.markdown) {
      pass("get_markdown successfully converted DOM element to Markdown!");
      if (result.markdown.includes("Standard Inputs & Wait Timing")) {
        pass("Markdown content matches correct text layout semantics!");
      } else {
        fail("Markdown content match", "Generated Markdown missing required text titles");
      }
    } else {
      fail("get_markdown check", "Returned result missing Markdown content");
    }
  } catch (e) {
    fail("get_markdown tool execution", e.message);
  }

  

  try {
    log("info", "Testing humanize (Emulated mouse cursor Bezier curve movement)...");
    const moveResult = await callTool("humanize", {
      cmd: "mouse_move",
      selector: "#btn-submit-form",
      click: false,
      steps: 10
    });
    
    if (moveResult.success) {
      pass(`humanize mouse_move ended successfully at X=${moveResult.endX}, Y=${moveResult.endY}.`);
    } else {
      fail("humanize mouse_move", "Returned failure status");
    }

    log("info", "Testing humanize (Natural keystroke typist)...");
    const typeResult = await callTool("humanize", {
      cmd: "type",
      selector: "#agent-name",
      text: "Elite Typist",
      delayMin: 15,
      delayMax: 40
    });

    if (typeResult.success && typeResult.length === 12) {
      pass(`humanize type completed successfully typing ${typeResult.length} characters.`);
      
      

      const getValResult = await callTool("evaluate", {
        code: `document.getElementById('agent-name').value`
      });
      const val = getValResult.result?.value || getValResult;
      
      if (val === "Elite Typist") {
        pass("Input field contains exact humanized typed value!");
      } else {
        fail("Typed value verification", `Expected 'Elite Typist', got: '${val}'`);
      }
    } else {
      fail("humanize type check", "Returned failure status or unexpected length");
    }
  } catch (e) {
    fail("humanize tool execution", e.message);
  }

  

  try {
    log("info", "Testing session_manager (Save & Restore Authentication)...");
    
    

    await callTool("evaluate", {
      code: `(() => {
        localStorage.setItem("mcpToken", "agentSecretToken123");
        sessionStorage.setItem("mcpSession", "activeSessionXYZ");
      })()`
    });
    pass("Injected mock session storage state");

    

    const saveResult = await callTool("session_manager", { cmd: "save" });
    
    if (saveResult.success && saveResult.session) {
      pass("session_manager save completed successfully.");
      
      const { cookies, localStorage: ls, sessionStorage: ss } = saveResult.session;
      if (ls.mcpToken === "agentSecretToken123" && ss.mcpSession === "activeSessionXYZ") {
        pass("Storage keys were successfully serialized in saved context!");
      } else {
        fail("Storage serialization verification", "Saved context does not match injected state");
      }

      

      await callTool("evaluate", {
        code: `(() => {
          localStorage.clear();
          sessionStorage.clear();
        })()`
      });
      pass("Cleared storage elements (simulating fresh browser launch)");

      

      log("info", "Restoring session states via session_manager load...");
      const loadResult = await callTool("session_manager", {
        cmd: "load",
        session: saveResult.session
      });

      if (loadResult.success) {
        pass("session_manager load completed successfully and page reloaded.");
        
        

        await new Promise(r => setTimeout(r, 1000));

        

        const checkResult = await callTool("evaluate", {
          code: `JSON.stringify({
            token: localStorage.getItem("mcpToken"),
            session: sessionStorage.getItem("mcpSession")
          })`
        });
        const storageVal = JSON.parse(checkResult.result?.value || checkResult);
        
        if (storageVal.token === "agentSecretToken123" && storageVal.session === "activeSessionXYZ") {
          pass("SUCCESS: LocalStorage and SessionStorage context perfectly restored!");
        } else {
          fail("Context restoration verification", "Restored keys do not match initial state: " + JSON.stringify(storageVal));
        }
      } else {
        fail("session_manager load", "Returned failure status");
      }
    } else {
      fail("session_manager save check", "Returned failure status or missing session data");
    }
  } catch (e) {
    fail("session_manager tool execution", e.message);
  }

  

  log("info", "Closing the test sandbox tab...");
  await callTool("close_tab", { tabId });
  pass("Tab closed.");

  console.log(`\n${ANSI.bold}================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}                      E2E TEST RESULT SUMMARY                   ${ANSI.reset}`);
  console.log(`${ANSI.bold}================================================================${ANSI.reset}`);
  
  if (process.exitCode) {
    log("fail", "Some test modules failed! Check daemon logs and stack traces.");
  } else {
    log("ok", "All four state-of-the-art tools passed E2E tests successfully! Compliance verified.");
  }
  
  ws.close();
  process.exit(process.exitCode || 0);
}

main().catch(e => {
  fail("Test suite runner crashed", e.message);
  if (ws) ws.close();
  process.exit(1);
});
