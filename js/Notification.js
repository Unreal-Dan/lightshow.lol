// Notification.js

class Notification {
  static notificationContainer = null;

  // Optional: keep the stack from getting ridiculous
  static maxVisible = 3;

  // Match your CSS transition time
  static fadeMs = 220;

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

    // Normalize identity (helps if something else created it)
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

    // count only items not already scheduled for removal
    let visible = 0;
    for (const child of c.children) {
      if (!isClosing(child)) visible++;
    }

    while (visible > Notification.maxVisible) {
      // find the oldest *non-closing* (bottom)
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

  static createNotification(message, type, duration) {
    Notification.initializeContainer();

    const el = document.createElement('div');
    el.className = `notification ${type}`;

    el.innerHTML = `
      <div class="notification-row">
        <div class="notification-icon" aria-hidden="true">
          <i class="fa-solid ${Notification._iconClass(type)}"></i>
        </div>
        <div class="notification-msg"></div>
      </div>
    `;

    const msgEl = el.querySelector('.notification-msg');
    if (msgEl) msgEl.textContent = String(message ?? '');

    // Newest on top
    Notification.notificationContainer.prepend(el);

    // Animate in
    requestAnimationFrame(() => {
      try { el.classList.add('show'); } catch {}
    });

    // Enforce max
    Notification._trimToMaxVisible();

    const ms = Math.max(0, Number(duration) || 0);

    // Per-notification timer (duration always means what you think it means)
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

