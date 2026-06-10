import "dotenv/config";
import { randomUUID, randomBytes } from "node:crypto";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema, CallToolRequestSchema,
  ListResourcesRequestSchema, ReadResourceRequestSchema,
  ListPromptsRequestSchema, GetPromptRequestSchema,
  SubscribeRequestSchema,
  ListResourceTemplatesRequestSchema,
  CompleteRequestSchema,
  SetLevelRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import WebSocket from "ws";
import { appendFileSync, writeFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir, userInfo } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTIONS_DIR = join(__dirname, "transcriptions");

let username = "default";
try { username = userInfo().username; } catch {}
const STARTUP_LOG_PATH = join(tmpdir(), `openweb-mcp-startup-${username}.log`);

function startupLog(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`;
  try { appendFileSync(STARTUP_LOG_PATH, line); } catch { }
}
startupLog('MCP server starting...');
process.on('uncaughtException', (err) => { startupLog('UNCAUGHT EXCEPTION:', err.message, err.stack); throw err; });
process.on('unhandledRejection', (err) => { startupLog('UNHANDLED REJECTION:', err); });

const DAEMON_URL = process.env.OPENWEB_WS_URL || "ws://127.0.0.1:10086/ws";
const DEBUG = process.env.OPENWEB_DEBUG === "1" || process.env.OPENWEB_DEBUG === "true";

let currentLogLevel = "info";

async function mcpLog(level, ...args) {
  if (level === "debug" && !DEBUG) return;
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  try {
    if (typeof server !== "undefined" && server) {
      await server.sendLoggingMessage({ level, logger: "openweb", data: { message } });
    }
  } catch {
    console.error(`[mcp:${level}]`, message);
  }
}

function log(level, ...args) {
  mcpLog(level, ...args).catch(() => {});
  if (level === "error" || DEBUG) {
    console.error(`[mcp:${level}] ${new Date().toISOString()}`, ...args);
  }
}

function logDebug(...args) {
  log("debug", ...args);
}

function logInfo(...args) {
  log("info", ...args);
}

function logError(...args) {
  log("error", ...args);
}

import { TOOLS } from './tools.js';

const READ_ONLY_TOOLS = new Set([
  "snapshot", "screenshot", "get_markdown", "get_text", "get_element_bounds",
  "list_tabs", "evaluate", "find_by_text", "find_tab", "wait", "wait_stale",
  "history", "audit", "security_scan", "coverage",
  "shadow_dom", "iframe_list", "dom_mutations", "service_worker",
  "swagger_parser", "color_palette", "bookmark", "extension",
  "console", "design_clone", "responsive_test", "discover_tools",
  "extract_page",
]);

const DESTRUCTIVE_TOOLS = new Set([
  "close_tab", "dismiss_overlay",
]);

const IDEMPOTENT_TOOLS = new Set([
  "navigate", "snapshot", "screenshot", "get_markdown", "get_text",
  "get_element_bounds", "hover", "scroll", "wait", "wait_stale",
  "save_as_pdf", "send_keys", "select", "dismiss_overlay", "find_by_text",
  "find_tab", "history", "dialog", "emulate",
  "drag_drop", "form_fill", "extract_page", "click_and_verify",
  "select_autocomplete",
]);

const OPEN_WORLD_TOOLS = new Set([
  "navigate", "click", "fill", "humanize", "upload",
  "network", "speech_to_text", "translate", "security_scan",
  "extract_page", "click_and_verify",
  "select_autocomplete",
]);

for (const tool of TOOLS) {
  const annotations = {};
  if (READ_ONLY_TOOLS.has(tool.name)) annotations.readOnlyHint = true;
  if (DESTRUCTIVE_TOOLS.has(tool.name)) annotations.destructiveHint = true;
  if (IDEMPOTENT_TOOLS.has(tool.name)) annotations.idempotentHint = true;
  if (OPEN_WORLD_TOOLS.has(tool.name)) annotations.openWorldHint = true;
  if (Object.keys(annotations).length > 0) tool.annotations = annotations;
}

const NEXT_STEP_HINTS = {
  navigate: "On timeout, the page may still be loading. Retry with waitUntil: 'DOMContentLoaded'.",
  snapshot: "If @e refs are stale (element not found), call snapshot again first, then retry.",
  wait: "On timeout, check 'reason' field in response to understand what was still pending. For network_idle, 'pendingResources' shows remaining loading elements.",
  click: "If selector fails, the element may not be interactive yet. Call snapshot to verify it exists, then retry.",
  fill: "If fill fails on a complex input, try humanize(text: value, selector: selector) instead. If 'comboboxDetected: true' is returned, use select_autocomplete() for proper autocomplete interaction.",
  screenshot: "If the page is blank, wait for navigation to complete first (wait(type: 'network_idle')).",
  evaluate: "Wrap your code in try/catch and return the error as a value.",
  close_tab: "Closing the last tab is safe — the window remains open but empty.",
  send_keys: "Ensure the target element is focused first (click it), then retry.",
  select: "Use the visible option text, not the value attribute, for best matching.",
  hover: "If the element is overlapped, scroll it into view first.",
  get_text: "For structured content prefer get_markdown. For raw DOM use format: 'html'.",
  get_markdown: "If extraction yields empty result, the page may need JavaScript rendering. Try navigate first.",
  network: "Use cmd: 'start' before navigation to catch all requests. Use cmd: 'history' to browse past requests without prior setup. Use cmd: 'list' to view captured.",
  speech_to_text: "Requires a local Whisper server at http://127.0.0.1:5001 or a yt-dlp binary.",
  translate: "Uses local Whisper for translation. Ensure the server is running.",
  security_scan: "May take 30-60 seconds. Set a generous timeout in your client.",
  audit: "Run after the page is fully loaded for complete results.",
  discover_tools: "Call with no arguments to list all categories.",
  select_autocomplete: "If the dropdown doesn't appear, increase 'delay' (150-300). If the wrong item is selected, use 'selectValue' to match specific text. For combo-boxes that require Enter after selection, follow with send_keys({keys: 'Enter'}).",
};

function errorResult(text, nextStep) {
  const content = { type: "text", text };
  if (nextStep) content.nextStep = nextStep;
  return { content: [content], isError: true };
}

function successResult(text, structured) {
  const result = { content: [{ type: "text", text }] };
  if (structured !== undefined) result.structuredContent = structured;
  return result;
}

const SESSION_TOOLS = ["state"];
const NETWORK_TOOLS = ["network"];
const DIAGNOSTICS_TOOLS = ["console", "dialog", "emulate", "scroll", "wait", "drag_drop", "design_clone", "dom_mutations", "history"];
const AUDITS_TOOLS = ["audit", "security_scan", "coverage"];
const ADVANCED_TOOLS = ["get_element_bounds", "humanize", "send_keys", "evaluate", "list_tabs", "close_tab", "hover", "select", "get_text", "save_as_pdf", "upload", "bookmark", "extension", "speech_to_text", "translate", "shadow_dom", "iframe_list", "service_worker", "swagger_parser", "color_palette", "form_fill", "dismiss_overlay", "wait_stale", "find_by_text", "find_tab", "select_autocomplete", "solve_captcha"];

const CORE_TOOL_NAMES = new Set([
  "navigate", "navigate_smart", "snapshot", "screenshot", "click", "fill",
  "send_keys", "evaluate", "list_tabs", "close_tab", "network",
  "hover", "select", "get_text", "get_markdown", "get_element_bounds",
  "humanize", "state", "console", "dialog", "emulate",
  "scroll", "wait", "save_as_pdf", "upload", "find_tab",
]);

let ws = null;
const pendingCalls = new Map();
const idempotencyCache = new Map();
let reconnectTimer = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

function scheduleReconnect() {
  if (reconnectTimer) return
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  console.error(`[mcp] reconnecting to daemon in ${delay}ms...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToDaemon().catch(() => { });
  }, delay);
}

function resetReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectDelay = 1000;
}

function connectToDaemon() {
  return new Promise((resolve, reject) => {
    logInfo("Connecting to daemon at", DAEMON_URL);
    logDebug("DEBUG mode enabled");

    ws = new WebSocket(DAEMON_URL);

    const timeout = setTimeout(() => {
      logError("Connection timeout (5s) to", DAEMON_URL);
      if (ws) ws.close();
      reject(new Error("Connection timeout (5s)"));
    }, 5000);

    ws.on("open", () => {
      clearTimeout(timeout);
      logInfo("WebSocket connected to daemon");
      resetReconnect();
      const registerMsg = { type: "register", timestamp: Date.now() };
      registerMsg.nonce = randomBytes(16).toString('hex');
      const token = process.env.OPENWEB_TOKEN;
      if (token) {
        registerMsg.token = token;
        logDebug("Using auth token for registration");
      }
      logDebug("Sending register message", { nonce: registerMsg.nonce });
      ws.send(JSON.stringify(registerMsg));
      resolve();
    });

    ws.on("message", (raw, isBinary) => {
      logDebug("Received message from daemon", { isBinary, length: raw.length });

      if (isBinary) {
        if (raw.length < 4) {
          logError("Invalid binary frame: too short", raw.length);
          return;
        }
        const reqId = raw.readUInt32LE(0);
        logDebug("Binary frame for request", reqId);
        const resolver = pendingCalls.get(String(reqId));
        if (resolver) {
          pendingCalls.delete(String(reqId));
          resolver({ data: raw.slice(4), binary: true });
        } else {
          logError("No resolver for binary request", reqId);
        }
        return;
      }

      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        logError("Failed to parse message from daemon", e.message);
        return;
      }

      logDebug("Parsed message from daemon", msg.type);

      if (msg.type === "ping") {
        logDebug("Received ping, sending pong");
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (msg.type === "page_changed") {
        if (subscribers.has("openweb://status")) {
          server.notification({
            method: "notifications/resources/updated",
            params: { uri: "openweb://status" }
          }).catch(() => {});
        }
        return;
      }

      if (msg.type === "register_nack") {
        logError("Registration failed", msg.error);
        reject(new Error(msg.error || "Auth failed"));
        return;
      }

      if (msg.type === "tool_result" && msg.responseToRequestId) {
        logDebug("Tool result for request", msg.responseToRequestId);
        const resolver = pendingCalls.get(msg.responseToRequestId);
        if (resolver) {
          pendingCalls.delete(msg.responseToRequestId);
          resolver(msg.payload);
        } else {
          logError("No resolver for tool result", msg.responseToRequestId);
        }
      }
    });

    ws.on("close", () => {
      logError("WebSocket connection closed");
      ws = null;
      for (const [id, resolver] of pendingCalls) {
        logDebug("Rejecting pending call", id);
        pendingCalls.delete(id);
        resolver({ error: "WebSocket disconnected" });
      }
      scheduleReconnect();
    });

    ws.on("error", (err) => {
      logError("WebSocket error", err.message);
      reject(err);
    });
  });
}

