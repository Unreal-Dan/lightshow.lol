// Notification.js
// View template reference: js/views/notification.html

import SimpleViews from './SimpleViews.js';

class Notification {
  static notificationContainer = null;
  static maxVisible = 3;
  static fadeMs = 220;
  static _template = null;
  static _initPromise = null;

  static async init() {
    if (Notification._initPromise) return Notification._initPromise;
    Notification._initPromise = (async () => {
      const views = new SimpleViews({ basePath: 'js/views/' });
      Notification._template = await views.load('notification.html');
    })();
    return Notification._initPromise;
  }

  static initializeContainer() {
    let el =
      document.querySelector('.notification-container') ||
      document.getElementById('notification-container') ||
      null;

    if (!el) {
      el = document.createElement('div');
      el.className = 'notification-container';
      document.body.appendChild(el);
    }

    el.id = 'notification-container';
    el.classList.add('notification-container');

    Notification.notificationContainer = el;
  }

  static _iconClass(type) {
    return type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';
  }

  static _trimToMaxVisible() {
    const c = Notification.notificationContainer;
    if (!c) return;

    const isClosing = (el) => el && el.dataset && el.dataset.closing === '1';

    let visible = 0;
    for (const child of c.children) {
      if (!isClosing(child)) visible++;
    }

    while (visible > Notification.maxVisible) {
      const kids = Array.from(c.children);
      const last = kids.reverse().find((el) => !isClosing(el));
      if (!last) break;

      last.dataset.closing = '1';
      visible--;

      try { last.classList.remove('show'); } catch {}
      setTimeout(() => {
        try { last.remove(); } catch {}
      }, Notification.fadeMs);
    }
  }

  static _renderRow(type) {
    if (Notification._template) {
      return Notification._template
        .replace(/\{\{iconClass\}\}/g, Notification._iconClass(type))
        .replace(/\{\{message\}\}/g, '');
    }
    return `
      <div class="notification-row">
        <div class="notification-icon" aria-hidden="true">
          <i class="fa-solid ${Notification._iconClass(type)}"></i>
        </div>
        <div class="notification-msg"></div>
      </div>
    `;
  }

  static createNotification(message, type, duration) {
    Notification.initializeContainer();

    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.innerHTML = Notification._renderRow(type);

    const msgEl = el.querySelector('.notification-msg');
    if (msgEl) msgEl.textContent = String(message ?? '');

    Notification.notificationContainer.prepend(el);

    requestAnimationFrame(() => {
      try { el.classList.add('show'); } catch {}
    });

    Notification._trimToMaxVisible();

    const ms = Math.max(0, Number(duration) || 0);

    setTimeout(() => {
      try { el.dataset.closing = '1'; } catch {}
      try { el.classList.remove('show'); } catch {}
      setTimeout(() => { try { el.remove(); } catch {} }, Notification.fadeMs);
    }, ms);
  }

  static success(message, duration = 2000) {
    Notification.createNotification(message, 'success', duration);
    console.log('[Notif] Success:', message);
  }

  static failure(message, duration = 2000) {
    Notification.createNotification(message, 'failure', duration);
    console.log('[Notif] Failure:', message);
  }
}

export default Notification;
