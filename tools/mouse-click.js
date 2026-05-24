/**
 * Mouse Click Tool
 * Performs a physical mouse click at the center of an element using CDP Input events.
 * Falls back gracefully for elements without a layout box.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class MouseClickTool {
  name = "mouse_click";

  async execute(args) {
    const selector = args.selector;
    if (!selector) throw new Error("mouse_click: selector is required (CSS selector or @e ref)");

    const tab = await getActiveTab();
    await attach(tab.id);

    const objectId = isRef(selector)
      ? await this.objectIdFromRef(selector)
      : await this.objectIdFromSelector(selector);

    // Scroll into view
    await sendCommand("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function() { this.scrollIntoView({ block: 'center', inline: 'center' }); }`,
    });

    // Get box model
    let boxModel;
    try {
      boxModel = await sendCommand("DOM.getBoxModel", { objectId });
    } catch (err) {
      throw new Error(
        `mouse_click: element has no layout box (display:none / detached / zero-size). Use 'click' for DOM-level fallback. (CDP: ${err.message})`
      );
    }

    const content = boxModel.model?.content;
    if (!content || content.length < 8) {
      throw new Error(
        "mouse_click: element has no layout box (display:none / detached / zero-size). Use 'click' for DOM-level fallback."
      );
    }

    // Calculate center point
    let x = (content[0] + content[2] + content[4] + content[6]) / 4;
    let y = (content[1] + content[3] + content[5] + content[7]) / 4;

    // Apply devicePixelRatio correction for Retina displays
    const dprResult = await sendCommand("Runtime.evaluate", {
      expression: "window.devicePixelRatio",
      returnByValue: true,
    });
    const dpr = dprResult.result?.value || 1;
    x = x / dpr;
    y = y / dpr;

    // Dispatch mouse events
    await sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved", x, y, button: "none", buttons: 0,
    });
    await sendCommand("Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1,
    });
    await sendCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
    });

    // Get element info
    const info = await sendCommand("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function() { return { tag: this.tagName, text: (this.textContent || '').slice(0, 100) }; }`,
      returnByValue: true,
    });

    return {
      success: true,
      x: Math.round(x),
      y: Math.round(y),
      tag: info.result.value?.tag ?? "",
      text: info.result.value?.text ?? "",
    };
  }

  async objectIdFromRef(ref) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`mouse_click: unknown ref "${ref}". Run snapshot first to get refs.`);

    let object;
    try {
      ({ object } = await sendCommand("DOM.resolveNode", {
        backendNodeId: nodeInfo.backendDOMNodeId,
      }));
    } catch (err) {
      throw new Error(
        `mouse_click: element "${ref}" was recreated by the page (SPA update). Run snapshot again to get updated @e refs.`
      );
    }
    if (!object?.objectId) throw new Error(`mouse_click: could not resolve ref "${ref}" to DOM element`);
    return object.objectId;
  }

  async objectIdFromSelector(selector) {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: false,
    });
    if (result.exceptionDetails) throw new Error(`mouse_click: ${result.exceptionDetails.text}`);
    if (result.result.subtype === "null" || !result.result.objectId) {
      throw new Error(`mouse_click: element not found: ${selector}`);
    }
    return result.result.objectId;
  }
}
