/**
 * Local Storage Tool
 * Read/write localStorage and sessionStorage for SPA state inspection.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class LocalStorageTool {
  name = "local_storage";

  async execute(args) {
    const action = args.action || "read";
    const storageType = args.storage || "localStorage";
    const key = args.key || null;
    const value = args.value || null;

    const tab = await getActiveTab();
    await attach(tab.id);

    let expression;

    switch (action) {
      case "read":
        expression = `(() => {
          const storage = ${storageType};
          if (key) {
            const val = storage.getItem(${JSON.stringify(key)});
            try { return { key, value: JSON.parse(val) }; } catch { return { key, value: val }; }
          }
          const all = {};
          for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            const v = storage.getItem(k);
            try { all[k] = JSON.parse(v); } catch { all[k] = v; }
          }
          return all;
        })()`;
        break;

      case "write":
        if (!key) throw new Error("local_storage: key is required for write action");
        expression = `(() => {
          const storage = ${storageType};
          const val = ${JSON.stringify(value)};
          storage.setItem(${JSON.stringify(key)}, val);
          return { action: "write", key: ${JSON.stringify(key)}, storage: "${storageType}" };
        })()`;
        break;

      case "delete":
        if (!key) throw new Error("local_storage: key is required for delete action");
        expression = `(() => {
          const storage = ${storageType};
          storage.removeItem(${JSON.stringify(key)});
          return { action: "delete", key: ${JSON.stringify(key)}, storage: "${storageType}" };
        })()`;
        break;

      case "clear":
        expression = `(() => {
          const storage = ${storageType};
          storage.clear();
          return { action: "clear", storage: "${storageType}" };
        })()`;
        break;

      default:
        throw new Error(`local_storage: unknown action "${action}". Use: read, write, delete, clear`);
    }

    const result = await sendCommand("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`local_storage: ${result.exceptionDetails.text}`);
    }

    return result.result?.value || {};
  }
}
