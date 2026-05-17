/**
 * CDP (Chrome DevTools Protocol) Manager
 * Handles attaching/detaching the debugger to tabs and sending CDP commands.
 */

const attachedTabs = new Set();
let activeTabId = null;

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  if (activeTabId === tabId) activeTabId = null;
});

// Clean up when the debugger detaches externally
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
    if (activeTabId === source.tabId) activeTabId = null;
  }
});

/**
 * Attach the CDP debugger to a tab.
 * If already attached, just mark it as active.
 * @param {number} tabId
 */
export async function attach(tabId) {
  if (attachedTabs.has(tabId)) {
    activeTabId = tabId;
    return;
  }
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Not attached, that's fine
  }
  await chrome.debugger.attach({ tabId }, "1.3");
  attachedTabs.add(tabId);
  activeTabId = tabId;
}

/**
 * Send a CDP command to the active attached tab.
 * @param {string} method - CDP method name
 * @param {object} [params] - CDP command parameters
 * @returns {Promise<object>} CDP result
 */
export async function sendCommand(method, params) {
  if (activeTabId === null) {
    throw new Error("No tab attached. Call attach(tabId) first.");
  }
  return await chrome.debugger.sendCommand({ tabId: activeTabId }, method, params);
}

/**
 * Get the currently active attached tab ID.
 * @returns {number|null}
 */
export function getActiveTabId() {
  return activeTabId;
}

/**
 * Set the active tab ID (used when restoring session state).
 * @param {number} tabId
 */
export function setActiveTabId(tabId) {
  activeTabId = tabId;
}