function sendToolCall(name, args, progressToken) {
  return new Promise(async (resolve) => {
    logInfo("Tool call requested", name);
    logDebug("Tool args", args);

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      logError("WebSocket not connected, state:", ws?.readyState);
      try {
        logInfo("Attempting to connect to daemon...");
        await connectToDaemon();
      } catch (e) {
        logError("Failed to connect to daemon", e.message);
        resolve({ error: `Cannot connect to daemon: ${e.message}. Make sure daemon.js is running.` });
        return;
      }
    }

    

    const toolArgs = { ...args };
    const idempotencyKey = toolArgs.idempotencyKey;
    delete toolArgs.idempotencyKey;

    const requestId = randomUUID();
    logInfo("Sending tool call", { name, requestId });

    

    const TOOL_TIMEOUTS = {
      speech_to_text: 120000,
      translate: 120000,
      security_scan: 60000,
      audit: 60000,
      design_clone: 60000,
      screenshot: 30000,
      save_as_pdf: 30000,
      network: 30000,
    };
    const DEFAULT_TIMEOUT = 15000;
    const toolTimeout = TOOL_TIMEOUTS[name] || DEFAULT_TIMEOUT;

    const DESTRUCTIVE_TOOL_SET = new Set(["close_tab", "dismiss_overlay"]);

    

    let progressInterval = null;
    if (progressToken && TOOL_TIMEOUTS[name]) {
      let elapsed = 0;
      progressInterval = setInterval(() => {
        elapsed += 5000;
        server.notification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: Math.min(elapsed / toolTimeout, 0.9),
            total: 1,
            message: `${name} in progress (${Math.round(elapsed / 1000)}s)`,
          },
        }).catch(() => {});
      }, 5000);
    }

    const timeout = setTimeout(() => {
      if (progressInterval) clearInterval(progressInterval);
      pendingCalls.delete(requestId);
      logError("Tool call timeout", { name, requestId, timeoutMs: toolTimeout });
      const isDestructive = DESTRUCTIVE_TOOL_SET.has(name);
      resolve({
        error: `Tool call timed out (${toolTimeout / 1000}s): ${name}`,
        isRetrySafe: !isDestructive,
      });
    }, toolTimeout);

    pendingCalls.set(requestId, (payload) => {
      clearTimeout(timeout);
      if (progressInterval) clearInterval(progressInterval);
      if (payload?.error) {
        logError("Tool call returned error", { name, requestId, error: payload.error });
      } else {
        logInfo("Tool call succeeded", { name, requestId });
      }
      resolve(payload);
    });

    try {
      ws.send(
        JSON.stringify({
          type: "tool_call",
          requestId,
          payload: { name, args: toolArgs },
        })
      );
      logDebug("Message sent to daemon", { requestId, name });
    } catch (e) {
      logError("Failed to send message to daemon", e.message);
      clearTimeout(timeout);
      if (progressInterval) clearInterval(progressInterval);
      pendingCalls.delete(requestId);
      resolve({ error: `Failed to send to daemon: ${e.message}` });
    }
  });
}

