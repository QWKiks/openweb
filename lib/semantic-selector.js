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
  const words = desc.split(/\s+/);
  const selectors = [];

  // Detect intent: is this a button/link or an input?
  const isInput = /^(email|password|search|text|url|number|tel|username|name|first\s*name|last\s*name|phone|address|city|state|zip|country|date|time)$/i.test(desc);
  const isButton = /^(login|submit|sign\s*in|sign\s*up|register|save|cancel|delete|close|ok|apply|confirm|next|previous|back|add|remove|edit|update|search|send|reset)$/i.test(desc);

  // 1. aria-label exact match
  selectors.push(`[aria-label*="${desc}" i]`);

  // 2. placeholder match (for inputs)
  if (isInput) {
    selectors.push(`input[placeholder*="${desc}" i]`);
    selectors.push(`textarea[placeholder*="${desc}" i]`);
  }

  // 3. title attribute match
  selectors.push(`[title*="${desc}" i]`);

  // 4. Text content match on interactive elements
  if (isButton) {
    selectors.push(`button:has-text("${desc}")`);
    selectors.push(`a:has-text("${desc}")`);
    selectors.push(`[role="button"]:has-text("${desc}")`);
    selectors.push(`input[type="submit"][value*="${desc}" i]`);
    selectors.push(`input[type="button"][value*="${desc}" i]`);
  }

  // 5. Role + name
  if (isButton) {
    selectors.push(`[role="button"][aria-label*="${desc}" i]`);
  }
  if (isInput) {
    selectors.push(`input[type="text"][aria-label*="${desc}" i]`);
    selectors.push(`input[type="email"]`);
    selectors.push(`input[type="password"]`);
  }

  // 6. Label association (for="...")
  // e.g. <label for="email">Email</label> → #email
  selectors.push(`label:has-text("${desc}") + input`);
  selectors.push(`label:has-text("${desc}") ~ input`);

  // 7. Generic text match on any element
  selectors.push(`*:has-text("${desc}")`);

  return selectors;
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
