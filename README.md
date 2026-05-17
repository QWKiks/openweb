# OpenWeb

Open-source browser automation for AI agents. Control Chrome from Claude Code, Cursor, Windsurf, OpenCode, or any MCP-compatible tool.

## Architecture

```
AI Agent (Claude/Cursor/Windsurf)
    ↓ MCP (stdio)
MCP Server (mcp-server.js)
    ↓ WebSocket
Daemon (daemon.js)
    ↓ WebSocket
Chrome Extension
    ↓ CDP
Browser
```

## Quick Start

### One Command Install

```bash
npx openweb setup
```

This will:
1. Clone the repo and install dependencies
2. Register the MCP server with all detected AI tools
3. Start the daemon
4. Print instructions for loading the Chrome extension

### Manual Install

```bash
git clone https://github.com/QWKiks/openweb.git
cd openweb
npm install
```

### Step 1: Load the Chrome Extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `openweb` folder
4. The extension icon appears in your toolbar

### Step 2: Connect the Extension

1. Click the OpenWeb icon in your toolbar
2. Click **Connect** — the status turns green with an animated border

### Step 3: Register MCP with Your AI Tool

```bash
# Interactive — see what's installed
npm run setup-mcp

# Register with all detected tools at once
npm run setup-mcp -- --all

# Or pick specific tools
npm run setup-mcp -- --claude
npm run setup-mcp -- --cursor
npm run setup-mcp -- --windsurf
npm run setup-mcp -- --opencode
npm run setup-mcp -- --codex

# Remove from all tools
npm run setup-mcp -- --remove
```

Restart your AI tool after registration.

## Tools

| Tool | Description |
|------|-------------|
| `navigate` | Open a URL (new tab or current tab) |
| `snapshot` | Capture the accessibility tree with element refs (`@e1`, `@e2`...) |
| `screenshot` | Take a PNG screenshot |
| `click` | Click an element by CSS selector or `@e` ref |
| `fill` | Fill a form field by CSS selector or `@e` ref |
| `key_type` | Type text into the focused element |
| `send_keys` | Send key combos (Enter, Ctrl+A, Tab, etc.) |
| `evaluate` | Execute JavaScript on the page |
| `list_tabs` | List all open browser tabs |
| `find_tab` | Find a tab by URL pattern |
| `close_tab` | Close a tab by ID |
| `mouse_click` | Physical mouse click via CDP |
| `network` | Capture/list/inspect HTTP requests |

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
WEBBRIDGE_WS_URL=ws://192.168.1.100:10086/ws node mcp-server.js
```

## Project Structure

```
openweb/
├── manifest.json          # Chrome extension manifest
├── background.js          # Service worker entry point
├── daemon.js              # WebSocket daemon + REPL
├── mcp-server.js          # MCP server (stdio/SSE)
├── setup-mcp.js           # MCP registration script
├── package.json
├── _locales/              # i18n (en, zh_CN)
├── icon/                  # Extension icons
├── popup/                 # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── lib/                   # Shared libraries
│   ├── cdp.js             # Chrome DevTools Protocol manager
│   ├── ws-client.js       # WebSocket client (extension side)
│   ├── tab-manager.js     # Tab tracking & grouping
│   ├── snapshot-refs.js   # Accessibility tree ref system
│   └── match-pattern.js   # URL match pattern parser
└── tools/                 # Browser automation tools
    ├── registry.js        # Tool registry & dispatcher
    ├── navigate.js
    ├── click.js
    ├── fill.js
    ├── snapshot.js
    ├── screenshot.js
    ├── evaluate.js
    ├── key-type.js
    ├── send-keys.js
    ├── mouse-click.js
    ├── list-tabs.js
    ├── find-tab.js
    ├── close-tab.js
    ├── network.js
    ├── save-as-pdf.js
    ├── upload.js
    └── close-session.js
```

## License

MIT
