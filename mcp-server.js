import "dotenv/config";
import { randomUUID } from "node:crypto";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema, CallToolRequestSchema,
  ListResourcesRequestSchema, ReadResourceRequestSchema,
  ListPromptsRequestSchema, GetPromptRequestSchema,
  SubscribeRequestSchema,
  ListResourceTemplatesRequestSchema,
  CompleteRequestSchema,
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

function log(level, ...args) {
  const timestamp = new Date().toISOString();
  const prefix = `[mcp:${level}] ${timestamp}`;
  if (level === "error" || DEBUG) {
    console.error(prefix, ...args);
  } else {
    console.error(prefix, ...args);
  }
}

function logDebug(...args) {
  if (DEBUG) log("debug", ...args);
}

function logInfo(...args) {
  log("info", ...args);
}

function logError(...args) {
  log("error", ...args);
}

const TOOLS = [
  {
    name: "navigate",
    description: "Navigate to a URL in the browser. RECOMMENDATION: Set 'newTab: true' (default) to start a clean session or isolate the page context. Set 'newTab: false' when continuing a search chain, submitting multiple steps, or navigating deep within the active domain.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to. Example: 'https://example.com'" },
        newTab: { type: "boolean", description: "Open in a new tab (default: true)", default: true },
        tabId: { type: "number", description: "Tab ID to target (default: active tab). Use list_tabs to get IDs." },
        waitUntil: {
          type: "string",
          description: "CDP lifecycle state to resolve navigation: 'DOMContentLoaded' (default, 3x faster, returns as soon as DOM is interactable) or 'complete' (waits for full window load including slow analytics/ads)",
          enum: ["DOMContentLoaded", "complete"],
          default: "DOMContentLoaded"
        },
      },
      required: ["url"],
    },
  },
  {
    name: "snapshot",
    description: "Snapshot the accessibility tree of the active page. RECOMMENDATION: Run this tool *first* on every new page load. It returns stable element references (like @e1, @e2) which you MUST use with 'click' and 'fill' tools to prevent selector errors and ensure 100% correct selector targeting.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of a target subtree to capture (optional — captures full page AXTree if omitted)" },
        interactiveOnly: { type: "boolean", description: "Filter out non-interactive static text nodes and branches to maximize token economy (default: true)", default: true },
        maxLength: { type: "number", description: "Maximum tree size in characters (default: 50000). Larger trees are truncated to save tokens.", default: 50000 },
        maxDepth: { type: "number", description: "Maximum nesting depth for the indented text format (default: 8). Reduces token count on deeply nested pages.", default: 8 },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "screenshot",
    description: "Take a screenshot of the current page. RECOMMENDATION: Use this tool to visually verify the result of dynamic transitions, form submissions, or modal overlays. NOTE: Some AI models cannot process image output. If screenshot returns an image error, use snapshot() + get_text()/get_markdown() as text-based fallback to understand page state.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector or @e ref to screenshot a specific element (optional)",
        },
        format: {
          type: "string",
          description: "Image format: jpeg (default, smaller) or png",
          enum: ["jpeg", "png"],
          default: "jpeg",
        },
        quality: {
          type: "number",
          description: "JPEG quality 0-100 (default: 60)",
          default: 60,
        },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "click",
    description: "Click an element on the page. RECOMMENDATION: Prefer standard DOM click (mode: 'synthetic', default). Switch to mode: 'physical' for Canvas/SVG elements, or when custom event listeners block standard clicks. Use mode: 'humanized' for highly interactive elements or telemetry-heavy interfaces to slide the cursor naturally before clicking.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector, @e ref, or semantic selector of the element to click. Examples: '@e5' (snapshot reference), 'button#submit'." },
        mode: { type: "string", description: "Click mode: 'synthetic' (default, DOM click), 'physical' (native browser event click), or 'humanized' (natural cursor movement + physical click)", enum: ["synthetic", "physical", "humanized"], default: "synthetic" },
        steps: { type: "number", description: "Bezier mouse curve movement steps for humanized mode (default: 15)", default: 15 },
        physical: { type: "boolean", description: "Deprecated: use mode: 'physical' instead.", default: false },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["selector"],
    },
  },
  {
    name: "fill",
    description: "Fill a form field with a value by CSS selector or snapshot ref. RECOMMENDATION: Use the stable snapshot @e ref (e.g. '@e5') obtained from the 'snapshot' tool to target the input. PREFER fill over humanize for standard form inputs. Switch to 'humanize(cmd: type)' ONLY if the input rejects standard fill (such as certain hidden, complex React-controlled, or highly sensitive dynamic input fields). NOTE: fill() now auto-detects combobox fields (role='combobox', aria-autocomplete). If 'comboboxDetected: true' in the response, use 'select_autocomplete' instead for proper autocomplete interaction.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of the form field to populate. Examples: '@e12' (snapshot reference), 'input[type=email]' (CSS)" },
        value: { type: "string", description: "Value to fill in" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "send_keys",
    description: "Send keyboard key combinations (e.g. Enter, Ctrl+A, Tab) or type unicode text (any language, emoji) via Input.insertText to the currently focused element. USE CASE — text: fill combo-box autocomplete fields that reject standard fill() (e.g. airport/address selectors). USE CASE — keys: press key combos like 'Enter', 'Ctrl+A', 'Tab' or 'Escape ArrowDown Enter'.",
    inputSchema: {
      type: "object",
      properties: {
        keys: { type: "string", description: "Key combination(s), e.g. 'Enter', 'Ctrl+A', 'Tab', 'Escape ArrowDown Enter'. Mutually exclusive with 'text'." },
        text: { type: "string", description: "Unicode text to type (any language, emoji, symbols). Uses CDP Input.insertText. Best for filling combo-boxes / autocomplete inputs that reject value-only fill(). Mutually exclusive with 'keys'." },
        perChar: { type: "boolean", description: "When true with 'text', dispatches per-character keyDown/keyUp events instead of one bulk insertText. Required for autocomplete/combobox fields that debounce-search on each keystroke. Default: false." },
        delay: { type: "number", description: "Delay in ms between per-character key events (only when perChar:true). Default: 50." },
        repeat: { type: "number", description: "Repeat the key sequence N times (1-100, only for 'keys' mode). Default: 1." },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "evaluate",
    description: "Evaluate JavaScript code on the active page and return the result. RECOMMENDATION: Use this tool ONLY when you need to inspect custom window states, trigger custom DOM methods, or read complex states not available via standard get_text or snapshot. Always keep code blocks short and handle exceptions inside.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code to execute. Examples: 'document.title' (read state), 'window.scrollTo(0, 1000)' (scroll page), 'document.querySelector(\"input\").focus()' (focus input)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["code"],
    },
  },
  {
    name: "list_tabs",
    description: "List all open browser tabs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "close_tab",
    description: "Close a specific browser tab or all tabs (session).",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID to close (optional if closing all)" },
        all: { type: "boolean", description: "Close all tabs in the current session (default: false)" },
      },
    },
  },
  {
    name: "network",
    description: "Capture, list, inspect HTTP requests, intercept network activity, trace redirects, monitor WebSockets, discover APIs, or view historical requests. RECOMMENDATION: Use cmd: 'start' BEFORE navigation to capture all requests. Use cmd: 'history' to browse past requests from Performance API (no prior capture needed). Use cmd: 'intercept' to block, redirect, mock, or modify network requests.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: {
          type: "string",
          description: "Network command: 'start'/'capture' (begin capture), 'stop' (stop capture), 'list' (show captured), 'history' (browse past requests via Performance API, no prior setup needed), 'detail'/'inspect' (request body), 'block_ads' (block trackers), 'intercept' (modify/mock), 'har_export' (export HAR), 'websocket_monitor' (WebSocket logs), 'redirect_chain' (trace redirects), 'api_discovery' (find API endpoints in page source)",
          enum: ["start", "capture", "stop", "list", "history", "detail", "inspect", "block_ads", "intercept", "har_export", "websocket_monitor", "redirect_chain", "api_discovery"]
        },
        enable: { type: "boolean", description: "Enable or disable ad blocker (for block_ads cmd, default: true)", default: true },
        filter: { type: "string", description: "Url filter match (for list cmd)" },
        requestId: { type: "string", description: "Request ID for detailed inspection (for detail/inspect cmd)" },
        action: { type: "string", description: "Sub-action: 'start'/'stop'/'add_rule'/'remove_rule'/'list_rules' (for intercept cmd) or 'capture'/'read'/'clear' (for websocket_monitor)", enum: ["start", "stop", "add_rule", "remove_rule", "list_rules", "capture", "read", "clear"] },
        ruleAction: { type: "string", description: "Interception rule behavior: 'block', 'redirect', 'modify', 'mock'", enum: ["block", "redirect", "modify", "mock"] },
        pattern: { type: "string", description: "Request pattern to match/intercept (for intercept add_rule)" },
        redirectUrl: { type: "string", description: "Interception redirect URL" },
        modifyUrl: { type: "string", description: "Interception modified request URL" },
        headers: { type: "object", description: "Interception modified request headers" },
        mockBody: { type: "string", description: "Interception mock response body text" },
        mockHeaders: { type: "object", description: "Interception mock response headers" },
        responseCode: { type: "number", description: "Interception response code (for mock/redirect, default: 200/302)" },
        ruleId: { type: "string", description: "Interception rule ID to remove" },
        maxMessages: { type: "number", description: "Maximum messages to read/capture (for websocket_monitor, default: 100)", default: 100 },
        url: { type: "string", description: "Target URL to trace redirect chain for (for redirect_chain cmd)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["cmd"],
    },
  },
  {
    name: "hover",
    description: "Hover over an element by CSS selector or snapshot ref. Triggers mouseover/mouseenter events.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of the element to hover over. Examples: '@e4' (snapshot reference), 'li.menu-item' (CSS)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["selector"],
    },
  },
  {
    name: "select",
    description: "Select an option in a <select> dropdown element by CSS selector or snapshot ref.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of the <select> element. Examples: '@e15' (snapshot reference), 'select#country' (CSS)" },
        value: { type: "string", description: "Option value or text content to select. Use a number for index." },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "get_text",
    description: "Extract page content. RECOMMENDATION: Use default 'text' format to read articles/content. Use 'structured' format ONLY when you need to analyze page meta tags, loaded scripts, or stylesheets. Avoid loading raw 'html' unless you specifically need to analyze raw DOM nodes. Response includes 'estimatedTokens' to help manage context budget.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref (optional — returns full page text/HTML if omitted)" },
        format: {
          type: "string",
          description: "Output format: 'text' (default clean text), 'html' (raw HTML source), 'structured' (JSON metadata + HTML), 'full', 'head_only', 'body_only'",
          enum: ["text", "html", "structured", "full", "head_only", "body_only"],
          default: "text",
        },
        maxLength: { type: "number", description: "Maximum text length to return (default: 50000)", default: 50000 },
        includeHidden: { type: "boolean", description: "Include hidden/invisible elements (default: false)", default: false },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "get_markdown",
    description: "Extract the active page or a targeted element's content as clean, semantic Markdown, or extract structured table data as a JSON array. RECOMMENDATION: Use 'as: \"markdown\"' (default) *instead* of get_text(format: 'text') or get_text(format: 'html') when you need to read structured content (articles, documentation, manuals) while keeping list formatting, headers, table grids, and image/link targets perfectly preserved. Switch to 'as: \"table\"' to extract high-fidelity tabular data from HTML tables with column headers and cell links intact.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of the DOM element to target. Examples: '@e12' (snapshot ref), 'article.post-content' (CSS). (default: 'body' for markdown, 'table' for table)", default: "body" },
        as: { type: "string", description: "Extraction format: 'markdown' (default, clean Markdown representation) or 'table' (structured JSON array of extracted table data)", enum: ["markdown", "table"], default: "markdown" },
        maxRows: { type: "number", description: "Maximum rows to extract when extracting structured table data (default: 500)", default: 500 },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "get_element_bounds",
    description: "Locate and retrieve the physical coordinate bounding boxes (x, y, width, height) of all visible interactive elements on the page. RECOMMENDATION: Use this tool to achieve 'visual grounding' when coordinating actions with a 'screenshot' — it maps DOM nodes to precise viewport coordinates. Use the returned (x, y) coordinates as reference parameters.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "humanize",
    description: "Enhance automation natural input behavior by simulating realistic keystroke typing with randomized intervals (50ms-150ms) to ensure high compatibility with complex React/Vue controls and event listeners. RECOMMENDATION: PREFER fill (fastest direct DOM value assignment) for standard forms. Switch to humanize for fields requiring natural keystroke events.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text content to type. Example: 'John Doe'" },
        selector: { type: "string", description: "Target CSS selector or @e ref to focus and type into. Examples: '@e15' (snapshot ref), 'input#username' (CSS)" },
        delayMin: { type: "number", description: "Minimum typing delay per key in milliseconds (default: 50)", default: 50 },
        delayMax: { type: "number", description: "Maximum typing delay per key in milliseconds (default: 150)", default: 150 },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["text"],
    },
  },
  {
    name: "state",
    description: "Manage browser state, cookies, storage, and sessions. Unifies saving and restoring open tabs, cookies, local storage, and session storage.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description: "Target state scope: 'tabs' (save/restore open tab lists), 'cookies' (manage cookie jar), 'local_storage' (read/write localStorage), 'session_storage' (read/write sessionStorage), or 'all' (save/restore complete cookie + storage auth context)",
          enum: ["tabs", "cookies", "local_storage", "session_storage", "all"],
          default: "tabs",
        },
        cmd: {
          type: "string",
          description: "Action to perform: 'save', 'restore'/'load', 'clear', 'info' (for tabs/all/storage scopes) or 'read'/'get', 'write'/'set', 'delete' (for cookies/storage scopes)",
          enum: ["save", "restore", "load", "clear", "info", "get", "read", "set", "write", "delete"],
        },
        name: { type: "string", description: "Cookie name (for cookies scope)" },
        value: { type: "string", description: "Cookie value (for cookies scope) or storage value (for storage scopes)" },
        key: { type: "string", description: "Storage key (for local_storage/session_storage scopes)" },
        domain: { type: "string", description: "Cookie domain (for cookies scope)" },
        path: { type: "string", description: "Cookie path (for cookies scope)" },
        secure: { type: "boolean", description: "Cookie secure flag (for cookies scope)" },
        httpOnly: { type: "boolean", description: "Cookie httpOnly flag (for cookies scope)" },
        sameSite: { type: "string", description: "Cookie sameSite policy: 'Lax', 'Strict', 'None' (for cookies scope)" },
        expires: { type: "number", description: "Cookie expiration epoch time in seconds (for cookies scope)" },
        session: {
          type: "object",
          description: "Full serialized authentication session state JSON object (for scope=all, cmd=load/restore)",
        },
        url: { type: "string", description: "Target URL (for cookies/all scopes)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },

  {
    name: "console",
    description: "Capture and read browser console output (log, warn, error, info). Start capture, then list entries.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: start, stop, list, or clear", enum: ["start", "stop", "list", "clear"] },
        filter: { type: "string", description: "Filter entries: 'all' (default) or 'errors'", enum: ["all", "errors"], default: "all" },
        type: { type: "string", description: "Filter by specific log type: log, warn, error, info, debug" },
        limit: { type: "number", description: "Max entries to return (default: 100)" },
        offset: { type: "number", description: "Offset for pagination (default: 0)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["cmd"],
    },
  },
  {
    name: "dialog",
    description: "Handle JavaScript dialogs (alert, confirm, prompt). RECOMMENDATION: Use `dialog(cmd: auto, accept: true)` *before* triggering actions that you expect will open an alert or confirmation dialog. This prevents the websocket connection from blocking and automatically bypasses the popup.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: list, handle, or auto", enum: ["list", "handle", "auto"] },
        accept: { type: "boolean", description: "Accept (true) or dismiss (false) the dialog (default: true)" },
        promptText: { type: "string", description: "Text to enter in prompt dialogs" },
        disable: { type: "boolean", description: "Disable auto-handler (for auto cmd)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["cmd"],
    },
  },
  {
    name: "emulate",
    description: "Emulate a mobile device, set geolocation, or change user agent. Includes device presets. RECOMMENDATION: Prefer emulate over viewport for full device emulation (device presets like iphone_14 include correct UA, viewport, touch, and DPR). Use viewport ONLY when you need to resize the window without changing the user agent or device signature.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: device, geolocation, user_agent, or reset", enum: ["device", "geolocation", "user_agent", "reset"] },
        device: { type: "string", description: "Device preset: iphone_14, iphone_14_pro_max, pixel_7, ipad_pro, galaxy_s23" },
        width: { type: "number", description: "Custom viewport width" },
        height: { type: "number", description: "Custom viewport height" },
        deviceScaleFactor: { type: "number", description: "Custom device pixel ratio" },
        mobile: { type: "boolean", description: "Mobile mode" },
        touch: { type: "boolean", description: "Touch emulation" },
        userAgent: { type: "string", description: "Custom user agent string" },
        latitude: { type: "number", description: "Geolocation latitude" },
        longitude: { type: "number", description: "Geolocation longitude" },
        accuracy: { type: "number", description: "Geolocation accuracy in meters (default: 100)" },
        clear: { type: "boolean", description: "Clear geolocation override" },
        platform: { type: "string", description: "Platform to report (for user_agent)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["cmd"],
    },
  },

  {
    name: "scroll",
    description: "Scroll the page or a specific element in a given direction by viewport heights. RECOMMENDATION: Scroll 'down' to trigger lazy loading of page assets, or scroll 'bottom'/'top' to skip page sections.",
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", description: "Direction: down, up, left, right, top, bottom", enum: ["down", "up", "left", "right", "top", "bottom"], default: "down" },
        amount: { type: "number", description: "Number of viewport heights to scroll (default: 3)", default: 3 },
        selector: { type: "string", description: "CSS selector to scroll a specific element (optional — scrolls page if omitted)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "wait",
    description: "Wait for a condition on the page. RECOMMENDATION: Wait for 'network_idle' after clicking form submits to ensure the request is processed, or wait for 'selector' to verify dynamic element rendering. On timeout, response includes 'reason' field explaining what was still pending.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Wait type: selector, navigation, or network_idle", enum: ["selector", "navigation", "network_idle"], default: "selector" },
        selector: { type: "string", description: "CSS selector to wait for (for type=selector)" },
        timeout: { type: "number", description: "Maximum wait time in ms (default: 10000)", default: 10000 },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "drag_drop",
    description: "Drag an element and drop it onto another element using CDP mouse events.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "CSS selector or @e ref of the element to drag" },
        target: { type: "string", description: "CSS selector or @e ref of the drop target" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["source", "target"],
    },
  },
  {
    name: "save_as_pdf",
    description: "Export the current page as a PDF document. Returns base64-encoded PDF data.",
    inputSchema: {
      type: "object",
      properties: {
        paper_format: { type: "string", description: "Paper size: letter, legal, a4, a3, tabloid (default: letter)", enum: ["letter", "legal", "a4", "a3", "tabloid"] },
        landscape: { type: "boolean", description: "Landscape orientation (default: false)" },
        scale: { type: "number", description: "Scale factor 0.1-2.0 (default: 1)" },
        print_background: { type: "boolean", description: "Include background graphics (default: true)" },
        file_name: { type: "string", description: "Suggested file name for the PDF" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "upload",
    description: "Upload files by setting them on a file input element (<input type=\"file\">) by CSS selector or @e ref.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of the file input element. Examples: '@e8' (snapshot reference), 'input[type=file]' (CSS)" },
        files: { type: "array", items: { type: "string" }, description: "Array of local file paths to set on the input" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["selector", "files"],
    },
  },
  {
    name: "bookmark",
    description: "Manage Chrome bookmarks: list, create, update, delete, or search bookmarks and folders.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: list, create, update, delete, search", enum: ["list", "create", "update", "delete", "search"] },
        parentId: { type: "string", description: "Parent folder ID (for list, create). Default: root." },
        title: { type: "string", description: "Bookmark/folder title (for create, update)" },
        url: { type: "string", description: "Bookmark URL (for create, update)" },
        index: { type: "number", description: "Position index in folder (for create)" },
        id: { type: "string", description: "Bookmark ID (for update, delete)" },
        query: { type: "string", description: "Search query (for search)" },
      },
      required: ["cmd"],
    },
  },
  {
    name: "extension",
    description: "Manage Chrome extensions: list, enable, disable, or get info about installed extensions.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: list, enable, disable, info", enum: ["list", "enable", "disable", "info"] },
        id: { type: "string", description: "Extension ID (for enable, disable, info)" },
        type: { type: "string", description: "Filter by type (for list): extension, theme, hosted_app, etc." },
      },
      required: ["cmd"],
    },
  },
  {
    name: "speech_to_text",
    description: "Transcribe speech to text from a video on the active page using local Whisper (offline, no API key). Automatically extracts the direct video URL from the page (Twitter/X, YouTube, etc.), downloads it, and returns the transcript text. Optional: auto-translate to target language. Requires local Whisper server to be running (services/whisper/whisper-server.py).",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
        videoUrl: { type: "string", description: "Direct video URL (optional — auto-detected from page if omitted)" },
        language: { type: "string", description: "Language code for transcription, e.g. 'en', 'ru' (optional)" },
        translateTo: { type: "string", description: "Auto-translate transcript to this language code, e.g. 'ru', 'zh' (optional, requires local Whisper translate endpoint)" },
      },
    },
  },
  {
    name: "translate",
    description: "Translate text offline using argos-translate (no API key). Requires local Whisper server to be running (services/whisper/whisper-server.py).",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to translate" },
        from: { type: "string", description: "Source language code (default: 'en')" },
        to: { type: "string", description: "Target language code (default: 'ru')" },
      },
      required: ["text"],
    },
  },
  {
    name: "audit",
    description: "Run website audits: SEO, accessibility (a11y), performance, forms, or broken links. DIFFERENT FROM security_scan: audit checks WEBSITE QUALITY (SEO, performance, accessibility, forms, broken links). security_scan checks SECURITY (headers, XSS, SSL/TLS, mixed content, vulnerabilities). Use audit for quality checks, security_scan for security checks.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Type of audit to run: 'seo' (default), 'accessibility' (or 'a11y'), 'performance', 'forms', 'links'",
          enum: ["seo", "accessibility", "a11y", "performance", "forms", "links"],
          default: "seo",
        },
        maxChecks: { type: "number", description: "Maximum number of links to check (for type=links, default: 50)", default: 50 },
        detailed: { type: "boolean", description: "Include detailed resource list (for type=performance, default: false)", default: false },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "security_scan",
    description: "Run website security scan: checks headers, XSS vulnerabilities, mixed content, and SSL/TLS. RECOMMENDATION: Set detailed: true for comprehensive assessment. DIFFERENT FROM audit: security_scan checks SECURITY (headers, XSS, SSL/TLS, mixed content, vulnerabilities). audit checks WEBSITE QUALITY (SEO, forms, performance, accessibility, broken links).",
    inputSchema: {
      type: "object",
      properties: {
        detailed: { type: "boolean", description: "Include detailed behavioral and vulnerability chaining assessment (default: false)", default: false },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },

  {
    name: "coverage",
    description: "Analyze CSS and JS coverage — shows percentage of unused code on the active page.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Coverage type: css, js, or both (default)", enum: ["css", "js", "both"], default: "both" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },

  {
    name: "shadow_dom",
    description: "List shadow DOM hosts or extract content from a specific web component / shadow root.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: list (all shadow hosts) or content (specific host)", enum: ["list", "content"], default: "list" },
        selector: { type: "string", description: "CSS selector of the shadow host (required for content action)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "iframe_list",
    description: "List all iframes on the page or extract content from a specific iframe by index.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: list (all iframes) or content (specific iframe)", enum: ["list", "content"], default: "list" },
        index: { type: "number", description: "Iframe index to extract content from (required for content action)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "design_clone",
    description: "Analyze a website's design (colors, typography, layout, components) and generate a detailed prompt for any AI to replicate the frontend pixel-perfectly.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "dom_mutations",
    description: "Observe and track dynamic DOM changes in SPAs via MutationObserver.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: start (begin observing), read (get mutations), stop (stop observing)", enum: ["start", "read", "stop"], default: "read" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "service_worker",
    description: "Check service worker registration, status, cache, and push subscription for the active page.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },

  {
    name: "find_tab",
    description: "Find a browser tab by URL pattern.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL pattern to search for" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  

  {
    name: "extract_page",
    description: "EXTRACT page content in one step. Runs snapshot() + get_markdown() sequentially and returns: element refs, markdown content, and metadata. USE INSTEAD OF: calling snapshot and get_markdown separately. Best for: reading articles, documentation, or any page where you need both interactive refs and readable content.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of a target subtree (optional)" },
        maxLength: { type: "number", description: "Maximum content length in characters (default: 50000)", default: 50000 },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "select_autocomplete",
    description: "Expert tool for combo-box / autocomplete fields (airport, city, address, etc.). FOCUSES the field, types text per-character (triggers debounce search), waits for dropdown, then selects the first or best-matching suggestion. USE THIS instead of fill() on any field with role='combobox' or aria-autocomplete. Returns the final selected value.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref (from snapshot) of the combo-box/autocomplete input field. Example: '@e17'" },
        text: { type: "string", description: "Text to type character-by-character into the field to trigger autocomplete search. Example: 'Москва' or 'London'" },
        selectValue: { type: "string", description: "Optional: specific text to match in the dropdown. If omitted, the first suggestion (ArrowDown + Enter) is selected. Example: 'Москва, Россия'" },
        itemSelector: { type: "string", description: "Optional: custom CSS selector for dropdown suggestion items. Default: '[role=\"option\"], [role=\"listbox\"] [role=\"option\"], [data-option-value], .autocomplete-item'" },
        delay: { type: "number", description: "Delay in ms between each typed character (default: 80). Increase to 150-300 for slow autocomplete APIs." },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "click_and_verify",
    description: "CLICK an element then WAIT for the page to settle. Runs click() + wait(type: 'network_idle') + screenshot(). USE INSTEAD OF: calling click, wait, and screenshot separately. Best for: button clicks, link clicks, form submissions, or any navigation trigger that needs visual confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of the element to click. Examples: '@e5' (snapshot reference), 'button#submit'." },
        mode: { type: "string", description: "Click mode: 'synthetic' (default), 'physical', or 'humanized'", enum: ["synthetic", "physical", "humanized"], default: "synthetic" },
        waitFor: { type: "string", description: "Condition to wait for after click: 'network_idle' (default), 'navigation', or 'none'", enum: ["network_idle", "navigation", "none"], default: "network_idle" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["selector"],
    },
  },
  {
    name: "discover_tools",
    description: "Browse and get full usage documentation for all specialized tools by category. Use this to find the right tool for your task and get its complete schema with examples.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Tool category to discover: 'session' (session/cookies), 'network' (request interceptors/HAR), 'diagnostics' (console/emulation/dialogs), 'audits' (security/accessibility/links), 'advanced' (viewport/bounds/bookmarks), or 'all' (compact list of all categories)",
          enum: ["session", "network", "diagnostics", "audits", "advanced", "all"],
          default: "all"
        }
      }
    }
  },
];

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
const ADVANCED_TOOLS = ["get_element_bounds", "humanize", "send_keys", "evaluate", "list_tabs", "close_tab", "hover", "select", "get_text", "save_as_pdf", "upload", "bookmark", "extension", "speech_to_text", "translate", "shadow_dom", "iframe_list", "service_worker", "swagger_parser", "color_palette", "form_fill", "dismiss_overlay", "wait_stale", "find_by_text", "find_tab", "select_autocomplete"];

