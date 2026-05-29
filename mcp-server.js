/**
 * WebBridge Open — MCP Server
 *
 * Model Context Protocol server that exposes browser automation tools
 * to AI agents (Claude Desktop, Cursor, Windsurf, etc.).
 *
 * Transport: stdio (for Claude Desktop / Cursor integration)
 * Backend:   connects to WebBridge daemon via WebSocket
 *
 * Usage:
 *   node mcp-server.js                          # stdio transport
 *   node mcp-server.js --transport sse --port 3001  # SSE transport
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "webbridge": {
 *         "command": "node",
 *         "args": ["C:/path/to/webbridge-open/mcp-server.js"]
 *       }
 *     }
 *   }
 */

import "dotenv/config";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import WebSocket from "ws";
import { appendFileSync, writeFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTIONS_DIR = join(__dirname, "transcriptions");

// File-based logger for debugging startup issues (Windsurf captures stderr via stdio)
function startupLog(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`;
  try { appendFileSync('/tmp/mcp-startup.log', line); } catch { }
}
startupLog('MCP server starting...');
process.on('uncaughtException', (err) => { startupLog('UNCAUGHT EXCEPTION:', err.message, err.stack); throw err; });
process.on('unhandledRejection', (err) => { startupLog('UNHANDLED REJECTION:', err); });

const DAEMON_URL = process.env.WEBBRIDGE_WS_URL || "ws://127.0.0.1:10086/ws";
const DEBUG = process.env.WEBBRIDGE_DEBUG === "1" || process.env.WEBBRIDGE_DEBUG === "true";

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

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "navigate",
    description: "Open a URL in the browser. RECOMMENDATION: Set 'newTab: true' (default) to start a clean session or isolate the page context. Set 'newTab: false' when continuing a search chain, submitting multiple steps, or navigating deep within the active domain.",
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
    description: "Capture the accessibility tree of the active page. RECOMMENDATION: Run this tool *first* on every new page load. It returns stable element references (like @e1, @e2) which you MUST use with 'click' and 'fill' tools to prevent selector errors and ensure 100% correct selector targeting.",
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
    description: "Take a screenshot of the current page. RECOMMENDATION: Use this tool to visually verify the result of dynamic transitions, form submissions, or modal overlays. Avoid using it blindly — always run it when you need to align your mental model with the browser viewport.",
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
    description: "Click an element. RECOMMENDATION: Always use standard DOM click (physical: false, default) first. Switch to 'physical: true' ONLY if synthetic click fails to trigger an event, for Canvas/SVG elements, or when custom event listeners block standard clicks. For anti-bot protected pages, use humanize(cmd: mouse_move, click: true) instead of click(physical: true).",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector, @e ref, or semantic selector of the element to click. Examples: '@e5' (snapshot reference), 'button#submit' (standard CSS), 'semantic:Log In button' (semantic)" },
        physical: { type: "boolean", description: "Perform a physical mouse click using CDP input events instead of a DOM-level synthetic click. (default: false)", default: false },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["selector"],
    },
  },
  {
    name: "fill",
    description: "Fill a form field with a value by CSS selector or snapshot ref. RECOMMENDATION: Use the stable snapshot @e ref (e.g. '@e5') obtained from the 'snapshot' tool to target the input. PREFER fill over humanize for standard form inputs (no anti-bot). Switch to 'humanize(cmd: type)' ONLY if the input rejects standard fill (hidden, anti-bot, React-controlled, or Cloudflare protected).",
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
    name: "key_type",
    description: "Type text into the currently focused element. RECOMMENDATION: Prefer fill or humanize(cmd: type) over key_type for form inputs. Use key_type ONLY when the input is already focused (e.g., after clicking into a contenteditable div, textarea, or terminal-like input) and you need character-by-character typing.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to type" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["text"],
    },
  },
  {
    name: "send_keys",
    description: "Send key combinations (e.g. Enter, Ctrl+A, Tab).",
    inputSchema: {
      type: "object",
      properties: {
        keys: { type: "string", description: "Key combination, e.g. 'Enter', 'Ctrl+A', 'Tab'" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["keys"],
    },
  },
  {
    name: "evaluate",
    description: "Execute JavaScript code on the active page and return the result. RECOMMENDATION: Use this tool ONLY when you need to inspect custom window states, trigger custom DOM methods, or read complex states not available via standard get_text or snapshot. Always keep code blocks short and handle exceptions inside.",
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
    description: "Capture, list, or inspect HTTP network requests, and manage ad/tracker blocking. RECOMMENDATION: Use `cmd: block_ads` at the start of navigation to block heavy ads/analytics trackers natively via CDP. This speeds up rendering and page interaction by 300%!",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Sub-command: list, capture, inspect, or block_ads", enum: ["list", "capture", "inspect", "block_ads"] },
        enable: { type: "boolean", description: "Enable (true) or disable (false) ad/tracker blocking (only for block_ads cmd, default: true)", default: true },
        filter: { type: "string", description: "Filter string to match URLs (only for list cmd)" },
        requestId: { type: "string", description: "Request ID to retrieve full response body (only for detail/inspect cmd)" },
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
    description: "Extract the active page or a targeted element's content as clean, semantic Markdown. RECOMMENDATION: Use this tool *instead* of get_text(format: 'text') or get_text(format: 'html') when you need to read structured content (articles, documentation, tables, manuals) while keeping list formatting, headers, table grids, and image/link targets perfectly preserved. This saves up to 80% tokens compared to raw HTML while giving high reading comprehension for the model. PREFER get_markdown over get_text for ANY structured content; use get_text ONLY for plain text extraction or when you need raw HTML.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of the DOM element to convert to Markdown. Examples: '@e12' (snapshot ref), 'article.post-content' (CSS), '#main-article' (CSS). (default: 'body')", default: "body" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "get_element_bounds",
    description: "Locate and retrieve the physical coordinate bounding boxes (x, y, width, height) of all visible interactive elements on the page. RECOMMENDATION: Use this tool to achieve 'visual grounding' when coordinating actions with a 'screenshot' — it maps DOM nodes to precise viewport coordinates. Use the returned (x, y) coordinates as arguments for 'humanize(cmd: mouse_move)' or 'click(physical: true)'.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "humanize",
    description: "Anti-bot human-like inputs emulator. RECOMMENDATION: Use this tool *instead* of standard 'click' or 'fill' when interacting with pages protected by strict firewalls/anti-bot systems (Cloudflare, Datadome, Akamai). It bypasses detection by simulating natural mouse movements along cubic Bezier curves and key-by-key typing with randomized human intervals (50ms-150ms). PREFERED ORDER for typing: 1) fill (fastest, works on most inputs), 2) humanize(cmd: type) (for anti-bot inputs), 3) key_type (for already-focused custom elements). PREFERED ORDER for clicking: 1) click(physical: false) (DOM click), 2) click(physical: true) (CDP click), 3) humanize(cmd: mouse_move, click: true) (for anti-bot).",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Operation mode: 'mouse_move' (Bezier curve cursor movement) or 'type' (natural keystroke typist)", enum: ["mouse_move", "type"], default: "mouse_move" },
        selector: { type: "string", description: "Target CSS selector or @e ref (for mouse_move destination or element focusing). Examples: '@e15' (snapshot ref), 'input#agent-name' (CSS)" },
        x: { type: "number", description: "Target X coordinate (viewport relative pixels, used only for mouse_move if selector is omitted)" },
        y: { type: "number", description: "Target Y coordinate (viewport relative pixels, used only for mouse_move if selector is omitted)" },
        steps: { type: "number", description: "Bezier mouse curve movement steps (default: 15). More steps = slower, smoother, more human-like movement.", default: 15 },
        click: { type: "boolean", description: "Perform a physical coordinates mouse click after Bezier curve reaches destination (default: false, only for mouse_move)", default: false },
        text: { type: "string", description: "Text content to type. Example: 'Standard Inputs & Wait Timing' (only for type command)" },
        delayMin: { type: "number", description: "Minimum typing delay per key in milliseconds (default: 50, only for type)", default: 50 },
        delayMax: { type: "number", description: "Maximum typing delay per key in milliseconds (default: 150, only for type)", default: 150 },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["cmd"],
    },
  },
  {
    name: "session_manager",
    description: "Save and restore browser authentication session contexts (cookies, localStorage, sessionStorage). RECOMMENDATION: Use this tool to serialize the authentication context to a local JSON file in your workspace after logging in, and load it back during subsequent runs to instantly bypass repeated logins, MFA prompts, or CAPTCHAs. DIFFERENT FROM session: session_manager saves AUTH/cookies/localStorage, while session saves/restores OPEN TABS (navigation state).",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Operation: 'save' (returns full serialized session state) or 'load' (restores session state and reloads the page)", enum: ["save", "load"], default: "save" },
        session: {
          type: "object",
          description: "Full serialized session context JSON object containing cookies and DOM storage states (required only for load). Example: Pass the object returned by the 'save' command.",
        },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["cmd"],
    },
  },
  {
    name: "cookie",
    description: "Get, set, or delete cookies for the current page. DIFFERENT FROM session_manager: cookie manipulates individual cookies (get/set/delete one at a time), while session_manager saves/restores the FULL cookie jar + localStorage together for auth persistence.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: get, set, or delete", enum: ["get", "set", "delete"] },
        name: { type: "string", description: "Cookie name" },
        value: { type: "string", description: "Cookie value (for set)" },
        domain: { type: "string", description: "Cookie domain (for set)" },
        path: { type: "string", description: "Cookie path (for set)" },
        secure: { type: "boolean", description: "Secure flag (for set)" },
        httpOnly: { type: "boolean", description: "HttpOnly flag (for set)" },
        sameSite: { type: "string", description: "SameSite policy (for set): Strict, Lax, None" },
        expires: { type: "number", description: "Expiration timestamp in seconds since epoch (for set)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["cmd"],
    },
  },
  {
    name: "intercept",
    description: "Intercept, modify, block, or mock HTTP requests. Start interception, add rules, then stop when done.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: start, stop, add_rule, remove_rule, list_rules", enum: ["start", "stop", "add_rule", "remove_rule", "list_rules"] },
        pattern: { type: "string", description: "URL substring to match (for add_rule)" },
        action: { type: "string", description: "Intercept action: block, redirect, modify, mock (for add_rule)", enum: ["block", "redirect", "modify", "mock"] },
        redirectUrl: { type: "string", description: "Redirect target URL (for redirect action)" },
        headers: { type: "object", description: "Headers to add/modify (for modify action)" },
        mockBody: { type: "string", description: "Response body for mock action" },
        mockHeaders: { type: "object", description: "Response headers for mock action" },
        responseCode: { type: "number", description: "HTTP response code (for mock/redirect)" },
        ruleId: { type: "string", description: "Rule ID (for remove_rule)" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["cmd"],
    },
  },
  {
    name: "viewport",
    description: "Change the browser viewport size, device scale factor, and touch mode. Useful for responsive testing. DIFFERENT FROM emulate: viewport only changes WINDOW SIZE and touch settings. For full device emulation (with user agent, device presets, geolocation), use emulate instead.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: set, get, or reset", enum: ["set", "get", "reset"] },
        width: { type: "number", description: "Viewport width in pixels (default: 1280)" },
        height: { type: "number", description: "Viewport height in pixels (default: 720)" },
        deviceScaleFactor: { type: "number", description: "Device pixel ratio (default: 1)" },
        mobile: { type: "boolean", description: "Enable mobile mode (default: false)" },
        touch: { type: "boolean", description: "Enable touch emulation (default: same as mobile)" },
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
    name: "session",
    description: "Save and restore browser session state (open tabs). Persists across service worker restarts. DIFFERENT FROM session_manager: session saves/restores OPEN TABS (navigation state), while session_manager saves/restores AUTHENTICATION context (cookies, localStorage) for passing logins between runs.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: save, restore, clear, or info", enum: ["save", "restore", "clear", "info"] },
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
    description: "Wait for a condition on the page. RECOMMENDATION: Wait for 'network_idle' after clicking form submits to ensure the request is processed, or wait for 'selector' to verify dynamic element rendering.",
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
    description: "Set files on a file input element (<input type=\"file\">) by CSS selector or @e ref.",
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
    description: "Transcribe audio from a video on the active page using local Whisper (offline, no API key). Automatically extracts the direct video URL from the page (Twitter/X, YouTube, etc.), downloads it, and returns the transcript text. Optional: auto-translate to target language. Requires local Whisper server to be running (services/whisper/whisper-server.py).",
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
    name: "websocket_monitor",
    description: "Capture, read, or clear intercepted WebSocket send/receive messages on the active page.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: capture (install interceptors), read (get messages), clear", enum: ["capture", "read", "clear"], default: "capture" },
        maxMessages: { type: "number", description: "Max messages to keep in memory (default: 100)", default: 100 },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "har_export",
    description: "Export network activity from the active page in HAR format for offline analysis or DevTools import.",
    inputSchema: {
      type: "object",
      properties: {
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
    name: "redirect_chain",
    description: "Trace the full redirect chain for a given URL with status codes for each hop.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to trace redirects for (required)" },
      },
      required: ["url"],
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
    name: "api_discovery",
    description: "Automatically find API endpoints in page JS code by scanning fetch, axios, XHR patterns and Performance API history.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "swagger_parser",
    description: "Parse Swagger / OpenAPI specification from the active page and extract endpoints, parameters, and schemas.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Optional: direct URL to swagger.json" },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "color_palette",
    description: "Extract dominant colors from the website for branding and design analysis.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "table_extract",
    description: "Extract structured data from HTML tables on the page. Returns JSON array of rows with column headers as keys. RECOMMENDATION: Prefer table_extract over get_text or get_markdown when you need to analyze tabular data (prices, schedules, stats, comparison tables). Use format='csv' for spreadsheet-ready output. Specify a CSS selector to target a specific table if multiple exist.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for the table (default: 'table'). Examples: 'table.pricing', '#schedule', 'table:first-of-type'", default: "table" },
        format: { type: "string", description: "Output format: 'json' (default, structured objects) or 'csv' (comma-separated)", enum: ["json", "csv"], default: "json" },
        maxRows: { type: "number", description: "Maximum rows to extract (default: 500)", default: 500 },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
    },
  },
  {
    name: "form_fill",
    description: "Fill a complete form with multiple fields in one call. Handles text inputs, selects, checkboxes, radio buttons, date pickers. RECOMMENDATION: Prefer form_fill over calling fill/select/click separately for each form field. Pass all field values as a JSON object in 'fields' parameter. The tool automatically finds fields by name, id, aria-label, or placeholder.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for the form element (default: 'form'). Examples: '#login-form', 'form:first-of-type'", default: "form" },
        fields: {
          type: "object",
          description: "Key-value pairs of field names/IDs to values. Examples: {\"email\": \"user@example.com\", \"password\": \"mypass\", \"remember\": true, \"country\": \"US\"}",
          additionalProperties: { type: "string" },
        },
        submit: { type: "boolean", description: "Automatically click the submit button after filling (default: true)", default: true },
        tabId: { type: "number", description: "Tab ID to target (default: active tab)" },
      },
      required: ["fields"],
    },
  },
];

// ── WebSocket connection to daemon ───────────────────────────────────────────
let ws = null;
let requestIdCounter = 0;
const pendingCalls = new Map();
let reconnectTimer = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

function scheduleReconnect() {
  if (reconnectTimer) return; // Already scheduled
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  console.error(`[mcp] reconnecting to daemon in ${delay}ms...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToDaemon().catch(() => { }); // scheduleReconnect will be called again on close
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
      // Add random nonce for replay protection
      registerMsg.nonce = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
      // Pass auth token if configured via env
      const token = process.env.WEBBRIDGE_TOKEN;
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

      // Handle binary frames (for screenshots)
      if (isBinary) {
        // Binary frame: first 4 bytes = requestId (uint32 LE), rest = binary data
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
      // Auto-reconnect
      scheduleReconnect();
    });

    ws.on("error", (err) => {
      logError("WebSocket error", err.message);
      reject(err);
    });
  });
}

