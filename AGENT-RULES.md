# OpenWeb — Agent Instructions (OpenAI Codex / o3 / GPT-4o)

> This file is automatically loaded by **OpenAI Codex CLI** and **GitHub Copilot Coding Agent**
> as project-level agent instructions. It configures how you use OpenWeb MCP tools.

You are an expert AI agent driving a browser using **OpenWeb** MCP tools. To achieve 100% success rate in your browser automation tasks, you MUST strictly adhere to the following decision-making workflows, syntax guidelines, and recovery strategies.

---

## Core Browser Automation Pipeline

```
1. navigate(url)          → open the target URL
2. snapshot()             → capture accessibility tree + get @e refs
3. click/fill(@eN)        → interact using refs (NOT CSS selectors)
4. snapshot() / get_text() → verify the action succeeded
```

**Why this order**: `snapshot` after `navigate` gives you @e refs — the only stable handles for interaction. Step 4 MUST use `snapshot` or `get_text` (not `screenshot`), because you cannot see images.

---

## 1. Navigation

**Tool**: `navigate`

```json
{ "url": "https://example.com", "waitUntil": "domcontentloaded" }
```

* `waitUntil: "domcontentloaded"` is preferred on SPAs — faster than full load, and snapshot only needs the DOM tree.
* `navigate` reuses the current tab by default. Use `{ "newTab": true }` only when you need a fresh isolated context (e.g. after errors, or for cross-origin workflows).
* **After every navigate, read `tab.url` from the response** — many sites encode search state in the URL. This is your key to discovering URL-as-state patterns (see §7).

---

## 2. Snapshot (CRITICAL — Always Run After Navigation)

**Tool**: `snapshot`

```json
{ "format": "text", "interactiveOnly": true }
```

**Why**: Returns refs like `@e1`, `@e2`, `@e15` — use these for ALL subsequent actions. CSS selectors are brittle on SPAs; @e refs are stable within a session.

* `interactiveOnly: true` filters to clickable/fillable elements only (saves tokens).
* `selector: "#main-form"` — scope tree to a specific DOM subtree when the page is large.

---

## 3. Click & Fill

**Tool**: `click`, `fill`

```json
{ "selector": "@e12" }                              // standard DOM click
{ "selector": "@e12", "physical": true }            // OS-level click (fallback)
{ "selector": "@e5",  "value": "hello@mail.com" }  // fill an input
```

**Fallback**: `click(@eN)` fails → `click(@eN, physical: true)`.

**Why physical click**: Some elements are intercepted by JS event handlers that ignore synthetic CDP clicks. Physical click goes through the OS input stack and triggers native events.

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

```
// WRONG ❌
session_manager({action: "save"}) → ERROR: Unknown tool

// RIGHT ✅
discover_tools({category: "session"})     // discover first
session_manager({action: "save", name: "checkout-session"})  // then use
```

---

## 5. Reading Page Content

| Goal | Tool | Params | Why |
|---|---|---|---|
| Clean visible text | `get_markdown` | default | Strips non-content markup |
| Audit metadata/scripts | `get_text` | `format: "structured"` | Preserves structure |
| Specific element HTML | `get_text` | `selector: "@e1", format: "html"` | Scoped to one element |
| Verify field values | `evaluate` | `document.querySelector(...).value` | Reads raw DOM state |

**Do NOT use `screenshot` for verification** — you cannot see images. Use `snapshot` (to check @e presence/state) or `get_text` (to read values).

### snapshot vs get_text — when to use what

| Situation | Use | Why |
|---|---|---|
| You need **@e refs** to click/fill/interact with elements | `snapshot` | Only `snapshot` returns stable `@eN` handles for actions |
| You need to **read visible text content** (prices, titles, descriptions) | `get_text` or `get_markdown` | Snapshot only shows element labels/types/roles, not inner text |
| Page just loaded, you don't know what's there yet | `snapshot` first | Gives you the layout + @e refs; then decide if you need text |
| Snapshot shows the page but **no useful @e refs** (e.g. ticket cards rendered as plain divs) | `get_text` next | Text extraction finds content that the accessibility tree omits |
| You need to **verify a field's value** after fill | `evaluate` | Reads raw DOM value, not just visible label |
| You need to **check if an element appeared/disappeared** | `snapshot` | Quick — look for the @e ref in the tree |

