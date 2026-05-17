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

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import WebSocket from "ws";

const DAEMON_URL = process.env.WEBBRIDGE_WS_URL || "ws://127.0.0.1:10086/ws";

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "navigate",
    description: "Open a URL in the browser. Can open in a new tab or navigate the current tab.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
        newTab: { type: "boolean", description: "Open in a new tab (default: true)", default: true },
      },
      required: ["url"],
    },
  },
  {
    name: "snapshot",
    description: "Capture the accessibility tree of the active page. Returns element refs (like @e1) for use with click/fill tools.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "screenshot",
    description: "Take a screenshot of the current page. Returns base64 PNG image.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector to screenshot a specific element (optional)",
        },
      },
    },
  },
  {
    name: "click",
    description: "Click an element on the page by CSS selector or snapshot ref (e.g. @e1).",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of the element to click" },
      },
      required: ["selector"],
    },
  },
  {
    name: "fill",
    description: "Fill a form field with a value by CSS selector or snapshot ref.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of the form field" },
        value: { type: "string", description: "Value to fill in" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "key_type",
    description: "Type text into the currently focused element.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to type" },
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
      },
      required: ["keys"],
    },
  },
  {
    name: "evaluate",
    description: "Execute JavaScript code on the active page and return the result.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code to execute" },
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
    name: "find_tab",
    description: "Find a tab by URL pattern.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL pattern to search for" },
      },
      required: ["url"],
    },
  },
  {
    name: "close_tab",
    description: "Close a browser tab by ID.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID to close" },
      },
    },
  },
  {
    name: "mouse_click",
    description: "Perform a physical mouse click at the center of an element using CDP Input events.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref" },
      },
      required: ["selector"],
    },
  },
  {
    name: "network",
    description: "Capture, list, or inspect HTTP network requests.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Sub-command: list, capture, inspect", enum: ["list", "capture", "inspect"] },
      },
    },
  },
  {
    name: "hover",
    description: "Hover over an element by CSS selector or snapshot ref. Triggers mouseover/mouseenter events.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref of the element to hover over" },
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
        selector: { type: "string", description: "CSS selector or @e ref of the <select> element" },
        value: { type: "string", description: "Option value or text content to select. Use a number for index." },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "get_text",
    description: "Extract text content from the page or a specific element. Returns clean text without HTML markup.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or @e ref (optional — returns full page text if omitted)" },
        maxLength: { type: "number", description: "Maximum text length to return (default: 50000)" },
        includeHidden: { type: "boolean", description: "Include hidden/invisible elements (default: false)" },
      },
    },
  },
  {
    name: "cookie",
    description: "Get, set, or delete cookies for the current page.",
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
      },
      required: ["cmd"],
    },
  },
  {
    name: "history",
    description: "Navigate browser history: go back, go forward, or refresh the current page.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: back, forward, or refresh", enum: ["back", "forward", "refresh"] },
        ignoreCache: { type: "boolean", description: "Bypass cache on refresh (default: false)" },
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
      },
      required: ["cmd"],
    },
  },
  {
    name: "viewport",
    description: "Change the browser viewport size, device scale factor, and touch mode. Useful for responsive testing.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: set, get, or reset", enum: ["set", "get", "reset"] },
        width: { type: "number", description: "Viewport width in pixels (default: 1280)" },
        height: { type: "number", description: "Viewport height in pixels (default: 720)" },
        deviceScaleFactor: { type: "number", description: "Device pixel ratio (default: 1)" },
        mobile: { type: "boolean", description: "Enable mobile mode (default: false)" },
        touch: { type: "boolean", description: "Enable touch emulation (default: same as mobile)" },
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
        type: { type: "string", description: "Filter by log type: log, warn, error, info, debug" },
        limit: { type: "number", description: "Max entries to return (default: 100)" },
        offset: { type: "number", description: "Offset for pagination (default: 0)" },
      },
      required: ["cmd"],
    },
  },
  {
    name: "dialog",
    description: "Handle JavaScript dialogs (alert, confirm, prompt, beforeunload). List, accept/dismiss, or auto-handle.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Action: list, handle, or auto", enum: ["list", "handle", "auto"] },
        accept: { type: "boolean", description: "Accept (true) or dismiss (false) the dialog (default: true)" },
        promptText: { type: "string", description: "Text to enter in prompt dialogs" },
        disable: { type: "boolean", description: "Disable auto-handler (for auto cmd)" },
      },
      required: ["cmd"],
    },
  },
  {
    name: "emulate",
    description: "Emulate a mobile device, set geolocation, or change user agent. Includes device presets.",
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
      },
      required: ["cmd"],
    },
  },
  {
    name: "session",
    description: "Save and restore browser session state (open tabs). Persists across service worker restarts.",
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
    description: "Scroll the page or a specific element in a given direction by viewport heights.",
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", description: "Direction: down, up, left, right, top, bottom", enum: ["down", "up", "left", "right", "top", "bottom"] },
        amount: { type: "number", description: "Number of viewport heights to scroll (default: 3)" },
        selector: { type: "string", description: "CSS selector to scroll a specific element (optional — scrolls page if omitted)" },
      },
    },
  },
  {
    name: "wait",
    description: "Wait for a condition on the page: element to appear (selector), navigation to complete, or network idle.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Wait type: selector, navigation, or network_idle", enum: ["selector", "navigation", "network_idle"] },
        selector: { type: "string", description: "CSS selector to wait for (for type=selector)" },
        timeout: { type: "number", description: "Maximum wait time in ms (default: 10000)" },
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
      },
      required: ["source", "target"],
    },
  },
];

