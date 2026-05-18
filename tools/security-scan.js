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
        
        // Advanced Security Checks
        report.advanced = {
          cspBypass: this.checkCSPBypass(report),
          corsMisconfig: this.checkCORSMisconfig(),
          domXssSinks: this.checkDOMXssSinks(),
          serviceWorker: this.checkServiceWorker(),
          websockets: this.checkWebSockets(),
          timingAttacks: this.checkTimingAttacks(),
          prototypePollution: this.checkPrototypePollution(),
          ssrfPatterns: this.checkSSRFPatterns()
        };

        // Calculate risk score (including advanced checks)
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
        
        // Advanced checks
        if (report.advanced.cspBypass.hasBypass) riskScore += 15;
        if (report.advanced.corsMisconfig.hasMisconfig) riskScore += 20;
        if (report.advanced.domXssSinks.hasSinks) riskScore += 25;
        if (report.advanced.serviceWorker.hasIssues) riskScore += 10;
        if (report.advanced.websockets.hasIssues) riskScore += 15;
        if (report.advanced.timingAttacks.hasTimingLeaks) riskScore += 20;
        if (report.advanced.prototypePollution.hasPollution) riskScore += 25;
        if (report.advanced.ssrfPatterns.hasPatterns) riskScore += 20;
        
        if (riskScore >= 80) riskLevel = 'CRITICAL';
        else if (riskScore >= 60) riskLevel = 'HIGH';
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

  checkCSPBypass(report) {
    const bypass = {
      hasBypass: false,
      techniques: []
    };

    if (!report.headers.csp) {
      return bypass; // Already covered by missing CSP
    }

    const csp = report.headers.csp.toLowerCase();
    
    // Check for unsafe-eval
    if (csp.includes('unsafe-eval')) {
      bypass.hasBypass = true;
      bypass.techniques.push('script-src includes unsafe-eval');
    }

    // Check for unsafe-inline
    if (csp.includes('unsafe-inline')) {
      bypass.hasBypass = true;
      bypass.techniques.push('script-src/style-src includes unsafe-inline');
    }

    // Check for wildcard domains
    if (csp.includes('*')) {
      bypass.hasBypass = true;
      bypass.techniques.push('Wildcard domains in CSP');
    }

    // Check for data: URIs
    if (csp.includes('data:')) {
      bypass.hasBypass = true;
      bypass.techniques.push('data: URIs allowed');
    }

    // Check for missing object-src
    if (!csp.includes('object-src')) {
      bypass.hasBypass = true;
      bypass.techniques.push('Missing object-src directive');
    }

    // Check for missing base-uri
    if (!csp.includes('base-uri')) {
      bypass.hasBypass = true;
      bypass.techniques.push('Missing base-uri directive');
    }

    return bypass;
  }

  checkCORSMisconfig() {
    const misconfig = {
      hasMisconfig: false,
      issues: []
    };

    // Check for wildcard origins (this would need server-side response headers)
    // For now, we check for common patterns that might indicate CORS issues
    const fetchCalls = document.body.innerHTML.match(/fetch\s*\(/g) || [];
    if (fetchCalls.length > 0) {
      misconfig.hasMisconfig = true;
      misconfig.issues.push(`${fetchCalls.length} fetch() calls detected - verify CORS headers`);
    }

    // Check for XHR requests
    const xhrCalls = document.body.innerHTML.match(/XMLHttpRequest/g) || [];
    if (xhrCalls.length > 0) {
      misconfig.hasMisconfig = true;
      misconfig.issues.push(`${xhrCalls.length} XMLHttpRequest calls detected - verify CORS headers`);
    }

    return misconfig;
  }

  checkDOMXssSinks() {
    const sinks = {
      hasSinks: false,
      dangerousSinks: []
    };

    const bodyHTML = document.body.innerHTML;

    // Check for dangerous DOM sinks
    const sinkPatterns = [
      { pattern: 'innerHTML', name: 'innerHTML sink' },
      { pattern: 'outerHTML', name: 'outerHTML sink' },
      { pattern: 'insertAdjacentHTML', name: 'insertAdjacentHTML sink' },
      { pattern: 'document.write', name: 'document.write sink' },
      { pattern: 'document.writeln', name: 'document.writeln sink' },
      { pattern: 'eval(', name: 'eval() sink' },
      { pattern: 'Function(', name: 'Function() sink' },
      { pattern: 'setTimeout(', name: 'setTimeout() with string sink' },
      { pattern: 'setInterval(', name: 'setInterval() with string sink' },
      { pattern: 'location.hash', name: 'location.hash sink' },
      { pattern: 'location.search', name: 'location.search sink' },
      { pattern: 'document.cookie', name: 'document.cookie sink' }
    ];

    for (const sink of sinkPatterns) {
      if (bodyHTML.includes(sink.pattern)) {
        sinks.hasSinks = true;
        sinks.dangerousSinks.push(sink.name);
      }
    }

    return sinks;
  }

  checkServiceWorker() {
    const sw = {
      hasIssues: false,
      registered: false,
      scopeIssues: []
    };

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      sw.registered = true;
      
      // Check for potential scope issues
      if (window.location.pathname.includes('/')) {
        sw.hasIssues = true;
        sw.scopeIssues.push('Service worker registered at root - check scope boundaries');
      }
    }

    return sw;
  }

  checkWebSockets() {
    const ws = {
      hasIssues: false,
      webSockets: [],
      issues: []
    };

    const bodyHTML = document.body.innerHTML;
    
    // Check for WebSocket connections
    const wsPatterns = [
      /new\s+WebSocket\s*\(/g,
      /ws:\/\//g,
      /wss:\/\//g
    ];

    for (const pattern of wsPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 0) {
        ws.hasIssues = true;
        ws.webSockets.push(`${matches.length} WebSocket connections detected`);
        ws.issues.push('WebSocket connections detected - verify origin validation and authentication');
      }
    }

    return ws;
  }

  checkTimingAttacks() {
    const timing = {
      hasTimingLeaks: false,
      patterns: []
    };

    const bodyHTML = document.body.innerHTML;

    // Check for timing-sensitive patterns
    const timingPatterns = [
      /Date\.now\(\)/g,
      /performance\.now\(\)/g,
      /setTimeout\s*\(/g,
      /setInterval\s*\(/g
    ];

    for (const pattern of timingPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 5) {
        timing.hasTimingLeaks = true;
        timing.patterns.push(`${matches.length} ${pattern} calls - potential timing leak`);
      }
    }

    return timing;
  }

  checkPrototypePollution() {
    const pollution = {
      hasPollution: false,
      patterns: []
    };

    const bodyHTML = document.body.innerHTML;

    // Check for prototype pollution vectors
    const pollutionPatterns = [
      /__proto__/g,
      /constructor\.prototype/g,
      /Object\.assign\s*\(/g,
      /\.\.\.spread/g,
      /merge\s*\(/g,
      /extend\s*\(/g,
      /JSON\.parse\s*\(/g
    ];

    for (const pattern of pollutionPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 0) {
        pollution.hasPollution = true;
        pollution.patterns.push(`${matches.length} ${pattern} occurrences - potential prototype pollution`);
      }
    }

    return pollution;
  }

  checkSSRFPatterns() {
    const ssrf = {
      hasPatterns: false,
      patterns: []
    };

    const bodyHTML = document.body.innerHTML;

    // Check for SSRF patterns
    const ssrfPatterns = [
      /fetch\s*\(\s*['"]http/g,
      /XMLHttpRequest.*open\s*\(\s*['"]GET/g,
      /location\.href\s*=/g,
      /window\.location\s*=/g,
      /document\.location\s*=/g,
      /url\s*:/g,
      /endpoint\s*:/g,
      /api\s*:/g
    ];

    for (const pattern of ssrfPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 0) {
        ssrf.hasPatterns = true;
        ssrf.patterns.push(`${matches.length} potential SSRF vectors: ${pattern}`);
      }
    }

    return ssrf;
  }
}
