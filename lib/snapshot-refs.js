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

   
                               
                                   
                       
                       
                                  
   
export function createRef(backendDOMNodeId, role, name) {
  const ref = `e${refCounter++}`;
  refMap.set(ref, { backendDOMNodeId, role, name });
  

  

  return ref;
}

   
                                         
                                           
                                                                                  
   
export function resolveRef(ref) {
  const key = ref.startsWith("@") ? ref.slice(1) : ref;
  return refMap.get(key);
}

   
                                      
                      
                     
   
export function isRef(str) {
  return /^@?e\d+$/.test(str);
}

export { INTERACTIVE_ROLES, saveRefs };
