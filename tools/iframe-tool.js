/**
 * Iframe Tool
 * Lists iframes and extracts content from them.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class IframeTool {
  name = "iframe_list";

  async execute(args) {
    const action = args.action || "list";
    const index = args.index !== undefined ? args.index : null;

    const tab = await getActiveTab();
    await attach(tab.id);

    if (action === "list") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const iframes = [...document.querySelectorAll('iframe')];
          return {
            total: iframes.length,
            frames: iframes.map((f, i) => ({
              index: i,
              src: f.src || null,
              name: f.name || null,
              id: f.id || null,
              title: f.title || null,
              sandbox: f.getAttribute('sandbox') || null,
              width: f.width || null,
              height: f.height || null,
              loading: f.getAttribute('loading') || null,
              allow: f.getAttribute('allow') || null,
              isAccessible: !!f.contentDocument,
            })),
          };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) throw new Error(`iframe_list: ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    if (action === "content") {
      if (index === null) throw new Error("iframe_list: index is required for content action");
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const frames = document.querySelectorAll('iframe');
          if (${index} >= frames.length) return { error: "Index " + ${index} + " out of bounds. Total frames: " + frames.length };
          const f = frames[${index}];
          const doc = f.contentDocument;
          if (!doc) return { error: "Cannot access iframe content (cross-origin or not loaded)", src: f.src };
          
          return {
            index: ${index},
            src: f.src,
            title: doc.title,
            url: doc.location?.href,
            html: doc.documentElement?.outerHTML?.slice(0, 5000) || null,
            htmlLength: doc.documentElement?.outerHTML?.length || 0,
            text: doc.body?.textContent?.slice(0, 2000) || null,
            links: [...doc.querySelectorAll('a')].map(a => ({ href: a.href, text: a.textContent?.slice(0, 50) })).slice(0, 20),
            images: [...doc.querySelectorAll('img')].map(img => ({ src: img.src, alt: img.alt || '' })).slice(0, 10),
            forms: [...doc.querySelectorAll('form')].map(form => ({ action: form.action, method: form.method })).slice(0, 5),
          };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) throw new Error(`iframe_list: ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    throw new Error(`iframe_list: unknown action "${action}". Use: list, content`);
  }
}
