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

    // Build expression separately to avoid template literal nesting issues
    const expr = this.buildExpression();

    const result = await sendCommand("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error("api_discovery: " + result.exceptionDetails.text);
    const data = result.result?.value || {};
    data.url = tab.url;
    return data;
  }

  buildExpression() {
    return "(() => {\n" +
      "  const endpoints = new Set();\n" +
      "  const scripts = [...document.querySelectorAll('script')].map(s => s.textContent || '').join('\\n');\n" +
      "  const patterns = [\n" +
      "    /fetch\\(['\"/]([^'\"/]+)['\"/]/g,\n" +
      "    /axios\\.(get|post|put|delete|patch)\\(['\"/]([^'\"/]+)['\"/]/g,\n" +
      "    /\\$\\.(get|post|put|delete|ajax)\\(\\{[^}]*url:\\s*['\"/]([^'\"/]+)['\"/]/g,\n" +
      "    /['\"/](https?:\\/\\/[^'\"/]+\\/api\\/[^'\"]*)['\"/]/g,\n" +
      "    /['\"/](https?:\\/\\/[^'\"/]+\\/graphql[^'\"]*)['\"/]/g,\n" +
      "    /['\"/](\\/api\\/[^'\"]*)['\"/]/g,\n" +
      "    /['\"/](\\/v\\d+\\/[^'\"]*)['\"/]/g,\n" +
      "    /['\"/](\\/rest\\/[^'\"]*)['\"/]/g,\n" +
      "    /['\"/]([^'\"]*\\/(?:graphql|swagger|openapi)[^'\"]*)['\"]/g,\n" +
      "  ];\n" +
      "  for (const pattern of patterns) {\n" +
      "    let match;\n" +
      "    while ((match = pattern.exec(scripts)) !== null) {\n" +
      "      const url = match[1] || match[2];\n" +
      "      if (url && url.length > 3 && !url.includes('\\\\${')) endpoints.add(url);\n" +
      "    }\n" +
      "  }\n" +
      "  const fetchUrls = performance.getEntriesByType('resource')\n" +
      "    .filter(r => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest')\n" +
      "    .map(r => r.name);\n" +
      "  for (const url of fetchUrls) {\n" +
      "    try {\n" +
      "      const u = new URL(url);\n" +
      "      if (u.pathname.includes('/api/') || u.pathname.includes('/graphql') || u.pathname.match(/\\/v\\d+\\//)) {\n" +
      "        endpoints.add(url);\n" +
      "      }\n" +
      "    } catch {}\n" +
      "  }\n" +
      "  const uniqueEndpoints = [...endpoints].filter(e => e.length > 3).slice(0, 50);\n" +
      "  return {\n" +
      "    totalFound: uniqueEndpoints.length,\n" +
      "    endpoints: uniqueEndpoints,\n" +
      "    fromPerformanceAPI: fetchUrls.filter(u => {\n" +
      "      try { return new URL(u).pathname.includes('/api/') || new URL(u).pathname.includes('/graphql'); }\n" +
      "      catch { return false; }\n" +
      "    }).length,\n" +
      "  };\n" +
      "})()";
  }
}
