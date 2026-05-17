/**
 * Cookie Tool
 * Get, set, or delete cookies for the current page.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class CookieTool {
  name = "cookie";

  async execute(args) {
    const cmd = args.cmd || "get";
    const tab = await getActiveTab();
    await attach(tab.id);

    switch (cmd) {
      case "get": return this.getCookies(args.name, tab.url);
      case "set": return this.setCookie(args, tab.url);
      case "delete": return this.deleteCookie(args.name, tab.url);
      default: throw new Error(`cookie: unknown cmd "${cmd}". Use: get, set, delete`);
    }
  }

  async getCookies(name, url) {
    const { cookies } = await sendCommand("Network.getCookies");
    let filtered = cookies;
    if (name) {
      filtered = cookies.filter((c) => c.name === name);
    }
    return { count: filtered.length, cookies: filtered };
  }

  async setCookie(args, url) {
    if (!args.name) throw new Error("cookie: name is required for set");
    if (args.value == null) throw new Error("cookie: value is required for set");

    const params = {
      name: args.name,
      value: args.value,
      url: args.url || url,
    };

    if (args.domain) params.domain = args.domain;
    if (args.path) params.path = args.path;
    if (args.secure != null) params.secure = args.secure;
    if (args.httpOnly != null) params.httpOnly = args.httpOnly;
    if (args.sameSite) params.sameSite = args.sameSite;
    if (args.expires != null) params.expires = args.expires;

    await sendCommand("Network.setCookie", params);
    return { success: true, name: args.name };
  }

  async deleteCookie(name, url) {
    if (!name) throw new Error("cookie: name is required for delete");

    await sendCommand("Network.deleteCookies", {
      name,
      url: url,
    });
    return { success: true, deleted: name };
  }
}
