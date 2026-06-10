import { executeTool } from "./registry.js";

export class ExtractPageTool {
  get name() { return "extract_page"; }
  async execute(args) {
    const snapResult = await executeTool("snapshot", { selector: args?.selector, _tabId: args?._tabId });
    const mdResult = await executeTool("get_markdown", { selector: args?.selector, _tabId: args?._tabId });
    return {
      text: `=== Snapshot (${snapResult?.refCount || 0} refs) ===\n${snapResult?.tree || ""}\n\n=== Markdown ===\n${mdResult || ""}`,
      data: {
        snapshot: snapResult,
        markdown: { text: mdResult }
      }
    };
  }
}