function sendToolCall(name, args) {
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

    const requestId = String(++requestIdCounter);
    logInfo("Sending tool call", { name, requestId });

    const timeout = setTimeout(() => {
      pendingCalls.delete(requestId);
      logError("Tool call timeout", { name, requestId });
      resolve({ error: `Tool call timed out (30s): ${name}` });
    }, 30000);

    pendingCalls.set(requestId, (payload) => {
      clearTimeout(timeout);
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
          payload: { name, args },
        })
      );
      logDebug("Message sent to daemon", { requestId, name });
    } catch (e) {
      logError("Failed to send message to daemon", e.message);
      clearTimeout(timeout);
      pendingCalls.delete(requestId);
      resolve({ error: `Failed to send to daemon: ${e.message}` });
    }
  });
}

// ── Speech-to-Text Helpers ───────────────────────────────────────────────────

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
    tempPath = `/tmp/mcp-audio-${Date.now()}.mp4`;
    try {
      execSync(`yt-dlp -f ba -o "${tempPath}" "${videoUrl}"`, { timeout: 120000, stdio: "ignore" });
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

// ── Translate Helper ────────────────────────────────────────────────────────
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

// ── MCP Server ───────────────────────────────────────────────────────────────
// Self-Healing: Automatically correct missing '@' prefix in snapshot refs (e.g. 'e12' -> '@e12')
function healSnapshotRefs(args) {
  if (!args || typeof args !== "object") return;
  const keys = ["selector", "source", "target"];
  const refPattern = /^e\d+$/; // matches 'e1', 'e12', but not 'email' or 'enter'
  for (const key of keys) {
    if (typeof args[key] === "string" && refPattern.test(args[key].trim())) {
      const healed = `@${args[key].trim()}`;
      startupLog(`[Self-Healing] Automatically corrected snapshot ref typo: "${args[key]}" -> "${healed}"`);
      args[key] = healed;
    }
  }
}

const CORE_TOOL_NAMES = new Set([
  "navigate", "snapshot", "screenshot", "click", "fill", "get_markdown", "discover_tools"
]);

const discover_tools_schema = {
  name: "discover_tools",
  description: `Unlocks specialized browser automation tools hidden from the initial tool list to save tokens.

⚠️ CRITICAL RULE: You start with only 7 core tools. Before calling ANY tool not in your list, call discover_tools first.

WHEN TO CALL (choose the right category):
- "session"     → save/load browser sessions, manage cookies, localStorage
- "network"     → intercept requests, monitor WebSocket, export HAR, block ads
- "diagnostics" → read console errors, emulate mobile device, handle JS dialogs, scroll/wait
- "audits"      → SEO audit, accessibility check, performance metrics, security scan
- "advanced"    → element coordinates, keyboard input, hover, drag-drop, save PDF, upload files
- "all"         → show everything (use only if you don't know which category)

EXAMPLE WORKFLOW:
  User: "save the session"
  Wrong ❌: session_manager({action:"save"}) → ERROR: Unknown tool
  Right  ✅: discover_tools({category:"session"}) → then session_manager({action:"save",name:"my-session"})

After calling discover_tools, you receive full schemas + usage examples for each unlocked tool.`,
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Tool category to discover: 'session' (session/cookies), 'network' (request interceptors/HAR), 'diagnostics' (console/emulation/dialogs), 'audits' (security/accessibility/links), 'advanced' (viewport/bounds/bookmarks), or 'all' (all categories)",
        enum: ["session", "network", "diagnostics", "audits", "advanced", "all"],
        default: "all"
      }
    }
  }
};


