/**
 * List Tabs Tool
 * Lists all tabs in the current session, optionally with group titles.
 */

export class ListTabsTool {
  name = "list_tabs";

  async execute(args) {
    const tabIds = extractTabIds(args);

    if (tabIds.length === 0) {
      // No specific tabs requested — list all tabs
      const allTabs = await chrome.tabs.query({});
      const tabs = allTabs.map((tab) => {
        let groupTitle;
        if (tab.groupId != null && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
          try {
            groupTitle = (async () => (await chrome.tabGroups.get(tab.groupId)).title)();
          } catch {}
        }
        return {
          tabId: tab.id,
          url: tab.url ?? "",
          title: tab.title ?? "",
          active: tab.active,
          groupTitle,
        };
      });
      return { success: true, tabs };
    }

    const tabs = [];
    for (const id of tabIds) {
      try {
        const tab = await chrome.tabs.get(id);
        let groupTitle;
        if (tab.groupId != null && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
          try {
            groupTitle = (await chrome.tabGroups.get(tab.groupId)).title;
          } catch {}
        }
        tabs.push({
          tabId: tab.id,
          url: tab.url ?? "",
          title: tab.title ?? "",
          active: tab.active,
          groupTitle,
        });
      } catch {}
    }

    return { success: true, tabs };
  }
}

function extractTabIds(args) {
  const ids = args._tabIds;
  if (Array.isArray(ids) && ids.length > 0) return ids;
  const single = args._tabId;
  return single == null ? [] : [single];
}
