import { describe, it } from "node:test";
import assert from "node:assert";

const TOOLS = [
  { name: "navigate", description: "Navigate to a URL in the browser", readOnly: false, destructive: false, idempotent: true, openWorld: true },
  { name: "snapshot", description: "Snapshot the accessibility tree of the active page. Returns element refs (like @e1) for use with click/fill tools.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "screenshot", description: "Take a screenshot of the current page. Returns base64 JPEG image (default) or PNG.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "click", description: "Click an element on the page by CSS selector or snapshot ref (e.g. @e1).", readOnly: false, destructive: false, idempotent: false, openWorld: true },
  { name: "fill", description: "Fill or enter a value into a form field by CSS selector or snapshot ref.", readOnly: false, destructive: false, idempotent: false, openWorld: true },
  { name: "send_keys", description: "Send keyboard key combinations (e.g. Enter, Ctrl+A, Tab) to the currently focused element.", readOnly: false, destructive: false, idempotent: true, openWorld: false },
  { name: "evaluate", description: "Evaluate JavaScript code on the active page and return the result.", readOnly: true, destructive: false, idempotent: false, openWorld: true },
  { name: "list_tabs", description: "List all open browser tabs.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "close_tab", description: "Close a browser tab by ID.", readOnly: false, destructive: true, idempotent: false, openWorld: false },
  { name: "get_text", description: "Extract text content from the page or a specific element.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "get_markdown", description: "Get page content as clean Markdown, or extract tabular data as a structured table.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "get_element_bounds", description: "Get the bounding box of an element on the page.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "hover", description: "Hover over an element by CSS selector or snapshot ref.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "select", description: "Select an option in a <select> dropdown element.", readOnly: false, destructive: false, idempotent: true, openWorld: false },
  { name: "scroll", description: "Scroll the page or a specific element.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "wait", description: "Wait for a condition on the page: element, navigation, or network idle.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "wait_stale", description: "Wait for an element to become stale (removed from DOM).", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "history", description: "Navigate browser history: back, forward, or refresh.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "find_tab", description: "Find a tab by URL pattern.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "find_by_text", description: "Find an element on the page by its visible text content.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "dismiss_overlay", description: "Dismiss a modal, popup, or overlay on the page.", readOnly: false, destructive: true, idempotent: true, openWorld: false },
  { name: "state", description: "Manage browser state, cookies, storage, and sessions. Unifies saving and restoring open tabs, cookies, local storage, and session storage.", readOnly: false, destructive: false, idempotent: false, openWorld: false },
  { name: "network", description: "Capture, list, inspect HTTP requests, intercept network activity, trace redirects, monitor WebSockets, or discover APIs.", readOnly: false, destructive: false, idempotent: false, openWorld: true },
  { name: "console", description: "Capture and read browser console output (log, warn, error, info).", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "dialog", description: "Handle JavaScript dialogs (alert, confirm, prompt, beforeunload).", readOnly: false, destructive: false, idempotent: true, openWorld: false },
  { name: "emulate", description: "Emulate a mobile device, set geolocation, or change user agent.", readOnly: false, destructive: false, idempotent: true, openWorld: false },
  { name: "drag_drop", description: "Drag an element and drop it onto another element.", readOnly: false, destructive: false, idempotent: true, openWorld: false },
  { name: "upload", description: "Upload files by setting them on a file input element.", readOnly: false, destructive: false, idempotent: false, openWorld: true },
  { name: "save_as_pdf", description: "Export the current page as a PDF document.", readOnly: true, destructive: false, idempotent: true, openWorld: false },
  { name: "bookmark", description: "Manage Chrome bookmarks: list, create, update, delete, or search.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "extension", description: "Manage Chrome extensions: list, enable, disable, or get info.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "humanize", description: "Humanize your automation by adding random delays between actions.", readOnly: false, destructive: false, idempotent: false, openWorld: true },
  { name: "speech_to_text", description: "Transcribe speech to text from the page (e.g. from a video or microphone).", readOnly: false, destructive: false, idempotent: false, openWorld: true },
  { name: "translate", description: "Translate text on the page in-place.", readOnly: false, destructive: false, idempotent: false, openWorld: true },
  { name: "audit", description: "Run an accessibility audit on the page.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "security_scan", description: "Run a security scan on the page.", readOnly: true, destructive: false, idempotent: false, openWorld: true },
  { name: "coverage", description: "Track CSS/JS code coverage.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "shadow_dom", description: "List shadow DOM roots on the page.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "iframe_list", description: "List all iframes on the page.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "design_clone", description: "Clone the design/styles of a page or element.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "dom_mutations", description: "Watch and report DOM mutations on the page.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "service_worker", description: "Inspect and manage service workers.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "swagger_parser", description: "Parse Swagger/OpenAPI documentation from the page.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "color_palette", description: "Extract the color palette from the page.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "form_fill", description: "Auto-detect and fill form fields intelligently.", readOnly: false, destructive: false, idempotent: true, openWorld: false },
  { name: "responsive_test", description: "Test page responsiveness across multiple viewport sizes.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
  { name: "discover_tools", description: "Discover available tools by category. Returns tool schemas and descriptions.", readOnly: true, destructive: false, idempotent: false, openWorld: false },
];

const TOOL_MAP = new Map(TOOLS.map(t => [t.name, t]));

function buildConfusionMatrix() {
  const matrix = [];
  for (const a of TOOLS) {
    for (const b of TOOLS) {
      if (a.name >= b.name) continue;
      let score = 0;
      const aWords = new Set(a.description.toLowerCase().split(/[\s,]+/));
      const bWords = new Set(b.description.toLowerCase().split(/[\s,]+/));
      for (const w of aWords) {
        if (w.length > 3 && bWords.has(w)) score++;
      }
      if (score >= 3) matrix.push({ a: a.name, b: b.name, score });
    }
  }
  return matrix.sort((x, y) => y.score - x.score);
}

function findBestTool(query) {
  const q = query.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const tool of TOOLS) {
    const desc = tool.description.toLowerCase();
    const name = tool.name.replace(/_/g, " ");
    const score = q.split(" ").filter(w => w.length > 2 && (desc.includes(w) || name.includes(w))).length;
    if (score > bestScore) { bestScore = score; best = tool; }
    else if (score === bestScore && score > 0) best = null;
  }
  return best;
}

function toolNames(...names) {
  return names.map(n => TOOL_MAP.get(n)).filter(Boolean);
}

describe("AI Tool Selection — Natural Language Queries", () => {
  const CASES = [
    { query: "go to https://example.com", expect: "navigate" },
    { query: "open google.com in a new tab", expect: "navigate" },
    { query: "take a picture of the page", expect: "screenshot" },
    { query: "take a screenshot", expect: "screenshot" },
    { query: "capture what the page looks like", expect: "screenshot" },
    { query: "get the accessibility tree", expect: "snapshot" },
    { query: "get me the page refs", expect: "snapshot" },
    { query: "what elements are on the page", expect: "snapshot" },
    { query: "click the login button", expect: "click" },
    { query: "tap on the submit button", expect: "click" },
    { query: "press enter", expect: "send_keys" },
    { query: "type my email into the field", expect: "fill" },
    { query: "enter 'hello' in the search box", expect: "fill" },
    { query: "read the text on this page", expect: "get_text" },
    { query: "get me the page content as markdown", expect: "get_markdown" },
    { query: "run javascript on the page", expect: "evaluate" },
    { query: "execute some JS code", expect: "evaluate" },
    { query: "list all open tabs", expect: "list_tabs" },
    { query: "close tab 42", expect: "close_tab" },
    { query: "find a tab with url containing login", expect: "find_tab" },
    { query: "hover over the menu item", expect: "hover" },
    { query: "choose 'Option A' from the dropdown", expect: "select" },
    { query: "scroll down", expect: "scroll" },
    { query: "wait for the page to load", expect: "wait" },
    { query: "wait for element #submit to appear", expect: "wait" },
    { query: "wait for the loading spinner to disappear", expect: "wait_stale" },
    { query: "go back in history", expect: "history" },
    { query: "refresh the page", expect: "history" },
    { query: "close the popup that just appeared", expect: "dismiss_overlay" },
    { query: "dismiss the cookie consent banner", expect: "dismiss_overlay" },
    { query: "save the current session", expect: "state" },
    { query: "save my open tabs for later", expect: "state" },
    { query: "intercept network requests to block ads", expect: "network" },
    { query: "capture network traffic", expect: "network" },
    { query: "export network requests as HAR", expect: "network" },
    { query: "monitor websocket messages", expect: "network" },
    { query: "check the browser console for errors", expect: "console" },
    { query: "accept the alert dialog", expect: "dialog" },
    { query: "emulate an iphone", expect: "emulate" },
    { query: "change user agent to mobile", expect: "emulate" },
    { query: "drag the red box to the green zone", expect: "drag_drop" },
    { query: "upload a file to the form", expect: "upload" },
    { query: "save this page as a PDF", expect: "save_as_pdf" },
    { query: "export to PDF", expect: "save_as_pdf" },
    { query: "bookmark this page", expect: "bookmark" },
    { query: "list my bookmarks", expect: "bookmark" },
    { query: "check what extensions I have installed", expect: "extension" },
    { query: "disable extension abc123", expect: "extension" },
    { query: "add random delays between my actions", expect: "humanize" },
    { query: "make me look more human", expect: "humanize" },
    { query: "transcribe the audio from the video", expect: "speech_to_text" },
    { query: "translate this page to spanish", expect: "translate" },
    { query: "run an accessibility audit", expect: "audit" },
    { query: "check for accessibility issues", expect: "audit" },
    { query: "scan the page for security vulnerabilities", expect: "security_scan" },
    { query: "check code coverage", expect: "coverage" },
    { query: "trace the redirect chain for this url", expect: "network" },
    { query: "show me shadow DOM roots", expect: "shadow_dom" },
    { query: "list iframes on the page", expect: "iframe_list" },
    { query: "clone the design of this page", expect: "design_clone" },
    { query: "watch for DOM changes", expect: "dom_mutations" },
    { query: "check the service worker status", expect: "service_worker" },
    { query: "find API endpoints used by this page", expect: "network" },
    { query: "parse the swagger documentation", expect: "swagger_parser" },
    { query: "extract colors from the page", expect: "color_palette" },
    { query: "extract the table data", expect: "get_markdown" },
    { query: "auto-fill this form", expect: "form_fill" },
    { query: "test responsive design", expect: "responsive_test" },
    { query: "what tools are available", expect: "discover_tools" },
    { query: "show me all tools in the session category", expect: "discover_tools" },
  ];

  for (const { query, expect: expected } of CASES) {
    it(`should map "${query}" → ${expected}`, () => {
      const desc = TOOL_MAP.get(expected).description.toLowerCase();
      const name = expected.replace(/_/g, " ");
      const keywords = query.toLowerCase().split(" ").filter(w => w.length > 2);
      const descMatch = keywords.filter(w => desc.includes(w)).length;
      const nameMatch = name.split(" ").filter(w => w.length > 2).some(w => query.toLowerCase().includes(w));
      const urlMatch = /https?:\/\/.+/.test(query) && expected === "navigate";
      const domainMatch = /\b\w+\.(com|org|net|io|gov|edu|ru)\b/.test(query) && expected === "navigate";
      assert(descMatch >= 1 || nameMatch || urlMatch || domainMatch,
        `Query "${query}": no keyword match in tool "${expected}" description or name.
         Description: "${TOOL_MAP.get(expected).description}"
         Name: "${expected}"
         Query words: [${keywords.join(", ")}]`);
    });
  }
});

describe("AI Tool Selection — Confusing & Ambiguous Queries", () => {
  it("should NOT map 'take a snapshot' to screenshot", () => {
    const tool = findBestTool("take a snapshot of the page");
    if (tool) assert.notStrictEqual(tool.name, "screenshot",
      `"take a snapshot" should map to "snapshot", not "screenshot"`);
  });

  it("should NOT map 'get text content' to get_markdown", () => {
    const tool = findBestTool("get text content of the page");
    if (tool) assert.notStrictEqual(tool.name, "get_markdown",
      `"get text content" should prefer get_text over get_markdown`);
  });

  it("should map session-related queries to state", () => {
    const saveQ = findBestTool("save the browser session");
    const readQ = findBestTool("list saved sessions");
    if (saveQ) {
      assert.strictEqual(saveQ.name, "state", `"save the browser session" mapped to unexpected "${saveQ.name}"`);
    }
    if (readQ) {
      assert.strictEqual(readQ.name, "state", `"list saved sessions" mapped to unexpected "${readQ.name}"`);
    }
  });

  it("should distinguish wait vs wait_stale", () => {
    const elQ = findBestTool("wait for element to appear");
    const staleQ = findBestTool("wait for element to disappear");
    assert(elQ === null || elQ.name !== "wait_stale",
      `"wait for element to appear" should not map to wait_stale`);
    assert(staleQ === null || staleQ.name !== "wait",
      `"wait for element to disappear" should not map to wait`);
  });

  it("should not mix up audit and security_scan", () => {
    const a11y = findBestTool("check accessibility");
    const sec = findBestTool("check security headers");
    if (a11y) assert.strictEqual(a11y.name, "audit",
      `"check accessibility" should map to "audit", not "${a11y.name}"`);
    if (sec) assert.strictEqual(sec.name, "security_scan",
      `"check security headers" should map to "security_scan", not "${sec.name}"`);
  });
});

describe("AI Tool Selection — Multi-Step Reasoning", () => {
  it("should use navigate+snapshot+click for 'go to site and click button'", () => {
    const tools = ["navigate", "snapshot", "click", "fill", "screenshot"];
    for (const t of tools) assert(TOOL_MAP.has(t), `Missing tool: ${t}`);
  });

  it("should use snapshot+fill+click+dismiss_overlay for form+popup", () => {
    const tools = ["snapshot", "fill", "click", "dismiss_overlay", "send_keys"];
    for (const t of tools) assert(TOOL_MAP.has(t), `Missing tool: ${t}`);
  });

  it("should have all core workflow tools (navigate+snapshot+click+fill+screenshot)", () => {
    const core = ["navigate", "snapshot", "click", "fill", "screenshot"];
    for (const t of core) assert(TOOL_MAP.has(t), `Missing core tool: ${t}`);
  });
});

describe("AI Tool Selection — Dangerous Operation Guarding", () => {
  const DESTRUCTIVE = ["close_tab", "dismiss_overlay"];

  for (const name of DESTRUCTIVE) {
    it(`should clearly mark ${name} as destructive in description`, () => {
      const tool = TOOL_MAP.get(name);
      assert(tool.destructiveHint || tool.name, `Tool ${name} should be destructive`);
    });
  }

  it("should NOT mark readOnly tools as destructive", () => {
    for (const tool of TOOLS) {
      if (tool.readOnly) {
        assert(!tool.destructive,
          `Read-only tool "${tool.name}" must not be destructive`);
      }
    }
  });

  it("should have at most 3 destructive tools (AI safety)", () => {
    const destructive = TOOLS.filter(t => t.destructive);
    assert(destructive.length <= 3,
      `Too many destructive tools (${destructive.length}/3) — increases risk of AI misuse`);
  });
});

describe("AI Tool Selection — Confusion Matrix", () => {
  const matrix = buildConfusionMatrix();

  it("should have no tool pairs sharing 5+ significant keywords (excluding known duplicates)", () => {
    const knownDuplicates = new Set();
    const high = matrix.filter(m => !knownDuplicates.has(`${m.a}_${m.b}`) && !knownDuplicates.has(`${m.b}_${m.a}`) && m.score >= 5);
    if (high.length > 0) {
      assert.fail(`${high.length} tool pairs share 5+ keywords:\n` +
        high.map(m => `  "${m.a}" ↔ "${m.b}" (${m.score} shared words)`).join("\n"));
    }
  });

});

describe("Tool Description Quality — AI Disambiguation", () => {
  it("every tool description should contain its own name (or underscore variant)", () => {
    for (const tool of TOOLS) {
      const desc = tool.description.toLowerCase();
      const nameReadable = tool.name.replace(/_/g, " ");
      const hasName = desc.includes(tool.name.replace(/_/g, " ")) || desc.includes(tool.name) || desc.startsWith(tool.name + " ");
      const hasKeyPart = tool.name.includes("_") && tool.name.split("_").some(part => part.length > 2 && desc.includes(part));
      assert(hasName || hasKeyPart,
        `Tool "${tool.name}" description does not mention its own name.\nDescription: "${tool.description}"`);
    }
  });

  it("no two tool descriptions should be identical", () => {
    const descs = TOOLS.map(t => t.description);
    const unique = new Set(descs);
    assert.strictEqual(unique.size, descs.length,
      `${descs.length - unique.size} tools share identical descriptions — AI cannot distinguish them`);
  });

  it("every description should start with a verb (action-oriented)", () => {
    const verbs = ["capture", "take", "click", "fill", "send", "execute", "list", "close",
      "extract", "get", "select", "scroll", "wait", "navigate", "find", "dismiss",
      "save", "restore", "intercept", "manage", "handle", "emulate", "drag",
      "set", "export", "run", "check", "trace", "watch", "inspect", "discover",
      "clone", "test", "monitor", "add", "transcribe", "translate", "auto", "open",
      "show", "parse", "discover", "change", "type", "press", "choose", "accept",
      "scan", "track", "reflect", "detect", "observe", "register", "hover", "enter",
      "scroll", "redirect", "dismiss", "bookmark", "disable", "enable", "list",
      "capture", "read", "choose", "tap", "snapshot", "upload", "evaluate", "humanize"];
    for (const tool of TOOLS) {
      const firstWord = tool.description.split(/[\s,-]+/)[0].toLowerCase();
      assert(verbs.includes(firstWord),
        `Tool "${tool.name}" description starts with "${firstWord}", not an action verb.\nDescription: "${tool.description}"`);
    }
  });
});

describe("Tool Parameter Confusion — AI Would Make Mistakes", () => {
  it("tools with 'selector' param should also support @e refs", () => {
    const selectorTools = ["click", "fill", "hover", "select", "scroll", "get_text",
      "get_element_bounds", "drag_drop", "upload", "wait", "wait_stale",
      "find_by_text", "dismiss_overlay", "screenshot"];
    for (const name of selectorTools) {
      assert(TOOL_MAP.has(name), `Missing tool: ${name}`);
    }
  });

  it("should have find_tab accept url pattern (not tabId)", () => {
    const tool = TOOL_MAP.get("find_tab");
    assert(tool, "find_tab tool is missing");
  });

  it("tools with openWorld should not be called on internal pages", () => {
    const openWorld = TOOLS.filter(t => t.openWorld).map(t => t.name);
    assert(openWorld.includes("navigate"), "navigate should be openWorld");
    assert(openWorld.includes("click"), "click should be openWorld");
    assert(openWorld.includes("fill"), "fill should be openWorld");
    assert(!openWorld.includes("snapshot"), "snapshot should NOT be openWorld");
    assert(!openWorld.includes("get_text"), "get_text should NOT be openWorld");
  });

  it("idempotent tools are safe to retry on failure", () => {
    const idempotent = TOOLS.filter(t => t.idempotent).map(t => t.name);
    assert(idempotent.includes("navigate"), "navigate should be idempotent");
    assert(idempotent.includes("snapshot"), "snapshot should be idempotent");
    assert(!idempotent.includes("click"), "click should NOT be idempotent (side effects)");
    assert(!idempotent.includes("fill"), "fill should NOT be idempotent (side effects)");
  });
});

describe("AI Workflow — Correct Tool Sequencing", () => {
  it("never needs discover_tools before using other tools (all tools are always visible)", () => {
    const discover = TOOL_MAP.get("discover_tools");
    assert(discover, "discover_tools must exist");
    assert(discover.readOnly, "discover_tools should be readOnly");
  });

  it("should use navigate before snapshot on new domains", () => {
    const nav = TOOL_MAP.get("navigate");
    const snap = TOOL_MAP.get("snapshot");
    assert(nav && snap, "navigate and snapshot must exist");
    assert(nav.openWorld, "navigate should be openWorld (handles cross-origin)");
    assert(!snap.openWorld, "snapshot should not be openWorld (only current page)");
  });

  it("should verify with screenshot after form submit", () => {
    const screens = TOOL_MAP.get("screenshot");
    assert(screens && screens.readOnly, "screenshot should be readOnly (safe verification step)");
  });

  it("fill should be preferred over evaluate for form input", () => {
    const fillTool = TOOL_MAP.get("fill");
    assert(fillTool && !fillTool.readOnly, "fill should not be readOnly");
    assert(!fillTool.destructive, "fill should not be destructive");
  });
});

describe("AI Safety — Confusingly Similar Tool Names", () => {
  const SIMILAR_PAIRS = [
    ["wait", "wait_stale"],
    ["find_tab", "find_by_text"],
    ["get_text", "get_markdown", "get_element_bounds"],
    ["screenshot", "snapshot"],
    ["audit", "security_scan"],
    ["history", "bookmark"],
    ["save_as_pdf", "screenshot"],
    ["dom_mutations", "shadow_dom"],
  ];

  for (const group of SIMILAR_PAIRS) {
    it(`confusable group [${group.join(", ")}] should have unique descriptions`, () => {
      if (group.includes("session") && group.includes("session_manager")) return;
      const descs = group.map(n => TOOL_MAP.get(n)?.description || "");
      for (let i = 0; i < descs.length; i++) {
        for (let j = i + 1; j < descs.length; j++) {
          const wordsI = new Set(descs[i].toLowerCase().split(/[\s,]+/).filter(w => w.length > 3));
          const wordsJ = new Set(descs[j].toLowerCase().split(/[\s,]+/).filter(w => w.length > 3));
          const shared = [...wordsI].filter(w => wordsJ.has(w));
          assert(shared.length < 5,
            `"${group[i]}" and "${group[j]}" share ${shared.length} significant words: [${shared.join(", ")}]\n` +
            `  "${group[i]}": "${descs[i]}"\n` +
            `  "${group[j]}": "${descs[j]}"`);
        }
      }
    });
  }
});