async function detectVideoUrl(args) {
  if (args.videoUrl) return args.videoUrl;

  logInfo("No video URL provided, attempting to auto-detect from page");
  const evalResult = await sendToolCall("evaluate", {
    tabId: args.tabId,
    code: `(function() {
      const video = document.querySelector('video');
      if (!video) return { error: 'No video element found on page' };

      const sources = Array.from(video.querySelectorAll('source'))
        .map(s => s.src).filter(Boolean);
      const directUrl = video.currentSrc || video.src;

      let mediaUrls = [];
      const scripts = document.querySelectorAll('script');
      for (let script of scripts) {
        const text = script.textContent;
        if (text) {
          const matches = text.match(/https?:\\/\\/video\\.twimg\\.com\\/[^\\s\"]+?\\.(mp4|m3u8)/g);
          if (matches) mediaUrls.push(...matches);
        }
      }

      const allUrls = [...new Set([directUrl, ...sources, ...mediaUrls])]
        .filter(u => u && !u.startsWith('blob:'));
      const mp4Urls = allUrls.filter(u => u.includes('.mp4'));
      const otherUrls = allUrls.filter(u => !u.includes('.mp4'));

      return {
        urls: [...mp4Urls, ...otherUrls],
        duration: video.duration,
        poster: video.poster
      };
    })()`,
  });

  if (evalResult.error) throw new Error(`Failed to locate video: ${evalResult.error}`);
  const value = evalResult.data?.value;
  if (value?.error) throw new Error(value.error);
  if (!value?.urls?.length) throw new Error("No downloadable video URL found. The video may be DRM-protected or use temporary blob URLs.");

  return value.urls[0];
}

async function downloadMedia(videoUrl) {
  let buffer;
  let filename = "video.mp4";
  let tempPath = null;

  if (videoUrl.startsWith("blob:") || videoUrl.includes("x.com") || videoUrl.includes("twitter.com")) {
    logInfo("Using yt-dlp to download audio from", videoUrl);
    tempPath = join(tmpdir(), `openweb-audio-${username}-${Date.now()}.mp4`);
    try {
      const result = spawnSync("yt-dlp", ["-f", "ba", "-o", tempPath, videoUrl], { timeout: 120000, stdio: "ignore" });
      if (result.error) throw result.error;
      if (!existsSync(tempPath)) throw new Error("yt-dlp failed to download audio");
      buffer = readFileSync(tempPath);
      filename = "audio.mp4";
      logInfo("Audio downloaded via yt-dlp", { sizeMB: Math.round(buffer.length / 1024 / 1024) });
    } catch (ydlErr) {
      logError("yt-dlp failed", ydlErr.message);
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      buffer = Buffer.from(await response.arrayBuffer());
    }
  } else {
    logInfo("Downloading video from", videoUrl);
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    buffer = Buffer.from(await response.arrayBuffer());
  }

  return { buffer, filename, tempPath };
}

async function transcribeMedia(buffer, filename, language) {
  if (buffer.length > 100 * 1024 * 1024) {
    throw new Error(`Media too large (${Math.round(buffer.length / 1024 / 1024)}MB). Local Whisper limit is ~100MB.`);
  }

  logInfo("Sending to local Whisper for transcription");
  const form = new FormData();
  const blob = new Blob([buffer], { type: "video/mp4" });
  form.append("file", blob, filename);
  if (language) {
    form.append("language", language);
    logDebug("Using language", language);
  }

  const whisperRes = await fetch("http://127.0.0.1:5001/transcribe", {
    method: "POST",
    body: form,
  });

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    throw new Error(`Whisper API ${whisperRes.status}: ${errText}`);
  }

  return await whisperRes.json();
}

