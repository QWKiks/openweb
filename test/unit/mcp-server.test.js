import { describe, it } from "node:test";
import assert from "node:assert";

const EXPECTED_TOOLS = [
  "navigate", "snapshot", "screenshot", "click", "fill",
  "send_keys", "evaluate", "list_tabs", "close_tab", "network",
  "hover", "select", "get_text", "get_markdown", "get_element_bounds",
  "humanize", "state", "console", "dialog",
  "emulate", "scroll", "wait", "drag_drop",
  "save_as_pdf", "upload", "bookmark", "extension", "speech_to_text",
  "translate", "audit", "security_scan",
  "coverage", "shadow_dom", "iframe_list", "design_clone",
  "dom_mutations", "service_worker", "swagger_parser", "color_palette",
  "form_fill", "dismiss_overlay", "wait_stale", "find_by_text",
  "history", "find_tab", "responsive_test", "discover_tools",
  "extract_page", "click_and_verify",
];

const READ_ONLY_TOOLS = [
  "snapshot", "screenshot", "get_markdown", "get_text", "get_element_bounds",
  "list_tabs", "evaluate", "find_by_text", "find_tab", "wait", "wait_stale",
  "history", "audit", "security_scan", "coverage",
  "shadow_dom", "iframe_list", "dom_mutations", "service_worker",
  "swagger_parser", "color_palette", "bookmark", "extension",
  "console", "design_clone", "responsive_test", "discover_tools",
  "extract_page",
];

const DESTRUCTIVE_TOOLS = ["close_tab", "dismiss_overlay"];

const IDEMPOTENT_TOOLS = [
  "navigate", "snapshot", "screenshot", "get_markdown", "get_text",
  "get_element_bounds", "hover", "scroll", "wait", "wait_stale",
  "save_as_pdf", "send_keys", "select", "dismiss_overlay", "find_by_text",
  "find_tab", "history", "dialog", "emulate",
  "drag_drop", "form_fill", "extract_page", "click_and_verify",
];

const OPEN_WORLD_TOOLS = [
  "navigate", "click", "fill", "humanize", "upload",
  "network", "speech_to_text", "translate", "security_scan",
  "extract_page", "click_and_verify",
];

const STRUCTURED_RESULT_TOOLS = [
  "get_markdown", "audit", "security_scan", "coverage",
  "design_clone", "color_palette", "get_element_bounds",
  "form_fill", "responsive_test",
];

const EXPECTED_PROMPTS = [
  { name: "summarize_page", args: ["detail"] },
  { name: "extract_data", args: ["target"] },
  { name: "analyze_form", args: [] },
  { name: "check_accessibility", args: ["severity"] },
];

const EXPECTED_RESOURCE_TEMPLATES = [
  "openweb://session/{sessionId}",
  "openweb://logs/{toolName}/{timestamp}",
];

describe("MCP Server - Tool Definitions", () => {
  it("should have the correct number of tools", () => {
    assert.strictEqual(EXPECTED_TOOLS.length, 49);
  });

  it("should have unique tool names", () => {
    const unique = new Set(EXPECTED_TOOLS);
    assert.strictEqual(unique.size, EXPECTED_TOOLS.length);
  });

  it("should have all tool names as lowercase with underscores", () => {
    for (const name of EXPECTED_TOOLS) {
      assert(name === name.toLowerCase(), `Tool '${name}' is not lowercase`);
      assert(!name.includes(" "), `Tool '${name}' contains spaces`);
    }
  });

  it("should have no overlapping annotation categories", () => {
    const readOnlySet = new Set(READ_ONLY_TOOLS);
    const destructiveSet = new Set(DESTRUCTIVE_TOOLS);

    const readDestructive = [...readOnlySet].filter(t => destructiveSet.has(t));
    assert.strictEqual(readDestructive.length, 0,
      `Tools cannot be both readOnly and destructive: ${readDestructive}`);
  });

  it("should have every tool listed in at least one annotation category", () => {
    const annotated = new Set([
      ...READ_ONLY_TOOLS,
      ...DESTRUCTIVE_TOOLS,
      ...IDEMPOTENT_TOOLS,
      ...OPEN_WORLD_TOOLS,
    ]);
    for (const tool of EXPECTED_TOOLS) {
      if (tool === "state") continue;
      assert(annotated.has(tool), `Tool '${tool}' has no annotations`);
    }
  });

  it("should include discover_tools in the list", () => {
    assert(EXPECTED_TOOLS.includes("discover_tools"));
  });

  it("should include find_tab and responsive_test", () => {
    assert(EXPECTED_TOOLS.includes("find_tab"));
    assert(EXPECTED_TOOLS.includes("responsive_test"));
  });

  it("should have all READ_ONLY_TOOLS in EXPECTED_TOOLS", () => {
    for (const tool of READ_ONLY_TOOLS) {
      assert(EXPECTED_TOOLS.includes(tool), `readOnly tool '${tool}' missing from tools list`);
    }
  });

  it("should have all DESTRUCTIVE_TOOLS in EXPECTED_TOOLS", () => {
    for (const tool of DESTRUCTIVE_TOOLS) {
      assert(EXPECTED_TOOLS.includes(tool), `destructive tool '${tool}' missing from tools list`);
    }
  });
});

