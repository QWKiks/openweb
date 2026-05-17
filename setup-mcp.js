#!/usr/bin/env node
/**
 * WebBridge Open — MCP Setup Script
 *
 * Automatically registers the MCP server with AI coding tools.
 *
 * Usage:
 *   node setup-mcp.js              # interactive — choose which tools
 *   node setup-mcp.js --all        # register with all detected tools
 *   node setup-mcp.js --claude     # Claude Code only
 *   node setup-mcp.js --cursor     # Cursor only
 *   node setup-mcp.js --windsurf   # Windsurf only
 *   node setup-mcp.js --codex      # OpenAI Codex only
 *   node setup-mcp.js --remove     # remove from all
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const MCP_SERVER_PATH = join(import.meta.dirname, "mcp-server.js");
const PROJECT_DIR = import.meta.dirname;

// ── Config templates ─────────────────────────────────────────────────────────

function makeMcpConfig() {
  return {
    mcpServers: {
      webbridge: {
        command: "node",
        args: [MCP_SERVER_PATH],
        env: {},
      },
    },
  };
}

// ── Tool configs ─────────────────────────────────────────────────────────────

const TOOLS = {
  claude: {
    name: "Claude Code",
    detect: () => {
      try { execSync("claude --version", { stdio: "pipe" }); return true; } catch { return false; }
    },
    add: () => {
      // Claude Code CLI: claude mcp add -s user (global scope)
      try {
        execSync(`claude mcp add webbridge -s user -- node "${MCP_SERVER_PATH}"`, { stdio: "inherit" });
        console.log("  ✓ Added via 'claude mcp add -s user' (global)");
        return true;
      } catch (e) {
        // Fallback: write to ~/.claude.json manually
        const configFile = join(homedir(), ".claude.json");
        return writeClaudeGlobalConfig(configFile);
      }
    },
    remove: () => {
      try { execSync("claude mcp remove webbridge -s user", { stdio: "pipe" }); } catch {}
      console.log("  ✓ Removed from Claude Code (global)");
    },
  },

  cursor: {
    name: "Cursor",
    detect: () => existsSync(join(homedir(), ".cursor")),
    add: () => {
      // Cursor: .cursor/mcp.json in project, or global ~/.cursor/mcp.json
      const projectConfig = join(PROJECT_DIR, ".cursor", "mcp.json");
      const globalConfig = join(homedir(), ".cursor", "mcp.json");

      // Try project-level first
      if (writeMcpJson(projectConfig)) {
        console.log("  ✓ Wrote .cursor/mcp.json in project");
        return true;
      }
      return writeGlobalConfig(dirname(globalConfig), globalConfig);
    },
    remove: () => {
      const projectConfig = join(PROJECT_DIR, ".cursor", "mcp.json");
      removeMcpEntry(projectConfig);
      const globalConfig = join(homedir(), ".cursor", "mcp.json");
      removeMcpEntry(globalConfig);
      console.log("  ✓ Removed from Cursor");
    },
  },

  windsurf: {
    name: "Windsurf",
    detect: () => existsSync(join(homedir(), ".codeium", "windsurf")),
    add: () => {
      // Windsurf: write BOTH project and global configs
      // Global config is at ~/.codeium/windsurf/mcp_config.json
      const projectConfig = join(PROJECT_DIR, ".windsurf", "mcp.json");
      const globalConfig = join(homedir(), ".codeium", "windsurf", "mcp_config.json");

      writeMcpJson(projectConfig);
      console.log("  ✓ Wrote .windsurf/mcp.json in project");

      writeGlobalConfig(dirname(globalConfig), globalConfig);
      return true;
    },
    remove: () => {
      const projectConfig = join(PROJECT_DIR, ".windsurf", "mcp.json");
      removeMcpEntry(projectConfig);
      const globalConfig = join(homedir(), ".codeium", "windsurf", "mcp_config.json");
      removeMcpEntry(globalConfig);
      console.log("  ✓ Removed from Windsurf");
    },
  },

  opencode: {
    name: "OpenCode",
    detect: () => {
      try { execSync("opencode --version", { stdio: "pipe" }); return true; } catch { return false; }
    },
    add: () => {
      // OpenCode uses "mcp" key (not "mcpServers") and "command" as array
      const projectConfig = join(PROJECT_DIR, "opencode.json");
      const globalConfig = join(homedir(), ".config", "opencode", "config.json");

      writeOpenCodeConfig(projectConfig);
      console.log("  ✓ Wrote opencode.json in project");

      writeOpenCodeConfig(globalConfig);
      console.log(`  ✓ Wrote ${globalConfig}`);
      return true;
    },
    remove: () => {
      const projectConfig = join(PROJECT_DIR, "opencode.json");
      removeOpenCodeEntry(projectConfig);
      const globalConfig = join(homedir(), ".config", "opencode", "config.json");
      removeOpenCodeEntry(globalConfig);
      console.log("  ✓ Removed from OpenCode");
    },
  },

  codex: {
    name: "OpenAI Codex CLI",
    detect: () => {
      try { execSync("codex --version", { stdio: "pipe" }); return true; } catch { return false; }
    },
    add: () => {
      // Codex CLI uses ~/.codex/config.json with mcpServers
      const configDir = join(homedir(), ".codex");
      const configFile = join(configDir, "config.json");
      return writeGlobalConfig(configDir, configFile);
    },
    remove: () => {
      const configFile = join(homedir(), ".codex", "config.json");
      removeMcpEntry(configFile);
      console.log("  ✓ Removed from Codex");
    },
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeClaudeGlobalConfig(configFile) {
  try {
    let config = {};
    if (existsSync(configFile)) {
      try { config = JSON.parse(readFileSync(configFile, "utf8")); } catch { config = {}; }
    }

    config.mcpServers = config.mcpServers || {};
    config.mcpServers.webbridge = {
      type: "stdio",
      command: "node",
      args: [MCP_SERVER_PATH],
      env: {},
    };

    writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log(`  ✓ Wrote ${configFile}`);
    return true;
  } catch (e) {
    console.log(`  ✗ Failed to write ${configFile}: ${e.message}`);
    return false;
  }
}

function writeGlobalConfig(configDir, configFile) {
  try {
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

    let config = {};
    if (existsSync(configFile)) {
      try { config = JSON.parse(readFileSync(configFile, "utf8")); } catch { config = {}; }
    }

    config.mcpServers = config.mcpServers || {};
    config.mcpServers.webbridge = {
      command: "node",
      args: [MCP_SERVER_PATH],
    };

    writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log(`  ✓ Wrote ${configFile}`);
    return true;
  } catch (e) {
    console.log(`  ✗ Failed to write ${configFile}: ${e.message}`);
    return false;
  }
}

function writeMcpJson(filePath) {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    let config = {};
    if (existsSync(filePath)) {
      try { config = JSON.parse(readFileSync(filePath, "utf8")); } catch { config = {}; }
    }

    config.mcpServers = config.mcpServers || {};
    config.mcpServers.webbridge = {
      command: "node",
      args: [MCP_SERVER_PATH],
    };

    writeFileSync(filePath, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

function writeOpenCodeConfig(filePath) {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    let config = {};
    if (existsSync(filePath)) {
      try { config = JSON.parse(readFileSync(filePath, "utf8")); } catch { config = {}; }
    }

    config.mcp = config.mcp || {};
    config.mcp.webbridge = {
      type: "local",
      command: ["node", MCP_SERVER_PATH],
      enabled: true,
    };

    // Clean up stale mcpServers key (wrong format from older versions)
    delete config.mcpServers;

    writeFileSync(filePath, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

function removeOpenCodeEntry(filePath) {
  if (!existsSync(filePath)) return;
  try {
    let config = JSON.parse(readFileSync(filePath, "utf8"));
    if (config.mcp?.webbridge) {
      delete config.mcp.webbridge;
      writeFileSync(filePath, JSON.stringify(config, null, 2));
    }
  } catch {}
}

function removeMcpEntry(filePath) {
  if (!existsSync(filePath)) return;
  try {
    let config = JSON.parse(readFileSync(filePath, "utf8"));
    if (config.mcpServers?.webbridge) {
      delete config.mcpServers.webbridge;
      writeFileSync(filePath, JSON.stringify(config, null, 2));
    }
  } catch {}
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--remove")) {
  console.log("Removing WebBridge MCP from all tools...\n");
  for (const [, tool] of Object.entries(TOOLS)) {
    tool.remove();
  }
  process.exit(0);
}

const targetTools = args.includes("--all")
  ? Object.keys(TOOLS)
  : args.filter(a => a.startsWith("--")).map(a => a.slice(2)).filter(a => TOOLS[a]);

if (targetTools.length === 0) {
  // Interactive mode
  console.log("\n  WebBridge Open — MCP Setup\n");
  console.log("  Detected tools:\n");

  const detected = [];
  for (const [key, tool] of Object.entries(TOOLS)) {
    const isDetected = tool.detect();
    console.log(`    ${isDetected ? "●" : "○"} ${tool.name} (--${key})${isDetected ? " [detected]" : ""}`);
    if (isDetected) detected.push(key);
  }

  console.log("\n  Usage:");
  console.log("    node setup-mcp.js --all          # Register with all tools");
  console.log("    node setup-mcp.js --claude       # Claude Code only");
  console.log("    node setup-mcp.js --cursor       # Cursor only");
  console.log("    node setup-mcp.js --windsurf     # Windsurf only");
  console.log("    node setup-mcp.js --codex        # OpenAI Codex only");
  console.log("    node setup-mcp.js --opencode     # OpenCode only");
  console.log("    node setup-mcp.js --remove       # Remove from all\n");

  if (detected.length > 0) {
    console.log(`  Quick start: node setup-mcp.js --${detected[0]}\n`);
  }
  process.exit(0);
}

console.log("\n  WebBridge Open — MCP Setup\n");

for (const key of targetTools) {
  const tool = TOOLS[key];
  if (!tool) {
    console.log(`  ✗ Unknown tool: --${key}`);
    continue;
  }
  console.log(`  Setting up ${tool.name}...`);
  tool.add();
}

console.log("\n  Done! Restart your AI tool to pick up the changes.\n");
