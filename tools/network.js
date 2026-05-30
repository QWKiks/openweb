/**
 * Network Tool
 * Consolidated network capturing, interception, HAR exporting, WebSocket monitoring,
 * redirect tracing, and API endpoint discovery under a single CDP interface.
 */

import { attach, sendCommand, getActiveTabId } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

const capturingTabs = new Set();
const requestStore = new Map(); // tabId → Map<requestId, requestInfo>
const MAX_REQUESTS_PER_TAB = 500;

const interceptingTabs = new Set();
const interceptRules = new Map(); // tabId → Array<{pattern, action, id}>
let ruleCounter = 0;

function getRequestMap(tabId) {
  let map = requestStore.get(tabId);
  if (!map) {
    map = new Map();
    requestStore.set(tabId, map);
  }
  return map;
}

// Clean up state when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (interceptingTabs.has(tabId)) {
    interceptingTabs.delete(tabId);
    interceptRules.delete(tabId);
  }
  if (capturingTabs.has(tabId)) {
    capturingTabs.delete(tabId);
    requestStore.delete(tabId);
  }
});

let listenerAdded = false;

function ensureListener() {
  if (listenerAdded) return;
  listenerAdded = true;

  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (!tabId) return;

    // 1. Network capturing
    if (capturingTabs.has(tabId)) {
      const store = getRequestMap(tabId);
      if (method === "Network.requestWillBeSent") {
        if (store.size >= MAX_REQUESTS_PER_TAB) {
          const oldestKey = store.keys().next().value;
          store.delete(oldestKey);
        }
        store.set(params.requestId, {
          requestId: params.requestId,
          url: params.request.url,
          method: params.request.method,
          timestamp: params.timestamp,
        });
      }
      if (method === "Network.responseReceived") {
        const entry = store.get(params.requestId);
        if (entry) {
          entry.status = params.response.status;
          entry.mimeType = params.response.mimeType;
        }
      }
      if (method === "Network.loadingFinished") {
        const entry = store.get(params.requestId);
        if (entry) entry.completed = true;
      }
    }

    // 2. Request interception
    if (interceptingTabs.has(tabId) && method === "Fetch.requestPaused") {
      const rules = interceptRules.get(tabId) || [];
      const url = params.request.url;
      let matchedRule = null;

      for (const rule of rules) {
        if (url.includes(rule.pattern)) {
          matchedRule = rule;
          break;
        }
      }

      if (!matchedRule) {
        sendCommand("Fetch.continueRequest", { requestId: params.requestId }).catch(() => {});
        return;
      }

      switch (matchedRule.action) {
        case "block":
          sendCommand("Fetch.failRequest", {
            requestId: params.requestId,
            reason: "BlockedByClient",
          }).catch(() => {});
          break;

        case "redirect":
          if (matchedRule.redirectUrl) {
            sendCommand("Fetch.fulfillRequest", {
              requestId: params.requestId,
              responseCode: matchedRule.responseCode || 302,
              responseHeaders: [
                { name: "Location", value: matchedRule.redirectUrl },
              ],
              body: "",
            }).catch(() => {});
          } else {
            sendCommand("Fetch.continueRequest", { requestId: params.requestId }).catch(() => {});
          }
          break;

        case "modify":
          const modifiedHeaders = params.request.headers
            ? Object.entries(params.request.headers).map(([name, value]) => ({ name, value }))
            : [];
          if (matchedRule.headers) {
            for (const [name, value] of Object.entries(matchedRule.headers)) {
              const idx = modifiedHeaders.findIndex((h) => h.name.toLowerCase() === name.toLowerCase());
              if (idx >= 0) {
                modifiedHeaders[idx].value = value;
              } else {
                modifiedHeaders.push({ name, value });
              }
            }
          }
          sendCommand("Fetch.continueRequest", {
            requestId: params.requestId,
            headers: modifiedHeaders,
            url: matchedRule.modifyUrl || undefined,
          }).catch(() => {});
          break;

        case "mock":
          const body = matchedRule.mockBody
            ? btoa(unescape(encodeURIComponent(matchedRule.mockBody)))
            : "";
          sendCommand("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: matchedRule.responseCode || 200,
            responseHeaders: matchedRule.mockHeaders
              ? Object.entries(matchedRule.mockHeaders).map(([name, value]) => ({ name, value }))
              : [{ name: "Content-Type", value: "application/json" }],
            body,
          }).catch(() => {});
          break;

        default:
          sendCommand("Fetch.continueRequest", { requestId: params.requestId }).catch(() => {});
      }
    }
  });
}

