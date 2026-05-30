import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class WaitTool {
  name = "wait";

  async execute(args) {
    const type = args.type || "selector";
    const timeout = args.timeout || 10000;

    const tab = await getActiveTab();
    await attach(tab.id);

    switch (type) {
      case "selector": return this.waitForSelector(args.selector, timeout);
      case "navigation": return this.waitForNavigation(tab.id, timeout);
      case "network_idle": return this.waitForNetworkIdle(timeout);
      default: throw new Error(`wait: unknown type "${type}". Use: selector, navigation, network_idle`);
    }
  }

  async waitForSelector(selector, timeout) {
    if (!selector) throw new Error("wait: selector is required for type=selector");

    const intervalMs = 200;
    const maxAttempts = Math.ceil(timeout / intervalMs);

    for (let i = 0; i < maxAttempts; i++) {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `!!document.querySelector(${JSON.stringify(selector)})`,
        returnByValue: true,
      });

      if (result.result.value) {
        return { success: true, found: true, selector, waitedMs: i * intervalMs };
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return { success: false, found: false, selector, waitedMs: timeout, timeout: true, reason: `Element "${selector}" not found within ${timeout}ms` };
  }

  async waitForNavigation(tabId, timeout) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve({ success: false, timeout: true, waitedMs: timeout });
      }, timeout);

      const listener = (id, changeInfo) => {
        if (id === tabId && changeInfo.status === "complete") {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve({ success: true, navigated: true });
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  async waitForNetworkIdle(timeout) {
    const idleTimeMs = 500;
    const intervalMs = 200;
    const maxAttempts = Math.ceil(timeout / intervalMs);
    let idleSince = 0;
    let lastPendingCount = -1;

    try { await sendCommand("Network.enable"); } catch {}

    // warm-up: wait a tick for PerformanceObserver/readyState to settle
    await new Promise((r) => setTimeout(r, 100));

    for (let i = 0; i < maxAttempts; i++) {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          let pending = 0;

          // Images that have STARTED loading but aren't done yet.
          // Skip lazy images that haven't started loading (no naturalWidth/Height yet)
          // and data-URIs / blob URIs (already in-memory).
          document.querySelectorAll('img[src]').forEach(i => {
            if (!i.complete && i.naturalWidth === 0 && i.naturalHeight === 0) return;
            if (i.src.startsWith('data:') || i.src.startsWith('blob:')) return;
            if (!i.complete) pending++;
          });

          // Media elements: only count if they've begun loading (have src or srcObject)
          document.querySelectorAll('video[src], audio[src]').forEach(v => {
            if (v.readyState < 3 && v.readyState > 0) pending++;
          });

          // Script tags: check via performance API instead of readyState
          const perfPending = performance.getEntriesByType('resource')
            .filter(e => !e.responseEnd).length;
          const pendingFetch = window.__pendingFetchCount || 0;

          return {
            pendingResources: pending + perfPending,
            pendingFetch: pendingFetch,
            domStable: document.readyState === 'complete',
          };
        })()`,
        returnByValue: true,
      });

      const state = result.result.value || { pendingResources: 0, pendingFetch: 0, domStable: false };
      const totalPending = state.pendingResources + state.pendingFetch;

      if (totalPending === 0) {
        idleSince += intervalMs;
        if (idleSince >= idleTimeMs) {
          try { await sendCommand("Network.disable"); } catch {}
          return { success: true, networkIdle: true, waitedMs: i * intervalMs, domStable: state.domStable };
        }
      } else {
        idleSince = 0;
        lastPendingCount = totalPending;
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    try { await sendCommand("Network.disable"); } catch {}

    return {
      success: false, timeout: true, waitedMs: timeout,
      reason: `Page still loading: ${lastPendingCount ?? '?'} pending resources`,
      pendingResources: lastPendingCount ?? 0,
      domStable: false,
    };
  }
}
