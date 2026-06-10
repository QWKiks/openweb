const refMap = new Map();
let refCounter = 1;

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

                                           
const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "checkbox", "radio", "combobox",
  "listbox", "menuitem", "menuitemcheckbox", "menuitemradio",
  "option", "searchbox", "slider", "spinbutton", "switch",
  "tab", "treeitem",
]);

   
                                                         
   
export function clearRefs() {
  refMap.clear();
  refCounter = 1;
  saveRefs();
}

   
                               
                                   
                       
                       
                                  
   
let currentSnapshotSeen = new Map();

export function beginSnapshot() {
  currentSnapshotSeen.clear();
}

export function createRef(backendDOMNodeId, role, name, parentContext = "") {
  let contentKeyBase = `${role}::${name || ""}::${parentContext}`.toLowerCase();
  let count = currentSnapshotSeen.get(contentKeyBase) || 0;
  count++;
  currentSnapshotSeen.set(contentKeyBase, count);
  
  let contentKey = count > 1 ? `${contentKeyBase}::${count}` : contentKeyBase;

  for (const [ref, data] of refMap) {
    if (data.contentKey === contentKey) {
      data.backendDOMNodeId = backendDOMNodeId;
      return ref;
    }
  }
  
  const hash = simpleHash(contentKey);
  const ref = `e${hash}`;
  refMap.set(ref, { backendDOMNodeId, role, name, contentKey });
  return ref;
}

function simpleHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

   
                                         
                                           
                                                                                  
   
export function resolveRef(ref) {
  const key = ref.startsWith("@") ? ref.slice(1) : ref;
  return refMap.get(key);
}

   
                                      
                      
                     
   
export function isRef(str) {
  return /^@?e[a-z0-9]+$/i.test(str);
}

export { INTERACTIVE_ROLES, saveRefs };
