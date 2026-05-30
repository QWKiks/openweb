// Offscreen Web Worker — keeps the service worker alive.
// Chrome MV3 kills service workers after 30s of inactivity;
// the mere existence of this offscreen document prevents that.