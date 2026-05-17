/**
 * Tab Manager
 * Tracks the "last referenced" tab and provides helpers for finding active tabs.
 * Caches tab objects to avoid repeated chrome.tabs.get() IPC calls.
 */

import { attach, setActiveTabId, getActiveTabId } from "./cdp.js";

let lastReferencedTabId = null;

// ── Tab cache ────────────────────────────────────────────────────────────────
const tabCache = new Map(); // tabId → chrome.tabs.Tab

chrome.tabs.onUpdated.addListener((id, info, tab) => {
  tabCache.set(id, tab);
});

chrome.tabs.onRemoved.addListener((id) => {
  tabCache.delete(id);
});

// Color scheme for tab groups per session
const SESSION_COLORS = {
  twitter: "blue",
  xhs: "red",
  zhihu: "blue",
  worldquant: "purple",
};
const EXTRA_COLORS = ["green", "yellow", "cyan", "orange", "pink", "grey"];
let colorIndex = 0;

// Map: session name → chrome tab group ID
const sessionGroupMap = new Map();
// Map: session name → custom group title
const sessionTitleMap = new Map();

// Ensure tabGroups.onRemoved listener is registered once
let groupListenerAdded = false;

function ensureGroupListener() {
  if (groupListenerAdded) return;
  groupListenerAdded = true;
  chrome.tabGroups.onRemoved.addListener((group) => {
    for (const [session, groupId] of sessionGroupMap) {
      if (groupId === group.id) {
        sessionGroupMap.delete(session);
        break;
      }
    }
  });
}

/**
 * Add a tab to a session's tab group.
 * @param {number} tabId
 * @param {string} sessionName
 * @param {string} [groupTitle]
 */
export async function addToTabGroup(tabId, sessionName, groupTitle) {
  try {
    ensureGroupListener();

    const existingGroupId = sessionGroupMap.get(sessionName);
    if (existingGroupId != null) {
      await chrome.tabs.group({ tabIds: tabId, groupId: existingGroupId });
      return;
    }

    const groupTitlePattern = `agent:${sessionName}`;
    const existingGroups = await chrome.tabGroups.query({ title: groupTitlePattern });
    if (existingGroups.length > 0) {
      const groupId = existingGroups[0].id;
      await chrome.tabs.group({ tabIds: tabId, groupId });
      sessionGroupMap.set(sessionName, groupId);
      return;
    }

    if (groupTitle) sessionTitleMap.set(sessionName, groupTitle);

    const title = groupTitle ?? sessionTitleMap.get(sessionName) ?? groupTitlePattern;
    const groupId = await chrome.tabs.group({ tabIds: tabId });
    const color = SESSION_COLORS[sessionName] ?? EXTRA_COLORS[colorIndex++ % EXTRA_COLORS.length];

    await chrome.tabGroups.update(groupId, { title, color, collapsed: false });
    sessionGroupMap.set(sessionName, groupId);
  } catch {
    // Tab grouping is best-effort
  }
}

/**
 * Get the best available tab: try active attached, then last referenced, then query browser.
 * @returns {Promise<chrome.tabs.Tab>}
 */
export async function getActiveTab() {
  const activeId = getActiveTabId();

  // Try cache first (avoids IPC call)
  if (activeId !== null) {
    const cached = tabCache.get(activeId);
    if (cached) return cached;
    try {
      const tab = await chrome.tabs.get(activeId);
      if (tab) {
        tabCache.set(activeId, tab);
        return tab;
      }
    } catch {
      tabCache.delete(activeId);
    }
  }

  if (lastReferencedTabId !== null) {
    const cached = tabCache.get(lastReferencedTabId);
    if (cached) return cached;
    try {
      const tab = await chrome.tabs.get(lastReferencedTabId);
      if (tab) {
        tabCache.set(lastReferencedTabId, tab);
        return tab;
      }
    } catch {
      tabCache.delete(lastReferencedTabId);
      lastReferencedTabId = null;
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  lastReferencedTabId = tab.id;
  tabCache.set(tab.id, tab);
  return tab;
}

/**
 * Set the last referenced tab ID.
 * @param {number} tabId
 */
export function setLastReferencedTab(tabId) {
  lastReferencedTabId = tabId;
}
