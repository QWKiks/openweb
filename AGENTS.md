# OpenWeb — Agent Instructions

> Automatically loaded by **OpenAI Codex CLI** and **GitHub Copilot Coding Agent**.

You are an expert AI agent driving a browser via OpenWeb MCP tools.

## Core Pipeline

```
navigate(url) → snapshot() → click/fill(@eN) → snapshot()/get_text()/evaluate()
```

- `snapshot()` after `navigate` gives @e refs — the only stable handles
- Read `tab.url` after every `navigate` — sites encode state in URL
- `waitUntil: "domcontentloaded"` is preferred over full load

## Tool Selection Matrix

### Navigation & URL

| Intent | Tool | Key Params | Quick Verify | Context |
|---|---|---|---|---|
| Open a page | `navigate` | `{url, waitUntil: "domcontentloaded"}` | read `tab.url` | `newTab: true` after errors or cross-origin |
| Navigate + dismiss overlays | `navigate_smart` | `{url, dismissOverlays: true}` | `snapshot()` shows clean page | Reduces roundtrips vs navigate + dismiss_overlay |
| Discover URL pattern | execute search via form | — | read `tab.url` after submit — URL now encodes state | Edge: SPAs may use hash fragments |
| Reuse known URL pattern | `navigate` | direct constructed URL | `snapshot()` shows results | **Preferred** over form interaction |

### Form Interaction

| Intent | Tool | Key Params | Quick Verify | Context |
|---|---|---|---|---|
| Fill plain text input | `fill` | `{selector: "@eN", value}` | `actualValue` matches input | Date fields: YYYY-MM-DD |
| Fill combobox / autocomplete | `select_autocomplete` | `{selector: "@eN", text, delay: 100}` | `selectedValue` not empty | **Hidden** until `discover_tools("advanced")`. If empty → Degradation (c) |
| Manual keystroke entry | `click(@eN)` → `send_keys` perChar | `{text, perChar: true}` → ArrowDown → Enter | `snapshot()` | When autocomplete dropdown won't appear |
| Natural humanized typing | `humanize` | `{selector: "@eN", text}` | `snapshot()` | For React/Vue fields that reject `fill` |
| Set value via JS (last resort) | `evaluate` | JS that sets `.value` and dispatches event | `evaluate` reads back value | May not trigger site's listeners |
| Select `<select>` option | `select` | `{selector, value}` | `evaluate` checks `.value` | — |
| Upload file | `upload` | `{selector, files}` | `snapshot` shows filename | — |
| Solve captcha | `solve_captcha` | `{apiKey}` or auto-detect | `captchas[].solved` is true | **Hidden** until `discover_tools("advanced")`. Uses 2Captcha API |

### Clicking & Pointing

| Intent | Tool | Key Params | Quick Verify | Context |
|---|---|---|---|---|
| Standard DOM click | `click` | `{selector: "@eN"}` | `snapshot()` shows new state | If JS blocks → add `mode: "physical"` |
| Physical OS-level click | `click` | `{selector: "@eN", mode: "physical"}` | `snapshot()` shows new state | Circumvents JS event interceptors |
| Humanized cursor click | `click` | `{selector: "@eN", mode: "humanized"}` | `snapshot()` shows new state | For telemetry-heavy or highly interactive elements |
| Hover to reveal | `hover` | `{selector: "@eN"}` | snapshot shows new elements | Triggers mouseover/enter |

### Reading Content

| Intent | Tool | Key Params | Quick Verify | Context |
|---|---|---|---|---|
| Read visible page text | `get_text` | (no selector) | — | Strips markup |
| Read clean formatted content | `get_markdown` | — | — | Strips non-content elements |
| Read specific element text | `get_text` | `{selector: "@eN"}` | — | — |
| Read metadata / scripts | `get_text` | `{format: "structured"}` | — | Returns JSON |
| Read element raw HTML | `get_text` | `{selector: "@eN", format: "html"}` | — | Avoid full-page HTML |
| Extract computed / JS-derived value | `evaluate` | JS expression returning value | — | Use when data spans multiple DOM nodes or is computed by JS |
| Check element presence / state | `snapshot` | — | look for @e ref in tree | Fast, no text returned |
| Read input field value | `evaluate` | `document.querySelector('...').value` | — | Raw DOM state, not visible label |

### Waiting

| Intent | Tool | Key Params | Context |
|---|---|---|---|
| Wait for element to appear | `wait` | `{type: "selector", selector, timeout}` | Prefer specific: `[data-testid='result'], .search-result` |
| Wait for navigation | `wait` | `{type: "navigation"}` | After clicking links / form submits |

### Device & Special

| Intent | Tool | Key Params | Context |
|---|---|---|---|
| Screenshot (for human only) | `screenshot` | `{format: "jpeg"}` | NEVER for data extraction |
| Export PDF | `save_as_pdf` | `{paper_format: "a4"}` | — |
| Scroll page / element | `scroll` | `{direction, amount}` | — |
| Send key combination | `send_keys` | `{keys: "Enter"}` | For Unicode text, use `send_keys({text})` with `text` param |
| Type Unicode into focused element | `send_keys` | `{text}` | Prefer over `keys` for non-latin |
| Get element coordinates | `get_element_bounds` | `{selector: "@eN"}` | — |
| Drag & drop | `drag_drop` | `{source, target}` | **Hidden** until `discover_tools("diagnostics")` |
| Emulate mobile device | `emulate` | `{cmd: "device", device: "iphone_14"}` | Also supports geolocation & UA overrides |

