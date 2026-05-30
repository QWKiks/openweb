import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class ResponsiveTestTool {
  name = "responsive_test";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const breakpoints = [
      { name: "mobile", width: 375, height: 667 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "desktop", width: 1440, height: 900 },
    ];

    const results = [];

    for (const bp of breakpoints) {
      

      await sendCommand("Emulation.setDeviceMetricsOverride", {
        width: bp.width,
        height: bp.height,
        deviceScaleFactor: 1,
        mobile: bp.name === "mobile",
      });

      

      await new Promise(r => setTimeout(r, 1500));

      

      const metrics = await sendCommand("Runtime.evaluate", {
        expression: `(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          overflowX: document.documentElement.scrollWidth > ${bp.width},
          overflowY: document.documentElement.scrollHeight > ${bp.height},
          breakpoints: [...new Set([...document.querySelectorAll('*')].map(el => window.getComputedStyle(el).display))].filter(Boolean),
          hiddenElements: [...document.querySelectorAll('[style*="display: none"], .hidden, .d-none')].length,
          visibleElements: document.querySelectorAll('*').length,
        }))()`,
        returnByValue: true,
        awaitPromise: false,
      });

      results.push({
        breakpoint: bp.name,
        width: bp.width,
        height: bp.height,
        metrics: metrics.result?.value || {},
      });
    }

    

    await sendCommand("Emulation.clearDeviceMetricsOverride");

    return {
      url: tab.url,
      testedBreakpoints: results.length,
      results,
    };
  }
}
