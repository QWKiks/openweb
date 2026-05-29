# OpenWeb — Kimi AI Agent Instructions

> This file provides project-level context for **Kimi** (Moonshot AI) when working
> with the OpenWeb MCP browser automation server.

You are an expert AI agent driving a browser using **OpenWeb** MCP tools. To achieve 100% success rate in your browser automation tasks, you MUST strictly adhere to the following decision-making workflows.

---

## Core Pipeline

```
1. navigate(url)          → open page
2. snapshot()             → get accessibility tree + @e refs
3. click/fill(@eN)        → use refs (NOT CSS selectors)
4. screenshot() or wait() → verify result
```

---

## 1. navigate

```json
{ "url": "https://example.com", "waitUntil": "domcontentloaded", "newTab": true }
```

---

## 2. snapshot — ALWAYS run after navigation

```json
{ "format": "text", "interactiveOnly": true }
```

Returns compact text tree with element refs like `@e1`, `@e8`, `@e23`.  
Use `selector: "#form"` to limit to a DOM subtree.

---

## 3. click / fill

```json
{ "selector": "@e12" }
{ "selector": "@e12", "physical": true }  // fallback if standard click fails
{ "selector": "@e5", "value": "text" }   // fill input field
```

---

## 4. Tool Discovery — UNLOCK SPECIALIZED TOOLS

**Only 7 tools are available at startup to save tokens.**  
Run `discover_tools` before using any specialized tool:

```json
{ "category": "session" }     // session_manager, cookie, local_storage
{ "category": "network" }     // intercept, websocket_monitor, har_export
{ "category": "diagnostics" } // console, dialog, emulate, scroll, wait
{ "category": "audits" }      // audit, security_scan, coverage
{ "category": "advanced" }    // get_element_bounds, humanize, key_type, hover, save_as_pdf
{ "category": "all" }         // show all specialized tools
```

**Rule**: Never call an unlisted tool directly. Always `discover_tools` first.

---

## 5. Reading Content

| Goal | Tool | Key Params |
|---|---|---|
| Clean readable text | `get_markdown` | — |
| Page metadata/scripts | `get_text` | `format: "structured"` |
| Element HTML | `get_text` | `selector: "@e1", format: "html"` |
| Overview screenshot | `screenshot` | `lowRes: true` (default) |
| Focused area crop | `screenshot` | `x, y, width, height` |

---

## 6. Auditing

```json
{ "type": "seo" }           // SEO audit
{ "type": "accessibility" } // A11y check
{ "type": "performance" }   // Core Web Vitals
{ "type": "links" }         // Broken links
// Security scan:
{ "detailed": true }        // via security_scan tool (discover first!)
```

---

## 7. Error Recovery

| Error | Cause | Fix |
|---|---|---|
| `element not found: @eN` | SPA re-render | Run `snapshot()` again |
| `element has no layout box` | Hidden element | `physical: false` or hover parent |
| `Unknown tool: X` | Tool not unlocked | `discover_tools({category:"..."})` |

---

## 8. Verification (CRITICAL)

* After every navigation / form submit → verify with `screenshot()` or `wait(type: "network_idle")`.
* Max **2 consecutive action tools** without a verification step.
