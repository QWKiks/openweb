/**
 * Snapshot Tool
 * Captures the accessibility tree of the active page and creates element refs.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { clearRefs, createRef, INTERACTIVE_ROLES } from "../lib/snapshot-refs.js";

export class SnapshotTool {
  name = "snapshot";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);
    clearRefs();

    const result = await sendCommand("Accessibility.getFullAXTree");
    const tree = this.buildTree(result.nodes);

    return { url: tab.url, title: tab.title, tree };
  }

  buildTree(nodes) {
    const nodeMap = new Map();
    for (const node of nodes) nodeMap.set(node.nodeId, node);
    if (nodes.length === 0) return [];
    return this.formatChildren(nodes[0], nodeMap);
  }

  formatChildren(root, nodeMap) {
    const results = [];

    const format = (node) => {
      const role = node.role?.value;
      if (!role || role === "none" || role === "generic") {
        if (node.childIds?.length) {
          const children = [];
          for (const childId of node.childIds) {
            const child = nodeMap.get(childId);
            if (child) {
              const formatted = format(child);
              if (formatted) children.push(formatted);
            }
          }
          return children.length === 1 ? children[0] : children.length > 0 ? children : null;
        }
        return null;
      }

      const entry = { role };

      if (node.name?.value) entry.name = node.name.value;
      if (node.value?.value) entry.value = node.value.value;
      if (node.description?.value) entry.description = node.description.value;

      if (INTERACTIVE_ROLES.has(role) && node.backendDOMNodeId != null) {
        entry.ref = `@${createRef(node.backendDOMNodeId, role, node.name?.value ?? "")}`;
      }

      if (node.childIds?.length) {
        const children = [];
        for (const childId of node.childIds) {
          const child = nodeMap.get(childId);
          if (child) {
            const formatted = format(child);
            if (formatted) {
              if (Array.isArray(formatted)) children.push(...formatted);
              else children.push(formatted);
            }
          }
        }
        if (children.length > 0) entry.children = children;
      }

      return entry;
    };

    if (root.childIds) {
      for (const childId of root.childIds) {
        const child = nodeMap.get(childId);
        if (child) {
          const formatted = format(child);
          if (formatted) {
            if (Array.isArray(formatted)) results.push(...formatted);
            else results.push(formatted);
          }
        }
      }
    }

    return results;
  }
}
