/* VortexEditorMobile.js */

import VortexLib from '../VortexLib.js';
import Lightshow from '../Lightshow.js';
import VortexPort from '../VortexPort.js';
import Notification from '../Notification.js';

import SimpleViews from './SimpleViews.js';
import SimpleDom from './SimpleDom.js';
import ColorPicker from './ColorPicker.js';

const ASSETS = {
  styles: [
    { id: 'fa-css', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css' },
    { id: 'bootstrap-css', href: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css' },
    { id: 'mobile-styles-css', href: 'css/mobile/mobile-styles.css' },
  ],
  scripts: [
    { id: 'bootstrap-js', src: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js' }
  ],
  data: {
    devices: 'js/devices.json',
  },
};

const DEVICE_CARDS = [
  { id: 'Duo', label: 'Duo', img: 'public/images/duo-logo-square-512.png' },
  { id: 'Spark', label: 'Spark', img: 'public/images/spark-logo-square-512.png' },
  { id: 'Chromadeck', label: 'Chromadeck', img: 'public/images/chromadeck-logo-square-512.png' },
];

export default class VortexEditorMobile {
  constructor(vortexLib) {
    this.vortexLib = vortexLib;

    this.vortex = new this.vortexLib.Vortex();
    this.vortex.init();

    this.vortexPort = new VortexPort(this, true);

    this.deviceType = null;
    this.devices = null;

    this.root = null;
    this.dom = null;

    this.lightshow = null;
    this._editorResizeHandler = null;

    this.views = new SimpleViews({ basePath: 'js/mobile/views/' });

    this.effectsPanel = new ColorPicker({
      vortexLib: this.vortexLib,
      views: this.views,
      basePath: 'js/mobile/views/',
    });

    this._fxLed = 0;
    this._fxSelectedColor = null;

    this._fxFinalizeTimer = null;
    this._fxDemoTimer = null;

    this._modeFinalizeTimer = null;
    this._modeDemoTimer = null;

    // Transfer modal lifecycle
    this._transferModalEl = null;
    this._transferModalLoaded = false;

    // Settings modal lifecycle
    this._settingsModalEl = null;
    this._settingsModalLoaded = false;

    // Duo send loop
    this._duoTxLoopActive = false;
    this._duoTxLoopTimer = null;

    // Mode swipe state
    this._modeSwipe = {
      active: false,
      pointerId: -1,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      lockedAxis: null,
    };

    // Local server heuristic (desktop uses editor.isLocalServer)
    this.isLocalServer =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      location.hostname.endsWith('.local');

    // Community browser (desktop parity)
    this._vcbCurrentPage = 1;
    this._vcbPageSize = 999;
    this._vcbModesCache = {};
    this._vcbTotalPages = 1;
    this._vcbActiveFilters = new Set();
    this._vcbSearchQuery = '';

    this._vcbEls = {
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

  detectMobile() { return true; }
  isBLESupported() { return true; }

  isVersionGreaterOrEqual(currentVersion, targetVersion = '1.3.0') {
    const currentParts = currentVersion.split('.').map(Number);
    const targetParts = targetVersion.split('.').map(Number);
    for (let i = 0; i < targetParts.length; i++) {
      if ((currentParts[i] ?? 0) > (targetParts[i] ?? 0)) return true;
      if ((currentParts[i] ?? 0) < (targetParts[i] ?? 0)) return false;
    }
    return true;
  }

  async initialize() {
    console.log('[VortexEditorMobile] initialize');
    document.body.innerHTML = '';
    await this.loadAssets();

    this.root = document.createElement('div');
    this.root.id = 'mobile-app-root';
    document.body.appendChild(this.root);

    this.dom = new SimpleDom(this.root);

    const devicesUrl = ASSETS.data.devices;
    const res = await fetch(devicesUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load devices JSON (${res.status} ${res.statusText}): ${devicesUrl}`);
    this.devices = await res.json();

    this.effectsPanel.mount(document.body);
    await this.gotoDeviceSelect();
  }

  setDeviceType(type) {
    this.deviceType = type;
  }

  async loadAssets() {
    for (const s of ASSETS.styles) this.loadStylesheet(s.id, s.href);
    for (const s of ASSETS.scripts) await this.loadScript(s.id, s.src);
  }

  loadStylesheet(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  loadScript(id, src) {
    return new Promise((resolve, reject) => {
      if (document.getElementById(id)) return resolve();
      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  stopEditorLightshow(destroy = true) {
    if (!this.lightshow) return;
    try { this.lightshow.stop(); } catch {}
    if (destroy) {
      this.lightshow = null;
    }
  }

  clearEditorResizeHandler() {
    if (!this._editorResizeHandler) return;
    window.removeEventListener('resize', this._editorResizeHandler);
    this._editorResizeHandler = null;
  }

  _clearModeTimers() {
    if (this._modeFinalizeTimer) {
      clearTimeout(this._modeFinalizeTimer);
      this._modeFinalizeTimer = null;
    }
    if (this._modeDemoTimer) {
      clearTimeout(this._modeDemoTimer);
      this._modeDemoTimer = null;
    }
  }

  _scheduleModeFinalize(ms = 120) {
    this._clearModeTimers();
    this._modeFinalizeTimer = setTimeout(() => {
      this._modeFinalizeTimer = null;
      try {
        // pure bound API
        this._getModes().initCurMode();
        this._getModes().saveCurMode();
      } catch {}
    }, ms);
  }

  _scheduleModeDemo(ms = 140) {
    if (this._modeDemoTimer) {
      clearTimeout(this._modeDemoTimer);
      this._modeDemoTimer = null;
    }
    this._modeDemoTimer = setTimeout(() => {
      this._modeDemoTimer = null;
      try { this.demoModeOnDevice(); } catch {}
    }, ms);
  }

  _withLightshowPausedSync(fn) {
    const ls = this.lightshow;

    // Pause only (do NOT destroy, do NOT unbind resize)
    if (ls) {
      try { ls.stop(); } catch {}
    }

    try {
      return fn();
    } finally {
      if (ls) {
        // Resume on the same instance/canvas (fast)
        try { ls.start(); } catch {}
      }
    }
  }

  async _restartLightshowAndDemo(dt) {
    // Fast path: if it exists, just ensure it’s running.
    if (this.lightshow) {
      try { this.lightshow.start(); } catch {}
    } else {
      // Only recreate if it was actually destroyed (screen change, etc)
      try {
        await this.startEditorLightshow(dt);
      } catch (e) {
        console.error('[Mobile] startEditorLightshow failed after mutation:', e);
        try { await this.gotoEditor({ deviceType: dt }); } catch {}
        return;
      }
    }

    // Fire-and-forget demo so UI updates are instant.
    try {
      setTimeout(() => { try { void this.demoModeOnDevice(); } catch {} }, 0);
    } catch {}
  }

  getBleConnectCopy(deviceType) {
    if (deviceType === 'Duo' || deviceType === 'Chromadeck') {
      return {
        deviceImg: 'public/images/chromadeck-logo-square-512.png',
        deviceAlt: 'Chromadeck',
        instructions: 'Unplug the Chromadeck and switch it off and back on, then tap Connect below.',
      };
    }
    return {
      deviceImg: 'public/images/spark-logo-square-512.png',
      deviceAlt: 'Spark',
      instructions: 'Unplug the Spark and open the Bluetooth menu, then tap Connect below.',
    };
  }

  loadActionLabel(deviceType) {
    if (deviceType === 'Duo') return `<i class="fa-solid fa-satellite-dish"></i> Load from Duo`;
    return `<i class="fa-solid fa-download"></i> Load from device`;
  }

  selectedDeviceType(fallback = 'Duo') { return this.deviceType || fallback; }

  updateDeviceSelectUI() {
    const selected = this.deviceType;
    this.dom.all('[data-device]').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.device === selected);
    });
  }

  _getDeviceImgFor(dt) {
    const d = this.devices?.[dt];
    return (
      d?.image ||
      d?.iconBig ||
      d?.icon ||
      `public/images/${String(dt || '').toLowerCase()}-logo-square-512.png`
    );
  }

  _devXferUi() {
    return {
      statusWrap: this.dom.$('#dev-xfer-status'),
      statusText: this.dom.$('#dev-xfer-status-text'),
      progressText: this.dom.$('#dev-xfer-progress-text'),
      bar: this.dom.$('#dev-xfer-progress-bar'),
      backBtn: this.dom.$('#back-btn'),
      doneBtn: this.dom.$('#done-btn'),
    };
  }

  _setDevXferUI({ status = null, progressText = null, percent = null, error = false, animate = true } = {}) {
    const ui = this._devXferUi();

    if (ui.statusWrap) ui.statusWrap.classList.toggle('is-error', !!error);

    if (ui.statusText && status != null) ui.statusText.textContent = String(status);
    if (ui.progressText && progressText != null) ui.progressText.textContent = String(progressText);

    if (ui.bar) {
      const p = percent == null ? null : Math.max(0, Math.min(100, Number(percent)));
      if (p != null && Number.isFinite(p)) {
        ui.bar.style.width = `${p}%`;
        ui.bar.setAttribute('aria-valuenow', String(p | 0));
      }

      ui.bar.classList.toggle('progress-bar-animated', !!animate);
      ui.bar.classList.toggle('progress-bar-striped', true);
    }
  }

  _makeThrottled(fn, ms = 60) {
    let t = 0;
    let pending = null;

    return (...args) => {
      pending = args;
      const now = Date.now();
      if (now - t < ms) return;

      t = now;
      const a = pending;
      pending = null;

      try { fn(...a); } catch {}
    };
  }

  async gotoDevicePullModes({ deviceType, backTarget = 'mode-source' } = {}) {
    const dt = deviceType || this.selectedDeviceType('Duo');

    this.stopEditorLightshow();
    this.clearEditorResizeHandler();
    if (this.effectsPanel.isOpen()) this.effectsPanel.close();

    const deviceImg = this._getDeviceImgFor(dt);
    const deviceAlt = dt;

    const frag = await this.views.render('device-modes-receive.html', {
      title: 'Load from device',
      subtitle: dt,
      deviceImg,
      deviceAlt,
      status: 'Starting…',
      progressText: '',
    });

    this.dom.set(frag);

    const ui = this._devXferUi();
    const backNav = async () => {
      if (backTarget === 'editor' || backTarget === 'editor-empty') {
        await this.gotoEditor({ deviceType: dt });
      } else {
        await this.gotoModeSource({ deviceType: dt });
      }
    };

    if (ui.backBtn) {
      ui.backBtn.disabled = true;
      ui.backBtn.addEventListener('click', async (e) => {
        try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch {}
        if (ui.backBtn.disabled) return;
        await backNav();
      }, { passive: false });
    }

    if (ui.doneBtn) {
      ui.doneBtn.disabled = true;
      ui.doneBtn.addEventListener('click', async (e) => {
        try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch {}
        if (ui.doneBtn.disabled) return;
        await backNav();
      }, { passive: false });
    }

    await this._runDevicePullModes(dt, { backTarget });
  }

  async _runDevicePullModes(dt, { backTarget = 'mode-source' } = {}) {
    const ui = this._devXferUi();

    const unlock = () => {
      if (ui.backBtn) ui.backBtn.disabled = false;
      if (ui.doneBtn) ui.doneBtn.disabled = false;
    };

    const update = this._makeThrottled((o) => this._setDevXferUI(o), 55);

    try {
      if (!this._requireActivePort()) {
        this._setDevXferUI({
          status: 'Not connected.',
          progressText: 'Tap Back and connect a device first.',
          percent: 8,
          error: true,
          animate: false,
        });
        unlock();
        return;
      }

      this._setDevXferUI({ status: 'Loading modes…', progressText: 'Starting…', percent: 8, error: false, animate: true });

      this.vortex.clearModes();

      await this.vortexPort.pullEachFromDevice(this.vortexLib, this.vortex, (p) => {
        if (!p || typeof p !== 'object') return;

        const total = Number(p.total ?? 0);
        const i1 = Number(p.index ?? 0) + 1;

        let status = 'Loading modes…';
        let text = '';
        let percent = 10;

        if (p.phase === 'start') {
          status = 'Loading modes…';
          text = 'Starting…';
          percent = 10;
        } else if (p.phase === 'count') {
          status = 'Counting…';
          text = total > 0 ? `0 / ${total}` : '';
          percent = 12;
        } else if (p.phase === 'pulling') {
          status = 'Pulling…';
          text = total > 0 ? `Mode ${i1} / ${total}` : `Mode ${i1}`;
          percent = total > 0 ? Math.min(95, Math.max(12, (i1 / total) * 92)) : 40;
        } else if (p.phase === 'finalizing') {
          status = 'Finalizing…';
          text = total > 0 ? `${total} mode${total === 1 ? '' : 's'}` : '';
          percent = 98;
        } else if (p.phase === 'done') {
          status = 'Done.';
          text = total > 0 ? `${total} mode${total === 1 ? '' : 's'} loaded` : 'Loaded';
          percent = 100;
        }

        update({ status, progressText: text, percent, error: false, animate: p.phase !== 'done' });
      });

      if ((this.vortex.numModes() | 0) > 0) this.vortex.setCurMode(0, false);

      this._setDevXferUI({
        status: 'Done.',
        progressText: `${this.vortex.numModes() | 0} mode${(this.vortex.numModes() | 0) === 1 ? '' : 's'} loaded`,
        percent: 100,
        error: false,
        animate: false,
      });

      if (ui.doneBtn) ui.doneBtn.disabled = false;
      if (ui.backBtn) ui.backBtn.disabled = false;

      await this.gotoEditor({ deviceType: dt });
    } catch (err) {
      console.error('[Mobile] Device pull failed:', err);
      this._setDevXferUI({
        status: 'Load failed.',
        progressText: 'Tap Back and try again.',
        percent: 100,
        error: true,
        animate: false,
      });
      unlock();
    }
  }

  async gotoDevicePushModes({ deviceType, backTarget = 'editor' } = {}) {
    const dt = deviceType || this.selectedDeviceType('Duo');

    this.stopEditorLightshow();
    this.clearEditorResizeHandler();
    if (this.effectsPanel.isOpen()) this.effectsPanel.close();

    const deviceImg = this._getDeviceImgFor(dt);
    const deviceAlt = dt;

    const frag = await this.views.render('device-modes-send.html', {
      title: 'Save to device',
      subtitle: dt,
      deviceImg,
      deviceAlt,
      status: 'Starting…',
      progressText: '',
    });

    this.dom.set(frag);

    const ui = this._devXferUi();
    const backNav = async () => {
      if (backTarget === 'mode-source') await this.gotoModeSource({ deviceType: dt });
      else await this.gotoEditor({ deviceType: dt });
    };

    if (ui.backBtn) {
      ui.backBtn.disabled = true;
      ui.backBtn.addEventListener('click', async (e) => {
        try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch {}
        if (ui.backBtn.disabled) return;
        await backNav();
      }, { passive: false });
    }

    if (ui.doneBtn) {
      ui.doneBtn.disabled = true;
      ui.doneBtn.addEventListener('click', async (e) => {
        try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch {}
        if (ui.doneBtn.disabled) return;
        await backNav();
      }, { passive: false });
    }

    await this._runDevicePushModes(dt, { backTarget });
  }

  async _runDevicePushModes(dt, { backTarget = 'editor' } = {}) {
    const ui = this._devXferUi();
    const unlock = () => {
      if (ui.backBtn) ui.backBtn.disabled = false;
      if (ui.doneBtn) ui.doneBtn.disabled = false;
    };

    const update = this._makeThrottled((o) => this._setDevXferUI(o), 55);

    try {
      const hasModes = (this.vortex?.numModes?.() | 0) > 0;
      if (!hasModes) {
        this._setDevXferUI({
          status: 'Nothing to save.',
          progressText: 'No modes in the editor.',
          percent: 100,
          error: true,
          animate: false,
        });
        unlock();
        return;
      }

      if (!this._requireActivePort()) {
        this._setDevXferUI({
          status: 'Not connected.',
          progressText: 'Tap Back and connect a device first.',
          percent: 8,
          error: true,
          animate: false,
        });
        unlock();
        return;
      }

      try {
        this._getModes().initCurMode();
        this._getModes().saveCurMode();
      } catch {}

      this._setDevXferUI({ status: 'Saving modes…', progressText: 'Starting…', percent: 8, error: false, animate: true });

      // If your pushEachToDevice doesn't accept a callback yet, this will still work:
      // we try with a callback first; if it throws due to signature mismatch, retry without.
      let usedCallback = false;

      await this.vortexPort.pushEachToDevice(this.vortexLib, this.vortex, (p) => {
        usedCallback = true;

        if (!p || typeof p !== 'object') return;

        const total = Number(p.total ?? 0);
        const i1 = Number(p.index ?? 0) + 1;

        let status = 'Saving…';
        let text = '';
        let percent = 10;

        if (p.phase === 'start') {
          status = 'Saving…';
          text = 'Starting…';
          percent = 10;
        } else if (p.phase === 'count') {
          status = 'Counting…';
          text = total > 0 ? `0 / ${total}` : '';
          percent = 12;
        } else if (p.phase === 'pushing') {
          status = 'Pushing…';
          text = total > 0 ? `Mode ${i1} / ${total}` : `Mode ${i1}`;
          percent = total > 0 ? Math.min(95, Math.max(12, (i1 / total) * 92)) : 40;
        } else if (p.phase === 'finalizing') {
          status = 'Finalizing…';
          text = total > 0 ? `${total} mode${total === 1 ? '' : 's'}` : '';
          percent = 98;
        } else if (p.phase === 'done') {
          status = 'Done.';
          text = total > 0 ? `${total} mode${total === 1 ? '' : 's'} saved` : 'Saved';
          percent = 100;
        }

        update({ status, progressText: text, percent, error: false, animate: p.phase !== 'done' });
      });

      if (!usedCallback) {
        this._setDevXferUI({
          status: 'Done.',
          progressText: 'Saved.',
          percent: 100,
          error: false,
          animate: false,
        });
      } else {
        this._setDevXferUI({
          status: 'Done.',
          progressText: 'Saved.',
          percent: 100,
          error: false,
          animate: false,
        });
      }

      unlock();
      Notification.success?.('Saved to device');
    } catch (err) {
      console.error('[Mobile] Device push failed:', err);
      this._setDevXferUI({
        status: 'Save failed.',
        progressText: 'Tap Back and try again.',
        percent: 100,
        error: true,
        animate: false,
      });
      unlock();
    }
  }

  async gotoDeviceSelect() {
    const cardFragments = await Promise.all(
      DEVICE_CARDS.map((c) => this.views.render('device-card.html', { id: c.id, label: c.label, img: c.img }))
    );

    const containerFrag = await this.views.render('device-select.html', {});
    this.dom.set(containerFrag);

    const mount = this.dom.must('#device-cards-mount', 'device-select.html is missing #device-cards-mount');
    cardFragments.forEach((frag) => mount.appendChild(frag));

    const skipLink = document.createElement('div');
    skipLink.className = 'skip-to-editor-link';
    skipLink.innerHTML =
      `<a href="#" id="skip-to-editor">Skip to Editor ` +
      `<i class="fa-solid fa-arrow-right-long" style="margin-left: 0.4em;"></i></a>`;
    this.dom.$('.container-fluid')?.appendChild(skipLink);

    this.dom.onClick('#skip-to-editor', async () => {
      await this.gotoEditor({ deviceType: 'Spark' });
    }, { preventDefault: true });

    this.dom.all('[data-device]').forEach((cardEl) => {
      cardEl.addEventListener('click', async () => {
        const type = cardEl.dataset.device;
        this.setDeviceType(type);
        this.updateDeviceSelectUI();
        await this.onDeviceSelected(type);
      });
    });

    this.updateDeviceSelectUI();
  }

  async onDeviceSelected(deviceType) {
    console.log('[Mobile] selected device:', deviceType);
    const { deviceImg, deviceAlt, instructions } = this.getBleConnectCopy(deviceType);
    await this.gotoBleConnect({ deviceType, deviceImg, deviceAlt, instructions });
  }

  async gotoBleConnect({ deviceType, deviceImg, deviceAlt, instructions }) {
    const frag = await this.views.render('ble-connect.html', { deviceType, deviceImg, deviceAlt, instructions });
    this.dom.set(frag);

    this.dom.onClick('#back-btn', async () => { await this.gotoDeviceSelect(); });

    const connectBtn = this.dom.must('#ble-connect-btn', 'ble-connect.html is missing #ble-connect-btn');

    let completed = false;
    this.dom.onClick(connectBtn, async () => {
      if (completed) return;

      console.log('[Mobile] Attempting BLE connection for:', deviceType);

      await this.dom.busy(
        connectBtn,
        `<i class="fa-solid fa-spinner fa-spin"></i> Connecting…`,
        async () => {
          try {
            await this.vortexPort.requestDevice(async (status) => {
              if (completed) return;

              if (status === 'connect') {
                completed = true;
                this.vortexPort.startReading();
                console.log('[Mobile] BLE connected and greeting received');
                await this.gotoModeSource({ deviceType });
                return;
              }

              if (status === 'waiting') return;
              if (status === 'disconnect') return;

              if (status === 'failed') {
                completed = true;
                await this.gotoModeSource({ deviceType });
              }
            });
          } catch (err) {
            console.error('BLE connection failed:', err);
            alert('Failed to connect to Bluetooth device.');
          }
        }
      );
    });
  }

  async gotoModeSource({ deviceType }) {
    const dt = deviceType || this.selectedDeviceType('Duo');
    this.setDeviceType(dt);

    const frag = await this.views.render('mode-source.html', { subtitle: 'Choose how to start' });
    this.dom.set(frag);

    this.dom.onClick('#back-btn', async () => {
      const { deviceImg, deviceAlt, instructions } = this.getBleConnectCopy(dt);
      await this.gotoBleConnect({ deviceType: dt, deviceImg, deviceAlt, instructions });
    });

    this.dom.onClick('#ms-new-mode', async () => {
      await this.startNewModeAndEnterEditor(dt);
    });

    const loadBtn = this.dom.must('#ms-load-device', 'mode-source.html is missing #ms-load-device');
    loadBtn.innerHTML = this.loadActionLabel(dt);

    this.dom.onClick(loadBtn, async () => {
      if (dt === 'Duo') {
        await this.gotoDuoReceive({ deviceType: dt });
        return;
      }
      await this.pullFromDeviceAndEnterEditor(dt, { source: 'mode-source' });
    });

    this.dom.onClick('#ms-browse-community', async () => {
      await this.gotoCommunityBrowser({ deviceType: dt, backTarget: 'mode-source' });
    });
  }

  async listenVL() {
    if (!this.vortexPort.isActive()) {
      Notification.failure('Please connect a device first');
      return;
    }
    await this.vortexPort.listenVL(this.vortexLib, this.vortex);
  }

  async demoModeOnDevice() {
    try {
      let tries = 0;
      while (this.vortexPort.isTransmitting || !this.vortexPort.isActive()) {
        if (tries++ > 10) return;
        await this.sleep(100);
      }
      await this.vortexPort.demoCurMode(this.vortexLib, this.vortex);
    } catch (error) {
      Notification.failure('Failed to demo mode (' + error + ')');
    }
  }

  async pullFromDeviceAndEnterEditor(deviceType, { source = 'mode-source' } = {}) {
    // Duo doesn't use this path.
    if (deviceType === 'Duo') {
      await this.gotoDuoReceive({ deviceType });
      return;
    }

    const sel =
      source === 'editor-empty'
      ? { load: '#m-load-from-device', newm: '#m-start-new-mode', browse: '#m-browse-community' }
      : { load: '#ms-load-device', newm: '#ms-new-mode', browse: '#ms-browse-community' };

    const loadBtn = this.dom.$(sel.load);
    const newBtn = this.dom.$(sel.newm);
    const browseBtn = this.dom.$(sel.browse);
    const backBtn = this.dom.$('#back-btn');

    const baseBusyHtml = `<i class="fa-solid fa-spinner fa-spin"></i> Loading modes…`;
    const setBusyHtml = (html) => {
      if (loadBtn) loadBtn.innerHTML = html;
    };

    const failUi = (msg) => {
      try {
        Notification.failure?.(msg);
      } catch {}
    };

    const ensureActive = () => {
      if (!this.vortexPort?.isActive?.()) {
        failUi('Please connect a device first');
        return false;
      }
      return true;
    };

    const pullWithEach = async () => {
      if (typeof this.vortexPort.pullEachFromDevice !== 'function') {
        throw new Error('pullEachFromDevice not available');
      }

      let lastProgressAt = Date.now();
      let sawAnyProgress = false;

      const progressCb = (p) => {
        lastProgressAt = Date.now();
        sawAnyProgress = true;

        if (!p || typeof p !== 'object') return;

        const total = Number(p.total ?? 0);
        const i1 = Number(p.index ?? 0) + 1;

        let str = `Loading modes…`;
        if (p.phase === 'start') str = `Loading modes…`;
        else if (p.phase === 'count') str = total > 0 ? `Loading modes… (0 / ${total})` : `Loading modes…`;
        else if (p.phase === 'pulling') str = total > 0 ? `Pulling mode ${i1} / ${total}…` : `Pulling mode ${i1}…`;
        else if (p.phase === 'finalizing') str = total > 0 ? `Finalizing… (${total} modes)` : `Finalizing…`;
        else if (p.phase === 'done') str = total > 0 ? `Done (${total} modes)` : `Done`;

        setBusyHtml(`<i class="fa-solid fa-spinner fa-spin"></i> ${str}`);
      };

      // Watchdog:
      // If we go "silent" for too long, assume the device/firmware didn't like the command
      // (or startReading stole bytes, etc). Try to cancel + fail to trigger fallback.
      const watchdogMs = 5500;
      const intervalMs = 350;
      let watchdogTimer = null;

      const startWatchdog = () => {
        watchdogTimer = setInterval(async () => {
          const dt = Date.now() - lastProgressAt;
          if (dt < watchdogMs) return;

          try {
            setBusyHtml(`<i class="fa-solid fa-spinner fa-spin"></i> Still waiting…`);
          } catch {}

          // If we never got ANY progress callback, it's very likely unsupported/hung.
          // Best-effort cancel, then force fallback.
          if (!sawAnyProgress) {
            try {
              if (typeof this.vortexPort.cancelReading === 'function') {
                await this.vortexPort.cancelReading();
              }
            } catch {}
            clearInterval(watchdogTimer);
            watchdogTimer = null;
            throw new Error('pullEachFromDevice watchdog timeout (no progress)');
          }
        }, intervalMs);
      };

      const stopWatchdog = () => {
        if (watchdogTimer) {
          clearInterval(watchdogTimer);
          watchdogTimer = null;
        }
      };

      startWatchdog();
      try {
        await this.vortexPort.pullEachFromDevice(this.vortexLib, this.vortex, progressCb);
      } finally {
        stopWatchdog();
      }
    };

    const pullWithLegacy = async () => {
      // If you have an older bulk pull on the port, try it.
      // (No per-mode progress, but it gets you unstuck.)
      const fn =
        (typeof this.vortexPort.pullFromDevice === 'function' && this.vortexPort.pullFromDevice) ||
        (typeof this.vortexPort.pullModesFromDevice === 'function' && this.vortexPort.pullModesFromDevice) ||
        null;

      if (!fn) {
        throw new Error('No legacy pullFromDevice / pullModesFromDevice available');
      }

      setBusyHtml(`<i class="fa-solid fa-spinner fa-spin"></i> Loading modes…`);
      await fn.call(this.vortexPort, this.vortexLib, this.vortex);
      setBusyHtml(`<i class="fa-solid fa-spinner fa-spin"></i> Finalizing…`);
    };

    await this.dom.busy(
      loadBtn,
      baseBusyHtml,
      async () => {
        if (!ensureActive()) return;

        try {
          this.vortex.clearModes();

          // Prefer per-mode pull; fallback to legacy bulk pull if it hangs/unsupported.
          try {
            await pullWithEach();
          } catch (e) {
            console.warn('[Mobile] pullEachFromDevice failed, attempting legacy pull:', e);
            await pullWithLegacy();
          }

          if ((this.vortex.numModes() | 0) > 0) this.vortex.setCurMode(0, false);

          const total = this.vortex.numModes() | 0;
          setBusyHtml(
            `<i class="fa-solid fa-check"></i> Done (${total} mode${total === 1 ? '' : 's'})`
          );

          await this.gotoEditor({ deviceType });
        } catch (err) {
          console.error('[Mobile] Load from device failed:', err);
          failUi('Failed to load modes from device');

          // Restore the button label so it doesn't look stuck forever.
          try {
            if (loadBtn) loadBtn.innerHTML = this.loadActionLabel(deviceType);
          } catch {}
        }
      },
      { disable: [newBtn, browseBtn, backBtn] }
    );
  }

  async startNewModeAndEnterEditor(deviceType) {
    const before = this.vortex.numModes();
    if (!this.vortex.addNewMode(false)) return;

    // go to newly-added mode (append)
    const after = this.vortex.numModes();
    if (after > before) {
      this.vortex.setCurMode(after - 1, false);
    }

    try {
      this._getModes().initCurMode();
      this._getModes().saveCurMode();
    } catch {}

    await this.gotoEditor({ deviceType });
  }

  async gotoDuoReceive({ deviceType, preserveModes = false, backTarget = 'mode-source' } = {}) {
    const dt = deviceType || this.selectedDeviceType('Duo');

    this.stopEditorLightshow();
    this.clearEditorResizeHandler();
    if (this.effectsPanel.isOpen()) this.effectsPanel.close();

    const copy = {
      title: 'Load from Duo',
      body: "Point the Duo at the Chromadeck's buttons and send the mode. The Chromadeck is listening.",
      status: 'Starting…',
    };

    const frag = await this.views.render('duo-mode-receive.html', copy);
    this.dom.set(frag);

    this.dom.onClick('#back-btn', async () => {
      if (backTarget === 'editor') await this.gotoEditor({ deviceType: dt });
      else await this.gotoModeSource({ deviceType: dt });
    });

    const statusEl = this.dom.$('#duo-rx-status');
    const statusTextEl = this.dom.$('#duo-rx-status-text');
    const bodyEl = this.dom.$('#duo-rx-body');

    const beforeCount = this.vortex.numModes();

    try {
      if (statusTextEl) statusTextEl.textContent = 'Listening…';

      if (!preserveModes) this.vortex.clearModes();

      await this.listenVL();

      const afterCount = this.vortex.numModes();

      if (preserveModes) {
        if (afterCount > beforeCount) this.vortex.setCurMode(afterCount - 1, false);
      } else {
        if (afterCount > 0) this.vortex.setCurMode(0, false);
      }

      if (statusTextEl) statusTextEl.textContent = 'Received. Opening editor…';
      await this.gotoEditor({ deviceType: dt });
    } catch (err) {
      console.error('[Mobile] Duo receive failed:', err);
      statusEl?.classList.add('is-error');
      if (statusTextEl) statusTextEl.textContent = 'Receive failed. Tap Back and try again.';
      if (bodyEl) bodyEl.textContent = "Point the Duo at the Chromadeck's buttons, then send again.";
    }
  }

  async gotoEditor({ deviceType }) {
    if (!this.vortex) return;

    const dt = deviceType || this.selectedDeviceType('Duo');
    this.setDeviceType(dt);

    const hasModes = this.vortex.numModes() > 0;

    const idx = this.vortex.curModeIndex() | 0;
    const n = this.vortex.numModes() | 0;

    const modeName = hasModes ? `Mode ${idx + 1}` : 'No modes';
    const modeIndexLabel = hasModes ? `${idx + 1} / ${n}` : 'No modes';

    const frag = await this.views.render('editor.html', {
      deviceType: dt,
      modeName,
      modeIndexLabel,
      emptyDisplay: hasModes ? 'none' : 'grid',
    });

    this.dom.set(frag);

    const tools = this.dom.$('.m-editor-tools');
    const carousel = this.dom.$('.m-editor-carousel');

    if (!hasModes) {
      tools?.classList.add('m-editor-disabled');
      carousel?.classList.add('m-editor-disabled');
    } else {
      tools?.classList.remove('m-editor-disabled');
      carousel?.classList.remove('m-editor-disabled');
    }

    this.stopEditorLightshow();
    this.clearEditorResizeHandler();

    if (this.effectsPanel.isOpen()) this.effectsPanel.close();

    if (!hasModes) {
      await this.bindEmptyEditorActions(dt);
      return;
    }

    this.bindEditorModeNav(dt);
    this.bindEditorTools(dt);

    await this.startEditorLightshow(dt);
    this.demoModeOnDevice();
  }

  async bindEmptyEditorActions(dt) {
    this.dom.onClick('#m-start-new-mode', async () => {
      const before = this.vortex.numModes();
      if (!this.vortex.addNewMode(false)) return;

      const after = this.vortex.numModes();
      if (after > before) this.vortex.setCurMode(after - 1, false);

      try {
        this._getModes().initCurMode();
        this._getModes().saveCurMode();
      } catch {}

      await this.gotoEditor({ deviceType: dt });
    });

    const loadBtn = this.dom.$('#m-load-from-device');
    if (loadBtn) {
      loadBtn.innerHTML = this.loadActionLabel(dt);

      // Restore the same in-button progress pull here too.
      this.dom.onClick(loadBtn, async () => {
        if (dt === 'Duo') {
          await this.gotoDuoReceive({ deviceType: dt });
          return;
        }
        await this.pullFromDeviceAndEnterEditor(dt, { source: 'editor-empty' });
      });
    }

    this.dom.onClick('#m-browse-community', async () => {
      await this.gotoCommunityBrowser({ deviceType: dt, backTarget: 'editor' });
    });
  }

  async startEditorLightshow(dt) {
    const canvas = this.dom.must('#mobile-lightshow-canvas', 'editor.html is missing #mobile-lightshow-canvas');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    this.lightshow = new Lightshow(this.vortexLib, this.vortex, canvas);

    const isDuo = dt === 'Duo';
    this.lightshow.updateLayout(false);
    this.lightshow.setDuoEditorMode(isDuo);

    const ledCount = this.devices?.[dt]?.ledCount ?? (isDuo ? 2 : 1);


    Object.assign(this.lightshow, {
      tickRate: isDuo ? 3 : 1,
      trailSize: isDuo ? 300 : 120,
      dotSize: isDuo ? 15 : 5,
      blurFac: 1,
      circleRadius: isDuo ? 180 : 400,
      spread: isDuo ? 50 : 150,
      direction: -1,
    });

    this.lightshow.setLedCount(ledCount);
    this.lightshow.setShape(dt === 'Spark' ? 'orbit' : 'circle');
    this.lightshow.angle = 0;
    this.lightshow.resetToCenter();
    this.lightshow.start();

    this._editorResizeHandler = () => {
      if (!this.lightshow) return;
      this.lightshow.updateLayout(false);
      this.lightshow.resetToCenter();
    };
    window.addEventListener('resize', this._editorResizeHandler);
  }

  _findFirst(selectorList) {
    for (const s of selectorList) {
      const el = this.dom.$(s);
      if (el) return el;
    }
    return null;
  }

  _updateModeHeaderUI() {
    const n = this.vortex.numModes() | 0;
    if (n <= 0) return false;

    const idx = this.vortex.curModeIndex() | 0;
    const modeName = `Mode ${idx + 1}`;
    const modeIndexLabel = `${idx + 1} / ${n}`;

    const nameEl = this._findFirst(['#m-mode-name', '#mode-name', '[data-role="mode-name"]']);
    const idxEl = this._findFirst(['#m-mode-index', '#mode-index-label', '[data-role="mode-index"]']);

    if (nameEl) nameEl.textContent = modeName;
    if (idxEl) idxEl.textContent = modeIndexLabel;

    // Optional: if you show mode "name" from engine
    const modeTitleEl = this._findFirst(['#m-mode-title', '[data-role="mode-title"]']);
    if (modeTitleEl) {
      try {
        modeTitleEl.textContent = this.vortex.getModeName();
      } catch {}
    }

    return !!(nameEl || idxEl || modeTitleEl);
  }

  async _afterModeChanged(dt, { allowRerenderFallback = true, finalize = true, demo = true } = {}) {
    const updated = this._updateModeHeaderUI();
    if (finalize) this._scheduleModeFinalize(120);
    if (demo) this._scheduleModeDemo(160);

    if (!updated && allowRerenderFallback) {
      await this.gotoEditor({ deviceType: dt });
    }
  }

  async _navigateMode(dt, dir /* +1 next, -1 prev */) {
    const n = this.vortex.numModes() | 0;
    if (n <= 0) return;

    const cur = this.vortex.curModeIndex() | 0;

    let next = cur + (dir > 0 ? 1 : -1);
    if (next < 0) next = n - 1;
    else if (next >= n) next = 0;

    // Pure value call, no save
    try {
      this.vortex.setCurMode(next >>> 0, false);
    } catch (e) {
      console.error('[Mobile] setCurMode failed:', e);
      return;
    }

    // Update UI immediately; defer BLE demo so spam taps don’t feel slow
    await this._afterModeChanged(dt, { finalize: false, demo: true });
  }

  _ensureModeCrudButtonsExist() {
    const pill = this.dom.$('.m-carousel-pill');
    if (!pill) return;

    let actions = pill.querySelector('.m-carousel-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'm-carousel-actions';
      pill.appendChild(actions);
    }

    let addBtn = this.dom.$('#mode-add');
    if (!addBtn) {
      addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.id = 'mode-add';
      addBtn.className = 'm-carousel-action-btn';
      addBtn.title = 'Add mode';
      addBtn.innerHTML = `<i class="fa-solid fa-plus"></i>`;
      actions.appendChild(addBtn);
    } else if (!actions.contains(addBtn)) {
      actions.appendChild(addBtn);
      addBtn.classList.add('m-carousel-action-btn');
    }

    let delBtn = this.dom.$('#mode-delete');
    if (!delBtn) {
      delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.id = 'mode-delete';
      delBtn.className = 'm-carousel-action-btn is-danger';
      delBtn.title = 'Delete mode';
      delBtn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
      actions.appendChild(delBtn);
    } else if (!actions.contains(delBtn)) {
      actions.appendChild(delBtn);
      delBtn.classList.add('m-carousel-action-btn');
      delBtn.classList.add('is-danger');
    }
  }

  _bindModeSwipe(dt) {
    // Bind swipe to the CANVAS (or stage) — never the carousel/buttons.
    const swipeTarget =
      this.dom.$('#mobile-lightshow-canvas') ||
      this.dom.$('.m-editor-stage') ||
      this.dom.$('#mobile-app-root');

    if (!swipeTarget) return;
    if (swipeTarget.dataset.modeSwipeBound === '1') return;
    swipeTarget.dataset.modeSwipeBound = '1';

    const state = this._modeSwipe;

    const reset = () => {
      state.active = false;
      state.pointerId = -1;
      state.startX = 0;
      state.startY = 0;
      state.lastX = 0;
      state.lastY = 0;
      state.lockedAxis = null;
      state.captured = false;
    };

    const isInteractiveTarget = (t) => {
      const el = t && t.nodeType === 1 ? t : null;
      if (!el) return false;
      return !!el.closest?.(
        'button, a, input, select, textarea, label, [role="button"], [data-tool], .m-carousel-btn, .m-tool-btn, .m-carousel-action-btn'
      );
    };

    const onDown = (e) => {
      if (!e) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((this.vortex.numModes() | 0) <= 0) return;

      // If the user started on an interactive control, never treat it as swipe.
      if (isInteractiveTarget(e.target)) return;

      state.active = true;
      state.pointerId = e.pointerId;
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.lockedAxis = null;
      state.captured = false;
    };

    const onMove = (e) => {
      if (!state.active) return;
      if (e.pointerId !== state.pointerId) return;

      state.lastX = e.clientX;
      state.lastY = e.clientY;

      const dx = state.lastX - state.startX;
      const dy = state.lastY - state.startY;

      if (!state.lockedAxis) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx > 8 || ady > 8) state.lockedAxis = adx > ady ? 'x' : 'y';
      }

      // Only capture once we KNOW it's a horizontal swipe.
      if (state.lockedAxis === 'x') {
        if (!state.captured) {
          state.captured = true;
          try { swipeTarget.setPointerCapture?.(e.pointerId); } catch {}
        }
        try { e.preventDefault?.(); } catch {}
      }
    };

    const onUp = async (e) => {
      if (!state.active) return;
      if (e.pointerId !== state.pointerId) return;

      const dx = state.lastX - state.startX;
      const dy = state.lastY - state.startY;

      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      const wasSwipe =
        state.captured &&
        adx >= 55 &&
        adx >= ady * 1.3;

      reset();

      if (!wasSwipe) return;

      try { e.preventDefault?.(); } catch {}

      if (dx < 0) await this._navigateMode(dt, +1);
      else await this._navigateMode(dt, -1);
    };

    swipeTarget.addEventListener('pointerdown', onDown, { passive: true });
    swipeTarget.addEventListener('pointermove', onMove, { passive: false });
    swipeTarget.addEventListener('pointerup', onUp, { passive: false });
    swipeTarget.addEventListener('pointercancel', () => reset(), { passive: true });
    swipeTarget.addEventListener('lostpointercapture', () => reset(), { passive: true });
  }

  _bindModeSwipe(dt) {
    // Bind swipe to the CANVAS (or stage) — never the carousel/buttons.
    const swipeTarget =
      this.dom.$('#mobile-lightshow-canvas') ||
      this.dom.$('.m-editor-stage') ||
      this.dom.$('#mobile-app-root');

    if (!swipeTarget) return;
    if (swipeTarget.dataset.modeSwipeBound === '1') return;
    swipeTarget.dataset.modeSwipeBound = '1';

    const state = this._modeSwipe;

    const reset = () => {
      state.active = false;
      state.pointerId = -1;
      state.startX = 0;
      state.startY = 0;
      state.lastX = 0;
      state.lastY = 0;
      state.lockedAxis = null;
      state.captured = false;
    };

    const isInteractiveTarget = (t) => {
      const el = t && t.nodeType === 1 ? t : null;
      if (!el) return false;
      return !!el.closest?.(
        'button, a, input, select, textarea, label, [role="button"], [data-tool], .m-carousel-btn, .m-tool-btn, .m-carousel-action-btn'
      );
    };

    const onDown = (e) => {
      if (!e) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((this.vortex.numModes() | 0) <= 0) return;

      // If the user started on an interactive control, never treat it as swipe.
      if (isInteractiveTarget(e.target)) return;

      state.active = true;
      state.pointerId = e.pointerId;
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.lockedAxis = null;
      state.captured = false;
    };

    const onMove = (e) => {
      if (!state.active) return;
      if (e.pointerId !== state.pointerId) return;

      state.lastX = e.clientX;
      state.lastY = e.clientY;

      const dx = state.lastX - state.startX;
      const dy = state.lastY - state.startY;

      if (!state.lockedAxis) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx > 8 || ady > 8) state.lockedAxis = adx > ady ? 'x' : 'y';
      }

      // Only capture once we KNOW it's a horizontal swipe.
      if (state.lockedAxis === 'x') {
        if (!state.captured) {
          state.captured = true;
          try { swipeTarget.setPointerCapture?.(e.pointerId); } catch {}
        }
        try { e.preventDefault?.(); } catch {}
      }
    };

    const onUp = async (e) => {
      if (!state.active) return;
      if (e.pointerId !== state.pointerId) return;

      const dx = state.lastX - state.startX;
      const dy = state.lastY - state.startY;

      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      const wasSwipe =
        state.captured &&
        adx >= 55 &&
        adx >= ady * 1.3;

      reset();

      if (!wasSwipe) return;

      try { e.preventDefault?.(); } catch {}

      if (dx < 0) await this._navigateMode(dt, +1);
      else await this._navigateMode(dt, -1);
    };

    swipeTarget.addEventListener('pointerdown', onDown, { passive: true });
    swipeTarget.addEventListener('pointermove', onMove, { passive: false });
    swipeTarget.addEventListener('pointerup', onUp, { passive: false });
    swipeTarget.addEventListener('pointercancel', () => reset(), { passive: true });
    swipeTarget.addEventListener('lostpointercapture', () => reset(), { passive: true });
  }

  async _addModeInEditor(dt) {
    const before = this.vortex.numModes() | 0;

    this._clearModeTimers();

    try {
      this._withLightshowPausedSync(() => {
        const ok = this.vortex.addNewMode(false);
        if (!ok) throw new Error('addNewMode returned false');

        const after = this.vortex.numModes() | 0;
        if (after > before) this.vortex.setCurMode(after - 1, false);

        // Keep parity with other edits (init + save), but still fast.
        try {
          this._getModes().initCurMode();
          this._getModes().saveCurMode();
        } catch {}
      });
    } catch (e) {
      console.error('[Mobile] add mode failed:', e);
      Notification.failure?.('Failed to add mode');
      void this._restartLightshowAndDemo(dt);
      return;
    }

    // Instant UI update (no waiting on BLE/demo)
    Notification.success?.('Added mode');
    await this._afterModeChanged(dt, { finalize: false, demo: true });

    // Ensure visuals keep running; demo is fire-and-forget inside.
    void this._restartLightshowAndDemo(dt);
  }

  async _deleteModeInEditor(dt) {
    const n = this.vortex.numModes() | 0;
    if (n <= 0) return;

    const idx = this.vortex.curModeIndex() | 0;

    // Do not allow deleting Mode 1
    if (idx === 0) {
      Notification.failure?.('Mode 1 cannot be deleted');
      return;
    }

    const ok = window.confirm(`Delete Mode ${idx + 1}?`);
    if (!ok) return;

    this._clearModeTimers();

    let afterN = n;

    try {
      this._withLightshowPausedSync(() => {
        this.vortex.delCurMode(false);

        afterN = this.vortex.numModes() | 0;

        if (afterN > 0) {
          let newIdx = this.vortex.curModeIndex() | 0;
          if (newIdx < 0) newIdx = 0;
          if (newIdx >= afterN) newIdx = afterN - 1;

          try { this.vortex.setCurMode(newIdx >>> 0, false); } catch {}

          try {
            this._getModes().initCurMode();
            this._getModes().saveCurMode();
          } catch {}
        }
      });
    } catch (e) {
      console.error('[Mobile] delete mode failed:', e);
      Notification.failure?.('Delete failed');
      void this._restartLightshowAndDemo(dt);
      return;
    }

    Notification.success?.('Deleted mode');

    if (afterN <= 0) {
      await this.gotoEditor({ deviceType: dt });
      return;
    }

    // Instant UI update; BLE/demo scheduled, not awaited.
    await this._afterModeChanged(dt, { finalize: false, demo: true });
    void this._restartLightshowAndDemo(dt);
  }

  // -----------------------------
  // Transfer (explicit names only)
  // -----------------------------

  _requireActivePort() {
    if (!this.vortexPort?.isActive?.()) {
      Notification.failure('Please connect a device first');
      return false;
    }
    return true;
  }

  async _ensureTransferModal() {
    if (this._transferModalEl && document.body.contains(this._transferModalEl)) return this._transferModalEl;

    const existing = document.getElementById('m-transfer-modal');
    if (existing) {
      this._transferModalEl = existing;
      this._transferModalLoaded = true;
      return existing;
    }

    if (this._transferModalLoaded) {
      throw new Error('transfer-modal.html was loaded but #m-transfer-modal is missing');
    }

    const frag = await this.views.render('transfer-modal.html', {});
    document.body.appendChild(frag);

    const el = document.getElementById('m-transfer-modal');
    if (!el) throw new Error('transfer-modal.html must contain #m-transfer-modal');

    this._transferModalEl = el;
    this._transferModalLoaded = true;

    return el;
  }

  async _configureTransferModalForDevice(dt) {
    const modal = await this._ensureTransferModal();
    modal.dataset.device = String(dt || '');
    if (!modal.dataset.xferRunning) modal.dataset.xferRunning = '0';

    const pullBtn = modal.querySelector('#m-transfer-pull');
    const pushBtn = modal.querySelector('#m-transfer-push');

    const subtitle = modal.querySelector('#m-transfer-subtitle');
    const footnote = modal.querySelector('#m-transfer-footnote');

    if (subtitle) subtitle.textContent = `Transfer modes to or from ${dt}`;
    if (footnote) {
      footnote.textContent =
        dt === 'Duo'
          ? 'Use the Chromadeck to send or receive modes from the Duo.'
          : 'Pull/push modes directly over BLE.';
    }

    if (pullBtn) {
      pullBtn.disabled = false;
      pullBtn.innerHTML =
        `<i class="fa-solid fa-download me-2"></i> ` +
        `${dt === 'Duo' ? 'Load from Duo' : 'Load from device'}`;
    }

    if (pushBtn) {
      const hasModes = (this.vortex?.numModes?.() | 0) > 0;
      pushBtn.disabled = !hasModes;
      pushBtn.innerHTML =
        `<i class="fa-solid fa-upload me-2"></i> ` +
        `${dt === 'Duo' ? 'Save to Duo' : 'Save to device'}`;
    }

    if (modal.dataset.bound !== '1') {
      modal.dataset.bound = '1';

      const swallow = (e) => {
        try { e?.preventDefault?.(); e?.stopPropagation?.(); e?.stopImmediatePropagation?.(); } catch {}
      };

      const onPull = async (e) => {
        swallow(e);

        if (modal.dataset.xferRunning === '1') return;

        const dtNow = String(modal.dataset.device || dt || this.selectedDeviceType('Duo'));
        if (!this._requireActivePort()) return;

        const pullBtn2 = modal.querySelector('#m-transfer-pull');
        const pushBtn2 = modal.querySelector('#m-transfer-push');

        modal.dataset.xferRunning = '1';

        try {
          if (dtNow === 'Duo') {
            // Duo path is still a dedicated view flow (works well).
            if (pullBtn2) pullBtn2.disabled = true;
            if (pushBtn2) pushBtn2.disabled = true;
            if (pullBtn2) pullBtn2.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-2"></i> Opening…`;

            await this._hideTransferModal();
            await this._pullSingleModeFromDuoInEditor();
            return;
          }

          // Non-Duo: do the transfer right here and show progress in the tapped button.
          await this._pullModesFromDeviceInEditor(dtNow, pullBtn2, pushBtn2);
        } finally {
          modal.dataset.xferRunning = '0';
          try { await this._configureTransferModalForDevice(this.selectedDeviceType('Duo')); } catch {}
        }
      };

      const onPush = async (e) => {
        swallow(e);

        if (modal.dataset.xferRunning === '1') return;

        const dtNow = String(modal.dataset.device || dt || this.selectedDeviceType('Duo'));
        if (!this._requireActivePort()) return;

        const pullBtn2 = modal.querySelector('#m-transfer-pull');
        const pushBtn2 = modal.querySelector('#m-transfer-push');
        if (!pushBtn2 || pushBtn2.disabled) return;

        modal.dataset.xferRunning = '1';

        try {
          if (dtNow === 'Duo') {
            if (pullBtn2) pullBtn2.disabled = true;
            if (pushBtn2) pushBtn2.disabled = true;
            if (pushBtn2) pushBtn2.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-2"></i> Opening…`;

            await this._hideTransferModal();
            await this._pushSingleModeToDuoInEditor();
            return;
          }

          await this._pushModesToDeviceInEditor(dtNow, pullBtn2, pushBtn2);
        } finally {
          modal.dataset.xferRunning = '0';
          try { await this._configureTransferModalForDevice(this.selectedDeviceType('Duo')); } catch {}
        }
      };

      modal.querySelector('#m-transfer-pull')?.addEventListener('click', onPull, { passive: false });
      modal.querySelector('#m-transfer-push')?.addEventListener('click', onPush, { passive: false });
    }

    return modal;
  }

  async _showTransferModal(dt) {
    const modalEl = await this._configureTransferModalForDevice(dt);

    if (!window.bootstrap || !window.bootstrap.Modal) {
      Notification.failure('Bootstrap modal is unavailable');
      return;
    }

    // Make it non-dismissible so users can't accidentally close mid-transfer.
    const inst = window.bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: false });
    inst.show();
  }

  async _hideTransferModal() {
    const modalEl = await this._ensureTransferModal();
    if (!window.bootstrap || !window.bootstrap.Modal) return;

    const inst = window.bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: false });

    await new Promise((resolve) => {
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        try { modalEl.removeEventListener('hidden.bs.modal', finish); } catch {}
        resolve();
      };

      try { modalEl.addEventListener('hidden.bs.modal', finish, { once: true }); } catch {}

      try { inst.hide(); } catch { finish(); }

      // Fallback: don't let a missed event strand the UI.
      setTimeout(finish, 700);
    });
  }

  async _pullSingleModeFromDuoInEditor() {
    try {
      await this._hideTransferModal();
      await this.gotoDuoReceive({
        deviceType: 'Duo',
        preserveModes: true,
        backTarget: 'editor',
      });
    } catch (err) {
      console.error('[Mobile] Duo pull (from editor) failed:', err);
      Notification.failure('Failed to pull mode from Duo');
    }
  }

  async _pushSingleModeToDuoInEditor() {
    try {
      const hasModes = (this.vortex.numModes() | 0) > 0;
      if (!hasModes) {
        Notification.failure('No mode to push');
        return;
      }

      if (!this._requireActivePort()) return;

      try {
        this._getModes().initCurMode();
        this._getModes().saveCurMode();
      } catch {}

      await this._hideTransferModal();

      await this.gotoDuoSend({
        deviceType: 'Duo',
        backTarget: 'editor',
      });
    } catch (err) {
      console.error('[Mobile] Duo push failed:', err);
      Notification.failure('Failed to start sending to Duo');
    }
  }

  async gotoDuoSend({ deviceType, backTarget = 'editor' } = {}) {
    const dt = deviceType || this.selectedDeviceType('Duo');

    this.stopEditorLightshow();
    this.clearEditorResizeHandler();
    if (this.effectsPanel.isOpen()) this.effectsPanel.close();

    const copy = {
      title: 'Sending to Duo…',
      body: 'Enter ModeSharing on Duo and point the Chromadeck at the button area on the Duo to transfer the mode.',
      status: 'Starting…',
    };

    const frag = await this.views.render('duo-mode-send.html', copy);
    this.dom.set(frag);

    const statusEl = this.dom.$('#duo-tx-status');
    const statusTextEl = this.dom.$('#duo-tx-status-text');

    const doneBtn = this.dom.$('#done-btn');
    if (doneBtn) {
      doneBtn.addEventListener('click', async (e) => {
        try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch {}
        this._stopDuoTransmitLoop();
        if (backTarget === 'editor') await this.gotoEditor({ deviceType: dt });
        else await this.gotoModeSource({ deviceType: dt });
      }, { passive: false });
    }

    this._startDuoTransmitLoop({ intervalMs: 900, statusEl, statusTextEl });
  }

  _startDuoTransmitLoop({ intervalMs = 900, statusEl = null, statusTextEl = null } = {}) {
    this._stopDuoTransmitLoop();

    this._duoTxLoopActive = true;
    this._duoTxLoopTimer = null;

    const setStatus = (txt) => {
      if (statusTextEl) statusTextEl.textContent = txt;
    };

    const fail = (txt) => {
      try { statusEl?.classList.add('is-error'); } catch {}
      setStatus(txt);
      this._stopDuoTransmitLoop();
    };

    const tick = async () => {
      if (!this._duoTxLoopActive) return;

      if (!this.vortexPort?.isActive?.()) {
        fail('Not connected. Tap Done, reconnect, and try again.');
        return;
      }

      if (this.vortexPort.isTransmitting) {
        setStatus('Sending… keep pointing…');
        this._duoTxLoopTimer = setTimeout(tick, 200);
        return;
      }

      try {
        setStatus('Sending… keep pointing…');

        // Explicit method name only. If your VortexPort uses a different name, rename it there.
        if (typeof this.vortexPort.transmitVL !== 'function') {
          throw new Error('VortexPort.transmitVL missing');
        }

        await this.vortexPort.transmitVL(this.vortexLib, this.vortex, () => {});

        if (!this._duoTxLoopActive) return;

        setStatus('Sent. Keep pointing…');
        this._duoTxLoopTimer = setTimeout(tick, intervalMs);
      } catch (err) {
        console.error('[Mobile] Duo transmit loop failed:', err);
        fail('Send failed. Keep pointing and try again, or tap Done.');
      }
    };

    tick();
  }

  _stopDuoTransmitLoop() {
    this._duoTxLoopActive = false;
    if (this._duoTxLoopTimer) {
      clearTimeout(this._duoTxLoopTimer);
      this._duoTxLoopTimer = null;
    }
  }

  async _pullModesFromDeviceInEditor(dt, pullBtn, pushBtn) {
    const modal = await this._ensureTransferModal();
    const closeBtn = modal.querySelector('.btn-close');

    const restoreClose = () => {
      try {
        if (closeBtn) {
          closeBtn.disabled = false;
          if (!closeBtn.getAttribute('data-bs-dismiss')) closeBtn.setAttribute('data-bs-dismiss', 'modal');
        }
      } catch {}
    };

    const lockClose = () => {
      try {
        if (closeBtn) {
          closeBtn.disabled = true;
          closeBtn.removeAttribute('data-bs-dismiss');
        }
      } catch {}
    };

    const setPullHtml = (html) => { try { if (pullBtn) pullBtn.innerHTML = html; } catch {} };

    const update = this._makeThrottled((html) => setPullHtml(html), 55);

    try {
      lockClose();

      if (pullBtn) pullBtn.disabled = true;
      if (pushBtn) pushBtn.disabled = true;

      this.vortex.clearModes();

      setPullHtml(`<i class="fa-solid fa-spinner fa-spin me-2"></i> Starting…`);

      await this.vortexPort.pullEachFromDevice(this.vortexLib, this.vortex, (p) => {
        if (!p || typeof p !== 'object') return;

        const total = Number(p.total ?? 0);
        const i = (Number(p.index ?? 0) | 0) + 1;

        let str = `Pulling…`;
        if (p.phase === 'start') str = `Starting…`;
        else if (p.phase === 'count') str = total > 0 ? `Counting… (0 / ${total})` : `Counting…`;
        else if (p.phase === 'pulling') str = total > 0 ? `Pulling ${i} / ${total}…` : `Pulling ${i}…`;
        else if (p.phase === 'finalizing') str = total > 0 ? `Finalizing… (${total})` : `Finalizing…`;
        else if (p.phase === 'done') str = total > 0 ? `Done (${total})` : `Done`;

        update(`<i class="fa-solid fa-spinner fa-spin me-2"></i> ${str}`);
      });

      if ((this.vortex.numModes() | 0) > 0) this.vortex.setCurMode(0, false);

      const total = this.vortex.numModes() | 0;
      setPullHtml(`<i class="fa-solid fa-check me-2"></i> Done (${total})`);

      await this._hideTransferModal();
      await this.gotoEditor({ deviceType: dt });

      Notification.success?.('Pulled modes from device');
    } catch (err) {
      console.error('[Mobile] Pull from device failed:', err);
      Notification.failure('Failed to pull modes from device');
    } finally {
      restoreClose();
      try {
        if (pullBtn) pullBtn.disabled = false;
        if (pushBtn) pushBtn.disabled = !((this.vortex.numModes() | 0) > 0);
        await this._configureTransferModalForDevice(this.selectedDeviceType('Duo'));
      } catch {}
    }
  }

  async _pushModesToDeviceInEditor(dt, pullBtn, pushBtn) {
    const modal = await this._ensureTransferModal();
    const closeBtn = modal.querySelector('.btn-close');

    const restoreClose = () => {
      try {
        if (closeBtn) {
          closeBtn.disabled = false;
          if (!closeBtn.getAttribute('data-bs-dismiss')) closeBtn.setAttribute('data-bs-dismiss', 'modal');
        }
      } catch {}
    };

    const lockClose = () => {
      try {
        if (closeBtn) {
          closeBtn.disabled = true;
          closeBtn.removeAttribute('data-bs-dismiss');
        }
      } catch {}
    };

    const setPushHtml = (html) => { try { if (pushBtn) pushBtn.innerHTML = html; } catch {} };
    const update = this._makeThrottled((html) => setPushHtml(html), 55);

    try {
      lockClose();

      const hasModes = (this.vortex.numModes() | 0) > 0;
      if (!hasModes) {
        Notification.failure('No modes to push');
        return;
      }

      try {
        this._getModes().initCurMode();
        this._getModes().saveCurMode();
      } catch {}

      if (pullBtn) pullBtn.disabled = true;
      if (pushBtn) pushBtn.disabled = true;

      setPushHtml(`<i class="fa-solid fa-spinner fa-spin me-2"></i> Starting…`);

      await this.vortexPort.pushEachToDevice(this.vortexLib, this.vortex, (p) => {
        if (!p || typeof p !== 'object') return;

        const total = Number(p.total ?? 0);
        const i = (Number(p.index ?? 0) | 0) + 1;

        let str = `Pushing…`;
        if (p.phase === 'start') str = `Starting…`;
        else if (p.phase === 'count') str = total > 0 ? `Counting… (0 / ${total})` : `Counting…`;
        else if (p.phase === 'pushing') str = total > 0 ? `Pushing ${i} / ${total}…` : `Pushing ${i}…`;
        else if (p.phase === 'finalizing') str = total > 0 ? `Finalizing… (${total})` : `Finalizing…`;
        else if (p.phase === 'done') str = total > 0 ? `Done (${total})` : `Done`;

        update(`<i class="fa-solid fa-spinner fa-spin me-2"></i> ${str}`);
      });

      setPushHtml(`<i class="fa-solid fa-check me-2"></i> Done`);
      await this._hideTransferModal();

      Notification.success?.('Pushed modes to device');
    } catch (err) {
      console.error('[Mobile] Push to device failed:', err);
      Notification.failure('Failed to push modes to device');
    } finally {
      restoreClose();
      try {
        if (pullBtn) pullBtn.disabled = false;
        if (pushBtn) pushBtn.disabled = !((this.vortex.numModes() | 0) > 0);
        await this._configureTransferModalForDevice(this.selectedDeviceType('Duo'));
      } catch {}
    }
  }

  bindEditorModeNav(dt) {
    this._ensureModeCrudButtonsExist();
    this._bindModeSwipe(dt);

    const prev = this.dom.$('#mode-prev');
    const next = this.dom.$('#mode-next');
    const addBtn = this.dom.$('#mode-add');
    const delBtn = this.dom.$('#mode-delete');

    const bindTap = (el, fn) => {
      if (!el) return;
      if (el._mBoundTap) return;
      el._mBoundTap = true;

      // Hard-kill any bubbling delegated click handler (SimpleDom etc).
      const swallow = (e) => {
        try {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          e?.stopImmediatePropagation?.();
        } catch {}
      };

      const fire = async (e) => {
        swallow(e);

        // Per-element lock (prevents weird double pointerup / duplicated listeners)
        const now = Date.now();
        if (el._mTapLockUntil && now < el._mTapLockUntil) return;
        el._mTapLockUntil = now + 350;

        await fn(e);
      };

      if (window.PointerEvent) {
        el.addEventListener('pointerup', fire, { passive: false });

        // Always swallow click so it can't cause a second activation.
        el.addEventListener('click', swallow, { passive: false });
      } else {
        // Fallback if PointerEvent not supported.
        el.addEventListener('click', fire, { passive: false });
      }
    };

    bindTap(prev, async () => { await this._navigateMode(dt, -1); });
    bindTap(next, async () => { await this._navigateMode(dt, +1); });
    bindTap(addBtn, async () => { await this._addModeInEditor(dt); });
    bindTap(delBtn, async () => { await this._deleteModeInEditor(dt); });

    if (document.body && document.body.dataset.modeKeysBound !== '1') {
      document.body.dataset.modeKeysBound = '1';
      window.addEventListener(
        'keydown',
        async (e) => {
          if (!e) return;
          if ((this.vortex.numModes() | 0) <= 0) return;
          if (e.key === 'ArrowLeft') await this._navigateMode(this.selectedDeviceType('Duo'), -1);
          else if (e.key === 'ArrowRight') await this._navigateMode(this.selectedDeviceType('Duo'), +1);
        },
        { passive: true }
      );
    }
  }

  bindEditorTools(dt) {
    const toolsEl = this.dom.$('.m-editor-tools');

    const swallow = (e) => {
      try {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        e?.stopImmediatePropagation?.();
      } catch {}
    };

    const handleTool = async (btn, e) => {
      swallow(e);

      const isDisabled = !!toolsEl?.classList.contains('m-editor-disabled');
      if (isDisabled) return;

      // Per-button lock to avoid double-fire from any stacked handlers.
      const now = Date.now();
      if (btn._mTapLockUntil && now < btn._mTapLockUntil) return;
      btn._mTapLockUntil = now + 350;

      const tool = String(btn.dataset.tool || '');

      if (tool === 'effects') {
        if (this.effectsPanel.isOpen()) this.effectsPanel.close();
        else await this.openEffectsPanel(dt);
        return;
      }

      if (tool === 'transfer' || tool === 'share') {
        if (!this._requireActivePort()) return;
        await this._showTransferModal(dt);
        return;
      }

      if (tool === 'settings') {
        await this._showSettingsMenu(dt);
        return;
      }
    };

    this.dom.all('[data-tool]').forEach((btn) => {
      if (btn._mBoundTool) return;
      btn._mBoundTool = true;

      if (window.PointerEvent) {
        btn.addEventListener(
          'pointerup',
          async (e) => {
            await handleTool(btn, e);
          },
          { passive: false }
        );

        // Swallow click so no delegated click handler (or synthetic click) runs tool twice.
        btn.addEventListener('click', swallow, { passive: false });
      } else {
        btn.addEventListener(
          'click',
          async (e) => {
            await handleTool(btn, e);
          },
          { passive: false }
        );
      }
    });
  }

  async _hideSettingsMenu() {
    const modalEl = await this._ensureSettingsModal();
    if (!window.bootstrap || !window.bootstrap.Modal) return;
    const inst = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    inst.hide();
  }

  async _showSettingsMenu(dt) {
    const modalEl = await this._ensureSettingsModal();

    const titleEl = modalEl.querySelector('#m-settings-title');
    if (titleEl) titleEl.textContent = `Settings${dt ? ` — ${dt}` : ''}`;

    if (!window.bootstrap || !window.bootstrap.Modal) {
      Notification.failure('Bootstrap modal is unavailable');
      return;
    }

    const inst = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    inst.show();
  }

  async _ensureSettingsModal() {
    if (this._settingsModalEl && document.body.contains(this._settingsModalEl)) return this._settingsModalEl;

    const existing = document.getElementById('m-settings-modal');
    if (existing) {
      this._settingsModalEl = existing;
      this._settingsModalLoaded = true;
      return existing;
    }

    if (this._settingsModalLoaded) {
      throw new Error('settings-modal.html was loaded but #m-settings-modal is missing');
    }

    const frag = await this.views.render('settings-modal.html', {});
    document.body.appendChild(frag);

    const el = document.getElementById('m-settings-modal');
    if (!el) throw new Error('settings-modal.html must contain #m-settings-modal');

    this._settingsModalEl = el;
    this._settingsModalLoaded = true;

    return el;
  }

  // -----------------------------
  // Community Browser (no guessing import)
  // Uses vortex.printJson() + vortex.parseJson()
  // -----------------------------

  _vcbSetStatus(text) {
    const el = this._vcbEls.status;
    if (!el) return;
    el.textContent = String(text || '');
  }

  _vcbClearCache() {
    this._vcbModesCache = {};
  }

  _vcbAttachEls() {
    this._vcbEls.searchBox = this.dom.$('#m-vcb-search-box');
    this._vcbEls.filterContainer = this.dom.$('#m-vcb-filter-container');
    this._vcbEls.modesContainer = this.dom.$('#m-vcb-modes-container');
    this._vcbEls.pageLabel = this.dom.$('#m-vcb-page-label');
    this._vcbEls.prevBtn = this.dom.$('#m-vcb-prev-btn');
    this._vcbEls.nextBtn = this.dom.$('#m-vcb-next-btn');
    this._vcbEls.status = this.dom.$('#m-vcb-status');
    this._vcbEls.refreshBtn = this.dom.$('#m-vcb-refresh');
  }

  _vcbBuildFilterButtons() {
    const container = this._vcbEls.filterContainer;
    if (!container) return;

    container.innerHTML = '';
    this._vcbActiveFilters.clear();

    const entries = Object.entries(this.devices || {});
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

      btn.addEventListener('click', () => {
        if (this._vcbActiveFilters.has(deviceName)) {
          this._vcbActiveFilters.delete(deviceName);
          btn.classList.remove('active');
        } else {
          this._vcbActiveFilters.add(deviceName);
          btn.classList.add('active');
        }
        this._vcbApplyFiltersAndRender();
      }, { passive: true });

      this._vcbActiveFilters.add(deviceName);
      container.appendChild(btn);
    }
  }

