/**
 * Session Persistence
 * Save and restore the complete browser session state (tabs, groups, CDP state).
 * Uses chrome.storage.local for persistence across service worker restarts.
 */

import { attach, setActiveTabId } from "../lib/cdp.js";
import { setLastReferencedTab } from "../lib/tab-manager.js";

const STORAGE_KEY = "openweb_session";

export class SessionTool {
  name = "session";

  async execute(args) {
    const cmd = args.cmd || "save";
    switch (cmd) {
      case "save": return this.save();
      case "restore": return this.restore();
      case "clear": return this.clear();
      case "info": return this.info();
      default: throw new Error(`session: unknown cmd "${cmd}". Use: save, restore, clear, info`);
    }
  }

  async save() {
    // Get all open tabs
    const tabs = await chrome.tabs.query({});

    const sessionData = {
      savedAt: new Date().toISOString(),
      tabs: tabs.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.active,
        windowId: t.windowId,
        groupId: t.groupId,
      })),
      activeTabId: tabs.find((t) => t.active)?.id || null,
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: sessionData });

    return {
      success: true,
      savedAt: sessionData.savedAt,
      tabCount: sessionData.tabs.length,
      activeTabId: sessionData.activeTabId,
    };
  }

  async restore() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const sessionData = data[STORAGE_KEY];

    if (!sessionData || !sessionData.tabs) {
      return { success: false, message: "no saved session found" };
    }

    let restoredCount = 0;
    let activeTabId = null;

    for (const tabInfo of sessionData.tabs) {
      // Skip chrome:// and edge:// URLs that can't be restored directly
      if (tabInfo.url?.startsWith("chrome://") || tabInfo.url?.startsWith("edge://")) {
        continue;
      }

      try {
        const tab = await chrome.tabs.create({
          url: tabInfo.url,
          active: tabInfo.active,
        });

        if (tabInfo.active) {
          activeTabId = tab.id;
        }

        restoredCount++;
      } catch (err) {
        // Skip tabs that fail to restore
      }
    }

    // Set active tab
    if (activeTabId) {
      try {
        await chrome.tabs.update(activeTabId, { active: true });
        await attach(activeTabId);
        setActiveTabId(activeTabId);
        setLastReferencedTab(activeTabId);
      } catch {}
    }

    return {
      success: true,
      restoredCount,
      originalTabCount: sessionData.tabs.length,
      savedAt: sessionData.savedAt,
    };
  }

  async clear() {
    await chrome.storage.local.remove(STORAGE_KEY);
    return { success: true, message: "saved session cleared" };
  }

  async info() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const sessionData = data[STORAGE_KEY];

    if (!sessionData) {
      return { hasSession: false };
    }

    return {
      hasSession: true,
      savedAt: sessionData.savedAt,
      tabCount: sessionData.tabs?.length || 0,
      activeTabId: sessionData.activeTabId,
    };
  }
}
