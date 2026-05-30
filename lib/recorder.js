import { existsSync, readFileSync, writeFileSync, mkdirSync, createWriteStream } from "fs";
import { join } from "path";

const RECORDING = process.env.RECORDING === "1" || process.env.RECORDING === "true";
const RECORD_DIR = process.env.RECORD_DIR || ".";

let sessionFile = null;
let recordCount = 0;
let writeStream = null;

export function isRecording() {
  return RECORDING;
}

export function startSession() {
  if (!RECORDING) return;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  sessionFile = join(RECORD_DIR, `recording-${ts}.jsonl`);
  recordCount = 0;
  writeStream = createWriteStream(sessionFile, { flags: 'a' });
  console.log(`[recorder] started: ${sessionFile}`);
}

export function recordToolCall(msg) {
  if (!RECORDING || !sessionFile || !writeStream) return;
  const entry = {
    t: Date.now(),
    type: "tool_call",
    name: msg.payload?.name,
    args: msg.payload?.args,
  };
  writeStream.write(JSON.stringify(entry) + "\n");
  recordCount++;
}

export function recordToolResult(msg) {
  if (!RECORDING || !sessionFile || !writeStream) return;
  const entry = {
    t: Date.now(),
    type: "tool_result",
    name: msg.payload?.name,
    result: msg.payload?.data ?? msg.payload?.error,
    error: !!msg.payload?.error,
  };
  writeStream.write(JSON.stringify(entry) + "\n");
}

export function stopSession() {
  if (!RECORDING || !sessionFile || !writeStream) return;
  writeStream.end();
  console.log(`[recorder] stopped: ${recordCount} calls recorded → ${sessionFile}`);
  writeStream = null;
  sessionFile = null;
}
