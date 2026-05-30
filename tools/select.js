import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class SelectTool {
  name = "select";

  async execute(args) {
    const selector = args.selector;
    const value = args.value;
    if (!selector) throw new Error("select: selector is required (CSS selector or @e ref)");
    if (value == null) throw new Error("select: value is required (option value or index)");

    const tab = await getActiveTab();
    await attach(tab.id);

    return isRef(selector) ? this.selectByRef(selector, value) : this.selectBySelector(selector, value);
  }

  async selectByRef(ref, value) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`select: unknown ref "${ref}". Run snapshot first to get refs.`);

    const { object } = await sendCommand("DOM.resolveNode", {
      backendNodeId: nodeInfo.backendDOMNodeId,
    });
    if (!object?.objectId) throw new Error(`select: could not resolve ref "${ref}" to DOM element`);

    const result = await sendCommand("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function() {
        if (this.tagName !== 'SELECT') return { error: 'element is not a <select> (tag: ' + this.tagName + ')' };
        return this.options ? this.options.length : 0;
      }`,
      returnByValue: true,
    });

    if (result.result.value?.error) throw new Error(result.result.value.error);

    return this.doSelect(object.objectId, value);
  }

  async selectBySelector(selector, value) {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ${selector}' };
        if (el.tagName !== 'SELECT') return { error: 'element is not a <select> (tag: ' + el.tagName + ')' };
        return { found: true };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`select: ${result.exceptionDetails.text}`);
    const val = result.result.value;
    if (val?.error) throw new Error(val.error);

    

    const objResult = await sendCommand("Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: false,
    });
    if (!objResult.result.objectId) throw new Error(`select: could not get element object`);

    return this.doSelect(objResult.result.objectId, value);
  }

  async doSelect(objectId, value) {
    const jsonValue = JSON.stringify(value);
    const isIndex = typeof value === "number";

    const result = await sendCommand("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function() {
        const __val = ${jsonValue};
        const __isIndex = ${isIndex};
        if (__isIndex) {
          this.selectedIndex = __val;
        } else {
          // Try matching by value first, then by text content
          for (let i = 0; i < this.options.length; i++) {
            if (this.options[i].value === __val || this.options[i].textContent.trim() === __val) {
              this.selectedIndex = i;
              break;
            }
          }
        }
        const __nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        if (__nativeSetter) __nativeSetter.call(this, this.value);
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, selectedIndex: this.selectedIndex, value: this.value };
      }`,
      returnByValue: true,
    });

    if (result.exceptionDetails) throw new Error(`select: ${result.exceptionDetails.text}`);
    return result.result.value || { success: true };
  }
}
