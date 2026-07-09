/* Panel.js */
import ContextMenu from './ContextMenu.js';
import { wikiUrl } from './wiki-url.js';

export default class Panel {
  static panels = [];
  static selectedPanel = null;

  constructor(editor, id, content, title = 'Panel', options = {}) {
    this.panel = document.createElement('div');
    this.panel.id = id;
    this.id = id;
    this.panel.className = 'draggable-panel';
    this.panel.title = title;
    this.panel.editor = editor;
    this.editor = editor;
    this.wikiUrl = wikiUrl('/lightshow-lol/');

    const { showCloseButton = false } = options;

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `<span class="panel-title">${title}</span>`;

    if (showCloseButton) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'close-btn';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
      });
      header.appendChild(closeBtn);
    } else {
      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'collapse-btn';
      collapseBtn.textContent = '▼';
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCollapse();
      });
      header.appendChild(collapseBtn);
    }

    // Create content container
    this.contentContainer = document.createElement('div');
    this.contentContainer.className = 'panel-content';
    this.contentContainer.innerHTML = content;

    // Append header and content to the panel
    this.panel.appendChild(header);
    this.panel.appendChild(this.contentContainer);

    this.isCollapsed = false;
    this.isVisible = true;

    this.panel.addEventListener('contextmenu', (e) => {
      const items = this.getContextMenuItems();
      if (items.length > 0) {
        e.preventDefault();
        const menu = ContextMenu.getInstance();
        menu.show(e.clientX, e.clientY, items);
      }
    });

    this.initGlobalListeners();

    // all panels subscribe to this event
    document.addEventListener('deviceChange', async (event) => {
      await this.handleDeviceEvent(event);
    });

    Panel.panels.push(this);
  }

  initGlobalListeners() {
    if (Panel.globalListenersInitialized) {
      return;
    }
    Panel.globalListenersInitialized = true;
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.key === 'c') {
        event.preventDefault();
        this.showCopyContextMenu(event);
      }
    });
    document.addEventListener('paste', (event) => {
      const text = event.clipboardData.getData('text/plain');
      if (!text) return;
      event.preventDefault();
      let handled = false;
      if (Panel.selectedPanel && Panel.selectedPanel.canPaste()) {
        Panel.selectedPanel.pasteText(text);
        handled = true;
      }
      if (!handled) {
        for (const panel of Panel.panels) {
          if (typeof panel.pasteText === 'function') {
            panel.pasteText(text);
            break;
          }
        }
      }
    });
  }

  showCopyContextMenu(event) {
    const menu = ContextMenu.getInstance();
    const items = [];

    for (const panel of Panel.panels) {
      if (typeof panel.getCopyOptions === 'function') {
        const panelOptions = panel.getCopyOptions();
        if (panelOptions.length > 0) {
          if (items.length > 0) {
            items.push({ separator: true });
          }
          items.push(...panelOptions);
        }
      }
    }

    if (items.length > 0) {
      let x = event.clientX || ContextMenu.lastMouseX;
      let y = event.clientY || ContextMenu.lastMouseY;
      menu.show(x, y, items);
    }
  }

  setSelected() {
    if (Panel.selectedPanel !== this) {
      Panel.selectedPanel = this;
    }
  }

  canCopy() {
    return false;
  }

  canPaste() {
    return false;
  }

  copy() {
    console.warn("Copy not implemented for this panel.");
  }

  getCopyOptions() {
    return [];
  }

  getContextMenuItems() {
    return [{
      label: 'Help',
      action: () => this.editor && this.editor.showHelpPopup(this.wikiUrl)
    }];
  }

  paste() {
    console.warn("Paste not implemented for this panel.");
  }

  async handleDeviceEvent(deviceChangeEvent) {
    const { deviceEvent, deviceName, deviceVersion } = deviceChangeEvent.detail;
    if (deviceEvent === 'waiting') {
      await this.onDeviceWaiting(deviceName);
    } else if (deviceEvent === 'connect') {
      await this.onDeviceConnect(deviceName, deviceVersion);
    } else if (deviceEvent === 'disconnect') {
      await this.onDeviceDisconnect(deviceName);
    } else if (deviceEvent === 'select') {
      await this.onDeviceSelected(deviceName);
    }
  }

  async onDeviceWaiting(deviceName) {}
  async onDeviceConnect(deviceName) {}
  async onDeviceDisconnect(deviceName) {}
  async onDeviceSelected(devicename) {}

  appendTo(parent) {
    parent.appendChild(this.panel);
  }

  show() {
    const tabContainer = document.querySelector('.mobile-panel-content');

    if (!this.isVisible) {
      this.isVisible = true;

      if (tabContainer) {
        const activePanels = tabContainer.querySelectorAll('.active');
        activePanels.forEach(activePanel => activePanel.classList.remove('active'));

        this.panel.style.display = '';
        this.panel.style.opacity = '1';
        this.panel.style.pointerEvents = 'auto';
      } else {
        this.panel.style.display = '';
      }
    }

    if (this.isCollapsed && !tabContainer) {
      this.toggleCollapse();
    }
  }

  hide() {
    if (this.isVisible) {
      this.isVisible = false;

      if (!document.querySelector('.mobile-panel-container')) {
        this.panel.style.display = 'none';
      } else {
        this.panel.style.opacity = '0';
        this.panel.style.pointerEvents = 'none';
        this.isVisible = false;
      }
    }
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    this.contentContainer.classList.toggle('collapsed', this.isCollapsed);
    const btn = this.panel.querySelector('.collapse-btn');
    if (btn) {
      btn.classList.toggle('collapsed', this.isCollapsed);
    }
  }

  updateLayout(isMobile) {
    if (isMobile) {
      this.applyMobileLayout();
    } else {
      this.applyDesktopLayout();
    }
  }

  setActiveForMobile(isActive) {
    if (isActive) {
      this.show();
    } else {
      this.hide();
    }
  }

  applyMobileLayout() {
    const tabContainer = document.querySelector('.mobile-panel-content');
    if (tabContainer) {
      tabContainer.appendChild(this.panel);
    }

    this.panel.style.border = 'none';
    this.panel.style.backgroundColor = 'transparent';
    this.show();
  }

  applyDesktopLayout() {
    // Dock manager handles panel placement on desktop
    this.panel.style.display = '';
  }

  addClickListener(buttonId, callback) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.addEventListener('click', callback.bind(this));
    } else {
      console.error(`Button with ID ${buttonId} not found.`);
    }
  }

  removeClickListener(buttonId, callback) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.removeEventListener('click', callback.bind(this));
    } else {
      console.error(`Button with ID ${buttonId} not found for removal.`);
    }
  }

  onActive() {}
  onInactive() {}

  canOpen() {
    return true;
  }
}
