/**
 * Get Text Tool
 * Extracts text content from the page or a specific element.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class GetTextTool {
  name = "get_text";

  async execute(args) {
    const selector = args.selector || null;
    const includeHidden = args.includeHidden || false;
    const maxLength = args.maxLength || 50000;

    const tab = await getActiveTab();
    await attach(tab.id);

    if (!selector) {
      // Get full page text
      return this.getPageText(maxLength, includeHidden);
    }

    return isRef(selector) ? this.getTextByRef(selector, maxLength) : this.getTextBySelector(selector, maxLength);
  }

  async getPageText(maxLength, includeHidden) {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const style = includeHidden => {
          const all = document.body.querySelectorAll('*');
          let text = '';
          for (const el of all) {
            if (!includeHidden) {
              const s = getComputedStyle(el);
              if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
            }
            if (el.childElementCount === 0 && el.textContent.trim()) {
              text += el.textContent.trim() + '\\n';
            }
          }
          return text;
        };
        return style(${includeHidden});
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`get_text: ${result.exceptionDetails.text}`);
    const text = result.result.value || "";
    return { text: text.slice(0, maxLength), length: text.length, truncated: text.length > maxLength };
  }

  async getTextByRef(ref, maxLength) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`get_text: unknown ref "${ref}". Run snapshot first to get refs.`);

    const { object } = await sendCommand("DOM.resolveNode", {
      backendNodeId: nodeInfo.backendDOMNodeId,
    });
    if (!object?.objectId) throw new Error(`get_text: could not resolve ref "${ref}" to DOM element`);

    const result = await sendCommand("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function() {
        return this.innerText || this.textContent || '';
      }`,
      returnByValue: true,
    });

    if (result.exceptionDetails) throw new Error(`get_text: ${result.exceptionDetails.text}`);
    const text = result.result.value || "";
    return { text: text.slice(0, maxLength), length: text.length, truncated: text.length > maxLength, ref };
  }

  async getTextBySelector(selector, maxLength) {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ${selector}' };
        const text = el.innerText || el.textContent || '';
        return { text, tag: el.tagName };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`get_text: ${result.exceptionDetails.text}`);
    const val = result.result.value;
    if (val?.error) throw new Error(val.error);

    const text = val.text || "";
    return {
      text: text.slice(0, maxLength),
      length: text.length,
      truncated: text.length > maxLength,
      selector,
      tag: val.tag,
    };
  }
}
