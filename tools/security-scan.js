import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";
import { VulnerabilityChainAnalyzer } from "./security-chain-analyzer.js";
import { DeepSecurityAnalyzer } from "./security-deep-analyzer.js";

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

        // Calculate basic risk score
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
        if (report.iframes.withoutSandbox > 0) riskScore += 10;
        
        report.risk = {
          score: riskScore,
          level: riskLevel
        };

        // Advanced checks and risk score will be calculated server-side
        report.advanced = {};

        return report;
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`security_scan: ${result.exceptionDetails.text}`);
    }

    const report = result.result.value;

    

    report.advanced = {
      cspBypass: this.checkCSPBypass(report),
      corsMisconfig: this.checkCORSMisconfig(),
      domXssSinks: this.checkDOMXssSinks(),
      serviceWorker: this.checkServiceWorker(),
      websockets: this.checkWebSockets(),
      timingAttacks: this.checkTimingAttacks(),
      prototypePollution: this.checkPrototypePollution(),
      ssrfPatterns: this.checkSSRFPatterns(),
      idorPatterns: this.checkIDORPatterns(),
      csrfAnalysis: this.checkCSRFAnalysis(),
      sessionCookieSecurity: this.checkSessionCookieSecurity(),
      authenticationFlow: this.checkAuthenticationFlow(),
      authorizationPatterns: this.checkAuthorizationPatterns(),
      parameterTampering: this.checkParameterTampering(),
      cacheHeaders: this.checkCacheHeaders(),
      advancedClickjacking: this.checkAdvancedClickjacking(),
      apiEndpoints: this.checkAPIEndpoints(),
      raceConditions: this.checkRaceConditions(),
      businessLogic: this.checkBusinessLogic(),
      supplyChain: this.checkSupplyChain(),
      errorHandling: this.checkErrorHandling(),
      fileUploadSecurity: this.checkFileUploadSecurity(),
      rateLimiting: this.checkRateLimiting(),
      domXssAdvanced: this.checkDOMXssAdvanced(),
      webCachePoisoning: this.checkWebCachePoisoning(),
      graphqlSecurity: this.checkGraphQLSecurity(),
      informationGathering: this.checkInformationGathering(),
      sslTlsAnalysis: this.checkSSLTlsAnalysis(),
      sqlInjection: this.checkSQLInjection(),
      commandInjection: this.checkCommandInjection(),
      jwtAnalysis: this.checkJWTAnalysis(),
      oauthAnalysis: this.checkOAuthAnalysis(),
      massAssignment: this.checkMassAssignment(),
    };

    

    report.risk.score = this.calculateFullRisk(report);
    if (report.risk.score >= 80) report.risk.level = 'CRITICAL';
    else if (report.risk.score >= 60) report.risk.level = 'HIGH';
    else if (report.risk.score >= 30) report.risk.level = 'MEDIUM';
    else report.risk.level = 'LOW';

    

    const deepResult = await sendCommand("Runtime.evaluate", {
      expression: this.getDeepAnalysisScript(),
      returnByValue: true,
      awaitPromise: false,
    });
    if (!deepResult.exceptionDetails) {
      report.deep = deepResult.result.value;
    }

    

    report.recommendations = this.generateRecommendations(report);

    

    const chainAnalyzer = new VulnerabilityChainAnalyzer(report);
    report.chainAnalysis = chainAnalyzer.analyze();

    

    if (report.chainAnalysis.contextScore > report.risk.score) {
      report.risk.score = report.chainAnalysis.contextScore;
      if (report.risk.score >= 80) report.risk.level = 'CRITICAL';
      else if (report.risk.score >= 60) report.risk.level = 'HIGH';
      else if (report.risk.score >= 30) report.risk.level = 'MEDIUM';
    }

    

    if (report.chainAnalysis.chains.length > 0) {
      for (const chain of report.chainAnalysis.chains) {
        report.recommendations.push({
          severity: chain.severity,
          issue: `Chain: ${chain.name}`,
          recommendation: chain.recommendation,
          chainId: chain.id,
          steps: chain.steps.length,
          combinedRisk: chain.combinedRisk
        });
      }
    }

    return report;
  }

  calculateFullRisk(report) {
    let score = 0;
    const adv = report.advanced || {};

    

    if (!report.headers?.csp) score += 20;
    if (!report.headers?.xFrameOptions) score += 15;
    if (report.mixedContent?.hasMixedContent) score += 25;
    if (report.xss?.hasDangerousMethods) score += 20;
    if (report.scripts?.inline > 0 && !report.headers?.csp) score += 10;
    if (report.links?.javascript > 0) score += 15;
    if (report.links?.data > 0) score += 15;
    if (report.cookies?.hasCookies) score += 5;
    if (report.iframes?.withoutSandbox > 0) score += 10;

    

    if (adv.cspBypass?.hasBypass) score += 15;
    if (adv.corsMisconfig?.hasMisconfig) score += 20;
    if (adv.domXssSinks?.hasSinks) score += 25;
    if (adv.serviceWorker?.hasIssues) score += 10;
    if (adv.websockets?.hasIssues) score += 15;
    if (adv.timingAttacks?.hasTimingLeaks) score += 20;
    if (adv.prototypePollution?.hasPollution) score += 25;
    if (adv.ssrfPatterns?.hasPatterns) score += 20;

    

    if (adv.idorPatterns?.hasPatterns) score += 30;
    if (adv.csrfAnalysis?.hasIssues) score += 25;
    if (adv.sessionCookieSecurity?.hasIssues) score += 20;
    if (adv.authenticationFlow?.hasIssues) score += 30;
    if (adv.authorizationPatterns?.hasIssues) score += 25;
    if (adv.parameterTampering?.hasIssues) score += 20;

    

    if (adv.cacheHeaders?.hasIssues) score += 15;
    if (adv.advancedClickjacking?.hasIssues) score += 15;
    if (adv.apiEndpoints?.hasEndpoints) score += 10;
    if (adv.raceConditions?.hasIndicators) score += 20;

    

    if (adv.businessLogic?.hasPatterns) score += 15;
    if (adv.supplyChain?.hasIssues) score += 10;
    if (adv.errorHandling?.hasLeaks) score += 15;
    if (adv.fileUploadSecurity?.hasIssues) score += 15;
    if (adv.rateLimiting?.hasIndicators) score += 10;
    if (adv.domXssAdvanced?.hasVectors) score += 20;
    if (adv.webCachePoisoning?.hasVectors) score += 15;
    if (adv.graphqlSecurity?.hasIssues) score += 15;
    if (adv.informationGathering?.hasFindings) score += 10;
    if (adv.sslTlsAnalysis?.hasIssues) score += 20;
    if (adv.sqlInjection?.hasPatterns) score += 30;
    if (adv.commandInjection?.hasPatterns) score += 30;
    if (adv.jwtAnalysis?.hasIssues) score += 25;
    if (adv.oauthAnalysis?.hasIssues) score += 20;
    if (adv.massAssignment?.hasPatterns) score += 20;

    return score;
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

    if (report.iframes.withoutSandbox > 0) {
      recommendations.push({
        severity: 'MEDIUM',
        issue: 'Iframes Without Sandbox',
        recommendation: 'Add sandbox attribute to iframes',
        count: report.iframes.withoutSandbox
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
      return bypass; 

    }

    const csp = report.headers.csp.toLowerCase();
    
    

    if (csp.includes('unsafe-eval')) {
      bypass.hasBypass = true;
      bypass.techniques.push('script-src includes unsafe-eval');
    }

    

    if (csp.includes('unsafe-inline')) {
      bypass.hasBypass = true;
      bypass.techniques.push('script-src/style-src includes unsafe-inline');
    }

    

    if (csp.includes('*')) {
      bypass.hasBypass = true;
      bypass.techniques.push('Wildcard domains in CSP');
    }

    

    if (csp.includes('data:')) {
      bypass.hasBypass = true;
      bypass.techniques.push('data: URIs allowed');
    }

    

    if (!csp.includes('object-src')) {
      bypass.hasBypass = true;
      bypass.techniques.push('Missing object-src directive');
    }

    

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

    

    

    const fetchCalls = document.body.innerHTML.match(/fetch\s*\(/g) || [];
    if (fetchCalls.length > 0) {
      misconfig.hasMisconfig = true;
      misconfig.issues.push(`${fetchCalls.length} fetch() calls detected - verify CORS headers`);
    }

    

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

  checkIDORPatterns() {
    const idor = {
      hasPatterns: false,
      patterns: [],
      endpoints: []
    };

    const url = window.location.href;
    const bodyHTML = document.body.innerHTML;

    // Check for IDOR-friendly URL patterns
    const idorPatterns = [
      /\/api\/(users|files|documents|orders|invoices|products|posts|comments|messages)\/\d+/g,
      /\/(user|file|document|order|invoice|product|post|comment|message)\/\d+/g,
      /\/api\/\w+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, // UUID
      /\/\w+\/id\/\d+/g,
      /\/\w+\/\d+/g
    ];

    for (const pattern of idorPatterns) {
      const matches = url.match(pattern);
      if (matches) {
        idor.hasPatterns = true;
        idor.patterns.push(`IDOR pattern: ${pattern}`);
        idor.endpoints.push(matches[0]);
      }
    }

    // Check for sequential ID patterns in links
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.match(/\/\d+$/)) {
        idor.hasPatterns = true;
        idor.endpoints.push(href);
      }
    }

    return idor;
  }

  checkCSRFAnalysis() {
    const csrf = {
      hasIssues: false,
      issues: [],
      tokens: []
    };

    const forms = document.querySelectorAll('form');
    
    for (const form of forms) {
      const tokenInput = form.querySelector('input[type="hidden"][name*="token"], input[type="hidden"][name*="csrf"]');
      
      if (!tokenInput) {
        csrf.hasIssues = true;
        csrf.issues.push(`Form without CSRF token: ${form.action || 'current'}`);
      } else {
        const tokenValue = tokenInput.value;
        csrf.tokens.push({
          form: form.action || 'current',
          tokenLength: tokenValue.length,
          tokenEntropy: this.calculateEntropy(tokenValue)
        });
        
        // Check for weak tokens
        if (tokenValue.length < 16) {
          csrf.hasIssues = true;
          csrf.issues.push(`Weak CSRF token length: ${tokenValue.length}`);
        }
        if (this.calculateEntropy(tokenValue) < 2.0) {
          csrf.hasIssues = true;
          csrf.issues.push('Low entropy CSRF token');
        }
      }
    }

    return csrf;
  }

  checkSessionCookieSecurity() {
    const cookieSecurity = {
      hasIssues: false,
      issues: [],
      cookies: []
    };

    const cookies = document.cookie.split(';').filter(c => c.trim());
    
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      const cookieInfo = {
        name: name,
        hasSecure: false,
        hasHttpOnly: false,
        hasSameSite: false,
        sameSiteValue: null
      };

      // Check cookie attributes (this is limited in client-side JS)
      // We can only check the cookie value, not the actual attributes
      // This would need to be checked via HTTP response headers
      
      cookieSecurity.cookies.push(cookieInfo);
      
      // Check for session-related cookies
      if (name.toLowerCase().includes('session') || name.toLowerCase().includes('sid')) {
        if (value.length < 16) {
          cookieSecurity.hasIssues = true;
          cookieSecurity.issues.push(`Short session ID: ${name} (${value.length} chars)`);
        }
      }
    }

    return cookieSecurity;
  }

  checkAuthenticationFlow() {
    const auth = {
      hasIssues: false,
      issues: [],
      loginForms: [],
      passwordResetLinks: []
    };

    // Check for login forms
    const loginForms = document.querySelectorAll('form');
    for (const form of loginForms) {
      const passwordInput = form.querySelector('input[type="password"]');
      const usernameInput = form.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"]');
      
      if (passwordInput && usernameInput) {
        const loginForm = {
          action: form.action || 'current',
          hasAutocomplete: passwordInput.hasAttribute('autocomplete'),
          autocompleteValue: passwordInput.getAttribute('autocomplete'),
          hasMFA: false
        };

        // Check for MFA indicators
        const mfaKeywords = ['mfa', '2fa', 'two-factor', 'totp', 'sms', 'code'];
        const formText = form.textContent.toLowerCase();
        loginForm.hasMFA = mfaKeywords.some(keyword => formText.includes(keyword));

        auth.loginForms.push(loginForm);

        if (!loginForm.hasAutocomplete || loginForm.autocompleteValue === 'on') {
          auth.hasIssues = true;
          auth.issues.push('Password field with autocomplete enabled');
        }

        if (!loginForm.hasMFA) {
          auth.hasIssues = true;
          auth.issues.push('Login form without MFA');
        }
      }
    }

    // Check for password reset links
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href');
      const text = link.textContent.toLowerCase();
      
      if (href && (text.includes('reset') || text.includes('forgot') || text.includes('recover'))) {
        auth.passwordResetLinks.push(href);
      }
    }

    return auth;
  }

  checkAuthorizationPatterns() {
    const authz = {
      hasIssues: false,
      issues: [],
      adminEndpoints: [],
      rolePatterns: []
    };

    const url = window.location.href;
    const bodyHTML = document.body.innerHTML;

    // Check for admin endpoints
    const adminPatterns = [
      /\/admin/gi,
      /\/dashboard/gi,
      /\/management/gi,
      /\/settings/gi,
      /\/api\/admin/gi
    ];

    for (const pattern of adminPatterns) {
      if (url.match(pattern)) {
        authz.adminEndpoints.push(url);
      }
    }

    // Check for role-based access patterns in links
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.match(/\/(admin|user|moderator|manager)/)) {
        authz.rolePatterns.push(href);
      }
    }

    // Check for API key exposure in JavaScript
    const apiKeyPatterns = [
      /api[_-]?key\s*[:=]\s*['"][\w-]+['"]/gi,
      /apikey\s*[:=]\s*['"][\w-]+['"]/gi,
      /secret[_-]?key\s*[:=]\s*['"][\w-]+['"]/gi
    ];

    for (const pattern of apiKeyPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        authz.hasIssues = true;
        authz.issues.push(`Potential API key exposure: ${matches.length} matches`);
      }
    }

    return authz;
  }

  checkParameterTampering() {
    const tampering = {
      hasIssues: false,
      issues: [],
      hiddenFields: [],
      cookieParams: []
    };

    // Check for hidden fields
    const hiddenFields = document.querySelectorAll('input[type="hidden"]');
    for (const field of hiddenFields) {
      const fieldName = field.name.toLowerCase();
      const fieldValue = field.value;
      
      tampering.hiddenFields.push({
        name: field.name,
        value: fieldValue.substring(0, 50) + (fieldValue.length > 50 ? '...' : ''),
        isSensitive: fieldName.includes('price') || fieldName.includes('amount') || fieldName.includes('id') || fieldName.includes('user')
      });

      if (fieldValue && (fieldName.includes('price') || fieldName.includes('amount'))) {
        tampering.hasIssues = true;
        tampering.issues.push(`Sensitive data in hidden field: ${field.name}`);
      }
    }

    // Check cookie parameters
    const cookies = document.cookie.split(';').filter(c => c.trim());
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      const cookieName = name.toLowerCase();
      
      if (cookieName.includes('role') || cookieName.includes('user') || cookieName.includes('admin')) {
        tampering.cookieParams.push(name);
        tampering.hasIssues = true;
        tampering.issues.push(`Sensitive parameter in cookie: ${name}`);
      }
    }

    return tampering;
  }

  checkCacheHeaders() {
    const cache = {
      hasIssues: false,
      issues: [],
      headers: []
    };

    // This would need to check HTTP response headers
    // For now, we check for cache-related meta tags
    const metaNoCache = document.querySelector('meta[http-equiv="Cache-Control"]');
    const metaPragma = document.querySelector('meta[http-equiv="Pragma"]');
    const metaExpires = document.querySelector('meta[http-equiv="Expires"]');

    if (!metaNoCache && !metaPragma) {
      cache.hasIssues = true;
      cache.issues.push('Missing cache control meta tags');
    }

    return cache;
  }

  checkAdvancedClickjacking() {
    const clickjack = {
      hasIssues: false,
      issues: [],
      pointerEvents: false,
      dragDrop: false
    };

    const bodyHTML = document.body.innerHTML;

    // Check for pointer-events manipulation
    if (bodyHTML.includes('pointer-events') || bodyHTML.includes('pointerEvents')) {
      clickjack.pointerEvents = true;
      clickjack.hasIssues = true;
      clickjack.issues.push('Pointer events manipulation detected');
    }

    // Check for drag-and-drop functionality
    if (bodyHTML.includes('ondrag') || bodyHTML.includes('ondrop')) {
      clickjack.dragDrop = true;
      clickjack.hasIssues = true;
      clickjack.issues.push('Drag-and-drop functionality detected');
    }

    return clickjack;
  }

  checkAPIEndpoints() {
    const api = {
      hasEndpoints: false,
      endpoints: [],
      restAPI: [],
      graphql: false
    };

    const bodyHTML = document.body.innerHTML;
    const url = window.location.href;

    // Check for REST API patterns
    const restPatterns = [
      /\/api\/v?\d*\//g,
      /\/v\d+\//g
    ];

    for (const pattern of restPatterns) {
      const matches = url.match(pattern);
      if (matches) {
        api.hasEndpoints = true;
        api.restAPI.push(matches[0]);
      }
    }

    // Check for GraphQL
    if (bodyHTML.includes('graphql') || bodyHTML.includes('/graphql')) {
      api.graphql = true;
      api.hasEndpoints = true;
    }

    // Check for API calls in JavaScript
    const fetchPatterns = [
      /fetch\s*\(\s*['"]\/api\//g,
      /axios\.(get|post|put|delete)\s*\(/g
    ];

    for (const pattern of fetchPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        api.hasEndpoints = true;
        api.endpoints.push(`${matches.length} API calls detected`);
      }
    }

    return api;
  }

  checkRaceConditions() {
    const race = {
      hasIndicators: false,
      indicators: []
    };

    const bodyHTML = document.body.innerHTML;

    

    const racePatterns = [
      /setTimeout\s*\(/g,
      /setInterval\s*\(/g,
      /Promise\.all\s*\(/g,
      /Promise\.race\s*\(/g,
      /async\s+function/g,
      /await\s+/g
    ];

    for (const pattern of racePatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 10) {
        race.hasIndicators = true;
        race.indicators.push(`${matches.length} async operations detected`);
      }
    }

    return race;
  }

  checkBusinessLogic() {
    const logic = {
      hasPatterns: false,
      patterns: []
    };

    const bodyHTML = document.body.innerHTML;

    

    const logicPatterns = [
      /price\s*[:=]/gi,
      /discount\s*[:=]/gi,
      /coupon\s*[:=]/gi,
      /cart\s*[:=]/gi,
      /checkout\s*[:=]/gi,
      /payment\s*[:=]/gi,
      /order\s*[:=]/gi
    ];

    for (const pattern of logicPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        logic.hasPatterns = true;
        logic.patterns.push(`${matches.length} business logic patterns: ${pattern}`);
      }
    }

    return logic;
  }

  checkSupplyChain() {
    const supply = {
      hasIssues: false,
      issues: [],
      externalLibraries: []
    };

    const scripts = document.querySelectorAll('script[src]');
    
    for (const script of scripts) {
      const src = script.src;
      
      

      if (src.includes('cdn') || src.includes('cdnjs') || src.includes('unpkg') || src.includes('jsdelivr')) {
        supply.externalLibraries.push({
          src: src,
          type: 'CDN',
          hasIntegrity: script.hasAttribute('integrity')
        });
        
        if (!script.hasAttribute('integrity')) {
          supply.hasIssues = true;
          supply.issues.push(`CDN script without SRI: ${src}`);
        }
      }
    }

    return supply;
  }

  checkErrorHandling() {
    const error = {
      hasLeaks: false,
      leaks: []
    };

    const bodyHTML = document.body.innerHTML;

    

    const errorPatterns = [
      /console\.(log|error|warn|debug)\s*\(/g,
      /console\.trace\s*\(/g,
      /debugger\s*;/g,
      /stack\s*[:=]/gi
    ];

    for (const pattern of errorPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 5) {
        error.hasLeaks = true;
        error.leaks.push(`${matches.length} debug statements: ${pattern}`);
      }
    }

    return error;
  }

  calculateEntropy(str) {
    if (!str) return 0;
    const len = str.length;
    const charset = new Set(str.split(''));
    return Math.log2(charset.size) * (len / Math.max(len, 1));
  }

  checkFileUploadSecurity() {
    const upload = {
      hasIssues: false,
      issues: [],
      uploadForms: [],
      fileTypes: []
    };

    

    const forms = document.querySelectorAll('form');
    for (const form of forms) {
      const fileInput = form.querySelector('input[type="file"]');
      
      if (fileInput) {
        const accept = fileInput.getAttribute('accept');
        const multiple = fileInput.hasAttribute('multiple');
        
        upload.uploadForms.push({
          action: form.action || 'current',
          hasAccept: !!accept,
          acceptValue: accept || 'any',
          hasMultiple: multiple
        });

        if (!accept) {
          upload.hasIssues = true;
          upload.issues.push('File upload without accept attribute');
        }

        if (multiple) {
          upload.hasIssues = true;
          upload.issues.push('Multiple file upload enabled');
        }
      }
    }

    

    const bodyHTML = document.body.innerHTML;
    const fileTypePatterns = [
      /\.png|\.jpg|\.jpeg|\.gif/gi,
      /\.pdf|\.doc|\.docx|\.xls/gi,
      /image\//gi,
      /application\//gi
    ];

    for (const pattern of fileTypePatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        upload.fileTypes.push(`${matches.length} file type patterns: ${pattern}`);
      }
    }

    return upload;
  }

  checkRateLimiting() {
    const rateLimit = {
      hasIndicators: false,
      indicators: [],
      headers: []
    };

    

    

    const bodyHTML = document.body.innerHTML;

    const rateLimitPatterns = [
      /rate[_-]?limit/gi,
      /throttle/gi,
      /quota/gi,
      /429/gi,
      /too many requests/gi
    ];

    for (const pattern of rateLimitPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        rateLimit.hasIndicators = true;
        rateLimit.indicators.push(`${matches.length} rate limiting patterns: ${pattern}`);
      }
    }

    return rateLimit;
  }

  checkDOMXssAdvanced() {
    const domXss = {
      hasVectors: false,
      vectors: []
    };

    const bodyHTML = document.body.innerHTML;

    

    const domXssPatterns = [
      /location\.hash/gi,
      /location\.search/gi,
      /window\.name/gi,
      /postMessage/gi,
      /document\.URL/gi,
      /document\.documentURI/gi,
      /URLSearchParams/gi,
      /decodeURIComponent/gi,
      /atob\(/gi,
      /btoa\(/gi
    ];

    for (const pattern of domXssPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 0) {
        domXss.hasVectors = true;
        domXss.vectors.push(`${matches.length} DOM XSS vectors: ${pattern}`);
      }
    }

    

    if (bodyHTML.includes('self') || bodyHTML.includes('this')) {
      domXss.hasVectors = true;
      domXss.vectors.push('Potential self-XSS patterns detected');
    }

    return domXss;
  }

  checkWebCachePoisoning() {
    const cachePoison = {
      hasVectors: false,
      vectors: []
    };

    const bodyHTML = document.body.innerHTML;

    

    const cachePoisonPatterns = [
      /X-Forwarded-For/gi,
      /X-Real-IP/gi,
      /Host:/gi,
      /User-Agent:/gi,
      /Accept-Language:/gi,
      /Accept-Encoding:/gi
    ];

    for (const pattern of cachePoisonPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 0) {
        cachePoison.hasVectors = true;
        cachePoison.vectors.push(`${matches.length} cache poisoning vectors: ${pattern}`);
      }
    }

    return cachePoison;
  }

  checkGraphQLSecurity() {
    const graphql = {
      hasIssues: false,
      issues: [],
      introspection: false,
      queryDepth: false
    };

    const bodyHTML = document.body.innerHTML;

    

    if (bodyHTML.includes('__schema') || bodyHTML.includes('__type') || bodyHTML.includes('introspection')) {
      graphql.introspection = true;
      graphql.hasIssues = true;
      graphql.issues.push('GraphQL introspection may be enabled');
    }

    

    if (bodyHTML.includes('fragment') || bodyHTML.includes('query depth')) {
      graphql.queryDepth = true;
      graphql.hasIssues = true;
      graphql.issues.push('Potential GraphQL depth analysis issues');
    }

    

    if (bodyHTML.includes('batch') || bodyHTML.includes('parallel')) {
      graphql.hasIssues = true;
      graphql.issues.push('Potential N+1 query patterns');
    }

    return graphql;
  }

  checkInformationGathering() {
    const recon = {
      hasFindings: false,
      findings: [],
      technologies: [],
      frameworks: [],
      comments: []
    };

    const bodyHTML = document.body.innerHTML;
    const url = window.location.href;

    

    const techPatterns = [
      { pattern: /react/gi, name: 'React' },
      { pattern: /vue/gi, name: 'Vue.js' },
      { pattern: /angular/gi, name: 'Angular' },
      { pattern: /jquery/gi, name: 'jQuery' },
      { pattern: /bootstrap/gi, name: 'Bootstrap' },
      { pattern: /tailwind/gi, name: 'Tailwind CSS' },
      { pattern: /express/gi, name: 'Express.js' },
      { pattern: /django/gi, name: 'Django' },
      { pattern: /rails/gi, name: 'Ruby on Rails' },
      { pattern: /laravel/gi, name: 'Laravel' },
      { pattern: /spring/gi, name: 'Spring' },
      { pattern: /asp\.net/gi, name: 'ASP.NET' },
      { pattern: /php/gi, name: 'PHP' },
      { pattern: /wordpress/gi, name: 'WordPress' },
      { pattern: /drupal/gi, name: 'Drupal' }
    ];

    for (const tech of techPatterns) {
      if (bodyHTML.match(tech.pattern)) {
        recon.technologies.push(tech.name);
        recon.hasFindings = true;
      }
    }

    

    const frameworkPatterns = [
      /next\.js/gi,
      /nuxt/gi,
      /gatsby/gi,
      /nuxt/gi
    ];

    for (const pattern of frameworkPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        recon.frameworks.push(matches[0]);
        recon.hasFindings = true;
      }
    }

    

    const commentPatterns = [
      /<!--.*TODO.*-->/gi,
      /<!--.*FIXME.*-->/gi,
      /<!--.*DEBUG.*-->/gi,
      /<!--.*test.*-->/gi,
      /<!--.*admin.*-->/gi
    ];

    for (const pattern of commentPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        recon.comments.push(matches[0].substring(0, 50));
        recon.hasFindings = true;
      }
    }

    return recon;
  }

  checkSSLTlsAnalysis() {
    const ssl = {
      hasIssues: false,
      issues: [],
      protocol: window.location.protocol,
      isHTTPS: window.location.protocol === 'https:',
      isSecureContext: window.isSecureContext,
      certificate: {
        valid: false,
        issuer: null,
        subject: null,
        validUntil: null
      }
    };

    if (!ssl.isHTTPS) {
      ssl.hasIssues = true;
      ssl.issues.push('Not using HTTPS');
    }

    if (!ssl.isSecureContext) {
      ssl.hasIssues = true;
      ssl.issues.push('Not in secure context');
    }

    

    

    const metaTags = document.querySelectorAll('meta');
    for (const meta of metaTags) {
      const httpEquiv = meta.getAttribute('http-equiv');
      const content = meta.getAttribute('content');
      
      if (httpEquiv && httpEquiv.toLowerCase() === 'strict-transport-security' && content) {
        ssl.certificate.valid = true;
      }
    }

    return ssl;
  }

  checkSQLInjection() {
    const sqli = {
      hasPatterns: false,
      patterns: [],
      forms: [],
      parameters: []
    };

    const bodyHTML = document.body.innerHTML;
    const url = window.location.href;

    

    const sqliPatterns = [
      /SELECT\s+\*/gi,
      /UNION\s+SELECT/gi,
      /OR\s+1\s*=\s*1/gi,
      /AND\s+1\s*=\s*1/gi,
      /DROP\s+TABLE/gi,
      /INSERT\s+INTO/gi,
      /UPDATE\s+\w+\s+SET/gi,
      /DELETE\s+FROM/gi,
      /--/gi,
      /'/gi,
      /"/gi
    ];

    for (const pattern of sqliPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 0) {
        sqli.hasPatterns = true;
        sqli.patterns.push(`${matches.length} SQL injection patterns: ${pattern}`);
      }
    }

    // Check for form parameters that might be vulnerable
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
      const inputs = form.querySelectorAll('input, select, textarea');
      for (const input of inputs) {
        const name = input.name || input.id;
        if (name) {
          sqli.parameters.push(name);
        }
      }
    }

    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    for (const param of urlParams) {
      sqli.parameters.push(param[0]);
    }

    return sqli;
  }

  checkCommandInjection() {
    const cmdi = {
      hasPatterns: false,
      patterns: [],
      forms: [],
      parameters: []
    };

    const bodyHTML = document.body.innerHTML;

    // Check for command injection patterns
    const cmdiPatterns = [
      /;\s*\w+/g,
      /\|\s*\w+/g,
      /&&\s*\w+/g,
      /\$\(/g,
      /`[^`]*`/g,
      /exec\s*\(/gi,
      /system\s*\(/gi,
      /passthru\s*\(/gi,
      /shell_exec\s*\(/gi,
      /eval\s*\(/gi
    ];

    for (const pattern of cmdiPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 0) {
        cmdi.hasPatterns = true;
        cmdi.patterns.push(`${matches.length} command injection patterns: ${pattern}`);
      }
    }

    // Check for form parameters
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
      const inputs = form.querySelectorAll('input, select, textarea');
      for (const input of inputs) {
        const name = input.name || input.id;
        if (name) {
          cmdi.parameters.push(name);
        }
      }
    }

    return cmdi;
  }

  checkJWTAnalysis() {
    const jwt = {
      hasIssues: false,
      issues: [],
      tokens: [],
      algorithms: []
    };

    const bodyHTML = document.body.innerHTML;
    const cookies = document.cookie.split(';').filter(c => c.trim());

    // Check for JWT patterns in cookies
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (value && value.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/)) {
        jwt.tokens.push({
          name: name,
          hasToken: true
        });
        jwt.hasIssues = true;
        jwt.issues.push(`JWT token in cookie: ${name}`);
      }
    }

    // Check for JWT patterns in JavaScript
    const jwtPatterns = [
      /jwt/gi,
      /jsonwebtoken/gi,
      /bearer/gi,
      /authorization\s*[:=]/gi
    ];

    for (const pattern of jwtPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        jwt.algorithms.push(`${matches.length} JWT patterns: ${pattern}`);
      }
    }

    return jwt;
  }

  checkOAuthAnalysis() {
    const oauth = {
      hasIssues: false,
      issues: [],
      providers: [],
      endpoints: []
    };

    const bodyHTML = document.body.innerHTML;
    const url = window.location.href;

    // Check for OAuth providers
    const oauthProviders = [
      'google',
      'facebook',
      'github',
      'twitter',
      'linkedin',
      'microsoft',
      'apple',
      'auth0',
      'okta',
      'saml'
    ];

    for (const provider of oauthProviders) {
      if (bodyHTML.toLowerCase().includes(provider) || url.toLowerCase().includes(provider)) {
        oauth.providers.push(provider);
      }
    }

    // Check for OAuth endpoints
    const oauthEndpoints = [
      /\/oauth\/authorize/gi,
      /\/oauth\/token/gi,
      /\/auth\/login/gi,
      /\/callback/gi,
      /\/redirect/gi,
      /client_id/gi,
      /response_type/gi
    ];

    for (const pattern of oauthEndpoints) {
      const matches = url.match(pattern);
      if (matches) {
        oauth.endpoints.push(matches[0]);
        oauth.hasIssues = true;
        oauth.issues.push(`OAuth endpoint detected: ${matches[0]}`);
      }
    }

    // Check for redirect_uri parameter
    if (url.includes('redirect_uri') || bodyHTML.includes('redirect_uri')) {
      oauth.hasIssues = true;
      oauth.issues.push('redirect_uri parameter detected - check for open redirect');
    }

    return oauth;
  }

  checkMassAssignment() {
    const massAssign = {
      hasPatterns: false,
      patterns: [],
      forms: [],
      frameworks: []
    };

    const bodyHTML = document.body?.innerHTML || "";

    // Check for mass assignment patterns
    const massAssignPatterns = [
      /mass_assign/gi,
      /attr_accessible/gi,
      /permit/gi,
      /strong_parameters/gi,
      /whitelist/gi,
      /blacklist/gi,
      /fill\s*\(/gi,
      /assign\s*\(/gi,
      /merge\s*\(/gi,
      /update\s*\(/gi
    ];

    for (const pattern of massAssignPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches && matches.length > 0) {
        massAssign.hasPatterns = true;
        massAssign.patterns.push(`${matches.length} mass assignment patterns: ${pattern}`);
      }
    }

    // Check for frameworks that are vulnerable to mass assignment
    const frameworkPatterns = [
      /rails/gi,
      /django/gi,
      /laravel/gi,
      /express/gi
    ];

    for (const pattern of frameworkPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        massAssign.frameworks.push(matches[0]);
      }
    }

    // Check for forms with many fields (potential mass assignment)
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
      const inputs = form.querySelectorAll('input, select, textarea');
      if (inputs.length > 10) {
        massAssign.forms.push({
          action: form.action || 'current',
          fieldCount: inputs.length
        });
        massAssign.hasPatterns = true;
      }
    }

    return massAssign;
  }

  getDeepAnalysisScript() {
    return `(() => {
      const r = {
        behavioralFingerprinting: (() => {
          const bodyHTML = document.body.innerHTML;
          const res = {
            hasIssues: false, issues: [],
            timers: (bodyHTML.match(/setTimeout/gi)||[]).length+(bodyHTML.match(/setInterval/gi)||[]).length,
            websockets: (bodyHTML.match(/new\\s+WebSocket/gi)||[]).length,
            sse: (bodyHTML.match(/new\\s+EventSource/gi)||[]).length,
            dynamicImports: (bodyHTML.match(/import\\s*\\(/gi)||[]).length,
            evalUsage: (bodyHTML.match(/eval\\s*\\(/gi)||[]).length,
            functionConstructor: (bodyHTML.match(/new\\s+Function\\s*\\(/gi)||[]).length,
            prototypePollutionSinks: (bodyHTML.match(/Object\\.assign\\s*\\(/gi)||[]).length+(bodyHTML.match(/JSON\\.parse\\s*\\(/gi)||[]).length+(bodyHTML.match(/lodash/gi)||[]).length
          };
          if (res.dynamicImports>0) { res.hasIssues=true; res.issues.push('Dynamic imports: '+res.dynamicImports); }
          if (res.evalUsage>0) { res.hasIssues=true; res.issues.push('eval() usage: '+res.evalUsage); }
          if (res.functionConstructor>0) { res.hasIssues=true; res.issues.push('Function constructor: '+res.functionConstructor); }
          if (res.prototypePollutionSinks>0) { res.hasIssues=true; res.issues.push('Prototype pollution sinks: '+res.prototypePollutionSinks); }
          return res;
        })(),
        shadowDOM: (() => {
          const res = { hasIssues:false, issues:[], shadowRoots:0, openShadowRoots:0, closedShadowRoots:0 };
          document.querySelectorAll('*').forEach(el=>{
            if (el.shadowRoot) { res.shadowRoots++; if(el.shadowRoot.mode==='open') res.openShadowRoots++; else res.closedShadowRoots++; }
          });
          if (res.openShadowRoots>0) { res.hasIssues=true; res.issues.push(res.openShadowRoots+' open shadow roots'); }
          return res;
        })(),
        webComponents: (() => {
          const res = { hasIssues:false, issues:[], customElements:0, definedElements:[], unregisteredElements:[] };
          const bodyHTML = document.body.innerHTML;
          const m = bodyHTML.match(/<([a-z]+-[a-z-]+)/gi);
          if (m) {
            m.forEach(tag=>{ const t=tag.slice(1); res.customElements++; if(window.customElements && window.customElements.get(t)) res.definedElements.push(t); else res.unregisteredElements.push(t); });
          }
          if (res.unregisteredElements.length>0) { res.hasIssues=true; res.issues.push('Unregistered: '+res.unregisteredElements.join(',')); }
          return res;
        })(),
        serviceWorkers: {
          serviceWorkerSupported: 'serviceWorker' in navigator,
          pushManagerSupported: 'PushManager' in window,
          cacheStorage: 'caches' in window,
          backgroundFetchSupported: 'BackgroundFetchManager' in window
        },
        crossOriginCommunication: (() => {
          const bodyHTML = document.body.innerHTML;
          const res = { hasIssues:false, issues:[], postMessageSenders:(bodyHTML.match(/postMessage/gi)||[]).length, broadcastChannels:(bodyHTML.match(/new\\s+BroadcastChannel/gi)||[]).length, wildcardOrigin:!!bodyHTML.match(/postMessage\\s*\\(\\s*[^,]+,\\s*['"]?\\*/gi) };
          if (res.wildcardOrigin) { res.hasIssues=true; res.issues.push('postMessage wildcard origin'); }
          if (res.broadcastChannels>0) { res.hasIssues=true; res.issues.push('BroadcastChannel: '+res.broadcastChannels); }
          return res;
        })(),
        cryptography: (() => {
          const bodyHTML = document.body.innerHTML;
          const res = { hasIssues:false, issues:[], webCryptoSupported:'crypto' in window && 'subtle' in window.crypto, mathRandomUsage:(bodyHTML.match(/Math\\.random\\s*\\(/gi)||[]).length, dateNowUsage:(bodyHTML.match(/Date\\.now\\s*\\(/gi)||[]).length+(bodyHTML.match(/new\\s+Date\\s*\\(/gi)||[]).length, customCrypto:false };
          if (res.mathRandomUsage>0) { res.hasIssues=true; res.issues.push('Math.random(): '+res.mathRandomUsage); }
          if (res.dateNowUsage>5) { res.hasIssues=true; res.issues.push('Date usage: '+res.dateNowUsage); }
          if (bodyHTML.match(/md5|sha1\\s*\\(|custom.*encrypt|rot13/gi)) { res.customCrypto=true; res.hasIssues=true; res.issues.push('Custom/weak crypto'); }
          return res;
        })(),
        memoryLeaks: (() => {
          const bodyHTML = document.body.innerHTML;
          const res = { hasIssues:false, issues:[], intervalLeaks:(bodyHTML.match(/setInterval/gi)||[]).length-(bodyHTML.match(/clearInterval/gi)||[]).length };
          if (res.intervalLeaks>2) { res.hasIssues=true; res.issues.push('Interval leaks: '+res.intervalLeaks); }
          if (bodyHTML.includes('addEventListener') && !bodyHTML.includes('removeEventListener')) { res.hasIssues=true; res.issues.push('Event listeners without removal'); }
          return res;
        })(),
        performanceTiming: (() => {
          const bodyHTML = document.body.innerHTML;
          const res = { hasIssues:false, issues:[], performanceEntries:0, timingAttacks:!!(bodyHTML.includes('performance.now')||bodyHTML.includes('Date.now')) };
          if (window.performance && window.performance.getEntries) { res.performanceEntries = window.performance.getEntries().length; }
          if (res.timingAttacks) { res.hasIssues=true; res.issues.push('High-res timing APIs'); }
          return res;
        })(),
        resourceTiming: (() => {
          const res = { hasIssues:false, issues:[], thirdPartyResources:[], internalEndpoints:[] };
          if (window.performance && window.performance.getEntriesByType) {
            window.performance.getEntriesByType('resource').forEach(r=>{
              try { const u=new URL(r.name); if(u.hostname!==window.location.hostname){res.thirdPartyResources.push(u.hostname);} if(u.pathname.includes('/api/')||u.pathname.includes('/internal/')){res.internalEndpoints.push(u.pathname);} } catch(e){}
            });
          }
          if (res.thirdPartyResources.length>5) { res.hasIssues=true; res.issues.push('Third-party: '+res.thirdPartyResources.length); }
          return res;
        })(),
        requestInterception: (() => {
          const bodyHTML = document.body.innerHTML;
          const res = { hasIssues:false, issues:[], fetchOverridden:!!bodyHTML.match(/fetch\\s*=/gi), xhrOverridden:!!bodyHTML.match(/XMLHttpRequest\\.prototype/gi), interceptors:0 };
          ['axios.interceptors','.interceptors.request','.interceptors.response','middleware','interceptor'].forEach(p=>{ if(bodyHTML.includes(p)) res.interceptors++; });
          if (res.fetchOverridden) { res.hasIssues=true; res.issues.push('fetch overridden'); }
          if (res.xhrOverridden) { res.hasIssues=true; res.issues.push('XHR prototype modified'); }
          return res;
        })(),
        credentialManagement: {
          credentialAPI: 'credentials' in navigator,
          passwordInputs: document.querySelectorAll('input[type="password"]').length,
          autocompleteEnabled: [...document.querySelectorAll('input')].some(i=>['on','username','current-password'].includes(i.getAttribute('autocomplete')))
        },
        beaconAPI: { hasIssues:false, issues:[], beaconUsage:(document.body.innerHTML.match(/sendBeacon/gi)||[]).length },
        webRTC: { hasIssues:false, issues:[], supported:'RTCPeerConnection' in window, peerConnections:(document.body.innerHTML.match(/new\\s+RTCPeerConnection/gi)||[]).length },
        paymentAPI: { supported: 'PaymentRequest' in window },
        permissionsAPI: { supported: 'permissions' in navigator, requestedPermissions: ['geolocation','mediaDevices','notifications','clipboard'].filter(p=>document.body.innerHTML.includes(p)) },
        trustedTypes: { supported: 'trustedTypes' in window },
        speculationRules: { hasIssues:false, issues:[], rules:document.querySelectorAll('script[type="speculationrules"]').length },
        webAppManifest: { present: !!document.querySelector('link[rel="manifest"]') },
        sensors: { accelerometer:'Accelerometer' in window, gyroscope:'Gyroscope' in window, magnetometer:'Magnetometer' in window, proximity:'ProximitySensor' in window },
        speechAPI: { speechRecognition:'SpeechRecognition' in window||'webkitSpeechRecognition' in window, speechSynthesis:'speechSynthesis' in window },
        fileSystemAccess: { supported: 'showOpenFilePicker' in window },
        webSerial: { supported: 'serial' in navigator },
        webUSB: { supported: 'usb' in navigator },
        webBluetooth: { supported: 'bluetooth' in navigator },
        webNFC: { supported: 'NDEFReader' in window },
        webHID: { supported: 'hid' in navigator },
        idleDetection: { supported: 'IdleDetector' in window },
        screenWakeLock: { supported: 'wakeLock' in navigator },
        webShare: { supported: 'share' in navigator },
        appCache: { supported: 'applicationCache' in window, deprecated:true },
        backgroundSync: { supported: 'sync' in (navigator.serviceWorker||{}) },
        periodicBackgroundSync: { supported: 'periodicSync' in (navigator.serviceWorker||{}) },
        paymentHandlers: { supported: 'paymentManager' in (navigator.serviceWorker||{}) },
        protocolHandlers: { supported: 'registerProtocolHandler' in navigator },
        relatedApps: { supported: 'getInstalledRelatedApps' in navigator },
        fontAccess: { supported: 'queryLocalFonts' in window },
        multiScreen: { supported: 'getScreenDetails' in window },
        computePressure: { supported: 'PressureObserver' in window },
        contactPicker: { supported: 'contacts' in navigator && 'ContactsManager' in window },
        webOTP: { supported: 'OTPCredential' in window },
        digitalGoods: { supported: 'getDigitalGoodsService' in window },
        attributionReporting: { supported: 'AttributionReporting' in window },
        topicsAPI: { supported: 'browsingTopics' in document },
        privateStateTokens: { supported: 'PrivateStateToken' in window },
        sharedStorage: { supported: 'sharedStorage' in window },
        fencedFrames: { supported: 'HTMLFencedFrameElement' in window },
        reportingAPI: { supported: 'ReportingObserver' in window },
        windowControlsOverlay: { supported: 'windowControlsOverlay' in (navigator||{}) },
        notificationTriggers: { supported: 'showNotification' in navigator && 'NotificationTrigger' in window },
        badging: { supported: 'setAppBadge' in navigator },
        contentIndex: { supported: 'index' in (navigator.serviceWorker||{}) },
        gamepadAPI: { supported: 'getGamepads' in navigator },
        captureLinks: { supported: false },
        shareTarget: { supported: false },
        shortcuts: { supported: false },
        urlHandlers: { supported: 'URLPattern' in window }
      };
      return r;
    })()`;
  }
}
