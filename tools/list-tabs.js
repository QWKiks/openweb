export class ListTabsTool {
  name = "list_tabs";

  async execute(args) {
    const tabIds = extractTabIds(args);

    if (tabIds.length === 0) {
      

      const allTabs = await chrome.tabs.query({});
      const tabs = await Promise.all(allTabs.map(async (tab) => {
        let groupTitle;
        if (tab.groupId != null && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
          try {
            groupTitle = (await chrome.tabGroups.get(tab.groupId)).title;
          } catch {}
        }
        return {
          tabId: tab.id,
          url: tab.url ?? "",
          title: tab.title ?? "",
          active: tab.active,
          groupTitle,
        };
      }));
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
