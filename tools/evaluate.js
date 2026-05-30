import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class EvaluateTool {
  name = "evaluate";

  async execute(args) {
    const code = args.code;
    if (!code) throw new Error("evaluate: code is required. RECOMMENDATION: Provide a JavaScript expression or function to execute on the page, e.g., 'document.title'.");

    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: code,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text;
      throw new Error(`evaluate: ${description}`);
    }

    return { type: result.result.type, value: result.result.value };
  }
}
