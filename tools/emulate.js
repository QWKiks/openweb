/**
 * Emulate Tool
 * Emulate a mobile device, set geolocation, or change user agent.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

// Common device presets
const DEVICE_PRESETS = {
  iphone_14: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1", touch: true },
  iphone_14_pro_max: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1", touch: true },
  pixel_7: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36", touch: true },
  ipad_pro: { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true, userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1", touch: true },
  galaxy_s23: { width: 360, height: 780, deviceScaleFactor: 3, mobile: true, userAgent: "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36", touch: true },
};

export class EmulateTool {
  name = "emulate";

  async execute(args) {
    const cmd = args.cmd || "device";
    const tab = await getActiveTab();
    await attach(tab.id);

    switch (cmd) {
      case "device": return this.emulateDevice(args);
      case "geolocation": return this.setGeolocation(args);
      case "user_agent": return this.setUserAgent(args);
      case "reset": return this.reset();
      default: throw new Error(`emulate: unknown cmd "${cmd}". Use: device, geolocation, user_agent, reset`);
    }
  }

  async emulateDevice(args) {
    let preset = args.device ? DEVICE_PRESETS[args.device] : null;

    if (args.device && !preset) {
      const available = Object.keys(DEVICE_PRESETS).join(", ");
      throw new Error(`emulate: unknown device "${args.device}". Available: ${available}`);
    }

    const config = preset || {
      width: args.width || 390,
      height: args.height || 844,
      deviceScaleFactor: args.deviceScaleFactor || 2,
      mobile: args.mobile != null ? args.mobile : true,
      touch: args.touch != null ? args.touch : true,
      userAgent: args.userAgent,
    };

    await sendCommand("Emulation.setDeviceMetricsOverride", {
      width: config.width,
      height: config.height,
      deviceScaleFactor: config.deviceScaleFactor,
      mobile: config.mobile,
      screenWidth: config.width,
      screenHeight: config.height,
    });

    await sendCommand("Emulation.setTouchEmulationEnabled", {
      enabled: config.touch,
      configuration: config.mobile ? "mobile" : "desktop",
    });

    if (config.userAgent) {
      await sendCommand("Emulation.setUserAgentOverride", {
        userAgent: config.userAgent,
      });
    }

    return {
      success: true,
      device: args.device || "custom",
      width: config.width,
      height: config.height,
      deviceScaleFactor: config.deviceScaleFactor,
      mobile: config.mobile,
    };
  }

  async setGeolocation(args) {
    if (args.clear) {
      await sendCommand("Emulation.clearGeolocationOverride");
      return { success: true, action: "geolocation_cleared" };
    }

    const latitude = args.latitude;
    const longitude = args.longitude;
    if (latitude == null || longitude == null) {
      throw new Error("emulate: latitude and longitude are required for geolocation");
    }

    await sendCommand("Emulation.setGeolocationOverride", {
      latitude,
      longitude,
      accuracy: args.accuracy || 100,
    });

    return { success: true, latitude, longitude, accuracy: args.accuracy || 100 };
  }

  async setUserAgent(args) {
    if (!args.userAgent) throw new Error("emulate: userAgent is required");

    await sendCommand("Emulation.setUserAgentOverride", {
      userAgent: args.userAgent,
      platform: args.platform || undefined,
    });

    return { success: true, userAgent: args.userAgent };
  }

  async reset() {
    await sendCommand("Emulation.clearDeviceMetricsOverride");
    await sendCommand("Emulation.clearGeolocationOverride");
    await sendCommand("Emulation.setTouchEmulationEnabled", { enabled: false });

    // Reset user agent by setting empty override (falls back to default)
    const result = await sendCommand("Runtime.evaluate", {
      expression: "navigator.userAgent",
      returnByValue: true,
    });
    if (result.result.value) {
      await sendCommand("Emulation.setUserAgentOverride", {
        userAgent: result.result.value,
      });
    }

    return { success: true, action: "reset" };
  }
}
