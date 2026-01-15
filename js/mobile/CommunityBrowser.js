/* js/mobile/CommunityBrowser.js */

import Notification from '../Notification.js';

export default class CommunityBrowser {
  constructor(editor) {
    this.editor = editor;

    // Community browser state (kept minimal but functional)
    this._currentPage = 1;
    this._pageSize = 999;
    this._modesCache = {};
    this._totalPages = 1;
    this._activeFilters = new Set();
    this._searchQuery = '';

    this._els = {
      searchBox: null,
      filterContainer: null,
      modesContainer: null,
      pageLabel: null,
      prevBtn: null,
      nextBtn: null,
      status: null,
      refreshBtn: null,
    };
  }

  // -----------------------------
  // Wiring / UI helpers
  // -----------------------------

  _attachEls() {
    const d = this.editor.dom;
    this._els.searchBox = d.$('#m-vcb-search-box');
    this._els.filterContainer = d.$('#m-vcb-filter-container');
    this._els.modesContainer = d.$('#m-vcb-modes-container');
    this._els.pageLabel = d.$('#m-vcb-page-label');
    this._els.prevBtn = d.$('#m-vcb-prev-btn');
    this._els.nextBtn = d.$('#m-vcb-next-btn');
    this._els.status = d.$('#m-vcb-status');
    this._els.refreshBtn = d.$('#m-vcb-refresh');
  }

  _setStatus(text) {
    const el = this._els.status;
    if (!el) return;
    el.textContent = String(text || '');
  }

  _clearCache() {
    this._modesCache = {};
  }

  _buildFilterButtons() {
    const container = this._els.filterContainer;
    if (!container) return;

    container.innerHTML = '';
    this._activeFilters.clear();

    const devices = this.editor.devices || {};
    const entries = Object.entries(devices);

    for (const [deviceName, deviceData] of entries) {
      if (deviceName === 'None') continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'm-vcb-filter-btn active';
      btn.dataset.device = deviceName;
      btn.title = `Filter by ${deviceData?.label || deviceName}`;

      const img = document.createElement('img');
      img.src = deviceData?.icon || `public/images/${String(deviceName).toLowerCase()}-logo-square-64.png`;
      img.alt = deviceName;
      btn.appendChild(img);

      btn.addEventListener(
        'click',
        () => {
          if (this._activeFilters.has(deviceName)) {
            this._activeFilters.delete(deviceName);
            btn.classList.remove('active');
          } else {
            this._activeFilters.add(deviceName);
            btn.classList.add('active');
          }
          void this._applyFiltersAndRender();
        },
        { passive: true }
      );

      this._activeFilters.add(deviceName);
      container.appendChild(btn);
    }
  }

  _updatePager() {
    const label = this._els.pageLabel;
    if (label) label.textContent = `Page ${this._currentPage} / ${this._totalPages || '?'}`;

    const prevBtn = this._els.prevBtn;
    const nextBtn = this._els.nextBtn;

    if (prevBtn) prevBtn.disabled = !(this._currentPage > 1);
    if (nextBtn) nextBtn.disabled = !(this._currentPage < (this._totalPages || 1));
  }