async _vcbFetchPage(pageNumber) {
  const page = pageNumber | 0;
  if (page <= 0) throw new Error('invalid page');
  if (this._vcbModesCache[page]) return this._vcbModesCache[page];

  let response;
  const v = Date.now();

  if (this.isLocalServer) {
    const suffix = page > 1 ? '2' : '';
    response = await fetch(`public/data/modeData${suffix}.json?v=${v}`);
  } else {
    response = await fetch(`https://vortex.community/modes/json?page=${page}&pageSize=${this._vcbPageSize}&v=${v}`, {
      method: 'GET',
      credentials: 'include'
    });
  }

  const data = await response.json();
  this._vcbModesCache[page] = data;

  if (typeof data?.pages === 'number') this._vcbTotalPages = data.pages;

  return data;
}

_vcbApplyFilters(pageData) {
  if (!pageData || !Array.isArray(pageData.data)) return [];
  const q = String(this._vcbSearchQuery || '').trim().toLowerCase();

  return pageData.data.filter((mode) => {
    const dev = String(mode?.deviceType || '').trim();
    const matchesDevice = this._vcbActiveFilters.has(dev);
    const name = String(mode?.name || '').toLowerCase();
    const matchesSearch = !q || (name && name.includes(q));
    return matchesDevice && matchesSearch;
  });
}