export class NetworkTool {
  name = "network";

  async execute(args) {
    const cmd = args.cmd;
    if (!cmd) throw new Error("network: cmd is required (start/stop/list/detail/block_ads/intercept/har_export/websocket_monitor/redirect_chain/api_discovery)");

    switch (cmd) {
      // ── Core Network Capturing ──
      case "start": return this.start();
      case "stop": return this.stop();
      case "list": return this.list(args.filter);
      case "detail": return this.detail(args.requestId);
      case "block_ads": return this.blockAds(args.enable !== false);

      // ── Request Interception ──
      case "intercept": return this.intercept(args);

      // ── HAR Exporting ──
      case "har_export": return this.harExport();

      // ── WebSocket Monitoring ──
      case "websocket_monitor": return this.websocketMonitor(args);

      // ── Redirect Tracing ──
      case "redirect_chain": return this.redirectChain(args);

      // ── API Endpoint Discovery ──
      case "api_discovery": return this.apiDiscovery();

      default: throw new Error(`network: unknown cmd "${cmd}"`);
    }
  }

  // ── Network Capturing Methods ──
  async start() {
    const tab = await getActiveTab();
    await attach(tab.id);
    const tabId = tab.id;

    requestStore.set(tabId, new Map());
    capturingTabs.add(tabId);
    await sendCommand("Network.enable");

    ensureListener();

    return { success: true, message: "network capture started" };
  }

  async stop() {
    const tabId = getActiveTabId();
    if (tabId !== null) {
      capturingTabs.delete(tabId);
      try { await sendCommand("Network.disable"); } catch {}
    }
    return { success: true, message: "network capture stopped" };
  }

  list(filter) {
    const tabId = getActiveTabId();
    let entries = [...(tabId === null ? new Map() : getRequestMap(tabId)).values()];

    if (filter) {
      entries = entries.filter((e) => e.url.includes(filter));
    }

    return {
      count: entries.length,
      requests: entries.map((e) => ({
        requestId: e.requestId,
        url: e.url,
        method: e.method,
        status: e.status,
        mimeType: e.mimeType,
        completed: e.completed ?? false,
      })),
    };
  }

  async detail(requestId) {
    if (!requestId) throw new Error("network: requestId is required for detail");

    const tabId = getActiveTabId();
    const entry = (tabId === null ? new Map() : getRequestMap(tabId)).get(requestId);
    if (!entry) throw new Error(`network: request "${requestId}" not found`);

    const response = await sendCommand("Network.getResponseBody", { requestId });
    let body = response.body;
    if (!response.base64Encoded) {
      try { body = JSON.parse(response.body); } catch {}
    }

    return {
      requestId: entry.requestId,
      url: entry.url,
      method: entry.method,
      status: entry.status,
      mimeType: entry.mimeType,
      base64Encoded: response.base64Encoded,
      body,
    };
  }

  async blockAds(enable = true) {
    const tab = await getActiveTab();
    await attach(tab.id);
    await sendCommand("Network.enable");
    
    if (!enable) {
      await sendCommand("Network.setBlockedURLs", { urls: [] });
      return { success: true, enabled: false, message: "Ad and tracker blocker disabled." };
    }
    
    const blockedUrls = [
      "*analytics*", "*doubleclick*", "*metrika*", "*google-analytics*",
      "*adsystem*", "*adsense*", "*adservice*", "*facebook.net*", "*facebook.com/tr*"
    ];
    
    await sendCommand("Network.setBlockedURLs", { urls: blockedUrls });
    return { success: true, enabled: true, blockedCount: blockedUrls.length, message: "Ad and tracker blocker enabled successfully." };
  }