  _renderPage(filteredModes) {
    const container = this._els.modesContainer;
    if (!container) return;

    container.innerHTML = '';

    if (!filteredModes || filteredModes.length <= 0) {
      const empty = document.createElement('div');
      empty.className = 'm-vcb-status';
      empty.textContent = 'No modes found.';
      container.appendChild(empty);
      return;
    }

    for (const mode of filteredModes) {
      const row = document.createElement('div');
      row.className = 'm-vcb-entry';
      row.dataset.device = String(mode?.deviceType || '');

      const deviceIcon = document.createElement('img');
      deviceIcon.className = 'm-vcb-device-icon';
      deviceIcon.src = `public/images/${String(mode?.deviceType || '').toLowerCase()}-logo-square-512.png`;
      deviceIcon.alt = String(mode?.deviceType || '');
      row.appendChild(deviceIcon);

      const nameDiv = document.createElement('div');
      nameDiv.className = 'm-vcb-name';
      nameDiv.textContent = mode?.name || 'Unnamed Mode';
      row.appendChild(nameDiv);

      const actions = document.createElement('div');
      actions.className = 'm-vcb-actions';

      const importBtn = document.createElement('button');
      importBtn.type = 'button';
      importBtn.className = 'm-vcb-import-btn';
      importBtn.innerHTML = '<i class="fa-solid fa-share"></i>';
      importBtn.title = 'Import';

      importBtn.addEventListener(
        'click',
        async (e) => {
          try {
            e?.preventDefault?.();
            e?.stopPropagation?.();
          } catch {}
          await this._importMode(mode);
        },
        { passive: false }
      );

      actions.appendChild(importBtn);
      row.appendChild(actions);

      container.appendChild(row);
    }
  }

  // -----------------------------
  // Data: fetch + filter
  // -----------------------------

  async _fetchPage(pageNumber) {
    const page = pageNumber | 0;
    if (page <= 0) throw new Error('invalid page');
    if (this._modesCache[page]) return this._modesCache[page];

    let response;
    const v = Date.now();

    if (this.editor.isLocalServer) {
      const suffix = page > 1 ? '2' : '';
      response = await fetch(`public/data/modeData${suffix}.json?v=${v}`);
    } else {
      response = await fetch(
        `https://vortex.community/modes/json?page=${page}&pageSize=${this._pageSize}&v=${v}`,
        { method: 'GET', credentials: 'include' }
      );
    }

    const data = await response.json();
    this._modesCache[page] = data;

    if (typeof data?.pages === 'number') this._totalPages = data.pages;

    return data;
  }

  _applyFilters(pageData) {
    if (!pageData || !Array.isArray(pageData.data)) return [];
    const q = String(this._searchQuery || '').trim().toLowerCase();

    return pageData.data.filter((mode) => {
      const dev = String(mode?.deviceType || '').trim();
      const matchesDevice = this._activeFilters.has(dev);

      const name = String(mode?.name || '').toLowerCase();
      const matchesSearch = !q || (name && name.includes(q));

      return matchesDevice && matchesSearch;
    });
  }

  async _loadPage(pageNumber) {
    this._currentPage = pageNumber | 0;
    if (this._currentPage <= 0) this._currentPage = 1;

    this._setStatus('Loading…');

    try {
      const pageData = await this._fetchPage(this._currentPage);
      const filtered = this._applyFilters(pageData);

      this._updatePager();
      this._renderPage(filtered);

      this._setStatus(
        filtered.length
          ? `${filtered.length} mode${filtered.length === 1 ? '' : 's'} on this page`
          : 'No matches on this page'
      );
    } catch (err) {
      console.error('[Mobile] Error fetching modes:', err);
      this._updatePager();
      this._setStatus('Failed to load modes.');
    }
  }

  async _applyFiltersAndRender() {
    const pageData = this._modesCache[this._currentPage];
    if (!pageData) {
      await this._loadPage(this._currentPage);
      return;
    }

    const filtered = this._applyFilters(pageData);
    this._updatePager();
    this._renderPage(filtered);

    this._setStatus(
      filtered.length
        ? `${filtered.length} mode${filtered.length === 1 ? '' : 's'} on this page`
        : 'No matches on this page'
    );
  }

  // -----------------------------
  // Import flow
  // -----------------------------

  _buildModeJsonFromCommunity(mode) {
    const patternSets = Array.isArray(mode?.patternSets) ? mode.patternSets : [];
    const ledPatternOrder = Array.isArray(mode?.ledPatternOrder) ? mode.ledPatternOrder : [];

    const patternSetMap = {};
    for (const ps of patternSets) {
      if (!ps || typeof ps !== 'object') continue;
      const id = String(ps._id || '');
      if (!id) continue;
      patternSetMap[id] = ps.data;
    }

    const ledCounts = {
      Gloves: 10,
      Orbit: 28,
      Handle: 3,
      Duo: 2,
      Chromadeck: 20,
      Spark: 6,
    };

    const dev = String(mode?.deviceType || '');
    const num_leds = ledCounts[dev] || 1;

    const single_pats = ledPatternOrder.map((orderIndex) => {
      const i = orderIndex | 0;
      const ps = patternSets[i];
      const id = ps?._id ? String(ps._id) : '';
      return id ? patternSetMap[id] : null;
    });

    return {
      num_leds,
      flags: mode?.flags ?? 0,
      single_pats,
    };
  }