_vcbRenderPage(filteredModes) {
  const container = this._vcbEls.modesContainer;
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
    row.dataset.device = String(mode.deviceType || '');

    const deviceIcon = document.createElement('img');
    deviceIcon.className = 'm-vcb-device-icon';
    deviceIcon.src = `public/images/${String(mode.deviceType || '').toLowerCase()}-logo-square-512.png`;
    deviceIcon.alt = String(mode.deviceType || '');
    row.appendChild(deviceIcon);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'm-vcb-name';
    nameDiv.textContent = mode.name || 'Unnamed Mode';
    row.appendChild(nameDiv);

    const actions = document.createElement('div');
    actions.className = 'm-vcb-actions';

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'm-vcb-import-btn';
    importBtn.innerHTML = '<i class="fa-solid fa-share"></i>';
    importBtn.title = 'Import';

    importBtn.addEventListener('click', async (e) => {
      try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch {}
      await this._vcbImportMode(mode);
    }, { passive: false });

    actions.appendChild(importBtn);
    row.appendChild(actions);

    row.addEventListener('click', async () => {
      await this._vcbImportMode(mode);
    }, { passive: true });

    container.appendChild(row);
  }
}

_vcbUpdatePager() {
  const label = this._vcbEls.pageLabel;
  if (label) label.textContent = `Page ${this._vcbCurrentPage} / ${this._vcbTotalPages || '?'}`;

  const prevBtn = this._vcbEls.prevBtn;
  const nextBtn = this._vcbEls.nextBtn;

  if (prevBtn) prevBtn.disabled = !(this._vcbCurrentPage > 1);
  if (nextBtn) nextBtn.disabled = !(this._vcbCurrentPage < (this._vcbTotalPages || 1));
}

