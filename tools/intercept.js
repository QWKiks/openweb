/**
 * Intercept Tool
 * Intercept, modify, or block HTTP requests/responses using CDP Fetch domain.
 */

import { attach, sendCommand, getActiveTabId } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

const interceptingTabs = new Set();
const interceptRules = new Map(); // tabId → Array<{pattern, action, id}>
let ruleCounter = 0;
let listenerAdded = false;

function ensureListener() {
  if (listenerAdded) return;
  listenerAdded = true;

  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (!tabId || !interceptingTabs.has(tabId)) return;

    if (method === "Fetch.requestPaused") {
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
        // No matching rule — continue the request
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

export class InterceptTool {
  name = "intercept";

  async execute(args) {
    const cmd = args.cmd;
    if (!cmd) throw new Error("intercept: cmd is required (start, stop, add_rule, remove_rule, list_rules)");

    switch (cmd) {
      case "start": return this.start();
      case "stop": return this.stop();
      case "add_rule": return this.addRule(args);
      case "remove_rule": return this.removeRule(args);
      case "list_rules": return this.listRules();
      default: throw new Error(`intercept: unknown cmd "${cmd}"`);
    }
  }

  async start() {
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

  async stop() {
    const tabId = getActiveTabId();
    if (tabId !== null) {
      interceptingTabs.delete(tabId);
      interceptRules.delete(tabId);
      try { await sendCommand("Fetch.disable"); } catch {}
    }
    return { success: true, message: "request interception stopped" };
  }

  async addRule(args) {
    if (!args.pattern) throw new Error("intercept: pattern is required for add_rule");
    if (!args.action) throw new Error("intercept: action is required (block, redirect, modify, mock)");

    const tabId = getActiveTabId();
    if (tabId === null || !interceptingTabs.has(tabId)) {
      throw new Error("intercept: not started. Run intercept start first.");
    }

    const rules = interceptRules.get(tabId) || [];
    const id = `rule_${++ruleCounter}`;
    const rule = {
      id,
      pattern: args.pattern,
      action: args.action,
      redirectUrl: args.redirectUrl || null,
      modifyUrl: args.modifyUrl || null,
      headers: args.headers || null,
      mockBody: args.mockBody || null,
      mockHeaders: args.mockHeaders || null,
      responseCode: args.responseCode || null,
    };

    rules.push(rule);
    interceptRules.set(tabId, rules);
    return { success: true, ruleId: id, pattern: args.pattern, action: args.action };
  }

  async removeRule(args) {
    if (!args.ruleId) throw new Error("intercept: ruleId is required for remove_rule");

    const tabId = getActiveTabId();
    const rules = interceptRules.get(tabId) || [];
    const idx = rules.findIndex((r) => r.id === args.ruleId);
    if (idx === -1) throw new Error(`intercept: rule "${args.ruleId}" not found`);

    rules.splice(idx, 1);
    return { success: true, removed: args.ruleId };
  }

  listRules() {
    const tabId = getActiveTabId();
    const rules = (interceptRules.get(tabId) || []).map((r) => ({
      id: r.id,
      pattern: r.pattern,
      action: r.action,
    }));
    return { count: rules.length, rules };
  }
}
