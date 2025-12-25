// mobile/SimpleViews.js
export default class SimpleViews {
  constructor({ basePath = '/mobile/views/' } = {}) {
    this.basePath = basePath;
    this.cache = new Map();
  }

  async load(viewName) {
    const key = `${this.basePath}${viewName}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const res = await fetch(key, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`SimpleViews: failed to load "${key}" (${res.status})`);
    }

    const text = await res.text();
    this.cache.set(key, text);
    return text;
  }

  /**
   * Renders a view into a DocumentFragment.
   * - {{key}} is HTML-escaped
   * - {{{key}}} is unescaped (only use for trusted content)
   */
  async render(viewName, data = {}) {
    const template = await this.load(viewName);

    // First replace raw HTML tokens {{{key}}}
    let html = template.replace(/\{\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}\}/g, (_, k) => {
      const v = this.get(data, k);
      return v == null ? '' : String(v);
    });

    // Then replace escaped tokens {{key}}
    html = html.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, k) => {
      const v = this.get(data, k);
      return this.escape(v == null ? '' : String(v));
    });

    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    return tpl.content;
  }

  // dot-path getter: "user.name"
  get(obj, path) {
    if (!path) return undefined;
    return path.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj);
  }

  escape(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}

