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
    const cmd = args.cmd || "type";
    const tab = await getActiveTab();
    await attach(tab.id);

    if (cmd === "mouse_move") {
      throw new Error("humanize(cmd: 'mouse_move') is deprecated. Please use the click tool with mode='humanized' instead.");
    }

    if (cmd === "type") {
      return this.type(args);
    }

    throw new Error(`humanize: unknown cmd "${cmd}". Use: type`);
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
}
