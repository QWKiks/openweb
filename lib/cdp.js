/**
 * CDP (Chrome DevTools Protocol) Manager
 * Handles attaching/detaching the debugger to tabs and sending CDP commands.
 */

const attachedTabs = new Set();
let activeTabId = null;

let lastSavedState = null;

// Restore state from session storage on SW wake-up
async function restoreCdpState() {
  try {
    const data = await chrome.storage.session.get(["cdpAttachedTabs", "cdpActiveTabId"]);
    if (data.cdpAttachedTabs) {
      for (const tabId of data.cdpAttachedTabs) attachedTabs.add(tabId);
    }
    if (data.cdpActiveTabId) activeTabId = data.cdpActiveTabId;
    lastSavedState = {
      attached: [...attachedTabs],
      active: activeTabId
    };
  } catch {}
}
restoreCdpState();

async function saveCdpState() {
  const newState = {
    attached: [...attachedTabs],
    active: activeTabId
  };
  if (lastSavedState &&
      lastSavedState.active === newState.active &&
      lastSavedState.attached.length === newState.attached.length &&
      lastSavedState.attached.every((v, i) => v === newState.attached[i])) {
    return;
  }
  lastSavedState = newState;
  try {
    await chrome.storage.session.set({
      cdpAttachedTabs: newState.attached,
      cdpActiveTabId: newState.active,
    });
  } catch {}
}

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  if (activeTabId === tabId) activeTabId = null;
  saveCdpState();
});

// Clean up when the debugger detaches externally
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
    if (activeTabId === source.tabId) activeTabId = null;
    saveCdpState();
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
    await saveCdpState();
    return;
  }
  // Verify actual debugger state — MV3 SW may have forgotten
  try {
    const targets = await chrome.debugger.getTargets();
    const alreadyAttached = targets.some(t => t.tabId === tabId && t.attached);
    if (!alreadyAttached) {
      try { await chrome.debugger.detach({ tabId }); } catch {}
      await chrome.debugger.attach({ tabId }, "1.3");
    }
  } catch {
    try { await chrome.debugger.detach({ tabId }); } catch {}
    await chrome.debugger.attach({ tabId }, "1.3");
  }
  attachedTabs.add(tabId);
  activeTabId = tabId;
  await saveCdpState();
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
  saveCdpState();
}
