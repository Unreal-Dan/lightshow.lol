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

  static swallow(e) {
    try {
      e?.preventDefault?.();
    } catch {}
    try {
      e?.stopPropagation?.();
    } catch {}
    try {
      e?.stopImmediatePropagation?.();
    } catch {}
  }

  static _getEl(root, targetOrSelector) {
    return typeof targetOrSelector === 'string' ? root.querySelector(targetOrSelector) : targetOrSelector;
  }

  static _tapLocked(el, lockMs) {
    if (!el || !lockMs) return false;
    const now = Date.now();
    const until = el._sdTapLockUntil || 0;
    if (now < until) return true;
    el._sdTapLockUntil = now + lockMs;
    return false;
  }

  static _bound(el, key) {
    if (!el || !key) return false;
    const prop = `_sdBound_${String(key)}`;
    if (el[prop]) return true;
    el[prop] = true;
    return false;
  }

  on(targetOrSelector, eventName, handler, options = {}) {
    const el = SimpleDom._getEl(this.root, targetOrSelector);
    if (!el) return () => {};

    const fn = async (e) => {
      await handler(e);
    };

    el.addEventListener(eventName, fn, options);
    return () => el.removeEventListener(eventName, fn, options);
  }

  onClick(targetOrSelector, handler, { preventDefault = false, swallow = false, stop = false, options = undefined } = {}) {
    const el = SimpleDom._getEl(this.root, targetOrSelector);
    if (!el) return () => {};

    const fn = async (e) => {
      if (preventDefault) {
        try {
          e?.preventDefault?.();
        } catch {}
      }
      if (swallow || stop) SimpleDom.swallow(e);
      await handler(e);
    };

    el.addEventListener('click', fn, options);
    return () => el.removeEventListener('click', fn, options);
  }

  /**
   * Pointer-friendly "tap" helper:
   * - PointerEvent path: listens to pointerup, and swallows click to avoid double-fire
   * - Fallback path: listens to click
   * - Optional tap lock (debounce) via lockMs
   * - Optional bind-once guard via boundKey (stored on element)
   *
   * Defaults are chosen to match your existing manual patterns:
   * - swallow + non-passive handler so preventDefault works
   */
  onTap(
    targetOrSelector,
    handler,
    {
      preventDefault = true,
      swallow = true,
      lockMs = 350,
      boundKey = null,
      passive = false,
      capture = false,
    } = {}
  ) {
    const el = SimpleDom._getEl(this.root, targetOrSelector);
    if (!el) return () => {};

    if (boundKey && SimpleDom._bound(el, boundKey)) return () => {};

    const fire = async (e) => {
      if (lockMs && SimpleDom._tapLocked(el, lockMs)) {
        if (swallow) SimpleDom.swallow(e);
        return;
      }

      if (preventDefault) {
        try {
          e?.preventDefault?.();
        } catch {}
      }
      if (swallow) SimpleDom.swallow(e);

      await handler(e);
    };

    const clickSwallow = (e) => {
      if (swallow) SimpleDom.swallow(e);
      else {
        if (preventDefault) {
          try {
            e?.preventDefault?.();
          } catch {}
        }
      }
    };

    const opts = { passive: !!passive, capture: !!capture };

    if (window.PointerEvent) {
      el.addEventListener('pointerup', fire, opts);
      // Swallow click to avoid "pointerup + click" double fire on some browsers.
      el.addEventListener('click', clickSwallow, { passive: false, capture: !!capture });

      return () => {
        el.removeEventListener('pointerup', fire, opts);
        el.removeEventListener('click', clickSwallow, { passive: false, capture: !!capture });
      };
    }

    el.addEventListener('click', fire, opts);
    return () => el.removeEventListener('click', fire, opts);
  }

  /* -----------------------------
     UI state helpers
  ----------------------------- */

  async busy(button, busyHtml, fn, { disable = [] } = {}) {
    if (!button) return await fn();

    const prevHtml = button.innerHTML;

    // Track per-element disabled state so we can restore correctly.
    const all = [button, ...disable].filter(Boolean);
    const prevDisabledMap = new Map();
    for (const b of all) {
      try {
        prevDisabledMap.set(b, !!b.disabled);
      } catch {
        prevDisabledMap.set(b, false);
      }
    }

    try {
      for (const b of all) {
        try {
          b.disabled = true;
        } catch {}
      }
      try {
        button.innerHTML = busyHtml;
      } catch {}

      return await fn();
    } finally {
      try {
        button.innerHTML = prevHtml;
      } catch {}

      for (const b of all) {
        const prev = prevDisabledMap.get(b);
        try {
          b.disabled = !!prev;
        } catch {}
      }
    }
  }
}

