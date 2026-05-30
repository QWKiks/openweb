# OpenWeb

**[English](README.md)** · **[Русский](README.ru.md)** · **[简体中文](README.zh.md)**

Open-source browser automation for AI agents. Control Chrome, Firefox, and Edge from Claude Code, Cursor, Windsurf, OpenCode, or any MCP-compatible tool.

## Architecture

```
AI Agent (Claude/Cursor/Windsurf)
    ↓ MCP (stdio)
MCP Server (mcp-server.js)
    ↓ WebSocket
Daemon (daemon.js)          ← load-aware routing, security, recording
    ↓ WebSocket
Browser Extension           ← Chrome / Firefox / Edge
    ↓ CDP
Browser
```

## Quick Start

### Installation

For macOS users, installing natively via **Homebrew** is highly recommended as it provides automated integrity verification:

**macOS (Homebrew - Recommended):**
```bash
# Install the formula natively from the repository:
brew install --formula Formula/openweb.rb

# Start the background daemon service:
brew services start openweb
```

For other environments, we strongly recommend a secure **two-step installation** to inspect script integrity before execution:

**Windows (PowerShell - Recommended):**
```powershell
# 1. Download the installer script:
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/QWKiks/openweb/main/install.ps1" -OutFile "install.ps1"

# 2. Inspect the script to ensure integrity:
Get-Content install.ps1

# 3. Execute the script:
.\install.ps1
```

**macOS / Linux (Bash - Recommended):**
```bash
# 1. Download the installer script:
curl -fsSL -o install.sh https://raw.githubusercontent.com/QWKiks/openweb/main/install.sh

# 2. Inspect the script to ensure integrity:
cat install.sh

# 3. Execute the script:
bash install.sh
```

*(Alternatively, for quick automated setup, you can pipeline directly at your own risk: `irm https://raw.githubusercontent.com/QWKiks/openweb/main/install.ps1 | iex` or `curl -fsSL https://raw.githubusercontent.com/QWKiks/openweb/main/install.sh | bash`)*

This will:
1. Clone the repo and install dependencies
2. Register the MCP server with all detected AI tools
3. Print instructions for loading the Chrome extension

### Manual Install

```bash
git clone https://github.com/QWKiks/openweb.git
cd openweb
npm install
```

### Step 1: Start the Daemon

The daemon is the WebSocket relay between the MCP server and the Chrome extension.

```bash
npm start
# or: node daemon.js
```

You should see:
```
[daemon] listening on ws://127.0.0.1:10086/ws
```

> **Auth (optional):** Set `OPENWEB_TOKEN` env var to require Bearer auth for controllers and SSE transport.
> OPENWEB_TOKEN=mysecret npm start
- **Auth token** — optional `OPENWEB_TOKEN` env var for Bearer auth

## Observability

```bash
# Structured JSON logging
LOG_FORMAT=json npm start

# Debug mode (all namespaces)
DEBUG=* npm start

# Specific namespaces
DEBUG=daemon,ws npm start

# Health check
curl http://127.0.0.1:10087/health

# Diagnose the full chain
node cli.js doctor
```

## Daemon REPL

The daemon has a built-in REPL for quick testing:

```
openweb> navigate https://example.com
openweb> snapshot
openweb> click a
openweb> screenshot
openweb> evaluate document.title
openweb> help
openweb> quit
```

## MCP Server

The MCP server connects to the daemon via WebSocket and exposes all tools through the Model Context Protocol.

**Transport modes:**

```bash
# stdio (default) — for Claude Desktop, Cursor, Windsurf
node mcp-server.js

# SSE — for HTTP-based clients
node mcp-server.js --transport sse --port 3001
```

**Custom daemon URL:**

```bash
OPENWEB_WS_URL=ws://192.168.1.100:10086/ws node mcp-server.js
```

## Cross-Browser Build

```bash
# Chrome / Edge (default)
npm run build:chrome

# Firefox (MV2 + browser polyfill)
npm run build:firefox

# Edge (same as Chrome)
npm run build:edge
```

Output goes to `dist/<browser>/`.

## Testing

```bash
# Unit tests (no browser required)
npm test

# E2E tests (requires running daemon + extension)
npm run test:e2e

# All tests
npm run test:all

# Diagnose issues
node cli.js doctor
```

## Project Structure

```
openweb/
├── manifest.chrome.json      # Chrome/Edge MV3 manifest
├── manifest.firefox.json     # Firefox MV2 manifest
├── build.js                  # Cross-browser build script
├── background.js             # Service worker entry point
├── daemon.js                 # WebSocket daemon + REPL + security + recording
├── mcp-server.js             # MCP server (stdio/SSE)
├── replay.js                 # Session replay script
├── cloud.js                  # Remote browser cloud connector
├── cli.js                    # CLI (setup, daemon, mcp, doctor)
├── setup-mcp.js              # MCP registration script
├── package.json
├── services/
│   └── whisper/              # Local Whisper server & transcription storage
├── _locales/                 # i18n (en, ru, zh_CN)
├── icon/                     # Extension icons
├── popup/                    # Extension popup UI
├── devtools/                 # Chrome DevTools panel
├── lib/                      # Shared libraries
│   ├── cdp.js                # Chrome DevTools Protocol manager
│   ├── ws-client.js          # WebSocket client (extension side)
│   ├── tab-manager.js        # Tab tracking & grouping
│   ├── logger.js             # Structured logging + metrics
│   ├── recorder.js           # Tool call recording
│   ├── semantic-selector.js  # AI-native selector resolution
│   ├── browser-polyfill.min.js  # WebExtension API polyfill
│   ├── snapshot-refs.js      # Accessibility tree ref system
│   └── match-pattern.js      # URL match pattern parser
├── test/                     # Test suite
│   ├── unit/                 # Unit tests (node:test)
│   └── test-all-tools.js     # E2E test suite
└── tools/                    # Browser automation tools
    ├── registry.js           # Tool registry & dispatcher
    ├── navigate.js
    ├── click.js              # ← supports semantic selectors
    ├── fill.js               # ← supports semantic selectors
    └── ...                   # 30+ tools total
```

## License

MIT
