/**
 * Cookie Audit Tool
 * Extended cookie analysis: Secure, HttpOnly, SameSite, size, count.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class CookieAuditTool {
  name = "cookie_audit";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const cookies = document.cookie.split(';').filter(Boolean).map(c => {
          const [name, ...valueParts] = c.trim().split('=');
          const value = valueParts.join('=');
          return { name: name.trim(), value: value.trim(), size: c.trim().length };
        });
        
        const totalSize = cookies.reduce((s, c) => s + c.size, 0);
        const httpOnlyCount = 0; // Cannot detect from JS
        
        return {
          total: cookies.length,
          totalSize,
          averageSize: cookies.length > 0 ? Math.round(totalSize / cookies.length) : 0,
          cookies: cookies.map(c => ({
            name: c.name,
            valuePreview: c.value.slice(0, 50) + (c.value.length > 50 ? '...' : ''),
            size: c.size,
          })).slice(0, 30),
        };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`cookie_audit: ${result.exceptionDetails.text}`);

    const data = result.result?.value || {};
    data.url = tab.url;
    data.note = "HttpOnly/Secure/SameSite flags are not visible from JavaScript. Use the cookie tool for full flags.";

    return data;
  }
}