**Rule of thumb**: `snapshot` for structure + interaction; `get_text` for content. If snapshot shows an element exists but you can't read its data, call `get_text`.

---

## 6. Wait

### 6a. Prefer `type: "selector"` — NEVER use `type: "network_idle"`

`network_idle` is **bugged** — it falsely counts lazy-loaded and data-URI images as pending requests, often timing out on modern SPAs.

| Type | When | Why |
|---|---|---|
| `selector` | ✅ ALWAYS (default) | Waits for a specific DOM node. Deterministic, fast. |
| `navigation` | After clicking a link/form that navigates | Listens for `tabs.onUpdated complete`. |
| `network_idle` | ❌ Avoid | Buggy image detection → false pending → timeout. |

```json
// CORRECT — wait for a specific known element
{ "type": "selector", "selector": "[data-testid='ticket-card'], .search-result" }

// CORRECT — wait for navigation after click
{ "type": "navigation" }

// WRONG — will likely timeout
{ "type": "network_idle" }
```

### 6b. Timeout = re-evaluate, NOT failure

If `wait(type: "selector")` times out:
1. Run `snapshot()` to see what's actually on the page
2. If the page is loading longer, choose a selector that actually appears (check snapshot tree)
3. If the page shows error/empty state, switch approach (degradation ladder, §8)

---

## 7. URL as State (CRITICAL)

Many sites encode search parameters, filters, and pagination in the URL. Navigating directly to a constructed URL is always more reliable than filling forms.

### How to discover URL patterns (no hardcoded hints)

**Method A — execute once, read the URL**:
```
1. navigate(site)
2. snapshot()                       → get @e refs
3. fill(@e17, "query") / click(@e12 submit)  → perform search via form
4. read tab.url from response       → URL now contains the search state
5. generalise the pattern          → e.g. /search?q={query}&page={n}
   for reuse in future navigations
```

**Method B — websearch**:
```
websearch({query: "aviasales URL format search params"})
→ extract pattern from docs/blogs
```

**Method C — infer from semantic structure**:
Common URL conventions:
- Flights: `/search/{origin}{date}{destination}{date}` or `?from=X&to=Y&date=Z`
- E-commerce: `/catalog/{category}` or `?q=search&sort=price`
- Listings: `/?page={n}&filters={...}`

### When to use direct URL vs form

| Situation | Approach | Why |
|---|---|---|
| URL pattern is known or discovered | `navigate(url)` — **preferred** | Skips all form interaction fragility |
| URL pattern is unknown / one-off | Form via `select_autocomplete` | Let the site build the URL, then read it |
| Form has complex multi-step UI | Direct URL always | Date pickers, combo-boxes are SPA-brittle |

---

## 8. Degradation Ladder (CRITICAL)

### When to descend — the trigger rule

**Every level must pass verify-after-action (§11).** If verification fails:
- **1st attempt fails** → retry **once** at the same level (e.g. longer delay, physical click, different selector)
- **2nd attempt also fails** → **descend one level immediately**. Do NOT retry the same approach a third time.

```
Action at Level N
  → Verify fails (snapshot/get_text doesn't match expectation)
  → Retry once at Level N
  → Verify fails again
  → DESCEND to Level N+1
```

**Why a single retry**: Some failures are transient (network glitch, animation timing). But retrying more than once is chasing ghosts — the approach itself is wrong.

### The levels

```
Level (a)  navigate(direct URL)        ← always try first if pattern is known
               ↓ verify fails 2×
Level (b)  select_autocomplete(@eN)    ← combo-box / autocomplete fields
               ↓ verify fails 2×
Level (c)  click(@eN) → send_keys({text, perChar: true})
             → wait → ArrowDown → Enter   ← manual keystroke simulation
               ↓ verify fails 2×
Level (d)  evaluate(JS to set value)   ← raw DOM manipulation
```

**Why this order**: Each level trades reliability for flexibility. (a) is fastest and most reliable because it skips all UI. (d) is a last resort because raw JS may not trigger the site's event listeners.

### Form-specific descent triggers

