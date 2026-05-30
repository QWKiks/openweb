import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class FindByTextTool {
  name = "find_by_text";

  async execute(args) {
    const text = args.text;
    if (!text) throw new Error("find_by_text: text is required");

    const tag = args.tag || null;
    const exact = args.exact ?? false;
    const returnMultiple = args.returnMultiple ?? false;

    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const searchText = ${JSON.stringify(text)};
        const exactMatch = ${exact};
        const targetTag = ${tag ? JSON.stringify(tag.toUpperCase()) : null};
        const maxResults = ${returnMultiple ? 10 : 1};

        const results = [];

        // Priority 1: aria-label exact match
        if (!targetTag || targetTag === '*') {
          document.querySelectorAll('[aria-label]').forEach(el => {
            if (results.length >= maxResults) return;
            if (exactMatch ? el.getAttribute('aria-label') === searchText : el.getAttribute('aria-label').toLowerCase().includes(searchText.toLowerCase())) {
              results.push({ selector: buildSelector(el), tag: el.tagName, text: el.getAttribute('aria-label'), matchBy: 'aria-label' });
            }
          });
        }

        // Priority 2: placeholder
        if (results.length < maxResults) {
          document.querySelectorAll('[placeholder]').forEach(el => {
            if (results.length >= maxResults) return;
            if (exactMatch ? el.getAttribute('placeholder') === searchText : el.getAttribute('placeholder').toLowerCase().includes(searchText.toLowerCase())) {
              results.push({ selector: buildSelector(el), tag: el.tagName, text: el.getAttribute('placeholder'), matchBy: 'placeholder' });
            }
          });
        }

        // Priority 3: text content (limited to interactive elements first)
        const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]'];
        const scope = targetTag
          ? document.querySelectorAll(targetTag)
          : document.querySelectorAll(interactiveTags.join(','));

        for (const el of scope) {
          if (results.length >= maxResults) break;
          const elText = (el.textContent || '').trim();
          if (!elText) continue;
          if (elText.length > 200) continue;
          if (exactMatch ? elText === searchText : elText.toLowerCase().includes(searchText.toLowerCase())) {
            // Avoid duplicates
            if (results.some(r => r.selector === buildSelector(el))) continue;
            results.push({ selector: buildSelector(el), tag: el.tagName, text: elText.slice(0, 100), matchBy: 'text' });
          }
        }

        // Priority 4: broader search in all elements if tag is specified
        if (targetTag && results.length < maxResults) {
          document.querySelectorAll(targetTag + ':not(' + interactiveTags.join('):not(') + ')').forEach(el => {
            if (results.length >= maxResults) return;
            const elText = (el.textContent || '').trim();
            if (!elText || elText.length > 200) return;
            if (exactMatch ? elText === searchText : elText.toLowerCase().includes(searchText.toLowerCase())) {
              if (results.some(r => r.selector === buildSelector(el))) return;
              results.push({ selector: buildSelector(el), tag: el.tagName, text: elText.slice(0, 100), matchBy: 'text_broad' });
            }
          });
        }

        function buildSelector(el) {
          if (!el || !el.tagName) return null;
          const tag = el.tagName.toLowerCase();
          if (el.id) return '#' + CSS.escape(el.id);
          // Use parent for uniqueness if needed
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(s => s.tagName === el.tagName);
            if (siblings.length > 1) {
              const idx = siblings.indexOf(el) + 1;
              return tag + ':nth-of-type(' + idx + ')';
            }
          }
          return tag;
        }

        return { found: results.length > 0, count: results.length, results };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`find_by_text: ${result.exceptionDetails.text}`);
    }

    const value = result.result.value;
    if (!value?.found) {
      return { success: false, found: false, text, results: [] };
    }

    return {
      success: true,
      found: true,
      count: value.count,
      text,
      results: value.results,
      preferredSelector: value.results[0]?.selector,
    };
  }
}
