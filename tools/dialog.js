/**
 * Dialog Tool
 * Handle JavaScript dialogs (alert, confirm, prompt, beforeunload).
 */

import { attach, sendCommand, getActiveTabId } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

const autoHandlers = new Map(); // tabId → { accept: boolean, promptText?: string }
let listenerAdded = false;
const pendingDialogs = new Map(); // tabId → { type, message }

function ensureListener() {
  if (listenerAdded) return;
  listenerAdded = true;

  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (method === "Page.javascriptDialogOpening") {
      pendingDialogs.set(tabId, {
        type: params.type,
        message: params.message,
        defaultPrompt: params.defaultPrompt || "",
      });

      // Auto-handle if configured
      const handler = autoHandlers.get(tabId);
      if (handler) {
        sendCommand("Page.handleJavaScriptDialog", {
          accept: handler.accept,
          promptText: handler.promptText || params.defaultPrompt || "",
        }).catch(() => {});
      }
    }
  });
}

export class DialogTool {
  name = "dialog";

  async execute(args) {
    const cmd = args.cmd || "list";
    const tab = await getActiveTab();
    await attach(tab.id);
    ensureListener();

    // Enable dialog events
    await sendCommand("Page.enable");

    switch (cmd) {
      case "list": return this.list();
      case "handle": return this.handle(args);
      case "auto": return this.setAutoHandler(args);
      default: throw new Error(`dialog: unknown cmd "${cmd}". Use: list, handle, auto`);
    }
  }

  list() {
    const tabId = getActiveTabId();
    const dialog = pendingDialogs.get(tabId);
    if (!dialog) {
      return { hasDialog: false };
    }
    return { hasDialog: true, ...dialog };
  }

  async handle(args) {
    const accept = args.accept != null ? args.accept : true;
    const promptText = args.promptText || "";

    await sendCommand("Page.handleJavaScriptDialog", {
      accept,
      promptText,
    });

    const tabId = getActiveTabId();
    pendingDialogs.delete(tabId);

    return { success: true, accepted: accept, promptText };
  }

  setAutoHandler(args) {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("dialog: no active tab");

    if (args.disable) {
      autoHandlers.delete(tabId);
      return { success: true, autoHandle: false };
    }

    autoHandlers.set(tabId, {
      accept: args.accept != null ? args.accept : true,
      promptText: args.promptText || "",
    });

    return { success: true, autoHandle: true, accept: args.accept ?? true };
  }
}
