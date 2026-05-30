const attachedTabs = new Set();
let activeTabId = null;

let lastSavedState = null;

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

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  if (activeTabId === tabId) activeTabId = null;
  saveCdpState();
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
    if (activeTabId === source.tabId) activeTabId = null;
    saveCdpState();
  }
});

   
                                    
                                               
                        
   
export async function attach(tabId) {
  if (attachedTabs.has(tabId)) {
    activeTabId = tabId;
    await saveCdpState();
    return;
  }
  

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

   
                                                 
                                           
                                                    
                                        
   
export async function sendCommand(method, params) {
  if (activeTabId === null) {
    throw new Error("No tab attached. Call attach(tabId) first.");
  }
  return await chrome.debugger.sendCommand({ tabId: activeTabId }, method, params);
}

   
                                            
                         
   
export function getActiveTabId() {
  return activeTabId;
}

   
                                                             
                        
   
export function setActiveTabId(tabId) {
  activeTabId = tabId;
  saveCdpState();
}
