/* WelcomePanel.js */
import Panel from './Panel.js';
import { wikiUrl } from './wiki-url.js';

const WELCOME_VERSION = 'showNewWelcome-v4';

const FEATURES = [
  { key: 'vortex-community-overhaul', html: '<strong>Vortex Community Overhaul</strong> — The entirety of Vortex Community has been overhauled and almost every UI has been rewritten or improved.' },
  { key: 'led-selection-refresh', html: '<strong>Led Select Refresh</strong> — The Led Selection Panel has been refreshed and uses new assets for the device previews' },
  { key: 'community-browser', html: '<strong>Community Browser Redesign</strong> — The Community Browser panel has been redesigned and includes Patterns and Modes now, still a work in progress.' },
  { key: 'share-mode-inline', html: '<strong>Share Modes Inline</strong> — Share modes in an overlay panel directly on lightshow.lol without leaving to another tab' },
  { key: 'vortex-community-migration', html: '<strong>Vortex Community Moved</strong> — The community website vortex.community has been moved to the new home: lightshow.lol/community' },
  { key: 'welcome-panel', html: '<strong>Improved Welcome Panel</strong> — This panel now tracks which updates you\'ve seen. Click entries to mark them as read. View it again next time to see new updates.' },
  { key: 'context-menus', html: '<strong>Right-click Context Menus</strong> — Right-click anywhere (canvas, panel, color swatch) for instant copy, paste, share, help, and more.' },
  { key: 'copy-paste', html: '<strong>Smarter Copy & Paste</strong> — Copy modes, colorsets, or patterns. Paste auto-detects whatever is on your clipboard.' },
  { key: 'wiki-help', html: '<strong>Inline Wiki Help</strong> — Right-click any panel and select <b>Help</b> to open its wiki page right inside the editor as an overlay popup. No tab-switching!' },
  { key: 'ios-support', html: '<strong>iOS Mobile Support</strong> — iOS users can now connect to devices using a WebBluetooth-enabled browser from the App Store, like Bluefy.' },
  { key: 'firefox-ui', html: '<strong>Firefox Support & UI Fixes</strong> — Numerous UI bug fixes across the editor. Firefox now supports WebSerial for device connectivity, and major Firefox-specific bugs have been resolved.' },
  { key: 'wiki-updates', html: '<strong>Wiki Updates</strong> — Several new wiki pages have been added, many existing pages have been improved and refactored, and all broken links have been cleaned up and fixed.' },
  { key: 'colorset-controls', html: '<strong>Improved Colorset Generator</strong> — Revamped randomization controls: slider + number for color count, style dropdown, and a brightness slider. Old quick-preset buttons removed in favor of a cleaner layout.' },
];

export default class WelcomePanel extends Panel {
  constructor(editor) {
    const seen = WelcomePanel.getSeen();

    let featuresHtml = '';
    for (const f of FEATURES) {
      const isSeen = seen.has(f.key);
      const badgeHtml = isSeen ? '' : '<div class="feature-badge pulse">NEW</div>';
      const seenClass = isSeen ? ' seen' : '';

      featuresHtml += `
        <div class="feature-box${seenClass}" data-key="${f.key}">
          ${badgeHtml}
          <div>${f.html}</div>
        </div>`;
    }

    const content = `
      <div class="welcome-split">
        <div class="welcome-left">
          <h1 class="welcome-title">Welcome to lightshow.lol</h1>
          <p class="intro-text">Hello! If you found this website then you're likely a flow artist or glover.</p>
          <p class="intro-text">If you have no idea what that means, then welcome to your first lightshow!</p>

          <div class="welcome-actions">
            <a href="${wikiUrl('/lightshow-lol/')}" target="_blank" class="wiki-button">
              <span>See Wiki</span>
              <span class="arrow">→</span>
            </a>
            <button class="close-welcome-btn">Close</button>
          </div>

          <div class="checkbox-container">
            <label><input type="checkbox" id="doNotShowAgain"> Do not show again until next update</label>
          </div>
        </div>
        <div class="welcome-right">
          <div class="features-container-title">News & Updates</div>
          <div class="feature-scroll">
            ${featuresHtml}
          </div>
        </div>
      </div>
    `;

    super(editor, 'welcomePanel', content, 'Welcome', { showCloseButton: true });

    this.welcomeToken = WELCOME_VERSION;
    this.editor = editor;
  }

  static getSeen() {
    try {
      const raw = localStorage.getItem('seenFeatures');
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }

  static markSeen(key) {
    const seen = WelcomePanel.getSeen();
    seen.add(key);
    localStorage.setItem('seenFeatures', JSON.stringify([...seen]));
  }

  startAutoScroll() {
    this.stopAutoScroll();
    this.scrollInterval = setInterval(() => {
      if (this.scrollEl) this.scrollEl.scrollTop += 1;
    }, 80);
  }

  stopAutoScroll() {
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
      this.scrollInterval = null;
    }
  }

  initialize() {
    const boxes = this.panel.querySelectorAll('.feature-box:not(.seen)');

    for (const box of boxes) {
      const key = box.dataset.key;

      box.addEventListener('click', () => {
        WelcomePanel.markSeen(key);
        box.classList.add('seen');

        const badge = box.querySelector('.feature-badge');
        if (badge) badge.remove();
      });
    }

    this.scrollEl = this.panel.querySelector('.feature-scroll');
    this.startAutoScroll();

    this.scrollEl.addEventListener('mouseenter', () => {
      this.stopAutoScroll();
      this.scrollEl.scrollTop = 0;
    });

    this.scrollEl.addEventListener('mouseleave', () => {
      this.startAutoScroll();
    });

    const closeBtn = this.panel.querySelector('.close-welcome-btn');
    closeBtn.addEventListener('click', () => this.hide());

    const doNotShowCheckbox = this.panel.querySelector('#doNotShowAgain');

    doNotShowCheckbox.addEventListener('change', (event) => {
      localStorage.setItem(this.welcomeToken, (!event.target.checked).toString());
    });

    const showWelcome = localStorage.getItem(this.welcomeToken) !== 'false';
    if (!showWelcome) this.hide();

    if (this.editor.detectMobile()) {
      this.panel.querySelector('.checkbox-container').style.display = 'none';
    }
  }

  show() {
    super.show();
    if (!this.editor.detectMobile()) {
      this.editor.dockManager.floatPanel(this.id, (window.innerWidth - 800) / 2, 50);
    }
  }

  applyMobileLayout() {
    const tabContainer = document.querySelector('.mobile-panel-content');
    if (!tabContainer) return;

    tabContainer.appendChild(this.panel);

    this.panel.style.border = 'none';
    this.panel.style.backgroundColor = 'transparent';

    const viewportHeight = window.innerHeight;
    const rect = tabContainer.getBoundingClientRect();
    const availableHeight = viewportHeight - rect.top;

    this.panel.style.height = `${availableHeight}px`;

    this.contentContainer.style.flex = '1';
    this.contentContainer.style.display = 'flex';
    this.contentContainer.style.flexDirection = 'column';
    this.contentContainer.style.overflowY = 'auto';

    this.show();
  }
}
