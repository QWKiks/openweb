#!/usr/bin/env node
   
                                                       
  
         
                                                      
                                                   
                                                                           
   

import { readFileSync } from "fs";
import { WebSocket } from "ws";

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const DAEMON_URL = "ws://127.0.0.1:10086/ws";

if (!file) {
  console.error("Usage: node replay.js <recording.jsonl> [--dry-run]");
  process.exit(1);
}

const lines = readFileSync(file, "utf-8").trim().split("\n");
const entries = lines.map((l) => JSON.parse(l));
const calls = entries.filter((e) => e.type === "tool_call");

console.log(`\n  OpenWeb Replay: ${file}`);
console.log(`  ${calls.length} tool calls recorded\n`);

if (dryRun) {
  for (const call of calls) {
    console.log(`  → ${call.name}(${JSON.stringify(call.args).slice(0, 100)})`);
  }
  console.log(`\n  (dry-run — no actions taken)\n`);
  process.exit(0);
}

const ws = new WebSocket(DAEMON_URL);
let reqCounter = 0;

ws.on("open", () => {
  

  ws.send(JSON.stringify({ type: "register", timestamp: Date.now(), nonce: `replay-${Date.now()}` }));

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "register_ack") {
      console.log("  Connected to daemon, starting replay...\n");
      replayNext(0);
    }
    if (msg.type === "tool_result") {
      const data = msg.payload?.data ?? msg.payload?.error;
      const err = msg.payload?.error;
      console.log(`  ${err ? "✗" : "✓"} ${err || "OK"}: ${JSON.stringify(data).slice(0, 120)}`);
      

      const nextIdx = calls.findIndex((c) => c._replayIdx !== undefined) ;
      replayNext(currentIdx + 1);
    }
  });
});

let currentIdx = 0;

function replayNext(idx) {
  currentIdx = idx;
  if (idx >= calls.length) {
    console.log(`\n  Replay complete: ${calls.length} calls executed\n`);
    ws.close();
    process.exit(0);
    return;
  }
  const call = calls[idx];
  const rid = String(++reqCounter);
  console.log(`  [${idx + 1}/${calls.length}] → ${call.name}(${JSON.stringify(call.args).slice(0, 80)})`);
  ws.send(
    JSON.stringify({
      type: "tool_call",
      requestId: rid,
      payload: { name: call.name, args: call.args },
    })
  );
}

ws.on("error", (e) => {
  console.error(`  Error: ${e.message}`);
  console.error("  Is the daemon running? npm start");
  process.exit(1);
});

setTimeout(() => {
  if (ws.readyState !== ws.OPEN) {
    console.error("  Timeout connecting to daemon");
    process.exit(1);
  }
}, 5000);
