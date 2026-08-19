/* LayoutPanel.js */
import Panel from './Panel.js';

const LAYOUT_PRESETS = {
  default: {
    name: 'Default',
    desc: 'All panels docked left, collapsed',
    icon: 'fa-solid fa-bars',
    data: {
      ver: 1,
      dockSizes: { left: 320, right: 320, bottom: 200 },
      panels: {
        aboutPanel:              { collapsed: true, dock: 'left', index: 0 },
        animationPanel:          { collapsed: true, dock: 'left', index: 1 },
        patternPanel:            { collapsed: true, dock: 'left', index: 2 },
        colorsetPanel:           { collapsed: true, dock: 'left', index: 3 },
        devicePanel:             { collapsed: true, dock: 'left', index: 4 },
        modesPanel:              { collapsed: true, dock: 'left', index: 5 },
        ledSelectPanel:          { collapsed: true, dock: 'left', index: 6 },
        communityBrowserPanel:   { collapsed: true, dock: 'left', index: 7 },
        layoutPanel:             { collapsed: true, dock: 'left', index: 8 },
        updatePanel:             { collapsed: true, dock: 'left', index: 9 },
        chromalinkPanel:         { collapsed: true, dock: 'left', index: 10 },
      },
    },
  },
  editor: {
    name: 'Editor',
    desc: 'Key editing panels expanded on the left',
    icon: 'fa-solid fa-pen-ruler',
    data: {
      ver: 1,
      dockSizes: { left: 380, right: 320, bottom: 200 },
      panels: {
        aboutPanel:              { collapsed: true,  dock: 'left', index: 0 },
        modesPanel:              { collapsed: false, dock: 'left', index: 1 },
        animationPanel:          { collapsed: false, dock: 'left', index: 2 },
        patternPanel:            { collapsed: false, dock: 'left', index: 3 },
        colorsetPanel:           { collapsed: false, dock: 'left', index: 4 },
        devicePanel:             { collapsed: true,  dock: 'left', index: 5 },
        ledSelectPanel:          { collapsed: true,  dock: 'left', index: 6 },
        communityBrowserPanel:   { collapsed: true,  dock: 'left', index: 7 },
        layoutPanel:             { collapsed: true,  dock: 'left', index: 8 },
        updatePanel:             { collapsed: true,  dock: 'left', index: 9 },
        chromalinkPanel:         { collapsed: true,  dock: 'left', index: 10 },
      },
    },
  },
  spread: {
    name: 'Spread',
    desc: 'Panels distributed across left and right docks',
    icon: 'fa-solid fa-arrows-left-right',
    data: {
      ver: 1,
      dockSizes: { left: 320, right: 320, bottom: 200 },
      panels: {
        aboutPanel:              { collapsed: true,  dock: 'left',  index: 0 },
        animationPanel:          { collapsed: false, dock: 'left',  index: 1 },
        patternPanel:            { collapsed: false, dock: 'left',  index: 2 },
        colorsetPanel:           { collapsed: false, dock: 'left',  index: 3 },
        devicePanel:             { collapsed: true,  dock: 'right', index: 0 },
        modesPanel:              { collapsed: false, dock: 'right', index: 1 },
        ledSelectPanel:          { collapsed: true,  dock: 'right', index: 2 },
        communityBrowserPanel:   { collapsed: true,  dock: 'right', index: 3 },
        layoutPanel:             { collapsed: true,  dock: 'left',  index: 4 },
        updatePanel:             { collapsed: true,  dock: 'left',  index: 5 },
        chromalinkPanel:         { collapsed: true,  dock: 'left',  index: 6 },
      },
    },
  },
  minimal: {
    name: 'Minimal',
    desc: 'Only modes and device panels visible',
    icon: 'fa-solid fa-minimize',
    data: {
      ver: 1,
      dockSizes: { left: 320, right: 320, bottom: 200 },
      panels: {
        aboutPanel:              { collapsed: true,  dock: 'left', index: 0 },
        animationPanel:          { collapsed: true,  dock: 'left', index: 1 },
        patternPanel:            { collapsed: true,  dock: 'left', index: 2 },
        colorsetPanel:           { collapsed: true,  dock: 'left', index: 3 },
        devicePanel:             { collapsed: false, dock: 'left', index: 4 },
        modesPanel:              { collapsed: false, dock: 'left', index: 5 },
        ledSelectPanel:          { collapsed: true,  dock: 'left', index: 6 },
        communityBrowserPanel:   { collapsed: true,  dock: 'left', index: 7 },
        layoutPanel:             { collapsed: true,  dock: 'left', index: 8 },
        updatePanel:             { collapsed: true,  dock: 'left', index: 9 },
        chromalinkPanel:         { collapsed: true,  dock: 'left', index: 10 },
      },
    },
  },
  floating: {
    name: 'Floating',
    desc: 'All panels floating over the canvas',
    icon: 'fa-solid fa-up-right-and-down-left-from-center',
    data: {
      ver: 1,
      dockSizes: { left: 320, right: 320, bottom: 200 },
      panels: {
        aboutPanel:              { collapsed: false, floating: true, x: 40,   y: 40  },
        animationPanel:          { collapsed: false, floating: true, x: 80,   y: 80  },
        patternPanel:            { collapsed: false, floating: true, x: 120,  y: 120 },
        colorsetPanel:           { collapsed: false, floating: true, x: 160,  y: 160 },
        devicePanel:             { collapsed: true,  floating: true, x: 200,  y: 200 },
        modesPanel:              { collapsed: false, floating: true, x: 240,  y: 240 },
        ledSelectPanel:          { collapsed: true,  floating: true, x: 280,  y: 280 },
        communityBrowserPanel:   { collapsed: true,  floating: true, x: 320,  y: 320 },
        layoutPanel:             { collapsed: true,  dock: 'left',   index: 0 },
        updatePanel:             { collapsed: true,  dock: 'left',   index: 1 },
        chromalinkPanel:         { collapsed: true,  dock: 'left',   index: 2 },
      },
    },
  },
};

