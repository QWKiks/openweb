/**
 * Snapshot Ref System
 * Manages element references from the accessibility tree snapshot.
 * Refs are strings like "e1", "e2" that map to CDP backend node IDs.
 */

const refMap = new Map();
let refCounter = 1;

// Restore refs from session storage on SW wake-up
async function restoreRefs() {
  try {
    const data = await chrome.storage.session.get(["snapshotRefMap", "snapshotRefCounter"]);
    if (data.snapshotRefMap) {
      for (const [key, value] of data.snapshotRefMap) refMap.set(key, value);
    }
    if (data.snapshotRefCounter) refCounter = data.snapshotRefCounter;
  } catch {}
}
restoreRefs();

async function saveRefs() {
  try {
    await chrome.storage.session.set({
      snapshotRefMap: [...refMap.entries()],
      snapshotRefCounter: refCounter,
    });
  } catch {}
}

/** Interactive ARIA roles that get refs */
const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "checkbox", "radio", "combobox",
  "listbox", "menuitem", "menuitemcheckbox", "menuitemradio",
  "option", "searchbox", "slider", "spinbutton", "switch",
  "tab", "treeitem",
]);

/**
 * Clear all refs (called at the start of each snapshot).
 */
export function clearRefs() {
  refMap.clear();
  refCounter = 1;
  saveRefs();
}

/**
 * Create a ref for a DOM node.
 * @param {number} backendDOMNodeId
 * @param {string} role
 * @param {string} name
 * @returns {string} ref like "e1"
 */
export function createRef(backendDOMNodeId, role, name) {
  const ref = `e${refCounter++}`;
  refMap.set(ref, { backendDOMNodeId, role, name });
  // Note: saveRefs() is NOT called here for performance.
  // The caller (SnapshotTool) must call saveRefs() once after all refs are created.
  return ref;
}

/**
 * Resolve a ref string to its node info.
 * @param {string} ref - like "e1" or "@e1"
 * @returns {{ backendDOMNodeId: number, role: string, name: string } | undefined}
 */
export function resolveRef(ref) {
  const key = ref.startsWith("@") ? ref.slice(1) : ref;
  return refMap.get(key);
}

/**
 * Check if a string looks like a ref.
 * @param {string} str
 * @returns {boolean}
 */
export function isRef(str) {
  return /^@?e\d+$/.test(str);
}

export { INTERACTIVE_ROLES, saveRefs };
