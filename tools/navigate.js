/**
 * Navigate Tool
 * Opens a URL in the current or new tab.
 */

import { attach } from "../lib/cdp.js";
import { sendCommand } from "../lib/cdp.js";
import { getActiveTab, setLastReferencedTab, addToTabGroup } from "../lib/tab-manager.js";

export class NavigateTool {
  name = "navigate";

  async execute(args) {
    const url = args.url;
    if (!url) throw new Error("navigate: url is required");

    const newTab = args.newTab;
    const session = args._session;
    const groupTitle = args.group_title;

    let tab;

    if (newTab) {
      tab = await chrome.tabs.create({ url, active: true });
      setLastReferencedTab(tab.id);
      if (session) await addToTabGroup(tab.id, session, groupTitle);
      await attach(tab.id);
      await this.waitForLoad(tab.id);
      return { success: true, url, tabId: tab.id };
    }

    tab = await getActiveTab();

    // Cannot navigate chrome:// or edge:// URLs directly
    if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://")) {
      tab = await chrome.tabs.create({ url, active: true });
      setLastReferencedTab(tab.id);
      await this.waitForLoad(tab.id);
      return { success: true, url, tabId: tab.id };
    }

    await attach(tab.id);
    setLastReferencedTab(tab.id);

    const isSameUrl = tab.url === url || tab.url === url + "/";
    let frameId;

    if (isSameUrl) {
      await sendCommand("Page.reload", { ignoreCache: true });
    } else {
      const result = await sendCommand("Page.navigate", { url });
      frameId = result.frameId;
    }

    await this.waitForLoad(tab.id);
    return { success: true, url, tabId: tab.id, frameId };
  }

  /**
   * Wait for a tab to finish loading (up to 30s).
   * @param {number} tabId
   */
  waitForLoad(tabId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("navigate: page load timeout (30s)"));
      }, 30000);

      const isComplete = (tab) =>
        tab.status === "complete" && !!tab.url && tab.url !== "about:blank";

      const listener = (id, changeInfo, tab) => {
        if (id === tabId && changeInfo.status === "complete" && isComplete(tab)) {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.get(tabId, (tab) => {
        if (isComplete(tab)) {
          clearTimeout(timeout);
          resolve();
        } else {
          chrome.tabs.onUpdated.addListener(listener);
        }
      });
    });
  }
}
