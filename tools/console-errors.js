/**
 * Console Errors Tool
 * Collects JS errors, warnings, and exceptions from the page.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class ConsoleErrorsTool {
  name = "console_errors";

  async execute(args) {
    const action = args.action || "read";
    const tab = await getActiveTab();
    await attach(tab.id);

    if (action === "install") {
      await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          window.__capturedErrors = window.__capturedErrors || [];
          if (window.__consoleIntercepted) return { status: "already_installed" };
          
          const origError = console.error;
          const origWarn = console.warn;
          
          console.error = function(...args) {
            window.__capturedErrors.push({ type: "error", message: args.map(a => String(a)).join(" "), timestamp: Date.now(), stack: new Error().stack });
            return origError.apply(this, args);
          };
          console.warn = function(...args) {
            window.__capturedErrors.push({ type: "warn", message: args.map(a => String(a)).join(" "), timestamp: Date.now() });
            return origWarn.apply(this, args);
          };
          
          window.addEventListener("error", (e) => {
            window.__capturedErrors.push({ type: "exception", message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, timestamp: Date.now() });
          });
          
          window.addEventListener("unhandledrejection", (e) => {
            window.__capturedErrors.push({ type: "unhandledrejection", message: String(e.reason), timestamp: Date.now() });
          });
          
          window.__consoleIntercepted = true;
          return { status: "installed" };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });
    }

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const errors = window.__capturedErrors || [];
        const errorCount = errors.filter(e => e.type === "error" || e.type === "exception").length;
        const warnCount = errors.filter(e => e.type === "warn").length;
        const rejectionCount = errors.filter(e => e.type === "unhandledrejection").length;
        
        return {
          total: errors.length,
          errors: errorCount,
          warnings: warnCount,
          unhandledRejections: rejectionCount,
          messages: errors.slice(-50).map(e => ({
            type: e.type,
            message: e.message?.slice(0, 200) || "",
            filename: e.filename || null,
            lineno: e.lineno || null,
            timestamp: e.timestamp,
          })),
        };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`console_errors: ${result.exceptionDetails.text}`);
    return result.result?.value || {};
  }
}
