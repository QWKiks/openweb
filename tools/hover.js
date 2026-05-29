/**
 * Hover Tool
 * Hovers over an element by CSS selector or snapshot ref via CDP Input events.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class HoverTool {
  name = "hover";

  async execute(args) {
    const selector = args.selector;
    if (!selector) throw new Error("hover: selector is required (CSS selector or @e ref)");

    const tab = await getActiveTab();
    await attach(tab.id);

    return isRef(selector) ? this.hoverByRef(selector) : this.hoverBySelector(selector);
  }

  async hoverByRef(ref) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`hover: unknown ref "${ref}". Run snapshot first to get refs.`);

    const { object } = await sendCommand("DOM.resolveNode", {
      backendNodeId: nodeInfo.backendDOMNodeId,
    });
    if (!object?.objectId) throw new Error(`hover: could not resolve ref "${ref}" to DOM element`);

    // Scroll into view first
    await sendCommand("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function() {
        this.scrollIntoView({ block: 'center', inline: 'center' });
        return this.getBoundingClientRect();
      }`,
      returnByValue: true,
    });

    // Get box model for coordinates
    const boxModel = await sendCommand("DOM.getBoxModel", { objectId: object.objectId });
    try { await sendCommand("Runtime.releaseObject", { objectId: object.objectId }); } catch {}
    const border = boxModel.model?.border;
    if (!border || border.length < 8) throw new Error("hover: element has no layout box");

    const x = (border[0] + border[2] + border[4] + border[6]) / 4;
    const y = (border[1] + border[3] + border[5] + border[7]) / 4;

    await this.dispatchMouseEvents(x, y);
    return { success: true, ref, x, y };
  }

  async hoverBySelector(selector) {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ${selector}' };
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, tag: el.tagName };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`hover: ${result.exceptionDetails.text}`);
    const value = result.result.value;
    if (value?.error) throw new Error(value.error);

    await this.dispatchMouseEvents(value.x, value.y);
    return { success: true, selector, x: value.x, y: value.y, tag: value.tag };
  }

  async dispatchMouseEvents(x, y) {
    // Move mouse to the target position
    await sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
    });

    // Also dispatch DOM-level mouseover/mouseenter for JS handlers
    await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.elementFromPoint(${x}, ${y});
        if (!el) return;
        const overEvt = new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y} });
        const enterEvt = new MouseEvent('mouseenter', { bubbles: false, cancelable: true, clientX: ${x}, clientY: ${y} });
        el.dispatchEvent(overEvt);
        el.dispatchEvent(enterEvt);
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });
  }
}
