/* js/mobile/Notification.js */

import SimpleViews from './SimpleViews.js';

export default class Notification {
  static container = null;
  static queue = [];
  static removalRunning = false;
  static views = null;

  static _ensureViews() {
    if (!Notification.views) {
      Notification.views = new SimpleViews({ basePath: 'js/mobile/views/' });
    }
  }

  static ensureContainer() {
    let el =
      document.getElementById('mobile-notification-container') ||
      document.querySelector('.m-notify-container') ||
      document.querySelector('.notification-container') ||
      null;

    if (!el) {
      el = document.createElement('div');
      document.body.prepend(el);
    }

    el.id = 'mobile-notification-container';
    el.classList.add('notification-container');
    el.classList.add('m-notify-container');

    // Ensure it's actually above the app root in DOM
    if (el.parentElement !== document.body) {
      document.body.prepend(el);
    } else if (document.body.firstElementChild !== el) {
      document.body.prepend(el);
    }

    Notification.container = el;
  }

  static _makeWrapper(type) {
    const wrap = document.createElement('div');
    wrap.className = `m-notify ${type}`;
    wrap.dataset.type = type;
    return wrap;
  }

  static _wrapRendered(rendered, type) {
    // If rendered already contains a .m-notify, use it
    try {
      if (rendered && rendered.nodeType === 11) {
        const found = rendered.querySelector?.('.m-notify');
        if (found) return found;
      }
      if (rendered && rendered.nodeType === 1) {
        if (rendered.classList?.contains('m-notify')) return rendered;
        const found = rendered.querySelector?.('.m-notify');
        if (found) return found;
      }
    } catch {}

    // Otherwise, wrap whatever was rendered inside a proper bubble
    const wrap = Notification._makeWrapper(type);

    if (!rendered) return wrap;

    // DocumentFragment: move its children into wrapper
    if (rendered.nodeType === 11) {
      while (rendered.firstChild) wrap.appendChild(rendered.firstChild);
      return wrap;
    }

    // Element: move the element inside wrapper
    if (rendered.nodeType === 1) {
      wrap.appendChild(rendered);
      return wrap;
    }

    // Text/other: ignore and return wrapper
    return wrap;
  }

  static _fallbackContent(message, type) {
    const iconClass = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';
    const body = document.createElement('div');
    body.className = 'm-notify-row';
    body.innerHTML = `
      <div class="m-notify-icon" aria-hidden="true">
        <i class="fa-solid ${iconClass}"></i>
      </div>
      <div class="m-notify-msg"></div>
    `;
    const msgEl = body.querySelector('.m-notify-msg');
    if (msgEl) msgEl.textContent = String(message ?? '');
    return body;
  }

  static async push(message, type, duration) {
    Notification._ensureViews();
    Notification.ensureContainer();

    const iconClass = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';

    let rendered = null;
    try {
      rendered = await Notification.views.render('notification.html', {
        type,
        iconClass,
        message: String(message ?? ''),
      });
    } catch {
      rendered = null;
    }

    let toast = Notification._wrapRendered(rendered, type);

    // If we ended up with an empty wrapper (template failed), inject fallback content
    try {
      const hasMsg = toast.querySelector?.('.m-notify-msg');
      if (!hasMsg) {
        toast.appendChild(Notification._fallbackContent(message, type));
      }
    } catch {
      toast.appendChild(Notification._fallbackContent(message, type));
    }

    // Newest on top
    Notification.container.prepend(toast);

    // Animate in
    requestAnimationFrame(() => {
      try { toast.classList.add('show'); } catch {}
    });

    Notification.queue.unshift({ el: toast, duration: Math.max(0, duration | 0) });

    if (!Notification.removalRunning) Notification.runRemovalChain();
  }

  static runRemovalChain() {
    if (Notification.queue.length === 0) {
      Notification.removalRunning = false;
      return;
    }

    Notification.removalRunning = true;

    const { el, duration } = Notification.queue[Notification.queue.length - 1];

    setTimeout(() => {
      try { el.classList.remove('show'); } catch {}

      setTimeout(() => {
        try { el.remove(); } catch {}
        Notification.queue.pop();
        Notification.runRemovalChain();
      }, 220);
    }, duration);
  }

  static success(message, duration = 2000) {
    void Notification.push(message, 'success', duration);
    console.log('[Notif] Success:', message);
  }

  static failure(message, duration = 2000) {
    void Notification.push(message, 'failure', duration);
    console.log('[Notif] Failure:', message);
  }
}

