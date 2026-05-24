/**
 * SEO Audit Tool
 * Extracts title, meta tags, Open Graph, Twitter Cards, canonical, hreflang, and JSON-LD structured data.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class SeoAuditTool {
  name = "seo_audit";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: this.buildExpression(),
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`seo_audit: ${result.exceptionDetails.text}`);
    }

    const data = result.result?.value || {};
    data.url = tab.url;
    data.timestamp = new Date().toISOString();

    return data;
  }

  buildExpression() {
    return `(() => {
      const metaTags = {};
      document.querySelectorAll('meta').forEach(tag => {
        const name = tag.getAttribute('name') || tag.getAttribute('property') || tag.getAttribute('http-equiv');
        const content = tag.getAttribute('content');
        if (name && content) {
          if (metaTags[name]) {
            if (!Array.isArray(metaTags[name])) metaTags[name] = [metaTags[name]];
            metaTags[name].push(content);
          } else {
            metaTags[name] = content;
          }
        }
      });

      const og = {};
      const twitter = {};
      for (const [key, val] of Object.entries(metaTags)) {
        if (key.startsWith('og:')) og[key] = val;
        if (key.startsWith('twitter:')) twitter[key] = val;
      }

      const hreflangs = [...document.querySelectorAll('link[rel="alternate"]')]
        .filter(l => l.getAttribute('hreflang'))
        .map(l => ({ href: l.getAttribute('href'), hreflang: l.getAttribute('hreflang') }));

      const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => {
          try { return JSON.parse(s.textContent); } catch { return { raw: s.textContent.slice(0, 500) }; }
        });

      const headings = {};
      for (let i = 1; i <= 6; i++) {
        headings['h' + i] = [...document.querySelectorAll('h' + i)].map(h => h.textContent.trim()).filter(Boolean);
      }

      const images = [...document.querySelectorAll('img')]
        .map(img => ({
          src: img.src,
          alt: img.alt || '',
          width: img.naturalWidth,
          height: img.naturalHeight,
        }))
        .filter(img => img.src);

      const links = [...document.querySelectorAll('a[rel]')]
        .map(a => ({ href: a.href, rel: a.getAttribute('rel') }));

      return {
        title: document.title,
        description: metaTags['description'] || null,
        keywords: metaTags['keywords'] || null,
        robots: metaTags['robots'] || null,
        viewport: metaTags['viewport'] || null,
        charset: document.characterSet,
        lang: document.documentElement.lang || null,
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
        hreflangs: hreflangs.length ? hreflangs : null,
        og: Object.keys(og).length ? og : null,
        twitter: Object.keys(twitter).length ? twitter : null,
        jsonLd: jsonLd.length ? jsonLd : null,
        headings,
        images: images.slice(0, 50),
        imagesWithoutAlt: images.filter(img => !img.alt).length,
        totalImages: images.length,
        links: links.length ? links.slice(0, 20) : null,
        internalLinks: [...document.querySelectorAll('a')].filter(a => a.hostname === location.hostname).length,
        externalLinks: [...document.querySelectorAll('a')].filter(a => a.hostname !== location.hostname && a.href.startsWith('http')).length,
      };
    })()`;
  }
}