  // ── Intercept Methods ──
  async intercept(args) {
    const action = args.action;
    if (!action) throw new Error("network(cmd: 'intercept'): action is required (start, stop, add_rule, remove_rule, list_rules)");

    switch (action) {
      case "start": {
        const tab = await getActiveTab();
        await attach(tab.id);
        interceptingTabs.add(tab.id);
        interceptRules.set(tab.id, []);
        ensureListener();
        await sendCommand("Fetch.enable", {
          handleAuthRequests: false,
          patterns: [{ urlPattern: "*" }],
        });
        return { success: true, message: "request interception started" };
      }
      case "stop": {
        const tabId = getActiveTabId();
        if (tabId !== null) {
          interceptingTabs.delete(tabId);
          interceptRules.delete(tabId);
          try { await sendCommand("Fetch.disable"); } catch {}
        }
        return { success: true, message: "request interception stopped" };
      }
      case "add_rule": {
        if (!args.pattern) throw new Error("network(cmd: 'intercept', action: 'add_rule'): pattern is required");
        // ruleAction parameter avoids collision with action
        const ruleAction = args.ruleAction || args.action; 
        if (!ruleAction || ruleAction === "add_rule") throw new Error("network(cmd: 'intercept', action: 'add_rule'): ruleAction is required (block, redirect, modify, mock)");

        const tabId = getActiveTabId();
        if (tabId === null || !interceptingTabs.has(tabId)) {
          throw new Error("network(cmd: 'intercept'): not started. Run intercept start first.");
        }

        const rules = interceptRules.get(tabId) || [];
        const id = `rule_${++ruleCounter}`;
        const rule = {
          id,
          pattern: args.pattern,
          action: ruleAction,
          redirectUrl: args.redirectUrl || null,
          modifyUrl: args.modifyUrl || null,
          headers: args.headers || null,
          mockBody: args.mockBody || null,
          mockHeaders: args.mockHeaders || null,
          responseCode: args.responseCode || null,
        };

        rules.push(rule);
        interceptRules.set(tabId, rules);
        return { success: true, ruleId: id, pattern: args.pattern, action: ruleAction };
      }
      case "remove_rule": {
        if (!args.ruleId) throw new Error("network(cmd: 'intercept', action: 'remove_rule'): ruleId is required");
        const tabId = getActiveTabId();
        const rules = interceptRules.get(tabId) || [];
        const idx = rules.findIndex((r) => r.id === args.ruleId);
        if (idx === -1) throw new Error(`network(cmd: 'intercept'): rule "${args.ruleId}" not found`);

        rules.splice(idx, 1);
        return { success: true, removed: args.ruleId };
      }
      case "list_rules": {
        const tabId = getActiveTabId();
        const rules = (interceptRules.get(tabId) || []).map((r) => ({
          id: r.id,
          pattern: r.pattern,
          action: r.action,
        }));
        return { count: rules.length, rules };
      }
      default:
        throw new Error(`network(cmd: 'intercept'): unknown action "${action}"`);
    }
  }

  // ── HAR Export Method ──
  async harExport() {
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const entries = performance.getEntriesByType('resource');
        const nav = performance.getEntriesByType('navigation')[0];
        
        const harEntries = entries.map(r => {
          const url = new URL(r.name);
          return {
            startedDateTime: new Date(performance.timeOrigin + r.startTime).toISOString(),
            time: Math.round(r.duration),
            request: {
              method: 'GET',
              url: r.name,
              httpVersion: 'HTTP/1.1',
              headers: [],
              queryString: [...url.searchParams].map(([name, value]) => ({ name, value })),
              cookies: [],
              headersSize: -1,
              bodySize: 0,
            },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/1.1',
              headers: [],
              cookies: [],
              content: {
                size: r.transferSize,
                mimeType: 'application/octet-stream',
              },
              redirectURL: '',
              headersSize: -1,
              bodySize: r.encodedBodySize || 0,
            },
            cache: {},
            timings: {
              blocked: -1,
              dns: Math.round(r.domainLookupEnd - r.domainLookupStart) || -1,
              connect: Math.round(r.connectEnd - r.connectStart) || -1,
              ssl: r.secureConnectionStart > 0 ? Math.round(r.connectEnd - r.secureConnectionStart) : -1,
              send: 0,
              wait: Math.round(r.responseStart - r.requestStart) || 0,
              receive: Math.round(r.responseEnd - r.responseStart) || 0,
            },
          };
        });

