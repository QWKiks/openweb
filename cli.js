#!/usr/bin/env node
   
                
  
                                       
   

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import http from "http";

const REPO = "https://github.com/QWKiks/openweb.git";
const INSTALL_DIR = join(homedir(), ".openweb");

const args = process.argv.slice(2);
const command = args[0] || "help";

switch (command) {
  case "setup": {
    console.log("\n  OpenWeb — Setup\n");

    

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

    

    console.log("  Installing dependencies...");
    try {
      execSync(`npm install`, { cwd: INSTALL_DIR, stdio: "inherit" });
    } catch {
      console.log("  ✗ npm install failed");
      process.exit(1);
    }

    

    console.log("\n  Registering MCP server with AI tools...\n");
    try {
      execSync(`node setup-mcp.js --all`, { cwd: INSTALL_DIR, stdio: "inherit" });
    } catch (e) {
      console.log("  ⚠ Some AI tools could not be detected, but setup can continue.");
    }

    

    console.log("  Starting daemon...\n");
    const daemonPath = join(INSTALL_DIR, "daemon.js");
    try {
      execSync(`node "${daemonPath}"`, { stdio: "inherit" });
    } catch (e) {
      console.log("  ℹ Daemon stopped by user.");
    }

    

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
    } catch (e) {
      

    }
    break;
  }

  case "mcp": {
    const mcpPath = existsSync(join(INSTALL_DIR, "mcp-server.js"))
      ? join(INSTALL_DIR, "mcp-server.js")
      : join(import.meta.dirname, "mcp-server.js");
    try {
      execSync(`node "${mcpPath}"`, { stdio: "inherit" });
    } catch (e) {
      

    }
    break;
  }

  case "doctor": {
    console.log("\n  OpenWeb — Doctor\n");

    const checks = [];

    

    const healthPromise = new Promise((resolve) => {
      http.get("http://127.0.0.1:10087/health", (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            checks.push({ name: "Daemon", ok: true, detail: `${json.extensions} ext, ${json.controllers} ctrl` });
          } catch {
            checks.push({ name: "Daemon", ok: true, detail: "running" });
          }
          resolve();
        });
      }).on("error", () => {
        checks.push({ name: "Daemon", ok: false, detail: "not running on port 10087" });
        resolve();
      });
    });

    

    const wsPromise = new Promise(async (resolve) => {
      const { default: WebSocket } = await import("ws");
      const ws = new WebSocket("ws://127.0.0.1:10086/ws");
      ws.on("open", () => {
        checks.push({ name: "WebSocket", ok: true, detail: "ws://127.0.0.1:10086/ws" });
        ws.close();
        resolve();
      });
      ws.on("error", () => {
        checks.push({ name: "WebSocket", ok: false, detail: "cannot connect" });
        resolve();
      });
      setTimeout(() => { ws.close(); resolve(); }, 3000);
    });

    

    const mcpPromise = new Promise((resolve) => {
      const windsurfConfig = join(homedir(), ".codeium", "windsurf", "mcp_config.json");
      const claudeConfig = join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
      const hasWindsurf = existsSync(windsurfConfig);
      const hasClaude = existsSync(claudeConfig);
      if (hasWindsurf || hasClaude) {
        checks.push({ name: "MCP Config", ok: true, detail: hasWindsurf ? "Windsurf" : "Claude" });
      } else {
        checks.push({ name: "MCP Config", ok: false, detail: "no AI tool config found" });
      }
      resolve();
    });

    await healthPromise;
    await wsPromise;
    await mcpPromise;

    const okCount = checks.filter(c => c.ok).length;
    const failCount = checks.filter(c => !c.ok).length;

    for (const c of checks) {
      const icon = c.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      console.log(`  ${icon} ${c.name.padEnd(12)} ${c.detail}`);
    }

    console.log(`\n  ${okCount}/${checks.length} checks passed${failCount ? `, ${failCount} failed` : ""}`);
    if (failCount) {
      console.log("\n  Fix:");
      if (!checks.find(c => c.name === "Daemon")?.ok) {
        console.log("    openweb daemon    (start the daemon)");
      }
      if (!checks.find(c => c.name === "MCP Config")?.ok) {
        console.log("    npm run setup-mcp -- --all");
      }
    }
    console.log();
    process.exit(failCount ? 1 : 0);
  }

  case "help":
  default: {
    console.log(`
  OpenWeb — CLI

  Usage:
    npx openweb setup              Full setup (clone + install + MCP register + daemon)
    npx openweb daemon             Start the WebSocket daemon
    npx openweb mcp                Start the MCP server
    npx openweb doctor             Diagnose the full chain (daemon, WS, MCP config)
    npx openweb help               Show this message

  Manual setup:
    git clone ${REPO}
    cd openweb
    npm install
    npm run setup-mcp -- --all
    openweb daemon
`);
    break;
  }
}
