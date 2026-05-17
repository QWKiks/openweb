#!/usr/bin/env node
/**
 * OpenWeb — One-command installer
 * Run:  node -e "fetch('https://raw.githubusercontent.com/QWKiks/openweb/main/install.js').then(r=>r.text()).then(t=>eval(t))"
 * Or:  git clone ... && node install.js
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const REPO = "https://github.com/QWKiks/openweb.git";
const INSTALL_DIR = join(homedir(), ".openweb");

console.log("\n  OpenWeb — Install\n");

// 1. Clone repo if not already installed
if (existsSync(join(INSTALL_DIR, "package.json"))) {
  console.log("  ✓ Already installed at " + INSTALL_DIR);
} else {
  console.log("  Cloning from GitHub...");
  try {
    execSync(`git clone ${REPO} "${INSTALL_DIR}"`, { stdio: "inherit" });
  } catch {
    console.log("  ✗ Git clone failed. Install git or clone manually:");
    console.log(`    git clone ${REPO} "${INSTALL_DIR}"`);
    process.exit(1);
  }
}

// 2. Install dependencies
console.log("  Installing dependencies...");
try {
  execSync("npm install", { cwd: INSTALL_DIR, stdio: "inherit" });
} catch {
  console.log("  ✗ npm install failed");
  process.exit(1);
}

// 3. Register MCP with all detected AI tools
console.log("\n  Registering MCP server with AI tools...\n");
try {
  execSync("node setup-mcp.js --all", { cwd: INSTALL_DIR, stdio: "inherit" });
} catch {
  // Some tools may not be detected, that's fine
}

// 4. Print next steps
console.log("\n  ─────────────────────────────────────────────");
console.log("  Next steps:");
console.log("    1. Open chrome://extensions");
console.log("    2. Enable Developer mode (top right)");
console.log(`    3. Click "Load unpacked" → select:`);
console.log(`       ${INSTALL_DIR}`);
console.log("    4. Click the OpenWeb icon → Connect");
console.log(`    5. Start the daemon:  node ${join(INSTALL_DIR, "daemon.js")}`);
console.log("\n  Done! Restart your AI tool to pick up MCP.\n");