async _vcbLoadPage(pageNumber) {
  this._vcbCurrentPage = pageNumber | 0;
  if (this._vcbCurrentPage <= 0) this._vcbCurrentPage = 1;

  this._vcbSetStatus('Loading…');

  try {
    const pageData = await this._vcbFetchPage(this._vcbCurrentPage);
    const filtered = this._vcbApplyFilters(pageData);

    this._vcbUpdatePager();
    this._vcbRenderPage(filtered);

    this._vcbSetStatus(
      filtered.length
      ? `${filtered.length} mode${filtered.length === 1 ? '' : 's'} on this page`
      : 'No matches on this page'
    );
  } catch (err) {
    console.error('[Mobile] Error fetching modes:', err);
    this._vcbUpdatePager();
    this._vcbSetStatus('Failed to load modes.');
    const container = this._vcbEls.modesContainer;
    if (container) {
      container.innerHTML = '';
      const p = document.createElement('p');
      p.style.color = 'red';
      p.textContent = 'Failed to load modes.';
      container.appendChild(p);
    }
  }
}

async _vcbApplyFiltersAndRender() {
  try {
    const pageData = this._vcbModesCache[this._vcbCurrentPage];
    if (!pageData) {
      await this._vcbLoadPage(this._vcbCurrentPage);
      return;
    }
    const filtered = this._vcbApplyFilters(pageData);
    this._vcbUpdatePager();
    this._vcbRenderPage(filtered);
    this._vcbSetStatus(
      filtered.length
      ? `${filtered.length} mode${filtered.length === 1 ? '' : 's'} on this page`
      : 'No matches on this page'
    );
  } catch (err) {
    console.error('[Mobile] applyFilters failed:', err);
  }
}

