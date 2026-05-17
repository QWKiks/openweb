/**
 * Save as PDF Tool
 * Exports the current page as a PDF using CDP Page.printToPDF.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

const PAPER_SIZES = {
  letter: [8.5, 11],
  legal: [8.5, 14],
  a4: [8.27, 11.69],
  a3: [11.69, 16.54],
  tabloid: [11, 17],
};

export class SaveAsPdfTool {
  name = "save_as_pdf";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const paperFormat = (args.paper_format || "letter").toLowerCase();
    const [paperWidth, paperHeight] = PAPER_SIZES[paperFormat] ?? PAPER_SIZES.letter;

    const scale = typeof args.scale === "number" ? args.scale : 1;
    if (scale < 0.1 || scale > 2) {
      throw new Error(`save_as_pdf: scale must be in [0.1, 2.0], got ${scale}`);
    }

    const result = await sendCommand("Page.printToPDF", {
      printBackground: args.print_background !== false,
      landscape: !!args.landscape,
      scale,
      paperWidth,
      paperHeight,
      preferCSSPageSize: true,
    });

    if (!result?.data) throw new Error("save_as_pdf: CDP Page.printToPDF returned no data");

    let pageTitle = "";
    try {
      pageTitle = (
        await sendCommand("Runtime.evaluate", {
          expression: "document.title",
          returnByValue: true,
        })
      ).result?.value ?? "";
    } catch {}

    return {
      data: result.data,
      mimeType: "application/pdf",
      dataLength: result.data.length,
      pageTitle,
      requestedFileName: args.file_name || "",
    };
  }
}
