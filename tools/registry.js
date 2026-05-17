/**
 * Tool Registry
 * Registers and executes browser automation tools.
 */

import { attach, setActiveTabId } from "../lib/cdp.js";

const toolMap = new Map();

/**
 * Register a tool instance.
 * @param {{ name: string, execute: (args: object) => Promise<object> }} tool
 */
export function register(tool) {
  toolMap.set(tool.name, tool);
}

/**
 * Execute a tool by name.
 * @param {string} name
 * @param {object} args
 * @returns {Promise<object>}
 */
export async function executeTool(name, args) {
  const tool = toolMap.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}. Available: ${[...toolMap.keys()].join(", ")}`);
  }

  // If a specific tab ID is provided, attach to it first
  const tabId = args._tabId;
  if (tabId != null) {
    if (name !== "close_tab" && name !== "list_tabs" && name !== "close_session") {
      await attach(tabId);
      setActiveTabId(tabId);
      delete args._tabId;
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