| Situation | Trigger | Descend to |
|---|---|---|
| `fill(@eN, value)` returns `comboboxDetected: true` | Immediate — no retry needed, fill didn't fire keystrokes | Level (b): `select_autocomplete(@eN, text)` |
| `select_autocomplete` returns empty `selectedValue` | Retry with longer delay; if still empty | Level (c): manual `click(@eN)` → `send_keys` perChar → ArrowDown → Enter |
| `fill()` returns success but `actualValue` is wrong | Retry once with `physical: true`; if still wrong | Level (c): clear field → perChar `send_keys` |
| All form approaches fail 2× each | Impossible to submit via UI | Level (a): try to find a direct URL scheme (websearch, or read `tab.url` from a manual navigation) |

**Snapshot refs go stale** — if you get `element not found: @eN` at ANY level, run `snapshot()` again first before retrying or descending.

---

## 9. Combo-Box / Autocomplete Input

### Recognition

Detect combo-box fields by:
- `role="combobox"` or `aria-autocomplete="list"` in snapshot (@e shows as `[combobox @eN]`)
- `fill()` response includes `comboboxDetected: true`

### Site-agnostic recipe

```json
// Level (b) — single atomic call
{ "selector": "@e17", "text": "Berlin", "delay": 100 }

// With specific item selection from dropdown
{ "selector": "@e17", "text": "Berlin", "selectValue": "Berlin, Germany" }
```

**Why `select_autocomplete` works**: It fires per-character `input` events that trigger the field's internal debounce-search → renders dropdown → selects the item. `fill()` sets the value directly without keystrokes, so the autocomplete logic never fires.

**Why prefer it over manual send_keys**: Encapsulates 4 fragile steps (focus → perChar type → wait dropdown → select) into one call with error handling and value readback.

### Verify selection

After `select_autocomplete`:
1. Check `selectedValue` in response — this is the element's `.value` after selection
2. If empty or wrong → drop to Level (c) degradation
3. Re-snapshot to confirm field value changed in the accessibility tree

---

## 10. Semantic Input Validation

### General principle

A parameter must match the semantic type of the field it targets. Do NOT hardcode lookup tables.

| User says | Field type | What you do |
|---|---|---|
| "Билеты в Словакию" | Airport/autocomplete | Словакия is a country → expand to its major airport(s) via own knowledge or `websearch` |
| "Отель в Париже" | City autocomplete | Paris is a city → use "Paris" directly; no expansion needed |
| "Товары категории электроника" | Category filter | "Электроника" might be a facet value → infer from URL pattern or snapshot labels |

### Resolution order

1. **Own knowledge** — if you confidently know the mapping (e.g. London → LHR/LGW/STN), use it
2. **websearch** — if unsure, search for "major airport in Slovakia IATA code"
3. **Site's own autocomplete** — type "Словакия" into the field and see what the dropdown suggests; pick the airport option

**Never hardcode IATA codes, city→airport mappings, or category IDs** — they change, and the agent should be self-sufficient.

---

## 11. Verify-After-Action (CRITICAL)

After EVERY action that modifies page state, verify it took effect **before** proceeding to the next action.

### Verify tool choice

| After action | Verify with | What to check |
|---|---|---|
| `fill()` / `select_autocomplete()` | Response fields (`actualValue`, `selectedValue`) | Value matches expected input |
| `select_autocomplete()` | `selectedValue` in response | Not empty, matches chosen item |
| `click(submit)` that navigates | `snapshot()` on new page | URL changed, expected content loaded |
| `click(button)` that toggles UI | `snapshot()` | Expected new @e refs appeared |
| Any form interaction | `snapshot()` or `evaluate` | Field values are correct before submit |

### Never chain more than 2 action tools without verification

```
// WRONG ❌ — 3 actions, no verify
fill(@e5, "Paris") → fill(@e7, "2026-06-15") → click(@e9)

// RIGHT ✅ — verify after each fill
fill(@e5, "Paris") → check actualValue → fill(@e7, "2026-06-15") → snapshot() → click(@e9)
```

### Do NOT use screenshot for verification

You cannot see images. `screenshot` is only useful when you intend to show the result to a human user at the very end.

---

## 12. Error Recovery

