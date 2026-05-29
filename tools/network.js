/**
 * Network Tool
 * Captures and inspects HTTP network requests, and supports blocking ads and tracking scripts via CDP.
 */

import { attach, sendCommand, getActiveTabId } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

const capturingTabs = new Set();
const requestStore = new Map(); // tabId → Map<requestId, requestInfo>
const MAX_REQUESTS_PER_TAB = 500;

function getRequestMap(tabId) {
  let map = requestStore.get(tabId);
  if (!map) {
    map = new Map();
    requestStore.set(tabId, map);
  }
  return map;
}

let listenerAdded = false;

function ensureListener() {
  if (listenerAdded) return;
  listenerAdded = true;

  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (!tabId || !capturingTabs.has(tabId)) return;

    const store = getRequestMap(tabId);

    if (method === "Network.requestWillBeSent") {
      // LRU: evict oldest if at capacity
      if (store.size >= MAX_REQUESTS_PER_TAB) {
        const oldestKey = store.keys().next().value;
        store.delete(oldestKey);
      }
      store.set(params.requestId, {
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method,
        timestamp: params.timestamp,
      });
    }

    if (method === "Network.responseReceived") {
      const entry = store.get(params.requestId);
      if (entry) {
        entry.status = params.response.status;
        entry.mimeType = params.response.mimeType;
      }
    }

    if (method === "Network.loadingFinished") {
      const entry = store.get(params.requestId);
      if (entry) entry.completed = true;
    }
  });
}

export class NetworkTool {
  name = "network";

  async execute(args) {
    const cmd = args.cmd;
    if (!cmd) throw new Error("network: cmd is required (start/stop/list/detail/block_ads)");

    switch (cmd) {
      case "start": return this.start();
      case "stop": return this.stop();
      case "list": return this.list(args.filter);
      case "detail": return this.detail(args.requestId);
      case "block_ads": return this.blockAds(args.enable !== false);
      default: throw new Error(`network: unknown cmd "${cmd}"`);
    }
  }

  async start() {
    const tab = await getActiveTab();
    await attach(tab.id);
    const tabId = tab.id;

    requestStore.set(tabId, new Map());
    capturingTabs.add(tabId);
    await sendCommand("Network.enable");

    ensureListener();

    return { success: true, message: "network capture started" };
  }

  async stop() {
    const tabId = getActiveTabId();
    if (tabId !== null) {
      capturingTabs.delete(tabId);
      try { await sendCommand("Network.disable"); } catch {}
    }
    return { success: true, message: "network capture stopped" };
  }

  list(filter) {
    const tabId = getActiveTabId();
    let entries = [...(tabId === null ? new Map() : getRequestMap(tabId)).values()];

    if (filter) {
      entries = entries.filter((e) => e.url.includes(filter));
    }

    return {
      count: entries.length,
      requests: entries.map((e) => ({
        requestId: e.requestId,
        url: e.url,
        method: e.method,
        status: e.status,
        mimeType: e.mimeType,
        completed: e.completed ?? false,
      })),
    };
  }

  async detail(requestId) {
    if (!requestId) throw new Error("network: requestId is required for detail");

    const tabId = getActiveTabId();
    const entry = (tabId === null ? new Map() : getRequestMap(tabId)).get(requestId);
    if (!entry) throw new Error(`network: request "${requestId}" not found`);

    const response = await sendCommand("Network.getResponseBody", { requestId });
    let body = response.body;
    if (!response.base64Encoded) {
      try { body = JSON.parse(response.body); } catch {}
    }

    return {
      requestId: entry.requestId,
      url: entry.url,
      method: entry.method,
      status: entry.status,
      mimeType: entry.mimeType,
      base64Encoded: response.base64Encoded,
      body,
    };
  }

  async blockAds(enable = true) {
    const tab = await getActiveTab();
    await attach(tab.id);
    await sendCommand("Network.enable");
    
    if (!enable) {
      await sendCommand("Network.setBlockedURLs", { urls: [] });
      return { success: true, enabled: false, message: "Ad and tracker blocker disabled." };
    }
    
    const blockedUrls = [
      "*analytics*",
      "*doubleclick*",
      "*metrika*",
      "*google-analytics*",
      "*adsystem*",
      "*adsense*",
      "*adservice*",
      "*facebook.net*",
      "*facebook.com/tr*"
    ];
    
    await sendCommand("Network.setBlockedURLs", { urls: blockedUrls });
    return { success: true, enabled: true, blockedCount: blockedUrls.length, message: "Ad and tracker blocker enabled successfully." };
  }
}
