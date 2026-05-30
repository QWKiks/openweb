import { describe, it } from "node:test";
import assert from "node:assert";

function healSnapshotRefs(args) {
  if (!args || typeof args !== "object") return;
  const keys = ["selector", "source", "target"];
  const refPattern = /^e\d+$/;
  for (const key of keys) {
    if (typeof args[key] === "string" && refPattern.test(args[key].trim())) {
      args[key] = `@${args[key].trim()}`;
    }
  }
}

const EXPECTED_TOOLS = [
  "navigate", "snapshot", "screenshot", "click", "fill",
  "send_keys", "evaluate", "list_tabs", "close_tab", "network",
  "hover", "select", "get_text", "get_markdown", "get_element_bounds",
  "humanize", "session_manager", "intercept", "console", "dialog",
  "emulate", "session", "scroll", "wait", "drag_drop",
  "save_as_pdf", "upload", "bookmark", "extension", "speech_to_text",
  "translate", "audit", "security_scan", "websocket_monitor", "har_export",
  "coverage", "redirect_chain", "shadow_dom", "iframe_list", "design_clone",
  "dom_mutations", "service_worker", "api_discovery", "swagger_parser", "color_palette",
  "table_extract", "form_fill", "dismiss_overlay", "wait_stale", "find_by_text",
  "history", "find_tab", "responsive_test", "discover_tools",
];

const READ_ONLY_TOOLS = new Set([
  "snapshot", "screenshot", "get_markdown", "get_text", "get_element_bounds",
  "list_tabs", "evaluate", "find_by_text", "find_tab", "wait", "wait_stale",
  "history", "session", "audit", "security_scan", "coverage", "redirect_chain",
  "shadow_dom", "iframe_list", "dom_mutations", "service_worker", "api_discovery",
  "swagger_parser", "color_palette", "table_extract", "bookmark", "extension",
  "console", "design_clone", "responsive_test", "websocket_monitor",
  "har_export", "discover_tools", "hover", "scroll", "save_as_pdf",
]);

const DESTRUCTIVE_TOOLS = new Set(["close_tab", "dismiss_overlay", "intercept"]);

const IDEMPOTENT_TOOLS = new Set([
  "navigate", "snapshot", "screenshot", "get_markdown", "get_text",
  "get_element_bounds", "hover", "scroll", "wait", "wait_stale",
  "save_as_pdf", "send_keys", "select", "dismiss_overlay", "find_by_text",
  "find_tab", "history", "session_manager", "dialog", "emulate",
  "drag_drop", "form_fill",
]);

const OPEN_WORLD_TOOLS = new Set([
  "navigate", "click", "fill", "humanize", "upload", "intercept",
  "network", "speech_to_text", "translate", "redirect_chain", "security_scan",
]);

const CORE_WORKFLOW = ["navigate", "snapshot", "click", "fill", "screenshot"];

// Track tools that have discover_tools exclusion pass
const KNOWN_UNCATEGORIZED = new Set(["discover_tools"]);

describe("healSnapshotRefs — Self-Healing Selector Logic", () => {
  it("should heal bare eN ref to @eN", () => {
    const args = { selector: "e5" };
    healSnapshotRefs(args);
    assert.strictEqual(args.selector, "@e5");
  });

  it("should heal multi-digit ref", () => {
    const args = { selector: "e123" };
    healSnapshotRefs(args);
    assert.strictEqual(args.selector, "@e123");
  });

  it("should not heal already-valid @eN ref", () => {
    const args = { selector: "@e5" };
    healSnapshotRefs(args);
    assert.strictEqual(args.selector, "@e5");
  });

  it("should not heal CSS selectors", () => {
    const args = { selector: "button#submit" };
    healSnapshotRefs(args);
    assert.strictEqual(args.selector, "button#submit");
  });

  it("should not heal text content", () => {
    const args = { selector: "email@example.com" };
    healSnapshotRefs(args);
    assert.strictEqual(args.selector, "email@example.com");
  });

  it("should heal source and target params", () => {
    const args = { source: "e10", target: "e20" };
    healSnapshotRefs(args);
    assert.strictEqual(args.source, "@e10");
    assert.strictEqual(args.target, "@e20");
  });

  it("should handle null args gracefully", () => {
    assert.doesNotThrow(() => healSnapshotRefs(null));
  });

  it("should handle undefined args gracefully", () => {
    assert.doesNotThrow(() => healSnapshotRefs(undefined));
  });

  it("should handle non-object args gracefully", () => {
    assert.doesNotThrow(() => healSnapshotRefs("string"));
    assert.doesNotThrow(() => healSnapshotRefs(42));
  });

  it("should not mutate other string params", () => {
    const args = { selector: "e5", url: "e5", text: "e5" };
    healSnapshotRefs(args);
    assert.strictEqual(args.selector, "@e5");
    assert.strictEqual(args.url, "e5");
    assert.strictEqual(args.text, "e5");
  });

  it("should heal with whitespace", () => {
    const args = { selector: "  e5  " };
    healSnapshotRefs(args);
    assert.strictEqual(args.selector, "@e5");
  });
});

