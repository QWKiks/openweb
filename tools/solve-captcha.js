import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import {
  detectCaptchaScript,
  injectTokenScript,
  submitCaptcha,
  pollResult,
} from "../lib/captcha-solver.js";

export class SolveCaptchaTool {
  name = "solve_captcha";

  async execute(args) {
    const apiKey = args.apiKey || "";
    const tab = await getActiveTab();
    await attach(tab.id);

    let captchas;
    if (args.type && args.sitekey) {
      captchas = [{ type: args.type, sitekey: args.sitekey, action: args.action, minScore: args.minScore }];
    } else {
      const detections = await sendCommand("Runtime.evaluate", {
        expression: detectCaptchaScript(),
        returnByValue: true,
        awaitPromise: true,
      });
      captchas = JSON.parse(detections.result.value);
      if (!captchas || captchas.length === 0) {
        return { detected: false, message: "No captcha detected on the page." };
      }
    }

    if (!apiKey) {
      return {
        detected: true,
        captchas: captchas.map(c => ({ type: c.type, sitekey: c.sitekey })),
        message: "Captcha detected but no apiKey provided. Pass apiKey parameter or configure CAPTCHA_API_KEY in your environment and pass it to the tool.",
      };
    }

    const pageUrl = (await sendCommand("Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    })).result.value;

    const results = [];
    for (const c of captchas) {
      try {
        const id = await submitCaptcha(apiKey, c.type, c.sitekey, pageUrl, c.action, c.minScore);
        const token = await pollResult(apiKey, id);

        const injectScript = injectTokenScript(c.type, token);
        let injected = false;
        if (injectScript) {
          await sendCommand("Runtime.evaluate", {
            expression: injectScript,
            returnByValue: true,
          });
          injected = true;
        }

        results.push({ type: c.type, sitekey: c.sitekey, solved: true, injected, token });
      } catch (err) {
        results.push({ type: c.type, sitekey: c.sitekey, solved: false, error: err.message });
      }
    }

    return { detected: true, solved: results.some(r => r.solved), captchas: results };
  }
}
