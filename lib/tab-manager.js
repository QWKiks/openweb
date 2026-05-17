/**
 * Tab Manager
 * Tracks the "last referenced" tab and provides helpers for finding active tabs.
 */

import { attach, setActiveTabId, getActiveTabId } from "./cdp.js";

let lastReferencedTabId = null;

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

  if (activeId !== null) {
    try {
      const tab = await chrome.tabs.get(activeId);
      if (tab) return tab;
    } catch {
      // Tab no longer exists
    }
  }

  if (lastReferencedTabId !== null) {
    try {
      const tab = await chrome.tabs.get(lastReferencedTabId);
      if (tab) return tab;
    } catch {
      lastReferencedTabId = null;
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  lastReferencedTabId = tab.id;
  return tab;
}

/**
 * Set the last referenced tab ID.
 * @param {number} tabId
 */
export function setLastReferencedTab(tabId) {
  lastReferencedTabId = tabId;
}