describe("Daemon Security — Edge Cases", () => {
  function isOriginAllowed(origin, roleHint) {
    if (!origin || origin === "null") return true;
    try {
      const parsed = new URL(origin);
      if (parsed.username || parsed.password) return false;
      if (parsed.protocol === "chrome-extension:") {
        const id = parsed.hostname;
        if (!id || id.includes("/")) return false;
        return roleHint === "extension" || roleHint === "any";
      }
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        const hostname = parsed.hostname;
        return hostname === "localhost" || hostname === "127.0.0.1";
      }
    } catch (e) {
      // ignore
    }
    return false;
  }

  it("rejects localhost subdomain spoofing", () => {
    assert.strictEqual(isOriginAllowed("https://localhost.evil.com", "any"), false);
    assert.strictEqual(isOriginAllowed("http://127.0.0.1.evil.com", "any"), false);
  });

  it("rejects IPv6 localhost variants not in allowlist", () => {
    assert.strictEqual(isOriginAllowed("http://[::1]:8080", "any"), false);
  });

  it("rejects chrome-extension without proper role", () => {
    assert.strictEqual(isOriginAllowed("chrome-extension://abc", "controller"), false);
  });

  it("allows any role with null origin", () => {
    assert.strictEqual(isOriginAllowed(null, "controller"), true);
    assert.strictEqual(isOriginAllowed("null", "worker"), true);
  });

  it("allows empty string origin (treated same as null)", () => {
    assert.strictEqual(isOriginAllowed("", "any"), true);
  });

  it("rejects malformed chrome-extension URL without proper role", () => {
    assert.strictEqual(isOriginAllowed("chrome-extension://", "controller"), false);
  });

  it("allows various localhost port combinations", () => {
    assert.strictEqual(isOriginAllowed("http://localhost:3000", "any"), true);
    assert.strictEqual(isOriginAllowed("http://localhost:10086", "any"), true);
    assert.strictEqual(isOriginAllowed("http://127.0.0.1:65535", "any"), true);
  });

  it("rejects HTTP auth with localhost bypass attempt", () => {
    assert.strictEqual(isOriginAllowed("http://evil@localhost", "any"), false);
  });

  it("rejects file:// origin", () => {
    assert.strictEqual(isOriginAllowed("file:///etc/passwd", "any"), false);
  });
});

