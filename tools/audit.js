import { SeoAuditTool } from "./seo-audit.js";
import { A11yAuditTool } from "./a11y-audit.js";
import { PerformanceAuditTool } from "./performance-audit.js";
import { FormAuditTool } from "./form-audit.js";
import { BrokenLinksTool } from "./broken-links.js";

export class AuditTool {
  name = "audit";

  async execute(args) {
    const type = args.type || "seo";
    let tool;

    switch (type.toLowerCase()) {
      case "seo":
        tool = new SeoAuditTool();
        break;
      case "accessibility":
      case "a11y":
        tool = new A11yAuditTool();
        break;
      case "performance":
      case "perf":
        tool = new PerformanceAuditTool();
        break;
      case "forms":
        tool = new FormAuditTool();
        break;
      case "links":
        tool = new BrokenLinksTool();
        break;
      default:
        throw new Error(`Unknown audit type: ${type}. Available: seo, accessibility (a11y), performance, forms, links`);
    }

    return tool.execute(args);
  }
}
