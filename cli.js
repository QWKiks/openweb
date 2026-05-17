#!/usr/bin/env node
/**
 * OpenWeb — CLI
 *
 * One-command setup: npx openweb setup
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const REPO = "https://github.com/QWKiks/openweb.git";
const INSTALL_DIR = join(homedir(), ".openweb");

const args = process.argv.slice(2);
const command = args[0] || "help";

switch (command) {
  case "setup": {
    console.log("\n  OpenWeb — Setup\n");

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
      execSync(`npm install`, { cwd: INSTALL_DIR, stdio: "inherit" });
    } catch {
      console.log("  ✗ npm install failed");
      process.exit(1);
    }

    // 3. Register MCP with all detected AI tools
    console.log("\n  Registering MCP server with AI tools...\n");
    try {
      execSync(`node setup-mcp.js --all`, { cwd: INSTALL_DIR, stdio: "inherit" });
    } catch {
      // Some tools may not be detected, that's fine
    }

    // 4. Start the daemon
    console.log("  Starting daemon...\n");
    const daemonPath = join(INSTALL_DIR, "daemon.js");
    try {
      execSync(`node "${daemonPath}"`, { stdio: "inherit" });
    } catch {
      // Daemon was stopped by user, that's fine
    }

    // 5. Print extension instructions
    console.log("\n  ─────────────────────────────────────────────");
    console.log("  Load the Chrome extension:");
    console.log("    1. Open chrome://extensions");
    console.log("    2. Enable Developer mode (top right)");
    console.log(`    3. Click "Load unpacked" → select:`);
    console.log(`       ${INSTALL_DIR}`);
    console.log("    4. Click the OpenWeb icon → Connect\n");

    console.log("  Done! Restart your AI tool to pick up MCP.\n");
    break;
  }

  case "daemon": {
    const daemonPath = existsSync(join(INSTALL_DIR, "daemon.js"))
      ? join(INSTALL_DIR, "daemon.js")
      : join(import.meta.dirname, "daemon.js");
    try {
      execSync(`node "${daemonPath}"`, { stdio: "inherit" });
    } catch {}
    break;
  }

  case "mcp": {
    const mcpPath = existsSync(join(INSTALL_DIR, "mcp-server.js"))
      ? join(INSTALL_DIR, "mcp-server.js")
      : join(import.meta.dirname, "mcp-server.js");
    try {
      execSync(`node "${mcpPath}"`, { stdio: "inherit" });
    } catch {}
    break;
  }

  case "help":
  default: {
    console.log(`
  OpenWeb — CLI

  Usage:
    npx openweb setup              Full setup (clone + install + MCP register + daemon)
    npx openweb daemon             Start the WebSocket daemon
    npx openweb mcp                Start the MCP server
    npx openweb help               Show this message

  Manual setup:
    git clone ${REPO}
    cd openweb
    npm install
    npm run setup-mcp -- --all
    npm run daemon
`);
    break;
  }
}
