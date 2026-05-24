/**
 * Color Palette Tool
 * Extracts dominant colors from a website for branding / design analysis.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class ColorPaletteTool {
  name = "color_palette";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const allEls = document.querySelectorAll('*');
        const colorCounts = {};
        const bgCounts = {};
        const textCounts = {};
        const borderCounts = {};

        for (const el of allEls) {
          const s = window.getComputedStyle(el);
          const c = s.color;
          const bg = s.backgroundColor;
          const b = s.borderColor;

          if (c && c !== 'rgba(0, 0, 0, 0)' && !c.includes('transparent')) {
            colorCounts[c] = (colorCounts[c] || 0) + 1;
            textCounts[c] = (textCounts[c] || 0) + 1;
          }
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && !bg.includes('transparent')) {
            bgCounts[bg] = (bgCounts[bg] || 0) + 1;
          }
          if (b && b !== 'rgba(0, 0, 0, 0)' && !b.includes('transparent')) {
            borderCounts[b] = (borderCounts[b] || 0) + 1;
          }
        }

        const sortByCount = (obj) => Object.entries(obj)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([color, count]) => ({ color, count }));

        return {
          totalElements: allEls.length,
          textColors: sortByCount(textCounts),
          backgroundColors: sortByCount(bgCounts),
          borderColors: sortByCount(borderCounts),
          topColors: sortByCount(colorCounts),
          bodyBg: window.getComputedStyle(document.body).backgroundColor,
          bodyColor: window.getComputedStyle(document.body).color,
          primaryLink: window.getComputedStyle(document.querySelector('a'))?.color || null,
        };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error("color_palette: " + result.exceptionDetails.text);
    }

    const data = result.result?.value || {};
    data.url = tab.url;
    return data;
  }
}
