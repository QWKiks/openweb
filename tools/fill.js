import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";
import { isSemanticSelector, resolveSelector } from "../lib/semantic-selector.js";

export class FillTool {
  name = "fill";

  async execute(args) {
    const selector = args.selector;
    const value = args.value;
    if (!selector) throw new Error("fill: selector is required (CSS selector or @e ref)");
    if (value == null) throw new Error("fill: value is required");

    const tab = await getActiveTab();
    await attach(tab.id);

    return isRef(selector) ? this.fillByRef(selector, value) : this.fillBySelector(selector, value);
  }

  async fillByRef(ref, value) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`fill: unknown ref "${ref}". Run snapshot first to get refs.`);

    const { object } = await sendCommand("DOM.resolveNode", {
      backendNodeId: nodeInfo.backendDOMNodeId,
    });
    if (!object?.objectId) throw new Error(`fill: could not resolve ref "${ref}" to DOM element`);

    const result = await sendCommand("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function() { ${generateFillCode("this", value)} }`,
      returnByValue: true,
    });

    if (result.exceptionDetails) throw new Error(`fill: ${result.exceptionDetails.text}`);
    return result.result.value || { success: true };
  }

  async fillBySelector(selector, value) {
    

    if (isSemanticSelector(selector)) {
      const candidates = resolveSelector(selector);
      for (const css of candidates) {
        const result = await sendCommand("Runtime.evaluate", {
          expression: `(() => {
            const el = document.querySelector(${JSON.stringify(css)});
            if (!el) return null;
            ${generateFillCode("el", value)}
          })()`,
          returnByValue: true,
          awaitPromise: false,
        });
        const val = result.result?.value;
        if (val && !val.error) return { ...val, resolvedWith: css };
      }
      throw new Error(`fill: semantic selector "${selector}" — no matching element found`);
    }

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ${selector}' };
        ${generateFillCode("el", value)}
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`fill: ${result.exceptionDetails.text}`);
    const val = result.result.value;
    if (val?.error) throw new Error(val.error);
    return val || { success: true };
  }
}

   
                                                   
                                                            
                                                                    
                                        
                                    
   
function generateFillCode(targetExpr, value) {
  const jsonValue = JSON.stringify(value);
  return `
    const __target = ${targetExpr};
    __target.focus();

    // --- combobox / autocomplete detection ---
    const __role = (__target.getAttribute('role') || '').toLowerCase();
    const __ariaAuto = __target.hasAttribute('aria-autocomplete');
    const __parentCombobox = __target.closest('[role="combobox"]');
    const __isCombobox = __role === 'combobox' || __ariaAuto || !!__parentCombobox;

    if (__target.isContentEditable) {
      const __sel = window.getSelection();
      if (__sel) {
        const __range = document.createRange();
        __range.selectNodeContents(__target);
        __sel.removeAllRanges();
        __sel.addRange(__range);
      }
      let __inserted = false;
      try {
        __inserted = document.execCommand('insertText', false, ${jsonValue});
      } catch (_e) {
        __inserted = false;
      }
      if (!__inserted) {
        __target.textContent = ${jsonValue};
        __target.dispatchEvent(new InputEvent('input', {
          inputType: 'insertText',
          data: ${jsonValue},
          bubbles: true,
        }));
      }
      return {
        success: true, tag: __target.tagName, mode: 'contenteditable',
        comboboxDetected: __isCombobox,
        actualValue: __target.textContent,
        suggestion: __isCombobox ? 'This field appears to be a combobox/autocomplete. fill() sets text but may NOT trigger the autocomplete dropdown. For proper autocomplete interaction, use select_autocomplete() instead.' : undefined
      };
    }

    const __nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (__nativeSetter) {
      __nativeSetter.call(__target, ${jsonValue});
    } else {
      __target.value = ${jsonValue};
    }
    __target.dispatchEvent(new Event('input', { bubbles: true }));
    __target.dispatchEvent(new Event('change', { bubbles: true }));

    // Read back the actual value after set
    const __actualValue = __target.value;

    return {
      success: true, tag: __target.tagName, mode: 'value',
      comboboxDetected: __isCombobox,
      actualValue: __actualValue,
      suggestion: __isCombobox ? 'This field appears to be a combobox/autocomplete. fill() sets the value directly but may NOT trigger the autocomplete dropdown. For proper autocomplete interaction, use select_autocomplete() instead.' : undefined
    };
  `;
}
