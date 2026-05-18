/**
 * OpenWeb Recorder — record & replay tool calls
 *
 * Record:  export RECORDING=1 npm start
 * Replay:  node replay.js recording-2026-05-18.jsonl
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const RECORDING = process.env.RECORDING === "1" || process.env.RECORDING === "true";
const RECORD_DIR = process.env.RECORD_DIR || ".";

let sessionFile = null;
let recordCount = 0;

export function isRecording() {
  return RECORDING;
}

export function startSession() {
  if (!RECORDING) return;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  sessionFile = join(RECORD_DIR, `recording-${ts}.jsonl`);
  recordCount = 0;
  console.log(`[recorder] started: ${sessionFile}`);
}

export function recordToolCall(msg) {
  if (!RECORDING || !sessionFile) return;
  const entry = {
    t: Date.now(),
    type: "tool_call",
    name: msg.payload?.name,
    args: msg.payload?.args,
  };
  appendFileSync(sessionFile, JSON.stringify(entry) + "\n");
  recordCount++;
}

export function recordToolResult(msg) {
  if (!RECORDING || !sessionFile) return;
  const entry = {
    t: Date.now(),
    type: "tool_result",
    name: msg.payload?.name,
    result: msg.payload?.data ?? msg.payload?.error,
    error: !!msg.payload?.error,
  };
  appendFileSync(sessionFile, JSON.stringify(entry) + "\n");
}

export function stopSession() {
  if (!RECORDING || !sessionFile) return;
  console.log(`[recorder] stopped: ${recordCount} calls recorded → ${sessionFile}`);
  sessionFile = null;
}
