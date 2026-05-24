/**
 * Deep Security Analyzer
 * Advanced behavioral, temporal, and cross-origin analysis
 * Detects complex multi-stage vulnerabilities and hidden attack surfaces
 */

export class DeepSecurityAnalyzer {
  constructor() {
    this.findings = [];
    this.behavioralProfile = {};
    this.attackSurface = {};
  }

  runAllChecks() {
    return {
      behavioralFingerprinting: this.checkBehavioralFingerprinting(),
      shadowDOM: this.checkShadowDOM(),
      webComponents: this.checkWebComponents(),
      serviceWorkers: this.checkServiceWorkers(),
      crossOriginCommunication: this.checkCrossOriginCommunication(),
      cryptography: this.checkCryptography(),
      memoryLeaks: this.checkMemoryLeaks(),
      requestInterception: this.checkRequestInterception(),
      credentialManagement: this.checkCredentialManagement(),
      paymentAPI: this.checkPaymentAPI(),
      permissionsAPI: this.checkPermissionsAPI(),
      beaconAPI: this.checkBeaconAPI(),
      performanceTiming: this.checkPerformanceTiming(),
      navigationTiming: this.checkNavigationTiming(),
      resourceTiming: this.checkResourceTiming(),
      clientHints: this.checkClientHints(),
      trustedTypes: this.checkTrustedTypes(),
      reportingAPI: this.checkReportingAPI(),
      speculationRules: this.checkSpeculationRules(),
      fencedFrames: this.checkFencedFrames(),
      sharedStorage: this.checkSharedStorage(),
      privateStateTokens: this.checkPrivateStateTokens(),
      attributionReporting: this.checkAttributionReporting(),
      topicsAPI: this.checkTopicsAPI(),
      webRTC: this.checkWebRTC(),
      fileSystemAccess: this.checkFileSystemAccess(),
      webSerial: this.checkWebSerial(),
      webUSB: this.checkWebUSB(),
      webBluetooth: this.checkWebBluetooth(),
      gamepadAPI: this.checkGamepadAPI(),
      sensors: this.checkSensors(),
      speechAPI: this.checkSpeechAPI(),
      webShare: this.checkWebShare(),
      contactPicker: this.checkContactPicker(),
      webOTP: this.checkWebOTP(),
      screenWakeLock: this.checkScreenWakeLock(),
      idleDetection: this.checkIdleDetection(),
      webNFC: this.checkWebNFC(),
      webHID: this.checkWebHID(),
      computePressure: this.checkComputePressure(),
      fontAccess: this.checkFontAccess(),
      multiScreen: this.checkMultiScreen(),
      windowControlsOverlay: this.checkWindowControlsOverlay(),
      digitalGoods: this.checkDigitalGoods(),
      periodicBackgroundSync: this.checkPeriodicBackgroundSync(),
      backgroundSync: this.checkBackgroundSync(),
      contentIndex: this.checkContentIndex(),
      badging: this.checkBadging(),
      appCache: this.checkAppCache(),
      notificationTriggers: this.checkNotificationTriggers(),
      webAppManifest: this.checkWebAppManifest(),
      paymentHandlers: this.checkPaymentHandlers(),
      protocolHandlers: this.checkProtocolHandlers(),
      urlHandlers: this.checkURLHandlers(),
      shareTarget: this.checkShareTarget(),
      shortcuts: this.checkShortcuts(),
      relatedApps: this.checkRelatedApps(),
      captureLinks: this.checkCaptureLinks()
    };
  }

  // ============ BEHAVIORAL & DOM ============