_vcbBuildModeJsonFromCommunity(mode) {
  // We intentionally build a "mode json" that your C++ loadFromJson/loadModeFromJson understands.
  // No guessing function names. Import path uses vortex.printJson + vortex.parseJson only.

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
    Spark: 6
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
    single_pats
  };
}

async _vcbImportMode(mode) {
  try {
    // Get full current state JSON from engine
    const beforeCount = this.vortex.numModes() | 0;
    const jsonStr = String(this.vortex.printJson(false) || '');

    let obj;
    try {
      obj = jsonStr ? JSON.parse(jsonStr) : {};
    } catch {
      obj = {};
    }

    if (!obj || typeof obj !== 'object') obj = {};
    if (!Array.isArray(obj.modes)) obj.modes = [];
    if (typeof obj.num_modes !== 'number') obj.num_modes = obj.modes.length | 0;

    const modeJson = this._vcbBuildModeJsonFromCommunity(mode);
    const insertIndex = obj.modes.length | 0;

    obj.modes.push(modeJson);
    obj.num_modes = (obj.modes.length | 0);

    const outStr = JSON.stringify(obj);

    // mutation: pause render during parseJson (clears and reloads)
    this._clearModeTimers();
    this._withLightshowPausedSync(() => {
      const ok = this.vortex.parseJson(outStr);
      if (!ok) throw new Error('vortex.parseJson returned false');
    });

    // Select the newly-imported mode (the appended one)
    const afterCount = this.vortex.numModes() | 0;
    if (afterCount > 0) {
      const target = Math.min(insertIndex, afterCount - 1);
      this.vortex.setCurMode(target, false);
    }

    Notification.success?.('Imported mode');
    await this.gotoEditor({ deviceType: this.selectedDeviceType('Duo') });
  } catch (err) {
    console.error('[Mobile] importMode failed:', err);
    Notification.failure('Import failed');
    try {
      await this.gotoEditor({ deviceType: this.selectedDeviceType('Duo') });
    } catch {}
  }
}