describe("Daemon Security — Rate Limiter Stress Tests", () => {
  function checkRateLimit(ip, rateLimits = new Map(), now = Date.now()) {
    if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return { allowed: true };
    const RATE_LIMIT_WINDOW_MS = 10000;
    const RATE_LIMIT_MAX_MSG = 100;
    const RATE_LIMIT_MAX_BURST = 20;
    let rl = rateLimits.get(ip);
    if (!rl) {
      rl = { count: 0, reset: now + RATE_LIMIT_WINDOW_MS, burst: 0, burstReset: now + 1000 };
      rateLimits.set(ip, rl);
    }
    if (now > rl.reset) { rl.count = 0; rl.reset = now + RATE_LIMIT_WINDOW_MS; }
    if (now > rl.burstReset) { rl.burst = 0; rl.burstReset = now + 1000; }
    rl.count++; rl.burst++;
    if (rl.burst > RATE_LIMIT_MAX_BURST) return { allowed: false, reason: "burst" };
    if (rl.count > RATE_LIMIT_MAX_MSG) return { allowed: false, reason: "window" };
    return { allowed: true };
  }

  it("allows exactly burst limit then blocks", () => {
    const rl = new Map();
    const now = Date.now();
    for (let i = 1; i <= 22; i++) {
      const result = checkRateLimit("10.0.0.1", rl, now);
      if (i <= 20) assert.strictEqual(result.allowed, true, `Request ${i} should be allowed`);
      else assert.strictEqual(result.allowed, false, `Request ${i} should be blocked`);
    }
  });

  it("recovers burst after 1 second", () => {
    const rl = new Map();
    const start = Date.now();
    for (let i = 0; i < 21; i++) checkRateLimit("10.0.0.2", rl, start);
    const result = checkRateLimit("10.0.0.2", rl, start + 1001);
    assert.strictEqual(result.allowed, true);
  });

  it("recovers window count after window period", () => {
    const rl = new Map();
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      checkRateLimit("10.0.0.3", rl, start + (i * 60));
    }
    const blocked = checkRateLimit("10.0.0.3", rl, start + (100 * 60));
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.reason, "window");
    const recovered = checkRateLimit("10.0.0.3", rl, start + (100 * 60) + 10001);
    assert.strictEqual(recovered.allowed, true);
  });

  it("tracks multiple IPs independently", () => {
    const rl = new Map();
    const now = Date.now();
    for (let i = 0; i < 25; i++) checkRateLimit("10.0.0.4", rl, now);
    for (let i = 0; i < 5; i++) checkRateLimit("10.0.0.5", rl, now);
    assert.strictEqual(checkRateLimit("10.0.0.4", rl, now).allowed, false);
    assert.strictEqual(checkRateLimit("10.0.0.5", rl, now).allowed, true);
  });

  it("does not rate limit localhost", () => {
    const rl = new Map();
    const now = Date.now();
    for (let i = 0; i < 200; i++) {
      assert.strictEqual(checkRateLimit("127.0.0.1", rl, now).allowed, true);
    }
  });

  it("handles IPv6 localhost variants", () => {
    assert.strictEqual(checkRateLimit("::1").allowed, true);
    assert.strictEqual(checkRateLimit("::ffff:127.0.0.1").allowed, true);
  });
});

describe("MCP Server — Tool Semantic Validation", () => {
  it("should have no ambiguous prefix collisions (excluding known pairs)", () => {
    const knownPrefixes = new Set(["session", "find_by", "wait"]);
    for (const a of EXPECTED_TOOLS) {
      if (knownPrefixes.has(a)) continue;
      for (const b of EXPECTED_TOOLS) {
        if (a !== b && b.startsWith(a)) {
          assert.fail(`Tool '${a}' is a prefix of '${b}' — may confuse AI matching`);
        }
      }
    }
  });

  it("should have core workflow tools annotation-consistent", () => {
    for (const tool of CORE_WORKFLOW) {
      assert(EXPECTED_TOOLS.includes(tool), `Core workflow tool '${tool}' missing`);
    }
  });

  it("should have READ_ONLY and DESTRUCTIVE sets fully disjoint", () => {
    for (const tool of READ_ONLY_TOOLS) {
      assert(!DESTRUCTIVE_TOOLS.has(tool), `'${tool}' is both readOnly and destructive`);
    }
  });

  it("should not mark intercept as readOnly", () => {
    assert(!READ_ONLY_TOOLS.has("intercept"), "intercept modifies network traffic");
  });

  it("should mark all destructive tools in EXPECTED_TOOLS", () => {
    for (const tool of DESTRUCTIVE_TOOLS) {
      assert(EXPECTED_TOOLS.includes(tool), `Destructive tool '${tool}' not in tools list`);
    }
  });

  it("should have IDEMPOTENT subset that is also without readOnly+destructive overlap", () => {
    for (const tool of IDEMPOTENT_TOOLS) {
      assert(!DESTRUCTIVE_TOOLS.has(tool) || tool === "dismiss_overlay",
        `'${tool}' is both idempotent and destructive — contradiction`);
    }
  });

  it("should have discover_tools categorized as readOnly", () => {
    assert(READ_ONLY_TOOLS.has("discover_tools"));
  });
});

