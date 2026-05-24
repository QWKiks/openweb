/**
 * HAR Export Tool
 * Exports network activity from the active page in HAR format.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class HarExportTool {
  name = "har_export";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: this.buildExpression(),
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`har_export: ${result.exceptionDetails.text}`);
    }

    const data = result.result?.value || {};
    data.url = tab.url;
    data.exportedAt = new Date().toISOString();

    return data;
  }

  buildExpression() {
    return `(() => {
      const entries = performance.getEntriesByType('resource');
      const nav = performance.getEntriesByType('navigation')[0];
      
      const harEntries = entries.map(r => {
        const url = new URL(r.name);
        return {
          startedDateTime: new Date(performance.timeOrigin + r.startTime).toISOString(),
          time: Math.round(r.duration),
          request: {
            method: 'GET',
            url: r.name,
            httpVersion: 'HTTP/1.1',
            headers: [],
            queryString: [...url.searchParams].map(([name, value]) => ({ name, value })),
            cookies: [],
            headersSize: -1,
            bodySize: 0,
          },
          response: {
            status: 200,
            statusText: 'OK',
            httpVersion: 'HTTP/1.1',
            headers: [],
            cookies: [],
            content: {
              size: r.transferSize,
              mimeType: 'application/octet-stream',
            },
            redirectURL: '',
            headersSize: -1,
            bodySize: r.encodedBodySize || 0,
          },
          cache: {},
          timings: {
            blocked: -1,
            dns: Math.round(r.domainLookupEnd - r.domainLookupStart) || -1,
            connect: Math.round(r.connectEnd - r.connectStart) || -1,
            ssl: r.secureConnectionStart > 0 ? Math.round(r.connectEnd - r.secureConnectionStart) : -1,
            send: 0,
            wait: Math.round(r.responseStart - r.requestStart) || 0,
            receive: Math.round(r.responseEnd - r.responseStart) || 0,
          },
        };
      });

      return {
        log: {
          version: '1.2',
          creator: { name: 'WebBridge', version: '1.4.1' },
          browser: { name: navigator.userAgent.split('/')[0] || 'Chrome', version: navigator.userAgent },
          pages: [{
            startedDateTime: new Date().toISOString(),
            id: 'page_1',
            title: document.title,
            pageTimings: {
              onContentLoad: Math.round(nav?.domContentLoadedEventEnd || 0),
              onLoad: Math.round(nav?.loadEventEnd || 0),
            },
          }],
          entries: harEntries,
          entryCount: harEntries.length,
        },
      };
    })()`;
  }
}
