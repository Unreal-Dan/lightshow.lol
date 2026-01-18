/* VortexEditorMobile.js */

import VortexLib from '../VortexLib.js';
import Lightshow from '../Lightshow.js';
import VortexPort from '../VortexPort.js';
import Notification from '../Notification.js';

import SimpleViews from './SimpleViews.js';
import SimpleDom from './SimpleDom.js';
import ColorPicker from './ColorPicker.js';

import CommunityBrowser from './CommunityBrowser.js';
import SettingsModal from './SettingsModal.js';
import * as ConnStatus from './ConnStatus.js';

const ASSETS = {
  styles: [
    { id: 'fa-css', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css' },
    { id: 'bootstrap-css', href: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css' },
    { id: 'mobile-styles-css', href: 'css/mobile/mobile-styles.css' },
  ],
  scripts: [{ id: 'bootstrap-js', src: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js' }],
  data: {
    devices: 'js/devices.json?v=__CACHE_BUSTER__',
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
    this.vortex.setLedCount(1);

    this.vortexPort = new VortexPort(this, true);

    this.deviceType = null;
    this.devices = null;

    this.root = null;
    this.dom = null;

    this.lightshow = null;
    this._editorResizeHandler = null;

    this._transferInProgress = false;

    this.views = new SimpleViews({ basePath: 'js/mobile/views/' });

    this.effectsPanel = new ColorPicker({
      vortexLib: this.vortexLib,
      views: this.views,
      basePath: 'js/mobile/views/',
      host: this._makeColorPickerHost(),
    });

    this.communityBrowser = new CommunityBrowser(this);
    this.settingsModal = new SettingsModal(this, {
      views: this.views,
      basePath: 'js/mobile/views/'
    });

    this._fxFinalizeTimer = null;
    this._fxDemoTimer = null;

    this._modeFinalizeTimer = null;
    this._modeDemoTimer = null;

    this._transferModalEl = null;
    this._transferModalLoaded = false;

    this._settingsModalEl = null;
    this._settingsModalLoaded = false;

    this._duoTxLoopActive = false;
    this._duoTxLoopTimer = null;

    this._modeSwipe = {
      active: false,
      pointerId: -1,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      lockedAxis: null,
      captured: false,
    };

    this.isLocalServer = (location.hostname !== 'lightshow.lol');
  }

  _makeColorPickerHost() {
    return {
      getVortex: () => this.vortex,
      getDeviceType: () => this.deviceType || 'Duo',
      getDevices: () => this.devices,
      demoMode: async () => {
        await this.demoModeOnDevice();
      },
      demoColor: async (rgbColor) => {
        await this.demoColorOnDevice(rgbColor);
      },
      notifyFailure: (msg) => {
        Notification.failure?.(String(msg || ''));
      },
    };
  }

  detectMobile() {
    return true;
  }
  isBLESupported() {
    return true;
  }

  isVersionGreaterOrEqual(currentVersion, targetVersion = '1.3.0') {
    const currentParts = String(currentVersion || '').split('.').map(Number);
    const targetParts = String(targetVersion || '').split('.').map(Number);
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

    // Ensure host sees loaded devices (host getters already reference this.devices, but keep explicit in case you swap host later)
    this.effectsPanel.setHost(this._makeColorPickerHost());

    // ColorPicker mounts itself to <body> in its own implementation
    this.effectsPanel.mount();

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
    link.href = href + '?v=__CACHE_BUSTER__';
    document.head.appendChild(link);
  }

  loadScript(id, src) {
    return new Promise((resolve, reject) => {
      if (document.getElementById(id)) return resolve();
      const script = document.createElement('script');
      script.id = id;
      script.src = src + '?v=__CACHE_BUSTER__';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  stopEditorLightshow(destroy = true) {
    if (!this.lightshow) return;
    try {
      this.lightshow.stop();
    } catch {}
    if (destroy) this.lightshow = null;
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
      try {
        void this.demoModeOnDevice();
      } catch {}
    }, ms);
  }

  _withLightshowPausedSync(fn) {
    const ls = this.lightshow;
    if (ls) {
      try {
        ls.stop();
      } catch {}
    }
    try {
      return fn();
    } finally {
      if (ls) {
        try {
          ls.start();
        } catch {}
      }
    }
  }

  async _restartLightshowAndDemo(dt) {
    if (this.lightshow) {
      try {
        this.lightshow.start();
      } catch {}
    } else {
      try {
        await this.startEditorLightshow(dt);
      } catch (e) {
        console.error('[Mobile] startEditorLightshow failed after mutation:', e);
        try {
          await this.gotoEditor({ deviceType: dt });
        } catch {}
        return;
      }
    }

    try {
      setTimeout(() => {
        try {
          void this.demoModeOnDevice();
        } catch {}
      }, 0);
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

  selectedDeviceType(fallback = 'Duo') {
    return this.deviceType || fallback;
  }

  updateDeviceSelectUI() {
    const selected = this.deviceType;
    this.dom.all('[data-device]').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.device === selected);
    });
  }

  _getDeviceImgFor(dt) {
    const d = this.devices?.[dt];
    return d?.image || d?.iconBig || d?.icon || `public/images/${String(dt || '').toLowerCase()}-logo-square-512.png`;
  }

  async gotoDeviceSelect() {
    const cardFragments = await Promise.all(
      DEVICE_CARDS.map((c) => this.views.render('device-card.html', { id: c.id, label: c.label, img: c.img }))
    );

    const containerFrag = await this.views.render('device-select.html', {});
    this.dom.set(containerFrag);

    const mount = this.dom.must('#device-cards-mount', 'device-select.html is missing #device-cards-mount');
    cardFragments.forEach((frag) => mount.appendChild(frag));

    // setup the goto editor link
    this.dom.onClick(
      '#skip-to-editor',
      async () => {
        await this.gotoEditor({ deviceType: 'Spark' });
      },
      { preventDefault: true }
    );

    this.dom.all('[data-device]').forEach((cardEl) => {
      // Keep semantics simple: no swallow / no preventDefault; just avoid accidental double-fire on pointer devices.
      this.dom.onTap(
        cardEl,
        async () => {
          const type = cardEl.dataset.device;
          this.setDeviceType(type);
          this.updateDeviceSelectUI();
          await this.onDeviceSelected(type);
        },
        { preventDefault: false, swallow: false, lockMs: 0, boundKey: 'device-card', passive: false }
      );
    });

    this.updateDeviceSelectUI();
  }

  async onDeviceSelected(deviceType) {
    console.log('[Mobile] selected device:', deviceType);

    this.vortex.setLedCount(this.devices?.[deviceType]?.ledCount ?? 1);

    // Reset LED selection defaults whenever device changes (selection state lives inside ColorPicker now)
    const lc = this.vortex.engine().leds().ledCount() | 0;
    this.effectsPanel.ensureLedSelectionDefaults(lc);

    const { deviceImg, deviceAlt, instructions } = this.getBleConnectCopy(deviceType);
    await this.gotoBleConnect({ deviceType, deviceImg, deviceAlt, instructions });
  }

  async gotoBleConnect({ deviceType, deviceImg, deviceAlt, instructions }) {
    const frag = await this.views.render('ble-connect.html', { deviceType, deviceImg, deviceAlt, instructions });
    this.dom.set(frag);

    // setup the goto editor link
    this.dom.onClick(
      '#skip-to-editor',
      async () => {
        await this.gotoEditor({ deviceType });
      },
      { preventDefault: true }
    );

    this.dom.onTap(
      '#back-btn',
      async () => {
        await this.gotoDeviceSelect();
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'ble-back', passive: false }
    );

    const connectBtn = this.dom.must('#ble-connect-btn', 'ble-connect.html is missing #ble-connect-btn');

    let completed = false;
    this.dom.onTap(
      connectBtn,
      async () => {
        if (completed) return;

        console.log('[Mobile] Attempting BLE connection for:', deviceType);

        ConnStatus.setConnStatus(this, {
          status: 'connecting',
          title: deviceType,
          subtitle: 'Connecting…',
          deviceType,
          error: null,
        });

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
                  ConnStatus.setConnStatus(this, {
                    status: 'connected',
                    title: deviceType,
                    subtitle: 'Connected',
                    deviceType,
                    error: null,
                  });
                  await this.gotoModeSource({ deviceType });
                  return;
                }

                if (status === 'waiting') return;
                if (status === 'disconnect') {
                  ConnStatus.setConnError(this, 'Disconnected', { deviceType });
                  return;
                }

                if (status === 'failed') {
                  completed = true;
                  ConnStatus.setConnError(this, 'Connection failed', { deviceType });
                  await this.gotoModeSource({ deviceType });
                }
              }, deviceType);
            } catch (err) {
              ConnStatus.setConnError(this, 'BLE error', { deviceType });
              console.error('BLE connection failed:', err);
              alert('Failed to connect to Bluetooth device.');
            }
          }
        );
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'ble-connect', passive: false }
    );
  }

  async gotoModeSource({ deviceType }) {
    const dt = deviceType || this.selectedDeviceType('Duo');
    this.setDeviceType(dt);

    const frag = await this.views.render('mode-source.html', { subtitle: 'Choose how to start' });
    this.dom.set(frag);

    this.dom.onTap(
      '#back-btn',
      async () => {
        const { deviceImg, deviceAlt, instructions } = this.getBleConnectCopy(dt);
        await this.gotoBleConnect({ deviceType: dt, deviceImg, deviceAlt, instructions });
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'ms-back', passive: false }
    );

    // setup the goto editor link
    this.dom.onClick(
      '#skip-to-editor',
      async () => {
        await this.gotoEditor({ deviceType });
      },
      { preventDefault: true }
    );

    this.dom.onTap(
      '#ms-new-mode',
      async () => {
        await this.startNewModeAndEnterEditor(dt);
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'ms-new', passive: false }
    );

    const loadBtn = this.dom.must('#ms-load-device', 'mode-source.html is missing #ms-load-device');
    loadBtn.innerHTML = this.loadActionLabel(dt);

    this.dom.onTap(
      loadBtn,
      async () => {
        if (dt === 'Duo') {
          await this.gotoDuoReceive({ deviceType: dt });
          return;
        }
        await this.pullFromDeviceAndEnterEditor(dt, { source: 'mode-source' });
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'ms-load', passive: false }
    );

    this.dom.onTap(
      '#ms-browse-community',
      async () => {
        await this.gotoCommunityBrowser({ deviceType: dt, backTarget: 'mode-source' });
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'ms-community', passive: false }
    );
  }

  async gotoCommunityBrowser({ deviceType, backTarget = 'mode-source' } = {}) {
    return await this.communityBrowser.gotoCommunityBrowser({ deviceType, backTarget });
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
      if (this._transferInProgress) return;

      let tries = 0;
      while (this.vortexPort.isTransmitting || !this.vortexPort.isActive()) {
        if (tries++ > 10) return;
        await this.sleep(100);
        if (this._transferInProgress) return;
      }
      await this.vortexPort.demoCurMode(this.vortexLib, this.vortex);
    } catch (error) {
      Notification.failure('Failed to demo mode (' + error + ')');
    }
  }

  async demoColorOnDevice(rgbColor) {
    try {
      if (typeof this.vortexPort.demoColor === 'function') {
        await this.vortexPort.demoColor(this.vortexLib, this.vortex, rgbColor);
      } else {
        await this.demoModeOnDevice();
      }
    } catch {
      try {
        await this.demoModeOnDevice();
      } catch {}
    }
  }

  async pullFromDeviceAndEnterEditor(deviceType, { source = 'mode-source', progressEl = null, disableEls = [] } = {}) {
    if (deviceType === 'Duo') {
      await this.gotoDuoReceive({ deviceType });
      return;
    }

    const sel =
      source === 'editor-empty'
        ? { load: '#m-load-from-device', newm: '#m-start-new-mode', browse: '#m-browse-community' }
        : source === 'mode-source'
          ? { load: '#ms-load-device', newm: '#ms-new-mode', browse: '#ms-browse-community' }
          : { load: null, newm: null, browse: null };

    const loadBtn = progressEl || (sel.load ? this.dom.$(sel.load) : null);
    const newBtn = sel.newm ? this.dom.$(sel.newm) : null;
    const browseBtn = sel.browse ? this.dom.$(sel.browse) : null;
    const backBtn = this.dom.$('#back-btn');

    const baseBusyHtml = `<i class="fa-solid fa-spinner fa-spin"></i> Loading modes…`;
    const setBusyHtml = (html) => {
      if (loadBtn) loadBtn.innerHTML = html;
    };

    const ensureActive = () => {
      if (!this.vortexPort?.isActive?.()) {
        Notification.failure?.('Please connect a device first');
        return false;
      }
      return true;
    };

    const pullWithEach = async () => {
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
        else if (p.phase === 'error') str = `Failed.`;

        setBusyHtml(`<i class="fa-solid fa-spinner fa-spin"></i> ${str}`);
      };

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

    const disableList = [newBtn, browseBtn, backBtn, ...disableEls].filter(Boolean);

    // If we don't have a concrete button, just run the operation without dom.busy wrapping.
    const runCore = async () => {
      if (!ensureActive()) return;

      this._transferInProgress = true;
      this._clearModeTimers();

      try {
        this.vortex.clearModes();
        await pullWithEach();

        if ((this.vortex.numModes() | 0) > 0) this.vortex.setCurMode(0, false);

        const total = this.vortex.numModes() | 0;
        setBusyHtml(`<i class="fa-solid fa-check"></i> Done (${total} mode${total === 1 ? '' : 's'})`);

        await this.gotoEditor({ deviceType });
      } catch (err) {
        console.error('[Mobile] Load from device failed:', err);
        Notification.failure?.('Failed to load modes from device');
        try {
          if (loadBtn) loadBtn.innerHTML = this.loadActionLabel(deviceType);
        } catch {}
      } finally {
        this._transferInProgress = false;
      }
    };

    if (!loadBtn) {
      await runCore();
      return;
    }

    await this.dom.busy(loadBtn, baseBusyHtml, runCore, { disable: disableList });
  }

  _getMaxModesForDevice(dt) {
    return this.devices?.[dt]?.maxModes ?? 1;
  }

  _canAddModeForDevice(dt) {
    const max = this._getMaxModesForDevice(dt);
    const cur = this.vortex?.numModes?.() | 0;
    return cur < max;
  }

  _notifyMaxModesReached(dt) {
    const max = this._getMaxModesForDevice(dt);
    Notification.failure?.(`Max modes reached (${max}) for ${dt}`);
  }

  async startNewModeAndEnterEditor(deviceType) {
    const dt = deviceType || this.selectedDeviceType('Duo');
    this.setDeviceType(dt);

    // NEW: always start fresh
    try {
      this.vortex.clearModes();
    } catch {}

    // Max check (technically always ok after clear, but keep consistent)
    const max = this._getMaxModesForDevice(dt);
    if (max <= 0) {
      Notification.failure?.('This device does not support modes');
      return;
    }

    if (!this.vortex.addNewMode(false)) return;

    try {
      this.vortex.setCurMode(0, false);
    } catch {}

    try {
      this._getModes().initCurMode();
      this._getModes().saveCurMode();
    } catch {}

    await this.gotoEditor({ deviceType: dt });
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

    this.dom.onTap(
      '#back-btn',
      async () => {
        if (backTarget === 'editor') await this.gotoEditor({ deviceType: dt });
        else await this.gotoModeSource({ deviceType: dt });
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'duo-rx-back', passive: false }
    );

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

    const hasModes = (this.vortex.numModes() | 0) > 0;

    this._withLightshowPausedSync(() => {
      // too many modes when entering editor?
      const maxModes = this._getMaxModesForDevice(deviceType);
      if (this.vortex.numModes() > maxModes) {
        while (this.vortex.numModes() > maxModes) {
          this.vortex.setCurMode(maxModes, false);
          this.vortex.delCurMode(false);
        }
        this.vortex.setCurMode(maxModes, false);
        try {
          this._getModes().initCurMode();
          this._getModes().saveCurMode();
        } catch {}
        this._afterModeChanged(deviceType, { finalize: false, demo: true });
      }
    });


    const n = this.vortex.numModes();
    const idx = this.vortex.curModeIndex();
    const modeName = hasModes ? `Mode ${idx + 1}` : 'No modes';
    const modeIndexLabel = hasModes ? `${idx + 1} / ${n}` : 'No modes';

    const deviceIcon = this._getDeviceImgFor(dt);

    const frag = await this.views.render('editor.html', {
      deviceType: dt,
      deviceIcon,
      modeName,
      modeIndexLabel,
      emptyDisplay: hasModes ? 'none' : 'grid',
    });

    this.dom.set(frag);

    await ConnStatus.ensureConnStatusOverlay(this, dt);
    ConnStatus.syncConnStatusFromPort(this, dt);

    this._bindEditorTopButtons(dt);

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

    const lc = this.vortex.engine().leds().ledCount() | 0;
    this.effectsPanel.ensureLedSelectionDefaults(lc);

    if (!hasModes) {
      await this.bindEmptyEditorActions(dt);
      return;
    }

    this.bindEditorModeNav(dt);
    this.bindEditorTools(dt);

    await this.startEditorLightshow(dt);
    void this.demoModeOnDevice();
  }

  async bindEmptyEditorActions(dt) {
    this.dom.onTap(
      '#m-start-new-mode',
      async () => {
        await this.startNewModeAndEnterEditor(dt);
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'empty-new', passive: false }
    );

    const loadBtn = this.dom.$('#m-load-from-device');
    if (loadBtn) {
      loadBtn.innerHTML = this.loadActionLabel(dt);
      this.dom.onTap(
        loadBtn,
        async () => {
          if (dt === 'Duo') {
            await this.gotoDuoReceive({ deviceType: dt });
            return;
          }
          await this.pullFromDeviceAndEnterEditor(dt, { source: 'editor-empty' });
        },
        { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'empty-load', passive: false }
      );
    }

    this.dom.onTap(
      '#m-browse-community',
      async () => {
        await this.gotoCommunityBrowser({ deviceType: dt, backTarget: 'editor' });
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'empty-community', passive: false }
    );
  }
  
  _isBtConnected() {
    try {
      // Treat "BT connected" as: VortexPort is using BLE AND isActive()
      return !!(this.vortexPort?.useBLE && this.vortexPort?.isActive?.());
    } catch {
      return false;
    }
  }

  async _disconnectBtWithUi(dtNow) {
    try {
      ConnStatus.setConnStatus(this, {
        status: 'connecting',
        title: dtNow,
        subtitle: 'Disconnecting…',
        deviceType: dtNow,
        error: null,
      });
    } catch {}

    try {
      await this.vortexPort.disconnect();
    } catch (err) {
      console.error('[Mobile] disconnect failed:', err);
      Notification.failure?.('Failed to disconnect');
    } finally {
      try {
        ConnStatus.syncConnStatusFromPort(this, dtNow);
      } catch {}
    }
  }

  _bindEditorTopButtons(dt) {
    const deviceType = dt || this.selectedDeviceType('Duo');

    // -----------------------------
    // Top-left: device select button
    // -----------------------------
    const devBtn = this.dom?.$('#m-editor-device-btn');
    if (devBtn && devBtn.dataset.boundTopLeft !== '1') {
      devBtn.dataset.boundTopLeft = '1';

      this.dom.onTap(
        devBtn,
        async (e) => {
          try {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            e?.stopImmediatePropagation?.();
          } catch {}

          const dtNow = this.selectedDeviceType(deviceType);

          // Prompt if BT is connected
          if (this._isBtConnected()) {
            const ok = window.confirm('Bluetooth is connected. Disconnect Bluetooth and change device?');
            if (!ok) return;

            await this._disconnectBtWithUi(dtNow);
          }

          await this.gotoDeviceSelect();
        },
        { preventDefault: true, swallow: true, lockMs: 250, boundKey: 'editor-top-left', passive: false }
      );
    }

    // -----------------------------
    // Top-right: conn status pill
    // -----------------------------
    const connEl = document.getElementById('m-conn-status');
    if (connEl && connEl.dataset.boundTopRight !== '1') {
      connEl.dataset.boundTopRight = '1';

      connEl.addEventListener(
        'click',
        async (e) => {
          try {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            e?.stopImmediatePropagation?.();
          } catch {}

          // Debounce
          if (connEl.dataset.busy === '1') return;
          connEl.dataset.busy = '1';

          try {
            const dtNow = this.selectedDeviceType(deviceType);

            // If BT connected: prompt to disconnect
            if (this._isBtConnected()) {
              const ok = window.confirm('Disconnect Bluetooth?');
              if (!ok) return;

              await this._disconnectBtWithUi(dtNow);
              return;
            }

            // Not connected: go to BLE connect for selected device
            const { deviceImg, deviceAlt, instructions } = this.getBleConnectCopy(dtNow);
            await this.gotoBleConnect({ deviceType: dtNow, deviceImg, deviceAlt, instructions });
          } finally {
            setTimeout(() => {
              try { connEl.dataset.busy = '0'; } catch {}
            }, 250);
          }
        },
        { passive: false }
      );
    }
  }

  async startEditorLightshow(dt) {
    const canvas = this.dom.must('#mobile-lightshow-canvas', 'editor.html is missing #mobile-lightshow-canvas');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    this.lightshow = new Lightshow(this.vortexLib, this.vortex, canvas);

    const isDuo = dt === 'Duo';
    this.lightshow.updateLayout(false);
    this.lightshow.setDuoEditorMode(isDuo);

    const dev = this.devices?.[dt] || null;
    const preset = dev?.lightshowPresets?.mobile || null;

    const ledCount = dev?.ledCount ?? (isDuo ? 2 : 1);

    // Defaults (match your previous behavior)
    const defaults = {
      shape: dt === 'Spark' ? 'orbit' : 'circle',
      tickRate: 3,
      trailSize: isDuo ? 300 : 120,
      dotSize: 8,
      blurFac: 1,
      circleRadius: 400,
      spread: 45,
      direction: -1,
      orbitSpinMul: -1.0,
    };

    // If we have device preset values, apply them (mobile-only)
    const cfg = preset ? { ...defaults, ...preset } : defaults;

    // Apply numeric fields safely
    Object.assign(this.lightshow, {
      tickRate: cfg.tickRate,
      trailSize: cfg.trailSize,
      dotSize: cfg.dotSize,
      blurFac: cfg.blurFac,
      circleRadius: cfg.circleRadius,
      spread: cfg.spread,
      direction: cfg.direction,
      orbitSpinMul: cfg.orbitSpinMul,
    });

    this.lightshow.setLedCount(ledCount);

    // Shape is behavior, not just a number
    this.lightshow.setShape(cfg.shape || defaults.shape);

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
    const idxEl  = this._findFirst(['#m-mode-index', '#mode-index-label', '[data-role="mode-index"]']);

    if (nameEl) nameEl.textContent = modeName;
    if (idxEl) idxEl.textContent = modeIndexLabel;

    const carouselValueEl = this.dom?.$?.('.m-carousel-value') || document.querySelector('.m-carousel-value');
    if (carouselValueEl) carouselValueEl.textContent = modeIndexLabel;

    // optional: if you ever want the title to show the current mode name
    // const carouselTitleEl = this.dom?.$?.('.m-carousel-title') || document.querySelector('.m-carousel-title');
    // if (carouselTitleEl) carouselTitleEl.textContent = modeName;

    const modeTitleEl = this._findFirst(['#m-mode-title', '[data-role="mode-title"]']);
    if (modeTitleEl) {
      try { modeTitleEl.textContent = this.vortex.getModeName(); } catch {}
    }

    return !!(nameEl || idxEl || modeTitleEl || carouselValueEl);
  }

  async _afterModeChanged(dt, { allowRerenderFallback = true, finalize = true, demo = true } = {}) {
    const updated = this._updateModeHeaderUI();
    if (finalize) this._scheduleModeFinalize(120);
    if (demo) this._scheduleModeDemo(160);

    if (!updated && allowRerenderFallback) {
      await this.gotoEditor({ deviceType: dt });
    }
  }

  async _navigateMode(dt, dir) {
    const n = this.vortex.numModes() | 0;
    if (n <= 0) return;

    const cur = this.vortex.curModeIndex() | 0;

    let next = cur + (dir > 0 ? 1 : -1);
    if (next < 0) next = n - 1;
    else if (next >= n) next = 0;

    try {
      this.vortex.setCurMode(next >>> 0, false);
    } catch (e) {
      console.error('[Mobile] setCurMode failed:', e);
      return;
    }

    await this._afterModeChanged(dt, { allowRerenderFallback: false, finalize: false, demo: true });
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

    try {
      const max = this._getMaxModesForDevice(this.selectedDeviceType('Duo'));
      const cur = this.vortex?.numModes?.() | 0;
      const atMax = cur >= max;

      addBtn.disabled = atMax;
      addBtn.title = atMax ? `Max modes reached (${max})` : 'Add mode';
    } catch {}

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
    const swipeTarget =
      this.dom.$('#mobile-lightshow-canvas') || this.dom.$('.m-editor-stage') || this.dom.$('#mobile-app-root');

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

      if (state.lockedAxis === 'x') {
        if (!state.captured) {
          state.captured = true;
          try {
            swipeTarget.setPointerCapture?.(e.pointerId);
          } catch {}
        }
        try {
          e.preventDefault?.();
        } catch {}
      }
    };

    const onUp = async (e) => {
      if (!state.active) return;
      if (e.pointerId !== state.pointerId) return;

      const dx = state.lastX - state.startX;
      const dy = state.lastY - state.startY;

      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      const wasSwipe = state.captured && adx >= 55 && adx >= ady * 1.3;

      reset();

      if (!wasSwipe) return;
      try {
        e.preventDefault?.();
      } catch {}

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
    const deviceType = dt || this.selectedDeviceType('Duo');
    const max = this._getMaxModesForDevice(deviceType);

    if (!this._canAddModeForDevice(deviceType)) {
      this._notifyMaxModesReached(deviceType);
      return;
    }

    const before = this.vortex.numModes() | 0;
    this._clearModeTimers();

    try {
      this._withLightshowPausedSync(() => {
        if (!this.vortex.addNewMode(false)) {
          throw new Error('addNewMode returned false');
        }
        this.vortex.setCurMode(this.vortex.numModes() - 1, false);
        try {
          this._getModes().initCurMode();
          this._getModes().saveCurMode();
        } catch {}
      });
    } catch (e) {
      console.error('[Mobile] add mode failed:', e);
      Notification.failure?.(String(e?.message || 'Failed to add mode'));
      void this._restartLightshowAndDemo(deviceType);
      return;
    }

    Notification.success?.('Added mode');
    await this._afterModeChanged(deviceType, { finalize: false, demo: true });
    void this._restartLightshowAndDemo(deviceType);
  }

  async _deleteModeInEditor(dt) {
    const n = this.vortex.numModes() | 0;
    if (n <= 1) {
      Notification.failure?.('Mode 1 cannot be deleted');
      return;
    }
    const idx = this.vortex.curModeIndex() | 0;
    if (idx >= n) {
      idx = n - 1;
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

          try {
            this.vortex.setCurMode(newIdx >>> 0, false);
          } catch {}

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

    await this._afterModeChanged(dt, { finalize: false, demo: true });
    void this._restartLightshowAndDemo(dt);
  }

  _requireActivePort() {
    if (!this.vortexPort?.isActive?.()) {
      Notification.failure('Please connect a device first');
      return false;
    }
    return true;
  }

  bindEditorModeNav(dt) {
    this._ensureModeCrudButtonsExist();
    this._bindModeSwipe(dt);

    const prev = this.dom.$('#mode-prev');
    const next = this.dom.$('#mode-next');
    const addBtn = this.dom.$('#mode-add');
    const delBtn = this.dom.$('#mode-delete');

    this.dom.onTap(
      prev,
      async () => {
        await this._navigateMode(dt, -1);
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'mode-nav', passive: false }
    );

    this.dom.onTap(
      next,
      async () => {
        await this._navigateMode(dt, +1);
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'mode-nav', passive: false }
    );

    this.dom.onTap(
      addBtn,
      async () => {
        await this._addModeInEditor(dt);
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'mode-nav', passive: false }
    );

    this.dom.onTap(
      delBtn,
      async () => {
        await this._deleteModeInEditor(dt);
      },
      { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'mode-nav', passive: false }
    );

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

    const handleTool = async (btn) => {
      const isDisabled = !!toolsEl?.classList.contains('m-editor-disabled');
      if (isDisabled) return;

      const tool = String(btn.dataset.tool || '');

      if (tool === 'effects') {
        if (this.effectsPanel.isOpen()) this.effectsPanel.close();
        else await this.openEffectsPanel(dt);
        return;
      }

      if (tool === 'transfer') {
        if (!this.vortexPort?.isActive?.()) {
          Notification.failure('Connect a device to transfer modes');
          return;
        }
        await this._showTransferModal(dt);
        return;
      }

      if (tool === 'community') {
        await this.gotoCommunityBrowser({ deviceType: dt, backTarget: 'editor' });
        return;
      }

      if (tool === 'settings') {
        await this.settingsModal.show(dt);
        return;
      }
    };

    this.dom.all('[data-tool]').forEach((btn) => {
      this.dom.onTap(
        btn,
        async () => {
          await handleTool(btn);
        },
        { preventDefault: true, swallow: true, lockMs: 350, boundKey: 'editor-tool', passive: false }
      );
    });
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
        dt === 'Duo' ? 'Use the Chromadeck to send or receive modes from the Duo.' : 'Pull/push modes directly over BLE.';
    }

    if (pullBtn) {
      pullBtn.disabled = false;
      pullBtn.innerHTML = `<i class="fa-solid fa-download me-2"></i> ${dt === 'Duo' ? 'Load from Duo' : 'Load from device'}`;
    }

    if (pushBtn) {
      const hasModes = (this.vortex?.numModes?.() | 0) > 0;
      pushBtn.disabled = !hasModes;
      pushBtn.innerHTML = `<i class="fa-solid fa-upload me-2"></i> ${dt === 'Duo' ? 'Save to Duo' : 'Save to device'}`;
    }

    if (modal.dataset.bound !== '1') {
      modal.dataset.bound = '1';

      const swallow = (e) => {
        try {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          e?.stopImmediatePropagation?.();
        } catch {}
      };

      const onPull = async (e) => {
        swallow(e);
        if (modal.dataset.xferRunning === '1') return;

        const dtNow = String(modal.dataset.device || dt || this.selectedDeviceType('Duo'));
        if (!this._requireActivePort()) return;

        modal.dataset.xferRunning = '1';

        try {
          if (dtNow === 'Duo') {
            await this._hideTransferModal();
            await this.gotoDuoReceive({ deviceType: 'Duo', preserveModes: true, backTarget: 'editor' });
            return;
          }

          // Keep modal open while pulling so progress shows in the button.
          if (pullBtn) pullBtn.disabled = true;
          if (pushBtn) pushBtn.disabled = true;

          await this.pullFromDeviceAndEnterEditor(dtNow, {
            source: 'transfer-modal',
            progressEl: pullBtn,
            disableEls: [pushBtn],
          });

          // After pull flow completes (success or fail), close the modal if we're still on editor.
          await this._hideTransferModal();
        } finally {
          modal.dataset.xferRunning = '0';
          try {
            await this._configureTransferModalForDevice(this.selectedDeviceType('Duo'));
          } catch {}
        }
      };

      const onPush = async (e) => {
        swallow(e);
        if (modal.dataset.xferRunning === '1') return;

        const dtNow = String(modal.dataset.device || dt || this.selectedDeviceType('Duo'));
        if (!this._requireActivePort()) return;

        const hasModes = (this.vortex?.numModes?.() | 0) > 0;
        if (!hasModes) return;

        modal.dataset.xferRunning = '1';

        const prePushModeIdx = (this.vortex?.curModeIndex?.() ?? 0) | 0;

        const origPushHtml = pushBtn?.innerHTML || '';
        const origPullHtml = pullBtn?.innerHTML || '';

        const setPushHtml = (html) => {
          if (pushBtn) pushBtn.innerHTML = html;
        };

        // Throttle DOM updates
        let pending = null;
        let rafScheduled = false;
        const flush = () => {
          rafScheduled = false;
          if (!pending) return;
          const html = pending;
          pending = null;
          try {
            setPushHtml(html);
          } catch {}
        };
        const schedulePushHtml = (html) => {
          pending = html;
          if (rafScheduled) return;
          rafScheduled = true;
          requestAnimationFrame(flush);
        };

        const disableBtns = (v) => {
          try {
            if (pullBtn) pullBtn.disabled = !!v;
            if (pushBtn) pushBtn.disabled = !!v;
          } catch {}
        };

        try {
          if (dtNow === 'Duo') {
            await this._hideTransferModal();
            await this.gotoDuoSend({ deviceType: 'Duo', backTarget: 'editor' });
            return;
          }

          // Prevent demos/timers from interfering
          this._transferInProgress = true;
          try {
            this._clearModeTimers?.();
          } catch {}

          // Make sure current mode is saved before pushing
          try {
            this._getModes().initCurMode();
            this._getModes().saveCurMode();
          } catch {}

          disableBtns(true);
          schedulePushHtml(`<i class="fa-solid fa-spinner fa-spin me-2"></i> Saving…`);
          flush();

          // Real watchdog that can actually fail the await by racing it
          const watchdogMs = 15000;
          let watchdogTimer = null;
          const bump = () => {
            if (watchdogTimer) clearTimeout(watchdogTimer);
            watchdogTimer = setTimeout(async () => {
              try {
                schedulePushHtml(`<i class="fa-solid fa-triangle-exclamation me-2"></i> Timed out`);
                flush();
              } catch {}

              // best-effort “unstick”
              try {
                if (typeof this.vortexPort.cancelPush === 'function') await this.vortexPort.cancelPush();
                else if (typeof this.vortexPort.cancelReading === 'function') await this.vortexPort.cancelReading();
                else if (typeof this.vortexPort.disconnect === 'function') await this.vortexPort.disconnect();
              } catch {}

              throw new Error('pushEachToDevice watchdog timeout');
            }, watchdogMs);
          };

          const watchdogPromise = new Promise((_, reject) => {
            bump();
            // The throw inside setTimeout won’t reject this promise, so we reject by trapping errors:
            // We do that by wrapping bump() timer callback logic above with reject here instead:
            if (watchdogTimer) clearTimeout(watchdogTimer);
            watchdogTimer = setTimeout(async () => {
              try {
                schedulePushHtml(`<i class="fa-solid fa-triangle-exclamation me-2"></i> Timed out`);
                flush();
              } catch {}

              try {
                if (typeof this.vortexPort.cancelPush === 'function') await this.vortexPort.cancelPush();
                else if (typeof this.vortexPort.cancelReading === 'function') await this.vortexPort.cancelReading();
                else if (typeof this.vortexPort.disconnect === 'function') await this.vortexPort.disconnect();
              } catch {}

              reject(new Error('pushEachToDevice watchdog timeout'));
            }, watchdogMs);
          });

          const progressCb = (o) => {
            try {
              bump();
            } catch {}

            const phase = String(o?.phase || '');
            const total = (o?.total ?? 0) | 0;
            const idx = (o?.index ?? 0) | 0;
            const i1 = idx + 1;

            if (phase === 'start') schedulePushHtml(`<i class="fa-solid fa-spinner fa-spin me-2"></i> Saving…`);
            else if (phase === 'count')
              schedulePushHtml(
                `<i class="fa-solid fa-spinner fa-spin me-2"></i> Saving… ${total > 0 ? `(0 / ${total})` : ''}`
              );
            else if (phase === 'pushing')
              schedulePushHtml(
                `<i class="fa-solid fa-spinner fa-spin me-2"></i> Saving… ${total > 0 ? `(${i1} / ${total})` : `(${i1})`}`
              );
            else if (phase === 'finalizing') schedulePushHtml(`<i class="fa-solid fa-spinner fa-spin me-2"></i> Finalizing…`);
            else if (phase === 'done')
              schedulePushHtml(`<i class="fa-solid fa-check me-2"></i> Saved${total > 0 ? ` (${total})` : ''}`);
            else if (phase === 'error') schedulePushHtml(`<i class="fa-solid fa-triangle-exclamation me-2"></i> Failed`);
          };

          const pushPromise = this.vortexPort.pushEachToDevice(this.vortexLib, this.vortex, progressCb);

          try {
            await Promise.race([pushPromise, watchdogPromise]);
          } finally {
            if (watchdogTimer) {
              clearTimeout(watchdogTimer);
              watchdogTimer = null;
            }
            try {
              flush();
            } catch {}
          }

          // Restore mode index (push flow can reset to mode 0)
          this.vortex.setCurMode(prePushModeIdx, false);
          // Now demo the mode we were on before pushing
          await this.demoModeOnDevice();

          // Success: brief terminal state, then close modal
          Notification.success?.('Saved to device');
          await this.sleep?.(250);
          await this._hideTransferModal();
        } catch (err) {
          console.error('[Mobile] Save to device failed:', err);
          Notification.failure?.('Failed to save to device');

          // Keep modal open so user can see failure state
          schedulePushHtml(`<i class="fa-solid fa-triangle-exclamation me-2"></i> Save failed`);
          flush();
        } finally {
          this._transferInProgress = false;

          disableBtns(false);
          modal.dataset.xferRunning = '0';

          // Restore button labels for the current device
          try {
            if (pullBtn) pullBtn.innerHTML = origPullHtml || pullBtn.innerHTML;
            if (pushBtn) pushBtn.innerHTML = origPushHtml || pushBtn.innerHTML;
            await this._configureTransferModalForDevice(this.selectedDeviceType('Duo'));
          } catch {}
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
        try {
          modalEl.removeEventListener('hidden.bs.modal', finish);
        } catch {}
        resolve();
      };

      try {
        modalEl.addEventListener('hidden.bs.modal', finish, { once: true });
      } catch {}

      try {
        inst.hide();
      } catch {
        finish();
      }
      setTimeout(finish, 700);
    });
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
      doneBtn.addEventListener(
        'click',
        async (e) => {
          try {
            e?.preventDefault?.();
            e?.stopPropagation?.();
          } catch {}
          this._stopDuoTransmitLoop();
          if (backTarget === 'editor') await this.gotoEditor({ deviceType: dt });
          else await this.gotoModeSource({ deviceType: dt });
        },
        { passive: false }
      );
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
      try {
        statusEl?.classList.add('is-error');
      } catch {}
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

  // -----------------------------
  // Engine helpers
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

  // -----------------------------
  // Effects panel (delegated to ColorPicker)
  // -----------------------------

  async openEffectsPanel(dt) {
    const deviceType = dt || this.selectedDeviceType('Duo');

    await this.effectsPanel.openForCurrentMode({ deviceType, title: 'Effects' });
  }
}

/* -----------------------------
   Entry Point
----------------------------- */
async function boot() {
  try {
    const vortexLib = await VortexLib();
    const editor = new VortexEditorMobile(vortexLib);
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
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      boot();
    },
    { once: true }
  );
})();

