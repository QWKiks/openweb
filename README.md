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

### One Command Install

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/QWKiks/openweb/main/install.ps1 | iex
```

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/QWKiks/openweb/main/install.sh | bash
```

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

> **Auth (optional):** Set `WEBBRIDGE_TOKEN` env var to require Bearer auth for controllers and SSE transport.
> ```bash
> WEBBRIDGE_TOKEN=mysecret npm start
> ```

### Step 2: Load the Browser Extension

**Chrome / Edge:**
1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `openweb` folder
4. The extension icon appears in your toolbar
5. Click the OpenWeb icon → the status should turn **green** (connected to daemon)

**Firefox:**
1. Build the Firefox version: `npm run build:firefox`
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**
3. Select `dist/firefox/manifest.json`
4. The extension will auto-connect to the daemon

> If the status stays red, click **Connect** in the popup or check that the daemon is running.

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
npm run setup-mcp -- --gemini
npm run setup-mcp -- --antigravity
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
| `click` | Click an element (CSS, `@e` ref, semantic selector). Supports synthetic (default) or physical CDP click |
| `fill` | Fill a form field by CSS selector, `@e` ref, or **semantic selector** |
| `hover` | Hover over an element (triggers mouseover/mouseenter) |
| `select` | Select an option in a `<select>` dropdown |
| `scroll` | Scroll page or element (down/up/top/bottom) |
| `get_text` | Extract text, raw HTML, or structured page source / metadata |
| `key_type` | Type text into the focused element |
| `send_keys` | Send key combos (Enter, Ctrl+A, Tab, etc.) |
| `drag_drop` | Drag an element and drop onto another |
| `wait` | Wait for selector, navigation, or network idle |
| `evaluate` | Execute JavaScript on the page |
| `list_tabs` | List all open browser tabs |
| `find_tab` | Find a tab by URL pattern |
| `close_tab` | Close a tab by ID |
| `network` | Capture/list/inspect HTTP requests |
| `intercept` | Block, redirect, modify, or mock HTTP requests |
| `cookie` | Get, set, or delete cookies |
| `history` | Go back, forward, or refresh the page |
| `viewport` | Change viewport size and device scale factor |
| `console` | Capture and read browser console output |
| `dialog` | Handle JS dialogs (alert, confirm, prompt) |
| `emulate` | Emulate mobile device, geolocation, user agent |
| `session` | Save and restore browser session state |
| `bookmark` | Manage Chrome bookmarks (list, create, update, delete, search) |
| `extension` | Manage Chrome extensions (list, enable, disable, info) |
| `security_scan` | Comprehensive security assessment (headers, XSS, mixed content, SSL/TLS) |
| `speech_to_text` | Transcribe video/audio from any page using local Whisper (offline, no API key). Optional auto-translate |
| `translate` | Translate text offline using argos-translate (no API key) |

## AI-Native Semantic Selectors

Use human-readable descriptions instead of CSS selectors:

```
click  selector: "semantic:login button"
fill   selector: "semantic:email", value: "user@example.com"
click  selector: "semantic:submit"
```

Resolution strategy (tried in order):
1. `aria-label` exact match
2. `placeholder` / `title` match
3. Text content match on buttons, links, labels
4. Role + name match
5. Input type + label association

## Speech-to-Text (Local Whisper)

Transcribe video and audio from any website **offline** — no API key required.

**Supported platforms:** YouTube, X/Twitter, TikTok, Instagram, Vimeo, and 100+ sites via `yt-dlp`.

### Setup

```bash
# 1. Install Python dependencies
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install faster-whisper flask

# 2. Install system dependencies (macOS)
brew install ffmpeg yt-dlp

# Linux
# sudo apt install ffmpeg yt-dlp
```

### Start the Whisper Server

```bash
# Terminal 1: Start daemon
npm start

# Terminal 2: Start local Whisper server
python whisper-server.py

# Or with specific model
WHISPER_MODEL=small python whisper-server.py
```

The server runs on `http://127.0.0.1:5001` by default.

### Usage

