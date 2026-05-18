/**
 * Security Scan Tool
 * Comprehensive security assessment of the current page.
 * Checks security headers, mixed content, XSS vulnerabilities, SSL/TLS, and more.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class SecurityScanTool {
  name = "security_scan";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    return this.runSecurityScan(args);
  }

  async runSecurityScan(args = {}) {
    const { detailed = false } = args;

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const report = {
          url: window.location.href,
          timestamp: Date.now(),
          protocol: window.location.protocol,
          host: window.location.host,
          isHTTPS: window.location.protocol === 'https:',
          isSecureContext: window.isSecureContext,
          
          // Security Headers (meta tags)
          headers: {
            csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || null,
            xFrameOptions: document.querySelector('meta[http-equiv="X-Frame-Options"]')?.getAttribute('content') || null,
            contentType: document.querySelector('meta[http-equiv="Content-Type"]')?.getAttribute('content') || null,
            referrerPolicy: document.querySelector('meta[name="referrer"]')?.getAttribute('content') || null
          },
          
          // Mixed Content
          mixedContent: {
            hasMixedContent: false,
            httpLinks: [],
            httpImages: [],
            httpScripts: [],
            count: 0
          },
          
          // Scripts
          scripts: {
            total: document.querySelectorAll('script').length,
            external: document.querySelectorAll('script[src]').length,
            inline: document.querySelectorAll('script:not([src])').length,
            withIntegrity: document.querySelectorAll('script[integrity]').length,
            externalScripts: Array.from(document.querySelectorAll('script[src]')).map(s => ({
              src: s.src,
              hasIntegrity: s.hasAttribute('integrity'),
              integrity: s.getAttribute('integrity') || null,
              crossorigin: s.getAttribute('crossorigin') || null
            }))
          },
          
          // Stylesheets
          stylesheets: {
            total: document.querySelectorAll('link[rel="stylesheet"]').length,
            withIntegrity: document.querySelectorAll('link[rel="stylesheet"][integrity]').length,
            externalStylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => ({
              href: l.href,
              hasIntegrity: l.hasAttribute('integrity'),
              integrity: l.getAttribute('integrity') || null
            }))
          },
          
          // Forms
          forms: {
            total: document.querySelectorAll('form').length,
            withAction: document.querySelectorAll('form[action]').length,
            withMethod: document.querySelectorAll('form[method]').length,
            withoutMethod: document.querySelectorAll('form:not([method])').length,
            forms: Array.from(document.querySelectorAll('form')).map(f => ({
              action: f.action || 'current',
              method: f.method || 'default',
              hasEnctype: f.hasAttribute('enctype')
            }))
          },
          
          // Input Fields
          inputs: {
            total: document.querySelectorAll('input, textarea').length,
            textInputs: document.querySelectorAll('input[type="text"], textarea').length,
            passwordInputs: document.querySelectorAll('input[type="password"]').length,
            withAutocomplete: document.querySelectorAll('input[autocomplete]').length,
            inputs: Array.from(document.querySelectorAll('input, textarea')).map(i => ({
              type: i.type,
              name: i.name,
              hasAutocomplete: i.hasAttribute('autocomplete'),
              autocompleteValue: i.getAttribute('autocomplete') || null
            }))
          },
          
          // Links
          links: {
            total: document.querySelectorAll('a').length,
            external: document.querySelectorAll('a[href^="http"]').length,
            javascript: document.querySelectorAll('a[href^="javascript:"]').length,
            data: document.querySelectorAll('a[href^="data:"]').length,
            javascriptLinks: Array.from(document.querySelectorAll('a[href^="javascript:"]')).map(a => a.href),
            dataLinks: Array.from(document.querySelectorAll('a[href^="data:"]')).map(a => a.href)
          },
          
          // Iframes
          iframes: {
            total: document.querySelectorAll('iframe').length,
            withSandbox: document.querySelectorAll('iframe[sandbox]').length,
            withoutSandbox: document.querySelectorAll('iframe:not([sandbox])').length,
            iframes: Array.from(document.querySelectorAll('iframe')).map(i => ({
              src: i.src,
              hasSandbox: i.hasAttribute('sandbox'),
              sandbox: i.getAttribute('sandbox') || null
            }))
          },
          
          // XSS Vulnerabilities
          xss: {
            hasDangerousMethods: false,
            hasInnerHtml: false,
            hasEval: false,
            hasDocumentWrite: false,
            hasOuterHtml: false
          },
          
          // Cookies
          cookies: {
            hasCookies: document.cookie.length > 0,
            count: document.cookie.split(';').filter(c => c.trim()).length,
            cookies: document.cookie.split(';').filter(c => c.trim())
          },
          
          // Storage
          storage: {
            localStorageKeys: Object.keys(localStorage).length,
            sessionStorageKeys: Object.keys(sessionStorage).length,
            localStorageItems: Object.keys(localStorage).map(k => ({ key: k, size: localStorage.getItem(k).length })),
            sessionStorageItems: Object.keys(sessionStorage).map(k => ({ key: k, size: sessionStorage.getItem(k).length }))
          },
          
          // Meta tags
          meta: {
            total: document.querySelectorAll('meta').length,
            metaTags: Array.from(document.querySelectorAll('meta')).map(m => ({
              name: m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv') || 'unknown',
              content: m.getAttribute('content') || null
            }))
          }
        };
        
        // Check for mixed content
        if (window.location.protocol === 'https:') {
          const httpLinks = document.querySelectorAll('a[href^="http:"]');
          const httpImages = document.querySelectorAll('img[src^="http:"]');
          const httpScripts = document.querySelectorAll('script[src^="http:"]');
          
          report.mixedContent.hasMixedContent = httpLinks.length > 0 || httpImages.length > 0 || httpScripts.length > 0;
          report.mixedContent.httpLinks = Array.from(httpLinks).slice(0, 20).map(a => a.href);
          report.mixedContent.httpImages = Array.from(httpImages).slice(0, 20).map(i => i.src);
          report.mixedContent.httpScripts = Array.from(httpScripts).slice(0, 20).map(s => s.src);
          report.mixedContent.count = httpLinks.length + httpImages.length + httpScripts.length;
        }
        
        // Check for dangerous JavaScript patterns
        const bodyHTML = document.body.innerHTML;
        report.xss.hasInnerHtml = bodyHTML.includes('innerHTML');
        report.xss.hasEval = bodyHTML.includes('eval(') || bodyHTML.includes('Function(');
        report.xss.hasDocumentWrite = bodyHTML.includes('document.write');
        report.xss.hasOuterHtml = bodyHTML.includes('outerHTML');
        report.xss.hasDangerousMethods = report.xss.hasInnerHtml || report.xss.hasEval || report.xss.hasDocumentWrite || report.xss.hasOuterHtml;
        
        // Calculate risk score
        let riskScore = 0;
        let riskLevel = 'LOW';
        
        if (!report.headers.csp) riskScore += 20;
        if (!report.headers.xFrameOptions) riskScore += 15;
        if (report.mixedContent.hasMixedContent) riskScore += 25;
        if (report.xss.hasDangerousMethods) riskScore += 20;
        if (report.scripts.inline > 0 && !report.headers.csp) riskScore += 10;
        if (report.links.javascript > 0) riskScore += 15;
        if (report.links.data > 0) riskScore += 15;
        if (report.cookies.hasCookies) riskScore += 5;
        if (report.iframe.withoutSandbox > 0) riskScore += 10;
        
        if (riskScore >= 60) riskLevel = 'HIGH';
        else if (riskScore >= 30) riskLevel = 'MEDIUM';
        
        report.risk = {
          score: riskScore,
          level: riskLevel
        };
        
        return report;
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`security_scan: ${result.exceptionDetails.text}`);
    }

    const report = result.result.value;

    // Add vulnerability recommendations
    report.recommendations = this.generateRecommendations(report);

    return report;
  }

  generateRecommendations(report) {
    const recommendations = [];

    if (!report.headers.csp) {
      recommendations.push({
        severity: 'HIGH',
        issue: 'Missing Content-Security-Policy',
        recommendation: 'Add CSP header to prevent XSS attacks',
        example: "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
      });
    }

    if (!report.headers.xFrameOptions) {
      recommendations.push({
        severity: 'MEDIUM',
        issue: 'Missing X-Frame-Options',
        recommendation: 'Add X-Frame-Options header to prevent clickjacking',
        example: 'X-Frame-Options: DENY or SAMEORIGIN'
      });
    }

    if (report.mixedContent.hasMixedContent) {
      recommendations.push({
        severity: 'HIGH',
        issue: 'Mixed Content Detected',
        recommendation: 'Convert all HTTP resources to HTTPS',
        count: report.mixedContent.count
      });
    }

    if (report.xss.hasDangerousMethods) {
      recommendations.push({
        severity: 'HIGH',
        issue: 'Dangerous JavaScript Methods Found',
        recommendation: 'Avoid using eval(), innerHTML, document.write()',
        details: report.xss
      });
    }

    if (report.links.javascript > 0) {
      recommendations.push({
        severity: 'MEDIUM',
        issue: 'JavaScript Protocol Links Found',
        recommendation: 'Remove javascript: links as they are XSS vectors',
        count: report.links.javascript
      });
    }

    if (report.links.data > 0) {
      recommendations.push({
        severity: 'MEDIUM',
        issue: 'Data Protocol Links Found',
        recommendation: 'Remove data: links as they can be used for XSS',
        count: report.links.data
      });
    }

    if (report.scripts.external > 0 && report.scripts.withIntegrity === 0) {
      recommendations.push({
        severity: 'MEDIUM',
        issue: 'External Scripts Without SRI',
        recommendation: 'Add Subresource Integrity (SRI) to external scripts',
        count: report.scripts.external
      });
    }

    if (report.iframe.withoutSandbox > 0) {
      recommendations.push({
        severity: 'MEDIUM',
        issue: 'Iframes Without Sandbox',
        recommendation: 'Add sandbox attribute to iframes',
        count: report.iframe.withoutSandbox
      });
    }

    if (report.forms.withoutMethod > 0) {
      recommendations.push({
        severity: 'LOW',
        issue: 'Forms Without Method Attribute',
        recommendation: 'Explicitly specify method="POST" for forms',
        count: report.forms.withoutMethod
      });
    }

    if (report.cookies.hasCookies) {
      recommendations.push({
        severity: 'LOW',
        issue: 'Cookies Present',
        recommendation: 'Review cookies for security (Secure, HttpOnly, SameSite attributes)',
        count: report.cookies.count
      });
    }

    return recommendations;
  }
}
