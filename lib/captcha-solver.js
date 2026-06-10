const CAPTCHA_BASE = "https://2captcha.com";

export function detectCaptchaScript() {
  return `(() => {
    const r = [];
    const pageUrl = window.location.href;

    const recaptcha = document.querySelector('.g-recaptcha');
    if (recaptcha) {
      const sk = recaptcha.getAttribute('data-sitekey');
      if (sk) r.push({ type: 'recaptcha_v2', sitekey: sk, pageUrl });
    }
    const recaptchaIframe = document.querySelector('iframe[src*="google.com/recaptcha/api2/anchor"]');
    if (recaptchaIframe && !recaptcha) {
      const m = recaptchaIframe.src.match(/[?&]k=([^&]+)/);
      if (m) r.push({ type: 'recaptcha_v2', sitekey: m[1], pageUrl });
    }
    const recaptchaScript = document.querySelector('script[src*="recaptcha/api.js"]');
    if (recaptchaScript) {
      const m = recaptchaScript.src.match(/[?&]render=([^&]+)/);
      if (m && m[1] !== 'explicit') r.push({ type: 'recaptcha_v3', sitekey: m[1], pageUrl });
    }
    const hc = document.querySelector('.h-captcha, iframe[src*="hcaptcha.com"]');
    if (hc) {
      const sk = hc.getAttribute('data-sitekey') || (hc.src && hc.src.match(/[?&]sitekey=([^&]+)/)?.[1]);
      if (sk) r.push({ type: 'hcaptcha', sitekey: sk, pageUrl });
    }
    const ts = document.querySelector('.cf-turnstile, iframe[src*="challenges.cloudflare.com"]');
    if (ts) {
      const sk = ts.getAttribute('data-sitekey') || (ts.src && ts.src.match(/[?&]sitekey=([^&]+)/)?.[1]);
      if (sk) r.push({ type: 'turnstile', sitekey: sk, pageUrl });
    }
    const fc = document.querySelector('iframe[src*="funcaptcha.com"], div[data-pkey]');
    if (fc) {
      const pk = fc.getAttribute('data-pkey') || (fc.src && fc.src.match(/[?&]pk=([^&]+)/)?.[1]);
      if (pk) r.push({ type: 'funcaptcha', sitekey: pk, pageUrl, surl: fc.getAttribute('data-surl') || '' });
    }
    const gt = document.querySelector('.geetest_radar_tip, div[class*="geetest"], .geetest_canvas');
    if (gt) {
      const gtVal = document.querySelector('[data-gt]')?.getAttribute('data-gt');
      const challenge = document.querySelector('[data-challenge]')?.getAttribute('data-challenge');
      if (gtVal) r.push({ type: 'geetest', sitekey: gtVal, pageUrl, challenge: challenge || '' });
    }
    const yc = document.querySelector('iframe[src*="smartcaptcha.yandex"], div[data-sitekey][id*="captcha"]');
    if (yc) {
      const sk = yc.getAttribute('data-sitekey') || (yc.src && yc.src.match(/[?&]sitekey=([^&]+)/)?.[1]);
      if (sk) r.push({ type: 'yandex', sitekey: sk, pageUrl });
    }
    const kc = document.querySelector('#keycaptcha, div[style*="keycaptcha"], div[class*="keycaptcha"]');
    if (kc) {
      const ssk = kc.getAttribute('data-s-s-c-user-id') || '';
      if (ssk) r.push({ type: 'keycaptcha', sitekey: ssk, pageUrl });
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
        return true;
      })()`;
    case "turnstile":
      return `(() => {
        const t = ${escToken};
        const cb = document.querySelector('.cf-turnstile')?.getAttribute('data-callback');
        if (cb && typeof window[cb] === 'function') try { window[cb](t); } catch(e) {}
        if (typeof turnstile !== 'undefined') try { turnstile.ready(function(){}); } catch(e) {}
        return true;
      })()`;
    case "recaptcha_v3":
      return `(() => {
        const t = ${escToken};
        let found = false;
        document.querySelectorAll('[id^="g-recaptcha-response"], [name^="g-recaptcha-response"]').forEach(el => { el.innerHTML = t; try { el.value = t; } catch(e) {}; found = true; });
        return found;
      })()`;
    case "funcaptcha":
      return `(() => {
        const t = ${escToken};
        const input = document.querySelector('input[name="fc-token"]');
        if (input) { input.value = t; return true; }
        return false;
      })()`;
    case "yandex":
      return `(() => {
        const t = ${escToken};
        const input = document.querySelector('input[name="smart-token"]');
        if (input) { input.value = t; return true; }
        return false;
      })()`;
    case "geetest":
      return `(() => {
        let t = ${escToken};
        if (typeof t === 'string') { try { t = JSON.parse(t); } catch(e) {} }
        if (typeof t === 'object' && t !== null) {
          let found = false;
          for (const key of Object.keys(t)) {
            const el = document.querySelector('input[name="'+key+'"], input[name="geetest_'+key+'"]');
            if (el) { el.value = t[key]; found = true; }
          }
          return found;
        }
        return false;
      })()`;
    case "keycaptcha":
      return null;
    default:
      return null;
  }
}

export function getMethodForType(type) {
  const methods = {
    recaptcha_v2: "userrecaptcha",
    recaptcha_v3: "userrecaptcha",
    hcaptcha: "hcaptcha",
    turnstile: "turnstile",
    funcaptcha: "funcaptcha",
    geetest: "geetest",
    geetest_v4: "geetest_v4",
    yandex: "yandex_smart_captcha",
    keycaptcha: "keycaptcha",
    image: "base64",
    coordinate: "base64",
    text: "post",
  };
  return methods[type] || null;
}

export function getKeyParamForType(type) {
  const map = {
    recaptcha_v2: "googlekey",
    recaptcha_v3: "googlekey",
    hcaptcha: "sitekey",
    turnstile: "sitekey",
    funcaptcha: "publickey",
    geetest: "gt",
    geetest_v4: "gt",
    yandex: "sitekey",
    keycaptcha: "s_s_c_user_id",
  };
  return map[type] || "sitekey";
}

export async function submitCaptcha(apiKey, type, sitekey, pageUrl, opts = {}) {
  const method = getMethodForType(type);
  const keyParam = getKeyParamForType(type);
  if (!method) throw new Error(`Unsupported captcha type: ${type}`);

  const body = { key: apiKey, method, json: 1 };

  if (type === "image" || type === "coordinate") {
    body.body = sitekey;
    if (type === "coordinate") body.coordinatescaptcha = 1;
  } else if (type === "text") {
    body.textcaptcha = sitekey;
  } else {
    body[keyParam] = type === "funcaptcha" ? sitekey : sitekey;
    body.pageurl = pageUrl;
  }

  if (type === "recaptcha_v3") {
    body.action = opts.action || "verify";
    body.min_score = opts.minScore || 0.3;
  }

  if (type === "funcaptcha") {
    if (opts.surl) body.surl = opts.surl;
  }

  if ((type === "geetest" || type === "geetest_v4") && opts.challenge) {
    body.challenge = opts.challenge;
  }

  if (opts.regParam) {
    Object.assign(body, opts.regParam);
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