function saveTranscription(text, videoUrl, language) {
  try {
    if (!existsSync(TRANSCRIPTIONS_DIR)) {
      mkdirSync(TRANSCRIPTIONS_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeUrl = videoUrl.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50);
    const txtFile = join(TRANSCRIPTIONS_DIR, `${timestamp}_${safeUrl}.txt`);
    const jsonFile = join(TRANSCRIPTIONS_DIR, `${timestamp}_${safeUrl}.json`);

    writeFileSync(txtFile, text, "utf8");
    writeFileSync(jsonFile, JSON.stringify({
      text,
      videoUrl,
      language: language || "auto",
      timestamp: new Date().toISOString(),
    }, null, 2), "utf8");

    logInfo("Transcription saved to", { txtFile, jsonFile });
  } catch (saveErr) {
    logError("Failed to save transcription", saveErr.message);
  }
}

async function handleSpeechToText(args) {
  logInfo("speech_to_text called", args);
  let tempPath = null;
  try {
    const videoUrl = await detectVideoUrl(args);
    logInfo("Video URL resolved", videoUrl);

    const { buffer, filename, tempPath: tPath } = await downloadMedia(videoUrl);
    tempPath = tPath;

    const whisperData = await transcribeMedia(buffer, filename, args.language);
    logInfo("Whisper transcription completed", { textLength: whisperData.text?.length });

    saveTranscription(whisperData.text, videoUrl, args.language);

    if (args.translateTo && whisperData.text) {
      logInfo("Auto-translating transcript to", args.translateTo);
      const translateResult = await handleTranslate({
        text: whisperData.text,
        from: args.language || "auto",
        to: args.translateTo,
      });
      if (!translateResult.error) {
        whisperData.translated = translateResult.text;
        logInfo("Translation completed", { length: translateResult.text.length });
      }
    }

    return { text: whisperData.text, translated: whisperData.translated, videoUrl };
  } catch (e) {
    logError("speech_to_text error", e.message);
    return { error: e.message };
  } finally {
    if (tempPath) {
      try { unlinkSync(tempPath); } catch { }
    }
  }
}

async function handleTranslate(args) {
  logInfo("translate called", args);

  const text = args.text;
  if (!text) {
    return { error: "text is required" };
  }

  const fromLang = args.from || "en";
  const toLang = args.to || "ru";

  try {
    logInfo("Translating", { from: fromLang, to: toLang, length: text.length });
    const res = await fetch("http://127.0.0.1:5001/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from: fromLang, to: toLang }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logError("Translate API error", { status: res.status, error: errText });
      return { error: `Translate API ${res.status}: ${errText}` };
    }

    const data = await res.json();
    logInfo("Translation completed", { length: data.text?.length });
    return { text: data.text };
  } catch (e) {
    logError("translate error", e.message);
    return { error: e.message };
  }
}

function healSnapshotRefs(args) {
  if (!args || typeof args !== "object") return;
  const keys = ["selector", "source", "target"];
  const refPattern = /^e\d+$/;
  for (const key of keys) {
    if (typeof args[key] === "string" && refPattern.test(args[key].trim())) {
      const healed = `@${args[key].trim()}`;
      startupLog(`[Self-Healing] Automatically corrected snapshot ref typo: "${args[key]}" -> "${healed}"`);
      args[key] = healed;
    }
  }
}

const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

const server = new Server(
  {
    name: pkg.name || "openweb",
    version: pkg.version || "1.4.1",
    description: pkg.description || "Browser automation server for AI agents. Controls Chrome, Firefox, and Edge through MCP. Provides 50+ tools for navigation, content extraction, form filling, network interception, and more.",
    websiteUrl: "https://github.com/QWKiks/openweb",
    icons: [
      {
        src: "https://raw.githubusercontent.com/QWKiks/openweb/main/icon/icon-128.png",
        mimeType: "image/png",
        sizes: ["128x128"],
      },
    ],
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      logging: {},
      completions: {},
    },
    instructions: `# OpenWeb — Browser Automation for AI Agents

You are connected to a browser via OpenWeb. Follow this workflow for reliable automation:

## Core Workflow (ALWAYS follow this order)

1. **navigate(url)** — open the target URL
2. **snapshot()** — capture accessibility tree, get @e refs
3. **click/fill/@eN** — interact using snapshot refs (NOT CSS selectors)
4. **screenshot()** — verify the action succeeded

## Key Rules

- Run **snapshot() FIRST** on every new page — it returns stable @e refs
- Use @e refs for click/fill (e.g. @e12), not CSS selectors
- If click(@eN) fails → try click(@eN, physical: true)
- If fill fails on dynamic inputs → use humanize(cmd: type)
- Call dismiss_overlay() after navigate to clear cookie banners / modals
- Prefer get_markdown over get_text for structured content
- Call wait(network_idle) after form submits
- All 56+ tools are available — just call them by name`,
  }
);

const registeredTools = new Map();
for (const toolName of CORE_TOOL_NAMES) {
  const t = TOOLS.find(x => x.name === toolName);
  if (t) registeredTools.set(toolName, t);
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: Array.from(registeredTools.values()) };
});

server.setRequestHandler(SetLevelRequestSchema, async (req) => {
  currentLogLevel = req.params.level;
  return {};
});

async function notifyToolsChanged() {
  try {
    await server.notification({
      method: "notifications/tools/list_changed",
    });
  } catch {}
}