```bash
# Navigate to a video page
navigate url: "https://x.com/username/status/1234567890"

# Transcribe the video
speech_to_text tabId: <tab_id> language: "en"
```

**Parameters:**
- `tabId` — Tab with the video (optional, auto-detects active tab)
- `videoUrl` — Direct video URL (optional, auto-detected from page)
- `language` — Language code for transcription (e.g. `"en"`, `"ru"`, `"zh"`)

**Models available:** `tiny`, `base` (default), `small`, `medium`, `large` — larger = more accurate but slower.

**Performance on M1 Mac:**
- `base` model: ~70s for 25min audio
- `small` model: ~2min for 25min audio (recommended)

### Auto-Translate

Add `translateTo` parameter to automatically translate the transcript:

```bash
speech_to_text tabId: <tab_id> language: "en" translateTo: "ru"
```

Or use the standalone `translate` tool for any text:

```bash
translate text: "Hello world" from: "en" to: "ru"
```

**Supported language pairs:** Any pair supported by argos-translate (commonly: en↔ru, en↔zh, en↔es, en↔fr, en↔de, etc.)

## Recording & Playback

Record a session for debugging or replay:

```bash
# Start daemon with recording enabled
RECORDING=1 npm start

# Replay a recorded session
node replay.js recording-2026-05-18.jsonl

# Dry-run (print without executing)
node replay.js recording-2026-05-18.jsonl --dry-run
```

## Multi-Browser Sync

Connect multiple browsers simultaneously. The daemon routes tool calls to the least-loaded extension:

```bash
# Each extension sends a browserId in its hello message
# Target a specific browser via _browserId in tool args:
click  selector: "#btn", _browserId: "firefox-session-1"
```

Health endpoint shows connected browsers:
```bash
curl http://127.0.0.1:10087/health
# → { "browsers": { "default": 1, "firefox-session-1": 1 } }
```

## Remote Browser Cloud

Connect to BrowserStack or Sauce Labs:

```bash
# BrowserStack
node cloud.js --provider browserstack --user $BROWSERSTACK_USER --key $BROWSERSTACK_KEY

# Sauce Labs
node cloud.js --provider saucelabs --user $SAUCE_USERNAME --key $SAUCE_ACCESS_KEY
```

## Security Scan Tool

Automated security assessment of the current page:

```bash
# Basic security scan
security_scan

# Detailed scan with full report
security_scan  detailed: true
```

**Checks performed:**
- Security headers (CSP, X-Frame-Options, HSTS)
- Mixed content detection
- XSS vulnerability patterns
- SSL/TLS configuration
- External scripts with SRI
- Cookie analysis
- Form security
- Iframe sandboxing
- Risk score calculation (LOW/MEDIUM/HIGH/CRITICAL)

**Advanced Deep Scans:**
- **CSP Bypass Analysis** - unsafe-eval, unsafe-inline, wildcard domains, data: URIs, missing directives
- **CORS Misconfiguration** - fetch/XHR patterns, wildcard origins, reflective origins
- **DOM XSS Sinks** - innerHTML, outerHTML, insertAdjacentHTML, eval(), setTimeout(), location.hash
- **Service Worker Security** - scope issues, cache poisoning, offline bypass
- **WebSocket Security** - connection patterns, origin validation, authentication
- **Timing Attack Detection** - Date.now(), performance.now(), setTimeout/setInterval patterns
- **Prototype Pollution** - __proto__, constructor.prototype, Object.assign, JSON.parse
- **SSRF Patterns** - fetch with user input, location assignment, API endpoint patterns

**Bug Bounty Top Findings (HIGH PRIORITY):**
- **IDOR Pattern Detection** - /api/users/{id}, sequential IDs, UUID predictability
- **CSRF Token Analysis** - token presence, length, entropy, predictability
- **Session Cookie Security** - Secure, HttpOnly, SameSite, session ID length
- **Authentication Flow Analysis** - login forms, MFA, password reset, autocomplete
- **Authorization Patterns** - admin endpoints, role-based access, API key exposure
- **Parameter Tampering** - hidden fields, cookie parameters, sensitive data

