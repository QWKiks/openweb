import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class HistoryTool {
  name = "history";

  async execute(args) {
    const cmd = args.cmd;
    if (!cmd) throw new Error("history: cmd is required (back, forward, refresh)");

    const tab = await getActiveTab();
    await attach(tab.id);

    switch (cmd) {
      case "back": return this.goBack();
      case "forward": return this.goForward();
      case "refresh": return this.refresh(args);
      default: throw new Error(`history: unknown cmd "${cmd}". Use: back, forward, refresh`);
    }
  }

  async goBack() {
    await sendCommand("Runtime.evaluate", {
      expression: "window.history.back()",
      returnByValue: true,
      awaitPromise: false,
    });
    

    await new Promise((r) => setTimeout(r, 500));
    return { success: true, action: "back" };
  }

  async goForward() {
    await sendCommand("Runtime.evaluate", {
      expression: "window.history.forward()",
      returnByValue: true,
      awaitPromise: false,
    });
    await new Promise((r) => setTimeout(r, 500));
    return { success: true, action: "forward" };
  }

  async refresh(args) {
    const ignoreCache = args.ignoreCache || false;
    await sendCommand("Page.reload", { ignoreCache });
    return { success: true, action: "refresh", ignoreCache };
  }
}
