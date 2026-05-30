import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class SelectAutocompleteTool {
  name = "select_autocomplete";

  async execute(args) {
    const selector = args.selector;
    const text = args.text;
    if (!selector) throw new Error("select_autocomplete: selector is required (CSS selector or @e ref)");
    if (!text || typeof text !== "string" || text.length === 0) {
      throw new Error("select_autocomplete: text is required (non-empty string to type)");
    }

    const tab = await getActiveTab();
    await attach(tab.id);

    await this.focusAndClear(selector);

    const charDelay = args.delay ?? 80;
    const chars = [...text];
    for (const ch of chars) {
      await sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown", key: ch, text: ch,
      });
      await sendCommand("Input.dispatchKeyEvent", {
        type: "keyUp", key: ch, text: ch,
      });
      if (charDelay > 0) await new Promise((r) => setTimeout(r, charDelay));
    }

    await new Promise((r) => setTimeout(r, 600));

    if (args.selectValue) {
      const itemCss = args.itemSelector ||
        '[role="option"], [role="listbox"] [role="option"], [data-option-value], li[data-value], ' +
        '.autocomplete-item, .suggestion-item, [class*="option"], [class*="suggestion"]';
      const clickResult = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const items = document.querySelectorAll(${JSON.stringify(itemCss)});
          const target = Array.from(items).find(el =>
            el.textContent.trim().toLowerCase().includes(${JSON.stringify(args.selectValue.toLowerCase())})
          );
          if (target) { target.click(); return { found: true, text: target.textContent.trim() }; }
          return { found: false, count: items.length };
        })()`,
        returnByValue: true,
      });
      const selectResult = clickResult.result?.value;
      if (selectResult?.found) {
        const finalValue = await this.readActiveElementValue();
        return {
          success: true,
          action: "select_autocomplete",
          typedText: text,
          selectedValue: finalValue,
          selectedText: selectResult.text,
          method: "item_click",
        };
      }
    }

    await sendCommand("Input.dispatchKeyEvent", {
      type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40,
    });
    await sendCommand("Input.dispatchKeyEvent", {
      type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40,
    });
    await new Promise((r) => setTimeout(r, 120));
    await sendCommand("Input.dispatchKeyEvent", {
      type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r",
    });
    await sendCommand("Input.dispatchKeyEvent", {
      type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
    });

    const finalValue = await this.readActiveElementValue();

    return {
      success: true,
      action: "select_autocomplete",
      typedText: text,
      selectedValue: finalValue,
      method: "arrow_down_enter",
    };
  }

  async readActiveElementValue() {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.activeElement;
        if (!el) return { value: null, reason: 'no active element' };
        return { value: el.value, tag: el.tagName, id: el.id || '' };
      })()`,
      returnByValue: true,
    });
    return result.result?.value?.value ?? "";
  }

  async focusAndClear(selector) {
    if (isRef(selector)) {
      const nodeInfo = resolveRef(selector);
      if (!nodeInfo) throw new Error(`select_autocomplete: unknown ref "${selector}". Run snapshot first.`);
      const { object } = await sendCommand("DOM.resolveNode", {
        backendNodeId: nodeInfo.backendDOMNodeId,
      });
      if (!object?.objectId) throw new Error(`select_autocomplete: could not resolve ref "${selector}"`);
      await sendCommand("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration: `function() {
          this.scrollIntoView({ block: 'center' });
          this.focus();
          if (this.tagName === 'INPUT' || this.tagName === 'TEXTAREA') {
            this.value = '';
          }
        }`,
        returnByValue: true,
      });
    } else {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: 'element not found' };
          el.scrollIntoView({ block: 'center' });
          el.focus();
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.value = '';
          }
          return { tag: el.tagName };
        })()`,
        returnByValue: true,
      });
      if (result.exceptionDetails) throw new Error(`select_autocomplete: ${result.exceptionDetails.text}`);
      const val = result.result.value;
      if (val?.error) throw new Error(`select_autocomplete: ${val.error}`);
    }
  }
}
