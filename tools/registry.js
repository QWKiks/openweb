/**
 * Tool Registry
 * Registers and executes browser automation tools.
 * Supports multi-tab parallel execution via _tabId parameter.
 */

import { attach, setActiveTabId, getActiveTabId } from "../lib/cdp.js";

const toolMap = new Map();

// Tools that don't need tab context
const GLOBAL_TOOLS = new Set([
  "close_tab", "list_tabs", "close_session", "session", "bookmark",
]);

/**
 * Register a tool instance.
 * @param {{ name: string, execute: (args: object) => Promise<object> }} tool
 */
export function register(tool) {
  toolMap.set(tool.name, tool);
}

/**
 * Execute a tool by name.
 * Supports _tabId for multi-tab: saves current tab context,
 * switches to requested tab, executes, then restores context.
 * @param {string} name
 * @param {object} args
 * @returns {Promise<object>}
 */
export async function executeTool(name, args) {
  const tool = toolMap.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}. Available: ${[...toolMap.keys()].join(", ")}`);
  }

  const requestedTabId = args._tabId;
  if (requestedTabId != null && !GLOBAL_TOOLS.has(name)) {
    // Save current context for restoration after execution
    const previousTabId = getActiveTabId();

    // Switch to requested tab
    await attach(requestedTabId);
    setActiveTabId(requestedTabId);
    delete args._tabId;

    try {
      const result = await tool.execute(args);
      return result;
    } finally {
      // Restore previous tab context if different
      if (previousTabId !== null && previousTabId !== requestedTabId) {
        try {
          await attach(previousTabId);
          setActiveTabId(previousTabId);
        } catch {
          // Previous tab may have been closed
        }
      }
    }
  }

  return tool.execute(args);
}

/**
 * Get all registered tool names.
 * @returns {string[]}
 */
export function getToolNames() {
  return [...toolMap.keys()];
}