async gotoCommunityBrowser({ deviceType, backTarget = 'mode-source' } = {}) {
  const dt = deviceType || this.selectedDeviceType('Duo');

  this.stopEditorLightshow();
  this.clearEditorResizeHandler();
  if (this.effectsPanel.isOpen()) this.effectsPanel.close();

  const frag = await this.views.render('community-browser.html', {});
  this.dom.set(frag);

  this._vcbAttachEls();

  this.dom.onClick('#back-btn', async () => {
    if (backTarget === 'editor') await this.gotoEditor({ deviceType: dt });
    else await this.gotoModeSource({ deviceType: dt });
  });

  if (this._vcbEls.searchBox) {
    this._vcbEls.searchBox.value = this._vcbSearchQuery || '';
    this._vcbEls.searchBox.addEventListener('input', async () => {
      this._vcbSearchQuery = String(this._vcbEls.searchBox.value || '');
      await this._vcbApplyFiltersAndRender();
    }, { passive: true });
  }

  if (this._vcbEls.prevBtn) {
    this._vcbEls.prevBtn.addEventListener('click', async () => {
      if (this._vcbCurrentPage > 1) {
        this._vcbCurrentPage--;
        await this._vcbLoadPage(this._vcbCurrentPage);
      }
    }, { passive: true });
  }

  if (this._vcbEls.nextBtn) {
    this._vcbEls.nextBtn.addEventListener('click', async () => {
      if (this._vcbCurrentPage < (this._vcbTotalPages || 1)) {
        this._vcbCurrentPage++;
        await this._vcbLoadPage(this._vcbCurrentPage);
      }
    }, { passive: true });
  }

  if (this._vcbEls.refreshBtn) {
    this._vcbEls.refreshBtn.addEventListener('click', async () => {
      this._vcbClearCache();
      await this._vcbLoadPage(this._vcbCurrentPage);
    }, { passive: true });
  }

  this._vcbBuildFilterButtons();
  await this._vcbLoadPage(this._vcbCurrentPage);
}

