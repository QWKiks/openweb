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
        selector: args.selector,
        inputSelector: args.inputSelector,
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
        let elemX = 0, elemY = 0;
        
        if ((c.type === "image" || c.type === "coordinate") && c.selector) {
          const { resolveRef } = await import("../lib/snapshot-refs.js");
          const refData = resolveRef(c.selector);
          if (!refData || !refData.backendDOMNodeId) throw new Error(`Invalid or stale ref: ${c.selector}`);
          
          const backendNodeId = refData.backendDOMNodeId;
          const boxModel = await sendCommand("DOM.getBoxModel", { backendNodeId });
          const quad = boxModel.model.border;
          const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
          const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
          const width = Math.max(quad[0], quad[2], quad[4], quad[6]) - x;
          const height = Math.max(quad[1], quad[3], quad[5], quad[7]) - y;
          
          elemX = x;
          elemY = y;
          
          await sendCommand("Page.getLayoutMetrics");
          const screenshot = await sendCommand("Page.captureScreenshot", {
            format: "jpeg",
            quality: 90,
            clip: { x, y, width, height, scale: 1 }
          });
          sitekey = screenshot.data;
        } else if (c.type === "image" && c.body) {
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
        
        if (c.type === "coordinate" && typeof token === "string") {
          // Token is likely a JSON string: [{"x":"84","y":"155"}]
          let coords;
          try { coords = JSON.parse(token); } catch(e) {}
          if (Array.isArray(coords) && coords.length > 0) {
            const clickX = elemX + parseInt(coords[0].x, 10);
            const clickY = elemY + parseInt(coords[0].y, 10);
            await sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", x: clickX, y: clickY, button: "left", clickCount: 1 });
            await new Promise(r => setTimeout(r, 50));
            await sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", x: clickX, y: clickY, button: "left", clickCount: 1 });
            injected = true;
          }
        } else if (c.type === "image" && c.inputSelector) {
          const { resolveRef } = await import("../lib/snapshot-refs.js");
          const refData = resolveRef(c.inputSelector);
          if (refData && refData.backendDOMNodeId) {
            const obj = await sendCommand("DOM.resolveNode", { backendNodeId: refData.backendDOMNodeId });
            await sendCommand("Runtime.callFunctionOn", {
              objectId: obj.object.objectId,
              functionDeclaration: `function(val) { this.value = val; this.dispatchEvent(new Event('input', {bubbles: true})); this.dispatchEvent(new Event('change', {bubbles: true})); }`,
              arguments: [{ value: token }]
            });
            injected = true;
          }
        } else if (injectScript) {
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
