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
    if (Notification.container && document.body.contains(Notification.container)) return;

    const el = document.createElement('div');
    el.id = 'mobile-notification-container';
    el.className = 'm-notify-container';

    // Always attach to BODY so fixed positioning works even if app root is transformed
    document.body.appendChild(el);
    Notification.container = el;

    // If env() top gets ignored, computed top becomes "auto" -> force a sane fallback
    try {
      const cs = window.getComputedStyle(el);
      if (!cs || cs.top === 'auto') {
        el.style.top = '12px';
      }
    } catch {}
  }

  static _coerceToNotifyEl(rendered) {
    if (!rendered) return null;

    // DocumentFragment
    if (rendered.nodeType === 11) {
      return rendered.querySelector?.('.m-notify') || rendered.firstElementChild || null;
    }

    // Element
    if (rendered.nodeType === 1) {
      if (rendered.classList?.contains('m-notify')) return rendered;
      return rendered.querySelector?.('.m-notify') || null;
    }

    return null;
  }

  static _fallbackEl(message, type) {
    const el = document.createElement('div');
    el.className = `m-notify ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';

    el.innerHTML = `
      <div class="m-notify-row">
        <div class="m-notify-icon" aria-hidden="true">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="m-notify-msg"></div>
      </div>
    `;

    const msgEl = el.querySelector('.m-notify-msg');
    if (msgEl) msgEl.textContent = String(message ?? '');
    return el;
  }

  static async push(message, type, duration) {
    Notification._ensureViews();
    Notification.ensureContainer();

    const iconClass = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';

    let notifyEl = null;

    try {
      const rendered = await Notification.views.render('notification.html', {
        type,
        iconClass,
        message: String(message ?? ''),
      });

      notifyEl = Notification._coerceToNotifyEl(rendered);
    } catch {}

    if (!notifyEl) {
      notifyEl = Notification._fallbackEl(message, type);
    }

    // Ensure we're appending an actual element node
    if (!notifyEl || notifyEl.nodeType !== 1) return;

    // Newest on top
    Notification.container.prepend(notifyEl);

    // Animate in on next frame (more reliable than forcing computedStyle)
    requestAnimationFrame(() => {
      try {
        notifyEl.classList.add('show');
      } catch {}
    });

    Notification.queue.unshift({ el: notifyEl, duration: Math.max(0, duration | 0) });

    if (!Notification.removalRunning) {
      Notification.runRemovalChain();
    }
  }

  static runRemovalChain() {
    if (Notification.queue.length === 0) {
      Notification.removalRunning = false;
      return;
    }

    Notification.removalRunning = true;

    const { el, duration } = Notification.queue[Notification.queue.length - 1];

    setTimeout(() => {
      try {
        el.classList.remove('show');
      } catch {}

      setTimeout(() => {
        try {
          el.remove();
        } catch {}
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