// -----------------------------
// Engine helpers (pure bound APIs)
// -----------------------------

_getEngine() {
  return this.vortex.engine();
}

_getModes() {
  return this._getEngine().modes();
}

_getCurMode() {
  return this._getModes().curMode();
}

_clearFxFinalize() {
  if (this._fxFinalizeTimer) {
    clearTimeout(this._fxFinalizeTimer);
    this._fxFinalizeTimer = null;
  }
}

_scheduleFxFinalize(ms = 140) {
  this._clearFxFinalize();
  this._fxFinalizeTimer = setTimeout(() => {
    this._fxFinalizeTimer = null;
    this._finalizeCurModeSafe();
  }, ms);
}

_clearFxDemo() {
  if (this._fxDemoTimer) {
    clearTimeout(this._fxDemoTimer);
    this._fxDemoTimer = null;
  }
}

_scheduleFxDemo(ms = 70) {
  this._clearFxDemo();
  this._fxDemoTimer = setTimeout(() => {
    this._fxDemoTimer = null;
    this.demoModeOnDevice();
  }, ms);
}

_rgbToHex(r, g, b) {
  const rr = (r & 255) >>> 0;
  const gg = (g & 255) >>> 0;
  const bb = (b & 255) >>> 0;
  return `#${((1 << 24) | (rr << 16) | (gg << 8) | bb).toString(16).slice(1).toUpperCase()}`;
}

