/**
 * Viewport Tool
 * Change the browser viewport size, device scale factor, and touch simulation.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class ViewportTool {
  name = "viewport";

  async execute(args) {
    const cmd = args.cmd || "set";
    const tab = await getActiveTab();
    await attach(tab.id);

    switch (cmd) {
      case "set": return this.setViewport(args);
      case "get": return this.getViewport();
      case "reset": return this.resetViewport();
      default: throw new Error(`viewport: unknown cmd "${cmd}". Use: set, get, reset`);
    }
  }

  async setViewport(args) {
    const width = args.width || 1280;
    const height = args.height || 720;
    const deviceScaleFactor = args.deviceScaleFactor || 1;
    const mobile = args.mobile || false;
    const touch = args.touch != null ? args.touch : mobile;

    await sendCommand("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });

    if (touch) {
      await sendCommand("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        configuration: mobile ? "mobile" : "desktop",
      });
    } else {
      await sendCommand("Emulation.setTouchEmulationEnabled", { enabled: false });
    }

    return { success: true, width, height, deviceScaleFactor, mobile, touch };
  }

  async getViewport() {
    const result = await sendCommand("Runtime.evaluate", {
      expression: `({
        width: window.innerWidth,
        height: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio,
      })`,
      returnByValue: true,
    });

    return result.result.value;
  }

  async resetViewport() {
    await sendCommand("Emulation.clearDeviceMetricsOverride");
    await sendCommand("Emulation.setTouchEmulationEnabled", { enabled: false });
    return { success: true, action: "reset" };
  }
}
