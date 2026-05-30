import { attach, sendCommand, setActiveTabId } from "../lib/cdp.js";
import { getActiveTab, setLastReferencedTab } from "../lib/tab-manager.js";

const TABS_STORAGE_KEY = "openweb_session";
const AUTH_STORAGE_KEY = "openweb_auth_session";

export class StateTool {
  name = "state";

  async execute(args) {
    const scope = args.scope || "tabs";
    let cmd = args.cmd;

    

    if (!cmd) {
      if (scope === "tabs") {
        cmd = "save";
      } else if (scope === "all") {
        cmd = args.session ? "load" : "save";
      } else {
        cmd = "read";
      }
    }

    const tab = await getActiveTab();

    switch (scope) {
      case "tabs":
        return this.handleTabs(cmd, args);
      case "cookies":
        return this.handleCookies(cmd, args, tab);
      case "local_storage":
      case "session_storage":
        return this.handleStorage(scope, cmd, args, tab);
      case "all":
        return this.handleAll(cmd, args, tab);
      default:
        throw new Error(`state: unknown scope "${scope}". Use: tabs, cookies, local_storage, session_storage, all`);
    }
  }

  

  async handleTabs(cmd, args) {
    switch (cmd) {
      case "save":
        return this.saveTabs();
      case "restore":
      case "load":
        return this.restoreTabs();
      case "clear":
        return this.clearTabs();
      case "info":
        return this.infoTabs();
      default:
        throw new Error(`state (tabs): unknown cmd "${cmd}". Use: save, restore, clear, info`);
    }
  }

  async saveTabs() {
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

    await chrome.storage.local.set({ [TABS_STORAGE_KEY]: sessionData });
    return {
      success: true,
      savedAt: sessionData.savedAt,
      tabCount: sessionData.tabs.length,
      activeTabId: sessionData.activeTabId,
    };
  }

  async restoreTabs() {
    const data = await chrome.storage.local.get(TABS_STORAGE_KEY);
    const sessionData = data[TABS_STORAGE_KEY];

    if (!sessionData || !sessionData.tabs) {
      return { success: false, message: "no saved session found" };
    }

    let restoredCount = 0;
    let activeTabId = null;

    for (const tabInfo of sessionData.tabs) {
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
        

      }
    }

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

  async clearTabs() {
    await chrome.storage.local.remove(TABS_STORAGE_KEY);
    return { success: true, message: "saved session cleared" };
  }

  async infoTabs() {
    const data = await chrome.storage.local.get(TABS_STORAGE_KEY);
    const sessionData = data[TABS_STORAGE_KEY];

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

  

  async handleCookies(cmd, args, tab) {
    await attach(tab.id);
    switch (cmd) {
      case "read":
      case "get":
        return this.getCookies(args.name, args.url || tab.url);
      case "write":
      case "set":
        return this.setCookie(args, args.url || tab.url);
      case "delete":
        return this.deleteCookie(args.name, args.url || tab.url);
      default:
        throw new Error(`state (cookies): unknown cmd "${cmd}". Use: read, write, delete`);
    }
  }

  async getCookies(name, url) {
    await sendCommand("Network.enable");
    

    const { cookies } = await sendCommand("Network.getCookies", { urls: [url] });
    let filtered = cookies || [];
    if (name) {
      filtered = filtered.filter((c) => c.name === name);
    }
    return { count: filtered.length, cookies: filtered };
  }

  async setCookie(args, url) {
    if (!args.name) throw new Error("state (cookies): name is required for set/write");
    if (args.value == null) throw new Error("state (cookies): value is required for set/write");

    const params = {
      name: args.name,
      value: String(args.value),
      url: args.url || url,
    };

    if (args.domain) params.domain = args.domain;
    if (args.path) params.path = args.path;
    if (args.secure != null) params.secure = args.secure;
    if (args.httpOnly != null) params.httpOnly = args.httpOnly;
    if (args.sameSite) params.sameSite = args.sameSite;
    if (args.expires != null) params.expires = args.expires;

    await sendCommand("Network.enable");
    await sendCommand("Network.setCookie", params);
    return { success: true, name: args.name };
  }

  async deleteCookie(name, url) {
    if (!name) throw new Error("state (cookies): name is required for delete");

    await sendCommand("Network.enable");
    await sendCommand("Network.deleteCookies", { name, url });
    return { success: true, deleted: name };
  }

  

  async handleStorage(scope, cmd, args, tab) {
    await attach(tab.id);
    const storageType = scope === "session_storage" ? "sessionStorage" : "localStorage";
    const key = args.key;
    const value = args.value;

    let expression;

    switch (cmd) {
      case "read":
      case "get":
        

        expression = `(() => {
          try {
            const storage = window[${JSON.stringify(storageType)}];
            const targetKey = ${JSON.stringify(key || null)};
            if (targetKey) {
              const val = storage.getItem(targetKey);
              try { return { key: targetKey, value: JSON.parse(val) }; } catch { return { key: targetKey, value: val }; }
            }
            const all = {};
            for (let i = 0; i < storage.length; i++) {
              const k = storage.key(i);
              const v = storage.getItem(k);
              try { all[k] = JSON.parse(v); } catch { all[k] = v; }
            }
            return all;
          } catch (e) {
            return { error: e.message };
          }
        })()`;
        break;

      case "write":
      case "set":
        if (!key) throw new Error(`state (${scope}): key is required for write/set`);
        

        const serializedValue = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value == null ? "" : value);
        expression = `(() => {
          try {
            const storage = window[${JSON.stringify(storageType)}];
            storage.setItem(${JSON.stringify(key)}, ${JSON.stringify(serializedValue)});
            return { success: true, action: "write", key: ${JSON.stringify(key)}, storage: "${storageType}" };
          } catch (e) {
            return { error: e.message };
          }
        })()`;
        break;

      case "delete":
        if (!key) throw new Error(`state (${scope}): key is required for delete`);
        expression = `(() => {
          try {
            const storage = window[${JSON.stringify(storageType)}];
            storage.removeItem(${JSON.stringify(key)});
            return { success: true, action: "delete", key: ${JSON.stringify(key)}, storage: "${storageType}" };
          } catch (e) {
            return { error: e.message };
          }
        })()`;
        break;

      case "clear":
        expression = `(() => {
          try {
            const storage = window[${JSON.stringify(storageType)}];
            storage.clear();
            return { success: true, action: "clear", storage: "${storageType}" };
          } catch (e) {
            return { error: e.message };
          }
        })()`;
        break;

      default:
        throw new Error(`state (${scope}): unknown cmd "${cmd}". Use: read, write, delete, clear`);
    }

    const result = await sendCommand("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`state (${scope}): ${result.exceptionDetails.text}`);
    }

    const val = result.result?.value || {};
    if (val.error) {
      throw new Error(`state (${scope}): ${val.error}`);
    }

    return val;
  }

  

