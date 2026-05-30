#!/usr/bin/env node
   
                             
  
                                                               
  
         
                                                                      
                                                                      
                                                      
                                                 
                                                   
                                                     
                                                              
                                                       
                                                     
   

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const MCP_SERVER_PATH = join(import.meta.dirname, "mcp-server.js");
const PROJECT_DIR = import.meta.dirname;

function makeMcpConfig() {
  return {
    mcpServers: {
      openweb: {
        command: "node",
        args: [MCP_SERVER_PATH],
        env: {},
      },
    },
  };
}

const TOOLS = {
  claude: {
    name: "Claude Code",
    detect: () => {
      try { execSync("claude --version", { stdio: "pipe" }); return true; } catch { return false; }
    },
    add: () => {
      

      try {
        execSync(`claude mcp add openweb -s user -- node "${MCP_SERVER_PATH}"`, { stdio: "inherit" });
        console.log("  ✓ Added via 'claude mcp add -s user' (global)");
        return true;
      } catch (e) {
        

        const configFile = join(homedir(), ".claude.json");
        return writeClaudeGlobalConfig(configFile);
      }
    },
    remove: () => {
      try { execSync("claude mcp remove openweb -s user", { stdio: "pipe" }); } catch {}
      console.log("  ✓ Removed from Claude Code (global)");
    },
  },

  cursor: {
    name: "Cursor",
    detect: () => existsSync(join(homedir(), ".cursor")),
    add: () => {
      

      const projectConfig = join(PROJECT_DIR, ".cursor", "mcp.json");
      const globalConfig = join(homedir(), ".cursor", "mcp.json");

      

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
      

      const configDir = join(homedir(), ".codex");
      const configFile = join(configDir, "config.toml");
      return writeCodexTomlConfig(configDir, configFile);
    },
    remove: () => {
      const configFile = join(homedir(), ".codex", "config.toml");
      removeCodexTomlEntry(configFile);
      console.log("  ✓ Removed from Codex");
    },
  },

  gemini: {
    name: "Gemini CLI",
    detect: () => {
      try { execSync("gemini --version", { stdio: "pipe" }); return true; } catch { return false; }
    },
    add: () => {
      

      

      try {
        execSync(`gemini mcp add openweb -s user -- node "${MCP_SERVER_PATH}"`, { stdio: "inherit" });
        console.log("  ✓ Added via 'gemini mcp add' (global)");
        return true;
      } catch {
        

        const projectConfig = join(PROJECT_DIR, ".gemini", "settings.json");
        const globalConfig = join(homedir(), ".gemini", "settings.json");
        writeGeminiSettings(projectConfig);
        console.log("  ✓ Wrote .gemini/settings.json in project");
        writeGeminiSettings(globalConfig);
        console.log(`  ✓ Wrote ${globalConfig}`);
        return true;
      }
    },
    remove: () => {
      try { execSync("gemini mcp remove openweb -s user", { stdio: "pipe" }); } catch {}
      const projectConfig = join(PROJECT_DIR, ".gemini", "settings.json");
      removeMcpEntry(projectConfig);
      const globalConfig = join(homedir(), ".gemini", "settings.json");
      removeMcpEntry(globalConfig);
      console.log("  ✓ Removed from Gemini CLI");
    },
  },

  antigravity: {
    name: "Google Antigravity",
    detect: () => {
      

      const vscodeExtensions = join(homedir(), ".vscode", "extensions");
      try {
        const dirs = readdirSync(vscodeExtensions, { withFileTypes: true });
        return dirs.some(d => d.name.startsWith("google.antigravity"));
      } catch {
        return false;
      }
    },
    add: () => {
      

      const projectConfig = join(PROJECT_DIR, ".antigravity", "mcp.json");
      writeMcpJson(projectConfig);
      console.log("  ✓ Wrote .antigravity/mcp.json in project");

      

      const vscodeDir = join(PROJECT_DIR, ".vscode");
      const vscodeConfig = join(vscodeDir, "mcp.json");
      writeMcpJson(vscodeConfig);
      console.log("  ✓ Wrote .vscode/mcp.json in project");
      return true;
    },
    remove: () => {
      const projectConfig = join(PROJECT_DIR, ".antigravity", "mcp.json");
      removeMcpEntry(projectConfig);
      const vscodeConfig = join(PROJECT_DIR, ".vscode", "mcp.json");
      removeMcpEntry(vscodeConfig);
      console.log("  ✓ Removed from Antigravity");
    },
  },
};

