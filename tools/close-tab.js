/**
 * Close Tab Tool
 * Closes a specific tab or all tabs (session).
 */

export class CloseTabTool {
  name = "close_tab";

  async execute(args) {
    const all = args.all === true;

    if (all) {
      const tabIds = args._tabIds || (args._tabId != null ? [args._tabId] : []);
      if (tabIds.length === 0) {
        try {
          const tabs = await chrome.tabs.query({});
          let closed = 0;
          for (const t of tabs) {
            await chrome.tabs.remove(t.id);
            closed++;
          }
          return { success: true, closed };
        } catch (err) {
          throw new Error(`close_tab (all): failed to query or close tabs: ${err.message}`);
        }
      }

      let closed = 0;
      for (const id of tabIds) {
        try {
          await chrome.tabs.remove(id);
          closed++;
        } catch {}
      }
      return { success: true, closed };
    }

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
