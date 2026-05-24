/**
 * Form Audit Tool
 * Analyzes all forms: fields, types, validation, CSRF tokens, autofill.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class FormAuditTool {
  name = "form_audit";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const forms = [...document.querySelectorAll('form')];
        const results = [];
        
        for (const form of forms) {
          const inputs = [...form.querySelectorAll('input, select, textarea')];
          const fields = inputs.map(input => ({
            type: input.type || input.tagName.toLowerCase(),
            name: input.name || null,
            id: input.id || null,
            required: input.required || false,
            placeholder: input.placeholder || null,
            pattern: input.pattern || null,
            minLength: input.minLength || null,
            maxLength: input.maxLength || null,
            autocomplete: input.getAttribute('autocomplete') || null,
            hasLabel: !!(input.id && form.querySelector('label[for="' + input.id + '"]')),
          }));
          
          const csrfToken = form.querySelector('input[name*="csrf"], input[name*="token"], meta[name="csrf-token"]')?.value || null;
          
          results.push({
            action: form.action || location.href,
            method: form.method || "get",
            id: form.id || null,
            name: form.name || null,
            fieldCount: inputs.length,
            hasCsrf: !!csrfToken,
            csrfTokenPreview: csrfToken ? csrfToken.slice(0, 20) + '...' : null,
            fields: fields.slice(0, 20),
          });
        }
        
        return {
          totalForms: forms.length,
          forms: results.slice(0, 10),
          totalFields: results.reduce((s, f) => s + f.fieldCount, 0),
          formsWithCsrf: results.filter(f => f.hasCsrf).length,
          formsWithoutCsrf: results.filter(f => !f.hasCsrf).length,
        };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`form_audit: ${result.exceptionDetails.text}`);
    const data = result.result?.value || {};
    data.url = tab.url;
    return data;
  }
}
