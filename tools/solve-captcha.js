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
    const apiKey = args.apiKey;
    const tab = await getActiveTab();
    await attach(tab.id);

    let captchas;

    if (args.type && args.sitekey) {
      captchas = [{
        type: args.type,
        sitekey: args.sitekey,
        pageUrl: args.url || "",
        action: args.action,
        minScore: args.minScore,
        surl: args.surl,
        challenge: args.challenge,
        body: args.body,
        question: args.question,
      }];
    } else {
      const detections = await sendCommand("Runtime.evaluate", {
        expression: detectCaptchaScript(),
        returnByValue: true,
        awaitPromise: true,
      });
      captchas = JSON.parse(detections.result.value);
      if (!captchas || captchas.length === 0) {
        if (!apiKey) {
          return { detected: false, message: "No captcha detected on the page. If you see a captcha image manually, call solve_captcha with { type: 'image', body: imgSrc } or { type: 'text', question: '...' }." };
        }
        return { detected: false, message: "No captcha detected on the page." };
      }
    }

    if (!apiKey) {
      return {
        detected: true,
        captchas: captchas.map(c => ({ type: c.type, sitekey: c.sitekey })),
        message: "Captcha detected but no CAPTCHA_API_KEY configured. Set it in .env file as CAPTCHA_API_KEY=your-key and restart the daemon.",
      };
    }

    const results = [];
    for (const c of captchas) {
      try {
        const pageUrl = c.pageUrl || (await sendCommand("Runtime.evaluate", {
          expression: "window.location.href",
          returnByValue: true,
        })).result.value;

        let sitekey = c.sitekey;
        if (c.type === "image" && c.body) {
          sitekey = c.body;
        } else if (c.type === "text" && c.question) {
          sitekey = c.question;
        }

        const id = await submitCaptcha(apiKey, c.type, sitekey, pageUrl, {
          action: c.action,
          minScore: c.minScore,
          surl: c.surl,
          challenge: c.challenge,
        });

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
