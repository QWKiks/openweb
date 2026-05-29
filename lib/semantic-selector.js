/**
 * AI-native Semantic Selector
 *
 * Resolves human-readable descriptions like "login button" or "email input"
 * to actual CSS selectors or DOM elements using accessibility heuristics.
 *
 * Usage (from evaluate or click tool):
 *   selector: "semantic:login button"
 *   → resolves to the best matching element
 *
 * Resolution strategy:
 *   1. aria-label exact match
 *   2. placeholder / title exact match
 *   3. text content match (button, a, label, span)
 *   4. role + name match
 *   5. input[type] + label association
 */

/**
 * Build a CSS selector string that matches elements by semantic description.
 * Returns a ranked list of candidate selectors.
 *
 * @param {string} description - e.g. "login button", "email input"
 * @returns {string[]} CSS selectors ordered by specificity
 */
export function resolveSemanticSelectors(description) {
  const desc = description.trim().toLowerCase();
  const selectors = [];

  // Detect intent: is this a button/link or an input?
  const isInput = /^(email|password|search|text|url|number|tel|username|name|first\s*name|last\s*name|phone|address|city|state|zip|country|date|time)$/i.test(desc);
  const isButton = /^(login|submit|sign\s*in|sign\s*up|register|save|cancel|delete|close|ok|apply|confirm|next|previous|back|add|remove|edit|update|search|send|reset)$/i.test(desc);

  // 1. aria-label match (standard CSS, works in all browsers)
  selectors.push(`[aria-label*="${desc}" i]`);

  // 2. placeholder match (for inputs)
  if (isInput) {
    selectors.push(`input[placeholder*="${desc}" i]`);
    selectors.push(`textarea[placeholder*="${desc}" i]`);
  }

  // 3. title attribute match
  selectors.push(`[title*="${desc}" i]`);

  // 4. Value attribute match on submit/button inputs
  if (isButton) {
    selectors.push(`input[type="submit"][value*="${desc}" i]`);
    selectors.push(`input[type="button"][value*="${desc}" i]`);
    selectors.push(`button[aria-label*="${desc}" i]`);
    selectors.push(`[role="button"][aria-label*="${desc}" i]`);
    selectors.push(`a[aria-label*="${desc}" i]`);
  }

  // 5. Role + type match for inputs
  if (isInput) {
    selectors.push(`input[type="text"][aria-label*="${desc}" i]`);
    selectors.push(`input[type="${desc}"]`);
  }

  // 6. JS-based text content search (fallback — these are JS expressions, not CSS)
  // Prefixed with "js:" so the consumer knows to evaluate them differently
  if (isButton) {
    selectors.push(`js:findByTextContent("${desc}", "button,a,[role='button'],input[type='submit'],input[type='button']")`);
  }
  selectors.push(`js:findByTextContent("${desc}", "button,a,label,span,div,[role='button'],[role='link'],[role='tab']")`);

  return selectors;
}

/**
 * Generate a JS expression that finds an element by text content.
 * Returns a CSS selector for the found element, or null.
 * This is used when standard CSS selectors cannot match by visible text.
 *
 * @param {string} text - text to search for
 * @param {string} scope - CSS selector scope (e.g. "button,a")
 * @returns {string} JavaScript expression string
 */
export function buildTextSearchExpression(text, scope) {
  return `(() => {
    const candidates = document.querySelectorAll(${JSON.stringify(scope)});
    const target = ${JSON.stringify(text.toLowerCase())};
    for (const el of candidates) {
      const content = (el.textContent || '').trim().toLowerCase();
      if (content === target || content.includes(target)) {
        return el;
      }
    }
    return null;
  })()`;
}

/**
 * Check if a selector is a semantic selector (prefixed with "semantic:")
 * @param {string} selector
 * @returns {boolean}
 */
export function isSemanticSelector(selector) {
  return typeof selector === "string" && selector.startsWith("semantic:");
}

/**
 * Extract the description from a semantic selector
 * @param {string} selector
 * @returns {string}
 */
export function parseSemanticSelector(selector) {
  return selector.replace(/^semantic:\s*/i, "").trim();
}

/**
 * Resolve a semantic selector to CSS selectors.
 * @param {string} selector - "semantic:login button"
 * @returns {string[]} CSS selectors
 */
export function resolveSelector(selector) {
  if (!isSemanticSelector(selector)) return [selector];
  const desc = parseSemanticSelector(selector);
  return resolveSemanticSelectors(desc);
}
