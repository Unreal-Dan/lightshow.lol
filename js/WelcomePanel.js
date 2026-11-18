/* WelcomePanel.js */
import Panel from './Panel.js';
import { wikiUrl } from './wiki-url.js';

// FNV-1a 32-bit checksum of the whole feature list. Because the welcome
// "seen" token is derived from the list contents itself, any change to the
// list (add / edit / reorder a feature) produces a new token, so returning
// users see the welcome panel again without anyone manually bumping a version.
function featuresChecksum(features) {
  const str = features.map((f) => `${f.key}|${f.html}`).join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

// new entries go at the top so they appear first in the scroll
const FEATURES = [
  { key: 'spark-modes-backup', html: '<strong>Spark Modes Backup</strong> — The firmware updates for the Spark will now offer to backup and restore your list of modes.' },
  { key: 'copy-all-modes', html: '<strong>Copy All Modes</strong> — New context menu option on modes list to copy all modes to the clipboard. Pasting will fit as many as possible without erasing existing ones.' },
  { key: 'chromadeck-profiles-update', html: '<strong>Chromadeck Profiles & Update Fixes</strong> — New profile selector in Chromadeck Device Controls. Chromadeck firmware updates can now back up and restore all modes.' },
  { key: 'undo-redo', html: '<strong>Undo & Redo</strong> — Added full undo/redo support across the editor. <b>Ctrl+Z</b> to undo, <b>Ctrl+Y</b> or <b>Ctrl+Shift+Z</b> to redo. Also available from the canvas right-click menu.' },
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

// storage token tied to the exact contents of the feature list above
const WELCOME_VERSION = 'showNewWelcome-' + featuresChecksum(FEATURES);

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

    const isMobile = editor.detectMobile();
    const action = (key, icon, title, desc, tag = 'button', extra = '') => `
      <${tag} class="welcome-action" data-action="${key}" ${extra}>
        <span class="welcome-action-icon"><i class="${icon}"></i></span>
        <span class="welcome-action-text">
          <span class="welcome-action-title">${title}</span>
          <span class="welcome-action-desc">${desc}</span>
        </span>
        <i class="fa-solid fa-chevron-right welcome-action-chevron"></i>
      </${tag}>`;

    const content = `
      <div class="welcome-split">
        <div class="welcome-left">
          <div class="welcome-intro">
            <h1 class="welcome-title">Welcome to lightshow.lol</h1>
            <div class="welcome-leds" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
            <p class="intro-text">Design light modes for Vortex gloves and devices, preview them live, then send them straight to your device.</p>
          </div>

          <div class="welcome-start">
            <div class="welcome-section-title">Get started</div>
            ${action('connect', isMobile ? 'fa-brands fa-bluetooth-b' : 'fa-brands fa-usb', 'Connect a device',
              isMobile ? 'Pair over Bluetooth to edit its modes' : 'Plug in over USB to edit its modes')}
            ${action('community', 'fa-solid fa-globe', 'Browse community modes', 'Try modes and patterns other people have shared')}
            ${isMobile ? '' : action('layout', 'fa-solid fa-table-columns', 'Choose a panel layout', 'Float, dock or stack the editor panels')}
            ${action('wiki', 'fa-solid fa-book-open', 'Read the guide', 'New here? Start with the getting-started wiki',
              'a', `href="${wikiUrl(isMobile ? '/lightshow-lol/getting-started-mobile.html' : '/lightshow-lol/getting-started.html')}" target="_blank" rel="noopener"`)}
          </div>

          <div class="welcome-unread">
            <span class="welcome-unread-dot"></span>
            <span class="welcome-unread-text"></span>
            <button class="welcome-mark-read">Mark all read</button>
          </div>

          <div class="welcome-footer">
            <button class="close-welcome-btn">Start creating</button>
            <label class="checkbox-container">
              <input type="checkbox" id="doNotShowAgain">
              <span>Don't show again until the next update</span>
            </label>
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

  markBoxSeen(box) {
    WelcomePanel.markSeen(box.dataset.key);
    box.classList.add('seen');
    const badge = box.querySelector('.feature-badge');
    if (badge) badge.remove();
  }

  updateUnread() {
    const unread = this.panel.querySelectorAll('.feature-box:not(.seen)').length;
    const row = this.panel.querySelector('.welcome-unread');
    const text = row.querySelector('.welcome-unread-text');
    row.classList.toggle('caught-up', unread === 0);
    text.textContent = unread === 0
      ? "You're all caught up"
      : `${unread} new update${unread === 1 ? '' : 's'}`;
  }

  /**
   * Close the welcome panel and bring another panel into view: expand it,
   * raise it if floating (or switch to its tab on mobile) and briefly
   * highlight it so the user can see where it is.
   */
  revealPanel(panel) {
    if (!panel) return;
    this.hide();
    if (this.editor.detectMobile()) {
      this.editor.setActiveTab(panel.panel.id);
      return;
    }
    if (panel.isCollapsed) panel.toggleCollapse();
    const dm = this.editor.dockManager;
    if (dm.panels.get(panel.panel.id)?.floating) {
      dm._bringFloatingToFront(panel.panel);
    } else {
      panel.panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    panel.panel.classList.remove('panel-attention');
    void panel.panel.offsetWidth; // restart the animation if re-triggered
    panel.panel.classList.add('panel-attention');
    setTimeout(() => panel.panel.classList.remove('panel-attention'), 1600);
  }

  initialize() {
    for (const box of this.panel.querySelectorAll('.feature-box:not(.seen)')) {
      box.addEventListener('click', () => {
        if (box.classList.contains('seen')) return;
        this.markBoxSeen(box);
        this.updateUnread();
      });
    }

    this.panel.querySelector('.welcome-mark-read').addEventListener('click', () => {
      for (const box of this.panel.querySelectorAll('.feature-box:not(.seen)')) this.markBoxSeen(box);
      this.updateUnread();
    });
    this.updateUnread();

    // Quick-start actions (the wiki entry is a plain link)
    this.panel.querySelector('[data-action="connect"]').addEventListener('click', () => {
      this.hide();
      this.editor.devicePanel.connectDevice();
    });
    this.panel.querySelector('[data-action="community"]').addEventListener('click', () => {
      this.revealPanel(this.editor.communityBrowserPanel);
    });
    this.panel.querySelector('[data-action="layout"]')?.addEventListener('click', () => {
      this.revealPanel(this.editor.layoutPanel);
    });

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

    const stored = localStorage.getItem(this.welcomeToken);
    if (stored !== null) {
      doNotShowCheckbox.checked = stored === 'false';
    }

    doNotShowCheckbox.addEventListener('change', (event) => {
      localStorage.setItem(this.welcomeToken, (!event.target.checked).toString());
    });

    const showWelcome = localStorage.getItem(this.welcomeToken) !== 'false';
    if (showWelcome && !this.editor.detectMobile()) {
      this.show();
    } else if (!showWelcome) {
      this.hide();
    }

    if (this.editor.detectMobile()) {
      this.panel.querySelector('.checkbox-container').style.display = 'none';
    }
  }

  show() {
    super.show();
    if (!this.editor.detectMobile()) {
      this.editor.dockManager.floatPanel(this.id, Math.max(10, (window.innerWidth - 1050) / 2), 20);
      this.panel.style.width = '';
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
