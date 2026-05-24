/**
 * Shadow DOM Tool
 * Accesses web components and Shadow DOM content.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class ShadowDomTool {
  name = "shadow_dom";

  async execute(args) {
    const action = args.action || "list";
    const selector = args.selector || null;

    const tab = await getActiveTab();
    await attach(tab.id);

    if (action === "list") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const hosts = [];
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            if (el.shadowRoot) {
              const tag = el.tagName.toLowerCase();
              const childCount = el.shadowRoot.querySelectorAll('*').length;
              hosts.push({
                tag,
                selector: tag + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : ''),
                id: el.id || null,
                className: el.className || null,
                shadowChildCount: childCount,
                hasSlot: !!el.shadowRoot.querySelector('slot'),
              });
            }
          }
          return {
            totalShadowHosts: hosts.length,
            hosts: hosts.slice(0, 50),
          };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) throw new Error(`shadow_dom: ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    if (action === "content") {
      if (!selector) throw new Error("shadow_dom: selector is required for content action");
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: "Element not found: " + ${JSON.stringify(selector)} };
          if (!el.shadowRoot) return { error: "Element has no shadow root: " + ${JSON.stringify(selector)} };
          
          const html = el.shadowRoot.innerHTML;
          const text = el.shadowRoot.textContent;
          const childTags = [...new Set([...el.shadowRoot.querySelectorAll('*')].map(c => c.tagName.toLowerCase()))];
          
          return {
            selector: ${JSON.stringify(selector)},
            tag: el.tagName.toLowerCase(),
            html: html.slice(0, 5000),
            htmlLength: html.length,
            text: text.slice(0, 1000),
            childTags,
            childCount: el.shadowRoot.querySelectorAll('*').length,
          };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) throw new Error(`shadow_dom: ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    throw new Error(`shadow_dom: unknown action "${action}". Use: list, content`);
  }
}
