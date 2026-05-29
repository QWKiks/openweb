/**
 * Session Manager Tool
 * Saves and restores active session contexts (cookies, localStorage, sessionStorage)
 * to allow AI agents to persist authenticated states across runs.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class SessionManagerTool {
  name = "session_manager";

  async execute(args) {
    const cmd = args.cmd || "save";
    const tab = await getActiveTab();
    await attach(tab.id);

    switch (cmd) {
      case "save":
        return this.saveSession(tab.url);
      case "load":
        return this.loadSession(args.session);
      default:
        throw new Error(`session_manager: unknown cmd "${cmd}". Use: save, load`);
    }
  }

  async saveSession(url) {
    // 1. Enable network domain to fetch cookies
    await sendCommand("Network.enable");

    // 2. Fetch all cookies for the current page
    const { cookies } = await sendCommand("Network.getCookies", { urls: [url] });

    // 3. Fetch localStorage and sessionStorage via page context evaluation
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
      throw new Error(`session_manager (save): failed to retrieve storage: ${storageResult.exceptionDetails.text}`);
    }

    const storage = storageResult.result.value || { localStorage: {}, sessionStorage: {} };

    return {
      success: true,
      url,
      timestamp: new Date().toISOString(),
      session: {
        cookies: cookies || [],
        localStorage: storage.localStorage || {},
        sessionStorage: storage.sessionStorage || {},
      }
    };
  }

  async loadSession(sessionData) {
    if (!sessionData) {
      throw new Error("session_manager (load): 'session' object is required");
    }

    const { cookies, localStorage: localData, sessionStorage: sessionDataStore } = sessionData;

    // 1. Restore cookies
    if (Array.isArray(cookies) && cookies.length > 0) {
      await sendCommand("Network.enable");
      for (const cookie of cookies) {
        // Prepare setCookie params (ignoring runtime specific fields like size, priority)
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

    // 2. Restore localStorage & sessionStorage
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
        throw new Error(`session_manager (load): failed to write storage: ${storageResult.exceptionDetails.text}`);
      }

      if (storageResult.result.value?.error) {
        throw new Error(`session_manager (load): ${storageResult.result.value.error}`);
      }
    }

    // Reload the page to apply the active session context
    await sendCommand("Page.reload", { ignoreCache: true });

    return {
      success: true,
      message: "Session loaded successfully and page context reloaded."
    };
  }
}