  async handleAll(cmd, args, tab) {
    switch (cmd) {
      case "save":
        return this.saveAll(tab);
      case "restore":
      case "load":
        return this.loadAll(args, tab);
      case "clear":
        await chrome.storage.local.remove(AUTH_STORAGE_KEY);
        return { success: true, message: "Saved auth session cleared." };
      default:
        throw new Error(`state (all): unknown cmd "${cmd}". Use: save, load`);
    }
  }

  async saveAll(tab) {
    await attach(tab.id);
    await sendCommand("Network.enable");

    

    const { cookies } = await sendCommand("Network.getCookies", { urls: [tab.url] });

    

    const storageResult = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        return {
          localStorage: { ...localStorage },
          sessionStorage: { ...sessionStorage }
        };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (storageResult.exceptionDetails) {
      throw new Error(`state (all-save): failed to retrieve storage: ${storageResult.exceptionDetails.text}`);
    }

    const storage = storageResult.result.value || { localStorage: {}, sessionStorage: {} };

    const sessionData = {
      cookies: cookies || [],
      localStorage: storage.localStorage || {},
      sessionStorage: storage.sessionStorage || {},
    };

    

    await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: sessionData });

    return {
      success: true,
      url: tab.url,
      timestamp: new Date().toISOString(),
      session: sessionData,
    };
  }

  async loadAll(args, tab) {
    let activeSession = args.session;

    

    if (!activeSession) {
      const data = await chrome.storage.local.get(AUTH_STORAGE_KEY);
      activeSession = data[AUTH_STORAGE_KEY];
    }

    if (!activeSession) {
      throw new Error("state (all-load): no session provided and no saved session found.");
    }

    const { cookies, localStorage: localData, sessionStorage: sessionDataStore } = activeSession;

    await attach(tab.id);

    

    if (Array.isArray(cookies) && cookies.length > 0) {
      await sendCommand("Network.enable");
      for (const cookie of cookies) {
        const params = {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
        };
        if (cookie.expires && cookie.expires > 0) {
          params.expires = cookie.expires;
        }
        await sendCommand("Network.setCookie", params);
      }
    }

    

    if (localData || sessionDataStore) {
      const escapedLocal = JSON.stringify(localData || {});
      const escapedSession = JSON.stringify(sessionDataStore || {});

      const storageResult = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          try {
            const local = ${escapedLocal};
            const session = ${escapedSession};

            localStorage.clear();
            for (const [k, v] of Object.entries(local)) {
              localStorage.setItem(k, v);
            }

            sessionStorage.clear();
            for (const [k, v] of Object.entries(session)) {
              sessionStorage.setItem(k, v);
            }
            return { success: true };
          } catch (e) {
            return { error: e.message };
          }
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (storageResult.exceptionDetails) {
        throw new Error(`state (all-load): failed to write storage: ${storageResult.exceptionDetails.text}`);
      }

      if (storageResult.result.value?.error) {
        throw new Error(`state (all-load): ${storageResult.result.value.error}`);
      }
    }

    

    if (args?.reload !== false) {
      await sendCommand("Page.reload", { ignoreCache: true });
    }

    return {
      success: true,
      message: "Session loaded successfully and page context reloaded.",
    };
  }
}

export class SessionTool {
  name = "session";
  async execute(args) {
    return new StateTool().execute({ scope: "tabs", ...args });
  }
}

export class SessionManagerTool {
  name = "session_manager";
  async execute(args) {
    const stateTool = new StateTool();
    if (args.cmd === "load" && args.session) {
      return stateTool.execute({ scope: "all", cmd: "load", session: args.session, tabId: args.tabId });
    }
    return stateTool.execute({ scope: "all", ...args });
  }
}

export class CookieTool {
  name = "cookie";
  async execute(args) {
    const cmd = args.cmd === "get" ? "read" : args.cmd === "set" ? "write" : args.cmd;
    return new StateTool().execute({ scope: "cookies", cmd, ...args });
  }
}

export class LocalStorageTool {
  name = "local_storage";
  async execute(args) {
    const scope = args.storage === "sessionStorage" ? "session_storage" : "local_storage";
    const cmd = args.action === "get" ? "read" : args.action === "set" ? "write" : args.action;
    return new StateTool().execute({ scope, cmd, ...args });
  }
}
