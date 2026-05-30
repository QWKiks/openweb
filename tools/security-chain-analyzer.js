export class VulnerabilityChainAnalyzer {
  constructor(report) {
    this.report = report;
    this.chains = [];
    this.attackPaths = [];
    this.correlations = [];
    this.contextScore = 0;
  }

     
                                                               
     
  analyze() {
    this.chains = this.buildVulnerabilityChains();
    this.attackPaths = this.generateAttackPaths();
    this.correlations = this.findCorrelations();
    this.contextScore = this.calculateContextScore();

    return {
      chains: this.chains,
      attackPaths: this.attackPaths,
      correlations: this.correlations,
      contextScore: this.contextScore,
      neuralAnalysis: this.generateNeuralAnalysis(),
      stepByStepAnalysis: this.generateStepByStepAnalysis(),
      logicalSummary: this.generateLogicalSummary()
    };
  }

     
                                            
     
  buildVulnerabilityChains() {
    const chains = [];

    

    if (this.hasCSPBypass() && this.hasXSSThreats()) {
      chains.push({
        id: 'CHAIN-001',
        name: 'CSP Bypass → XSS → Data Exfiltration',
        severity: 'CRITICAL',
        steps: [
          { step: 1, vulnerability: 'Missing CSP', confidence: 0.95, impact: 'Allows inline scripts' },
          { step: 2, vulnerability: 'XSS Execution', confidence: 0.85, impact: 'Arbitrary JavaScript execution' },
          { step: 3, vulnerability: 'Data Exfiltration', confidence: 0.80, impact: 'Sensitive data theft' }
        ],
        combinedRisk: this.calculateChainRisk([20, 25, 30]),
        recommendation: 'Implement strict CSP, sanitize all inputs, add X-XSS-Protection'
      });
    }

    

    if (this.hasClickjacking()) {
      chains.push({
        id: 'CHAIN-002',
        name: 'Clickjacking → Session Hijacking',
        severity: 'HIGH',
        steps: [
          { step: 1, vulnerability: 'No X-Frame-Options', confidence: 0.95, impact: 'Page can be framed' },
          { step: 2, vulnerability: 'UI Redressing', confidence: 0.75, impact: 'User tricked into actions' },
          { step: 3, vulnerability: 'Session Hijacking', confidence: 0.60, impact: 'Account takeover possible' }
        ],
        combinedRisk: this.calculateChainRisk([15, 20, 25]),
        recommendation: 'Add X-Frame-Options, implement frame-busting JavaScript'
      });
    }

    

    if (this.hasMissingCSP() && this.hasInlineScripts() && this.hasDOMXSSThreats()) {
      chains.push({
        id: 'CHAIN-003',
        name: 'Missing CSP + Inline Scripts → DOM XSS → Credential Theft',
        severity: 'CRITICAL',
        steps: [
          { step: 1, vulnerability: 'Missing CSP', confidence: 0.95, impact: 'No script restriction' },
          { step: 2, vulnerability: 'Inline Scripts Present', confidence: 0.90, impact: 'Injection vector available' },
          { step: 3, vulnerability: 'DOM XSS Triggered', confidence: 0.70, impact: 'Malicious payload executed' },
          { step: 4, vulnerability: 'Credential Theft', confidence: 0.65, impact: 'User credentials stolen' }
        ],
        combinedRisk: this.calculateChainRisk([20, 10, 25, 30]),
        recommendation: 'Move scripts to external files, implement CSP, sanitize DOM manipulation'
      });
    }

    

    if (this.hasMixedContent()) {
      chains.push({
        id: 'CHAIN-004',
        name: 'Mixed Content → MITM → Session Hijacking',
        severity: 'HIGH',
        steps: [
          { step: 1, vulnerability: 'Mixed Content', confidence: 0.95, impact: 'HTTP resources on HTTPS' },
          { step: 2, vulnerability: 'MITM Attack', confidence: 0.70, impact: 'Traffic interception' },
          { step: 3, vulnerability: 'Session Hijacking', confidence: 0.50, impact: 'Cookie theft possible' }
        ],
        combinedRisk: this.calculateChainRisk([25, 20, 15]),
        recommendation: 'Convert all HTTP to HTTPS, use HSTS'
      });
    }

    

    if (this.hasCDNWithoutSRI()) {
      chains.push({
        id: 'CHAIN-005',
        name: 'No SRI + CDN → Supply Chain → Code Execution',
        severity: 'HIGH',
        steps: [
          { step: 1, vulnerability: 'CDN without SRI', confidence: 0.85, impact: 'No integrity verification' },
          { step: 2, vulnerability: 'CDN Compromise', confidence: 0.40, impact: 'Malicious code served' },
          { step: 3, vulnerability: 'Arbitrary Code Execution', confidence: 0.70, impact: 'Full client compromise' }
        ],
        combinedRisk: this.calculateChainRisk([15, 20, 30]),
        recommendation: 'Add SRI to all external resources, host critical libraries locally'
      });
    }

    

    if (this.hasMissingCSP() && this.hasClickjacking()) {
      chains.push({
        id: 'CHAIN-006',
        name: 'Missing CSP + No X-Frame → Clickjacking + XSS Combo',
        severity: 'CRITICAL',
        steps: [
          { step: 1, vulnerability: 'Missing CSP', confidence: 0.95, impact: 'Script execution allowed' },
          { step: 2, vulnerability: 'No X-Frame-Options', confidence: 0.95, impact: 'Page framing allowed' },
          { step: 3, vulnerability: 'Clickjacking + XSS', confidence: 0.60, impact: 'Combined attack vector' },
          { step: 4, vulnerability: 'Full Account Compromise', confidence: 0.50, impact: 'Complete takeover' }
        ],
        combinedRisk: this.calculateChainRisk([20, 15, 25, 30]),
        recommendation: 'Implement CSP, add X-Frame-Options, sanitize all inputs'
      });
    }

    

    if (this.hasFormsWithoutCSRF()) {
      chains.push({
        id: 'CHAIN-007',
        name: 'No CSRF Token → Cross-Site Request Forgery',
        severity: 'MEDIUM',
        steps: [
          { step: 1, vulnerability: 'No CSRF Token', confidence: 0.90, impact: 'Form submission not protected' },
          { step: 2, vulnerability: 'CSRF Attack', confidence: 0.65, impact: 'Unauthorized actions' },
          { step: 3, vulnerability: 'State Mutation', confidence: 0.55, impact: 'Data modification without consent' }
        ],
        combinedRisk: this.calculateChainRisk([25, 15, 10]),
        recommendation: 'Add CSRF tokens to all forms, implement SameSite cookies'
      });
    }

    

    if (this.hasSessionCookieIssues()) {
      chains.push({
        id: 'CHAIN-008',
        name: 'Session Cookie Issues → Session Fixation → Account Takeover',
        severity: 'HIGH',
        steps: [
          { step: 1, vulnerability: 'Weak Session Cookie', confidence: 0.80, impact: 'Predictable session ID' },
          { step: 2, vulnerability: 'Session Fixation', confidence: 0.60, impact: 'Session hijacking possible' },
          { step: 3, vulnerability: 'Account Takeover', confidence: 0.50, impact: 'Full account compromise' }
        ],
        combinedRisk: this.calculateChainRisk([20, 20, 25]),
        recommendation: 'Use strong session IDs, implement HttpOnly/Secure/SameSite flags'
      });
    }

    

    if (this.hasAPIEndpoints() && !this.hasRateLimiting()) {
      chains.push({
        id: 'CHAIN-009',
        name: 'API + No Rate Limit → Brute Force → Data Breach',
        severity: 'HIGH',
        steps: [
          { step: 1, vulnerability: 'API Endpoints Exposed', confidence: 0.85, impact: 'Attack surface increased' },
          { step: 2, vulnerability: 'No Rate Limiting', confidence: 0.75, impact: 'Unlimited requests allowed' },
          { step: 3, vulnerability: 'Brute Force Attack', confidence: 0.60, impact: 'Enumeration possible' },
          { step: 4, vulnerability: 'Data Breach', confidence: 0.45, impact: 'Sensitive data exposed' }
        ],
        combinedRisk: this.calculateChainRisk([10, 10, 20, 30]),
        recommendation: 'Implement rate limiting, add API authentication, use pagination'
      });
    }

    

    if (this.hasHiddenFields() && this.hasMissingCSP()) {
      chains.push({
        id: 'CHAIN-010',
        name: 'Hidden Fields + No CSP → Parameter Tampering → Privilege Escalation',
        severity: 'MEDIUM',
        steps: [
          { step: 1, vulnerability: 'Hidden Fields Present', confidence: 0.85, impact: 'Sensitive data exposed' },
          { step: 2, vulnerability: 'Parameter Tampering', confidence: 0.70, impact: 'Field values modified' },
          { step: 3, vulnerability: 'Privilege Escalation', confidence: 0.40, impact: 'Unauthorized access gained' }
        ],
        combinedRisk: this.calculateChainRisk([20, 15, 25]),
        recommendation: 'Validate all server-side, remove sensitive hidden fields, implement CSP'
      });
    }

    

    if (this.hasPrototypePollution()) {
      chains.push({
        id: 'CHAIN-011',
        name: 'Prototype Pollution → Property Injection → Code Execution',
        severity: 'CRITICAL',
        steps: [
          { step: 1, vulnerability: 'Prototype Pollution Sink', confidence: 0.80, impact: 'Object prototype polluted' },
          { step: 2, vulnerability: 'Property Injection', confidence: 0.75, impact: 'Arbitrary properties added' },
          { step: 3, vulnerability: 'Type Confusion', confidence: 0.60, impact: 'Object type manipulated' },
          { step: 4, vulnerability: 'Function Hijacking', confidence: 0.50, impact: 'Built-in methods replaced' },
          { step: 5, vulnerability: 'Remote Code Execution', confidence: 0.35, impact: 'Arbitrary code execution' }
        ],
        combinedRisk: this.calculateChainRisk([15, 15, 15, 15, 25]),
        recommendation: 'Freeze Object.prototype, validate JSON.parse input, avoid lodash merge with untrusted data'
      });
    }

    

    if (this.hasWebSockets()) {
      chains.push({
        id: 'CHAIN-012',
        name: 'WebSocket + No Origin → Message Tampering → Server Compromise',
        severity: 'HIGH',
        steps: [
          { step: 1, vulnerability: 'WebSocket Without Origin Check', confidence: 0.85, impact: 'Cross-origin WS allowed' },
          { step: 2, vulnerability: 'Message Spoofing', confidence: 0.70, impact: 'Fake messages injected' },
          { step: 3, vulnerability: 'State Desynchronization', confidence: 0.55, impact: 'Client-server state mismatch' },
          { step: 4, vulnerability: 'Server-Side Logic Abuse', confidence: 0.45, impact: 'Business logic bypassed' },
          { step: 5, vulnerability: 'Data Corruption / DoS', confidence: 0.40, impact: 'Server data corrupted' }
        ],
        combinedRisk: this.calculateChainRisk([15, 15, 10, 15, 20]),
        recommendation: 'Validate WebSocket Origin, implement message signing, rate limit WS messages'
      });
    }

    

    if (this.hasPostMessageWildcard()) {
      chains.push({
        id: 'CHAIN-013',
        name: 'postMessage Wildcard → Iframe Bypass → DOM XSS → Credential Theft',
        severity: 'CRITICAL',
        steps: [
          { step: 1, vulnerability: 'postMessage Wildcard Origin', confidence: 0.95, impact: 'Any origin can send messages' },
          { step: 2, vulnerability: 'Message Origin Spoofing', confidence: 0.80, impact: 'Malicious message accepted' },
          { step: 3, vulnerability: 'Iframe Sandboxing Bypass', confidence: 0.60, impact: 'Restricted iframe escaped' },
          { step: 4, vulnerability: 'DOM XSS via Message Data', confidence: 0.65, impact: 'Payload executed in parent' },
          { step: 5, vulnerability: 'Credential Theft from Parent', confidence: 0.50, impact: 'Session cookies stolen' }
        ],
        combinedRisk: this.calculateChainRisk([20, 15, 15, 20, 20]),
        recommendation: 'Always validate event.origin, use exact origin matches, never use wildcard'
      });
    }

    

    if (this.hasEval() && this.hasDynamicImports()) {
      chains.push({
        id: 'CHAIN-014',
        name: 'eval() + Dynamic Import → CSP Bypass → Script Injection → Full Compromise',
        severity: 'CRITICAL',
        steps: [
          { step: 1, vulnerability: 'eval() Present', confidence: 0.95, impact: 'Arbitrary code execution vector' },
          { step: 2, vulnerability: 'Dynamic Import Usage', confidence: 0.85, impact: 'Remote script loading possible' },
          { step: 3, vulnerability: 'CSP Bypass via eval', confidence: 0.70, impact: 'CSP restriction circumvented' },
          { step: 4, vulnerability: 'Malicious Script Injection', confidence: 0.60, impact: 'Attacker code executed' },
          { step: 5, vulnerability: 'Full Application Compromise', confidence: 0.50, impact: 'Complete client takeover' }
        ],
        combinedRisk: this.calculateChainRisk([20, 15, 15, 20, 20]),
        recommendation: 'Remove all eval(), use strict CSP without unsafe-eval, avoid dynamic imports from untrusted sources'
      });
    }

    

    if (this.hasWeakRandomness()) {
      chains.push({
        id: 'CHAIN-015',
        name: 'Weak Randomness → Predictable Token → Session Fixation → Account Hijack',
        severity: 'HIGH',
        steps: [
          { step: 1, vulnerability: 'Math.random() for Tokens', confidence: 0.90, impact: 'Predictable token generation' },
          { step: 2, vulnerability: 'Token Enumeration', confidence: 0.75, impact: 'Valid tokens discovered' },
          { step: 3, vulnerability: 'Session Fixation', confidence: 0.60, impact: 'Session ID predicted' },
          { step: 4, vulnerability: 'Session Hijacking', confidence: 0.55, impact: 'User session stolen' },
          { step: 5, vulnerability: 'Account Takeover', confidence: 0.45, impact: 'Full account compromise' }
        ],
        combinedRisk: this.calculateChainRisk([15, 15, 15, 15, 15]),
        recommendation: 'Use crypto.getRandomValues() for tokens, implement token rotation, add session binding'
      });
    }

    

    if (this.hasThirdPartyResources() && this.hasNoSRI()) {
      chains.push({
        id: 'CHAIN-016',
        name: 'Third-Party + No SRI → CDN Compromise → Keylogger → Data Exfiltration',
        severity: 'CRITICAL',
        steps: [
          { step: 1, vulnerability: 'Third-Party Scripts without SRI', confidence: 0.85, impact: 'No integrity verification' },
          { step: 2, vulnerability: 'CDN / Supplier Compromise', confidence: 0.50, impact: 'Malicious code injected' },
          { step: 3, vulnerability: 'Keylogger Injection', confidence: 0.65, impact: 'User input captured' },
          { step: 4, vulnerability: 'Credential Harvesting', confidence: 0.55, impact: 'Passwords stolen' },
          { step: 5, vulnerability: 'Data Exfiltration via Beacon', confidence: 0.45, impact: 'Data sent to attacker' }
        ],
        combinedRisk: this.calculateChainRisk([15, 20, 15, 15, 15]),
        recommendation: 'Add SRI to all external resources, host critical libraries locally, monitor CDN integrity'
      });
    }

    

    if (this.hasWebRTC()) {
      chains.push({
        id: 'CHAIN-017',
        name: 'WebRTC → Local IP Leak → Network Recon → Internal Attack',
        severity: 'MEDIUM',
        steps: [
          { step: 1, vulnerability: 'WebRTC Enabled', confidence: 0.95, impact: 'Local IP addresses exposed' },
          { step: 2, vulnerability: 'STUN/TURN Response Parsing', confidence: 0.80, impact: 'Internal network topology revealed' },
          { step: 3, vulnerability: 'Network Reconnaissance', confidence: 0.60, impact: 'Internal services discovered' },
          { step: 4, vulnerability: 'Internal Service Scanning', confidence: 0.45, impact: 'Vulnerable internal targets found' },
          { step: 5, vulnerability: 'Lateral Movement', confidence: 0.30, impact: 'Internal network compromised' }
        ],
        combinedRisk: this.calculateChainRisk([10, 10, 10, 15, 10]),
        recommendation: 'Disable WebRTC if not needed, use mDNS candidates, implement VPN for sensitive users'
      });
    }

    

    if (this.hasOpenShadowRoots()) {
      chains.push({
        id: 'CHAIN-018',
        name: 'Open Shadow DOM → DOM Traversal → Sensitive Data Exposure',
        severity: 'MEDIUM',
        steps: [
          { step: 1, vulnerability: 'Open Shadow DOM Roots', confidence: 0.90, impact: 'Shadow DOM accessible via JS' },
          { step: 2, vulnerability: 'DOM Traversal into Shadow', confidence: 0.80, impact: 'Internal component structure exposed' },
          { step: 3, vulnerability: 'Sensitive Element Discovery', confidence: 0.60, impact: 'Hidden password/token fields found' },
          { step: 4, vulnerability: 'Data Extraction', confidence: 0.55, impact: 'Sensitive values read' },
          { step: 5, vulnerability: 'Information Disclosure', confidence: 0.50, impact: 'Confidential data leaked' }
        ],
        combinedRisk: this.calculateChainRisk([10, 10, 15, 15, 10]),
        recommendation: 'Use closed shadow roots, avoid storing sensitive data in DOM, sanitize shadow DOM content'
      });
    }

    

    if (this.hasFetchOverride() && this.hasMissingCSP()) {
      chains.push({
        id: 'CHAIN-019',
        name: 'Fetch Override + No CSP → Request Tampering → API Abuse',
        severity: 'HIGH',
        steps: [
          { step: 1, vulnerability: 'fetch() API Overridden', confidence: 0.85, impact: 'Request interceptor installed' },
          { step: 2, vulnerability: 'CSP Absence', confidence: 0.95, impact: 'No script restriction' },
          { step: 3, vulnerability: 'Malicious Interceptor Injection', confidence: 0.60, impact: 'Requests modified/stolen' },
          { step: 4, vulnerability: 'API Request Tampering', confidence: 0.55, impact: 'API calls manipulated' },
          { step: 5, vulnerability: 'Unauthorized Data Modification', confidence: 0.45, impact: 'Data integrity compromised' }
        ],
        combinedRisk: this.calculateChainRisk([15, 20, 15, 10, 15]),
        recommendation: 'Never override fetch globally, use request wrappers instead, implement CSP with strict script-src'
      });
    }

    

    if (this.hasTimingAPIs()) {
      chains.push({
        id: 'CHAIN-020',
        name: 'Timing APIs → Endpoint Enumeration → API Discovery → IDOR',
        severity: 'MEDIUM',
        steps: [
          { step: 1, vulnerability: 'Performance Timing Enabled', confidence: 0.90, impact: 'Resource timing exposed' },
          { step: 2, vulnerability: 'Internal Endpoint Enumeration', confidence: 0.70, impact: 'Hidden API paths discovered' },
          { step: 3, vulnerability: 'API Parameter Discovery', confidence: 0.55, impact: 'Valid parameters inferred' },
          { step: 4, vulnerability: 'IDOR Testing', confidence: 0.50, impact: 'Unauthorized object access attempted' },
          { step: 5, vulnerability: 'Data Breach', confidence: 0.40, impact: 'Sensitive data accessed' }
        ],
        combinedRisk: this.calculateChainRisk([10, 15, 10, 15, 15]),
        recommendation: 'Clear performance entries after load, use Timing-Allow-Origin restrictively, implement strict access control'
      });
    }

    return chains;
  }

     
                                       
     
  generateAttackPaths() {
    const paths = [];

    for (const chain of this.chains) {
      const path = {
        id: `PATH-${chain.id}`,
        name: chain.name,
        severity: chain.severity,
        entryPoints: this.findEntryPoints(chain),
        prerequisites: this.findPrerequisites(chain),
        steps: chain.steps.map((step, index) => ({
          step: index + 1,
          action: step.vulnerability,
          probability: step.confidence,
          impact: step.impact,
          mitigation: this.getMitigationForStep(step)
        })),
        totalProbability: this.calculatePathProbability(chain.steps),
        estimatedDamage: chain.combinedRisk
      };
      paths.push(path);
    }

    return paths;
  }

     
                                                        
     
  findCorrelations() {
    const correlations = [];

    

    if (this.hasMissingCSP() && this.hasXSSThreats()) {
      correlations.push({
        id: 'CORR-001',
        type: 'CAUSAL',
        description: 'Missing CSP directly enables XSS attacks',
        primary: 'Missing CSP',
        secondary: 'XSS Vulnerability',
        strength: 0.95,
        evidence: 'CSP is the primary defense against XSS'
      });
    }

    

    if (this.hasClickjacking() && this.hasMissingCSP()) {
      correlations.push({
        id: 'CORR-002',
        type: 'COMPOUND',
        description: 'Clickjacking and XSS can be combined for amplified attack',
        primary: 'No X-Frame-Options',
        secondary: 'Missing CSP',
        strength: 0.85,
        evidence: 'Attacker can frame page and inject scripts simultaneously'
      });
    }

    

    if (this.hasInlineScripts() && this.hasMissingCSP()) {
      correlations.push({
        id: 'CORR-003',
        type: 'ENABLING',
        description: 'Inline scripts are dangerous without CSP',
        primary: 'Missing CSP',
        secondary: 'Inline Scripts',
        strength: 0.90,
        evidence: 'CSP is required to restrict inline script execution'
      });
    }

    

    if (this.hasCDNWithoutSRI()) {
      correlations.push({
        id: 'CORR-004',
        type: 'DEPENDENCY',
        description: 'External dependencies without integrity verification',
        primary: 'CDN Usage',
        secondary: 'Missing SRI',
        strength: 0.80,
        evidence: 'SRI prevents execution of tampered CDN resources'
      });
    }

    

    if (this.hasFormsWithoutCSRF()) {
      correlations.push({
        id: 'CORR-005',
        type: 'CAUSAL',
        description: 'Forms without CSRF protection allow unauthorized state changes',
        primary: 'No CSRF Token',
        secondary: 'Form Submission',
        strength: 0.85,
        evidence: 'CSRF tokens prevent cross-origin form submissions'
      });
    }

    

    if (this.hasAPIEndpoints() && !this.hasRateLimiting()) {
      correlations.push({
        id: 'CORR-006',
        type: 'ENABLING',
        description: 'APIs without rate limiting allow data enumeration',
        primary: 'No Rate Limiting',
        secondary: 'API Endpoints',
        strength: 0.75,
        evidence: 'Rate limiting prevents automated scraping and brute force'
      });
    }

    return correlations;
  }

     
                                       
     
  calculateContextScore() {
    let baseScore = this.report.risk?.score || 0;
    let multiplier = 1.0;

    

    const criticalChains = this.chains.filter(c => c.severity === 'CRITICAL').length;
    multiplier += criticalChains * 0.3;

    

    const highCorrelations = this.correlations.filter(c => c.strength > 0.8).length;
    multiplier += highCorrelations * 0.2;

    

    if (this.report.isHTTPS) multiplier -= 0.1;
    if (this.report.headers?.csp) multiplier -= 0.2;
    if (this.report.headers?.xFrameOptions) multiplier -= 0.1;

    

    if (this.hasLoginForms()) multiplier += 0.2;
    if (this.hasPaymentForms()) multiplier += 0.3;
    if (this.hasAdminEndpoints()) multiplier += 0.2;

    const finalScore = Math.min(Math.round(baseScore * multiplier), 150);
    return finalScore;
  }

     
                                                              
     
  generateNeuralAnalysis() {
    return {
      summary: {
        totalChains: this.chains.length,
        criticalChains: this.chains.filter(c => c.severity === 'CRITICAL').length,
        highChains: this.chains.filter(c => c.severity === 'HIGH').length,
        mediumChains: this.chains.filter(c => c.severity === 'MEDIUM').length,
        totalCorrelations: this.correlations.length,
        contextScore: this.contextScore,
        confidence: this.calculateOverallConfidence()
      },
      featureVector: this.generateFeatureVector(),
      attackVectors: this.chains.map(c => ({
        vector: c.name,
        severity: c.severity,
        probability: c.steps.reduce((acc, s) => acc * s.confidence, 1),
        impact: c.combinedRisk
      })),
      riskMatrix: this.generateRiskMatrix(),
      recommendations: this.generateRecommendations(),
      prioritizedActions: this.generatePrioritizedActions()
    };
  }

     
                                                  
     
  generateStepByStepAnalysis() {
    return this.chains.map(chain => ({
      chainId: chain.id,
      chainName: chain.name,
      severity: chain.severity,
      stepCount: chain.steps.length,
      analysis: chain.steps.map((step, index) => ({
        step: index + 1,
        phase: this.getAttackPhase(index, chain.steps.length),
        vulnerability: step.vulnerability,
        confidence: step.confidence,
        impact: step.impact,
        prerequisites: this.getPrerequisites(step),
        indicators: this.getIndicators(step),
        detection: this.getDetectionMethods(step),
        mitigation: this.getMitigationForStep(step),
        nextSteps: index < chain.steps.length - 1 ? [chain.steps[index + 1].vulnerability] : []
      })),
      entryPoints: this.findEntryPoints(chain),
      exitPoints: this.findExitPoints(chain),
      attackComplexity: this.calculateAttackComplexity(chain),
      requiredSkills: this.getRequiredSkills(chain),
      estimatedTime: this.estimateAttackTime(chain)
    }));
  }

     
                                                    
     
  generateLogicalSummary() {
    const criticalIssues = [];
    const highIssues = [];
    const mediumIssues = [];
    const lowIssues = [];

    

    if (this.hasMissingCSP()) criticalIssues.push('Missing CSP allows script injection');
    if (this.hasXSSThreats()) criticalIssues.push('XSS vulnerabilities present');
    if (this.hasMixedContent()) highIssues.push('Mixed content enables MITM');
    if (this.hasClickjacking()) highIssues.push('Clickjacking possible via framing');
    if (this.hasCDNWithoutSRI()) highIssues.push('CDN resources without integrity');
    if (this.hasFormsWithoutCSRF()) mediumIssues.push('CSRF protection missing');
    if (this.hasSessionCookieIssues()) mediumIssues.push('Session cookie weaknesses');
    if (this.hasInlineScripts()) mediumIssues.push('Inline scripts present');

    return {
      overallAssessment: this.getOverallAssessment(),
      criticalIssues,
      highIssues,
      mediumIssues,
      lowIssues,
      rootCauses: this.identifyRootCauses(),
      cascadingEffects: this.identifyCascadingEffects(),
      defenseInDepth: this.assessDefenseInDepth(),
      recommendations: this.generatePrioritizedActions()
    };
  }

  

  hasMissingCSP() {
    return !this.report.headers?.csp;
  }

  hasCSPBypass() {
    return !this.report.headers?.csp;
  }

  hasXSSThreats() {
    return this.report.xss?.hasDangerousMethods || this.report.advanced?.domXssAdvanced?.hasVectors;
  }

  hasClickjacking() {
    return !this.report.headers?.xFrameOptions;
  }

  hasMixedContent() {
    return this.report.mixedContent?.hasMixedContent;
  }

  hasInlineScripts() {
    return this.report.scripts?.inline > 0;
  }

  hasCDNWithoutSRI() {
    return this.report.advanced?.supplyChain?.hasIssues;
  }

  hasFormsWithoutCSRF() {
    return this.report.advanced?.csrfAnalysis?.hasIssues;
  }

  hasSessionCookieIssues() {
    return this.report.advanced?.sessionCookieSecurity?.hasIssues;
  }

  hasAPIEndpoints() {
    return this.report.advanced?.apiEndpoints?.hasEndpoints;
  }

  hasRateLimiting() {
    return this.report.advanced?.rateLimiting?.hasIndicators;
  }

  hasHiddenFields() {
    return this.report.advanced?.parameterTampering?.hasIssues;
  }

  hasDOMXSSThreats() {
    return this.report.advanced?.domXssAdvanced?.hasVectors;
  }

  

  hasPrototypePollution() {
    return this.report.deep?.behavioralFingerprinting?.prototypePollutionSinks > 0;
  }

  hasWebSockets() {
    return this.report.deep?.behavioralFingerprinting?.websockets > 0;
  }

  hasPostMessageWildcard() {
    return this.report.deep?.crossOriginCommunication?.wildcardOrigin;
  }

  hasEval() {
    return this.report.deep?.behavioralFingerprinting?.evalUsage > 0;
  }

  hasDynamicImports() {
    return this.report.deep?.behavioralFingerprinting?.dynamicImports > 0;
  }

  hasWeakRandomness() {
    return this.report.deep?.cryptography?.mathRandomUsage > 0;
  }

  hasThirdPartyResources() {
    return (this.report.deep?.resourceTiming?.thirdPartyResources?.length || 0) > 5;
  }

  hasNoSRI() {
    return this.report.scripts?.withIntegrity === 0 && this.report.scripts?.external > 0;
  }

  hasWebRTC() {
    return this.report.deep?.webRTC?.peerConnections > 0;
  }

  hasOpenShadowRoots() {
    return this.report.deep?.shadowDOM?.openShadowRoots > 0;
  }

  hasFetchOverride() {
    return this.report.deep?.requestInterception?.fetchOverridden;
  }

  hasTimingAPIs() {
    return this.report.deep?.performanceTiming?.timingAttacks;
  }

  hasLoginForms() {
    return this.report.advanced?.authenticationFlow?.loginForms?.length > 0;
  }

  hasPaymentForms() {
    return this.report.advanced?.businessLogic?.hasPatterns;
  }

  hasAdminEndpoints() {
    return this.report.advanced?.authorizationPatterns?.hasIssues;
  }

  calculateChainRisk(risks) {
    return Math.min(risks.reduce((a, b) => a + b, 0), 100);
  }

  findEntryPoints(chain) {
    return chain.steps.filter((step, index) => index === 0).map(s => s.vulnerability);
  }

  findPrerequisites(chain) {
    const prereqs = [];
    if (chain.id === 'CHAIN-001') prereqs.push('User must visit malicious page');
    if (chain.id === 'CHAIN-002') prereqs.push('User must be logged in');
    if (chain.id === 'CHAIN-004') prereqs.push('Network access to intercept traffic');
    if (chain.id === 'CHAIN-005') prereqs.push('CDN compromise or MitM position');
    if (chain.id === 'CHAIN-007') prereqs.push('User must be authenticated');
    if (chain.id === 'CHAIN-008') prereqs.push('Session ID must be predictable');
    return prereqs;
  }

  findExitPoints(chain) {
    const lastStep = chain.steps[chain.steps.length - 1];
    return [lastStep.impact];
  }

  getMitigationForStep(step) {
    const mitigations = {
      'Missing CSP': 'Implement Content-Security-Policy header',
      'XSS Execution': 'Sanitize all user inputs, use output encoding',
      'Data Exfiltration': 'Implement CSP connect-src restrictions',
      'No X-Frame-Options': 'Add X-Frame-Options or CSP frame-ancestors',
      'UI Redressing': 'Implement frame-busting JavaScript',
      'Session Hijacking': 'Use HttpOnly/Secure/SameSite cookies',
      'Inline Scripts Present': 'Move scripts to external files',
      'DOM XSS Triggered': 'Use safe DOM manipulation methods',
      'Credential Theft': 'Implement credential encryption in transit',
      'Mixed Content': 'Convert all HTTP to HTTPS',
      'MITM Attack': 'Implement HSTS with includeSubDomains',
      'CDN without SRI': 'Add integrity attributes to external resources',
      'CDN Compromise': 'Host critical libraries locally',
      'No CSRF Token': 'Add CSRF tokens to all forms',
      'CSRF Attack': 'Implement SameSite cookies',
      'State Mutation': 'Validate all actions server-side',
      'Weak Session Cookie': 'Use cryptographically random session IDs',
      'Session Fixation': 'Regenerate session ID after authentication',
      'Hidden Fields Present': 'Remove sensitive data from client-side',
      'Parameter Tampering': 'Validate all parameters server-side',
      'Privilege Escalation': 'Implement role-based access control'
    };
    return mitigations[step.vulnerability] || 'Apply defense in depth principles';
  }

  getAttackPhase(index, total) {
    if (index === 0) return 'RECONNAISSANCE';
    if (index === total - 1) return 'IMPACT';
    if (index < total / 2) return 'WEAPONIZATION';
    return 'EXPLOITATION';
  }

  getPrerequisites(step) {
    return [];
  }

  getIndicators(step) {
    return [];
  }

  getDetectionMethods(step) {
    return [];
  }

  calculatePathProbability(steps) {
    return steps.reduce((acc, step) => acc * step.confidence, 1);
  }

  calculateAttackComplexity(chain) {
    const avgConfidence = chain.steps.reduce((a, s) => a + s.confidence, 0) / chain.steps.length;
    if (avgConfidence > 0.8) return 'LOW';
    if (avgConfidence > 0.6) return 'MEDIUM';
    return 'HIGH';
  }

  getRequiredSkills(chain) {
    const skills = ['Basic Web Knowledge'];
    if (chain.severity === 'CRITICAL') skills.push('Advanced Exploitation');
    if (chain.id.includes('MITM')) skills.push('Network Interception');
    if (chain.id.includes('Session')) skills.push('Session Management');
    return skills;
  }

  estimateAttackTime(chain) {
    if (chain.severity === 'CRITICAL') return 'Hours';
    if (chain.severity === 'HIGH') return 'Days';
    return 'Weeks';
  }

  calculateOverallConfidence() {
    if (this.chains.length === 0) return 0.5;
    const avg = this.chains.reduce((a, c) => a + c.steps.reduce((s, step) => s + step.confidence, 0) / c.steps.length, 0) / this.chains.length;
    return Math.round(avg * 100) / 100;
  }

  generateFeatureVector() {
    return [
      this.hasMissingCSP() ? 1 : 0,
      this.hasXSSThreats() ? 1 : 0,
      this.hasClickjacking() ? 1 : 0,
      this.hasMixedContent() ? 1 : 0,
      this.hasInlineScripts() ? 1 : 0,
      this.hasCDNWithoutSRI() ? 1 : 0,
      this.hasFormsWithoutCSRF() ? 1 : 0,
      this.hasSessionCookieIssues() ? 1 : 0,
      this.hasAPIEndpoints() ? 1 : 0,
      this.hasRateLimiting() ? 1 : 0,
      this.chains.filter(c => c.severity === 'CRITICAL').length,
      this.chains.filter(c => c.severity === 'HIGH').length,
      this.correlations.filter(c => c.strength > 0.8).length
    ];
  }

  generateRiskMatrix() {
    const matrix = {
      likelihood: 'MEDIUM',
      impact: 'MEDIUM',
      overall: 'MEDIUM'
    };

    if (this.chains.some(c => c.severity === 'CRITICAL')) {
      matrix.likelihood = 'HIGH';
      matrix.impact = 'HIGH';
      matrix.overall = 'CRITICAL';
    } else if (this.chains.some(c => c.severity === 'HIGH')) {
      matrix.likelihood = 'MEDIUM';
      matrix.impact = 'HIGH';
      matrix.overall = 'HIGH';
    }

    return matrix;
  }

  generateRecommendations() {
    const recs = [];

    if (this.hasMissingCSP()) {
      recs.push({
        priority: 1,
        action: 'Implement Content-Security-Policy',
        impact: 'Prevents XSS and data injection attacks',
        effort: 'MEDIUM',
        value: 'HIGH'
      });
    }

    if (this.hasClickjacking()) {
      recs.push({
        priority: 2,
        action: 'Add X-Frame-Options header',
        impact: 'Prevents clickjacking attacks',
        effort: 'LOW',
        value: 'HIGH'
      });
    }

    if (this.hasMixedContent()) {
      recs.push({
        priority: 3,
        action: 'Fix mixed content issues',
        impact: 'Prevents MITM attacks',
        effort: 'MEDIUM',
        value: 'HIGH'
      });
    }

    if (this.hasCDNWithoutSRI()) {
      recs.push({
        priority: 4,
        action: 'Add Subresource Integrity',
        impact: 'Prevents supply chain attacks',
        effort: 'LOW',
        value: 'MEDIUM'
      });
    }

    return recs;
  }

  generatePrioritizedActions() {
    const actions = this.generateRecommendations();
    return actions.sort((a, b) => a.priority - b.priority);
  }

  getOverallAssessment() {
    if (this.contextScore >= 100) return 'CRITICAL: Immediate action required. Multiple high-impact vulnerability chains are active.';
    if (this.contextScore >= 60) return 'HIGH: Significant security issues present. Attack paths exist and should be addressed.';
    if (this.contextScore >= 30) return 'MEDIUM: Some security concerns exist. Defense in depth recommended.';
    return 'LOW: Basic security posture acceptable. Continue monitoring and hardening.';
  }

  identifyRootCauses() {
    const causes = [];
    if (this.hasMissingCSP()) causes.push('Missing Content-Security-Policy');
    if (this.hasClickjacking()) causes.push('Missing X-Frame-Options');
    if (this.hasMixedContent()) causes.push('Insecure resource loading');
    if (this.hasInlineScripts()) causes.push('Unsafe script practices');
    return causes;
  }

  identifyCascadingEffects() {
    const effects = [];
    if (this.hasMissingCSP() && this.hasXSSThreats()) effects.push('XSS can lead to session hijacking');
    if (this.hasClickjacking() && this.hasFormsWithoutCSRF()) effects.push('Clickjacking + CSRF combo possible');
    if (this.hasSessionCookieIssues()) effects.push('Session issues can lead to account takeover');
    return effects;
  }

  assessDefenseInDepth() {
    const layers = {
      network: this.report.isHTTPS ? 'SECURE' : 'VULNERABLE',
      transport: this.report.mixedContent?.hasMixedContent ? 'VULNERABLE' : 'SECURE',
      application: this.report.headers?.csp ? 'SECURE' : 'VULNERABLE',
      session: this.hasSessionCookieIssues() ? 'VULNERABLE' : 'SECURE',
      input: this.hasXSSThreats() ? 'VULNERABLE' : 'SECURE',
      output: this.hasXSSThreats() ? 'VULNERABLE' : 'SECURE'
    };

    const vulnerableLayers = Object.values(layers).filter(l => l === 'VULNERABLE').length;
    const score = Math.round((6 - vulnerableLayers) / 6 * 100);

    return {
      layers,
      score,
      assessment: score >= 80 ? 'STRONG' : score >= 50 ? 'MODERATE' : 'WEAK'
    };
  }
}