  checkBehavioralFingerprinting() {
    const result = {
      hasIssues: false,
      issues: [],
      eventListeners: 0,
      mutationObservers: 0,
      intersectionObservers: 0,
      resizeObservers: 0,
      timers: 0,
      websockets: 0,
      sse: 0,
      fetchHooks: 0,
      xhrHooks: 0,
      dynamicImports: 0,
      evalUsage: 0,
      functionConstructor: 0
    };

    // Count event listeners (best effort via prototype hooking)
    try {
      const proto = EventTarget.prototype;
      const origAddEventListener = proto.addEventListener;
      let listenerCount = 0;
      proto.addEventListener = function(...args) {
        listenerCount++;
        return origAddEventListener.apply(this, args);
      };
      // Trigger re-registration if needed (would need page reload)
      proto.addEventListener = origAddEventListener; // restore
      result.eventListeners = 'unknown (requires instrumentation)';
    } catch (e) {}

    // Check for prototype pollution sinks
    const bodyHTML = document.body.innerHTML;
    const pollutionSinks = [
      /Object\.assign\s*\(/gi,
      /JSON\.parse\s*\(/gi,
      /\.extend\s*\(/gi,
      /lodash/gi,
      /jquery\.extend/gi
    ];
    for (const pattern of pollutionSinks) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        result.hasIssues = true;
        result.issues.push(`Prototype pollution sink: ${pattern}`);
      }
    }

    // Check for dangerous timer usage
    if (bodyHTML.includes('setTimeout') || bodyHTML.includes('setInterval')) {
      result.timers = (bodyHTML.match(/setTimeout/gi) || []).length + (bodyHTML.match(/setInterval/gi) || []).length;
    }

    // Check for WebSocket usage
    if (bodyHTML.includes('WebSocket') || typeof WebSocket !== 'undefined') {
      result.websockets = (bodyHTML.match(/new\s+WebSocket/gi) || []).length;
      if (result.websockets > 0) {
        result.hasIssues = true;
        result.issues.push(`WebSocket connections detected: ${result.websockets}`);
      }
    }

    // Check for Server-Sent Events
    if (bodyHTML.includes('EventSource')) {
      result.sse = (bodyHTML.match(/new\s+EventSource/gi) || []).length;
    }

    // Check for dynamic imports
    if (bodyHTML.includes('import(')) {
      result.dynamicImports = (bodyHTML.match(/import\s*\(/gi) || []).length;
      result.hasIssues = true;
      result.issues.push(`Dynamic imports detected: ${result.dynamicImports} (CSP bypass vector)`);
    }

    // Check for eval and Function constructor
    if (bodyHTML.includes('eval(')) {
      result.evalUsage = (bodyHTML.match(/eval\s*\(/gi) || []).length;
      result.hasIssues = true;
      result.issues.push(`eval() usage: ${result.evalUsage}`);
    }
    if (bodyHTML.includes('new Function(')) {
      result.functionConstructor = (bodyHTML.match(/new\s+Function\s*\(/gi) || []).length;
      result.hasIssues = true;
      result.issues.push(`Function constructor usage: ${result.functionConstructor}`);
    }

    return result;
  }

  checkShadowDOM() {
    const result = {
      hasIssues: false,
      issues: [],
      shadowRoots: 0,
      openShadowRoots: 0,
      closedShadowRoots: 0,
      exposedInternals: []
    };

    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        result.shadowRoots++;
        if (el.shadowRoot.mode === 'open') {
          result.openShadowRoots++;
          // Check for exposed internals
          const internals = el.shadowRoot.querySelectorAll('*');
          for (const internal of internals) {
            if (internal.tagName.toLowerCase().includes('password') ||
                internal.tagName.toLowerCase().includes('token') ||
                internal.getAttribute('type') === 'password') {
              result.exposedInternals.push(internal.tagName);
            }
          }
        } else {
          result.closedShadowRoots++;
        }
      }
    }

    if (result.openShadowRoots > 0) {
      result.hasIssues = true;
      result.issues.push(`${result.openShadowRoots} open shadow roots (accessible via JS)`);
    }
    if (result.exposedInternals.length > 0) {
      result.hasIssues = true;
      result.issues.push(`Sensitive elements exposed in shadow DOM: ${result.exposedInternals.join(', ')}`);
    }

    return result;
  }

  checkWebComponents() {
    const result = {
      hasIssues: false,
      issues: [],
      customElements: 0,
      definedElements: [],
      unregisteredElements: [],
      templates: 0,
      slots: 0
    };

    // Check defined custom elements
    if (window.customElements) {
      // Note: customElements.get() and customElements.define() analysis
      const bodyHTML = document.body.innerHTML;
      const customTagPattern = /<([a-z]+-[a-z-]+)/gi;
      let match;
      while ((match = customTagPattern.exec(bodyHTML)) !== null) {
        result.customElements++;
        const tagName = match[1];
        if (!window.customElements.get(tagName)) {
          result.unregisteredElements.push(tagName);
        } else {
          result.definedElements.push(tagName);
        }
      }
    }

    result.templates = document.querySelectorAll('template').length;
    result.slots = document.querySelectorAll('slot').length;

    if (result.unregisteredElements.length > 0) {
      result.hasIssues = true;
      result.issues.push(`Unregistered custom elements: ${result.unregisteredElements.join(', ')}`);
    }

    return result;
  }

  checkServiceWorkers() {
    const result = {
      hasIssues: false,
      issues: [],
      serviceWorkerSupported: 'serviceWorker' in navigator,
      serviceWorkerActive: false,
      serviceWorkerScope: null,
      serviceWorkerScript: null,
      pushManagerSupported: false,
      cacheStorage: false,
      backgroundFetchSupported: false
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) {
          result.serviceWorkerActive = true;
          result.serviceWorkerScope = reg.scope;
          if (reg.installing) result.serviceWorkerScript = reg.installing.scriptURL;
          else if (reg.waiting) result.serviceWorkerScript = reg.waiting.scriptURL;
          else if (reg.active) result.serviceWorkerScript = reg.active.scriptURL;
        }
      }).catch(() => {});
    }