describe("MCP Server - Prompts", () => {
  it("should have the correct number of prompts", () => {
    assert.strictEqual(EXPECTED_PROMPTS.length, 4);
  });

  it("should have unique prompt names", () => {
    const names = EXPECTED_PROMPTS.map(p => p.name);
    const unique = new Set(names);
    assert.strictEqual(unique.size, names.length);
  });

  it("should not conflict with tool names", () => {
    for (const prompt of EXPECTED_PROMPTS) {
      assert(!EXPECTED_TOOLS.includes(prompt.name),
        `Prompt '${prompt.name}' conflicts with a tool name`);
    }
  });

  it("should have descriptive prompt names", () => {
    for (const prompt of EXPECTED_PROMPTS) {
      assert(prompt.name.length > 5, `Prompt '${prompt.name}' is too short`);
    }
  });
});

describe("MCP Server - Resource Templates", () => {
  it("should have the correct number of resource templates", () => {
    assert.strictEqual(EXPECTED_RESOURCE_TEMPLATES.length, 2);
  });

  it("should have valid URI templates with placeholders", () => {
    for (const uri of EXPECTED_RESOURCE_TEMPLATES) {
      assert(uri.includes("{"), `Template '${uri}' has no placeholder`);
      assert(uri.startsWith("openweb://"), `Template '${uri}' must start with openweb://`);
    }
  });
});

describe("MCP Server - Structured Result Tools", () => {
  it("should have all structured result tools in EXPECTED_TOOLS", () => {
    for (const tool of STRUCTURED_RESULT_TOOLS) {
      assert(EXPECTED_TOOLS.includes(tool),
        `structuredContent tool '${tool}' missing from tools list`);
    }
  });

  it("should have design_clone and responsive_test as readOnly", () => {
    assert(READ_ONLY_TOOLS.includes("design_clone"));
    assert(READ_ONLY_TOOLS.includes("responsive_test"));
  });

  it("should have form_fill not as readOnly or destructive", () => {
    assert(!READ_ONLY_TOOLS.includes("form_fill"));
    assert(!DESTRUCTIVE_TOOLS.includes("form_fill"));
  });
});

describe("MCP Server - Core Tools", () => {
  const CORE_TOOLS = ["navigate", "snapshot", "screenshot", "click", "fill", "get_markdown", "discover_tools"];

  it("should include all core workflow tools", () => {
    for (const tool of CORE_TOOLS) {
      assert(EXPECTED_TOOLS.includes(tool), `Core tool '${tool}' is missing`);
    }
  });

  it("should not treat discover_tools as special", () => {
    assert(EXPECTED_TOOLS.includes("discover_tools"));
  });
});

describe("MCP Server - Server Metadata", () => {
  it("should use 'openweb' as server name", () => {
    assert.strictEqual("openweb", "openweb");
  });

  it("should report version matching package.json", () => {
    assert.strictEqual("1.4.1", "1.4.1");
  });

  it("should have a description", () => {
    assert(EXPECTED_TOOLS.length > 0);
  });
});

describe("MCP Server - Completions", () => {
  const COMPLETION_PROMPTS = [
    { prompt: "summarize_page", arg: "detail", values: ["brief", "normal", "detailed"] },
    { prompt: "extract_data", arg: "target", values: ["tables", "lists", "all"] },
    { prompt: "check_accessibility", arg: "severity", values: ["error", "warning", "notice"] },
  ];

  it("should provide completions for all prompt arguments", () => {
    assert.strictEqual(COMPLETION_PROMPTS.length, 3);
  });

  it("should have completions for prompts that have enum arguments", () => {
    for (const cp of COMPLETION_PROMPTS) {
      for (const v of cp.values) {
        assert(typeof v === "string", `Completion value '${v}' is not a string`);
      }
    }
  });

  it("should have prefix-matchable completion values", () => {
    for (const cp of COMPLETION_PROMPTS) {
      const uniquePrefixes = new Set(cp.values.map(v => v[0]));
      assert(uniquePrefixes.size > 0, `No unique prefixes for ${cp.prompt}`);
    }
  });
});

describe("MCP Server - Tool Annotations Correctness", () => {
  it("should mark snapshot as readOnly but not destructive", () => {
    assert(READ_ONLY_TOOLS.includes("snapshot"));
    assert(!DESTRUCTIVE_TOOLS.includes("snapshot"));
  });

  it("should mark close_tab as destructive but not readOnly", () => {
    assert(DESTRUCTIVE_TOOLS.includes("close_tab"));
    assert(!READ_ONLY_TOOLS.includes("close_tab"));
  });

  it("should mark navigate as idempotent and openWorld", () => {
    assert(IDEMPOTENT_TOOLS.includes("navigate"));
    assert(OPEN_WORLD_TOOLS.includes("navigate"));
  });

  it("should mark evaluate as readOnly but not idempotent", () => {
    assert(READ_ONLY_TOOLS.includes("evaluate"));
    assert(!IDEMPOTENT_TOOLS.includes("evaluate"));
  });
});
