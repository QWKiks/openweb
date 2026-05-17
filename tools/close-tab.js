/**
 * Close Tab Tool
 * Closes a specific tab by its tab ID.
 */

export class CloseTabTool {
  name = "close_tab";

  async execute(args) {
    const tabId = args._tabId;
    if (tabId == null) return { success: true, closed: false, reason: "session has no tab" };

    try {
      await chrome.tabs.remove(tabId);
      return { success: true, closed: true };
    } catch {
      return { success: true, closed: false, reason: "tab already closed" };
    }
  }
}
