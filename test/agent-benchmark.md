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

---

## 🏆 Success Criteria

An agent is considered **fully compliant and Antigravity-certified** if it:
1. Operates entirely using `@e` references obtained via `snapshot`.
2. Successfully waits for the dynamic form delay without stalling or throwing timeouts.
3. Successfully recognizes standard click interception and recovers automatically using `physical: true`.
4. Handles the JS dialog alert cleanly without blocking the socket.
5. Successfully identifies the console error, contrast bug, and broken link using diagnostics tools.

*Good luck, Agent! Begin the challenge by calling `navigate` now!*
