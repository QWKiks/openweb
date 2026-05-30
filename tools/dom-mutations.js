import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class DomMutationsTool {
  name = "dom_mutations";

  async execute(args) {
    const action = args.action || "read";
    const tab = await getActiveTab();
    await attach(tab.id);

    if (action === "start") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          window.__domMutations = window.__domMutations || [];
          if (window.__mutationObserverActive) return { status: "already_started" };
          
          const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
              const record = { type: m.type, timestamp: Date.now() };
              if (m.type === "childList") {
                record.added = m.addedNodes.length;
                record.removed = m.removedNodes.length;
                record.target = m.target.tagName?.toLowerCase() || "#text";
              } else if (m.type === "attributes") {
                record.attribute = m.attributeName;
                record.target = m.target.tagName?.toLowerCase() || "?";
              }
              window.__domMutations.push(record);
              if (window.__domMutations.length > 200) window.__domMutations.shift();
            }
          });
          
          observer.observe(document.body, { childList: true, subtree: true, attributes: true });
          window.__mutationObserverActive = true;
          return { status: "started" };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });
      if (result.exceptionDetails) throw new Error(`dom_mutations: ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    if (action === "read") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const mutations = window.__domMutations || [];
          const byType = {};
          for (const m of mutations) {
            byType[m.type] = (byType[m.type] || 0) + 1;
          }
          return {
            total: mutations.length,
            byType,
            recent: mutations.slice(-30),
            isActive: !!window.__mutationObserverActive,
          };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });
      if (result.exceptionDetails) throw new Error(`dom_mutations: ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    if (action === "stop") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          window.__mutationObserverActive = false;
          return { status: "stopped" };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });
      if (result.exceptionDetails) throw new Error(`dom_mutations: ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    throw new Error(`dom_mutations: unknown action "${action}". Use: start, read, stop`);
  }
}