const RESOURCES = [
  {
    uri: "openweb://docs/automation-guide",
    name: "OpenWeb Automation Guide & Cheat Sheet",
    mimeType: "text/markdown",
    description: "A comprehensive, AI-native guide detailing browser automation decision-making, visual priorities, and coordinate self-healing recovery strategies."
  },
  {
    uri: "openweb://status",
    name: "Current Daemon Status",
    mimeType: "application/json",
    description: "Live connection status, metrics, and error log from the daemon."
  },
  {
    uri: "openweb://tools/list",
    name: "All Available Tools",
    mimeType: "text/markdown",
    description: "Full list of every tool with description and input schema."
  },
];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: RESOURCES,
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  if (uri === "openweb://docs/automation-guide") {
    let guideContent = "";
    try {
      const fs = await import("fs");
      guideContent = fs.readFileSync(join(__dirname, ".cursorrules"), "utf-8");
    } catch {
      guideContent = `# OpenWeb Automation Guide\n\nRun 'snapshot' first to get element refs (@e1, @e2). Then call click/fill on those refs!`;
    }

    return {
      contents: [
        {
          uri: "openweb://docs/automation-guide",
          mimeType: "text/markdown",
          text: guideContent,
        }
      ]
    };
  }

  if (uri === "openweb://status") {
    const status = ws?.readyState === WebSocket.OPEN ? "connected" : "disconnected";
    return {
      contents: [{
        uri: "openweb://status",
        mimeType: "application/json",
        text: JSON.stringify({
          status,
          daemonUrl: DAEMON_URL,
          pendingCalls: pendingCalls.size,
          uptime: status === "connected" ? "connected" : "disconnected",
          toolCount: TOOLS.length,
        }, null, 2),
      }]
    };
  }

  if (uri === "openweb://tools/list") {
    const toolList = TOOLS.map(t => `- **${t.name}**: ${t.description.split('\n')[0]}`).join('\n');
    return {
      contents: [{
        uri: "openweb://tools/list",
        mimeType: "text/markdown",
        text: `# All OpenWeb Tools (${TOOLS.length})\n\n${toolList}`,
      }]
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [
    {
      uriTemplate: "openweb://session/{sessionId}",
      name: "Session Data",
      description: "Serialized browser session data (cookies, localStorage) saved via session_manager",
      mimeType: "application/json",
    },
    {
      uriTemplate: "openweb://logs/{toolName}/{timestamp}",
      name: "Tool Call Log",
      description: "Detailed log of a specific tool call including request/response",
      mimeType: "text/plain",
    },
  ],
}));

const subscribers = new Set();

server.setRequestHandler(SubscribeRequestSchema, async (request) => {
  logInfo("Resource subscribe request", { uri: request.params.uri });
  subscribers.add(request.params.uri);
  return {};
});

import { PROMPTS } from './prompts.js';

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPTS,
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const prompt = PROMPTS.find(p => p.name === name);
  if (!prompt) throw new Error(`Prompt not found: ${name}`);

  switch (name) {
    case "extract_and_summarize": {
      const detail = args?.detail || "normal";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please summarize the current page. Call get_markdown() to get the page content, then provide a ${detail} summary covering: main topic, key points, structure, and any actionable items.`,
            },
          },
        ],
      };
    }
    case "fill_form_and_submit": {
      const formDesc = args?.formDescription || "the form";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Fill and submit ${formDesc} on the current page. First call snapshot() to identify form fields by @e refs. Use fill() for standard inputs. If a field rejects fill(), fall back to humanize(). After filling all fields, find and click the submit button. Finally call wait(type: 'network_idle') and screenshot() to verify the result.`,
            },
          },
        ],
      };
    }
    case "analyze_form": {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Analyze all forms on the current page. Call snapshot() to find form elements, then describe: number of fields, field types, expected values, and validation rules. Suggest appropriate fill values for each field.`,
            },
          },
        ],
      };
    }
    case "check_accessibility": {
      const severity = args?.severity || "error";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Run an accessibility audit on the current page using audit(type: "accessibility"). Report all issues with severity >= ${severity}. For each issue include: element, WCAG criterion, suggested fix.`,
            },
          },
        ],
      };
    }
    default:
      throw new Error(`Prompt not implemented: ${name}`);
  }
});