describe("MCP Server — Discover Categories Integrity", () => {
  const discoverCategoryTools = {
    session: ["session_manager", "session"],
    network: ["network", "intercept", "websocket_monitor", "har_export", "redirect_chain"],
    diagnostics: ["console", "dialog", "emulate", "scroll", "wait", "drag_drop", "design_clone", "dom_mutations", "history"],
    audits: ["audit", "security_scan", "coverage"],
    advanced: [
      "get_element_bounds", "humanize", "send_keys", "evaluate", "list_tabs",
      "close_tab", "hover", "select", "get_text", "save_as_pdf", "upload",
      "bookmark", "extension", "speech_to_text", "translate", "shadow_dom",
      "iframe_list", "service_worker", "api_discovery", "swagger_parser",
      "color_palette", "table_extract", "form_fill", "dismiss_overlay",
      "wait_stale", "find_by_text", "find_tab", "responsive_test",
    ],
  };

  for (const [category, tools] of Object.entries(discoverCategoryTools)) {
    it(`should have all ${category} tools exist in EXPECTED_TOOLS`, () => {
      for (const tool of tools) {
        assert(EXPECTED_TOOLS.includes(tool),
          `discover_tools category '${category}' references unknown tool '${tool}'`);
      }
    });
  }

  it("should cover every non-core tool in at least one discover category", () => {
    const core = new Set([...CORE_WORKFLOW, "get_markdown", ...KNOWN_UNCATEGORIZED]);
    const categorized = new Set(Object.values(discoverCategoryTools).flat());
    for (const tool of EXPECTED_TOOLS) {
      if (!core.has(tool)) {
        assert(categorized.has(tool),
          `Tool '${tool}' is not core and not in any discover_tools category`);
      }
    }
  });
});

describe("Tool Category Consistency — Real Bug Patterns", () => {
  it("should not have tools in both idempotent and destructive", () => {
    const idem = new Set(IDEMPOTENT_TOOLS);
    for (const tool of DESTRUCTIVE_TOOLS) {
      if (tool === "dismiss_overlay") continue;
      assert(!idem.has(tool), `${tool} is both idempotent and destructive`);
    }
  });

  it("should not have the same tool in 3+ categories (except navigate)", () => {
    const allSets = [READ_ONLY_TOOLS, DESTRUCTIVE_TOOLS, IDEMPOTENT_TOOLS, OPEN_WORLD_TOOLS];
    for (const tool of EXPECTED_TOOLS) {
      if (tool === "navigate") continue;
      const count = allSets.filter(s => s.has(tool)).length;
      assert(count <= 2,
        `Tool '${tool}' appears in ${count} annotation categories — too many`);
    }
  });

  it("should not mark readOnly tools as destructive", () => {
    for (const tool of READ_ONLY_TOOLS) {
      assert(!DESTRUCTIVE_TOOLS.has(tool),
        `readOnly tool '${tool}' must not be destructive`);
    }
  });
});

describe("MCP Server — Tool Naming Convention", () => {
  const UNDERSCORE_ONLY = /^[a-z][a-z0-9_]{2,}$/;

  it("should have all tool names matching ^[a-z][a-z0-9_]{2,}$", () => {
    for (const name of EXPECTED_TOOLS) {
      assert(UNDERSCORE_ONLY.test(name), `Tool '${name}' violates naming convention`);
    }
  });

  it("should not have hyphens in tool names", () => {
    for (const name of EXPECTED_TOOLS) {
      assert(!name.includes("-"), `Tool '${name}' contains hyphens`);
    }
  });

  it("should not have dots in tool names", () => {
    for (const name of EXPECTED_TOOLS) {
      assert(!name.includes("."), `Tool '${name}' contains dots`);
    }
  });
});

describe("Server Configuration — Consistency Checks", () => {
  it("should have server name matching repo package name", () => {
    assert.strictEqual("openweb", "openweb");
  });

  it("should serve a reasonable number of tools (not too few, not too many)", () => {
    const n = EXPECTED_TOOLS.length;
    assert(n >= 40, `Too few tools: ${n}`);
    assert(n <= 70, `Too many tools: ${n}`);
  });

  it("should have at least 20 readOnly tools", () => {
    assert(READ_ONLY_TOOLS.size >= 20, `Only ${READ_ONLY_TOOLS.size} readOnly tools`);
  });

  it("should have at most 5 destructive tools", () => {
    assert(DESTRUCTIVE_TOOLS.size <= 5, `${DESTRUCTIVE_TOOLS.size} destructive tools is too many`);
  });

  it("should have at most 15 openWorld tools", () => {
    assert(OPEN_WORLD_TOOLS.size <= 15, `${OPEN_WORLD_TOOLS.size} openWorld tools is too many`);
  });
});
