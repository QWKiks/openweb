import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class PerformanceAuditTool {
  name = "performance_audit";

  async execute(args) {
    const detailed = args.detailed || false;
    const tab = await getActiveTab();
    await attach(tab.id);

    

    const perfResult = await sendCommand("Runtime.evaluate", {
      expression: this.buildExpression(detailed),
      returnByValue: true,
      awaitPromise: false,
    });

    if (perfResult.exceptionDetails) {
      throw new Error(`performance_audit: ${perfResult.exceptionDetails.text}`);
    }

    const data = perfResult.result?.value || {};

    

    data.url = tab.url;
    data.title = tab.title;
    data.timestamp = new Date().toISOString();

    return data;
  }

  buildExpression(detailed) {
    return `(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      
      // Core Web Vitals helpers
      const paintEntries = performance.getEntriesByType('paint');
      const lcpEntry = performance.getEntriesByType('largest-contentful-paint').slice(-1)[0];
      const clsEntries = performance.getEntriesByType('layout-shift')
        .filter(e => !e.hadRecentInput);
      const cls = clsEntries.reduce((sum, e) => sum + e.value, 0);
      
      // Memory (if available)
      const memory = performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      } : null;
      
      // Resource summary
      const byType = {};
      let totalTransfer = 0;
      let totalDecoded = 0;
      
      for (const r of resources) {
        const type = r.initiatorType || 'other';
        if (!byType[type]) {
          byType[type] = { count: 0, transferSize: 0, decodedSize: 0, duration: 0 };
        }
        byType[type].count++;
        byType[type].transferSize += r.transferSize;
        byType[type].decodedSize += r.encodedBodySize || 0;
        byType[type].duration += r.duration;
        totalTransfer += r.transferSize;
        totalDecoded += r.encodedBodySize || 0;
      }
      
      // Slowest resources
      const slowest = resources
        .filter(r => r.duration > 0)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10)
        .map(r => ({
          url: r.name.split('/').slice(-1)[0] || r.name,
          duration: Math.round(r.duration),
          size: r.transferSize,
          type: r.initiatorType,
        }));
      
      // Largest resources
      const largest = resources
        .filter(r => r.transferSize > 0)
        .sort((a, b) => b.transferSize - a.transferSize)
        .slice(0, 10)
        .map(r => ({
          url: r.name.split('/').slice(-1)[0] || r.name,
          size: r.transferSize,
          type: r.initiatorType,
        }));
      
      const result = {
        coreWebVitals: {
          fcp: Math.round(paintEntries.find(e => e.name === 'first-contentful-paint')?.startTime || 0),
          lcp: Math.round(lcpEntry?.startTime || 0),
          cls: Math.round(cls * 100000) / 100000,
          ttfb: Math.round(nav?.responseStart || 0),
          dcl: Math.round(nav?.domContentLoadedEventEnd || 0),
          load: Math.round(nav?.loadEventEnd || 0),
        },
        summary: {
          totalRequests: resources.length,
          totalTransferSize: totalTransfer,
          totalDecodedSize: totalDecoded,
          byType,
        },
        memory,
        slowestResources: slowest,
        largestResources: largest,
      };
      
      if (${detailed}) {
        result.allResources = resources.map(r => ({
          url: r.name,
          type: r.initiatorType,
          duration: Math.round(r.duration),
          transferSize: r.transferSize,
          decodedSize: r.encodedBodySize,
          startTime: Math.round(r.startTime),
        }));
      }
      
      return result;
    })()`;
  }
}