### Session & Storage (via `state` tool)

| Intent | Tool | Params | Context |
|---|---|---|---|
| Save/restore open tabs | `state` | `{scope: "tabs", cmd: "save"\|"restore"}` | — |
| Manage cookies | `state` | `{scope: "cookies", cmd: "get"\|"set"\|"delete"}` | — |
| Read/write localStorage | `state` | `{scope: "local_storage", cmd: "read"\|"write"\|"delete"}` | — |
| Save/restore full auth state | `state` | `{scope: "all", cmd: "save"\|"restore"}` | Cookies + storage in one call |

### Network (via `network` tool)

| Intent | Tool | Params | Context |
|---|---|---|---|
| Capture HTTP requests | `network` | `{cmd: "start"}` then `{cmd: "list"}` | — |
| Intercept / block / mock requests | `network` | `{cmd: "intercept", action: "add_rule", pattern, ruleAction}` | — |
| Export HAR | `network` | `{cmd: "har_export"}` | — |
| Monitor WebSockets | `network` | `{cmd: "websocket_monitor"}` | — |
| Trace redirect chain | `network` | `{cmd: "redirect_chain", url}` | — |

### Tool Management

| Intent | Tool | Key Params | Context |
|---|---|---|---|
| Unlock hidden tools | `discover_tools` | `{category}` | **Must call before** using hidden tools |
| List all categories | `discover_tools` | `{category: "all"}` | Returns compact overview |
| — diagnostics | `discover_tools("diagnostics")` | unlocks: `drag_drop, design_clone, dom_mutations` | — |
| — audits | `discover_tools("audits")` | unlocks: `audit, security_scan, coverage` | — |
| — advanced | `discover_tools("advanced")` | unlocks: `bookmark, extension, speech_to_text, translate, shadow_dom, iframe_list, service_worker, select_autocomplete, solve_captcha, ...` | — |

---

## Degradation Ladder

When primary tool fails — **retry once, then descend immediately** (do NOT retry same approach 3×):

```
Level (a)  navigate(direct URL)          — skip all UI, fastest
Level (b)  select_autocomplete(@eN)      — autocomplete/combobox
Level (c)  click(@eN) → send_keys perChar → ArrowDown → Enter  — manual keystroke
Level (d)  evaluate(JS to set value)     — raw DOM, last resort
```

If @e ref goes stale → `snapshot()` first, then continue descent.

---

## Error → Fix

| Error | Cause | Fix |
|---|---|---|
| `element not found: @eN` | SPA re-render, ref invalid | `snapshot()` again |
| `element has no layout box` | Element hidden / zero-size | `click({mode: "synthetic"})` or hover parent |
| `Unknown tool: X` | Tool not unlocked | `discover_tools({category})` first |
| `send_keys: unknown key` | Unicode via `keys` param | Use `send_keys({text})` instead |
| `fill()` → `comboboxDetected: true` | Autocomplete field | Degradation Level (b): `select_autocomplete` |
| `select_autocomplete` → empty `selectedValue` | Dropdown not appearing | Increase delay → `snapshot()` → Level (c) |
| `wait()` → timeout | Wrong selector or page not ready | Re-snapshot → pick real selector → retry |
| Page shows error / gibberish | Invalid URL or blocked request | Level (b) or `navigate({newTab: true})` |

---

## Critical Rules

1. **NEVER use `screenshot` for data extraction** — you cannot see images. Use `snapshot` (presence), `get_text` (content), or `evaluate` (computed values).
2. **NEVER use `wait({type: "network_idle"})`** — bugged, always times out. Use `wait({type: "selector"})` or `wait({type: "navigation"})`.
3. **NEVER chain >2 action tools without verify** — after every fill/click/select, `snapshot()` or check response fields before next action.
4. **NEVER hardcode IATA, city→airport, or category IDs** — use own knowledge → websearch → site autocomplete.
5. **COMMIT after every completed task** — format: `type(scope): message` (e.g. `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`). Match repo style.

---

## Confidence Transparency

If a decision relies on **assumption/inference** rather than a verified source (websearch, site autocomplete, documented fact, direct observation), state **confidence level** (low / medium / high) and why:

> - `BTS (medium — capital, but other airports in Slovakia)`
> - `Paris (high — unambiguous well-known city)`
> - `IATA for Košice unknown (low) → will websearch`

---

## Reasoning Trace

### Flight search: "Москва → Словакия"

```
1. "Словакия" is a country → expand to BTS (medium confidence)
2. Try Level (a): construct direct URL /search/MOW1506BTS2206
3. If fails → Level (b): form with select_autocomplete
```

### Wait timeout recovery

```
1. wait(".results") → timeout
2. Re-snapshot → spinner visible → wait(".ticket-card", 20s)
3. Still timeout → page error → drop to form interaction
```

---

## Decision Flow

```
Task → find Intent in Tool Matrix → call Primary Tool → verify
  ↓ error                                                  ↓ fail
  Error→Fix Table                               Retry once → descend Ladder
```