    result.pushManagerSupported = 'PushManager' in window;
    result.cacheStorage = 'caches' in window;
    result.backgroundFetchSupported = 'BackgroundFetchManager' in window;

    if (result.serviceWorkerSupported && !result.serviceWorkerActive) {
      // This is actually neutral - just capability
    }

    return result;
  }

  // ============ CROSS-ORIGIN COMMUNICATION ============

  checkCrossOriginCommunication() {
    const result = {
      hasIssues: false,
      issues: [],
      postMessageListeners: 0,
      postMessageSenders: 0,
      broadcastChannels: 0,
      sharedWorkers: 0,
      messagePorts: 0,
      originValidation: false,
      wildcardOrigin: false
    };

    const bodyHTML = document.body.innerHTML;

    // Check for postMessage usage
    result.postMessageListeners = (bodyHTML.match(/message/gi) || []).length;
    result.postMessageSenders = (bodyHTML.match(/postMessage/gi) || []).length;

    // Check for origin validation
    if (bodyHTML.includes('event.origin') || bodyHTML.includes('e.origin')) {
      result.originValidation = true;
    }

    // Check for wildcard origin in postMessage
    if (bodyHTML.match(/postMessage\s*\(\s*[^,]+,\s*['"]?\*/gi)) {
      result.wildcardOrigin = true;
      result.hasIssues = true;
      result.issues.push('postMessage with wildcard origin (*) detected');
    }

    // Check for BroadcastChannel
    if (bodyHTML.includes('BroadcastChannel')) {
      result.broadcastChannels = (bodyHTML.match(/new\s+BroadcastChannel/gi) || []).length;
      result.hasIssues = true;
      result.issues.push(`BroadcastChannel usage: ${result.broadcastChannels} (cross-origin data sharing)`);
    }

    // Check for SharedWorker
    if (bodyHTML.includes('SharedWorker')) {
      result.sharedWorkers = (bodyHTML.match(/new\s+SharedWorker/gi) || []).length;
    }

    // Check for MessageChannel/MessagePort
    if (bodyHTML.includes('MessageChannel') || bodyHTML.includes('MessagePort')) {
      result.messagePorts = (bodyHTML.match(/MessageChannel|MessagePort/gi) || []).length;
    }

    if (result.postMessageSenders > 0 && !result.originValidation) {
      result.hasIssues = true;
      result.issues.push('postMessage without origin validation detected');
    }

    return result;
  }

  // ============ CRYPTOGRAPHY ============

  checkCryptography() {
    const result = {
      hasIssues: false,
      issues: [],
      webCryptoSupported: 'crypto' in window && 'subtle' in window.crypto,
      getRandomValues: false,
      subtleCrypto: false,
      weakAlgorithms: [],
      customCrypto: false,
      mathRandomUsage: 0,
      dateNowUsage: 0
    };

    const bodyHTML = document.body.innerHTML;

    // Check for crypto.getRandomValues
    if (bodyHTML.includes('getRandomValues')) {
      result.getRandomValues = true;
    }

    // Check for subtle crypto
    if (bodyHTML.includes('crypto.subtle') || bodyHTML.includes('window.crypto.subtle')) {
      result.subtleCrypto = true;
    }

    // Check for weak randomness
    result.mathRandomUsage = (bodyHTML.match(/Math\.random\s*\(/gi) || []).length;
    if (result.mathRandomUsage > 0) {
      result.hasIssues = true;
      result.issues.push(`Math.random() used ${result.mathRandomUsage} times (not cryptographically secure)`);
    }

    // Check for Date.now() / new Date() for timing/tokens
    result.dateNowUsage = (bodyHTML.match(/Date\.now\s*\(|new\s+Date\s*\(/gi) || []).length;
    if (result.dateNowUsage > 5) {
      result.hasIssues = true;
      result.issues.push(`Date.now()/new Date() used ${result.dateNowUsage} times (potential timing/token issue)`);
    }

    // Check for custom crypto implementations
    const customCryptoPatterns = [
      /md5/gi, /sha1\s*\(/gi, /custom.*encrypt/gi, /custom.*hash/gi,
      /rot13/gi, /base64.*encode/gi, /btoa\s*\(.*password/gi
    ];
    for (const pattern of customCryptoPatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        result.customCrypto = true;
        result.weakAlgorithms.push(pattern.toString());
      }
    }

    if (result.customCrypto) {
      result.hasIssues = true;
      result.issues.push('Custom/weak cryptographic implementation detected');
    }

    return result;
  }

  // ============ MEMORY & PERFORMANCE ============

  checkMemoryLeaks() {
    const result = {
      hasIssues: false,
      issues: [],
      detachedNodes: 0,
      closureLeaks: 0,
      intervalLeaks: 0,
      listenerLeaks: 0,
      cacheLeaks: 0
    };

    const bodyHTML = document.body.innerHTML;

    // Check for intervals that might not be cleared
    result.intervalLeaks = (bodyHTML.match(/setInterval\s*\(/gi) || []).length -
                           (bodyHTML.match(/clearInterval/gi) || []).length;
    if (result.intervalLeaks > 2) {
      result.hasIssues = true;
      result.issues.push(`${result.intervalLeaks} potential interval leaks (setInterval without clearInterval)`);
    }

    // Check for setTimeout without clearTimeout
    const timeoutDiff = (bodyHTML.match(/setTimeout\s*\(/gi) || []).length -
                        (bodyHTML.match(/clearTimeout/gi) || []).length;
    if (timeoutDiff > 3) {
      result.hasIssues = true;
      result.issues.push(`${timeoutDiff} potential timeout leaks`);
    }

    // Check for closure patterns that might leak
    if (bodyHTML.includes('addEventListener') && !bodyHTML.includes('removeEventListener')) {
      result.listenerLeaks = (bodyHTML.match(/addEventListener/gi) || []).length;
      result.hasIssues = true;
      result.issues.push('Event listeners added without removal (potential leak)');
    }

    return result;
  }

  checkPerformanceTiming() {
    const result = {
      hasIssues: false,
      issues: [],
      performanceEntries: 0,
      resourceEntries: [],
      navigationEntries: [],
      timingAttacks: false,
      sideChannels: []
    };

    if (window.performance && window.performance.getEntries) {
      const entries = window.performance.getEntries();
      result.performanceEntries = entries.length;

      for (const entry of entries) {
        if (entry.entryType === 'resource') {
          result.resourceEntries.push({
            name: entry.name,
            duration: entry.duration,
            initiatorType: entry.initiatorType
          });
        }
        if (entry.entryType === 'navigation') {
          result.navigationEntries.push({
            type: entry.type,
            redirectCount: entry.redirectCount,
            dnsTime: entry.domainLookupEnd - entry.domainLookupStart,
            connectTime: entry.connectEnd - entry.connectStart,
            responseTime: entry.responseEnd - entry.responseStart
          });
        }
      }
    }

    // Check for timing attack vectors
    const bodyHTML = document.body.innerHTML;
    if (bodyHTML.includes('performance.now') || bodyHTML.includes('Date.now')) {
      result.timingAttacks = true;
      result.hasIssues = true;
      result.issues.push('High-resolution timing APIs used (potential side-channel vector)');
    }

    // Check for known side-channel patterns
    if (bodyHTML.includes('img.onload') || bodyHTML.includes('img.onerror')) {
      result.sideChannels.push('Image loading timing side-channel');
      result.hasIssues = true;
    }

    return result;
  }

  checkNavigationTiming() {
    const result = {
      hasIssues: false,
      issues: [],
      redirectChain: [],
      hstsEnabled: false,
      referrerLeaked: false,
      timingInfo: {}
    };

    if (window.performance && window.performance.timing) {
      const t = window.performance.timing;
      result.timingInfo = {
        dnsLookup: t.domainLookupEnd - t.domainLookupStart,
        connectionTime: t.connectEnd - t.connectStart,
        responseTime: t.responseEnd - t.responseStart,
        domLoadTime: t.domContentLoadedEventEnd - t.navigationStart,
        totalLoadTime: t.loadEventEnd - t.navigationStart
      };
    }

    // Check for HSTS via meta
    const hstsMeta = document.querySelector('meta[http-equiv="Strict-Transport-Security"]');
    if (hstsMeta) {
      result.hstsEnabled = true;
    }

    return result;
  }

  checkResourceTiming() {
    const result = {
      hasIssues: false,
      issues: [],
      thirdPartyResources: [],
      internalEndpoints: [],
      slowResources: [],
      largeResources: []
    };

    if (window.performance && window.performance.getEntriesByType) {
      const resources = window.performance.getEntriesByType('resource');
      
      for (const r of resources) {
        const url = new URL(r.name);
        
        // Third-party resources
        if (url.hostname !== window.location.hostname) {
          result.thirdPartyResources.push({
            hostname: url.hostname,
            duration: r.duration,
            size: r.transferSize
          });
        }

        // Slow resources
        if (r.duration > 1000) {
          result.slowResources.push({
            url: r.name,
            duration: r.duration
          });
        }

        // Internal endpoint discovery via timing
        if (url.pathname.includes('/api/') || url.pathname.includes('/internal/')) {
          result.internalEndpoints.push(url.pathname);
        }
      }
    }

    if (result.thirdPartyResources.length > 5) {
      result.hasIssues = true;
      result.issues.push(`${result.thirdPartyResources.length} third-party resources (increased attack surface)`);
    }

    return result;
  }

  // ============ API SECURITY ============

  checkRequestInterception() {
    const result = {
      hasIssues: false,
      issues: [],
      fetchOverridden: false,
      xhrOverridden: false,
      interceptors: 0,
      proxyPatterns: 0,
      middleware: []
    };

    const bodyHTML = document.body.innerHTML;

    // Check for fetch interception
    if (bodyHTML.includes('fetch =') || bodyHTML.includes('window.fetch =')) {
      result.fetchOverridden = true;
      result.hasIssues = true;
      result.issues.push('fetch() API overridden (potential interceptor/tampering)');
    }

    // Check for XMLHttpRequest interception
    if (bodyHTML.includes('XMLHttpRequest.prototype')) {
      result.xhrOverridden = true;
      result.hasIssues = true;
      result.issues.push('XMLHttpRequest prototype modified (potential interceptor)');
    }

    // Check for common middleware/interceptor patterns
    const middlewarePatterns = [
      /axios\.interceptors/gi,
      /\.interceptors\.request/gi,
      /\.interceptors\.response/gi,
      /middleware/gi,
      /interceptor/gi
    ];
    for (const pattern of middlewarePatterns) {
      const matches = bodyHTML.match(pattern);
      if (matches) {
        result.middleware.push(matches[0]);
        result.interceptors++;
      }
    }

    return result;
  }

  checkCredentialManagement() {
    const result = {
      hasIssues: false,
      issues: [],
      credentialAPI: 'credentials' in navigator,
      passwordManagerHints: false,
      autocompleteEnabled: false,
      savePasswordPrompts: false
    };

    // Check for password manager hints
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    if (passwordInputs.length > 0) {
      result.passwordManagerHints = true;
    }

    // Check autocomplete on sensitive fields
    for (const input of document.querySelectorAll('input')) {
      const auto = input.getAttribute('autocomplete');
      if (auto === 'on' || auto === 'username' || auto === 'current-password') {
        result.autocompleteEnabled = true;
      }
    }

    return result;
  }

  // ============ MODERN WEB APIs ============

  checkPaymentAPI() {
    return {
      supported: 'PaymentRequest' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkPermissionsAPI() {
    const result = {
      supported: 'permissions' in navigator,
      hasIssues: false,
      issues: [],
      requestedPermissions: []
    };

    const bodyHTML = document.body.innerHTML;
    const permissionPatterns = [
      /navigator\.permissions\.query/gi,
      /navigator\.geolocation/gi,
      /navigator\.mediaDevices/gi,
      /navigator\.notifications/gi,
      /navigator\.clipboard/gi
    ];

    for (const pattern of permissionPatterns) {
      if (bodyHTML.match(pattern)) {
        result.requestedPermissions.push(pattern.toString());
      }
    }

    return result;
  }

  checkBeaconAPI() {
    const result = {
      supported: 'sendBeacon' in navigator,
      hasIssues: false,
      issues: [],
      beaconUsage: 0
    };

    const bodyHTML = document.body.innerHTML;
    result.beaconUsage = (bodyHTML.match(/sendBeacon/gi) || []).length;

    if (result.beaconUsage > 0) {
      result.hasIssues = true;
      result.issues.push(`Beacon API used ${result.beaconUsage} times (data exfiltration on page unload)`);
    }

    return result;
  }

  checkWebRTC() {
    const result = {
      supported: 'RTCPeerConnection' in window,
      hasIssues: false,
      issues: [],
      peerConnections: 0,
      stunServers: [],
      turnServers: [],
      localIPLeakage: false
    };

    const bodyHTML = document.body.innerHTML;
    if (bodyHTML.includes('RTCPeerConnection') || bodyHTML.includes('webkitRTCPeerConnection')) {
      result.peerConnections = (bodyHTML.match(/new\s+RTCPeerConnection/gi) || []).length;
      result.hasIssues = true;
      result.issues.push(`WebRTC peer connections: ${result.peerConnections} (potential local IP leak)`);
    }

    return result;
  }

  // ============ EMERGING APIs (Privacy Sandbox & Experimental) ============

  checkTrustedTypes() {
    return {
      supported: 'trustedTypes' in window,
      enabled: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')?.includes('require-trusted-types') || false,
      hasIssues: false,
      issues: []
    };
  }

  checkReportingAPI() {
    return {
      supported: 'ReportingObserver' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkSpeculationRules() {
    const result = {
      supported: !!document.querySelector('script[type="speculationrules"]'),
      hasIssues: false,
      issues: [],
      rules: 0
    };

    const rules = document.querySelectorAll('script[type="speculationrules"]');
    result.rules = rules.length;

    if (result.rules > 0) {
      result.hasIssues = true;
      result.issues.push(`Speculation rules detected: ${result.rules} (potential prefetch attack)`);
    }

    return result;
  }

  checkFencedFrames() {
    return {
      supported: 'HTMLFencedFrameElement' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkSharedStorage() {
    return {
      supported: 'sharedStorage' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkPrivateStateTokens() {
    return {
      supported: 'PrivateStateToken' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkAttributionReporting() {
    const result = {
      supported: 'AttributionReporting' in window || document.createElement('a').attributionSourceId !== undefined,
      hasIssues: false,
      issues: [],
      attributions: 0
    };

    const links = document.querySelectorAll('a[attributionsrc]');
    result.attributions = links.length;

    return result;
  }

  checkTopicsAPI() {
    return {
      supported: 'browsingTopics' in document,
      hasIssues: false,
      issues: []
    };
  }

  // ============ HARDWARE & DEVICE APIs ============

  checkFileSystemAccess() {
    return {
      supported: 'showOpenFilePicker' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkWebSerial() {
    return {
      supported: 'serial' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkWebUSB() {
    return {
      supported: 'usb' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkWebBluetooth() {
    return {
      supported: 'bluetooth' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkGamepadAPI() {
    return {
      supported: 'getGamepads' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkSensors() {
    const result = {
      accelerometer: 'Accelerometer' in window,
      gyroscope: 'Gyroscope' in window,
      magnetometer: 'Magnetometer' in window,
      ambientLight: 'AmbientLightSensor' in window,
      proximity: 'ProximitySensor' in window,
      hasIssues: false,
      issues: []
    };

    if (result.accelerometer || result.gyroscope || result.magnetometer) {
      result.hasIssues = true;
      result.issues.push('Motion/orientation sensors available (potential tracking)');
    }

    return result;
  }

  checkSpeechAPI() {
    return {
      speechRecognition: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
      speechSynthesis: 'speechSynthesis' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkWebShare() {
    return {
      supported: 'share' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkContactPicker() {
    return {
      supported: 'contacts' in navigator && 'ContactsManager' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkWebOTP() {
    return {
      supported: 'OTPCredential' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkScreenWakeLock() {
    return {
      supported: 'wakeLock' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkIdleDetection() {
    return {
      supported: 'IdleDetector' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkWebNFC() {
    return {
      supported: 'NDEFReader' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkWebHID() {
    return {
      supported: 'hid' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkComputePressure() {
    return {
      supported: 'PressureObserver' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkFontAccess() {
    return {
      supported: 'queryLocalFonts' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkMultiScreen() {
    return {
      supported: 'getScreenDetails' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkWindowControlsOverlay() {
    return {
      supported: 'navigator' in window && 'windowControlsOverlay' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkDigitalGoods() {
    return {
      supported: 'getDigitalGoodsService' in window,
      hasIssues: false,
      issues: []
    };
  }

  // ============ PWA & BACKGROUND APIS ============

  checkPeriodicBackgroundSync() {
    return {
      supported: 'periodicSync' in navigator.serviceWorker || false,
      hasIssues: false,
      issues: []
    };
  }

  checkBackgroundSync() {
    return {
      supported: 'sync' in navigator.serviceWorker || false,
      hasIssues: false,
      issues: []
    };
  }

  checkContentIndex() {
    return {
      supported: 'index' in navigator.serviceWorker || false,
      hasIssues: false,
      issues: []
    };
  }

  checkBadging() {
    return {
      supported: 'setAppBadge' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkAppCache() {
    return {
      supported: 'applicationCache' in window,
      deprecated: true,
      hasIssues: false,
      issues: []
    };
  }

  checkNotificationTriggers() {
    return {
      supported: 'showNotification' in navigator && 'NotificationTrigger' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkWebAppManifest() {
    const manifest = document.querySelector('link[rel="manifest"]');
    return {
      present: !!manifest,
      href: manifest?.getAttribute('href') || null,
      hasIssues: false,
      issues: []
    };
  }

  checkPaymentHandlers() {
    return {
      supported: 'paymentManager' in navigator.serviceWorker || false,
      hasIssues: false,
      issues: []
    };
  }

  checkProtocolHandlers() {
    return {
      supported: 'registerProtocolHandler' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkURLHandlers() {
    return {
      supported: 'URLPattern' in window,
      hasIssues: false,
      issues: []
    };
  }

  checkShareTarget() {
    return {
      supported: false, // requires manifest parsing
      hasIssues: false,
      issues: []
    };
  }

  checkShortcuts() {
    return {
      supported: false, // requires manifest parsing
      hasIssues: false,
      issues: []
    };
  }

  checkRelatedApps() {
    return {
      supported: 'getInstalledRelatedApps' in navigator,
      hasIssues: false,
      issues: []
    };
  }

  checkCaptureLinks() {
    return {
      supported: false, // requires manifest parsing
      hasIssues: false,
      issues: []
    };
  }
}
