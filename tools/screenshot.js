/**
 * Screenshot Tool
 * Captures a screenshot of the page or a specific element.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { resolveRef, isRef } from "../lib/snapshot-refs.js";

export class ScreenshotTool {
  name = "screenshot";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const format = args.format || "jpeg";
    const quality = format === "jpeg" ? (args.quality || 60) : undefined;
    const selector = typeof args.selector === "string" ? args.selector : "";
    const lowRes = args.lowRes !== false;

    const cropX = Number(args.x);
    const cropY = Number(args.y);
    const cropW = Number(args.width);
    const cropH = Number(args.height);
    const hasCoordsCrop = !isNaN(cropX) && !isNaN(cropY) && !isNaN(cropW) && !isNaN(cropH) && cropW > 0 && cropH > 0;

    const options = { format };

    if (quality !== undefined) options.quality = quality;

    if (selector) {
      const objectId = isRef(selector)
        ? await this.objectIdFromRef(selector)
        : await this.objectIdFromSelector(selector);

      // Scroll into view
      await sendCommand("Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: `function() { this.scrollIntoView({ block: 'center', inline: 'center' }); }`,
      });

      // Get box model
      let boxModel;
      try {
        boxModel = await sendCommand("DOM.getBoxModel", { objectId });
      } catch (err) {
        throw new Error(
          `screenshot: element has no layout box (display:none / detached / zero-size). (CDP: ${err.message})`
        );
      }

      const border = boxModel.model?.border;
      if (!border || border.length < 8) {
        throw new Error("screenshot: element has no layout box (display:none / detached / zero-size).");
      }

      const xs = [border[0], border[2], border[4], border[6]];
      const ys = [border[1], border[3], border[5], border[7]];
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const width = Math.max(...xs) - x;
      const height = Math.max(...ys) - y;

      if (width <= 0 || height <= 0) {
        throw new Error(`screenshot: element has zero-size box (width=${width}, height=${height}).`);
      }

      options.clip = { x, y, width, height, scale: 1 };
    } else if (hasCoordsCrop) {
      options.clip = { x: cropX, y: cropY, width: cropW, height: cropH, scale: 1 };
    } else if (lowRes) {
      // Capture full viewport scaled down to max-width 800px
      try {
        const layout = await sendCommand("Page.getLayoutMetrics");
        const viewW = layout.cssVisualViewport?.clientWidth || 1280;
        const viewH = layout.cssVisualViewport?.clientHeight || 720;
        if (viewW > 800) {
          const scale = 800 / viewW;
          options.clip = { x: 0, y: 0, width: viewW, height: viewH, scale };
        }
      } catch (err) {
        // Fallback to standard full screenshot if metrics call fails
        console.warn(`[Screenshot Scale] Failed to get layout metrics: ${err.message}. Capturing full resolution.`);
      }
    }

    const result = await sendCommand("Page.captureScreenshot", options);
    return { format, dataLength: result.data.length, data: result.data };
  }

  async objectIdFromRef(ref) {
    const nodeInfo = resolveRef(ref);
    if (!nodeInfo) throw new Error(`screenshot: unknown ref "${ref}". Run snapshot first to get refs.`);

    const { object } = await sendCommand("DOM.resolveNode", {
      backendNodeId: nodeInfo.backendDOMNodeId,
    });
    if (!object?.objectId) throw new Error(`screenshot: could not resolve ref "${ref}" to DOM element`);
    return object.objectId;
  }

  async objectIdFromSelector(selector) {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: false,
    });
    if (result.exceptionDetails) throw new Error(`screenshot: ${result.exceptionDetails.text}`);
    if (result.result.subtype === "null" || !result.result.objectId) {
      throw new Error(`screenshot: element not found: ${selector}`);
    }
    return result.result.objectId;
  }
}
