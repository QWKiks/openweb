/**
 * Snapshot Tool
 * Captures the accessibility tree of the active page and creates element refs.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { clearRefs, createRef, INTERACTIVE_ROLES, saveRefs } from "../lib/snapshot-refs.js";

export class SnapshotTool {
  name = "snapshot";

  async execute(args) {
    const selector = args.selector;
    const interactiveOnly = args.interactiveOnly !== false; // defaults to true for maximum token savings
    const format = args.format || "text";
    const maxLength = args.maxLength || 50000;
    const maxDepth = args.maxDepth || 8;


    const tab = await getActiveTab();
    await attach(tab.id);
    clearRefs();

    let allowedBackendIds = null;
    if (selector) {
      try {
        const doc = await sendCommand("DOM.getDocument", { depth: -1, pierce: true });
        let targetNodeId;
        try {
          const queryRes = await sendCommand("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
          targetNodeId = queryRes.nodeId;
        } catch (err) {
          throw new Error(`snapshot: element matching selector "${selector}" was not found on the page`);
        }

        if (targetNodeId) {
          const descRes = await sendCommand("DOM.describeNode", { nodeId: targetNodeId });
          const targetBackendId = descRes.node?.backendNodeId;

          if (targetBackendId) {
            const flatDoc = await sendCommand("DOM.getFlattenedDocument", { depth: -1, pierce: true });
            const nodeMap = new Map();
            for (const n of flatDoc.nodes) {
              nodeMap.set(n.nodeId, n);
            }

            const childrenMap = new Map();
            
            for (const node of flatDoc.nodes) {
              if (node.parentId) {
                const parentNode = nodeMap.get(node.parentId);
                if (parentNode) {
                  const arr = childrenMap.get(parentNode.backendNodeId) || [];
                  arr.push(node.backendNodeId);
                  childrenMap.set(parentNode.backendNodeId, arr);
                }
              }
            }

            const descendants = new Set();
            const collect = (backendId) => {
              descendants.add(backendId);
              const children = childrenMap.get(backendId) || [];
              for (const childId of children) {
                if (!descendants.has(childId)) collect(childId);
              }
            };
            
            collect(targetBackendId);
            allowedBackendIds = descendants;
          }
        }
      } catch (err) {
        // Fallback if DOM tree traversal fails, just skip filtering and capture full tree
        console.warn(`[Snapshot Filter] Traversal failed: ${err.message}. Capturing full tree.`);
      }
    }

    const result = await sendCommand("Accessibility.getFullAXTree");
    let tree = this.buildTree(result.nodes, allowedBackendIds, interactiveOnly);
    // Batch-save all refs to session storage in one write (instead of per-createRef)
    saveRefs();
    let treeStr;
    let isTruncated = false;
    let finalTree = tree;

    if (format === "text") {
      finalTree = this.formatToIndentedText(tree, 0, maxDepth);
      treeStr = finalTree;
      if (treeStr.length > maxLength) {
        treeStr = treeStr.slice(0, maxLength);
        finalTree = treeStr;
        isTruncated = true;
      }
    } else {
      treeStr = JSON.stringify(tree);
      if (treeStr.length > maxLength) {
        finalTree = treeStr.slice(0, maxLength);
        isTruncated = true;
      }
    }

    return { 
      url: tab.url, 
      title: tab.title, 
      tree: finalTree,
      truncated: isTruncated,
      estimatedTokens: Math.round(treeStr.length / 4),
      suggestedNextTool: "click or fill using @e refs from tree"
    };
  }

  buildTree(nodes, allowedBackendIds, interactiveOnly) {
    const nodeMap = new Map();
    for (const node of nodes) nodeMap.set(node.nodeId, node);
    if (nodes.length === 0) return [];
    return this.formatChildren(nodes[0], nodeMap, allowedBackendIds, interactiveOnly);
  }

  formatChildren(root, nodeMap, allowedBackendIds, interactiveOnly) {
    const results = [];

    const format = (node) => {
      // 1. Prune nodes outside of our target selector subtree
      if (allowedBackendIds && node.backendDOMNodeId != null && !allowedBackendIds.has(node.backendDOMNodeId)) {
        return null;
      }

      const role = node.role?.value;
      if (!role || role === "none" || role === "generic") {
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
          return children.length === 1 ? children[0] : children.length > 0 ? children : null;
        }
        return null;
      }

      const entry = { role };

      if (node.name?.value) entry.name = node.name.value;
      if (node.value?.value) entry.value = node.value.value;
      if (node.description?.value) entry.description = node.description.value;

      let isInteractive = false;
      if (INTERACTIVE_ROLES.has(role) && node.backendDOMNodeId != null) {
        entry.ref = `@${createRef(node.backendDOMNodeId, role, node.name?.value ?? "")}`;
        isInteractive = true;
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

      // 2. Token economy pruning: Exclude non-interactive static text nodes and branches
      if (interactiveOnly) {
        if (isInteractive || entry.children?.length > 0) {
          return entry;
        }
        return null;
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

  formatToIndentedText(nodes, depth = 0, maxDepth = 8) {
    if (!nodes || nodes.length === 0) return "";
    const parts = [];
    const indent = "  ".repeat(depth);
    for (const node of nodes) {
      if (Array.isArray(node)) {
        parts.push(this.formatToIndentedText(node, depth, maxDepth));
        continue;
      }
      
      const nodeParts = [];
      nodeParts.push(`[${node.role}`);
      if (node.ref) nodeParts.push(` ${node.ref}`);
      nodeParts.push(`]`);
      
      const extra = [];
      if (node.name) extra.push(`name="${node.name}"`);
      if (node.value) extra.push(`value="${node.value}"`);
      if (node.description) extra.push(`desc="${node.description}"`);
      
      const extraStr = extra.length > 0 ? " " + extra.join(" ") : "";
      parts.push(`${indent}- ${nodeParts.join("")}${extraStr}\n`);
      
      if (node.children && node.children.length > 0 && depth < maxDepth) {
        parts.push(this.formatToIndentedText(node.children, depth + 1, maxDepth));
      }
    }
    return parts.join("");
  }
}
