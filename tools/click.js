/**
 * Click Tool
 * Clicks an element by CSS selector or @e ref via DOM-level click() or physical CDP input events.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";
import { isSemanticSelector, resolveSelector, parseSemanticSelector, buildTextSearchExpression } from "../lib/semantic-selector.js";

let lastMouseX = 100;
let lastMouseY = 100;

export class ClickTool {
  name = "click";

  async execute(args) {
    const selector = args.selector;
    if (!selector) throw new Error("click: selector is required (CSS selector or @e ref)");

    let mode = args.mode || "synthetic";
    if (args.physical === true && !args.mode) {
      mode = "physical";
    }

    const tab = await getActiveTab();
    await attach(tab.id);

    if (mode === "humanized") {
      return this.clickHumanized(selector, args.steps);
    }

    if (mode === "physical") {
      return this.clickPhysical(selector);
    }

    return isRef(selector) ? this.clickByRef(selector) : this.clickBySelector(selector, args);
  }

  async clickHumanized(selector, steps = 15) {
    const { objectId, resolvedWith } = await this.resolveObjectId(selector);

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
      try { await sendCommand("Runtime.releaseObject", { objectId }); } catch {}
      throw new Error(
        `click (humanized): element has no layout box (display:none / detached / zero-size). (CDP: ${err.message})`
      );
    }

    const content = boxModel.model?.content;
    if (!content || content.length < 8) {
      try { await sendCommand("Runtime.releaseObject", { objectId }); } catch {}
      throw new Error(
        "click (humanized): element has no layout box (display:none / detached / zero-size)."
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

    // Dispatch native click events
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

    // Get element info
    const info = await sendCommand("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function() { return { tag: this.tagName, text: (this.textContent || '').slice(0, 100) }; }`,
      returnByValue: true,
    });

    // Clean up remote object to avoid leaking
    try { await sendCommand("Runtime.releaseObject", { objectId }); } catch {}

    const result = {
      success: true,
      mode: "humanized",
      physical: true,
      x: Math.round(x),
      y: Math.round(y),
      tag: info.result.value?.tag ?? "",
      text: info.result.value?.text ?? "",
    };

    if (resolvedWith) {
      result.resolvedWith = resolvedWith;
    }

    return result;
  }

  async clickPhysical(selector) {
    const { objectId, resolvedWith } = await this.resolveObjectId(selector);

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
      try { await sendCommand("Runtime.releaseObject", { objectId }); } catch {}
      throw new Error(
        `click (physical): element has no layout box (display:none / detached / zero-size). RECOMMENDATION: Fall back to standard DOM click (omit 'physical' or set 'physical: false') or hover over parent element first to trigger visibility. (CDP: ${err.message})`
      );
    }

    const content = boxModel.model?.content;
    if (!content || content.length < 8) {
      try { await sendCommand("Runtime.releaseObject", { objectId }); } catch {}
      throw new Error(
        "click (physical): element has no layout box (display:none / detached / zero-size). RECOMMENDATION: Fall back to standard DOM click (omit 'physical' or set 'physical: false') or hover over parent element first to trigger visibility."
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

    // Clean up remote object to avoid leaking
    try { await sendCommand("Runtime.releaseObject", { objectId }); } catch {}

    const result = {
      success: true,
      physical: true,
      x: Math.round(x),
      y: Math.round(y),
      tag: info.result.value?.tag ?? "",
      text: info.result.value?.text ?? "",
    };

    if (resolvedWith) {
      result.resolvedWith = resolvedWith;
    }

    return result;
  }

  async resolveObjectId(selector) {
    if (isRef(selector)) {
      const objectId = await this.objectIdFromRef(selector);
      return { objectId };
    }

    if (isSemanticSelector(selector)) {
      const candidates = resolveSelector(selector);
      for (const candidate of candidates) {
        const objectId = await this.objectIdFromSelector(candidate);
        if (objectId) {
          return { objectId, resolvedWith: candidate };
        }
      }
      throw new Error(`click (physical): semantic selector "${selector}" — no matching element found`);
    }

    const objectId = await this.objectIdFromSelector(selector);
    if (!objectId) {
      throw new Error(`click (physical): element not found: "${selector}". RECOMMENDATION: If using a snapshot ref, ensure it is written as "@e12" (with an '@'). If using CSS, check if selector matches a valid visible element on the page.`);
    }
    return { objectId };
  }

  async objectIdFromRef(ref) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`click (physical): unknown ref "${ref}". RECOMMENDATION: The page may have performed an SPA update or navigated away. Run 'snapshot' first to get the latest updated @e refs.`);

    let object;
    try {
      ({ object } = await sendCommand("DOM.resolveNode", {
        backendNodeId: nodeInfo.backendDOMNodeId,
      }));
    } catch (err) {
      throw new Error(
        `click (physical): element "${ref}" was recreated by the page (SPA update). RECOMMENDATION: Run 'snapshot' again to get updated @e refs.`
      );
    }
    if (!object?.objectId) throw new Error(`click (physical): could not resolve ref "${ref}" to DOM element. RECOMMENDATION: The element might have been removed from the DOM. Run 'snapshot' again to verify.`);
    return object.objectId;
  }

  async objectIdFromSelector(selector) {
    // Handle js: prefixed selectors (text content search fallback from semantic-selector)
    let expression;
    if (selector.startsWith('js:')) {
      // Extract the JS expression params: js:findByTextContent("text", "scope")
      const match = selector.match(/^js:findByTextContent\("([^"]+)",\s*"([^"]+)"\)$/);
      if (match) {
        expression = buildTextSearchExpression(match[1], match[2]);
      } else {
        return null; // Malformed js: selector
      }
    } else {
      expression = `document.querySelector(${JSON.stringify(selector)})`;
    }

    const result = await sendCommand("Runtime.evaluate", {
      expression,
      returnByValue: false,
    });
    if (result.exceptionDetails) {
      // Don't throw on js: selectors — just return null to try next candidate
      if (selector.startsWith('js:')) return null;
      throw new Error(`click (physical): ${result.exceptionDetails.text}`);
    }
    if (result.result.subtype === "null" || !result.result.objectId) {
      return null;
    }
    return result.result.objectId;
  }

  async clickByRef(ref) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`click: unknown ref "${ref}". RECOMMENDATION: The page may have performed an SPA update or navigated away. Run 'snapshot' first to get the latest updated @e refs.`);

    let object;
    try {
      ({ object } = await sendCommand("DOM.resolveNode", {
        backendNodeId: nodeInfo.backendDOMNodeId,
      }));
    } catch (err) {
      throw new Error(
        `click: element "${ref}" was recreated by the page (SPA update). RECOMMENDATION: Run 'snapshot' again to get updated @e refs.`
      );
    }
    if (!object?.objectId) throw new Error(`click: could not resolve ref "${ref}" to DOM element. RECOMMENDATION: The element might have been removed from the DOM. Run 'snapshot' again to verify.`);

    const result = await sendCommand("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function() {
        this.scrollIntoView({ block: 'center' });
        this.click();
        return { success: true, tag: this.tagName, text: this.textContent?.slice(0, 100) };
      }`,
      returnByValue: true,
    });

    // Clean up remote object to avoid leaking
    try { await sendCommand("Runtime.releaseObject", { objectId: object.objectId }); } catch {}

    if (result.exceptionDetails) throw new Error(`click: ${result.exceptionDetails.text}`);
    return result.result.value || { success: true };
  }

  async clickBySelector(selector, args = {}) {
    // If semantic selector, resolve to CSS/JS candidates and try each
    if (isSemanticSelector(selector)) {
      const candidates = resolveSelector(selector);
      for (const candidate of candidates) {
        let findExpression;
        if (candidate.startsWith('js:')) {
          const match = candidate.match(/^js:findByTextContent\("([^"]+)",\s*"([^"]+)"\)$/);
          if (!match) continue;
          findExpression = buildTextSearchExpression(match[1], match[2]);
        } else {
          findExpression = `document.querySelector(${JSON.stringify(candidate)})`;
        }
        const result = await sendCommand("Runtime.evaluate", {
          expression: `(() => {
            const el = ${findExpression};
            if (!el) return null;
            el.scrollIntoView({ block: 'center' });
            el.click();
            return { success: true, tag: el.tagName, text: el.textContent?.slice(0, 100), resolvedWith: ${JSON.stringify(candidate)} };
          })()`,
          returnByValue: true,
          awaitPromise: false,
        });
        const value = result.result?.value;
        if (value) return value;
      }
      throw new Error(`click: semantic selector "${selector}" — no matching element found`);
    }

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ${selector}' };
        el.scrollIntoView({ block: 'center' });
        el.click();
        return { success: true, tag: el.tagName, text: el.textContent?.slice(0, 100) };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`click: ${result.exceptionDetails.text}`);
    const value = result.result.value;
    if (value?.error) throw new Error(value.error);
    return value || { success: true };
  }
}

