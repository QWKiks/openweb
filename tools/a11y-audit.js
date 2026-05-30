import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class A11yAuditTool {
  name = "a11y_audit";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: this.buildExpression(),
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`a11y_audit: ${result.exceptionDetails.text}`);
    }

    const data = result.result?.value || {};
    data.url = tab.url;
    data.timestamp = new Date().toISOString();

    return data;
  }

  buildExpression() {
    return `(() => {
      const issues = [];

      // Images without alt
      document.querySelectorAll('img:not([alt])').forEach((img, i) => {
        if (i < 20) issues.push({ type: 'missing-alt', element: 'img', src: img.src?.slice(0, 100) });
      });

      // Empty links
      document.querySelectorAll('a').forEach((a, i) => {
        if (!a.textContent.trim() && !a.getAttribute('aria-label') && !a.querySelector('img') && i < 20) {
          issues.push({ type: 'empty-link', href: a.href?.slice(0, 100) });
        }
      });

      // Form inputs without labels
      document.querySelectorAll('input, select, textarea').forEach((el, i) => {
        const id = el.id;
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        const hasLabel = id && document.querySelector('label[for="' + id + '"]');
        const placeholder = el.getAttribute('placeholder');
        const type = el.type;
        
        if (!hasLabel && !ariaLabel && !ariaLabelledBy && !placeholder && type !== 'hidden' && type !== 'submit' && type !== 'button' && i < 20) {
          issues.push({ type: 'missing-label', element: el.tagName.toLowerCase(), name: el.name || null });
        }
      });

      // Missing lang attribute
      const lang = document.documentElement.lang;
      if (!lang) issues.push({ type: 'missing-lang' });

      // Low contrast warnings (basic check)
      const contrastIssues = [];
      document.querySelectorAll('p, span, a, button, h1, h2, h3, h4, h5, h6').forEach((el, i) => {
        if (i >= 50) return;
        const style = window.getComputedStyle(el);
        const color = style.color;
        const bg = style.backgroundColor;
        if (color === 'rgba(0, 0, 0, 0)' || (bg === 'rgba(0, 0, 0, 0)' && !el.offsetParent)) return;
        // Very basic heuristic: white on very light gray
        if (color.includes('200') || color.includes('204') || color.includes('221')) {
          if (bg.includes('255') || bg.includes('transparent')) {
            contrastIssues.push({ type: 'low-contrast', tag: el.tagName.toLowerCase(), text: el.textContent?.slice(0, 50) });
          }
        }
      });

      // Missing page title
      if (!document.title.trim()) issues.push({ type: 'missing-title' });

      // Skip links
      const hasSkipLink = !!document.querySelector('a[href^="#"]');

      // Landmarks
      const landmarks = {
        main: document.querySelectorAll('main').length,
        nav: document.querySelectorAll('nav').length,
        aside: document.querySelectorAll('aside').length,
        footer: document.querySelectorAll('footer').length,
        header: document.querySelectorAll('header').length,
        article: document.querySelectorAll('article').length,
        section: document.querySelectorAll('section').length,
      };

      // Focusable elements
      const focusable = document.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length;
      
      // ARIA roles without labels
      document.querySelectorAll('[role]').forEach((el, i) => {
        if (i >= 20) return;
        const role = el.getAttribute('role');
        const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        if ((role === 'button' || role === 'link' || role === 'tab' || role === 'dialog') && !label && !el.textContent.trim()) {
          issues.push({ type: 'missing-aria-label', role, tag: el.tagName.toLowerCase() });
        }
      });

      return {
        score: Math.max(0, 100 - issues.length * 2 - contrastIssues.length),
        totalIssues: issues.length + contrastIssues.length,
        issues: issues.slice(0, 30),
        contrastIssues: contrastIssues.slice(0, 10),
        landmarks,
        hasSkipLink,
        focusableElements: focusable,
        pageTitle: document.title,
        language: lang || null,
        totalImages: document.querySelectorAll('img').length,
        imagesWithoutAlt: document.querySelectorAll('img:not([alt])').length,
        totalLinks: document.querySelectorAll('a').length,
        totalForms: document.querySelectorAll('form').length,
      };
    })()`;
  }
}
