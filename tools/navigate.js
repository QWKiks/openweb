import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab, setLastReferencedTab, addToTabGroup } from "../lib/tab-manager.js";

export class NavigateTool {
  name = "navigate";

  async execute(args) {
    const url = args.url;
    if (!url) throw new Error("navigate: url is required");

    const newTab = args.newTab === true; 

    const session = args._session;
    const groupTitle = args.group_title;
    const waitUntil = args.waitUntil || "DOMContentLoaded"; 

    let tab;

    if (newTab) {
      tab = await chrome.tabs.create({ url, active: true });
      setLastReferencedTab(tab.id);
      if (session) await addToTabGroup(tab.id, session, groupTitle);
      await attach(tab.id);
      try { await sendCommand("Page.enable"); } catch {}
      await this.waitForLoad(tab.id, waitUntil);
      return { success: true, url, tabId: tab.id, suggestedNextTool: "snapshot" };
    }

    tab = await getActiveTab();

    

    if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://")) {
      tab = await chrome.tabs.create({ url, active: true });
      setLastReferencedTab(tab.id);
      await attach(tab.id);
      try { await sendCommand("Page.enable"); } catch {}
      await this.waitForLoad(tab.id, waitUntil);
      return { success: true, url, tabId: tab.id, suggestedNextTool: "snapshot" };
    }

    await attach(tab.id);
    setLastReferencedTab(tab.id);
    try { await sendCommand("Page.enable"); } catch {}

    const isSameUrl = tab.url === url || tab.url === url + "/";
    let frameId;

    if (isSameUrl) {
      await sendCommand("Page.reload", { ignoreCache: true });
    } else {
      const result = await sendCommand("Page.navigate", { url });
      frameId = result.frameId;
    }

    await this.waitForLoad(tab.id, waitUntil);
    return { success: true, url, tabId: tab.id, frameId, suggestedNextTool: "snapshot" };
  }

     
                                                                         
                          
                              
     
  waitForLoad(tabId, waitUntil) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve({ success: false, timeout: true }); 

      }, 30000);

      const cleanup = () => {
        clearTimeout(timeout);
        chrome.debugger.onEvent.removeListener(cdpListener);
        chrome.tabs.onUpdated.removeListener(tabsListener);
      };

      

      const tabsListener = (id, changeInfo) => {
        if (id === tabId && changeInfo.status === "complete") {
          cleanup();
          resolve();
        }
      };

      

      const cdpListener = (source, method) => {
        if (source.tabId !== tabId) return;
        
        if (waitUntil === "DOMContentLoaded" && method === "Page.domContentEventFired") {
          cleanup();
          resolve();
        } else if (waitUntil === "complete" && method === "Page.loadEventFired") {
          cleanup();
          resolve();
        }
      };

      chrome.debugger.onEvent.addListener(cdpListener);
      chrome.tabs.onUpdated.addListener(tabsListener);

      

      chrome.tabs.get(tabId, (tab) => {
        if (tab && tab.status === "complete") {
          cleanup();
          resolve();
        }
      });
    });
  }
}
