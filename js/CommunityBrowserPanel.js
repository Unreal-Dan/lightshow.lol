import Panel from './Panel.js';
import { wikiUrl } from './wiki-url.js';
import Notification from './Notification.js';

export default class CommunityBrowserPanel extends Panel {
  constructor(editor) {
    const initialHTML = `
      <div id="community-browser-container">
        <div class="vcb-tabs">
          <button class="vcb-tab active" data-tab="modes">Modes</button>
          <button class="vcb-tab" data-tab="patterns">Patterns</button>
        </div>
        <div class="vcb-tab-content" data-tab="modes">
          <input type="text" class="vcb-search-box" id="vcb-modes-search" placeholder="Search modes..." />
          <div class="vcb-filter-container" id="vcb-modes-filter"></div>
          <div class="vcb-list-container" id="vcb-modes-list"></div>
        </div>
        <div class="vcb-tab-content" data-tab="patterns" style="display:none">
          <input type="text" class="vcb-search-box" id="vcb-pats-search" placeholder="Search patterns..." />
          <div class="vcb-list-container" id="vcb-pats-list"></div>
        </div>
      </div>
    `;
    super(editor, 'communityBrowserPanel', initialHTML, 'Community Browser');
    this.editor = editor;
    this.wikiUrl = wikiUrl('/vortex-community/');
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
    this.activeTab = 'modes';

    this.modesCache = null;
    this.patsCache = null;
    this.activeFilters = new Set();

    this._setupTabs();
    this._setupModesSearch();
    this._setupPatsSearch();
  }

  get _baseUrl() {
    if (this.editor.isLocalServer) {
      return 'http://localhost:3000';
    }
    return 'https://lightshow.lol/community';
  }

