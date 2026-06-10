import { executeTool } from "./registry.js";

export class ClickAndVerifyTool {
  get name() { return "click_and_verify"; }
  async execute(args) {
    await executeTool("click", { selector: args.selector, mode: args.mode || "synthetic", _tabId: args?._tabId });
    
    const waitFor = args.waitFor || "network_idle";
    if (waitFor !== "none") {
      try {
        await executeTool("wait", { type: waitFor, _tabId: args?._tabId, timeout: 5000 });
      } catch (e) {
        // ignore wait timeouts
      }
    }
    
    const screenshotResult = await executeTool("screenshot", { _tabId: args?._tabId });
    return screenshotResult;
  }
}
