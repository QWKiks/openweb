/**
 * Drag & Drop Tool
 * Drag an element and drop it onto another element.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class DragDropTool {
  name = "drag_drop";

  async execute(args) {
    const sourceSelector = args.source;
    const targetSelector = args.target;
    if (!sourceSelector) throw new Error("drag_drop: source is required (CSS selector or @e ref)");
    if (!targetSelector) throw new Error("drag_drop: target is required (CSS selector or @e ref)");

    const tab = await getActiveTab();
    await attach(tab.id);

    const sourcePos = await this.getElementCenter(sourceSelector);
    const targetPos = await this.getElementCenter(targetSelector);

    // CDP drag simulation: mousePressed → mouseMoved → mouseReleased
    await sendCommand("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: sourcePos.x,
      y: sourcePos.y,
      button: "left",
      clickCount: 1,
    });

    // Move in steps for smoother drag
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = sourcePos.x + (targetPos.x - sourcePos.x) * t;
      const y = sourcePos.y + (targetPos.y - sourcePos.y) * t;
      await sendCommand("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
      });
      await new Promise((r) => setTimeout(r, 20));
    }

    await sendCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: targetPos.x,
      y: targetPos.y,
      button: "left",
      clickCount: 1,
    });

    return {
      success: true,
      from: { x: sourcePos.x, y: sourcePos.y },
      to: { x: targetPos.x, y: targetPos.y },
    };
  }

  async getElementCenter(selector) {
    if (isRef(selector)) {
      const nodeInfo = resolveRef(selector);
      if (!nodeInfo) throw new Error(`drag_drop: unknown ref "${selector}". Run snapshot first.`);

      const { object } = await sendCommand("DOM.resolveNode", {
        backendNodeId: nodeInfo.backendDOMNodeId,
      });
      if (!object?.objectId) throw new Error(`drag_drop: could not resolve ref "${selector}"`);

      await sendCommand("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration: `function() { this.scrollIntoView({ block: 'center' }); }`,
      });

      const boxModel = await sendCommand("DOM.getBoxModel", { objectId: object.objectId });
      const border = boxModel.model?.border;
      if (!border || border.length < 8) throw new Error("drag_drop: source element has no layout box");

      return {
        x: (border[0] + border[2] + border[4] + border[6]) / 4,
        y: (border[1] + border[3] + border[5] + border[7]) / 4,
      };
    }

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ${selector}' };
        el.scrollIntoView({ block: 'center' });
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
      returnByValue: true,
    });

    const val = result.result.value;
    if (val?.error) throw new Error(val.error);
    return val;
  }
}