  _setupTabs() {
    const tabs = this.contentContainer.querySelectorAll('.vcb-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target === this.activeTab) return;
        this.activeTab = target;
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === target));
        this.contentContainer.querySelectorAll('.vcb-tab-content').forEach(c => {
          c.style.display = c.dataset.tab === target ? '' : 'none';
        });
        this._loadTab(target);
      });
    });
  }

  _setupModesSearch() {
    const box = this.contentContainer.querySelector('#vcb-modes-search');
    box.addEventListener('input', () => this._renderModes());
  }

  _setupPatsSearch() {
    const box = this.contentContainer.querySelector('#vcb-pats-search');
    box.addEventListener('input', () => this._renderPats());
  }

  initialize() {
    const filterContainer = this.contentContainer.querySelector('#vcb-modes-filter');
    Object.entries(this.editor.devices).forEach(([deviceName, deviceData]) => {
      if (deviceName === 'None') return;
      const button = document.createElement('button');
      button.className = 'vcb-filter-btn';
      button.dataset.device = deviceName;
      button.innerHTML = `<img src="${deviceData.icon}" alt="${deviceName}" class="filter-icon" />`;
      button.title = `Filter by ${deviceData.label}`;
      button.addEventListener('click', () => {
        if (this.activeFilters.has(deviceName)) {
          this.activeFilters.delete(deviceName);
          button.classList.remove('active');
        } else {
          this.activeFilters.add(deviceName);
          button.classList.add('active');
        }
        this._renderModes();
      });
      filterContainer.appendChild(button);
    });

    this._loadTab(this.activeTab);
  }

  async _loadTab(tab) {
    if (tab === 'modes') {
      if (!this.modesCache) await this._fetchModes();
      this._renderModes();
    } else {
      if (!this.patsCache) await this._fetchPats();
      this._renderPats();
    }
  }

  async _fetchModes() {
    try {
      const res = await fetch(`${this._baseUrl}/modes/json?page=1&pageSize=999&v=${Date.now()}`, {
        credentials: 'include'
      });
      const data = await res.json();
      this.modesCache = data.data || [];
    } catch (err) {
      console.error('Failed to load modes:', err);
      this.modesCache = [];
    }
  }

  async _fetchPats() {
    try {
      const res = await fetch(`${this._baseUrl}/pats/json?page=1&pageSize=999&v=${Date.now()}`, {
        credentials: 'include'
      });
      const data = await res.json();
      this.patsCache = data.data || [];
    } catch (err) {
      console.error('Failed to load patterns:', err);
      this.patsCache = [];
    }
  }

  _renderModes() {
    const container = this.contentContainer.querySelector('#vcb-modes-list');
    const search = this.contentContainer.querySelector('#vcb-modes-search').value.trim().toLowerCase();

    let modes = this.modesCache.filter(m => {
      const matchesDevice = this.activeFilters.size === 0 || this.activeFilters.has(m.deviceType);
      const matchesSearch = !search || (m.name && m.name.toLowerCase().includes(search));
      return matchesDevice && matchesSearch;
    });

    if (modes.length === 0) {
      container.innerHTML = '<p class="vcb-empty">No modes found.</p>';
      return;
    }

    container.innerHTML = '';
    modes.forEach(mode => {
      const entry = document.createElement('div');
      entry.className = 'vcb-entry';

      const patSets = mode.patternSets || [];
      const patCount = [...new Set(mode.ledPatternOrder || [])].length;

      entry.innerHTML = `
        <div class="vcb-entry-header">
          <img src="public/images/${mode.deviceType.toLowerCase()}-logo-square-512.png" alt="${mode.deviceType}" class="vcb-entry-icon" />
          <div class="vcb-entry-info">
            <div class="vcb-entry-title">${mode.name || 'Unnamed Mode'}</div>
            <div class="vcb-entry-meta">
              <span class="vcb-entry-device">${mode.deviceType}</span>
              ${mode.creator ? `<span class="vcb-entry-creator">by ${mode.creator.username}</span>` : ''}
              ${mode.votes !== undefined ? `<span class="vcb-entry-votes">${mode.votes} votes</span>` : ''}
            </div>
            ${mode.description ? `<div class="vcb-entry-desc">${mode.description}</div>` : ''}
            <div class="vcb-entry-patterns">
              ${patSets.slice(0, 6).map(ps => {
                const data = ps.data || ps;
                const colors = data && data.colorset ? data.colorset.slice(0, 4) : [];
                return `<span class="vcb-pat-chip" title="${ps.name || ''}">${colors.map(h => `<span class="vcb-swatch" style="background:${h.replace('0x','#')}"></span>`).join('')}</span>`;
              }).join('')}
              ${patCount > 6 ? `<span class="vcb-pat-more">+${patCount - 6}</span>` : ''}
            </div>
          </div>
          <button class="vcb-import-btn" title="Import mode"><i class="fa-solid fa-share"></i></button>
        </div>
      `;

      const importBtn = entry.querySelector('.vcb-import-btn');
      importBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._importMode(mode);
      });

      container.appendChild(entry);
    });
  }

  _renderPats() {
    const container = this.contentContainer.querySelector('#vcb-pats-list');
    const search = this.contentContainer.querySelector('#vcb-pats-search').value.trim().toLowerCase();

    let pats = this.patsCache.filter(p => {
      return !search || (p.name && p.name.toLowerCase().includes(search));
    });

    if (pats.length === 0) {
      container.innerHTML = '<p class="vcb-empty">No patterns found.</p>';
      return;
    }

    container.innerHTML = '';
    pats.forEach(pat => {
      const data = pat.data || pat;
      const colors = data && data.colorset ? data.colorset : [];

      const entry = document.createElement('div');
      entry.className = 'vcb-entry';

      entry.innerHTML = `
        <div class="vcb-entry-header">
          <div class="vcb-pat-preview">
            ${colors.slice(0, 6).map(h => `<span class="vcb-swatch" style="background:${h.replace('0x','#')}"></span>`).join('')}
          </div>
          <div class="vcb-entry-info">
            <div class="vcb-entry-title">${pat.name || 'Unnamed Pattern'}</div>
            <div class="vcb-entry-meta">
              <span class="vcb-entry-id">#${pat.id}</span>
              ${pat.votes !== undefined ? `<span class="vcb-entry-votes">${pat.votes} votes</span>` : ''}
            </div>
          </div>
          <button class="vcb-import-btn" title="Import pattern"><i class="fa-solid fa-share"></i></button>
        </div>
      `;

      const importBtn = entry.querySelector('.vcb-import-btn');
      importBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._importPattern(pat);
      });

      container.appendChild(entry);
    });
  }

  _importMode(mode) {
    const patternSets = mode.patternSets;
    const ledPatternOrder = mode.ledPatternOrder;
    if (!patternSets || !ledPatternOrder) {
      Notification.failure('Cannot import — mode data is incomplete');
      return;
    }
    const patternSetMap = {};
    patternSets.forEach(ps => {
      patternSetMap[ps._id] = ps.data;
    });
    const ledCounts = {
      'Gloves': 10, 'Orbit': 28, 'Handle': 3, 'Duo': 2, 'Chromadeck': 20, 'Spark': 6
    };
    const num_leds = ledCounts[mode.deviceType] || 1;
    const single_pats = ledPatternOrder.map(orderIndex => patternSetMap[patternSets[orderIndex]._id]);
    const vortexMode = {
      flags: mode.flags,
      num_leds: num_leds,
      single_pats: single_pats
    };
    this.editor.modesPanel.importModeFromData(vortexMode, true);
  }

  _importPattern(pat) {
    const data = pat.data || pat;
    if (!data || !data.colorset || data.pattern_id === undefined) {
      Notification.failure('Pattern data is incomplete');
      return;
    }

    try {
      const vortexLib = this.editor.vortexLib;
      const vortex = this.editor.vortex;

      const set = new vortexLib.Colorset();
      data.colorset.forEach(hexCode => {
        const h = hexCode.replace('0x', '#');
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
        if (m) {
          set.addColor(new vortexLib.RGBColor(
            parseInt(m[1], 16),
            parseInt(m[2], 16),
            parseInt(m[3], 16)
          ));
        }
      });

      const patID = vortexLib.intToPatternID(data.pattern_id);
      const args = new vortexLib.PatternArgs();
      if (data.args) data.args.forEach(a => args.addArgs(a));

      const cur = vortex.engine().modes().curMode();
      const ledPanel = this.editor.ledSelectPanel;
      const targetLeds = ledPanel ? ledPanel.getSelectedLeds() : [0];

      targetLeds.forEach(led => {
        cur.setPattern(patID, led, args, set);
      });

      cur.init();
      vortex.engine().modes().saveCurMode();

      this.editor.modesPanel.refreshModeList();
      Notification.success('Pattern imported');
    } catch (err) {
      console.error('Failed to import pattern:', err);
      Notification.failure('Failed to import pattern');
    }
  }

  onActive() {
    this._loadTab(this.activeTab);
  }
}
