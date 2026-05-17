/**
 * Wait Tool
 * Wait for a specific condition on the page: selector, navigation, network idle, or timeout.
 */

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

    return { success: false, found: false, selector, waitedMs: timeout, timeout: true };
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
    let lastPending = -1;
    let idleSince = 0;

    for (let i = 0; i < maxAttempts; i++) {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `document.querySelectorAll('img[src]:not([complete]), video[src], script[src]:not([loaded])').length`,
        returnByValue: true,
      });

      const pending = result.result.value || 0;

      if (pending === 0) {
        idleSince += intervalMs;
        if (idleSince >= idleTimeMs) {
          return { success: true, networkIdle: true, waitedMs: i * intervalMs };
        }
      } else {
        idleSince = 0;
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return { success: false, timeout: true, waitedMs: timeout };
  }
}