server.setRequestHandler(CompleteRequestSchema, async (request) => {
  const { ref, argument, context } = request.params;

  if (ref.type === "ref/prompt") {
    const prompt = PROMPTS.find(p => p.name === ref.name);
    if (!prompt) throw new Error(`Prompt not found: ${ref.name}`);

    if (argument.name === "detail") {
      const options = ["brief", "normal", "detailed"];
      const values = options.filter(o => o.startsWith(argument.value));
      return { completion: { values, hasMore: false } };
    }

    if (argument.name === "target") {
      const options = ["tables", "lists", "all"];
      const values = options.filter(o => o.startsWith(argument.value));
      return { completion: { values, hasMore: false } };
    }

    if (argument.name === "severity") {
      const options = ["error", "warning", "notice"];
      const values = options.filter(o => o.startsWith(argument.value));
      return { completion: { values, hasMore: false } };
    }
  }

  if (ref.type === "ref/resource") {
    const templates = [
      "openweb://session/",
      "openweb://logs/",
    ];
    const values = templates.filter(t => t.startsWith(argument.value));
    return { completion: { values, hasMore: false } };
  }

  return { completion: { values: [], hasMore: false } };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logInfo("MCP tool call received", { name, args });

  const nextStep = NEXT_STEP_HINTS[name];

  if (args) {
    healSnapshotRefs(args);
  }

  if (name === "navigate_smart") {
    logInfo("Executing navigate_smart workflow");
    const navResult = await sendToolCall("navigate", { url: args.url });
    if (navResult.error) return errorResult(navResult.error, nextStep);
    
    if (args.dismissOverlays !== false) {
      logInfo("Dismissing overlays as part of navigate_smart");
      await sendToolCall("dismiss_overlay", {}).catch(() => {});
    }
    
    logInfo("Taking snapshot as part of navigate_smart");
    const snap = await sendToolCall("snapshot", { interactiveOnly: true });
    if (snap.error) return errorResult(snap.error, nextStep);
    
    return successResult(snap.data?.tree || snap.tree || "", snap.data || snap);
  }

  if (name === "close_tab" && !args.force) {
    if (server && typeof server.createMessage === 'function') {
      try {
        const response = await server.createMessage({
          messages: [{
            role: "user",
            content: { type: "text", text: `Are you sure you want to close tab ${args.tabId || "all"}? Reply 'yes' to confirm.` }
          }]
        });
        const reply = response?.content?.text || "";
        if (!reply.toLowerCase().includes("yes")) {
          return errorResult("User rejected destructive action close_tab.", nextStep);
        }
      } catch (e) {
        return errorResult("Destructive action close_tab requires { force: true } parameter.", nextStep);
      }
    } else {
      return errorResult("Destructive action close_tab requires { force: true } parameter. Your MCP client does not support interactive prompts.", nextStep);
    }
  }

  if (name === "discover_tools") {
    const category = args.category || "all";

    const categories = {
      session: SESSION_TOOLS,
      network: NETWORK_TOOLS,
      diagnostics: DIAGNOSTICS_TOOLS,
      audits: AUDITS_TOOLS,
      advanced: ADVANCED_TOOLS,
    };

    if (category === "all") {
      let responseMarkdown = `## All Available Tools by Category\n\nCall \`discover_tools(category: "<name>")\` for full schemas of a specific category.\n\n`;
      
      for (const [catName, catTools] of Object.entries(categories)) {
        responseMarkdown += `### ${catName}\n`;
        for (const toolName of catTools) {
          const toolDef = TOOLS.find(t => t.name === toolName);
          if (toolDef) {
            const shortDesc = toolDef.description.split(/\.\s/)[0] + '.';
            responseMarkdown += `- \`${toolDef.name}\` — ${shortDesc}\n`;
          }
        }
        responseMarkdown += `\n`;
      }
      
      return successResult(responseMarkdown);
    }

    let targetTools = categories[category] || [];
    let addedCount = 0;

    let responseMarkdown = `## Tools — Category: ${category.toUpperCase()}\n\nFull schemas:\n\n`;

    for (const toolName of targetTools) {
      const toolDef = TOOLS.find(t => t.name === toolName);
      if (toolDef) {
        if (!registeredTools.has(toolName)) {
          registeredTools.set(toolName, toolDef);
          addedCount++;
        }
        responseMarkdown += `#### 🛠️ Tool: \`${toolDef.name}\`\n`;
        responseMarkdown += `* **Description**: ${toolDef.description}\n`;
        responseMarkdown += `* **Input Schema**:\n\`\`\`json\n${JSON.stringify(toolDef.inputSchema, null, 2)}\n\`\`\`\n\n`;
      }
    }

    if (addedCount > 0) {
      notifyToolsChanged();
    }

    return successResult(responseMarkdown);
  }

  if (name === "speech_to_text") {
    logInfo("Routing to speech_to_text handler");
    const result = await handleSpeechToText(args || {});
    if (result.error) {
      logError("speech_to_text handler returned error", result.error);
      return errorResult(`Error: ${result.error}`, nextStep);
    }
    logInfo("speech_to_text handler succeeded");
    const output = result.translated
      ? `=== Original ===\n${result.text}\n\n=== Translated ===\n${result.translated}`
      : result.text;
    return successResult(output, { text: result.text, translated: result.translated, detectedLanguage: result.detected_language || result.detectedLanguage });
  }

  if (name === "translate") {
    logInfo("Routing to translate handler");
    const result = await handleTranslate(args || {});
    if (result.error) {
      logError("translate handler returned error", result.error);
      return errorResult(`Error: ${result.error}`, nextStep);
    }
    logInfo("translate handler succeeded");
    return successResult(result.text, { text: result.text, detectedLanguage: result.detected_language || result.detectedLanguage });
  }



  

  if (args?.idempotencyKey) {
    const cached = idempotencyCache.get(args.idempotencyKey);
    if (cached) {
      logInfo("Idempotency cache hit", { name, key: args.idempotencyKey.substring(0, 8) });
      return cached;
    }
  }

  

  const progressToken = request.params?.meta?.progressToken || null;

  const result = await sendToolCall(name, args || {}, progressToken);

  if (result.error) {
    logError("Tool call returned error", { name, error: result.error });
    const hint = result.isRetrySafe === false
      ? `${nextStep || ""} ⚠ This operation left side effects — do NOT retry automatically.`
      : `${nextStep || ""} ✅ It is safe to retry this operation.`;
    return errorResult(`Error: ${result.error}`, hint);
  }

  const data = result.data;

  if (name === "snapshot" && data?.tree) {
    const snapshotResult = {
      content: [{ type: "text", text: data.tree }],
      structuredContent: {
        format: "snapshot",
        refCount: data.refCount,
        maxLength: data.maxLength,
        truncated: data.truncated,
        selector: data.selector,
        suggestedNextTool: "click or fill with @e refs from this snapshot",
      },
    };
    if (args?.idempotencyKey) idempotencyCache.set(args.idempotencyKey, snapshotResult);
    return snapshotResult;
  }

  if (name === "screenshot" && data?.data) {
    const format = data.format || "jpeg";
    const mimeType = format === "png" ? "image/png" : "image/jpeg";
    const screenshotResult = {
      content: [{ type: "image", data: data.data, mimeType }],
      structuredContent: {
        format,
        width: data.width,
        height: data.height,
        pageTitle: data.pageTitle,
      },
    };
    if (args?.idempotencyKey) idempotencyCache.set(args.idempotencyKey, screenshotResult);
    return screenshotResult;
  }

  if (name === "save_as_pdf" && data?.data) {
    const pdfResult = {
      content: [{ type: "text", text: `PDF exported (${data.dataLength} bytes, page: "${data.pageTitle || "untitled"}").` }],
      structuredContent: {
        dataLength: data.dataLength,
        pageTitle: data.pageTitle,
        format: "pdf",
      },
    };
    if (args?.idempotencyKey) idempotencyCache.set(args.idempotencyKey, pdfResult);
    return pdfResult;
  }

  const text =
    typeof data === "object" && data !== null
      ? JSON.stringify(data)
      : String(data ?? "");

  const STRUCTURED_RESULT_TOOLS = new Set([
    "get_markdown", "audit", "security_scan", "coverage",
    "design_clone", "color_palette", "get_element_bounds",
    "form_fill", "responsive_test",
  ]);

  const structured = STRUCTURED_RESULT_TOOLS.has(name) && typeof data === "object" && data !== null
    ? data
    : undefined;

  const output = successResult(text, structured);

  if (args?.idempotencyKey) idempotencyCache.set(args.idempotencyKey, output);

  return output;
});

