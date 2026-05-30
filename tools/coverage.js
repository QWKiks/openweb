import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class CoverageTool {
  name = "coverage";

  async execute(args) {
    const type = args.type || "both";
    const tab = await getActiveTab();
    await attach(tab.id);

    

    await sendCommand("Profiler.enable");
    await sendCommand("Profiler.startPreciseCoverage", { callCount: false, detailed: false });

    

    await sendCommand("Page.reload", { ignoreCache: true });

    

    await new Promise(r => setTimeout(r, 3000));

    const coverageResult = await sendCommand("Profiler.takePreciseCoverage");
    await sendCommand("Profiler.stopPreciseCoverage");
    await sendCommand("Profiler.disable");

    const results = coverageResult.result || [];
    const cssCoverage = [];
    const jsCoverage = [];

    for (const entry of results) {
      const url = entry.url;
      const isCSS = url.endsWith('.css') || entry.type === 'CSS';
      const isJS = url.endsWith('.js') || entry.type === 'Script';

      let used = 0;
      let total = 0;

      for (const range of entry.ranges || []) {
        total += range.endOffset - range.startOffset;
        if (range.count > 0) used += range.endOffset - range.startOffset;
      }

      const item = { url, used, total, unused: total - used, usedPercent: total > 0 ? Math.round((used / total) * 100) : 0 };

      if (isCSS && (type === 'both' || type === 'css')) cssCoverage.push(item);
      if (isJS && (type === 'both' || type === 'js')) jsCoverage.push(item);
    }

    const totalCSS = cssCoverage.reduce((s, c) => s + c.total, 0);
    const usedCSS = cssCoverage.reduce((s, c) => s + c.used, 0);
    const totalJS = jsCoverage.reduce((s, c) => s + c.total, 0);
    const usedJS = jsCoverage.reduce((s, c) => s + c.used, 0);

    return {
      url: tab.url,
      css: {
        files: cssCoverage.length,
        totalBytes: totalCSS,
        usedBytes: usedCSS,
        unusedBytes: totalCSS - usedCSS,
        unusedPercent: totalCSS > 0 ? Math.round(((totalCSS - usedCSS) / totalCSS) * 100) : 0,
        details: cssCoverage.slice(0, 20),
      },
      js: {
        files: jsCoverage.length,
        totalBytes: totalJS,
        usedBytes: usedJS,
        unusedBytes: totalJS - usedJS,
        unusedPercent: totalJS > 0 ? Math.round(((totalJS - usedJS) / totalJS) * 100) : 0,
        details: jsCoverage.slice(0, 20),
      },
    };
  }
}
