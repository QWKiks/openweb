/**
 * Console Tool
 * Capture and read console logs, warnings, and errors from the page.
 */

import { attach, sendCommand, getActiveTabId } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

const capturingTabs = new Set();
const consoleStore = new Map(); // tabId → Array<{type, text, timestamp}>
const MAX_ENTRIES = 500;
let listenerAdded = false;

function ensureListener() {
  if (listenerAdded) return;
  listenerAdded = true;

  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (!tabId || !capturingTabs.has(tabId)) return;

    const store = consoleStore.get(tabId) || [];

    if (method === "Runtime.consoleAPICalled") {
      const type = params.type; // log, warn, error, info, debug
      const text = params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(" ");
      store.push({ type, text, timestamp: params.timestamp });
      if (store.length > MAX_ENTRIES) store.splice(0, store.length - MAX_ENTRIES);
      consoleStore.set(tabId, store);
    }

    if (method === "Runtime.exceptionThrown") {
      const detail = params.exceptionDetails;
      const text = detail.text ||
        (detail.exception?.description) ||
        "Uncaught exception";
      store.push({ type: "error", text, timestamp: params.timestamp });
      if (store.length > MAX_ENTRIES) store.splice(0, store.length - MAX_ENTRIES);
      consoleStore.set(tabId, store);
    }
  });
}

export class ConsoleTool {
  name = "console";

  async execute(args) {
    const cmd = args.cmd || "list";
    const tab = await getActiveTab();
    await attach(tab.id);

    switch (cmd) {
      case "start": return this.start(tab.id);
      case "stop": return this.stop();
      case "list": return this.list(args);
      case "clear": return this.clear();
      default: throw new Error(`console: unknown cmd "${cmd}". Use: start, stop, list, clear`);
    }
  }

  async start(tabId) {
    capturingTabs.add(tabId);
    consoleStore.set(tabId, []);
    ensureListener();

    await sendCommand("Runtime.enable");

    return { success: true, message: "console capture started" };
  }

  async stop() {
    const tabId = getActiveTabId();
    if (tabId !== null) {
      capturingTabs.delete(tabId);
      try { await sendCommand("Runtime.disable"); } catch {}
    }
    return { success: true, message: "console capture stopped" };
  }

  list(args) {
    const tabId = getActiveTabId();
    let entries = consoleStore.get(tabId) || [];

    if (args.type) {
      entries = entries.filter((e) => e.type === args.type);
    }

    const limit = args.limit || 100;
    const offset = args.offset || 0;
    const sliced = entries.slice(offset, offset + limit);

    return { count: entries.length, entries: sliced };
  }

  clear() {
    const tabId = getActiveTabId();
    consoleStore.set(tabId, []);
    return { success: true, message: "console cleared" };
  }
}