        return {
          log: {
            version: '1.2',
            creator: { name: 'OpenWeb', version: '1.5.1' },
            browser: { name: navigator.userAgent.split('/')[0] || 'Chrome', version: navigator.userAgent },
            pages: [{
              startedDateTime: new Date().toISOString(),
              id: 'page_1',
              title: document.title,
              pageTimings: {
                onContentLoad: Math.round(nav?.domContentLoadedEventEnd || 0),
                onLoad: Math.round(nav?.loadEventEnd || 0),
              },
            }],
            entries: harEntries,
            entryCount: harEntries.length,
          },
        };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`network(cmd: 'har_export'): ${result.exceptionDetails.text}`);
    }

    const data = result.result?.value || {};
    data.url = tab.url;
    data.exportedAt = new Date().toISOString();
    return data;
  }

  // ── WebSocket Monitor Method ──
  async websocketMonitor(args) {
    const action = args.action || "capture";
    const maxMessages = args.maxMessages || 100;

    const tab = await getActiveTab();
    await attach(tab.id);

    if (action === "capture") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          window.__wsMessages = window.__wsMessages || [];
          
          if (!window.__wsIntercepted) {
            const OriginalWebSocket = window.WebSocket;
            window.WebSocket = function(url, protocols) {
              const ws = new OriginalWebSocket(url, protocols);
              ws.__url = url;
              
              const originalSend = ws.send.bind(ws);
              ws.send = function(data) {
                window.__wsMessages.push({
                  type: "send",
                  url: ws.__url,
                  data: typeof data === "string" ? data : "[Binary/Blob]",
                  timestamp: Date.now(),
                });
                if (window.__wsMessages.length > ${maxMessages}) window.__wsMessages.shift();
                return originalSend(data);
              };
              
              const originalOnMessage = ws.onmessage;
              ws.onmessage = function(event) {
                window.__wsMessages.push({
                  type: "receive",
                  url: ws.__url,
                  data: typeof event.data === "string" ? event.data : "[Binary/Blob]",
                  timestamp: Date.now(),
                });
                if (window.__wsMessages.length > ${maxMessages}) window.__wsMessages.shift();
                if (originalOnMessage) originalOnMessage.call(this, event);
              };
              
              ws.addEventListener("message", (event) => {
                window.__wsMessages.push({
                  type: "receive",
                  url: ws.__url,
                  data: typeof event.data === "string" ? event.data : "[Binary/Blob]",
                  timestamp: Date.now(),
                });
                if (window.__wsMessages.length > ${maxMessages}) window.__wsMessages.shift();
              });
              
              return ws;
            };
            window.WebSocket.prototype = OriginalWebSocket.prototype;
            window.__wsIntercepted = true;
          }
          
          return {
            status: "interceptors_installed",
            messageCount: window.__wsMessages.length,
          };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) throw new Error(`network(cmd: 'websocket_monitor'): ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    if (action === "read") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const msgs = window.__wsMessages || [];
          return {
            messageCount: msgs.length,
            messages: msgs.slice(-${maxMessages}),
          };
        })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) throw new Error(`network(cmd: 'websocket_monitor'): ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    if (action === "clear") {
      const result = await sendCommand("Runtime.evaluate", {
        expression: `(() => { window.__wsMessages = []; return { status: "cleared" }; })()`,
        returnByValue: true,
        awaitPromise: false,
      });

      if (result.exceptionDetails) throw new Error(`network(cmd: 'websocket_monitor'): ${result.exceptionDetails.text}`);
      return result.result?.value || {};
    }

    throw new Error(`network(cmd: 'websocket_monitor'): unknown action "${action}". Use: capture, read, clear`);
  }

  // ── Redirect Chain Method ──
  async redirectChain(args) {
    const url = args.url || args.page_url;
    if (!url) throw new Error("network(cmd: 'redirect_chain'): url is required");

    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        async function traceRedirects(startUrl) {
          const chain = [];
          let current = startUrl;
          let maxRedirects = 10;
          
          while (maxRedirects-- > 0) {
            try {
              const response = await fetch(current, { method: 'HEAD', redirect: 'manual', mode: 'no-cors' });
              const status = response.status;
              chain.push({ url: current, status });
              
              if (status >= 300 && status < 400) {
                const location = response.headers.get('location');
                if (location) {
                  current = new URL(location, current).href;
                  continue;
                }
              }
              break;
            } catch (err) {
              chain.push({ url: current, status: 0, error: err.message });
              break;
            }
          }
          
          return chain;
        }
        
        return traceRedirects(${JSON.stringify(url)});
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      throw new Error(`network(cmd: 'redirect_chain'): ${result.exceptionDetails.text}`);
    }

    const chain = result.result?.value || [];
    const finalStatus = chain.length > 0 ? chain[chain.length - 1].status : 0;
    const hasRedirect = chain.length > 1;

    return {
      url,
      chain,
      hops: chain.length,
      hasRedirect,
      finalStatus,
    };
  }

  // ── API Discovery Method ──
  async apiDiscovery() {
    const tab = await getActiveTab();
    await attach(tab.id);

    const expr = "(() => {\n" +
      "  const endpoints = new Set();\n" +
      "  const scripts = [...document.querySelectorAll('script')].map(s => s.textContent || '').join('\\n');\n" +
      "  const patterns = [\n" +
      "    /fetch\\(['\"/]([^'\"/]+)['\"/]/g,\n" +
      "    /axios\\.(get|post|put|delete|patch)\\(['\"/]([^'\"/]+)['\"/]/g,\n" +
      "    /\\$\\.(get|post|put|delete|ajax)\\(\\{[^}]*url:\\s*['\"/]([^'\"/]+)['\"/]/g,\n" +
      "    /['\"/](https?:\\/\\/[^'\"/]+\\/api\\/[^'\"]*)['\"/]/g,\n" +
      "    /['\"/](https?:\\/\\/[^'\"/]+\\/graphql[^'\"]*)['\"/]/g,\n" +
      "    /['\"/](\\/api\\/[^'\"]*)['\"/]/g,\n" +
      "    /['\"/](\\/v\\d+\\/[^'\"]*)['\"/]/g,\n" +
      "    /['\"/](\\/rest\\/[^'\"]*)['\"/]/g,\n" +
      "    /['\"/]([^'\"]*\\/(?:graphql|swagger|openapi)[^'\"]*)['\"]/g,\n" +
      "  ];\n" +
      "  for (const pattern of patterns) {\n" +
      "    let match;\n" +
      "    while ((match = pattern.exec(scripts)) !== null) {\n" +
      "      const url = match[1] || match[2];\n" +
      "      if (url && url.length > 3 && !url.includes('\\\\${')) endpoints.add(url);\n" +
      "    }\n" +
      "  }\n" +
      "  const fetchUrls = performance.getEntriesByType('resource')\n" +
      "    .filter(r => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest')\n" +
      "    .map(r => r.name);\n" +
      "  for (const url of fetchUrls) {\n" +
      "    try {\n" +
      "      const u = new URL(url);\n" +
      "      if (u.pathname.includes('/api/') || u.pathname.includes('/graphql') || u.pathname.match(/\\/v\\d+\\//)) {\n" +
      "        endpoints.add(url);\n" +
      "      }\n" +
      "    } catch {}\n" +
      "  }\n" +
      "  const uniqueEndpoints = [...endpoints].filter(e => e.length > 3).slice(0, 50);\n" +
      "  return {\n" +
      "    totalFound: uniqueEndpoints.length,\n" +
      "    endpoints: uniqueEndpoints,\n" +
      "    fromPerformanceAPI: fetchUrls.filter(u => {\n" +
      "      try { return new URL(u).pathname.includes('/api/') || new URL(u).pathname.includes('/graphql'); }\n" +
      "      catch { return false; }\n" +
      "    }).length,\n" +
      "  };\n" +
      "})()";

    const result = await sendCommand("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error("network(cmd: 'api_discovery'): " + result.exceptionDetails.text);
    const data = result.result?.value || {};
    data.url = tab.url;
    return data;
  }
}
