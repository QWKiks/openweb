import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class DesignCloneTool {
  name = "design_clone";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    

    const auditResult = await sendCommand("Runtime.evaluate", {
      expression: this.buildExpression(),
      returnByValue: true,
      awaitPromise: false,
    });

    if (auditResult.exceptionDetails) {
      throw new Error(`design_clone: ${auditResult.exceptionDetails.text}`);
    }

    const data = auditResult.result?.value || {};
    data.url = tab.url;
    data.title = tab.title;

    

    const prompt = this.buildPrompt(data);

    return {
      url: tab.url,
      title: tab.title,
      prompt,
      rawData: data,
    };
  }

  buildExpression() {
    return `(() => {
      const computed = (el, prop) => window.getComputedStyle(el)[prop];
      const body = document.body;
      const html = document.documentElement;
      const rootStyles = window.getComputedStyle(html);
      const bodyStyles = window.getComputedStyle(body);

      // Colors
      const colors = new Set();
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        const s = window.getComputedStyle(el);
        if (s.color && s.color !== 'rgba(0, 0, 0, 0)') colors.add(s.color);
        if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') colors.add(s.backgroundColor);
        if (s.borderColor && s.borderColor !== 'rgba(0, 0, 0, 0)') colors.add(s.borderColor);
      }

      // Typography
      const fonts = new Set();
      const fontSizes = new Set();
      const fontWeights = new Set();
      const lineHeights = new Set();
      const letterSpacings = new Set();
      for (const el of allEls) {
        const s = window.getComputedStyle(el);
        if (s.fontFamily) fonts.add(s.fontFamily.split(',')[0].replace(/["']/g, ''));
        if (s.fontSize) fontSizes.add(s.fontSize);
        if (s.fontWeight) fontWeights.add(s.fontWeight);
        if (s.lineHeight) lineHeights.add(s.lineHeight);
        if (s.letterSpacing) letterSpacings.add(s.letterSpacing);
      }

      // Layout
      const hasGrid = [...document.querySelectorAll('*')].some(el => computed(el, 'display') === 'grid');
      const hasFlex = [...document.querySelectorAll('*')].some(el => computed(el, 'display') === 'flex');
      const containers = [...document.querySelectorAll('header, nav, main, section, article, aside, footer, div[class*="container"], div[class*="wrapper"], div[class*="layout"]')]
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          class: el.className || null,
          id: el.id || null,
          width: computed(el, 'width'),
          maxWidth: computed(el, 'maxWidth'),
          margin: computed(el, 'margin'),
          padding: computed(el, 'padding'),
          display: computed(el, 'display'),
          gridTemplate: hasGrid && computed(el, 'display') === 'grid' ? computed(el, 'gridTemplateColumns') : null,
        }));

      // Buttons
      const buttons = [...document.querySelectorAll('button, a[class*="btn"], a[class*="button"], [role="button"]')]
        .slice(0, 20)
        .map(btn => {
          const s = window.getComputedStyle(btn);
          return {
            text: btn.textContent?.trim().slice(0, 50) || '',
            tag: btn.tagName.toLowerCase(),
            bg: s.backgroundColor,
            color: s.color,
            border: s.border,
            borderRadius: s.borderRadius,
            padding: s.padding,
            fontSize: s.fontSize,
            fontWeight: s.fontWeight,
            textTransform: s.textTransform,
            boxShadow: s.boxShadow !== 'none' ? s.boxShadow : null,
          };
        });

      // Cards / content blocks
      const cards = [...document.querySelectorAll('[class*="card"], [class*="box"], [class*="panel"]')]
        .slice(0, 10)
        .map(c => {
          const s = window.getComputedStyle(c);
          return {
            bg: s.backgroundColor,
            border: s.border,
            borderRadius: s.borderRadius,
            padding: s.padding,
            boxShadow: s.boxShadow !== 'none' ? s.boxShadow : null,
          };
        });

      // Navigation
      const nav = document.querySelector('nav, [class*="nav"], [class*="menu"], [class*="header"]');
      const navData = nav ? {
        height: computed(nav, 'height'),
        bg: computed(nav, 'backgroundColor'),
        position: computed(nav, 'position'),
        items: [...nav.querySelectorAll('a')].map(a => a.textContent?.trim()).filter(Boolean).slice(0, 15),
      } : null;

      // Hero / main visual
      const hero = document.querySelector('header, [class*="hero"], [class*="banner"], [class*="main-visual"]');
      const heroData = hero ? {
        height: computed(hero, 'height'),
        bg: computed(hero, 'backgroundColor'),
        bgImage: computed(hero, 'backgroundImage') !== 'none' ? computed(hero, 'backgroundImage') : null,
      } : null;

      // Spacing scale
      const spacings = new Set();
      for (const el of allEls) {
        const s = window.getComputedStyle(el);
        spacings.add(s.marginTop);
        spacings.add(s.marginBottom);
        spacings.add(s.paddingTop);
        spacings.add(s.paddingBottom);
        spacings.add(s.gap);
      }

      // Animations
      const animations = new Set();
      for (const el of allEls) {
        const s = window.getComputedStyle(el);
        if (s.transition !== 'all 0s ease 0s' && s.transition !== 'none') animations.add(s.transition);
        if (s.animationName !== 'none') animations.add(s.animationName + ': ' + s.animationDuration + ' ' + s.animationTimingFunction);
      }

      // Form inputs
      const inputs = [...document.querySelectorAll('input, select, textarea')]
        .slice(0, 10)
        .map(inp => {
          const s = window.getComputedStyle(inp);
          return {
            type: inp.type || inp.tagName.toLowerCase(),
            border: s.border,
            borderRadius: s.borderRadius,
            padding: s.padding,
            height: s.height,
            bg: s.backgroundColor,
            focusRing: s.outline,
          };
        });

      // Images
      const images = [...document.querySelectorAll('img, [class*="bg"]')]
        .slice(0, 20)
        .map(img => ({
          src: img.src || computed(img, 'backgroundImage'),
          alt: img.alt || null,
          width: img.naturalWidth || parseInt(computed(img, 'width')) || null,
          height: img.naturalHeight || parseInt(computed(img, 'height')) || null,
          objectFit: computed(img, 'objectFit') || null,
          borderRadius: computed(img, 'borderRadius'),
        }));

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        colors: [...colors].slice(0, 30),
        fonts: [...fonts].slice(0, 10),
        fontSizes: [...fontSizes].slice(0, 15),
        fontWeights: [...fontWeights].slice(0, 10),
        lineHeights: [...lineHeights].slice(0, 10),
        letterSpacings: [...letterSpacings].slice(0, 10),
        hasGrid,
        hasFlex,
        containers: containers.slice(0, 15),
        buttons,
        cards,
        nav: navData,
        hero: heroData,
        spacings: [...spacings].filter(s => s !== '0px').slice(0, 20),
        animations: [...animations].slice(0, 15),
        inputs,
        images,
        darkMode: document.documentElement.classList.contains('dark') || document.body.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches,
      };
    })()`;
  }

  buildPrompt(data) {
    const lines = [];
    lines.push('# Frontend Design Replication Prompt');
    lines.push('');
    lines.push(`## Target Website: ${data.title || 'Unknown'}`);
    lines.push(`URL: ${data.url}`);
    lines.push('');

    

    lines.push('## 1. Overview');
    lines.push(`- **Viewport**: ${data.viewport?.width || '?'} × ${data.viewport?.height || '?'}`);
    lines.push(`- **Dark Mode Support**: ${data.darkMode ? 'Yes' : 'No'}`);
    lines.push(`- **CSS Layout**: ${data.hasGrid ? 'CSS Grid + ' : ''}${data.hasFlex ? 'Flexbox' : 'Block/Inline'}`);
    lines.push('');

    

    lines.push('## 2. Color Palette');
    if (data.colors?.length) {
      lines.push('Use these exact colors:');
      data.colors.forEach(c => lines.push(`  - \`${c}\``));
    } else {
      lines.push('No distinct colors detected — use neutral palette.');
    }
    lines.push('');

    

    lines.push('## 3. Typography');
    if (data.fonts?.length) {
      lines.push(`**Fonts**: ${data.fonts.join(', ')}`);
    }
    if (data.fontSizes?.length) {
      lines.push(`**Font Sizes**: ${data.fontSizes.join(', ')}`);
    }
    if (data.fontWeights?.length) {
      lines.push(`**Font Weights**: ${data.fontWeights.join(', ')}`);
    }
    if (data.lineHeights?.length) {
      lines.push(`**Line Heights**: ${data.lineHeights.join(', ')}`);
    }
    lines.push('');

    

    lines.push('## 4. Layout & Grid');
    if (data.containers?.length) {
      data.containers.forEach(c => {
        lines.push(`- **${c.tag}${c.class ? '.' + c.class.split(' ')[0] : ''}${c.id ? '#' + c.id : ''}**:`);
        if (c.display) lines.push(`  - display: ${c.display}`);
        if (c.maxWidth && c.maxWidth !== 'none') lines.push(`  - max-width: ${c.maxWidth}`);
        if (c.margin) lines.push(`  - margin: ${c.margin}`);
        if (c.padding) lines.push(`  - padding: ${c.padding}`);
        if (c.gridTemplate) lines.push(`  - grid-template-columns: ${c.gridTemplate}`);
      });
    }
    lines.push('');

    

    if (data.nav) {
      lines.push('## 5. Navigation Bar');
      lines.push(`- **Height**: ${data.nav.height}`);
      lines.push(`- **Background**: ${data.nav.bg}`);
      lines.push(`- **Position**: ${data.nav.position}`);
      lines.push(`- **Items**: ${data.nav.items?.join(' | ')}`);
      lines.push('');
    }

    

    if (data.hero) {
      lines.push('## 6. Hero / Main Visual');
      lines.push(`- **Height**: ${data.hero.height}`);
      if (data.hero.bgImage) {
        lines.push(`- **Background Image**: ${data.hero.bgImage}`);
      } else {
        lines.push(`- **Background**: ${data.hero.bg}`);
      }
      lines.push('');
    }

    

    if (data.buttons?.length) {
      lines.push('## 7. Buttons');
      data.buttons.forEach((b, i) => {
        lines.push(`### Button ${i + 1} (${b.text || 'no text'})`);
        lines.push(`- **Tag**: ${b.tag}`);
        lines.push(`- **Background**: ${b.bg}`);
        lines.push(`- **Text Color**: ${b.color}`);
        lines.push(`- **Border**: ${b.border}`);
        lines.push(`- **Border Radius**: ${b.borderRadius}`);
        lines.push(`- **Padding**: ${b.padding}`);
        lines.push(`- **Font Size**: ${b.fontSize}`);
        lines.push(`- **Font Weight**: ${b.fontWeight}`);
        if (b.textTransform && b.textTransform !== 'none') lines.push(`- **Text Transform**: ${b.textTransform}`);
        if (b.boxShadow) lines.push(`- **Box Shadow**: ${b.boxShadow}`);
        lines.push('');
      });
    }

    

    if (data.cards?.length) {
      lines.push('## 8. Cards / Content Blocks');
      data.cards.forEach((c, i) => {
        lines.push(`### Card ${i + 1}`);
        lines.push(`- **Background**: ${c.bg}`);
        lines.push(`- **Border**: ${c.border}`);
        lines.push(`- **Border Radius**: ${c.borderRadius}`);
        lines.push(`- **Padding**: ${c.padding}`);
        if (c.boxShadow) lines.push(`- **Box Shadow**: ${c.boxShadow}`);
        lines.push('');
      });
    }

    

    if (data.inputs?.length) {
      lines.push('## 9. Form Inputs');
      data.inputs.forEach((inp, i) => {
        lines.push(`### Input ${i + 1} (${inp.type})`);
        lines.push(`- **Border**: ${inp.border}`);
        lines.push(`- **Border Radius**: ${inp.borderRadius}`);
        lines.push(`- **Padding**: ${inp.padding}`);
        lines.push(`- **Height**: ${inp.height}`);
        lines.push(`- **Background**: ${inp.bg}`);
        lines.push('');
      });
    }

    

    if (data.spacings?.length) {
      lines.push('## 10. Spacing Scale');
      lines.push('Observed spacing values: ' + data.spacings.join(', '));
      lines.push('');
    }

    

    if (data.animations?.length) {
      lines.push('## 11. Animations & Transitions');
      data.animations.forEach(a => lines.push(`- \`${a}\``));
      lines.push('');
    }

    

    if (data.images?.length) {
      lines.push('## 12. Images & Media');
      data.images.forEach((img, i) => {
        lines.push(`### Image ${i + 1}`);
        if (img.alt) lines.push(`- **Alt**: ${img.alt}`);
        if (img.width && img.height) lines.push(`- **Dimensions**: ${img.width} × ${img.height}`);
        if (img.objectFit && img.objectFit !== 'none') lines.push(`- **Object Fit**: ${img.objectFit}`);
        if (img.borderRadius && img.borderRadius !== '0px') lines.push(`- **Border Radius**: ${img.borderRadius}`);
        lines.push('');
      });
    }

    

    lines.push('## 13. Implementation Instructions');
    lines.push('');
    lines.push('### Tech Stack');
    lines.push('- Use HTML5 semantic structure (`header`, `nav`, `main`, `section`, `footer`)');
    lines.push('- Use CSS3 with ' + (data.hasGrid ? 'CSS Grid and ' : '') + (data.hasFlex ? 'Flexbox' : 'standard box model'));
    lines.push('- Use the exact colors, fonts, and spacing values listed above');
    lines.push('- Implement all hover/focus states shown in the original');
    lines.push('');
    lines.push('### Responsive Behavior');
    lines.push('- Mobile-first approach');
    lines.push('- Maintain proportions and hierarchy at all breakpoints');
    lines.push('- Navigation collapses to hamburger on mobile if applicable');
    lines.push('');
    lines.push('### Assets');
    lines.push('- Replace images with placeholders or descriptions');
    lines.push('- Maintain exact aspect ratios and object-fit behavior');
    lines.push('- Use CSS gradients if original uses them');
    lines.push('');
    lines.push('### Accessibility');
    lines.push('- Add proper `alt` text for all images');
    lines.push('- Ensure focus-visible styles match the design');
    lines.push('- Use semantic HTML and ARIA where needed');
    lines.push('');
    lines.push('---');
    lines.push('**Goal**: Create a pixel-perfect replica of the described design. Every color, spacing value, font size, and border radius must match exactly.');

    return lines.join('\n');
  }
}