function writeClaudeGlobalConfig(configFile) {
  try {
    let config = {};
    if (existsSync(configFile)) {
      try { config = JSON.parse(readFileSync(configFile, "utf8")); } catch { config = {}; }
    }

    config.mcpServers = config.mcpServers || {};
    config.mcpServers.openweb = {
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
    config.mcpServers.openweb = {
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
    config.mcpServers.openweb = {
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
    config.mcp.openweb = {
      type: "local",
      command: ["node", MCP_SERVER_PATH],
      enabled: true,
    };

    

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
    if (config.mcp?.openweb) {
      delete config.mcp.openweb;
      writeFileSync(filePath, JSON.stringify(config, null, 2));
    }
  } catch {}
}

function removeMcpEntry(filePath) {
  if (!existsSync(filePath)) return;
  try {
    let config = JSON.parse(readFileSync(filePath, "utf8"));
    if (config.mcpServers?.openweb) {
      delete config.mcpServers.openweb;
      writeFileSync(filePath, JSON.stringify(config, null, 2));
    }
  } catch {}
}

function writeGeminiSettings(filePath) {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    let config = {};
    if (existsSync(filePath)) {
      try { config = JSON.parse(readFileSync(filePath, "utf8")); } catch { config = {}; }
    }

    config.mcpServers = config.mcpServers || {};
    config.mcpServers.openweb = {
      command: "node",
      args: [MCP_SERVER_PATH],
    };

    writeFileSync(filePath, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

function writeCodexTomlConfig(configDir, configFile) {
  try {
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

    let content = "";
    if (existsSync(configFile)) {
      content = readFileSync(configFile, "utf8");
    }

    

    content = content.replace(/\n?\[mcp_servers\.openweb\][^\[]*(?=\n\[|$)/g, "");

    const section = `\n[mcp_servers.openweb]\ncommand = "node"\nargs = ["${MCP_SERVER_PATH}"]\n`;

    content = content.trimEnd() + "\n" + section;
    writeFileSync(configFile, content);
    console.log(`  ✓ Wrote ${configFile}`);
    return true;
  } catch (e) {
    console.log(`  ✗ Failed to write ${configFile}: ${e.message}`);
    return false;
  }
}

function removeCodexTomlEntry(configFile) {
  if (!existsSync(configFile)) return;
  try {
    let content = readFileSync(configFile, "utf8");
    content = content.replace(/\n?\[mcp_servers\.openweb\][^\[]*(?=\n\[|$)/g, "");
    writeFileSync(configFile, content.trimEnd() + "\n");
  } catch {}
}

const args = process.argv.slice(2);

if (args.includes("--remove")) {
  console.log("Removing OpenWeb MCP from all tools...\n");
  for (const [, tool] of Object.entries(TOOLS)) {
    tool.remove();
  }
  process.exit(0);
}

const targetTools = args.includes("--all")
  ? Object.keys(TOOLS)
  : args.filter(a => a.startsWith("--")).map(a => a.slice(2)).filter(a => TOOLS[a]);

if (targetTools.length === 0) {
  

  console.log("\n  OpenWeb — MCP Setup\n");
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
  console.log("    node setup-mcp.js --gemini       # Gemini CLI only");
  console.log("    node setup-mcp.js --antigravity  # Google Antigravity only");
  console.log("    node setup-mcp.js --codex        # OpenAI Codex only");
  console.log("    node setup-mcp.js --opencode     # OpenCode only");
  console.log("    node setup-mcp.js --remove       # Remove from all\n");

  if (detected.length > 0) {
    console.log(`  Quick start: node setup-mcp.js --${detected[0]}\n`);
  }
  process.exit(0);
}

console.log("\n  OpenWeb — MCP Setup\n");

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
