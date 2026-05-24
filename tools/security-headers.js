/**
 * Security Headers Tool
 * Audits response headers: CSP, HSTS, X-Frame-Options, etc.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class SecurityHeadersTool {
  name = "security_headers";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    // Use CDP Network.getResponseBody doesn't give headers; use fetch via Runtime
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        return fetch(location.href, { method: "HEAD", cache: "no-store" })
          .then(r => {
            const headers = {};
            const securityHeaders = [
              "content-security-policy",
              "content-security-policy-report-only",
              "strict-transport-security",
              "x-frame-options",
              "x-content-type-options",
              "referrer-policy",
              "permissions-policy",
              "cross-origin-embedder-policy",
              "cross-origin-opener-policy",
              "cross-origin-resource-policy",
              "x-xss-protection",
            ];
            for (const h of securityHeaders) {
              const v = r.headers.get(h);
              if (v) headers[h] = v;
            }
            return {
              status: r.status,
              headers,
              missing: securityHeaders.filter(h => !r.headers.get(h)),
            };
          })
          .catch(err => ({ error: err.message }));
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) throw new Error(`security_headers: ${result.exceptionDetails.text}`);

    const data = result.result?.value || {};
    if (data.error) return data;

    // Score calculation
    const hasCSP = !!data.headers["content-security-policy"];
    const hasHSTS = !!data.headers["strict-transport-security"];
    const hasXFO = !!data.headers["x-frame-options"];
    const hasXCTO = !!data.headers["x-content-type-options"];
    const hasRP = !!data.headers["referrer-policy"];

    let score = 0;
    if (hasCSP) score += 30;
    if (hasHSTS) score += 20;
    if (hasXFO) score += 15;
    if (hasXCTO) score += 15;
    if (hasRP) score += 10;
    if (data.headers["permissions-policy"]) score += 10;

    data.score = score;
    data.grade = score >= 90 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F";
    data.url = tab.url;

    return data;
  }
}
