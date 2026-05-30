import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class WaitStaleTool {
  name = "wait_stale";

  async execute(args) {
    const selector = args.selector;
    if (!selector) throw new Error("wait_stale: selector is required (CSS selector or @e ref)");

    const timeout = args.timeout || 10000;
    const intervalMs = 200;
    const maxAttempts = Math.ceil(timeout / intervalMs);

    const tab = await getActiveTab();
    await attach(tab.id);

    

    let resolvedSelector = selector;
    if (isRef(selector)) {
      const nodeInfo = resolveRef(selector);
      if (!nodeInfo) throw new Error(`wait_stale: unknown ref "${selector}". Run snapshot first.`);
      resolvedSelector = await this.selectorFromBackendNode(nodeInfo.backendDOMNodeId);
    }

    const startTime = Date.now();
    for (let i = 0; i < maxAttempts; i++) {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(resolvedSelector)});
          if (!el) return { stale: true, reason: 'removed' };
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return { stale: true, reason: 'hidden' };
          }
          return { stale: false };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) {
        throw new Error(`wait_stale: ${result.exceptionDetails.text}`);
      }

      const value = result.result.value;
      if (value?.stale) {
        const elapsed = Date.now() - startTime;
        return {
          success: true,
          stale: true,
          reason: value.reason,
          waitedMs: elapsed,
          selector: resolvedSelector,
        };
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return {
      success: false,
      stale: false,
      waitedMs: Date.now() - startTime,
      timeout: true,
      selector: resolvedSelector,
    };
  }

  async selectorFromBackendNode(backendNodeId) {
    const { object } = await sendCommand("DOM.resolveNode", {
      backendNodeId,
    });
    if (!object?.objectId) return null;

    const result = await sendCommand("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function() {
        if (!this || !this.tagName) return null;
        const tag = this.tagName.toLowerCase();
        const id = this.id ? '#' + CSS.escape(this.id) : '';
        if (id) return tag + id;
        const cls = Array.from(this.classList).map(c => '.' + CSS.escape(c)).join('');
        const parent = this.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(s => s.tagName === this.tagName);
          const idx = siblings.indexOf(this) + 1;
          return tag + cls + ':nth-of-type(' + idx + ')';
        }
        return tag + cls;
      }`,
      returnByValue: true,
    });
    try { await sendCommand("Runtime.releaseObject", { objectId: object.objectId }); } catch {}

    return result?.result?.value || null;
  }
}
