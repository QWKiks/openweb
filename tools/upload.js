/**
 * Upload Tool
 * Sets files on a file input element via CDP DOM.setFileInputFiles.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class UploadTool {
  name = "upload";

  async execute(args) {
    const selector = args.selector;
    const files = args.files;

    if (!selector) throw new Error("upload: selector is required (CSS selector for file input)");
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error("upload: files is required (array of local file paths)");
    }

    const tab = await getActiveTab();
    await attach(tab.id);

    const document = await sendCommand("DOM.getDocument");
    const { nodeId } = await sendCommand("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector,
    });

    if (!nodeId) throw new Error(`upload: element not found: ${selector}`);

    await sendCommand("DOM.setFileInputFiles", { files, nodeId });
    return { success: true, selector, fileCount: files.length, files };
  }
}