const transport = process.argv.includes("--transport")
  ? process.argv[process.argv.indexOf("--transport") + 1]
  : "stdio";

if (transport === "sse") {
  const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
  const express = (await import("express")).default;
  const port = parseInt(process.argv[process.argv.indexOf("--port") + 1] || "3001", 10);
  const app = express();

  const SSE_AUTH_TOKEN = process.env.OPENWEB_TOKEN || null;
  function sseAuth(req, res, next) {
    if (!SSE_AUTH_TOKEN) return next();
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ") && auth.slice(7) === SSE_AUTH_TOKEN) {
      return next();
    }
    res.status(401).json({ error: "Unauthorized — Bearer token required" });
  }

  let sseTransport;

  app.get("/sse", sseAuth, (req, res) => {
    sseTransport = new SSEServerTransport("/message", res);
    server.connect(sseTransport);
  });

  app.post("/message", sseAuth, express.json(), (req, res) => {
    if (sseTransport) {
      sseTransport.handlePostMessage(req, res);
    }
  });

  app.listen(port, () => {
    console.error(`[mcp] SSE server listening on http://127.0.0.1:${port}`);
  });
} else {
  const stdioTransport = new StdioServerTransport();
  server.connect(stdioTransport);
  console.error("[mcp] OpenWeb MCP server running (stdio transport)");
  console.error("[mcp] Daemon URL:", DAEMON_URL);
}
