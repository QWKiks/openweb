import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class GetElementBoundsTool {
  name = "get_element_bounds";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const interactiveRoles = new Set([
          'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
          'listbox', 'menuitem', 'option', 'searchbox', 'slider', 'spinbutton', 'switch', 'tab'
        ]);

        function getCSSSelector(el) {
          if (el.id) return '#' + el.id;
          
          let path = [];
          let current = el;
          while (current && current.nodeType === 1) {
            let selector = current.tagName.toLowerCase();
            if (current.id) {
              selector += '#' + current.id;
              path.unshift(selector);
              break; // Unique enough
            } else {
              const siblings = Array.from(current.parentNode?.children || []);
              const sameTag = siblings.filter(s => s.tagName === current.tagName);
              if (sameTag.length > 1) {
                const index = sameTag.indexOf(current) + 1;
                selector += ':nth-of-type(' + index + ')';
              } else if (current.className) {
                const classes = current.className.trim().split(/\\s+/).filter(Boolean);
                if (classes.length > 0) {
                  selector += '.' + classes[0]; // just use first class for brevity
                }
              }
            }
            path.unshift(selector);
            current = current.parentNode;
          }
          return path.join(' > ');
        }

        function isVisible(el, rect) {
          if (rect.width <= 0 || rect.height <= 0) return false;
          
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
          }

          // Check if it's within the viewport bounds
          const inViewport = (
            rect.left < window.innerWidth &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.bottom > 0
          );
          
          return inViewport;
        }

        const elements = [];
        // Scan all DOM elements
        const all = document.getElementsByTagName('*');
        
        for (const el of all) {
          const tag = el.tagName;
          
          // Skip layout-only or content elements that aren't interactive
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'IFRAME', 'HTML', 'BODY', 'BR'].includes(tag)) {
            continue;
          }

          const role = el.getAttribute('role') || '';
          const style = window.getComputedStyle(el);
          const isInteractiveTag = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag);
          const isInteractiveRole = interactiveRoles.has(role.toLowerCase());
          const isPointerCursor = style.cursor === 'pointer';
          const hasClickEvent = el.onclick !== null || el.getAttribute('onclick') !== null;

          if (isInteractiveTag || isInteractiveRole || isPointerCursor || hasClickEvent) {
            const rect = el.getBoundingClientRect();
            if (isVisible(el, rect)) {
              // Calculate center coordinates
              const x = Math.round(rect.left + rect.width / 2);
              const y = Math.round(rect.top + rect.height / 2);
              
              // Get ARIA name or text label
              let name = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.title || '';
              if (!name) {
                // Try text content (truncated)
                name = el.textContent.trim().slice(0, 50).replace(/\\s+/g, ' ');
              }

              elements.push({
                selector: getCSSSelector(el),
                tag: tag.toLowerCase(),
                role: role || tag.toLowerCase(),
                name: name,
                x,
                y,
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              });
            }
          }
        }

        // Apply devicePixelRatio correction if needed (coordinates returned relative to viewport pixels)
        const dpr = window.devicePixelRatio || 1;

        return {
          success: true,
          devicePixelRatio: dpr,
          count: elements.length,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          elements
        };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) {
      throw new Error(`get_element_bounds: error in page context execution: ${result.exceptionDetails.text}`);
    }

    const value = result.result.value;
    if (value?.error) throw new Error(value.error);
    return value;
  }
}