_hexToRgb(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return { r: 255, g: 0, b: 0 };
  const v = parseInt(m[1], 16) >>> 0;
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

_getLedCountForDevice(dt) {
  return this.devices[dt].ledCount | 0;
}

_escape(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

_patternOptionsHtml({ allowMulti }) {
  const patternEnum = this.vortexLib.PatternID;

  const strobe = [];
  const blend = [];
  const solid = [];
  const multi = [];

  for (let k in patternEnum) {
    if (!Object.prototype.hasOwnProperty.call(patternEnum, k)) continue;
    if (k === 'values' || k === 'argCount') continue;

    const pat = patternEnum[k];
    if (!pat) continue;
    if (pat === patternEnum.PATTERN_NONE || pat === patternEnum.PATTERN_COUNT) continue;

    let label = '';
    try {
      label = this.vortex.patternToString(pat);
      if (label.startsWith('complementary')) label = 'comp. ' + label.slice(14);
    } catch {
      label = k;
    }

    const val = pat.value ?? -1;
    const opt = `<option value="${val}">${this._escape(label)}</option>`;

    const isSingle = !!this.vortexLib.isSingleLedPatternID?.(pat);

    if (!isSingle) {
      if (allowMulti) multi.push(opt);
      continue;
    }

    if (label.includes('blend')) blend.push(opt);
    else if (label.includes('solid')) solid.push(opt);
    else strobe.push(opt);
  }

  const mk = (label, arr) =>
    arr.length ? `<optgroup label="${this._escape(label)}">${arr.join('')}</optgroup>` : '';

  return (
    mk('Strobe Patterns', strobe) +
    mk('Blend Patterns', blend) +
    mk('Solid Patterns', solid) +
    (allowMulti ? mk('Special Patterns (Multi Led)', multi) : '')
  );
}

_getColorsetHexes(cur, led) {
  const set = cur.getColorset(led);
  const out = [];
  if (!set) return out;
  const n = set.numColors();
  for (let i = 0; i < n; i++) {
    const c = set.get(i);
    out.push(this._rgbToHex(c.red, c.green, c.blue));
  }
  return out;
}

_getPatternValue(cur, led) {
  try { return cur.getPatternID(led).value | 0; } catch { return -1; }
}

_finalizeCurModeSafe() {
  try {
    const cur = this._getCurMode();
    if (cur) cur.init(); // Mode::init() is a clean binding
  } catch {}
  try {
    this._getModes().saveCurMode(); // Modes::saveCurMode() is also a clean binding
  } catch {}
}

async openEffectsPanel(dt) {
  const cur = this._getCurMode();
  if (!cur) return;

  const ledCount = this._getLedCountForDevice(dt);
  this._fxLed = Math.max(0, Math.min(ledCount - 1, this._fxLed | 0));

  const allowMulti = dt !== 'Duo' && dt !== 'None';

  const colors = this._getColorsetHexes(cur, this._fxLed);
  const patternValue = this._getPatternValue(cur, this._fxLed);

  if (this._fxSelectedColor == null) this._fxSelectedColor = colors.length ? 0 : null;
  else if (this._fxSelectedColor >= colors.length) this._fxSelectedColor = colors.length ? colors.length - 1 : null;

  const rgb =
    this._fxSelectedColor != null && colors[this._fxSelectedColor]
    ? this._hexToRgb(colors[this._fxSelectedColor])
    : null;

  await this.effectsPanel.openEffects({
    deviceType: dt,
    title: 'Effects',
    ledCount,
    ledIndex: this._fxLed,
    patternValue,
    patternOptionsHtml: this._patternOptionsHtml({ allowMulti }),
    colors,
    selectedColorIndex: this._fxSelectedColor,
    rgb,

    onDone: async () => {
      this._clearFxFinalize();
      this._clearFxDemo();
      this._finalizeCurModeSafe();
      await this.demoModeOnDevice();
      this.effectsPanel.close();
    },

    onOff: () => {},

    onLedChange: async (newLed) => {
      const cur2 = this._getCurMode();
      if (!cur2) return null;

      this._fxLed = Math.max(0, Math.min(ledCount - 1, newLed | 0));

      const colors2 = this._getColorsetHexes(cur2, this._fxLed);
      const pat2 = this._getPatternValue(cur2, this._fxLed);

      if (this._fxSelectedColor == null) this._fxSelectedColor = colors2.length ? 0 : null;
      else if (this._fxSelectedColor >= colors2.length) this._fxSelectedColor = colors2.length ? colors2.length - 1 : null;

      const rgb2 =
        this._fxSelectedColor != null && colors2[this._fxSelectedColor]
        ? this._hexToRgb(colors2[this._fxSelectedColor])
        : null;

      return {
        ledCount,
        ledIndex: this._fxLed,
        patternValue: pat2,
        colors: colors2,
        selectedColorIndex: this._fxSelectedColor,
        rgb: rgb2,
      };
    },

    onPatternChange: async (patValue) => {
      const cur2 = this._getCurMode();
      if (!cur2) return null;

      // Use the explicit binder helper instead of PatternID.values guessing.
      let patID = null;
      try {
        patID = this.vortexLib.intToPatternID(patValue | 0);
      } catch {
        patID = null;
      }
      if (!patID) return null;

      try {
        const set = cur2.getColorset(this._fxLed);
        cur2.setPattern(patID, this._fxLed, null, null);
        if (set) cur2.setColorset(set, this._fxLed);
      } catch {}

      this._finalizeCurModeSafe();
      await this.demoModeOnDevice();

      return {
        ledCount,
        ledIndex: this._fxLed,
        patternValue: patValue | 0,
        colors: this._getColorsetHexes(cur2, this._fxLed),
        selectedColorIndex: this._fxSelectedColor,
      };
    },

    onColorsetAdd: async () => {
      const cur2 = this._getCurMode();
      if (!cur2) return null;

      const set = cur2.getColorset(this._fxLed);
      if (!set) return null;
      if (set.numColors() >= 8) return null;

      try {
        set.addColor(new this.vortexLib.RGBColor(255, 0, 0));
        cur2.setColorset(set, this._fxLed);
      } catch {}

      this._finalizeCurModeSafe();
      await this.demoModeOnDevice();

      const colors2 = this._getColorsetHexes(cur2, this._fxLed);
      this._fxSelectedColor = Math.max(0, colors2.length - 1);

      return {
        ledCount,
        ledIndex: this._fxLed,
        patternValue: this._getPatternValue(cur2, this._fxLed),
        colors: colors2,
        selectedColorIndex: this._fxSelectedColor,
        rgb: this._hexToRgb(colors2[this._fxSelectedColor]),
      };
    },

    onColorsetDelete: async (colorIndex) => {
      const cur2 = this._getCurMode();
      if (!cur2) return null;

      const set = cur2.getColorset(this._fxLed);
      if (!set) return null;

      const idx = colorIndex | 0;
      if (idx < 0 || idx >= set.numColors()) return null;

      try {
        set.removeColor(idx);
        cur2.setColorset(set, this._fxLed);
      } catch {}

      this._finalizeCurModeSafe();
      await this.demoModeOnDevice();

      const colors2 = this._getColorsetHexes(cur2, this._fxLed);
      if (colors2.length <= 0) {
        this._fxSelectedColor = null;
        return {
          ledCount,
          ledIndex: this._fxLed,
          patternValue: this._getPatternValue(cur2, this._fxLed),
          colors: colors2,
          selectedColorIndex: null,
        };
      }

      this._fxSelectedColor = Math.min(idx, colors2.length - 1);
      return {
        ledCount,
        ledIndex: this._fxLed,
        patternValue: this._getPatternValue(cur2, this._fxLed),
        colors: colors2,
        selectedColorIndex: this._fxSelectedColor,
        rgb: this._hexToRgb(colors2[this._fxSelectedColor]),
      };
    },

    onColorsetSelect: async (colorIndex) => {
      const cur2 = this._getCurMode();
      if (!cur2) return null;

      const colors2 = this._getColorsetHexes(cur2, this._fxLed);
      const idx = colorIndex | 0;
      if (idx < 0 || idx >= colors2.length) return null;

      this._fxSelectedColor = idx;

      return {
        ledCount,
        ledIndex: this._fxLed,
        patternValue: this._getPatternValue(cur2, this._fxLed),
        colors: colors2,
        selectedColorIndex: this._fxSelectedColor,
        rgb: this._hexToRgb(colors2[this._fxSelectedColor]),
      };
    },

    onColorChange: (idx, hex, isDragging) => {
      const cur2 = this._getCurMode();
      if (!cur2) return;

      const set = cur2.getColorset(this._fxLed);
      if (!set) return;

      const i = idx | 0;
      if (i < 0 || i >= set.numColors()) return;

      const { r, g, b } = this._hexToRgb(hex);

      try {
        set.set(i, new this.vortexLib.RGBColor(r, g, b));
        cur2.setColorset(set, this._fxLed);
      } catch {}

      if (isDragging) {
        this._scheduleFxFinalize(140);
      } else {
        this._clearFxFinalize();
        this._finalizeCurModeSafe();
        this._scheduleFxDemo(70);
      }
    },
  });
}
}

/* -----------------------------
   Entry Point
----------------------------- */
async function boot() {
  try {
    const vortexLib = await VortexLib();
    const editor = new VortexEditorMobile(vortexLib);
    // expose for console debugging if you want
    window.editor = editor;
    await editor.initialize();
  } catch (error) {
    console.error('Error initializing Vortex:', error);
  }
}

(function start() {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot();
    return;
  }
  document.addEventListener('DOMContentLoaded', () => { boot(); }, { once: true });
})();

