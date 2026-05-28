/**
 * Get Text Tool
 * Extracts text or HTML source content from the page or a specific element.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class GetTextTool {
  name = "get_text";

  async execute(args) {
    const selector = args.selector || null;
    const includeHidden = args.includeHidden || false;
    const maxLength = args.maxLength || 50000;
    const format = args.format || "text";

    const tab = await getActiveTab();
    await attach(tab.id);

    // If requesting page-wide source formats (full, head_only, body_only, structured)
    if (["structured", "full", "head_only", "body_only"].includes(format)) {
      return this.getPageSource(format);
    }

    // If requesting raw HTML outer/inner HTML
    if (format === "html") {
      if (!selector) {
        return this.getPageHtml();
      }
      return isRef(selector) ? this.getHtmlByRef(selector) : this.getHtmlBySelector(selector);
    }

    // Default: clean text format
    if (!selector) {
      return this.getPageText(maxLength, includeHidden);
    }

    return isRef(selector) ? this.getTextByRef(selector, maxLength) : this.getTextBySelector(selector, maxLength);
  }

  async getPageText(maxLength, includeHidden) {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const style = includeHidden => {
          const all = document.body.querySelectorAll('*');
          let text = '';
          for (const el of all) {
            if (!includeHidden) {
              const s = getComputedStyle(el);
              if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
            }
            if (el.childElementCount === 0 && el.textContent.trim()) {
              text += el.textContent.trim() + '\\n';
            }
          }
          return text;
        };
        return style(${includeHidden});
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`get_text: ${result.exceptionDetails.text}`);
    const text = result.result.value || "";
    return { text: text.slice(0, maxLength), length: text.length, truncated: text.length > maxLength };
  }

  async getTextByRef(ref, maxLength) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`get_text: unknown ref "${ref}". Run snapshot first to get refs.`);

    const { object } = await sendCommand("DOM.resolveNode", {
      backendNodeId: nodeInfo.backendDOMNodeId,
    });
    if (!object?.objectId) throw new Error(`get_text: could not resolve ref "${ref}" to DOM element`);

    const result = await sendCommand("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function() {
        return this.innerText || this.textContent || '';
      }`,
      returnByValue: true,
    });

    if (result.exceptionDetails) throw new Error(`get_text: ${result.exceptionDetails.text}`);
    const text = result.result.value || "";
    return { text: text.slice(0, maxLength), length: text.length, truncated: text.length > maxLength, ref };
  }

  async getTextBySelector(selector, maxLength) {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ${selector}' };
        const text = el.innerText || el.textContent || '';
        return { text, tag: el.tagName };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`get_text: ${result.exceptionDetails.text}`);
    const val = result.result.value;
    if (val?.error) throw new Error(val.error);

    const text = val.text || "";
    return {
      text: text.slice(0, maxLength),
      length: text.length,
      truncated: text.length > maxLength,
      selector,
      tag: val.tag,
    };
  }

  async getPageHtml() {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `document.documentElement.outerHTML`,
      returnByValue: true,
      awaitPromise: false,
    });
    if (result.exceptionDetails) throw new Error(`get_text (html): ${result.exceptionDetails.text}`);
    return { html: result.result.value || "", title: await this.getPageTitle(), url: await this.getPageUrl() };
  }

  async getHtmlByRef(ref) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`get_text (html): unknown ref "${ref}". Run snapshot first to get refs.`);

    const { object } = await sendCommand("DOM.resolveNode", {
      backendNodeId: nodeInfo.backendDOMNodeId,
    });
    if (!object?.objectId) throw new Error(`get_text (html): could not resolve ref "${ref}" to DOM element`);

    const result = await sendCommand("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function() {
        return { html: this.outerHTML || this.innerHTML || '', tag: this.tagName };
      }`,
      returnByValue: true,
    });
    try { await sendCommand("Runtime.releaseObject", { objectId: object.objectId }); } catch {}

    if (result.exceptionDetails) throw new Error(`get_text (html): ${result.exceptionDetails.text}`);
    return result.result.value || {};
  }

  async getHtmlBySelector(selector) {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ${selector}' };
        return { html: el.outerHTML || el.innerHTML || '', tag: el.tagName };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`get_text (html): ${result.exceptionDetails.text}`);
    const val = result.result.value;
    if (val?.error) throw new Error(val.error);
    return val || {};
  }

  async getPageSource(format) {
    const result = await sendCommand("Runtime.evaluate", {
      expression: this.buildExpression(format),
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`get_text (${format}): ${result.exceptionDetails.text}`);
    return result.result.value || {};
  }

  buildExpression(format) {
    const expressions = {
      full: `(() => {
        return {
          html: document.documentElement.outerHTML,
          title: document.title,
          url: location.href,
        };
      })()`,
      head_only: `(() => {
        return {
          html: document.head.innerHTML,
          title: document.title,
          url: location.href,
        };
      })()`,
      body_only: `(() => {
        return {
          html: document.body.innerHTML,
          title: document.title,
          url: location.href,
        };
      })()`,
      structured: `(() => {
        const sheets = [...document.querySelectorAll('link[rel="stylesheet"]')]
          .map(l => l.href).filter(Boolean);
        const scripts = [...document.querySelectorAll('script[src]')]
          .map(s => s.src).filter(Boolean);
        const inlineStyles = document.querySelectorAll('style').length;
        const inlineScripts = [...document.querySelectorAll('script')]
          .filter(s => !s.src).length;
        const meta = {};
        document.querySelectorAll('meta[name], meta[property]')
          .forEach(m => {
            const key = m.getAttribute('name') || m.getAttribute('property');
            if (key) meta[key] = m.getAttribute('content') || '';
          });
        return {
          title: document.title,
          url: location.href,
          html: document.documentElement.outerHTML,
          headHtml: document.head.innerHTML,
          bodyHtml: document.body.innerHTML,
          stylesheets: sheets,
          scripts: scripts,
          inlineStyles,
          inlineScripts,
          meta,
        };
      })()`,
    };

    return expressions[format] || expressions.structured;
  }

  async getPageTitle() {
    try {
      const res = await sendCommand("Runtime.evaluate", { expression: "document.title", returnByValue: true });
      return res.result?.value || "";
    } catch {
      return "";
    }
  }

  async getPageUrl() {
    try {
      const res = await sendCommand("Runtime.evaluate", { expression: "location.href", returnByValue: true });
      return res.result?.value || "";
    } catch {
      return "";
    }
  }
}

