import { describe, it } from "node:test";
import assert from "node:assert";

// 1. Mock chrome API globally BEFORE dynamic imports
globalThis.chrome = {
  tabs: {
    onRemoved: { addListener: () => {}, removeListener: () => {} },
    onUpdated: { addListener: () => {}, removeListener: () => {} },
    create: async (opts) => ({ id: 42, url: opts.url, title: "Mock Title", status: "complete" }),
    get: (id, cb) => {
      const tab = { id, url: "file:///mock-page.html", title: "Mock Page", status: "complete" };
      if (cb) cb(tab);
      return Promise.resolve(tab);
    },
    query: async () => [{ id: 42, url: "file:///mock-page.html", title: "Mock Page", status: "complete" }],
    group: async () => 100,
  },
  tabGroups: {
    onRemoved: { addListener: () => {}, removeListener: () => {} },
    query: async () => [],
    update: async () => {},
  },
  runtime: {
    onMessage: { addListener: () => {}, removeListener: () => {} },
    getURL: (x) => x,
  },
  debugger: {
    onDetach: { addListener: () => {}, removeListener: () => {} },
    onEvent: { addListener: () => {}, removeListener: () => {} },
    attach: async () => {},
    detach: async () => {},
    sendCommand: async () => ({}),
    getTargets: async () => [{ tabId: 42, attached: true }],
  },
  storage: {
    session: {
      get: async () => ({ cdpAttachedTabs: [42], cdpActiveTabId: 42 }),
      set: async () => {},
    },
  },
};

// 2. Perform dynamic imports to bypass ESM hoisting
const { SnapshotTool } = await import("../../tools/snapshot.js");
const { NavigateTool } = await import("../../tools/navigate.js");
const { NetworkTool } = await import("../../tools/network.js");
const { ScreenshotTool } = await import("../../tools/screenshot.js");

