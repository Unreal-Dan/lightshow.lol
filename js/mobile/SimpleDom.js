/* js/mobile/SimpleDom.js */

export default class SimpleDom {
  constructor(root) {
    if (!root) throw new Error('SimpleDom: root is required');
    this.root = root;
  }

  /* -----------------------------
     Query helpers (scoped to root)
  ----------------------------- */
  $(sel) {
    return this.root.querySelector(sel);
  }

  all(sel) {
    return Array.from(this.root.querySelectorAll(sel));
  }

  must(sel, message) {
    const el = this.$(sel);
    if (!el) throw new Error(message || `SimpleDom: missing required element "${sel}"`);
    return el;
  }

  /* -----------------------------
     Content helpers
  ----------------------------- */
  set(frag) {
    this.root.innerHTML = '';
    this.root.appendChild(frag);
  }

  clear() {
    this.root.innerHTML = '';
  }

  /* -----------------------------
     Event helpers
  ----------------------------- */
  onClick(targetOrSelector, handler, { preventDefault = false } = {}) {
    const el = typeof targetOrSelector === 'string' ? this.$(targetOrSelector) : targetOrSelector;
    if (!el) return () => {};

    const fn = async (e) => {
      if (preventDefault) e.preventDefault();
      await handler(e);
    };

    el.addEventListener('click', fn);
    return () => el.removeEventListener('click', fn);
  }

  /* -----------------------------
     UI state helpers
  ----------------------------- */
  async busy(button, busyHtml, fn, { disable = [] } = {}) {
    if (!button) return await fn();

    const prevHtml = button.innerHTML;
    const prevDisabled = button.disabled;

    const all = [button, ...disable].filter(Boolean);
    all.forEach((b) => (b.disabled = true));
    button.innerHTML = busyHtml;

    try {
      return await fn();
    } finally {
      button.innerHTML = prevHtml;
      button.disabled = prevDisabled;
      all.forEach((b) => (b.disabled = false));
    }
  }
}

