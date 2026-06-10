const CAPTCHA_BASE = "https://2captcha.com";

export function detectCaptchaScript() {
  return `(() => {
    const r = [];
    const el = document.querySelector('.g-recaptcha');
    if (el) {
      const sk = el.getAttribute('data-sitekey');
      if (sk) r.push({ type: 'recaptcha_v2', sitekey: sk });
    }
    const fi = document.querySelector('iframe[src*="google.com/recaptcha/api2/anchor"]');
    if (fi && !el) {
      const m = fi.src.match(/[?&]k=([^&]+)/);
      if (m) r.push({ type: 'recaptcha_v2', sitekey: m[1] });
    }
    if (document.querySelector('script[src*="recaptcha/api.js"][src*="render=explicit"]') || document.querySelector('[style*="display"][class*="grecaptcha-badge"]')) {
      const m = document.querySelector('script[src*="recaptcha/api.js"]');
      if (m) {
        const sk = m.src.match(/[?&]render=([^&]+)/);
        if (sk && sk[1] !== 'explicit') r.push({ type: 'recaptcha_v3', sitekey: sk[1] });
      }
    }
    const hc = document.querySelector('.h-captcha, iframe[src*="hcaptcha.com"]');
    if (hc) {
      const sk = hc.getAttribute('data-sitekey') || (hc.src && hc.src.match(/[?&]sitekey=([^&]+)/)?.[1]);
      if (sk) r.push({ type: 'hcaptcha', sitekey: sk });
    }
    const ts = document.querySelector('.cf-turnstile, iframe[src*="challenges.cloudflare.com"]');
    if (ts) {
      const sk = ts.getAttribute('data-sitekey') || (ts.src && ts.src.match(/[?&]sitekey=([^&]+)/)?.[1]);
      if (sk) r.push({ type: 'turnstile', sitekey: sk });
    }
    return JSON.stringify(r);
  })()`;
}

export function injectTokenScript(type, token) {
  const escToken = JSON.stringify(token);
  switch (type) {
    case "recaptcha_v2":
      return `(() => {
        const t = ${escToken};
        document.querySelectorAll('[id^="g-recaptcha-response"]').forEach(el => { el.innerHTML = t; try { el.value = t; } catch(e) {} });
        const cb = document.querySelector('.g-recaptcha')?.getAttribute('data-callback');
        if (cb && typeof window[cb] === 'function') try { window[cb](t); } catch(e) {}
        if (typeof ___grecaptcha_cfg !== 'undefined') {
          for (const id in ___grecaptcha_cfg.clients) try { ___grecaptcha_cfg.clients[id]?.callback?.(t); } catch(e) {}
        }
        return true;
      })()`;
    case "hcaptcha":
      return `(() => {
        const t = ${escToken};
        document.querySelectorAll('[name="h-captcha-response"], [id^="h-captcha-response"]').forEach(el => { el.innerHTML = t; try { el.value = t; } catch(e) {} });
        const cb = document.querySelector('.h-captcha')?.getAttribute('data-callback');
        if (cb && typeof window[cb] === 'function') try { window[cb](t); } catch(e) {}
        if (typeof hcaptcha !== 'undefined') try { hcaptcha.getResponse() && hcaptcha.close(); } catch(e) {}
        return true;
      })()`;
    case "turnstile":
      return `(() => {
        const t = ${escToken};
        const cb = document.querySelector('.cf-turnstile')?.getAttribute('data-callback');
        if (cb && typeof window[cb] === 'function') try { window[cb](t); } catch(e) {}
        if (typeof turnstile !== 'undefined') try { turnstile.ready(() => {}); } catch(e) {}
        return true;
      })()`;
    default:
      return null;
  }
}

export function getMethodForType(type) {
  switch (type) {
    case "recaptcha_v2": return "userrecaptcha";
    case "recaptcha_v3": return "userrecaptcha";
    case "hcaptcha": return "hcaptcha";
    case "turnstile": return "turnstile";
    default: return null;
  }
}

export function getKeyParamForType(type) {
  switch (type) {
    case "recaptcha_v2":
    case "recaptcha_v3": return "googlekey";
    case "hcaptcha":
    case "turnstile": return "sitekey";
    default: return "googlekey";
  }
}

export async function submitCaptcha(apiKey, type, sitekey, pageUrl, action, minScore) {
  const method = getMethodForType(type);
  const keyParam = getKeyParamForType(type);
  if (!method) throw new Error(`Unsupported captcha type: ${type}`);

  const body = {
    key: apiKey,
    method,
    [keyParam]: sitekey,
    pageurl: pageUrl,
    json: 1,
  };

  if (type === "recaptcha_v3") {
    body.action = action || "verify";
    body.min_score = minScore || "0.3";
  }

  const resp = await fetch(`${CAPTCHA_BASE}/in.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (data.status === 0) throw new Error(`2Captcha submit error: ${data.request}`);
  return data.request;
}

export async function pollResult(apiKey, id, pollInterval = 3000, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const resp = await fetch(`${CAPTCHA_BASE}/res.php?key=${apiKey}&action=get&id=${id}&json=1`);
    const data = await resp.json();
    if (data.status === 1) return data.request;
    if (data.request && data.request !== "CAPCHA_NOT_READY") {
      throw new Error(`2Captcha error: ${data.request}`);
    }
    await new Promise(r => setTimeout(r, pollInterval));
  }
  throw new Error("2Captcha timeout: captcha was not solved within the timeout period");
}