describe("Phase 6 Innovations & Optimizations", () => {
  
  describe("Snapshot Pruning & Interactive Pruning", () => {
    it("should return the entire tree when interactiveOnly=false and selector is omitted", async () => {
      // Mock chrome.debugger.sendCommand to return custom AXTree nodes
      const originalSendCommand = chrome.debugger.sendCommand;
      chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === "Accessibility.getFullAXTree") {
          return {
            nodes: [
              { nodeId: "1", role: { value: "root" }, childIds: ["2", "3"] },
              { nodeId: "2", role: { value: "button" }, backendDOMNodeId: 201, name: { value: "Click Me" } },
              { nodeId: "3", role: { value: "staticText" }, backendDOMNodeId: 202, name: { value: "Hello Static" } },
            ],
          };
        }
        return {};
      };

      try {
        const snapshot = new SnapshotTool();
        const res = await snapshot.execute({ interactiveOnly: false });
        
        assert.ok(res.tree);
        const flatTree = JSON.stringify(res.tree);
        assert.ok(flatTree.includes("button"));
        assert.ok(flatTree.includes("staticText"));
      } finally {
        chrome.debugger.sendCommand = originalSendCommand;
      }
    });

    it("should prune staticText when interactiveOnly=true", async () => {
      const originalSendCommand = chrome.debugger.sendCommand;
      chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === "Accessibility.getFullAXTree") {
          return {
            nodes: [
              { nodeId: "1", role: { value: "root" }, childIds: ["2", "3"] },
              { nodeId: "2", role: { value: "button" }, backendDOMNodeId: 201, name: { value: "Click Me" } },
              { nodeId: "3", role: { value: "staticText" }, backendDOMNodeId: 202, name: { value: "Hello Static" } },
            ],
          };
        }
        return {};
      };

      try {
        const snapshot = new SnapshotTool();
        const res = await snapshot.execute({ interactiveOnly: true });
        
        assert.ok(res.tree);
        const flatTree = JSON.stringify(res.tree);
        assert.ok(flatTree.includes("button"));
        assert.ok(!flatTree.includes("staticText"), "staticText should be pruned in interactive-only mode");
      } finally {
        chrome.debugger.sendCommand = originalSendCommand;
      }
    });

    it("should prune nodes outside of selector subtree", async () => {
      const originalSendCommand = chrome.debugger.sendCommand;
      chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === "DOM.getDocument") {
          return { root: { nodeId: 1 } };
        }
        if (method === "DOM.querySelector") {
          return { nodeId: 10 };
        }
        if (method === "Accessibility.getPartialAXTree") {
          return {
            nodes: [
              { nodeId: "1", role: { value: "root" }, childIds: ["2"] },
              { nodeId: "2", role: { value: "button" }, backendDOMNodeId: 1001, name: { value: "Inside selector" } },
            ],
          };
        }
        return {};
      };

      try {
        const snapshot = new SnapshotTool();
        const res = await snapshot.execute({ selector: "#card-form", interactiveOnly: false });
        
        assert.ok(res.tree);
        const flatTree = JSON.stringify(res.tree);
        assert.ok(flatTree.includes("Inside selector"), "Should keep node inside selector");
        assert.ok(!flatTree.includes("Outside selector"), "Should prune node outside selector");
      } finally {
        chrome.debugger.sendCommand = originalSendCommand;
      }
    });
  });

  describe("Navigate Tool Speedups", () => {
    it("should support early DOMContentLoaded resolution and resolve instantly", async () => {
      const originalSendCommand = chrome.debugger.sendCommand;
      chrome.debugger.sendCommand = async () => ({});

      try {
        const navigate = new NavigateTool();
        const res = await navigate.execute({ url: "file:///test.html", newTab: true, waitUntil: "DOMContentLoaded" });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.url, "file:///test.html");
      } finally {
        chrome.debugger.sendCommand = originalSendCommand;
      }
    });
  });

  describe("Ad Blocker Network Interception", () => {
    it("should enable blocker with correct ad/tracker domains", async () => {
      const originalSendCommand = chrome.debugger.sendCommand;
      let setBlockedURLsParams = null;
      chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === "Network.setBlockedURLs") {
          setBlockedURLsParams = params;
        }
        return {};
      };

      try {
        const network = new NetworkTool();
        const res = await network.blockAds(true);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.enabled, true);
        assert.ok(setBlockedURLsParams);
        assert.ok(setBlockedURLsParams.urls.includes("*analytics*"));
        assert.ok(setBlockedURLsParams.urls.includes("*doubleclick*"));
      } finally {
        chrome.debugger.sendCommand = originalSendCommand;
      }
    });

    it("should disable blocker", async () => {
      const originalSendCommand = chrome.debugger.sendCommand;
      let setBlockedURLsParams = null;
      chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === "Network.setBlockedURLs") {
          setBlockedURLsParams = params;
        }
        return {};
      };

      try {
        const network = new NetworkTool();
        const res = await network.blockAds(false);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.enabled, false);
        assert.ok(setBlockedURLsParams);
        assert.strictEqual(setBlockedURLsParams.urls.length, 0);
      } finally {
        chrome.debugger.sendCommand = originalSendCommand;
      }
    });
  });

  describe("Phase 7 Token Economy & SOTA Low-Latency Optimization", () => {
    
    describe("Snapshot Minified Text Format", () => {
      it("should return tree formatted as compressed indented text when format='text'", async () => {
        const originalSendCommand = chrome.debugger.sendCommand;
        chrome.debugger.sendCommand = async (target, method, params) => {
          if (method === "Accessibility.getFullAXTree") {
            return {
              nodes: [
                { nodeId: "1", role: { value: "root" }, childIds: ["2"] },
                { nodeId: "2", role: { value: "button" }, backendDOMNodeId: 201, name: { value: "Submit Form" } },
              ],
            };
          }
          return {};
        };

        try {
          const snapshot = new SnapshotTool();
          const res = await snapshot.execute({ format: "text", interactiveOnly: true });
          
          assert.ok(res.tree);
          assert.strictEqual(typeof res.tree, "string");
          assert.ok(res.tree.includes("[button"));
          assert.ok(res.tree.includes("name=\"Submit Form\""));
        } finally {
          chrome.debugger.sendCommand = originalSendCommand;
        }
      });
    });

    describe("Adaptive Screenshot Crops and Scaling", () => {
      it("should scale down overview screenshots to 800px width by default (lowRes=true)", async () => {
        const originalSendCommand = chrome.debugger.sendCommand;
        let captureParams = null;
        chrome.debugger.sendCommand = async (target, method, params) => {
          if (method === "Page.getLayoutMetrics") {
            return {
              cssVisualViewport: { clientWidth: 1600, clientHeight: 900 }
            };
          }
          if (method === "Page.captureScreenshot") {
            captureParams = params;
            return { data: "mockImageData" };
          }
          return {};
        };

        try {
          const screenshot = new ScreenshotTool();
          const res = await screenshot.execute({ lowRes: true });
          assert.ok(captureParams);
          assert.ok(captureParams.clip);
          assert.strictEqual(captureParams.clip.scale, 0.5); // 800 / 1600 = 0.5
          assert.strictEqual(captureParams.clip.width, 1600);
        } finally {
          chrome.debugger.sendCommand = originalSendCommand;
        }
      });

      it("should support precise coordinate cropping without scaling down", async () => {
        const originalSendCommand = chrome.debugger.sendCommand;
        let captureParams = null;
        chrome.debugger.sendCommand = async (target, method, params) => {
          if (method === "Page.captureScreenshot") {
            captureParams = params;
            return { data: "mockImageData" };
          }
          return {};
        };

        try {
          const screenshot = new ScreenshotTool();
          await screenshot.execute({ x: 100, y: 150, width: 300, height: 200 });
          assert.ok(captureParams);
          assert.ok(captureParams.clip);
          assert.strictEqual(captureParams.clip.x, 100);
          assert.strictEqual(captureParams.clip.y, 150);
          assert.strictEqual(captureParams.clip.width, 300);
          assert.strictEqual(captureParams.clip.height, 200);
          assert.strictEqual(captureParams.clip.scale, 1);
        } finally {
          chrome.debugger.sendCommand = originalSendCommand;
        }
      });
    });

  });

});