  async _importMode(mode) {
    try {
      const vortex = this.editor.vortex;

      const jsonStr = String(vortex.printJson(false) || '');
      let obj;
      try {
        obj = jsonStr ? JSON.parse(jsonStr) : {};
      } catch {
        obj = {};
      }
      if (!obj || typeof obj !== 'object') obj = {};
      if (!Array.isArray(obj.modes)) obj.modes = [];

      const modeJson = this._buildModeJsonFromCommunity(mode);
      const insertIndex = obj.modes.length | 0;

      obj.modes.push(modeJson);
      obj.num_modes = obj.modes.length | 0;

      const outStr = JSON.stringify(obj);

      this.editor._clearModeTimers?.();
      this.editor._withLightshowPausedSync?.(() => {
        const ok = vortex.parseJson(outStr);
        if (!ok) throw new Error('vortex.parseJson returned false');
      });

      const afterCount = vortex.numModes() | 0;
      if (afterCount > 0) {
        const target = Math.min(insertIndex, afterCount - 1);
        vortex.setCurMode(target, false);
      }

      Notification.success?.('Imported mode');
      await this.editor.gotoEditor({ deviceType: this.editor.selectedDeviceType('Duo') });
    } catch (err) {
      console.error('[Mobile] importMode failed:', err);
      Notification.failure('Import failed');
      try {
        await this.editor.gotoEditor({ deviceType: this.editor.selectedDeviceType('Duo') });
      } catch {}
    }
  }

  // -----------------------------
  // Public entry
  // -----------------------------

  async gotoCommunityBrowser({ deviceType, backTarget = 'mode-source' } = {}) {
    const dt = deviceType || this.editor.selectedDeviceType('Duo');

    this.editor.stopEditorLightshow?.();
    this.editor.clearEditorResizeHandler?.();
    if (this.editor.effectsPanel?.isOpen?.()) this.editor.effectsPanel.close();

    const frag = await this.editor.views.render('community-browser.html', {});
    this.editor.dom.set(frag);

    this._attachEls();

    this.editor.dom.onClick('#back-btn', async () => {
      if (backTarget === 'editor') await this.editor.gotoEditor({ deviceType: dt });
      else await this.editor.gotoModeSource({ deviceType: dt });
    });

    if (this._els.searchBox) {
      this._els.searchBox.value = this._searchQuery || '';
      this._els.searchBox.addEventListener(
        'input',
        async () => {
          this._searchQuery = String(this._els.searchBox.value || '');
          await this._applyFiltersAndRender();
        },
        { passive: true }
      );
    }

    if (this._els.prevBtn) {
      this._els.prevBtn.addEventListener(
        'click',
        async () => {
          if (this._currentPage > 1) {
            this._currentPage--;
            await this._loadPage(this._currentPage);
          }
        },
        { passive: true }
      );
    }

    if (this._els.nextBtn) {
      this._els.nextBtn.addEventListener(
        'click',
        async () => {
          if (this._currentPage < (this._totalPages || 1)) {
            this._currentPage++;
            await this._loadPage(this._currentPage);
          }
        },
        { passive: true }
      );
    }

    if (this._els.refreshBtn) {
      this._els.refreshBtn.addEventListener(
        'click',
        async () => {
          this._clearCache();
          await this._loadPage(this._currentPage);
        },
        { passive: true }
      );
    }

    this._buildFilterButtons();
    await this._loadPage(this._currentPage);
  }
}

