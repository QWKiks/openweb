/**
 * API Discovery Tool
 * Automatically finds API endpoints in page JS code (fetch, axios, xhr patterns).
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class ApiDiscoveryTool {
  name = "api_discovery";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const endpoints = new Set();
        const baseUrls = new Set();
        
        // Scan all script tags for URL patterns
        const scripts = [...document.querySelectorAll('script')].map(s => s.textContent || '').join('\\n');
        
        // Common API patterns
        const patterns = [
          /fetch\(['"`]([^'"`]+)['"`]/g,
          /axios\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g,
          /\$\.(get|post|put|delete|ajax)\(\{[^}]*url:\s*['"`]([^'"`]+)['"`]/g,
          /['"`](https?:\/\/[^'"`]+\/api\/[^'"`]*)['"`]/g,
          /['"`](https?:\/\/[^'"`]+\/graphql[^'"`]*)['"`]/g,
          /['"`](\/api\/[^'"`]*)['"`]/g,
          /['"`](\/v\d+\/[^'"`]*)['"`]/g,
          /['"`](\/rest\/[^'"`]*)['"`]/g,
          /['"`]([^'"`]*\/(?:graphql|swagger|openapi)[^'"]*)['"`]/g,
        ];
        
        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(scripts)) !== null) {
            const url = match[1] || match[2];
            if (url && url.length > 3 && !url.includes('\\${')) {
              endpoints.add(url);
            }
          }
        }
        
        // Also check fetch/XHR history from Performance API
        const fetchUrls = performance.getEntriesByType('resource')
          .filter(r => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest')
          .map(r => r.name);
        
        for (const url of fetchUrls) {
          try {
            const u = new URL(url);
            if (u.pathname.includes('/api/') || u.pathname.includes('/graphql') || u.pathname.match(/\/v\d+\//)) {
              endpoints.add(url);
            }
          } catch {}
        }
        
        // Extract unique base paths
        const uniqueEndpoints = [...endpoints].filter(e => e.length > 3).slice(0, 50);
        
        return {
          totalFound: uniqueEndpoints.length,
          endpoints: uniqueEndpoints,
          fromPerformanceAPI: fetchUrls.filter(u => {
            try { return new URL(u).pathname.includes('/api/') || new URL(u).pathname.includes('/graphql'); } catch { return false; }
          }).length,
        };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`api_discovery: ${result.exceptionDetails.text}`);
    const data = result.result?.value || {};
    data.url = tab.url;
    return data;
  }
}