const CORE_TOOL_NAMES = new Set([
  "navigate", "snapshot", "screenshot", "click", "fill",
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
      registerMsg.nonce = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
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

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
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

server.setRequestHandler(SubscribeRequestSchema, async (request) => {
  logInfo("Resource subscribe request", { uri: request.params.uri });
  return {};
});

const PROMPTS = [
  {
    name: "extract_and_summarize",
    description: "Extract page content as markdown and produce a structured summary",
    arguments: [
      { name: "detail", description: "Summary detail level: 'brief', 'normal', 'detailed'", required: false },
    ],
  },
  {
    name: "fill_form_and_submit",
    description: "Complete a multi-field form and submit it — use when the user asks to fill a form with multiple fields",
    arguments: [
      { name: "formDescription", description: "What the form is for (e.g. 'login', 'registration', 'search')", required: true },
    ],
  },
  {
    name: "check_accessibility",
    description: "Run an accessibility audit and report findings for the current page",
    arguments: [
      { name: "severity", description: "Minimum severity to report: 'error', 'warning', 'notice'", required: false },
    ],
  },
  {
    name: "extract_data",
    description: "Extract structured data from the current page (tables, lists, key-value pairs)",
    arguments: [
      { name: "target", description: "What to extract: 'tables', 'lists', 'all'", required: false },
    ],
  },
  {
    name: "analyze_form",
    description: "Analyze forms on the current page and suggest fill values",
    arguments: [],
  },
];

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

    let responseMarkdown = `## Tools — Category: ${category.toUpperCase()}\n\nFull schemas:\n\n`;

    for (const toolName of targetTools) {
      const toolDef = TOOLS.find(t => t.name === toolName);
      if (toolDef) {
        responseMarkdown += `#### 🛠️ Tool: \`${toolDef.name}\`\n`;
        responseMarkdown += `* **Description**: ${toolDef.description}\n`;
        responseMarkdown += `* **Input Schema**:\n\`\`\`json\n${JSON.stringify(toolDef.inputSchema, null, 2)}\n\`\`\`\n\n`;
      }
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

  

  if (name === "extract_page") {
    logInfo("Macro: extract_page", args);
    const tabId = args?.tabId;
    const snapResult = await sendToolCall("snapshot", { selector: args?.selector, tabId });
    if (snapResult.error) return errorResult(`snapshot failed: ${snapResult.error}`, "Ensure the page is loaded. Try navigate() first.");
    const mdResult = await sendToolCall("get_markdown", { selector: args?.selector, tabId });
    if (mdResult.error) return errorResult(`get_markdown failed: ${mdResult.error}`, "The page may be empty or unloaded.");
    return successResult(
      `=== Snapshot (${snapResult.data?.refCount || 0} refs) ===\n${snapResult.data?.tree || ""}\n\n=== Markdown ===\n${mdResult.data || ""}`,
      {
        snapshot: { refCount: snapResult.data?.refCount, truncated: snapResult.data?.truncated, tree: snapResult.data?.tree },
        markdown: { text: mdResult.data },
      }
    );
  }

  

  if (name === "click_and_verify") {
    logInfo("Macro: click_and_verify", args);
    const clickResult = await sendToolCall("click", { selector: args.selector, mode: args.mode || "synthetic", tabId: args?.tabId });
    if (clickResult.error) return errorResult(`click failed: ${clickResult.error}`, nextStep);
    const waitFor = args.waitFor || "network_idle";
    if (waitFor !== "none") {
      await sendToolCall("wait", { type: waitFor, tabId: args?.tabId }).catch(() => {});
    }
    const screenshotResult = await sendToolCall("screenshot", { tabId: args?.tabId });
    if (screenshotResult?.data?.data) {
      const mimeType = (screenshotResult.data.format || "jpeg") === "png" ? "image/png" : "image/jpeg";
      return {
        content: [
          { type: "text", text: `Clicked ${args.selector} and waited for ${waitFor}.` },
          { type: "image", data: screenshotResult.data.data, mimeType },
        ],
      };
    }
    return successResult(`Clicked ${args.selector} and waited for ${waitFor}.`);
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
