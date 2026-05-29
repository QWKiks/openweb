/**
 * Humanize Tool
 * Emulates human-like mouse paths (using cubic Bezier curves) and natural typing delays.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

// Cached mouse position
let lastMouseX = 100;
let lastMouseY = 100;

export class HumanizeTool {
  name = "humanize";

  async execute(args) {
    const cmd = args.cmd || "mouse_move";
    const tab = await getActiveTab();
    await attach(tab.id);

    switch (cmd) {
      case "mouse_move":
        return this.mouseMove(args);
      case "type":
        return this.type(args);
      default:
        throw new Error(`humanize: unknown cmd "${cmd}". Use: mouse_move, type`);
    }
  }

  async mouseMove(args) {
    let { x, y, selector, steps, click } = args;
    steps = steps || 15;
    const shouldClick = click === true;

    // Resolve target coordinates if selector/ref is provided
    if (selector) {
      const coords = await this.resolveElementCenter(selector);
      x = coords.x;
      y = coords.y;
    }

    if (x == null || y == null) {
      throw new Error("humanize (mouse_move): coordinates x/y or selector is required");
    }

    const startX = lastMouseX;
    const startY = lastMouseY;

    // Generate cubic Bezier control points with slight natural random offset
    const dx = x - startX;
    const dy = y - startY;
    const offset1 = (Math.random() - 0.5) * 60;
    const offset2 = (Math.random() - 0.5) * 60;

    const P0 = { x: startX, y: startY };
    const P1 = { x: startX + dx * 0.25, y: startY + dy * 0.25 - offset1 };
    const P2 = { x: startX + dx * 0.75, y: startY + dy * 0.75 + offset2 };
    const P3 = { x, y };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Move along the Bezier curve
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.round(
        (1 - t) ** 3 * P0.x +
        3 * (1 - t) ** 2 * t * P1.x +
        3 * (1 - t) * t ** 2 * P2.x +
        t ** 3 * P3.x
      );
      const cy = Math.round(
        (1 - t) ** 3 * P0.y +
        3 * (1 - t) ** 2 * t * P1.y +
        3 * (1 - t) * t ** 2 * P2.y +
        t ** 3 * P3.y
      );

      await sendCommand("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: cx,
        y: cy,
        button: "none",
        buttons: 0,
      });

      // Natural micro-delay between steps
      await sleep(10 + Math.random() * 10);
    }

    // Update global state
    lastMouseX = x;
    lastMouseY = y;

    // Dispatch click if requested
    if (shouldClick) {
      await sendCommand("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        buttons: 1,
        clickCount: 1,
      });
      await sleep(30 + Math.random() * 50); // micro-delay holding click
      await sendCommand("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
    }

    return { success: true, endX: x, endY: y, clicked: shouldClick };
  }

  async type(args) {
    const { text, selector, delayMin, delayMax } = args;
    if (text == null) throw new Error("humanize (type): text is required");

    const min = delayMin || 50;
    const max = delayMax || 150;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Focus target element first if selector is passed
    if (selector) {
      await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const el = ${isRef(selector) ? `null` : `document.querySelector(${JSON.stringify(selector)})`};
          if (el) {
            el.focus();
            el.value = ''; // clear existing
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
          return false;
        })()`,
      });

      // If it's a ref, resolve it and focus
      if (isRef(selector)) {
        const nodeInfo = resolveRef(selector);
        if (nodeInfo) {
          const { object } = await sendCommand("DOM.resolveNode", {
            backendNodeId: nodeInfo.backendDOMNodeId,
          });
          if (object?.objectId) {
            await sendCommand("Runtime.callFunctionOn", {
              objectId: object.objectId,
              functionDeclaration: `function() { this.focus(); this.value = ''; }`,
            });
          }
        }
      }
    }

    // Type character by character
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const keySpec = this.getKeySpec(char);

      await sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown",
        modifiers: 0,
        key: keySpec.key,
        code: keySpec.code,
        windowsVirtualKeyCode: keySpec.vkc,
        text: keySpec.text,
      });

      await sleep(10 + Math.random() * 20); // hold key slightly

      await sendCommand("Input.dispatchKeyEvent", {
        type: "keyUp",
        modifiers: 0,
        key: keySpec.key,
        code: keySpec.code,
        windowsVirtualKeyCode: keySpec.vkc,
      });

      // Natural randomized typing delay
      const delay = min + Math.random() * (max - min);
      await sleep(delay);
    }

    return { success: true, length: text.length };
  }

  getKeySpec(char) {
    if (char === " ") {
      return { key: " ", code: "Space", vkc: 32, text: " " };
    }
    if (/^[a-zA-Z]$/.test(char)) {
      const upper = char.toUpperCase();
      return { key: char, code: `Key${upper}`, vkc: upper.charCodeAt(0), text: char };
    }
    if (/^[0-9]$/.test(char)) {
      return { key: char, code: `Digit${char}`, vkc: char.charCodeAt(0), text: char };
    }
    // Fallback for special symbols
    return { key: char, code: "", vkc: char.charCodeAt(0), text: char };
  }

  async resolveElementCenter(selector) {
    let objectId;
    
    if (isRef(selector)) {
      const nodeInfo = resolveRef(selector);
      if (!nodeInfo) throw new Error(`humanize: unknown ref "${selector}"`);
      const { object } = await sendCommand("DOM.resolveNode", {
        backendNodeId: nodeInfo.backendDOMNodeId,
      });
      objectId = object?.objectId;
    } else {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(selector)})`,
      });
      objectId = result.result?.objectId;
    }

    if (!objectId) throw new Error(`humanize: could not resolve selector "${selector}"`);

    // Get box model center coordinates
    const boxModel = await sendCommand("DOM.getBoxModel", { objectId });
    try { await sendCommand("Runtime.releaseObject", { objectId }); } catch {}
    const content = boxModel.model?.content;
    if (!content || content.length < 8) {
      throw new Error(`humanize: element "${selector}" has no layout box`);
    }

    let x = (content[0] + content[2] + content[4] + content[6]) / 4;
    let y = (content[1] + content[3] + content[5] + content[7]) / 4;

    const dprResult = await sendCommand("Runtime.evaluate", {
      expression: "window.devicePixelRatio",
      returnByValue: true,
    });
    const dpr = dprResult.result?.value || 1;
    
    return { x: x / dpr, y: y / dpr };
  }
}
