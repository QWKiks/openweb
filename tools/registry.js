import { attach, setActiveTabId, getActiveTabId } from "../lib/cdp.js";

const toolMap = new Map();

const GLOBAL_TOOLS = new Set([
  "close_tab", "list_tabs", "close_session", "session", "bookmark", "extension",
]);

   
                            
                                                                             
   
export function register(tool) {
  toolMap.set(tool.name, tool);
}

   
                          
                                                            
                                                              
                       
                       
                             
   
export async function executeTool(name, args) {
  const tool = toolMap.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}. Available: ${[...toolMap.keys()].join(", ")}`);
  }

  const requestedTabId = args._tabId;
  if (requestedTabId != null && !GLOBAL_TOOLS.has(name)) {
    

    await attach(requestedTabId);
    setActiveTabId(requestedTabId);
    delete args._tabId;

    return tool.execute(args);
  }

  return tool.execute(args);
}

   
                                 
                      
   
export function getToolNames() {
  return [...toolMap.keys()];
}
