export const TOOLS = [
  {
    name: "navigate_smart",
    description: "Navigate, dismiss overlays, and return snapshot in one call. Use instead of navigate+dismiss_overlay+snapshot sequence. Reduces roundtrips significantly.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        dismissOverlays: { type: "boolean", default: true },
      },
      required: ["url"]
    }
  },
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
    outputSchema: {
      type: "object",
      properties: {
        tree: { type: "string", description: "Indented accessibility tree with @e refs" },
        truncated: { type: "boolean" },
        url: { type: "string" },
        title: { type: "string" },
        estimatedTokens: { type: "integer" },
        unchanged: { type: "boolean" },
        hint: { type: "string" },
        suggestedNextTool: { type: "string" }
      }
    }
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
    outputSchema: {
      type: "object",
      properties: {
        format: { type: "string" },
        width: { type: "integer" },
        height: { type: "integer" },
        pageTitle: { type: "string" }
      }
    }
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
        force: { type: "boolean", description: "Must be true to bypass safety confirmation (mandatory if SDK lacks elicitation)" },
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
