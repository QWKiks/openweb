/**
 * Redirect Chain Tool
 * Returns the full redirect chain with status codes for a URL.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class RedirectChainTool {
  name = "redirect_chain";

  async execute(args) {
    const url = args.url || args.page_url;
    if (!url) throw new Error("redirect_chain: url is required");

    const tab = await getActiveTab();
    await attach(tab.id);

    // Use fetch with redirect: manual to trace chain
    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        async function traceRedirects(startUrl) {
          const chain = [];
          let current = startUrl;
          let maxRedirects = 10;
          
          while (maxRedirects-- > 0) {
            try {
              const response = await fetch(current, { method: 'HEAD', redirect: 'manual', mode: 'no-cors' });
              const status = response.status;
              chain.push({ url: current, status });
              
              if (status >= 300 && status < 400) {
                const location = response.headers.get('location');
                if (location) {
                  current = new URL(location, current).href;
                  continue;
                }
              }
              break;
            } catch (err) {
              chain.push({ url: current, status: 0, error: err.message });
              break;
            }
          }
          
          return chain;
        }
        
        return traceRedirects(${JSON.stringify(url)});
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      throw new Error(`redirect_chain: ${result.exceptionDetails.text}`);
    }

    const chain = result.result?.value || [];
    const finalStatus = chain.length > 0 ? chain[chain.length - 1].status : 0;
    const hasRedirect = chain.length > 1;

    return {
      url,
      chain,
      hops: chain.length,
      hasRedirect,
      finalStatus,
    };
  }
}
