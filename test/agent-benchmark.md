# OpenWeb AI Agent Benchmark & Challenge

Welcome, AI Agent! This document is an interactive **Sensory-Motor capability benchmark** designed to test how perfectly and robustly you can drive browser automation tools.

To pass this benchmark successfully, you must strictly follow the visual pipeline, tool selection priority, and self-healing recovery strategies configured in this repository.

---

## 🏁 How to Run the Challenge

### Step 1: Open the Sandbox
1. Launch the **OpenWeb daemon** (`npm start`) if it's not already running.
2. Ensure the **OpenWeb Chrome Extension** is connected.
3. Open a **new tab** and navigate to our local Sandbox page:
   * **URL**: `file:///Users/sabir/Desktop/Работа/openweb/test/sandbox/index.html`

### Step 2: Test 1 - Inputs & Delay Waiting
1. Execute `snapshot` to analyze the page and get element refs (`@e`).
2. Populate the **Agent Identity Name** input with `"Claude Agent 3.5"` or `"Cursor Active Driver"`.
3. Select `"Antigravity Level"` from the **Agent Tier Choice** dropdown.
4. Click the **Submit Form Elements** button.
5. **CRITICAL**: The page updates *with a delay of 1.5 seconds*. You must use the `wait` tool (type: `selector` or `network_idle`) to wait until the success message appears:
   * `"🎉 Form validation success! State updated dynamically after delay."`
6. Verify the success message is visible on the page (e.g. via `get_text` or `screenshot`).

### Step 3: Test 2 - Click Fallback (CDP Physical Click)
1. Scroll down to Card 2: **Click Fallback Interceptor**.
2. Locate the **Target Click Button** element.
3. **Try standard DOM click first** (call `click` with default parameters on the button's `@e` ref).
4. **Observe the result**: Standard click will hit the invisible overlay barrier and print a `FAIL` message in red.
5. **Self-Heal**: As instructed by the error recommendation and `.cursorrules`, **switch immediately to a physical mouse click** by executing:
   * `click(selector: "@eX", physical: true)`
6. **Verify success**: Confirm that the success message appears:
   * `"🎉 SUCCESS: Physical mouse click successfully triggered..."`

### Step 4: Test 3 - Diagnostics & Audits
1. Click the red **Trigger Uncaught Console Error** button.
2. Handle the standard browser dialog/alert that appears using the `dialog` tool (accept/dismiss).
3. Retrieve console logs using the `console` tool (filter for `"errors"`) and verify that the simulated error is logged.
4. Run `audit` (type: `"accessibility"` or `"a11y"`) to extract accessibility violations (observe the dark gray text violation).
5. Run `audit` (type: `"links"`) to audit broken links and identify the 404 URL (`https://httpstat.us/404`).

### Step 5: Test 4 - Honeypot Trap & Dynamic Math CAPTCHA
1. Read the math question on the screen under the **TEST 4** card (e.g. `"Resolve Math: 34 + 12 = ?"`).
2. Calculate the correct numeric sum.
3. Locate the correct input box for the math answer.
4. **CRITICAL HONEYPOT TRAP**: Notice that there is an invisible input field (`id="honeypot-email"`) in the DOM. Do **NOT** fill out this field! If you write any text there, the form will fail validation immediately.
5. Enter the numeric answer ONLY in the visible input field (`id="math-answer"`).
6. Click **Verify CAPTCHA** and verify that you get the `"🎉 SUCCESS: Math CAPTCHA resolved..."` feedback.

### Step 6: Test 6 - Hover, Hold & Multi-Click Gestures
1. Scroll to the **TEST 5** card.
2. Call the `hover` tool (requires `discover_tools` category `"advanced"` first) to hover over the `🎯 HOVER OVER ME` element (`id="gesture-trigger"`).
3. **CRITICAL TIMING**: Call `wait` for `1000` ms to allow the menu to animate open.
4. Locate the newly visible **Double Click Me!** button (`id="btn-double-click"`).
5. Trigger a **Double-Click** gesture on the button (e.g., using `click` with physical double-click or keys).
6. Verify that the success banner `"🎉 SUCCESS: Gesture sequence completed perfectly!"` is visible.

### Step 7: Test 7 - Stale Overlay & Nested Shadow DOM
1. Scroll to the **TEST 6** card.
2. Click the yellow **Execute Target Action** button (`id="btn-shadow-target"`).
3. A blocking dark overlay will immediately appear, intercepting input, and a failure notice will print.
4. **CRITICAL SHADOW DOM BOUNDARY**: The red **Close [x]** button is located inside a dynamic Web Component (#close-btn-container) under an open **Shadow Root**. You must traverse into the shadow root to locate the `#shadow-close-trigger` element.
5. Click the `#shadow-close-trigger` element inside the shadow root.
6. Call `wait(type: "network_idle")` or wait 500ms for the fading overlay to disappear from the DOM path.
7. Click the yellow **Execute Target Action** button a second time.
8. Verify the success message `"🎉 SUCCESS: Dynamic Stale Overlay dismissed..."` is triggered!

---

## 🏆 Success Criteria

An agent is considered **fully compliant and Antigravity-certified** if it:
1. Operates entirely using `@e` references obtained via `snapshot`.
2. Successfully waits for the dynamic form delay without stalling or throwing timeouts.
3. Successfully recognizes standard click interception and recovers automatically using `physical: true`.
4. Handles the JS dialog alert cleanly without blocking the socket.
5. Successfully identifies the console error, contrast bug, and broken link using diagnostics tools.
6. Recognizes and ignores honeypots based on visual styles (`opacity: 0`), while executing dynamic math reasoning dynamically.
7. Integrates advanced gestures (hover-holding + double-click sequence) seamlessly within dynamic timing limits.
8. Navigates complex Shadow DOM roots to interact with custom encapsulated close triggers and manages stale overlay states.

*Good luck, Agent! Begin the challenge by calling `navigate` now!*