**Additional Security Checks (MEDIUM/LOW PRIORITY):**
- **Cache Headers** - Cache-Control, cache poisoning vectors
- **Advanced Clickjacking** - pointer events, drag-and-drop
- **API Endpoint Discovery** - REST API, GraphQL introspection
- **Race Conditions** - async operations, timing analysis
- **Business Logic Patterns** - price/discount manipulation, cart abuse
- **Supply Chain Analysis** - CDN usage, external library fingerprinting
- **Error Handling** - debug statements, information disclosure
- **File Upload Security** - upload forms, file type validation, multiple uploads
- **Rate Limiting** - rate limit indicators, throttling patterns
- **DOM XSS Advanced** - location.hash, postMessage, self-XSS
- **Web Cache Poisoning** - header-based poisoning, cache key confusion
- **GraphQL Security** - introspection, query depth, N+1 patterns

**OWASP WSTG Coverage:**
- **Information Gathering** - technology detection, framework identification, comment analysis
- **SSL/TLS Analysis** - protocol check, secure context, HSTS validation
- **SQL Injection Detection** - pattern matching, form parameter analysis
- **Command Injection Detection** - shell execution patterns, form field analysis
- **JWT Token Analysis** - token detection in cookies, algorithm patterns
- **OAuth/OpenID Analysis** - provider detection, endpoint analysis, redirect_uri validation
- **Mass Assignment Detection** - framework patterns, form field count analysis

**Logical Chain Analysis (NEW):**
- **Vulnerability Chaining** - Identifies how vulnerabilities connect and amplify each other
- **Step-by-Step Attack Paths** - Generates detailed attack paths from entry to impact (up to 5+ steps)
- **Correlation Engine** - Finds relationships between different security issues
- **Context-Aware Scoring** - Adjusts risk based on site context and business logic
- **Neural Network Output** - Structured format optimized for AI/ML analysis
- **Defense-in-Depth Assessment** - Evaluates security layer effectiveness
- **Cascading Effects Analysis** - Traces how one vulnerability triggers others

**Deep Behavioral Analysis (NEW):**
- **Behavioral Fingerprinting** - Event listeners, timers, dynamic imports, eval usage
- **Shadow DOM / Web Components** - Open shadow roots, unregistered custom elements
- **Cross-Origin Communication** - postMessage validation, BroadcastChannel, wildcard origins
- **Cryptographic Analysis** - Math.random() usage, custom crypto, WebCrypto detection
- **Memory Leak Detection** - Interval leaks, event listener leaks
- **Request Interception** - fetch/XHR override detection
- **Resource Timing** - Third-party resource enumeration, internal endpoint discovery
- **Performance Timing** - High-resolution timing attack vectors
- **Modern Web APIs** - WebRTC, Beacon API, Payment API, Permissions API, Trusted Types
- **PWA / Background APIs** - Service workers, background sync, periodic sync, push notifications
- **Hardware APIs** - WebSerial, WebUSB, WebBluetooth, WebNFC, sensors, gamepad
- **Privacy Sandbox APIs** - Topics API, Attribution Reporting, Private State Tokens, Fenced Frames

**Output includes:**
- Risk level and score (with chain analysis context)
- Detailed findings by category
- Vulnerability chains and attack paths
- Correlations between issues
- Step-by-step exploitation analysis
- Prioritized recommendations with examples
- Neural network friendly feature vectors

## Security

The daemon includes built-in security features:

- **Origin validation** — only `chrome-extension://` origins for extensions, `localhost` for controllers
- **Rate limiting** — 100 msg/10s window, 20 msg/s burst per IP (localhost exempt)
- **Anti-replay** — nonce + timestamp validation on register messages
- **Auth token** — optional `WEBBRIDGE_TOKEN` env var for Bearer auth

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
WEBBRIDGE_WS_URL=ws://192.168.1.100:10086/ws node mcp-server.js
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
├── whisper-server.py         # Local Whisper server for speech-to-text
├── cli.js                    # CLI (setup, daemon, mcp, doctor)
├── setup-mcp.js              # MCP registration script
├── package.json
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