const server = new Server(
  {
    name: "webbridge-open",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const coreTools = TOOLS.filter(t => CORE_TOOL_NAMES.has(t.name));
  return {
    tools: [...coreTools, discover_tools_schema],
  };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "openweb://docs/automation-guide",
      name: "OpenWeb Automation Guide & Cheat Sheet",
      mimeType: "text/markdown",
      description: "A comprehensive, AI-native guide detailing browser automation decision-making, visual priorities, and coordinate self-healing recovery strategies."
    }
  ]
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
  throw new Error(`Resource not found: ${uri}`);
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logInfo("MCP tool call received", { name, args });

  // Self-Healing: Automatically correct missing '@' prefix in snapshot refs (e.g. 'e12' -> '@e12')
  if (args) {
    healSnapshotRefs(args);
  }

  if (name === "discover_tools") {
    const category = args.category || "all";
    const sessionTools = ["session_manager", "cookie", "session", "local_storage"];
    const networkTools = ["network", "intercept", "websocket_monitor", "har_export", "redirect_chain"];
    const diagnosticsTools = ["console", "dialog", "viewport", "emulate", "scroll", "wait", "drag_drop", "design_clone", "dom_mutations"];
    const auditsTools = ["audit", "security_scan", "coverage"];
    const advancedTools = ["get_element_bounds", "humanize", "key_type", "send_keys", "evaluate", "list_tabs", "close_tab", "hover", "select", "get_text", "save_as_pdf", "upload", "bookmark", "extension", "speech_to_text", "translate", "shadow_dom", "iframe_list", "service_worker", "api_discovery", "swagger_parser", "color_palette"];

    const categories = {
      session: sessionTools,
      network: networkTools,
      diagnostics: diagnosticsTools,
      audits: auditsTools,
      advanced: advancedTools
    };

    let targetTools = [];
    if (category === "all") {
      targetTools = [...sessionTools, ...networkTools, ...diagnosticsTools, ...auditsTools, ...advancedTools];
    } else {
      targetTools = categories[category] || [];
    }

    let responseMarkdown = `### 📂 Exposed Specialized Tools - Category: ${category.toUpperCase()}\n\n`;
    responseMarkdown += `You can directly invoke any of these tools by name using standard CallTool JSON parameters. Their detailed schemas and instructions are outlined below:\n\n`;

    for (const toolName of targetTools) {
      const toolDef = TOOLS.find(t => t.name === toolName);
      if (toolDef) {
        responseMarkdown += `#### 🛠️ Tool: \`${toolDef.name}\`\n`;
        responseMarkdown += `* **Description**: ${toolDef.description}\n`;
        responseMarkdown += `* **Input Schema**:\n\`\`\`json\n${JSON.stringify(toolDef.inputSchema, null, 2)}\n\`\`\`\n\n`;
      }
    }

    return {
      content: [{ type: "text", text: responseMarkdown }]
    };
  }

  if (name === "speech_to_text") {
    logInfo("Routing to speech_to_text handler");
    const result = await handleSpeechToText(args || {});
    if (result.error) {
      logError("speech_to_text handler returned error", result.error);
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }
    logInfo("speech_to_text handler succeeded");
    const output = result.translated
      ? `=== Original ===\n${result.text}\n\n=== Translated ===\n${result.translated}`
      : result.text;
    return {
      content: [{ type: "text", text: output }],
    };
  }

  if (name === "translate") {
    logInfo("Routing to translate handler");
    const result = await handleTranslate(args || {});
    if (result.error) {
      logError("translate handler returned error", result.error);
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }
    logInfo("translate handler succeeded");
    return {
      content: [{ type: "text", text: result.text }],
    };
  }

  const result = await sendToolCall(name, args || {});

  if (result.error) {
    logError("Tool call returned error", { name, error: result.error });
    return {
      content: [{ type: "text", text: `Error: ${result.error}` }],
      isError: true,
    };
  }

  const data = result.data;

  // For screenshots, return as image
  if (name === "screenshot" && data?.data) {
    const format = data.format || "jpeg";
    const mimeType = format === "png" ? "image/png" : "image/jpeg";
    return {
      content: [
        {
          type: "image",
          data: data.data,
          mimeType,
        },
      ],
    };
  }

  // For PDF exports, return as resource
  if (name === "save_as_pdf" && data?.data) {
    return {
      content: [
        {
          type: "text",
          text: `PDF exported successfully (${data.dataLength} bytes, page: "${data.pageTitle || "untitled"}"). Base64 data length: ${data.dataLength}`,
        },
      ],
    };
  }

  // For everything else, return as text
  const text =
    typeof data === "object" && data !== null
      ? JSON.stringify(data, null, 2)
      : String(data ?? "");

  return {
    content: [{ type: "text", text }],
  };
});

// ── Start ────────────────────────────────────────────────────────────────────
const transport = process.argv.includes("--transport")
  ? process.argv[process.argv.indexOf("--transport") + 1]
  : "stdio";

if (transport === "sse") {
  const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
  const express = (await import("express")).default;
  const port = parseInt(process.argv[process.argv.indexOf("--port") + 1] || "3001", 10);
  const app = express();

  // #10: Bearer auth middleware for SSE transport when token is configured
  const SSE_AUTH_TOKEN = process.env.WEBBRIDGE_TOKEN || null;
  function sseAuth(req, res, next) {
    if (!SSE_AUTH_TOKEN) return next(); // No token configured — open access
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
  // stdio transport (default) — for Claude Desktop, Cursor, etc.
  const stdioTransport = new StdioServerTransport();
  server.connect(stdioTransport);
  console.error("[mcp] WebBridge Open MCP server running (stdio transport)");
  console.error("[mcp] Daemon URL:", DAEMON_URL);
}
