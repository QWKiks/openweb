/**
 * Content Script Injection Fallback
 * For pages where CDP is unavailable (chrome:// URLs, PDF viewer, etc.),
 * provides basic automation via chrome.scripting.executeScript.
 */

import { getActiveTab } from "../lib/tab-manager.js";

export class ContentScriptFallback {
  name = "content_script";

  /**
   * Execute JavaScript in the page context via content script injection.
   * Falls back when CDP debugger cannot attach.
   * @param {object} args
   * @param {string} args.code - JavaScript code to execute
   * @param {string} [args.selector] - Optional: click/fill a specific element first
   * @param {string} [args.action] - "evaluate" | "click" | "fill" | "get_text"
   * @param {string} [args.value] - Value for fill action
   */
  async execute(args) {
    const tab = await getActiveTab();
    const url = tab.url || "";

    // Only use content script for restricted URLs where CDP fails
    const needsFallback = url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("about:") ||
      url.endsWith(".pdf");

    if (!needsFallback && args.action !== "content_script") {
      throw new Error("content_script: Use CDP tools (evaluate, click, fill) for normal pages. This is a fallback only.");
    }

    const action = args.action || "evaluate";

    const scripts = {
      evaluate: args.code || "document.title",
      click: `document.querySelector(${JSON.stringify(args.selector)})?.click()`,
      fill: `(function() { const el = document.querySelector(${JSON.stringify(args.selector)}); if (el) { el.value = ${JSON.stringify(args.value)}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); } })()`,
      get_text: `document.querySelector(${JSON.stringify(args.selector || "body")})?.innerText || ""`,
    };

    const code = scripts[action] || args.code || "";

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      code,
    });

    const result = results?.[0]?.result;
    return {
      action,
      result: result !== undefined ? result : null,
      fallback: true,
    };
  }
}
