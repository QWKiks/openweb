/**
 * Structured Logger for OpenWeb
 *
 * Usage:
 *   import { log, debug, metrics } from "./logger.js";
 *   log.info("message", { key: "value" });
 *   debug("ws")("received message");
 *   metrics.record("tool_call", { name: "navigate", duration: 120 });
 *
 * Environment:
 *   DEBUG=*          — enable all debug logs
 *   DEBUG=ws,mcp     — enable specific namespaces
 *   LOG_FORMAT=json  — output structured JSON (default: pretty)
 */

const isDebugEnabled = (() => {
  const debugEnv = process.env.DEBUG || "";
  if (debugEnv === "*" || debugEnv === "true") return () => true;
  const namespaces = debugEnv.split(",").map(s => s.trim()).filter(Boolean);
  if (namespaces.length === 0) return () => false;
  return (ns) => namespaces.includes(ns);
})();

const JSON_FORMAT = process.env.LOG_FORMAT === "json";

function toJSON(level, msg, meta = {}) {
  return JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...meta,
  });
}

function toPretty(level, msg, meta = {}) {
  const ts = new Date().toISOString().slice(11, 23);
  const colors = {
    debug: "\x1b[36m",
    info: "\x1b[32m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
    reset: "\x1b[0m",
  };
  const color = colors[level] || "";
  const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
  return `${color}[${ts}] ${msg}${metaStr}${colors.reset}`;
}

function output(level, msg, meta) {
  const line = JSON_FORMAT ? toJSON(level, msg, meta) : toPretty(level, msg, meta);
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(line + "\n");
}

export const log = {
  debug: (msg, meta) => output("debug", msg, meta),
  info: (msg, meta) => output("info", msg, meta),
  warn: (msg, meta) => output("warn", msg, meta),
  error: (msg, meta) => output("error", msg, meta),
};

export function debug(namespace) {
  const enabled = isDebugEnabled(namespace);
  return (msg, meta = {}) => {
    if (enabled) log.debug(`[${namespace}] ${msg}`, meta);
  };
}

// ── Metrics ─────────────────────────────────────────────────────────────────

const metricStore = new Map();

export const metrics = {
  record(name, data) {
    if (!metricStore.has(name)) metricStore.set(name, []);
    metricStore.get(name).push({ time: Date.now(), ...data });
  },
  get(name) {
    return metricStore.get(name) || [];
  },
  summary() {
    const result = {};
    for (const [name, entries] of metricStore) {
      if (entries.length === 0) continue;
      const durations = entries.map(e => e.duration).filter(d => d != null);
      result[name] = {
        count: entries.length,
        avgDuration: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
        last: entries[entries.length - 1],
      };
    }
    return result;
  },
  reset() {
    metricStore.clear();
  },
};
