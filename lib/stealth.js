export function buildStealthScript(config = {}) {
  const p = [];

  if (config.webdriver !== false) {
    p.push(`Object.defineProperty(navigator, 'webdriver', { get: () => undefined });`);
  }

  if (config.plugins !== false) {
    p.push(`(() => {
      const data = [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "" },
        { name: "Native Client", filename: "internal-nacl-plugin", description: "" },
      ];
      try {
        const len = data.length;
        const arr = data.map((d, i) => {
          const items = [];
          items.__proto__ = MimeType.prototype;
          return items;
        });
        arr.item = i => arr[i] || null;
        arr.namedItem = n => arr.find(e => e.name === n) || null;
        arr.length = len;
        Object.setPrototypeOf(arr, PluginArray.prototype);
        Object.defineProperty(navigator, 'plugins', { get: () => arr });
      } catch(e) {}
    })();`);
  }

  if (config.languages !== false) {
    const langs = JSON.stringify(config.languages || ["en-US", "en"]);
    p.push(`Object.defineProperty(navigator, 'languages', { get: () => ${langs} });`);
  }

  if (config.hardwareConcurrency !== false) {
    const cores = config.hardwareConcurrency || 4;
    p.push(`Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${cores} });`);
  }

  if (config.deviceMemory !== false) {
    const mem = config.deviceMemory || 8;
    p.push(`Object.defineProperty(navigator, 'deviceMemory', { get: () => ${mem} });`);
  }

  if (config.webgl !== false) {
    p.push(`(() => {
      const proto = WebGLRenderingContext.prototype;
      const origGetParam = proto.getParameter;
      proto.getParameter = function(p) {
        if (p === 37445) return "Intel Inc.";
        if (p === 37446) return "Intel Iris OpenGL Engine";
        return origGetParam.call(this, p);
      };
      const proto2 = WebGL2RenderingContext.prototype;
      if (proto2) {
        const orig2 = proto2.getParameter;
        proto2.getParameter = function(p) {
          if (p === 37445) return "Intel Inc.";
          if (p === 37446) return "Intel Iris OpenGL Engine";
          return orig2.call(this, p);
        };
      }
    })();`);
  }

  if (config.canvas !== false && config.canvasNoise !== false) {
    p.push(`(() => {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type) {
        const canvas = this;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width, h = canvas.height;
          if (w > 0 && h > 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.01)';
            ctx.fillRect(0, 0, 1, 1);
          }
        }
        return origToDataURL.call(this, type);
      };
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
        const canvas = this;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width, h = canvas.height;
          if (w > 0 && h > 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.01)';
            ctx.fillRect(0, 0, 1, 1);
          }
        }
        return origToBlob.call(this, cb, type, quality);
      };
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
        const data = origGetImageData.call(this, x, y, w, h);
        if (data && data.data) {
          data.data[0] = Math.max(0, data.data[0] - 1);
          data.data[1] = Math.min(255, data.data[1] + 1);
        }
        return data;
      };
    })();`);
  }

  if (config.chrome !== false) {
    p.push(`(() => {
      if (window.chrome && window.chrome.runtime) {
        Object.defineProperty(window.chrome, 'runtime', { get: () => undefined });
      }
    })();`);
  }

  if (config.platform !== false) {
    const platform = JSON.stringify(config.platform || "MacIntel");
    p.push(`Object.defineProperty(navigator, 'platform', { get: () => ${platform} });`);
  }

  if (config.userAgent) {
    const ua = JSON.stringify(config.userAgent);
    p.push(`Object.defineProperty(navigator, 'userAgent', { get: () => ${ua} });
Object.defineProperty(navigator, 'appVersion', { get: () => ${ua} });
Object.defineProperty(navigator, 'appName', { get: () => "Netscape" });`);
  }

  return p.join("\n");
}