// ── WebSocket connection to daemon ───────────────────────────────────────────
let ws = null;
let requestIdCounter = 0;
const pendingCalls = new Map();

function connectToDaemon() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(DAEMON_URL);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "register" }));
      resolve();
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (msg.type === "tool_result" && msg.responseToRequestId) {
        const resolver = pendingCalls.get(msg.responseToRequestId);
        if (resolver) {
          pendingCalls.delete(msg.responseToRequestId);
          resolver(msg.payload);
        }
      }
    });

    ws.on("close", () => {
      ws = null;
      for (const [id, resolver] of pendingCalls) {
        pendingCalls.delete(id);
        resolver({ error: "WebSocket disconnected" });
      }
    });

    ws.on("error", (err) => {
      reject(err);
    });

    setTimeout(() => reject(new Error("Connection timeout")), 10000);
  });
}

function sendToolCall(name, args) {
  return new Promise(async (resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      try {
        await connectToDaemon();
      } catch (e) {
        resolve({ error: `Cannot connect to daemon: ${e.message}. Make sure daemon.js is running.` });
        return;
      }
    }

    const requestId = String(++requestIdCounter);
    const timeout = setTimeout(() => {
      pendingCalls.delete(requestId);
      resolve({ error: `Tool call timed out (30s): ${name}` });
    }, 30000);

    pendingCalls.set(requestId, (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });

    ws.send(
      JSON.stringify({
        type: "tool_call",
        requestId,
        payload: { name, args },
      })
    );
  });
}

// ── MCP Server ───────────────────────────────────────────────────────────────
const server = new Server(
  {
    name: "webbridge-open",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const result = await sendToolCall(name, args || {});

  if (result.error) {
    return {
      content: [{ type: "text", text: `Error: ${result.error}` }],
      isError: true,
    };
  }

  const data = result.data;

  // For screenshots, return as image
  if (name === "screenshot" && data?.data) {
    return {
      content: [
        {
          type: "image",
          data: data.data,
          mimeType: "image/png",
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

  let sseTransport;

  app.get("/sse", (req, res) => {
    sseTransport = new SSEServerTransport("/message", res);
    server.connect(sseTransport);
  });

  app.post("/message", express.json(), (req, res) => {
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
