/**
 * Get Markdown Tool
 * Scrapes the active page and converts its DOM (or a specific selector) to structured Markdown.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class GetMarkdownTool {
  name = "get_markdown";

  async execute(args) {
    const as = args.as || "markdown";
    const tab = await getActiveTab();
    await attach(tab.id);

    if (as === "table") {
      const selector = args.selector || "table";
      const maxRows = args.maxRows || 500;

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

      if (result.exceptionDetails) throw new Error(`get_markdown(as:table): ${result.exceptionDetails.text}`);
      const val = result.result.value;
      if (val?.error) throw new Error(`get_markdown(as:table): ${val.error}`);

      const jsonStr = JSON.stringify(val);
      return {
        tables: val,
        count: val.length,
        estimatedTokens: Math.round(jsonStr.length / 4),
      };
    }

    const selector = args.selector || "body";
    // Evaluate the DOM-to-Markdown converter in the context of the page
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        if (!root) return { error: 'Element not found: ' + ${JSON.stringify(selector)} };

        // Helper to check block tags
        const blockTags = new Set([
          'DIV', 'P', 'ARTICLE', 'SECTION', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 
          'BLOCKQUOTE', 'FORM', 'UL', 'OL', 'LI', 'TABLE', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
        ]);

        function isBlock(node) {
          return node.nodeType === 1 && (blockTags.has(node.tagName) || window.getComputedStyle(node).display === 'block');
        }

        function toMarkdown(node, depth = 0) {
          if (!node || depth > 50) return '';

          // Text node
          if (node.nodeType === 3) {
            return node.nodeValue.replace(/\\s+/g, ' ');
          }

          // Element node
          if (node.nodeType === 1) {
            const tag = node.tagName;

            // Skip scripts, styles, hidden elements
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'HEAD', 'SELECT', 'OPTION', 'TEXTAREA'].includes(tag)) {
              return '';
            }
            
            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return '';
            }

            // Convert children recursively
            const childParts = [];
            for (const child of node.childNodes) {
              const text = toMarkdown(child, depth + 1);
              if (text) childParts.push(text);
            }
            const childrenText = childParts.join('');

            switch (tag) {
              case 'H1': return '\\n\\n# ' + childrenText.trim() + '\\n\\n';
              case 'H2': return '\\n\\n## ' + childrenText.trim() + '\\n\\n';
              case 'H3': return '\\n\\n### ' + childrenText.trim() + '\\n\\n';
              case 'H4': return '\\n\\n#### ' + childrenText.trim() + '\\n\\n';
              case 'H5': return '\\n\\n##### ' + childrenText.trim() + '\\n\\n';
              case 'H6': return '\\n\\n###### ' + childrenText.trim() + '\\n\\n';
              case 'P': return '\\n\\n' + childrenText.trim() + '\\n\\n';
              case 'BR': return '\\n';
              case 'STRONG':
              case 'B': {
                const text = childrenText.trim();
                return text ? '**' + text + '**' : '';
              }
              case 'EM':
              case 'I': {
                const text = childrenText.trim();
                return text ? '*' + text + '*' : '';
              }
              case 'CODE': {
                const text = node.textContent;
                if (node.parentNode && node.parentNode.tagName === 'PRE') {
                  return text;
                }
                return text.trim() ? ' \` ' + text.trim() + ' \` ' : '';
              }
              case 'PRE': {
                const text = node.textContent;
                return '\\n\\n\`\`\`\\n' + text + '\\n\`\`\`\\n\\n';
              }
              case 'A': {
                const href = node.getAttribute('href');
                const text = childrenText.trim();
                if (!href || href.startsWith('javascript:')) return text;
                // Resolve relative URLs
                let absoluteUrl = href;
                try {
                  absoluteUrl = new URL(href, window.location.href).href;
                } catch (_) {}
                return text ? '[' + text + '](' + absoluteUrl + ')' : absoluteUrl;
              }
              case 'IMG': {
                const src = node.getAttribute('src');
                const alt = node.getAttribute('alt') || 'Image';
                if (!src) return '';
                let absoluteSrc = src;
                try {
                  absoluteSrc = new URL(src, window.location.href).href;
                } catch (_) {}
                return ' ![' + alt + '](' + absoluteSrc + ') ';
              }
              case 'LI': {
                const parent = node.parentNode;
                const index = Array.from(parent?.children || []).indexOf(node) + 1;
                const isOrdered = parent && parent.tagName === 'OL';
                const prefix = isOrdered ? index + '. ' : '* ';
                return prefix + childrenText.trim() + '\\n';
              }
              case 'UL':
              case 'OL': return '\\n\\n' + childrenText.trim() + '\\n\\n';
              case 'TABLE': {
                const rows = Array.from(node.querySelectorAll('tr'));
                if (rows.length === 0) return '';
                let tableMd = '\\n\\n';
                rows.forEach((row, rIndex) => {
                  const cells = Array.from(row.querySelectorAll('th, td'));
                  const cellTexts = cells.map(c => c.textContent.trim().replace(/\\|/g, '\\\\|'));
                  tableMd += '| ' + cellTexts.join(' | ') + ' |\\n';
                  if (rIndex === 0) {
                    tableMd += '| ' + cells.map(() => '---').join(' | ') + ' |\\n';
                  }
                });
                return tableMd + '\\n\\n';
              }
              default: {
                const text = childrenText;
                return isBlock(node) ? '\\n' + text + '\\n' : text;
              }
            }
          }
          return '';
        }

        // Clean up markdown text blocks
        let md = toMarkdown(root);
        md = md.replace(/\\n{3,}/g, '\\n\\n'); // Collapsing multi-newlines
        return { success: true, markdown: md.trim(), title: document.title, url: window.location.href };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`get_markdown: error in page context execution: ${result.exceptionDetails.text}`);
    }

    const value = result.result.value;
    if (value?.error) throw new Error(value.error);
    // Add token estimate for context budget tracking
    if (value?.markdown) {
      value.estimatedTokens = Math.round(value.markdown.length / 4);
    }
    return value;
  }
}
