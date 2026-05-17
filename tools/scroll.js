/**
 * Scroll Tool
 * Scroll the page or a specific element in a given direction.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class ScrollTool {
  name = "scroll";

  async execute(args) {
    const direction = args.direction || "down";
    const amount = args.amount || 3; // number of viewport heights to scroll
    const selector = args.selector || null;

    const tab = await getActiveTab();
    await attach(tab.id);

    if (selector) {
      return this.scrollElement(selector, direction, amount);
    }

    return this.scrollPage(direction, amount);
  }

  async scrollPage(direction, amount) {
    const scrollMap = {
      down: `window.scrollBy(0, window.innerHeight * ${amount})`,
      up: `window.scrollBy(0, -window.innerHeight * ${amount})`,
      left: `window.scrollBy(-window.innerWidth * ${amount}, 0)`,
      right: `window.scrollBy(window.innerWidth * ${amount}, 0)`,
      top: "window.scrollTo(0, 0)",
      bottom: "window.scrollTo(0, document.body.scrollHeight)",
    };

    const expression = scrollMap[direction];
    if (!expression) {
      throw new Error(`scroll: unknown direction "${direction}". Use: down, up, left, right, top, bottom`);
    }

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        ${expression};
        return {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          viewportHeight: window.innerHeight,
        };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`scroll: ${result.exceptionDetails.text}`);
    return { success: true, direction, ...result.result.value };
  }

  async scrollElement(selector, direction, amount) {
    const scrollMap = {
      down: `el.scrollBy(0, el.clientHeight * ${amount})`,
      up: `el.scrollBy(0, -el.clientHeight * ${amount})`,
      left: `el.scrollBy(-el.clientWidth * ${amount}, 0)`,
      right: `el.scrollBy(el.clientWidth * ${amount}, 0)`,
      top: "el.scrollTop = 0",
      bottom: "el.scrollTop = el.scrollHeight",
    };

    const scrollExpr = scrollMap[direction];
    if (!scrollExpr) {
      throw new Error(`scroll: unknown direction "${direction}". Use: down, up, left, right, top, bottom`);
    }

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ${selector}' };
        ${scrollExpr};
        return { scrollTop: el.scrollTop, scrollLeft: el.scrollLeft, scrollHeight: el.scrollHeight };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`scroll: ${result.exceptionDetails.text}`);
    const val = result.result.value;
    if (val?.error) throw new Error(val.error);
    return { success: true, direction, selector, ...val };
  }
}