export default class LayoutPanel extends Panel {
  constructor(editor) {
    let presetsHtml = '';
    for (const [key, preset] of Object.entries(LAYOUT_PRESETS)) {
      presetsHtml += `
        <button class="layout-preset-btn" data-preset="${key}" title="${preset.desc}">
          <i class="${preset.icon}"></i>
          <span class="layout-preset-name">${preset.name}</span>
        </button>`;
    }

    const content = `
      <div class="layout-section">
        <div class="layout-section-title">Presets</div>
        <div class="layout-presets">
          ${presetsHtml}
        </div>
      </div>
      <div class="layout-divider"></div>
      <div class="layout-section">
        <div class="layout-section-title">Custom</div>
        <div class="layout-actions">
          <button id="layoutSaveBtn" class="layout-action-btn" title="Save current layout to a JSON file">
            <i class="fa-solid fa-download"></i>
            <span>Export</span>
          </button>
          <button id="layoutLoadBtn" class="layout-action-btn" title="Load a layout from a JSON file">
            <i class="fa-solid fa-upload"></i>
            <span>Import</span>
          </button>
          <button id="layoutResetBtn" class="layout-action-btn layout-action-danger" title="Reset to factory default layout">
            <i class="fa-solid fa-rotate-left"></i>
            <span>Reset</span>
          </button>
        </div>
      </div>
      <input type="file" id="layoutFileInput" accept=".json" style="display:none">
    `;

    super(editor, 'layoutPanel', content, 'Layout');
    this.editor = editor;
  }

  async initialize() {
    // Preset buttons
    const presetBtns = this.panel.querySelectorAll('.layout-preset-btn');
    for (const btn of presetBtns) {
      btn.addEventListener('click', () => {
        const key = btn.dataset.preset;
        this.applyPreset(key);
      });
    }

    // Export
    const saveBtn = document.getElementById('layoutSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.exportLayout());
    }

    // Import
    const loadBtn = document.getElementById('layoutLoadBtn');
    const fileInput = document.getElementById('layoutFileInput');
    if (loadBtn && fileInput) {
      loadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.importLayout(e));
    }

