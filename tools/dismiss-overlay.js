import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

const DISMISS_SELECTORS = [
  

  "button:is([aria-label*='Accept' i],[aria-label*='Consent' i],[aria-label*='Agree' i],[aria-label*='Close' i])",
  "a:is([aria-label*='Accept' i],[aria-label*='Consent' i],[aria-label*='Agree' i])",
  ".cookie-bar button, .cookie-banner button, .cookie-consent button, #cookie-banner button",
  ".cc-btn, .accept-cookies, .cookie-accept, .agree-button",
  "#onetrust-accept-btn-handler, .onetrust-close-btn-handler",
  

  'button[class*="close"], button[class*="dismiss"], button[aria-label="Close"]',
  'button:is([class*="modal-close"],[class*="popup-close"],[class*="overlay-close"])',
  '[class*="modal"] button:is([class*="close"],[class*="dismiss"])',
  

  'button:is([class*="accept"],[class*="agree"],[class*="confirm"],[class*="continue"])',
  

  "[class*='overlay'] button, [class*='modal'] button, [class*='popup'] button",
];

const COOKIE_TEXT_PATTERNS = [
  "accept", "agree", "allow", "consent", "ok", "got it", "i understand",
  "continue", "close", "dismiss", "reject", "decline",
];

export class DismissOverlayTool {
  name = "dismiss_overlay";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    

    const clickedSelectors = [];
    for (const sel of DISMISS_SELECTORS) {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return { found: false };
          if (el.offsetParent === null && !el.ariaLabel) return { found: false };
          el.click();
          return { found: true, tag: el.tagName, text: (el.textContent || '').trim().slice(0, 60) };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });
      if (result.exceptionDetails) continue;
      const value = result.result.value;
      if (value?.found) {
        clickedSelectors.push(sel);
      }
    }

    

    const textMatched = [];
    if (clickedSelectors.length === 0) {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const patterns = ${JSON.stringify(COOKIE_TEXT_PATTERNS)};
          const buttons = document.querySelectorAll('button, a, [role="button"], [tabindex]:not([tabindex="-1"])');
          for (const btn of buttons) {
            const txt = (btn.textContent || '').trim().toLowerCase();
            if (!txt || txt.length > 80) continue;
            if (patterns.some(p => txt.includes(p))) {
              if (btn.offsetParent === null) continue;
              btn.click();
              return { found: true, tag: btn.tagName, text: txt.slice(0, 60), method: 'text_match' };
            }
          }
          return { found: false, method: 'no_match' };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });
      if (!result.exceptionDetails && result.result.value?.found) {
        textMatched.push(result.result.value);
      }
    }

    

    const checkResult = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const overlays = document.querySelectorAll(
          '[class*="overlay"], [class*="modal"], [class*="popup"], [class*="cookie"], [id*="cookie"], [class*="consent"]'
        );
        let visible = 0;
        for (const o of overlays) {
          if (o.offsetParent !== null) visible++;
        }
        return { overlaysRemaining: visible };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });
    const remaining = checkResult.result?.value?.overlaysRemaining ?? 0;

    return {
      success: clickedSelectors.length > 0 || textMatched.length > 0 || remaining === 0,
      dismissed: clickedSelectors.length + textMatched.length,
      method: clickedSelectors.length > 0 ? "selector" : textMatched.length > 0 ? "text" : "none",
      overlaysRemaining: remaining,
      selectorsClicked: clickedSelectors.length,
      textMatched: textMatched.length,
    };
  }
}
