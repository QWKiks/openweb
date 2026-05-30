import { describe, it } from "node:test";
import assert from "node:assert";

globalThis.chrome = {
  tabs: { onRemoved: { addListener: () => {} } },
  runtime: { onMessage: { addListener: () => {} } },
  debugger: {
    onDetach: { addListener: () => {} },
    onEvent: { addListener: () => {} },
    attach: async () => {},
    detach: async () => {},
    sendCommand: async () => ({}),
    getTargets: async () => ({ tabId: 1 }),
  },
};

const moduleCache = await import("../../tools/registry.js");
const { register, executeTool, getToolNames } = moduleCache;

describe("Tool Registry", () => {
  it("should register a tool and return it by name", async () => {
    register({ name: "test_tool", execute: async () => ({ ok: true }) });
    const names = getToolNames();
    assert(names.includes("test_tool"));
  });

  it("should execute a registered tool", async () => {
    register({ name: "echo", execute: async (args) => args });
    const result = await executeTool("echo", { message: "hello" });
    assert.strictEqual(result.message, "hello");
  });

  it("should throw for unknown tool", async () => {
    try {
      await executeTool("unknown_xyz", {});
      assert.fail("should have thrown");
    } catch (e) {
      assert(e.message.includes("Unknown tool"));
    }
  });
});
