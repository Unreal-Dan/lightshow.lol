// mobile/Notification.js
export default class Notification {
  static container = null;
  static queue = [];            // bottom = oldest
  static removalRunning = false;
  static styleInjected = false;

  static ensureContainer() {
    if (Notification.container && document.body.contains(Notification.container)) return;

    Notification.injectStylesOnce();

    const root = document.getElementById('mobile-app-root') || document.body;

    const el = document.createElement('div');
    el.id = 'mobile-notification-container';
    el.className = 'm-notify-container';
    root.appendChild(el);

    Notification.container = el;
  }

  static injectStylesOnce() {
    if (Notification.styleInjected) return;
    Notification.styleInjected = true;

    // Keep it self-contained so you can drop this file in without touching CSS.
    const style = document.createElement('style');
    style.id = 'mobile-notification-styles';
    style.textContent = `
      #mobile-app-root .m-notify-container,
      .m-notify-container {
        position: fixed;
        left: 0;
        right: 0;
        top: env(safe-area-inset-top, 0px);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 2147483647;
        pointer-events: none;
      }

      #mobile-app-root .m-notify,
      .m-notify {
        pointer-events: auto;
        width: min(680px, calc(100vw - 24px));
        margin: 0 auto;
        border-radius: 14px;
        padding: 12px 14px;
        font-size: 15px;
        line-height: 1.25;
        letter-spacing: 0.1px;

        background: rgba(20, 20, 20, 0.92);
        color: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);

        opacity: 0;
        transform: translateY(-6px);
        transition: opacity 200ms ease, transform 200ms ease;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      #mobile-app-root .m-notify.show,
      .m-notify.show {
        opacity: 1;
        transform: translateY(0);
      }

      #mobile-app-root .m-notify.success,
      .m-notify.success {
        border-color: rgba(46, 204, 113, 0.35);
      }

      #mobile-app-root .m-notify.failure,
      .m-notify.failure {
        border-color: rgba(231, 76, 60, 0.42);
      }

      #mobile-app-root .m-notify .m-notify-row,
      .m-notify .m-notify-row {
        display: flex;
        gap: 10px;
        align-items: flex-start;
      }

      #mobile-app-root .m-notify .m-notify-icon,
      .m-notify .m-notify-icon {
        flex: 0 0 auto;
        margin-top: 1px;
        opacity: 0.95;
      }

      #mobile-app-root .m-notify .m-notify-msg,
      .m-notify .m-notify-msg {
        flex: 1 1 auto;
        word-break: break-word;
      }
    `;
    document.head.appendChild(style);
  }

  static push(message, type, duration) {
    Notification.ensureContainer();

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

    // newest on top
    Notification.container.prepend(el);

    // animate in
    window.getComputedStyle(el).opacity;
    el.classList.add('show');

    Notification.queue.unshift({ el, duration });

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

    // oldest is at end
    const { el, duration } = Notification.queue[Notification.queue.length - 1];

    setTimeout(() => {
      el.classList.remove('show');

      setTimeout(() => {
        el.remove();
        Notification.queue.pop();
        Notification.runRemovalChain();
      }, 220);
    }, duration);
  }

  static success(message, duration = 2000) {
    Notification.push(message, 'success', duration);
    console.log('[Mobile Notif] Success:', message);
  }

  static failure(message, duration = 2000) {
    Notification.push(message, 'failure', duration);
    console.log('[Mobile Notif] Failure:', message);
  }
}

