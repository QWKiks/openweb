/**
 * Broken Links Tool
 * Checks all <a href> on the page, returns 404/500/redirects.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class BrokenLinksTool {
  name = "broken_links";

  async execute(args) {
    const maxChecks = args.maxChecks || 50;
    const tab = await getActiveTab();
    await attach(tab.id);

    // Collect all unique hrefs
    const hrefResult = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const links = [...document.querySelectorAll('a[href]')];
        const unique = [...new Set(links.map(a => a.href).filter(h => h.startsWith('http')))];
        return unique.slice(0, ${maxChecks});
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (hrefResult.exceptionDetails) {
      throw new Error(`broken_links: ${hrefResult.exceptionDetails.text}`);
    }

    const urls = hrefResult.result?.value || [];
    if (urls.length === 0) return { checked: 0, broken: [], redirects: [], ok: [] };

    // Check each URL via fetch in the page context
    const checkResult = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const urls = ${JSON.stringify(urls)};
        return Promise.all(urls.map(async (url) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
            clearTimeout(timeout);
            return { url, status: response.status, ok: response.ok, redirected: response.redirected };
          } catch (err) {
            return { url, status: 0, ok: false, error: err.message || 'Network error' };
          }
        }));
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });

    if (checkResult.exceptionDetails) {
      throw new Error(`broken_links: ${checkResult.exceptionDetails.text}`);
    }

    const results = checkResult.result?.value || [];
    const broken = results.filter(r => !r.ok && r.status !== 0);
    const redirects = results.filter(r => r.redirected);
    const errors = results.filter(r => r.status === 0);
    const ok = results.filter(r => r.ok && !r.redirected);

    return {
      checked: urls.length,
      broken: broken.map(r => ({ url: r.url, status: r.status })),
      redirects: redirects.map(r => ({ url: r.url, status: r.status })),
      networkErrors: errors.map(r => ({ url: r.url, error: r.error })),
      ok: ok.map(r => r.url),
    };
  }
}
