import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class FormFillTool {
  name = "form_fill";

  async execute(args) {
    const formSelector = args.selector || "form";
    const fields = args.fields || {};
    const submit = args.submit !== false;
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(async () => {
        const form = document.querySelector(${JSON.stringify(formSelector)});
        if (!form) return { error: 'Form not found: ${formSelector}' };

        const results = [];
        const fields = ${JSON.stringify(fields)};

        for (const [name, value] of Object.entries(fields)) {
          // Try various ways to find the field
          let field = form.querySelector('[name="' + name + '"]')
            || form.querySelector('[id="' + name + '"]')
            || form.querySelector('[aria-label="' + name + '"]')
            || form.querySelector('[placeholder="' + name + '"]');

          if (!field) {
            // Try label-based lookup
            const label = form.querySelector('label');
            if (label) {
              const forAttr = label.getAttribute('for');
              if (forAttr) field = form.querySelector('#' + forAttr);
              if (!field) {
                // Check if label wraps the input
                field = label.querySelector('input, select, textarea');
              }
            }
          }

          if (!field) {
            results.push({ field: name, error: 'Field not found', value });
            continue;
          }

          const tag = field.tagName.toLowerCase();
          const type = (field.getAttribute('type') || 'text').toLowerCase();

          try {
            if (tag === 'select') {
              field.value = value;
              field.dispatchEvent(new Event('change', { bubbles: true }));
              results.push({ field: name, action: 'select', value });
            } else if (type === 'checkbox') {
              const shouldCheck = value === true || value === 'true' || value === '1' || value === 'yes';
              if (field.checked !== shouldCheck) {
                field.click();
              }
              results.push({ field: name, action: 'checkbox', checked: shouldCheck });
            } else if (type === 'radio') {
              const radio = form.querySelector('input[type="radio"][name="' + field.name + '"][value="' + value + '"]');
              if (radio) {
                radio.click();
                results.push({ field: name, action: 'radio', value });
              } else {
                results.push({ field: name, error: 'Radio option not found: ' + value });
              }
            } else if (type === 'file') {
              results.push({ field: name, action: 'file', note: 'Use upload() tool for file selection', value });
            } else if (type === 'date' || type === 'datetime-local') {
              field.value = value;
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));
              results.push({ field: name, action: 'date', value });
            } else {
              // text, email, password, textarea, number, tel, url, search
              field.value = value;
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));
              results.push({ field: name, action: 'fill', value });
            }
          } catch (e) {
            results.push({ field: name, error: e.message, value });
          }
        }

        if (${submit}) {
          const submitBtn = form.querySelector('input[type="submit"], button[type="submit"], button:not([type])');
          if (submitBtn) {
            submitBtn.click();
            results.push({ action: 'submit' });
          }
        }

        return results;
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) throw new Error(`form_fill: ${result.exceptionDetails.text}`);
    const val = result.result.value;

    const errors = val.filter(r => r.error);
    const success = val.filter(r => !r.error);

    return {
      filled: success.length,
      errors: errors.length,
      total: val.length,
      details: val,
      submitAttempted: submit,
    };
  }
}
