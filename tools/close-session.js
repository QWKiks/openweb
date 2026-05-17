/**
 * Close Session Tool
 * Closes all tabs belonging to a session.
 */

export class CloseSessionTool {
  name = "close_session";

  async execute(args) {
    const tabIds = extractSessionTabIds(args);
    if (tabIds.length === 0) return { success: true, closed: 0 };

    let closed = 0;
    for (const id of tabIds) {
      try {
        await chrome.tabs.remove(id);
        closed++;
      } catch {}
    }

    return { success: true, closed };
  }
}

function extractSessionTabIds(args) {
  const ids = args._tabIds;
  if (Array.isArray(ids) && ids.length > 0) return ids;
  const single = args._tabId;
  return single == null ? [] : [single];
}
