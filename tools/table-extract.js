import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class TableExtractTool {
  name = "table_extract";

  async execute(args) {
    const selector = args.selector || "table";
    const format = args.format || "json";
    const maxRows = args.maxRows || 500;
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const tables = document.querySelectorAll(${JSON.stringify(selector)});
        if (tables.length === 0) return { error: 'No tables found matching: ${selector}' };

        const extracted = [];
        for (let ti = 0; ti < tables.length; ti++) {
          const table = tables[ti];
          const rows = table.querySelectorAll('tr');
          const headers = [];
          const headerRow = rows[0];
          if (headerRow) {
            headerRow.querySelectorAll('th, td').forEach(th => headers.push(th.textContent.trim()));
          }

          const data = [];
          const startRow = headers.length > 0 ? 1 : 0;
          for (let ri = startRow; ri < rows.length && data.length < ${maxRows}; ri++) {
            const cells = rows[ri].querySelectorAll('td, th');
            const row = {};
            cells.forEach((cell, ci) => {
              const key = headers[ci] || 'col_' + ci;
              row[key] = cell.textContent.trim();
              // Also capture links
              const links = cell.querySelectorAll('a');
              if (links.length > 0) {
                row[key + '_links'] = Array.from(links).map(a => ({ text: a.textContent.trim(), href: a.href }));
              }
            });
            if (Object.keys(row).length > 0) data.push(row);
          }

          const caption = table.querySelector('caption');
          extracted.push({
            index: ti,
            caption: caption ? caption.textContent.trim() : '',
            headers,
            rowCount: data.length,
            data,
          });
        }

        return extracted;
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`table_extract: ${result.exceptionDetails.text}`);
    const val = result.result.value;
    if (val?.error) throw new Error(`table_extract: ${val.error}`);

    const jsonStr = JSON.stringify(val);
    return {
      tables: val,
      count: val.length,
      estimatedTokens: Math.round(jsonStr.length / 4),
    };
  }
}
