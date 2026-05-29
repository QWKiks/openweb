#!/usr/bin/env node
/**
 * Cross-browser build script for OpenWeb extension
 *
 * Usage:
 *   node build.js chrome     -> dist/chrome/
 *   node build.js firefox    -> dist/firefox/
 *   node build.js edge       -> dist/edge/ (same as chrome)
 */

import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const TARGET = process.argv[2] || "chrome";
const VALID_TARGETS = ["chrome", "edge", "firefox"];

if (!VALID_TARGETS.includes(TARGET)) {
  console.error(`Unknown target: ${TARGET}. Use: chrome | edge | firefox`);
  process.exit(1);
}

// Automatically synchronize root manifest.json with manifest.chrome.json to avoid drift
try {
  writeFileSync("manifest.json", readFileSync("manifest.chrome.json", "utf-8"));
  console.log("  ✓ Synchronized root manifest.json with manifest.chrome.json");
} catch (e) {
  console.warn(`  ⚠ Warning: failed to synchronize root manifest.json: ${e.message}`);
}

const SRC = ".";
const OUT = join("dist", TARGET);

console.log(`\n  Building OpenWeb for ${TARGET}...\n`);

// Clean output
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

// Copy all source files except manifests
cpSync(SRC, OUT, { recursive: true, filter: (src) => {
  const base = src.split("/").pop();
  if (base.startsWith("manifest.")) return false;
  if (base === "build.js") return false;
  if (base === "node_modules") return false;
  if (base === "dist") return false;
  if (base === ".git") return false;
  return true;
}});

// Copy correct manifest
const manifestSrc = TARGET === "firefox"
  ? "manifest.firefox.json"
  : "manifest.chrome.json";
const manifestOut = join(OUT, "manifest.json");
writeFileSync(manifestOut, readFileSync(manifestSrc, "utf-8"));

// For Edge — same as Chrome, no changes needed
console.log(`  ✓ Output: ${OUT}/`);
console.log(`  ✓ Manifest: ${manifestSrc}`);
console.log(`\n  Load the extension:`);
console.log(`    ${TARGET === "firefox" ? "about:debugging -> This Firefox -> Load Temporary Add-on" : "chrome://extensions -> Developer mode -> Load unpacked"}`);
console.log(`    Select: ${OUT}/\n`);
