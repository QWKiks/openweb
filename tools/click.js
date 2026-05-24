/**
 * Click Tool
 * Clicks an element by CSS selector or @e ref via DOM-level click().
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";
import { isSemanticSelector, resolveSelector } from "../lib/semantic-selector.js";

export class ClickTool {
  name = "click";

  async execute(args) {
    const selector = args.selector;
    if (!selector) throw new Error("click: selector is required (CSS selector or @e ref)");

    const tab = await getActiveTab();
    await attach(tab.id);

    return isRef(selector) ? this.clickByRef(selector) : this.clickBySelector(selector, args);
  }

  async clickByRef(ref) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`click: unknown ref "${ref}". Run snapshot first to get refs.`);

    let object;
    try {
      ({ object } = await sendCommand("DOM.resolveNode", {
        backendNodeId: nodeInfo.backendDOMNodeId,
      }));
    } catch (err) {
      throw new Error(
        `click: element "${ref}" was recreated by the page (SPA update). Run snapshot again to get updated @e refs.`
      );
    }
    if (!object?.objectId) throw new Error(`click: could not resolve ref "${ref}" to DOM element`);

    const result = await sendCommand("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function() {
        this.scrollIntoView({ block: 'center' });
        this.click();
        return { success: true, tag: this.tagName, text: this.textContent?.slice(0, 100) };
      }`,
      returnByValue: true,
    });

    // Clean up remote object to avoid leaking
    try { await sendCommand("Runtime.releaseObject", { objectId: object.objectId }); } catch {}

    if (result.exceptionDetails) throw new Error(`click: ${result.exceptionDetails.text}`);
    return result.result.value || { success: true };
  }

  async clickBySelector(selector, args = {}) {
    // If semantic selector, resolve to CSS candidates and try each
    if (isSemanticSelector(selector)) {
      const candidates = resolveSelector(selector);
      for (const css of candidates) {
        const result = await sendCommand("Runtime.evaluate", {
          expression: `(() => {
            const el = document.querySelector(${JSON.stringify(css)});
            if (!el) return null;
            el.scrollIntoView({ block: 'center' });
            el.click();
            return { success: true, tag: el.tagName, text: el.textContent?.slice(0, 100), resolvedWith: ${JSON.stringify(css)} };
          })()`,
          returnByValue: true,
          awaitPromise: false,
        });
        const value = result.result?.value;
        if (value) return value;
      }
      throw new Error(`click: semantic selector "${selector}" — no matching element found`);
    }

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ${selector}' };
        el.scrollIntoView({ block: 'center' });
        el.click();
        return { success: true, tag: el.tagName, text: el.textContent?.slice(0, 100) };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`click: ${result.exceptionDetails.text}`);
    const value = result.result.value;
    if (value?.error) throw new Error(value.error);
    return value || { success: true };
  }
}
