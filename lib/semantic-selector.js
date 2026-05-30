export function resolveSemanticSelectors(description) {
  const desc = description.trim().toLowerCase();
  const selectors = [];

  

  const isInput = /^(email|password|search|text|url|number|tel|username|name|first\s*name|last\s*name|phone|address|city|state|zip|country|date|time)$/i.test(desc);
  const isButton = /^(login|submit|sign\s*in|sign\s*up|register|save|cancel|delete|close|ok|apply|confirm|next|previous|back|add|remove|edit|update|search|send|reset)$/i.test(desc);

  

  selectors.push(`[aria-label*="${desc}" i]`);

  

  if (isInput) {
    selectors.push(`input[placeholder*="${desc}" i]`);
    selectors.push(`textarea[placeholder*="${desc}" i]`);
  }

  

  selectors.push(`[title*="${desc}" i]`);

  

  if (isButton) {
    selectors.push(`input[type="submit"][value*="${desc}" i]`);
    selectors.push(`input[type="button"][value*="${desc}" i]`);
    selectors.push(`button[aria-label*="${desc}" i]`);
    selectors.push(`[role="button"][aria-label*="${desc}" i]`);
    selectors.push(`a[aria-label*="${desc}" i]`);
  }

  

  if (isInput) {
    selectors.push(`input[type="text"][aria-label*="${desc}" i]`);
    selectors.push(`input[type="${desc}"]`);
  }

  

  

  if (isButton) {
    selectors.push(`js:findByTextContent("${desc}", "button,a,[role='button'],input[type='submit'],input[type='button']")`);
  }
  selectors.push(`js:findByTextContent("${desc}", "button,a,label,span,div,[role='button'],[role='link'],[role='tab']")`);

  return selectors;
}

   
                                                                  
                                                         
                                                                         
  
                                            
                                                               
                                                 
   
export function buildTextSearchExpression(text, scope) {
  return `(() => {
    const candidates = document.querySelectorAll(${JSON.stringify(scope)});
    const target = ${JSON.stringify(text.toLowerCase())};
    for (const el of candidates) {
      const content = (el.textContent || '').trim().toLowerCase();
      if (content === target || content.includes(target)) {
        return el;
      }
    }
    return null;
  })()`;
}

   
                                                                         
                           
                     
   
export function isSemanticSelector(selector) {
  return typeof selector === "string" && selector.startsWith("semantic:");
}

   
                                                   
                           
                    
   
export function parseSemanticSelector(selector) {
  return selector.replace(/^semantic:\s*/i, "").trim();
}

   
                                                
                                                     
                                    
   
export function resolveSelector(selector) {
  if (!isSemanticSelector(selector)) return [selector];
  const desc = parseSemanticSelector(selector);
  return resolveSemanticSelectors(desc);
}
