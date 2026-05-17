/**
 * Find Tab Tool
 * Finds an open tab matching a URL pattern.
 */

import { attach } from "../lib/cdp.js";
import { getActiveTab, setLastReferencedTab, addToTabGroup } from "../lib/tab-manager.js";

export class FindTabTool {
  name = "find_tab";

  async execute(args) {
    const url = args.url;
    if (!url) throw new Error("find_tab: url is required");

    const session = args._session;
    const activeOnly = args.active;
    const queryPattern = toQueryPattern(url);

    let tab;

    if (activeOnly) {
      const window = await chrome.windows.getLastFocused({
        populate: true,
        windowTypes: ["normal"],
      });
      tab = window.tabs?.find(
        (t) => t.active && t.url && hostnameMatches(t.url, queryPattern)
      );
    }

    tab ||= (await chrome.tabs.query({ url: queryPattern }))[0];

    if (!tab) {
      throw new Error(
        `find_tab: no open tab found matching ${url} — open the page first, or use navigate to open it`
      );
    }

    const tabId = tab.id;
    if (session) await addToTabGroup(tabId, session);
    await attach(tabId);
    setLastReferencedTab(tabId);

    return { success: true, url: tab.url ?? url, tabId };
  }
}

/**
 * Convert a URL to a Chrome tabs.query pattern.
 */
function toQueryPattern(url) {
  if (url.includes("*")) return url;
  try {
    return `*://${new URL(url).hostname}/*`;
  } catch {
    return `*://${url.replace(/^\.+/, "")}/*`;
  }
}

/**
 * Check if a tab URL's hostname matches a query pattern.
 */
function hostnameMatches(tabUrl, pattern) {
  try {
    return new URL(tabUrl).hostname === pattern.replace(/^\*:\/\//, "").replace(/\/\*$/, "");
  } catch {
    return false;
  }
}
