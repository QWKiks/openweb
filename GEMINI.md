# OpenWeb — Gemini CLI Project Instructions

> This file is automatically loaded by **Gemini CLI** (`gemini` command) as project-level context.
> It teaches you how to use the OpenWeb MCP browser automation tools correctly.

You are an expert AI agent driving a browser using **OpenWeb** MCP tools. To achieve 100% success rate in your browser automation tasks, you MUST strictly adhere to the following decision-making workflows, syntax guidelines, and recovery strategies.

---

## 1. The Core Browser Automation Flow

Whenever you need to interact with a website, always follow this step-by-step priority pipeline:

```
navigate → snapshot → click/fill → screenshot (verify)
```

### Step 1: Navigation
* **Tool**: `navigate`
* **Rule**: Always start by navigating to the target URL. If you need a clean environment, set `newTab: true`.
* **Speed tip**: Use `waitUntil: "domcontentloaded"` for faster resolution on heavy SPAs.

### Step 2: Accessibility Inspection (CRITICAL)
* **Tool**: `snapshot`
* **Rule**: **ALWAYS run `snapshot` immediately after any page load or SPA state change.**
* **Why**: `snapshot` returns an accessibility tree with element references (like `@e1`, `@e2`). Operating via these references is 10X faster, more stable, and less error-prone than guessing CSS selectors.
* **Token tip**: Use `format: "text"` (default) for compact output. Use `interactiveOnly: true` to get only clickable elements.

### Step 3: Execution
* **Tool**: `click` or `fill`
* **Rule**: Execute actions using the `@e` refs returned from the previous `snapshot` call.
  * *Example*: `click(selector: "@e12")`, `fill(selector: "@e5", value: "hello")`

---

## 2. Interaction & Fallback Guidelines

### Click Fallback Strategy
1. **Try Standard DOM Click first** (default):
   * `click(selector: "@e1")` (fast and handles 95% of standard buttons).
2. **If standard click fails** (e.g. page doesn't react, or it's a Canvas/WebGL element):
   * **Switch to Physical CDP Click**: `click(selector: "@e1", physical: true)`.

### Text & Source Extraction Strategy
* **To read readable content** (articles, text fields, tables):
   * Use `get_text(format: "text")` (default). Returns clean visible page text.
* **To audit metadata / scripts / links**:
   * Use `get_text(format: "structured")`. Returns structured JSON.
* **To read raw markup of a specific element**:
   * Use `get_text(selector: "@e1", format: "html")`. Avoid full-page raw HTML.

---

## 3. Tool Discovery — How to Unlock Specialized Tools (CRITICAL)

**IMPORTANT**: At startup, you only see 7 core tools. Many powerful specialized tools are hidden to save tokens. You MUST use `discover_tools` to unlock them when needed.

### When you MUST call `discover_tools` first:

| You want to do... | Call `discover_tools(category: ...)` |
|---|---|
| Manage cookies, localStorage, session state | `"session"` |
| Intercept requests, monitor WebSocket traffic, export HAR | `"network"` |
| Check console errors, emulate devices, handle dialogs | `"diagnostics"` |
| Run SEO, accessibility, performance, security audits | `"audits"` |
| Get element coordinates, use keyboard, hover, drag, PDF | `"advanced"` |
| Not sure which category | `"all"` |

### Rule: Never try to call a tool that isn't in your current tool list without first calling `discover_tools`.

**Wrong approach** ❌:
```
session_manager({action:"save"}) → ERROR: Unknown tool: session_manager
```

**Correct approach** ✅:
```
Step 1: discover_tools(category: "session")
         → Returns: session_manager, cookie, local_storage schemas + usage examples
Step 2: session_manager(action: "save", name: "my-session")
         → Works perfectly
```

---

## 4. Auditing & Analysis Guidelines

* **General Audits**: Use the `audit` tool with appropriate `type`:
  * `type: "seo"` — titles, OG cards, headings
  * `type: "accessibility"` — contrast, labels, focus states
  * `type: "performance"` — Core Web Vitals and load times
  * `type: "links"` — dead/broken links check
* **Security**: Use `security_scan(detailed: true)` — checks CSP, CORS, XSS, CSRF.

---

## 5. Error Recovery Decisions

* **Error: "click (physical): element not found: @eX"**
  * *Cause*: SPA redirect or dynamic DOM update destroyed the ref.
  * *Remedy*: **Run `snapshot` again** to get fresh `@e` refs.
* **Error: "click (physical): element has no layout box"**
  * *Cause*: Element is invisible or zero-sized.
  * *Remedy*: Try `click(physical: false)`, or hover over parent first.

---

## 6. Sensory-Motor Verification Loop (CRITICAL)

* After submitting a form or clicking a link, **MUST immediately run `wait(type: 'network_idle')` or take a `screenshot`** to verify success.
* Never execute more than **2 consecutive action tools** without calling `snapshot` or `screenshot`.
* If you get a ref resolution failure, run `snapshot` again — do NOT guess selector variations.
