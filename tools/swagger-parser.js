/**
 * Swagger Parser Tool
 * Parses Swagger/OpenAPI spec from the active page (e.g. localhost:5131/swagger).
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class SwaggerParserTool {
  name = "swagger_parser";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    // Try to find swagger.json URL first
    const urlResult = await sendCommand("Runtime.evaluate", {
      expression: "document.querySelector('link[rel=\"swagger\"]')?.href || document.querySelector('script[src*=\"swagger\"]')?.src || null",
      returnByValue: true,
      awaitPromise: false,
    });

    let swaggerUrl = urlResult.result?.value;
    if (!swaggerUrl) {
      // Guess common paths
      const base = new URL(tab.url).origin;
      swaggerUrl = base + "/swagger/v1/swagger.json";
    }

    // Fetch the spec
    const specResult = await sendCommand("Runtime.evaluate", {
      expression: `fetch(${JSON.stringify(swaggerUrl)}).then(r => r.ok ? r.json() : { error: "HTTP " + r.status }).catch(e => ({ error: e.message }))`,
      returnByValue: true,
      awaitPromise: true,
    });

    if (specResult.exceptionDetails) {
      throw new Error("swagger_parser: " + specResult.exceptionDetails.text);
    }

    const spec = specResult.result?.value;
    if (spec?.error) return { error: spec.error, url: swaggerUrl };
    if (!spec) return { error: "Could not fetch Swagger spec", url: swaggerUrl };

    // Parse endpoints
    const endpoints = [];
    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, info] of Object.entries(methods)) {
        if (typeof info !== "object") continue;
        endpoints.push({
          method: method.toUpperCase(),
          path,
          summary: info.summary || "",
          description: info.description || "",
          tags: info.tags || [],
          parameters: (info.parameters || []).map(p => ({
            name: p.name,
            in: p.in,
            required: p.required || false,
            type: p.schema?.type || p.type || "string",
          })),
          responses: Object.keys(info.responses || {}),
        });
      }
    }

    return {
      url: swaggerUrl,
      title: spec.info?.title || "Unknown API",
      version: spec.info?.version || "?",
      description: spec.info?.description || "",
      server: (spec.servers || []).map(s => s.url),
      totalEndpoints: endpoints.length,
      endpoints: endpoints.slice(0, 100),
      schemas: Object.keys(spec.components?.schemas || {}),
    };
  }
}
