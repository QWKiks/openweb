/**
 * Upload Tool
 * Sets files on a file input element via CDP DOM.setFileInputFiles.
 * Supports CSS selectors and @e snapshot refs.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class UploadTool {
  name = "upload";

  async execute(args) {
    const selector = args.selector;
    const files = args.files;

    if (!selector) throw new Error("upload: selector is required (CSS selector or @e ref for file input)");
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error("upload: files is required (array of local file paths)");
    }

    const tab = await getActiveTab();
    await attach(tab.id);

    let nodeId;
    let backendNodeId;

    if (isRef(selector)) {
      // Resolve via snapshot ref → backendDOMNodeId → nodeId
      const nodeInfo = resolveRef(selector);
      if (!nodeInfo) throw new Error(`upload: unknown ref "${selector}". Run snapshot first.`);
      backendNodeId = nodeInfo.backendDOMNodeId;
    } else {
      // CSS selector → resolve to node
      const document = await sendCommand("DOM.getDocument");
      const result = await sendCommand("DOM.querySelector", {
        nodeId: document.root.nodeId,
        selector,
      });
      nodeId = result.nodeId;
      if (!nodeId) throw new Error(`upload: element not found: ${selector}`);
    }

    // DOM.setFileInputFiles accepts either nodeId or backendNodeId
    const params = { files };
    if (backendNodeId != null) {
      params.backendNodeId = backendNodeId;
    } else {
      params.nodeId = nodeId;
    }

    await sendCommand("DOM.setFileInputFiles", params);

    // Dispatch change event so page JS picks up the new files
    const targetNodeId = backendNodeId != null
      ? (await sendCommand("DOM.pushNodesByBackendIdsToFrontend", { backendNodeIds: [backendNodeId] })).nodeIds[0]
      : nodeId;

    if (targetNodeId) {
      try {
        const { object } = await sendCommand("DOM.resolveNode", { nodeId: targetNodeId });
        if (object?.objectId) {
          await sendCommand("Runtime.callFunctionOn", {
            objectId: object.objectId,
            functionDeclaration: `function() { this.dispatchEvent(new Event('change', { bubbles: true })); this.dispatchEvent(new Event('input', { bubbles: true })); }`,
          });
        }
      } catch {
        // Event dispatch is best-effort
      }
    }

    return { success: true, selector, fileCount: files.length, files };
  }
}
