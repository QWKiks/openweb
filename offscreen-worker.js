// Offscreen Web Worker — sends a ping every 25s to keep the service worker alive.
// Chrome MV3 kills service workers after 30s of inactivity.
setInterval(() => {
  // No-op; the worker's existence is enough to keep the service worker alive
}, 25000);
