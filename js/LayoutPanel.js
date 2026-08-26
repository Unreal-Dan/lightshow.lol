/* LayoutPanel.js */
import Panel from './Panel.js';
import Notification from './Notification.js';

const LAYOUT_PRESETS = {
  classicFloating: {
    name: 'Classic Floating',
    desc: 'Two floating stacks — editing left, device panels right',
    icon: 'fa-solid fa-pen-ruler',
    data: {
      ver: 3,
      dockSizes: { left: 400, right: 400, bottom: 200 },
      panels: {
        devicePanel:             { collapsed: false, floating: true, edgeX: 'right', gapX: 0, y: 0 },
        updatePanel:             { collapsed: true,  floating: true },
        chromalinkPanel:         { collapsed: true,  floating: true },
        modesPanel:              { collapsed: false, floating: true },
        ledSelectPanel:          { collapsed: true,  floating: true },
        aboutPanel:              { collapsed: true,  floating: true, edgeX: 'left',  gapX: 0, y: 0 },
        layoutPanel:             { collapsed: true,  floating: true },
        animationPanel:          { collapsed: true,  floating: true },
        patternPanel:            { collapsed: false, floating: true },
        colorsetPanel:           { collapsed: false, floating: true },
        communityBrowserPanel:   { collapsed: false, floating: true },
      },
      stacks: [
        ['devicePanel', 'updatePanel', 'chromalinkPanel', 'modesPanel', 'ledSelectPanel'],
        ['aboutPanel', 'layoutPanel', 'animationPanel', 'patternPanel', 'colorsetPanel', 'communityBrowserPanel'],
      ],
    },
  },
  classicDocked: {
    name: 'Classic Docked',
    desc: 'Editing panels docked left, device panels docked right',
    icon: 'fa-solid fa-arrows-left-right',
    data: {
      ver: 1,
      dockSizes: { left: 400, right: 400, bottom: 200 },
      panels: {
        aboutPanel:              { collapsed: true,  dock: 'left',  index: 0 },
        layoutPanel:             { collapsed: true,  dock: 'left',  index: 1 },
        animationPanel:          { collapsed: true,  dock: 'left',  index: 2 },
        patternPanel:            { collapsed: false, dock: 'left',  index: 3 },
        colorsetPanel:           { collapsed: false, dock: 'left',  index: 4 },
        communityBrowserPanel:   { collapsed: false, dock: 'left',  index: 5 },
        devicePanel:             { collapsed: false, dock: 'right', index: 0 },
        updatePanel:             { collapsed: true,  dock: 'right', index: 1 },
        chromalinkPanel:         { collapsed: true,  dock: 'right', index: 2 },
        modesPanel:              { collapsed: false, dock: 'right', index: 3 },
        ledSelectPanel:          { collapsed: false, dock: 'right', index: 4 },
      },
    },
  },
  condensedDockedLeft: {
    name: 'Condensed Docked Left',
    desc: 'All panels docked left, collapsed',
    icon: 'fa-solid fa-align-left',
    data: {
      ver: 1,
      dockSizes: { left: 400, right: 400, bottom: 200 },
      panels: {
        aboutPanel:              { collapsed: true, dock: 'left', index: 0 },
        layoutPanel:             { collapsed: true, dock: 'left', index: 1 },
        animationPanel:          { collapsed: true, dock: 'left', index: 2 },
        patternPanel:            { collapsed: true, dock: 'left', index: 3 },
        colorsetPanel:           { collapsed: true, dock: 'left', index: 4 },
        modesPanel:              { collapsed: true, dock: 'left', index: 5 },
        ledSelectPanel:          { collapsed: true, dock: 'left', index: 6 },
        communityBrowserPanel:   { collapsed: true, dock: 'left', index: 7 },
        updatePanel:             { collapsed: true, dock: 'left', index: 8 },
        devicePanel:             { collapsed: true, dock: 'left', index: 9 },
        chromalinkPanel:         { collapsed: true, dock: 'left', index: 10 },
      },
    },
  },
  condensedDockedRight: {
    name: 'Condensed Docked Right',
    desc: 'All panels docked right, collapsed',
    icon: 'fa-solid fa-align-right',
    data: {
      ver: 1,
      dockSizes: { left: 400, right: 400, bottom: 200 },
      panels: {
        aboutPanel:              { collapsed: true, dock: 'right', index: 0 },
        layoutPanel:             { collapsed: true, dock: 'right', index: 1 },
        animationPanel:          { collapsed: true, dock: 'right', index: 2 },
        patternPanel:            { collapsed: true, dock: 'right', index: 3 },
        colorsetPanel:           { collapsed: true, dock: 'right', index: 4 },
        modesPanel:              { collapsed: true, dock: 'right', index: 5 },
        ledSelectPanel:          { collapsed: true, dock: 'right', index: 6 },
        communityBrowserPanel:   { collapsed: true, dock: 'right', index: 7 },
        updatePanel:             { collapsed: true, dock: 'right', index: 8 },
        devicePanel:             { collapsed: true, dock: 'right', index: 9 },
        chromalinkPanel:         { collapsed: true, dock: 'right', index: 10 },
      },
    },
  },
  condensedFloatingLeft: {
    name: 'Condensed Floating Left',
    desc: 'All panels collapsed in a single floating stack on the left',
    icon: 'fa-solid fa-align-left',
    data: {
      ver: 3,
      dockSizes: { left: 400, right: 400, bottom: 200 },
      panels: {
        aboutPanel:              { collapsed: true, floating: true, edgeX: 'left', gapX: 1, y: 0 },
        layoutPanel:             { collapsed: true, floating: true },
        animationPanel:          { collapsed: true, floating: true },
        patternPanel:            { collapsed: true, floating: true },
        colorsetPanel:           { collapsed: true, floating: true },
        communityBrowserPanel:   { collapsed: true, floating: true },
        devicePanel:             { collapsed: true, floating: true },
        updatePanel:             { collapsed: true, floating: true },
        chromalinkPanel:         { collapsed: true, floating: true },
        modesPanel:              { collapsed: true, floating: true },
        ledSelectPanel:          { collapsed: true, floating: true },
      },
      stacks: [
        ['aboutPanel', 'layoutPanel', 'animationPanel', 'patternPanel', 'colorsetPanel', 'communityBrowserPanel', 'devicePanel', 'updatePanel', 'chromalinkPanel', 'modesPanel', 'ledSelectPanel'],
      ],
    },
  },
  condensedFloatingRight: {
    name: 'Condensed Floating Right',
    desc: 'All panels collapsed in a single floating stack on the right',
    icon: 'fa-solid fa-align-right',
    data: {
      ver: 3,
      dockSizes: { left: 400, right: 400, bottom: 200 },
      panels: {
        aboutPanel:              { collapsed: true, floating: true, edgeX: 'right', gapX: 0, y: 0 },
        layoutPanel:             { collapsed: true, floating: true },
        animationPanel:          { collapsed: true, floating: true },
        patternPanel:            { collapsed: true, floating: true },
        colorsetPanel:           { collapsed: true, floating: true },
        communityBrowserPanel:   { collapsed: true, floating: true },
        devicePanel:             { collapsed: true, floating: true },
        updatePanel:             { collapsed: true, floating: true },
        chromalinkPanel:         { collapsed: true, floating: true },
        modesPanel:              { collapsed: true, floating: true },
        ledSelectPanel:          { collapsed: true, floating: true },
      },
      stacks: [
        ['aboutPanel', 'layoutPanel', 'animationPanel', 'patternPanel', 'colorsetPanel', 'communityBrowserPanel', 'devicePanel', 'updatePanel', 'chromalinkPanel', 'modesPanel', 'ledSelectPanel'],
      ],
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
        <div class="layout-section-title">Custom Layouts</div>
        <div id="customPresetList" class="custom-preset-list"></div>
        <div class="layout-actions">
          <button id="layoutSaveCurrentBtn" class="layout-action-btn" title="Save the current layout as a custom preset">
            <i class="fa-solid fa-floppy-disk"></i>
            <span>Save Current</span>
          </button>
        </div>
      </div>
      <div class="layout-divider"></div>
      <div class="layout-section">
        <div class="layout-section-title">Share</div>
        <div class="layout-actions">
          <button id="layoutSaveBtn" class="layout-action-btn" title="Export current layout to a JSON file">
            <i class="fa-solid fa-download"></i>
            <span>Export</span>
          </button>
          <button id="layoutLoadBtn" class="layout-action-btn" title="Import a layout from a JSON file">
            <i class="fa-solid fa-upload"></i>
            <span>Import</span>
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

    // Save current layout as a custom preset
    const saveCurrentBtn = document.getElementById('layoutSaveCurrentBtn');
    if (saveCurrentBtn) {
      saveCurrentBtn.addEventListener('click', () => this.saveCustomPreset());
    }

    // Custom preset list (delegated — list is re-rendered on change)
    const customList = document.getElementById('customPresetList');
    if (customList) {
      customList.addEventListener('click', (e) => {
        const applyBtn = e.target.closest('.custom-preset-apply');
        if (applyBtn) {
          this.applyCustomPreset(applyBtn.dataset.presetId);
          return;
        }
        const deleteBtn = e.target.closest('.custom-preset-delete');
        if (deleteBtn) {
          this.deleteCustomPreset(deleteBtn.dataset.presetId);
        }
      });
    }

    this.renderCustomPresets();

    // Hotkey: Ctrl+Shift+L copies current layout JSON to clipboard
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        this.copyLayoutToClipboard();
      }
    });
  }

  applyPreset(key) {
    const preset = LAYOUT_PRESETS[key];
    if (!preset) return;
    this._applyLayoutData(preset.data);
    this.highlightPreset(key);
  }

  buildLayoutData() {
    const dm = this.editor.dockManager;
    if (!dm) return null;
    return dm.getLayoutData();
  }

  async copyLayoutToClipboard() {
    const data = this.buildLayoutData();
    if (!data) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      Notification.success('Layout copied to clipboard');
    } catch (err) {
      Notification.failure('Failed to copy layout to clipboard');
    }
  }

  exportLayout() {
    const data = this.buildLayoutData();
    if (!data) return;

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

  /* ── Custom (user-saved) Layout Presets ── */

  _customPresetsKey() {
    return 'lightshow_layout_presets_v1';
  }

  _loadCustomPresets() {
    try {
      const raw = localStorage.getItem(this._customPresetsKey());
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.error('Failed to load custom layout presets:', e);
      return [];
    }
  }

  _persistCustomPresets(list) {
    try {
      localStorage.setItem(this._customPresetsKey(), JSON.stringify(list));
    } catch (e) {
      console.error('Failed to save custom layout presets:', e);
      Notification.failure('Failed to save layout preset');
    }
  }

  renderCustomPresets() {
    const list = document.getElementById('customPresetList');
    if (!list) return;

    const presets = this._loadCustomPresets();
    if (presets.length === 0) {
      list.innerHTML = '<div class="custom-presets-empty">No saved layouts yet</div>';
      return;
    }

    list.innerHTML = '';
    for (const preset of presets) {
      const row = document.createElement('div');
      row.className = 'custom-preset-row';

      const applyBtn = document.createElement('button');
      applyBtn.className = 'layout-action-btn custom-preset-apply';
      applyBtn.dataset.presetId = preset.id;
      applyBtn.title = `Apply '${preset.name}'`;
      applyBtn.innerHTML = `<i class="fa-solid fa-object-group"></i><span></span>`;
      applyBtn.querySelector('span').textContent = preset.name;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'custom-preset-delete';
      deleteBtn.dataset.presetId = preset.id;
      deleteBtn.title = `Delete '${preset.name}'`;
      deleteBtn.textContent = '×';

      row.appendChild(applyBtn);
      row.appendChild(deleteBtn);
      list.appendChild(row);
    }
  }

  saveCustomPreset() {
    const data = this.buildLayoutData();
    if (!data) return;

    const name = window.prompt('Name for this layout:', 'My Layout');
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Notification.failure('Layout name cannot be empty');
      return;
    }

    const presets = this._loadCustomPresets();
    presets.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: trimmed,
      data,
    });
    this._persistCustomPresets(presets);
    this.renderCustomPresets();
    Notification.success(`Layout '${trimmed}' saved`);
  }

  applyCustomPreset(id) {
    const preset = this._loadCustomPresets().find(p => p.id === id);
    if (!preset) return;
    this._applyLayoutData(preset.data);
    this.highlightPreset(null);
  }

  deleteCustomPreset(id) {
    const preset = this._loadCustomPresets().find(p => p.id === id);
    if (!preset) return;
    if (!window.confirm(`Delete layout '${preset.name}'?`)) return;

    this._persistCustomPresets(this._loadCustomPresets().filter(p => p.id !== id));
    this.renderCustomPresets();
    Notification.success(`Layout '${preset.name}' deleted`);
  }

  _applyLayoutData(data) {
    const dm = this.editor.dockManager;
    if (!dm || !data || !data.panels) return;

    dm._suppressSave = true;
    dm._clearLayoutCookie();
    dm.applyLayoutData(data);
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