| Error Message | Cause | Fix |
|---|---|---|
| `element not found: @eN` | SPA re-rendered, ref invalid | Run `snapshot()` again |
| `element has no layout box` | Element hidden / zero-size | Use `physical: false` or hover parent |
| `Unknown tool: X` | Tool not yet unlocked | `discover_tools({category: "..."})` first |
| `send_keys: unknown key "..."` | Unicode char sent via `keys` param | Use `send_keys({text: "..."})` instead of `keys` for non-latin text |
| `fill()` returns `comboboxDetected: true` | Autocomplete field detected | Drop to Level (b): `select_autocomplete()` |
| `select_autocomplete` returns empty `selectedValue` | Dropdown didn't appear | Increase `delay` (try 200), re-snapshot, drop to Level (c) |
| `wait()` times out | Wrong selector, or page state unexpected | Re-snapshot → pick real selector from tree → try again, or switch approach |
| Page shows error state | Invalid URL, blocked request | Drop to Level (b) or (c), or `navigate` with `newTab: true` |

---

## 13. Few-Shot: Reasoning Trace

Below are examples of the **reasoning process** you should follow, not just the final answer.

### Example 1: Flight search for "Москва → Словакия"

```
User: найти билеты с москвы в словакию

Reasoning:
1. Это поиск авиабилетов. Нужен сайт для поиска (Aviasales).
2. Пользователь сказал "Словакия" — это страна, не аэропорт.
   → Применяю семантическую валидацию (§10): страну нужно развернуть в аэропорт.
   → Знаю, что главный аэропорт Словакии — Братислава (BTS).
   → Если бы не знал — websearch("major airport Slovakia IATA").
3. Пытаюсь найти URL-схему Aviasales (у меня нет хардкода).
   → Либо вспоминаю (знаю по прошлым сессиям), либо websearch("aviasales search URL format").
   → Или делаю один поиск через форму, читаю tab.url — вижу паттерн /search/{from}{date}{to}{date}.
4. Строю URL: /search/MOW1506BTS2206.
5. Выбираю Level (a) — прямой URL. Если не сработает, упаду на (b) форму.

Action: navigate({url: "https://www.aviasales.ru/search/MOW1506BTS2206"})
```

### Example 2: Autocomplete field on an unknown site

```
Snapshot shows: [combobox @e12] name="Airport"
User wants: "Berlin"

Reasoning:
1. Это combobox (role=combobox) — fill() не сработает.
2. Пытаюсь Level (b): select_autocomplete(@e12, "Berlin").
3. Если selectedValue пустой → dropdown не появился.
   → Увеличиваю delay, пробую selectValue="Berlin, Germany".
   → Если всё ещё пусто → Level (c): click(@e12) → send_keys perChar.
4. После успеха → snapshot для verify перед следующим шагом.

Action: select_autocomplete({selector: "@e12", text: "Berlin", delay: 150})
```

### Example 3: Wait timeout

```
wait(type: "selector", selector: ".results") → timeout after 10s

Reasoning:
1. Timeout ≠ failure. Переоцениваю: re-snapshot.
2. Snapshot показывает: на странице спиннер загрузки, класс .spinner.
   → Значит, данные ещё грузятся.
   → Жду другой селектор: wait(type: "selector", selector: ".ticket-card", timeout: 20000).
3. Если повторный wait снова timeout → snapshot показывает ошибку или пустую страницу.
   → Возможно, URL неправильный.
   → Падаю на Level (b): открываю главную и заполняю форму.

Action: snapshot() → увидел спиннер → wait({type: "selector", selector: ".ticket-card", timeout: 20000})
```

---

## Summary: Decision Flow

```
1. Получил задачу
   ↓
2. Определяю тип сайта/формы
   ↓
3. Есть известный URL-паттерн?
   ├─ Да → navigate(direct URL) → Level (a)
   └─ Нет → ищу/вывожу паттерн через form-submit-read-URL или websearch
   ↓
4. Взаимодействую с формой
   ├─ Простое поле → fill(@eN, value)
   ├─ Комбобокс → select_autocomplete(@eN, text)
   └─ Сложный UI → degradation ladder
   ↓
5. Verify после каждого действия
   ├─ snapshot() / get_text() / evaluate()
   └─ НЕ screenshot (агент не видит)
   ↓
6. Ошибка?
   ├─ Stale ref → re-snapshot
   ├─ Timeout → re-snapshot, переоценить селектор
   └─ Другое → degradation ladder
   ↓
7. Готово → показать результат пользователю текстом
```
