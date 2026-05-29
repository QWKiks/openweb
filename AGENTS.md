# OpenWeb — Agent Instructions (OpenAI Codex / o3 / GPT-4o)

> This file is automatically loaded by **OpenAI Codex CLI** and **GitHub Copilot Coding Agent**
> as project-level agent instructions. It configures how you use OpenWeb MCP tools.

You are an expert AI agent driving a browser using **OpenWeb** MCP tools. To achieve 100% success rate in your browser automation tasks, you MUST strictly adhere to the following decision-making workflows, syntax guidelines, and recovery strategies.

---

## Core Browser Automation Pipeline

Always follow this exact sequence:

```
1. navigate(url)          → open the target URL
2. snapshot()             → capture accessibility tree + get @e refs
3. click/fill(@eN)        → interact using refs (NOT CSS selectors)
4. screenshot() or wait() → verify the action succeeded
```

---

## 1. Navigation

**Tool**: `navigate`

```json
{ "url": "https://example.com", "waitUntil": "domcontentloaded", "newTab": true }
```

* Use `waitUntil: "domcontentloaded"` for speed on heavy SPAs.
* Use `newTab: true` for clean isolated sessions.

---

## 2. Snapshot (CRITICAL — Always Run After Navigation)

**Tool**: `snapshot`

```json
{ "format": "text", "interactiveOnly": true }
```

* Returns refs like `@e1`, `@e2`, `@e15` — use these for ALL subsequent actions.
* `interactiveOnly: true` filters to only clickable/fillable elements (saves tokens).
* `selector: "#main-form"` — limit tree to a specific DOM subtree.

---

## 3. Click & Fill

**Tool**: `click`, `fill`

```json
{ "selector": "@e12" }                              // standard DOM click
{ "selector": "@e12", "physical": true }            // physical OS-level click (fallback)
{ "selector": "@e5",  "value": "hello@mail.com" }  // fill an input
```

**Fallback rule**: If `click(@eN)` doesn't work → try `click(@eN, physical: true)`.

---

## 4. Tool Discovery — CRITICAL

**At startup you only have 7 core tools.** Before calling ANY specialized tool, run `discover_tools` first.

```json
{ "category": "session" }    // → session_manager, cookie, local_storage
{ "category": "network" }    // → intercept, websocket_monitor, har_export
{ "category": "diagnostics"} // → console, dialog, emulate, scroll, wait
{ "category": "audits" }     // → audit, security_scan, coverage
{ "category": "advanced" }   // → get_element_bounds, humanize, key_type, hover, save_as_pdf
{ "category": "all" }        // → everything
```

**Never call an unknown tool directly** — you will get `ERROR: Unknown tool`.

### Example:
```
// WRONG ❌
session_manager({action: "save"}) → ERROR: Unknown tool

// RIGHT ✅
discover_tools({category: "session"})
→ [read returned schemas]
session_manager({action: "save", name: "checkout-session"})
```

---

## 5. Reading Page Content

| Goal | Tool | Params |
|---|---|---|
| Clean visible text | `get_markdown` | default |
| Audit metadata/scripts | `get_text` | `format: "structured"` |
| Specific element HTML | `get_text` | `selector: "@e1", format: "html"` |
| Screenshot overview | `screenshot` | `lowRes: true` (default, 800px max) |
| Screenshot detail crop | `screenshot` | `x, y, width, height` |

---

## 6. Auditing & Security

```json
// Audit types: "seo", "accessibility", "performance", "forms", "links"
{ "type": "accessibility" }

// Full security scan
{ "detailed": true }  // → security_scan
```

---

## 7. Error Recovery

| Error Message | Cause | Fix |
|---|---|---|
| `element not found: @eN` | SPA re-rendered, ref invalid | Run `snapshot()` again |
| `element has no layout box` | Element hidden / zero-size | Use `physical: false` or hover parent |
| `Unknown tool: X` | Tool not yet unlocked | `discover_tools({category: "..."})` first |

---

## 8. Verification Loop (CRITICAL)

* After EVERY form submit / link click / navigation → **immediately verify** with `screenshot()` or `wait(type: "network_idle")`.
* Never chain more than **2 action tools** without a verification step.
