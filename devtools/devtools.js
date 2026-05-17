/**
 * OpenWeb DevTools Panel
 * Creates a "OpenWeb" panel in Chrome DevTools for monitoring tool calls in real time.
 */

chrome.devtools.panels.create(
  "OpenWeb",
  "../icon/16.png",
  "devtools/panel.html"
);
