# OpenWeb — Antigravity IDE Agent Rules

> This file is automatically loaded by **Antigravity IDE** as project-level context.
> It configures browser automation behavior for the OpenWeb MCP server.

You are an expert AI agent driving a browser using **OpenWeb** MCP tools. To achieve 100% success rate in your browser automation tasks, you MUST strictly adhere to the following decision-making workflows.

---

## 1. The Core Browser Automation Flow

Always follow this exact pipeline:

```
navigate(url) → snapshot() → click/fill(@eN) → screenshot/wait (verify)
```

### Step 1: navigate
```json
{ "url": "https://example.com", "waitUntil": "domcontentloaded" }
```

### Step 2: snapshot (MANDATORY after every navigation)
```json
{ "format": "text", "interactiveOnly": true }
```
Returns refs: `@e1`, `@e2`, `@e15` — use these for all subsequent actions.

### Step 3: click / fill
```json
{ "selector": "@e12" }                             // standard click
{ "selector": "@e12", "physical": true }           // physical fallback
{ "selector": "@e5",  "value": "hello@mail.com" } // fill input
```

---

## 2. Tool Discovery — CRITICAL

**You start with only 7 core tools.** Before using any specialized tool, call `discover_tools` first.

| Need | Category |
|---|---|
| Cookies, localStorage, session state | `"session"` |
| Request interception, WebSocket, HAR | `"network"` |
| Console errors, device emulation, dialogs | `"diagnostics"` |
| SEO, accessibility, performance, security audits | `"audits"` |
| Element bounds, keyboard, hover, drag, PDF | `"advanced"` |

**Wrong ❌**: `session_manager()` → ERROR: Unknown tool  
**Right ✅**: `discover_tools({category:"session"})` → then `session_manager()`

---

## 3. Screenshot & Vision

```json
{ "lowRes": true }               // default 800px max width — saves vision tokens
{ "x": 100, "y": 200, "width": 400, "height": 300 } // crop to specific region
{ "selector": "@e5" }           // screenshot of specific element
```

---

## 4. Auditing

```json
// Single unified audit tool:
{ "type": "seo" }           // titles, OG, headings
{ "type": "accessibility" } // contrast, labels, focus
{ "type": "performance" }   // Core Web Vitals
{ "type": "links" }         // dead/broken links

// Security:
{ "detailed": true }        // → security_scan
```

---

## 5. Error Recovery

| Error | Fix |
|---|---|
| `element not found: @eN` | Run `snapshot()` again (SPA re-render) |
| `element has no layout box` | Use `physical: false` or hover parent |
| `Unknown tool: X` | Call `discover_tools(category: "...")` first |

---

## 6. Verification Loop (CRITICAL)

* After every form submit / link click / navigation → run `wait(type: "network_idle")` or `screenshot()`.
* Never chain more than **2 consecutive actions** without a verification step.
* On ref resolution failure → run `snapshot()` again, do NOT guess selectors.
