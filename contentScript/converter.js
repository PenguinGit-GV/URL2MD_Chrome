(() => {
  if (window.__url2md_convert) return;

  function validateUri(href, baseURI) {
    try {
      new URL(href);
      return href;
    } catch (_) {
      const base = new URL(baseURI);
      if (href.startsWith('/')) return base.origin + href;
      return base.href + (base.href.endsWith('/') ? '' : '/') + href;
    }
  }

  function cleanAttribute(attr) {
    return attr ? attr.replace(/(\n+\s*)+/g, '\n') : '';
  }

  function buildArticle() {
    let baseEl = document.head && document.head.querySelector('base');
    if (!baseEl) {
      baseEl = document.createElement('base');
      if (document.head) document.head.append(baseEl);
    }
    if (!baseEl.getAttribute('href')) {
      baseEl.setAttribute('href', window.location.href);
    }

    const domString = document.documentElement.outerHTML;
    const parser = new DOMParser();
    const dom = parser.parseFromString(domString, 'text/html');

    const math = {};
    dom.body.querySelectorAll('script[id^=MathJax-Element-]').forEach((src) => {
      const m = src.id.match(/MathJax-Element-(\d+)/);
      if (!m) return;
      const id = m[1];
      const tex = src.textContent.trim().replace(/\xa0/g, ' ');
      const type = src.getAttribute('type') || '';
      math[id] = { tex, inline: type ? !type.includes('mode=display') : false };
    });

    dom.body.querySelectorAll('[class*=highlight-text],[class*=highlight-source]').forEach((codeSource) => {
      const langMatch = codeSource.className.match(/highlight-(?:text|source)-([a-z0-9]+)/);
      const lang = langMatch && langMatch[1];
      if (lang && codeSource.firstChild && codeSource.firstChild.nodeName === 'PRE') {
        codeSource.firstChild.id = `code-lang-${lang}`;
      }
    });

    const article = new Readability(dom).parse() || {};
    article.baseURI = dom.baseURI || window.location.href;
    article.pageTitle = dom.title || document.title || '';
    article.math = math;
    return article;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function isoLocal(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function buildFrontmatter(article) {
    const lines = ['---', `created: ${isoLocal(new Date())}`, `source: ${article.baseURI}`];
    if (article.byline) lines.push(`author: ${article.byline}`);
    lines.push('---', '', `# ${article.pageTitle || 'Untitled'}`, '');
    if (article.excerpt) lines.push('> ## Excerpt', `> ${article.excerpt.replace(/\n+/g, ' ')}`, '', '---', '');
    return lines.join('\n');
  }

  function toMarkdown(article) {
    const options = {
      headingStyle: 'atx',
      hr: '___',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined'
    };

    const td = new TurndownService(options);
    td.use(turndownPluginGfm.gfm);
    td.keep(['iframe', 'sub', 'sup']);

    td.addRule('images', {
      filter: (node) => node.nodeName === 'IMG' && node.getAttribute('src'),
      replacement: (content, node) => {
        const src = validateUri(node.getAttribute('src'), article.baseURI);
        const alt = cleanAttribute(node.getAttribute('alt'));
        const title = cleanAttribute(node.getAttribute('title'));
        const titlePart = title ? ` "${title}"` : '';
        return src ? `![${alt}](${src}${titlePart})` : '';
      }
    });

    td.addRule('links', {
      filter: (node) => node.nodeName === 'A' && node.getAttribute('href'),
      replacement: (content, node) => {
        const href = validateUri(node.getAttribute('href'), article.baseURI);
        return content ? `[${content}](${href})` : '';
      }
    });

    td.addRule('mathjax', {
      filter: (node) => (node.id || '').startsWith('MathJax-Element'),
      replacement: (_content, node) => {
        const m = node.id.match(/MathJax-Element-(\d+)/);
        if (!m) return '';
        const entry = article.math[m[1]];
        if (!entry) return '';
        return entry.inline ? `$${entry.tex}$` : `$$\n${entry.tex}\n$$`;
      }
    });

    td.addRule('pre', {
      filter: (node) => node.nodeName === 'PRE' && (!node.firstChild || node.firstChild.nodeName !== 'CODE'),
      replacement: (_content, node) => {
        const langMatch = node.id ? node.id.match(/code-lang-(.+)/) : null;
        const lang = langMatch ? langMatch[1] : '';
        return `\n\n${options.fence}${lang}\n${node.textContent}\n${options.fence}\n\n`;
      }
    });

    let markdown = buildFrontmatter(article) + td.turndown(article.content || '');
    var CONTROL_RE = new RegExp('[\\u0000-\\u0009\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u00ad\\u061c\\u200b-\\u200f\\u2028\\u2029\\ufeff\\ufff9-\\ufffc]', 'g');
    markdown = markdown.replace(CONTROL_RE, '');
    return markdown;
  }

  window.__url2md_convert = function () {
    try {
      const article = buildArticle();
      if (!article.content) {
        const fallback = `# ${document.title || 'Untitled'}\n\n${document.body ? document.body.innerText : ''}`;
        return { title: document.title || 'Untitled', markdown: fallback };
      }
      return {
        title: article.pageTitle || document.title || 'Untitled',
        markdown: toMarkdown(article)
      };
    } catch (err) {
      return { error: String(err && err.message || err) };
    }
  };
})();