    // Reset
    const resetBtn = document.getElementById('layoutResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetLayout());
    }
  }

  applyPreset(key) {
    const preset = LAYOUT_PRESETS[key];
    if (!preset) return;
    const dm = this.editor.dockManager;
    if (!dm) return;

    dm._suppressSave = true;

    // Clear existing layout
    dm._clearLayoutCookie();

    // Undock and unfloat all panels
    const ids = Array.from(dm.panels.keys());
    ids.forEach(id => {
      const record = dm.panels.get(id);
      if (!record) return;
      dm.removePanel(id);
      const panelEl = record.panel.panel;
      if (id === 'welcomePanel' || id === 'colorPickerPanel') {
        if (panelEl.parentElement) panelEl.parentElement.removeChild(panelEl);
      }
      panelEl.style.position = '';
      panelEl.style.left = '';
      panelEl.style.top = '';
      panelEl.style.width = '';
      panelEl.style.zIndex = '';
      panelEl.classList.remove('floating-panel');
    });

    // Apply dock sizes
    if (preset.data.dockSizes) {
      Object.assign(dm.dockSizes, preset.data.dockSizes);
    }

    // Apply panel positions — process docked panels in index order per side,
    // then floating panels. This ensures correct ordering.
    const dockedBySide = { left: [], right: [], bottom: [] };
    const floating = [];

    for (const [id, entry] of Object.entries(preset.data.panels)) {
      if (entry.floating) {
        floating.push({ id, entry });
      } else if (entry.dock) {
        dockedBySide[entry.dock].push({ id, entry });
      }
    }

    // Sort each side by index
    for (const side of ['left', 'right', 'bottom']) {
      dockedBySide[side].sort((a, b) => a.entry.index - b.entry.index);
      for (const { id, entry } of dockedBySide[side]) {
        dm.dockPanel(id, side, entry.index);
      }
    }

    // Float panels
    for (const { id, entry } of floating) {
      dm.floatPanel(id, entry.x || 0, entry.y || 0);
    }

    // Apply collapse states
    for (const [id, entry] of Object.entries(preset.data.panels)) {
      const record = dm.panels.get(id);
      if (!record) continue;
      const content = record.panel.panel.querySelector('.panel-content');
      const isCollapsed = content?.classList.contains('collapsed') ?? false;
      if (isCollapsed !== entry.collapsed) {
        record.panel.toggleCollapse();
      }
    }

    // Re-init floating observers
    for (const fp of dm.floatingPanels) {
      const id = fp.panel.panel.id;
      dm._teardownFloatingObserver(id);
      dm._setupFloatingObserver(id, fp.panel.panel);
    }

    // Apply dock sizes to visible docks
    ['left', 'right', 'bottom'].forEach(side => {
      if (dm.dockPanelOrder[side].length > 0) {
        dm.updateDockVisibility(side);
        dm.applyDockSize(side);
      }
    });

    dm.updateCanvasLayout();
    dm._suppressSave = false;
    dm.saveLayout();

    this.highlightPreset(key);
  }

  exportLayout() {
    const dm = this.editor.dockManager;
    if (!dm) return;

    // Build layout data from current state
    const data = {
      ver: 1,
      dockSizes: { ...dm.dockSizes },
      panels: {},
    };

    dm.panels.forEach((record, id) => {
      if (id === 'welcomePanel' || id === 'colorPickerPanel') return;
      const panelEl = record.panel.panel;
      const entry = {
        collapsed: panelEl.querySelector('.panel-content')?.classList.contains('collapsed') ?? false,
      };

      if (record.floating) {
        entry.floating = true;
        entry.x = parseInt(panelEl.style.left) || 0;
        entry.y = parseInt(panelEl.style.top) || 0;
      } else if (record.dock) {
        entry.dock = record.dock;
        entry.index = dm.dockPanelOrder[record.dock].indexOf(id);
      }

      data.panels[id] = entry;
    });

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'lightshow-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  importLayout(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || !data.panels) {
          console.error('Invalid layout file');
          return;
        }
        this._applyLayoutData(data);
      } catch (err) {
        console.error('Failed to parse layout file:', err);
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be re-imported
    event.target.value = '';
  }

  resetLayout() {
    const dm = this.editor.dockManager;
    if (!dm) return;

    dm._clearLayoutCookie();
    dm._suppressSave = true;

    // Undock all
    const ids = Array.from(dm.panels.keys());
    ids.forEach(id => {
      const record = dm.panels.get(id);
      if (!record) return;
      dm.removePanel(id);
      const panelEl = record.panel.panel;
      panelEl.style.position = '';
      panelEl.style.left = '';
      panelEl.style.top = '';
      panelEl.style.width = '';
      panelEl.style.zIndex = '';
      panelEl.classList.remove('floating-panel');
    });

    // Reset dock sizes
    dm.dockSizes.left = 320;
    dm.dockSizes.right = 320;
    dm.dockSizes.bottom = 200;

    // Dock all on left, collapsed (skip floating-only panels)
    ids.forEach(id => {
      if (id === 'welcomePanel' || id === 'colorPickerPanel') {
        const record = dm.panels.get(id);
        if (!record) return;
        const panelEl = record.panel.panel;
        if (panelEl.parentElement) panelEl.parentElement.removeChild(panelEl);
        panelEl.style.position = '';
        panelEl.style.left = '';
        panelEl.style.top = '';
        panelEl.style.width = '';
        panelEl.style.zIndex = '';
        panelEl.classList.remove('floating-panel');
        return;
      }
      dm.dockPanel(id, 'left');
    });
    ids.forEach(id => {
      const record = dm.panels.get(id);
      if (record && !record.panel.isCollapsed) {
        record.panel.toggleCollapse();
      }
    });

    ['left', 'right', 'bottom'].forEach(side => {
      if (dm.dockPanelOrder[side].length > 0) {
        dm.updateDockVisibility(side);
        dm.applyDockSize(side);
      }
    });

    dm.updateCanvasLayout();
    dm._suppressSave = false;
    dm.saveLayout();

    // Clear highlight
    this.highlightPreset(null);
  }

  _applyLayoutData(data) {
    const dm = this.editor.dockManager;
    if (!dm) return;

    dm._suppressSave = true;
    dm._clearLayoutCookie();

    // Undock all
    const ids = Array.from(dm.panels.keys());
    ids.forEach(id => {
      const record = dm.panels.get(id);
      if (!record) return;
      dm.removePanel(id);
      const panelEl = record.panel.panel;
      if (id === 'welcomePanel' || id === 'colorPickerPanel') {
        if (panelEl.parentElement) panelEl.parentElement.removeChild(panelEl);
      }
      panelEl.style.position = '';
      panelEl.style.left = '';
      panelEl.style.top = '';
      panelEl.style.width = '';
      panelEl.style.zIndex = '';
      panelEl.classList.remove('floating-panel');
    });

    // Apply dock sizes
    if (data.dockSizes) {
      Object.assign(dm.dockSizes, data.dockSizes);
    }

    // Apply positions
    const dockedBySide = { left: [], right: [], bottom: [] };
    const floating = [];

    for (const [id, entry] of Object.entries(data.panels)) {
      if (entry.floating) {
        floating.push({ id, entry });
      } else if (entry.dock) {
        dockedBySide[entry.dock].push({ id, entry });
      }
    }

    for (const side of ['left', 'right', 'bottom']) {
      dockedBySide[side].sort((a, b) => a.entry.index - b.entry.index);
      for (const { id, entry } of dockedBySide[side]) {
        dm.dockPanel(id, side, entry.index);
      }
    }

    for (const { id, entry } of floating) {
      dm.floatPanel(id, entry.x || 0, entry.y || 0);
    }

    // Collapse states
    for (const [id, entry] of Object.entries(data.panels)) {
      const record = dm.panels.get(id);
      if (!record) continue;
      const content = record.panel.panel.querySelector('.panel-content');
      const isCollapsed = content?.classList.contains('collapsed') ?? false;
      if (isCollapsed !== entry.collapsed) {
        record.panel.toggleCollapse();
      }
    }

    // Re-init floating observers
    for (const fp of dm.floatingPanels) {
      const id = fp.panel.panel.id;
      dm._teardownFloatingObserver(id);
      dm._setupFloatingObserver(id, fp.panel.panel);
    }

    ['left', 'right', 'bottom'].forEach(side => {
      if (dm.dockPanelOrder[side].length > 0) {
        dm.updateDockVisibility(side);
        dm.applyDockSize(side);
      }
    });

    dm.updateCanvasLayout();
    dm._suppressSave = false;
    dm.saveLayout();
  }

  highlightPreset(key) {
    const btns = this.panel.querySelectorAll('.layout-preset-btn');
    btns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === key);
    });
  }
}
