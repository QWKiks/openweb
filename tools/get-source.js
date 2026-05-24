/**
 * Get Source Tool
 * Extracts page source (HTML/CSS/JS metadata) for AI analysis.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class GetSourceTool {
  name = "get_source";

  async execute(args) {
    const format = args.format || "structured";
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: this.buildExpression(format),
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`get_source: ${result.exceptionDetails.text}`);
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
}
