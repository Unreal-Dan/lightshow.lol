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

    this._engine = null;
    this._modes = null;

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

    this._transferModalEl = null;
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
    if (!res.ok) {
      throw new Error(`Failed to load devices JSON (${res.status} ${res.statusText}): ${devicesUrl}`);
    }
    this.devices = await res.json();

    this.effectsPanel.mount(document.body);

    await this.gotoDeviceSelect();
  }

  setDeviceType(type) { this.deviceType = type; }

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

  stopEditorLightshow() {
    if (!this.lightshow) return;
    try { this.lightshow.stop(); } catch {}
    this.lightshow = null;
  }

  clearEditorResizeHandler() {
    if (!this._editorResizeHandler) return;
    window.removeEventListener('resize', this._editorResizeHandler);
    this._editorResizeHandler = null;
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
    return `<i class="fa-solid fa-upload"></i> Load modes from device`;
  }

  selectedDeviceType(fallback = 'Duo') { return this.deviceType || fallback; }

  updateDeviceSelectUI() {
    const selected = this.deviceType;
    this.dom.all('[data-device]').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.device === selected);
    });
  }

  async gotoDeviceSelect() {
    // skip to editor
      //return await this.gotoEditor({ deviceType: 'Duo' });

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
      await this.gotoEditor({ deviceType: 'Duo' });
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
    const frag = await this.views.render('mode-source.html', { subtitle: 'Choose how to start' });
    this.dom.set(frag);

    this.dom.onClick('#back-btn', async () => {
      const { deviceImg, deviceAlt, instructions } = this.getBleConnectCopy(deviceType);
      await this.gotoBleConnect({ deviceType, deviceImg, deviceAlt, instructions });
    });

    this.dom.onClick('#ms-new-mode', async () => { await this.startNewModeAndEnterEditor(deviceType); });

    const loadBtn = this.dom.must('#ms-load-device', 'mode-source.html is missing #ms-load-device');
    loadBtn.innerHTML = this.loadActionLabel(deviceType);

    this.dom.onClick(loadBtn, async () => {
      if (deviceType === 'Duo') {
        await this.gotoDuoReceive({ deviceType });
        return;
      }
      await this.pullFromDeviceAndEnterEditor(deviceType, { source: 'mode-source' });
    });

    this.dom.onClick('#ms-browse-community', async () => {
      console.log('[Mobile] Browse Community');
      await this.gotoEditor({ deviceType });
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
    const sel =
      source === 'editor-empty'
        ? { load: '#m-load-from-device', newm: '#m-start-new-mode', browse: '#m-browse-community' }
        : { load: '#ms-load-device', newm: '#ms-new-mode', browse: '#ms-browse-community' };

    const loadBtn = this.dom.$(sel.load);
    const newBtn = this.dom.$(sel.newm);
    const browseBtn = this.dom.$(sel.browse);
    const backBtn = this.dom.$('#back-btn');

    const baseBusyHtml = `<i class="fa-solid fa-spinner fa-spin"></i> Loading modes…`;
    const setBusyHtml = (html) => { if (loadBtn) loadBtn.innerHTML = html; };

    await this.dom.busy(
      loadBtn,
      baseBusyHtml,
      async () => {
        try {
          this.vortex.clearModes();

          await this.vortexPort.pullEachFromDevice(this.vortexLib, this.vortex, (p) => {
            if (!p || typeof p !== 'object') return;
            const total = Number(p.total ?? 0);
            const i = Number(p.index ?? 0) + 1;
            let str = ` Loading modes…`;
            if (p.phase === 'count') str = ` Loading modes… (0 / ${total})`;
            else if (p.phase === 'pulling') str = ` Pulling mode ${i} / ${total}…`;
            else if (p.phase === 'finalizing') str = ` Finalizing… (${total} modes)`;
            else if (p.phase === 'done') str = ` Done (${total} modes)`;
            setBusyHtml(`<i class="fa-solid fa-spinner fa-spin"></i> ${str}`);
          });

          if (this.vortex.numModes() > 0) this.vortex.setCurMode(0, false);
          await this.gotoEditor({ deviceType });
        } catch (err) {
          console.error('[Mobile] Pull from device failed:', err);
          Notification.failure('Failed to load modes from device');
        }
      },
      { disable: [newBtn, browseBtn, backBtn] }
    );
  }

  async startNewModeAndEnterEditor(deviceType) {
    const before = this.vortex.numModes();
    if (!this.vortex.addNewMode(false)) return;

    this.vortex.setCurMode(before, false);
    const cur = this._getCurMode();
    if (cur) cur.init();
    this._getModes().saveCurMode();

    await this.gotoEditor({ deviceType });
  }

  async gotoDuoReceive({ deviceType }) {
    const copy = {
      title: 'Listening for Duo…',
      body: "Point the Duo at the Chromadeck's buttons and send the mode.  The Chromadeck is listening.",
      status: 'Starting…',
    };

    const frag = await this.views.render('duo-mode-receive.html', copy);
    this.dom.set(frag);

    this.dom.onClick('#back-btn', async () => { await this.gotoModeSource({ deviceType }); });

    const statusEl = this.dom.$('#duo-rx-status');
    const statusTextEl = this.dom.$('#duo-rx-status-text');
    const bodyEl = this.dom.$('#duo-rx-body');

    try {
      if (statusTextEl) statusTextEl.textContent = 'Listening…';
      this.vortex.clearModes();
      await this.listenVL();
      if (statusTextEl) statusTextEl.textContent = 'Received. Opening editor…';
      await this.gotoEditor({ deviceType });
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
    const hasModes = this.vortex.numModes() > 0;

    const modeName = hasModes ? `Mode ${this._getModes().curModeIndex() + 1}` : 'No modes';
    const modeIndexLabel = hasModes
      ? `${this._getModes().curModeIndex() + 1} / ${this.vortex.numModes()}`
      : 'No modes';

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

    await this.startEditorLightshow(dt);
    await this.demoModeOnDevice();

    this.bindEditorModeNav(dt);
    this.bindEditorTools(dt);
  }

  async bindEmptyEditorActions(dt) {
    this.dom.onClick('#m-start-new-mode', async () => {
      const before = this.vortex.numModes();
      if (!this.vortex.addNewMode(false)) return;
      this.vortex.setCurMode(before, false);
      const cur = this._getCurMode();
      if (cur) cur.init();
      this._getModes().saveCurMode();
      await this.gotoEditor({ deviceType: dt });
    });

    const loadBtn = this.dom.$('#m-load-from-device');
    if (loadBtn) {
      loadBtn.innerHTML = this.loadActionLabel(dt);
      this.dom.onClick(loadBtn, async () => {
        if (dt === 'Duo') await this.gotoDuoReceive({ deviceType: dt });
        else await this.pullFromDeviceAndEnterEditor(dt, { source: 'editor-empty' });
      });
    }

    this.dom.onClick('#m-browse-community', async () => { console.log('[Mobile] Browse Community'); });
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
      tickRate: 3,
      trailSize: isDuo ? 300 : 220,
      dotSize: isDuo ? 15 : 13,
      blurFac: 1,
      circleRadius: isDuo ? 180 : 160,
      spread: 50,
      direction: -1,
    });

    this.lightshow.setLedCount(ledCount);
    this.lightshow.setShape('circle');
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

  bindEditorModeNav(dt) {
    const rerender = async () => { await this.gotoEditor({ deviceType: dt }); };

    const prev = this.dom.$('#mode-prev');
    const next = this.dom.$('#mode-next');

    if (prev) {
      prev.addEventListener('click', async () => {
        const curIdx = this._getModes().curModeIndex();
        const n = this.vortex.numModes();
        const nextIdx = (curIdx - 1 + n) % n;
        this.vortex.setCurMode(nextIdx, true);
        await rerender();
      });
    }

    if (next) {
      next.addEventListener('click', async () => {
        const curIdx = this._getModes().curModeIndex();
        const n = this.vortex.numModes();
        const nextIdx = (curIdx + 1) % n;
        this.vortex.setCurMode(nextIdx, true);
        await rerender();
      });
    }
  }

  // -----------------------------

  _requireActivePort() {
    if (!this.vortexPort?.isActive?.()) {
      Notification.failure('Please connect a device first');
      return false;
    }
    return true;
  }

  _callVortexPortMethod(names, ...args) {
    const list = Array.isArray(names) ? names : [names];
    for (const n of list) {
      const fn = this.vortexPort?.[n];
      if (typeof fn === 'function') return fn.apply(this.vortexPort, args);
    }
    const msg = `VortexPort missing method(s): ${list.join(', ')}`;
    throw new Error(msg);
  }

  _ensureTransferModal() {
    if (this._transferModalEl && document.body.contains(this._transferModalEl)) return this._transferModalEl;

    const existing = document.getElementById('m-transfer-modal');
    if (existing) {
      this._transferModalEl = existing;
      return existing;
    }

    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'm-transfer-modal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-hidden', 'true');

    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="m-transfer-title">Device Transfer</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>

          <div class="modal-body">
            <div class="text-secondary mb-2" id="m-transfer-subtitle" style="font-size: 0.95rem;">
              Push or pull modes with the connected device.
            </div>

            <div class="d-grid gap-2">
              <button id="m-transfer-pull" type="button" class="btn btn-primary">
                <i class="fa-solid fa-download me-2"></i>
                Pull
              </button>

              <button id="m-transfer-push" type="button" class="btn btn-secondary">
                <i class="fa-solid fa-upload me-2"></i>
                Push
              </button>
            </div>

            <div class="text-secondary mt-3" id="m-transfer-footnote" style="font-size: 0.9rem; line-height: 1.25;">
              Duo: Pull listens for a single mode (VLTransfer). Push sends the current mode (VLTransfer).
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this._transferModalEl = modal;
    return modal;
  }

  _configureTransferModalForDevice(dt) {
    const modal = this._ensureTransferModal();

    const titleEl = modal.querySelector('#m-transfer-title');
    const subtitleEl = modal.querySelector('#m-transfer-subtitle');
    const footEl = modal.querySelector('#m-transfer-footnote');
    const pullBtn = modal.querySelector('#m-transfer-pull');
    const pushBtn = modal.querySelector('#m-transfer-push');

    if (titleEl) titleEl.textContent = dt === 'Duo' ? 'Duo Transfer' : 'Device Transfer';

    if (subtitleEl) {
      if (dt === 'Duo') subtitleEl.textContent = 'Transfer a single mode via VLTransfer.';
      else subtitleEl.textContent = 'Pull modes from the device or push your current modes to it.';
    }

    if (footEl) {
      if (dt === 'Duo') {
        footEl.textContent = 'Pull listens for a single mode (VLTransfer). Push sends the current mode (VLTransfer).';
      } else {
        footEl.textContent = 'Pull replaces your current modes with the device modes. Push sends your current modes to the device.';
      }
    }

    if (pullBtn) {
      pullBtn.disabled = false;
      pullBtn.innerHTML = `<i class="fa-solid fa-download me-2"></i> ${dt === 'Duo' ? 'Pull from Duo' : 'Pull from device'}`;
    }

    if (pushBtn) {
      const hasModes = this.vortex?.numModes?.() > 0;
      pushBtn.disabled = !hasModes;
      pushBtn.innerHTML = `<i class="fa-solid fa-upload me-2"></i> ${dt === 'Duo' ? 'Push to Duo' : 'Push to device'}`;
    }

    if (modal.dataset.bound !== '1') {
      modal.dataset.bound = '1';

      const onPull = async (e) => {
        try {
          e?.preventDefault?.();
          e?.stopPropagation?.();
        } catch {}

        const dt2 = this.selectedDeviceType('Duo');
        if (!this._requireActivePort()) return;

        const pullBtn2 = modal.querySelector('#m-transfer-pull');
        const pushBtn2 = modal.querySelector('#m-transfer-push');

        await this.dom.busy(
          pullBtn2,
          `<i class="fa-solid fa-spinner fa-spin me-2"></i> Pulling…`,
          async () => {
            if (dt2 === 'Duo') {
              await this._pullSingleModeFromDuoInEditor(pullBtn2, pushBtn2);
            } else {
              await this._pullModesFromDeviceInEditor(dt2, pullBtn2, pushBtn2);
            }
          },
          { disable: [pushBtn2] }
        );
      };

      const onPush = async (e) => {
        try {
          e?.preventDefault?.();
          e?.stopPropagation?.();
        } catch {}

        const dt2 = this.selectedDeviceType('Duo');
        if (!this._requireActivePort()) return;

        const pullBtn2 = modal.querySelector('#m-transfer-pull');
        const pushBtn2 = modal.querySelector('#m-transfer-push');
        if (!pushBtn2 || pushBtn2.disabled) return;

        await this.dom.busy(
          pushBtn2,
          `<i class="fa-solid fa-spinner fa-spin me-2"></i> Pushing…`,
          async () => {
            if (dt2 === 'Duo') {
              await this._pushSingleModeToDuoInEditor(pullBtn2, pushBtn2);
            } else {
              await this._pushModesToDeviceInEditor(dt2, pullBtn2, pushBtn2);
            }
          },
          { disable: [pullBtn2] }
        );
      };

      modal.querySelector('#m-transfer-pull')?.addEventListener('click', onPull, { passive: false });
      modal.querySelector('#m-transfer-push')?.addEventListener('click', onPush, { passive: false });
    }

    return modal;
  }

  _showTransferModal(dt) {
    const modalEl = this._configureTransferModalForDevice(dt);

    if (!window.bootstrap || !window.bootstrap.Modal) {
      Notification.failure('Bootstrap modal is unavailable');
      return;
    }

    const inst = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    inst.show();
  }

  async _hideTransferModal() {
    const modalEl = this._ensureTransferModal();
    if (!window.bootstrap || !window.bootstrap.Modal) return;
    const inst = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    inst.hide();
  }

  async _pullSingleModeFromDuoInEditor(pullBtn, pushBtn) {
    try {
      await this._hideTransferModal();

      this.vortex.clearModes();

      // VLTransfer pull: listen for one mode
      await this.listenVL();

      if (this.vortex.numModes() > 0) this.vortex.setCurMode(0, false);

      await this.gotoEditor({ deviceType: 'Duo' });

      // Optional: let the user know
      if (Notification.success) Notification.success('Pulled mode from Duo');
    } catch (err) {
      console.error('[Mobile] Duo pull failed:', err);
      Notification.failure('Failed to pull mode from Duo');
      try {
        // restore button labels on failure
        this._configureTransferModalForDevice(this.selectedDeviceType('Duo'));
      } catch {}
    } finally {
      try {
        // re-enable push if we now have modes
        const hasModes = this.vortex.numModes() > 0;
        if (pushBtn) pushBtn.disabled = !hasModes;
        if (pullBtn) pullBtn.disabled = false;
      } catch {}
    }
  }

  async _pushSingleModeToDuoInEditor(pullBtn, pushBtn) {
    try {
      const hasModes = this.vortex.numModes() > 0;
      if (!hasModes) {
        Notification.failure('No mode to push');
        return;
      }

      // Make sure current mode is saved/initialized before transmit
      try {
        const cur = this._getCurMode();
        if (cur) cur.init();
        this._getModes().saveCurMode();
      } catch {}

      // VLTransfer push: transmit current mode
      this._callVortexPortMethod(
        ['transmitVL', 'transmitCurMode', 'transmitCurModeVL', 'sendVL', 'sendCurMode'],
        this.vortexLib,
        this.vortex,
        (p) => {
          try {
            if (!p || typeof p !== 'object') return;
            const phase = String(p.phase || '');
            if (phase === 'sending') {
              const pct = Number(p.pct ?? -1);
              if (pushBtn) {
                pushBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-2"></i> Sending${pct >= 0 ? `… ${Math.round(pct)}%` : '…'}`;
              }
            }
          } catch {}
        }
      );

      await this._hideTransferModal();

      if (Notification.success) Notification.success('Pushed mode to Duo');
    } catch (err) {
      console.error('[Mobile] Duo push failed:', err);
      Notification.failure('Failed to push mode to Duo');
      try { this._configureTransferModalForDevice(this.selectedDeviceType('Duo')); } catch {}
    } finally {
      try {
        if (pullBtn) pullBtn.disabled = false;
        if (pushBtn) pushBtn.disabled = !(this.vortex.numModes() > 0);
      } catch {}
    }
  }

  async _pullModesFromDeviceInEditor(dt, pullBtn, pushBtn) {
    try {
      await this._hideTransferModal();

      this.vortex.clearModes();

      await this.vortexPort.pullEachFromDevice(this.vortexLib, this.vortex, (p) => {
        if (!p || typeof p !== 'object') return;
        const total = Number(p.total ?? 0);
        const i = Number(p.index ?? 0) + 1;

        let str = `Pulling…`;
        if (p.phase === 'count') str = `Counting… (0 / ${total})`;
        else if (p.phase === 'pulling') str = `Pulling mode ${i} / ${total}…`;
        else if (p.phase === 'finalizing') str = `Finalizing… (${total} modes)`;
        else if (p.phase === 'done') str = `Done (${total} modes)`;

        if (pullBtn) pullBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-2"></i> ${str}`;
      });

      if (this.vortex.numModes() > 0) this.vortex.setCurMode(0, false);
      await this.gotoEditor({ deviceType: dt });

      if (Notification.success) Notification.success('Pulled modes from device');
    } catch (err) {
      console.error('[Mobile] Pull from device failed:', err);
      Notification.failure('Failed to pull modes from device');
      try { this._configureTransferModalForDevice(this.selectedDeviceType('Duo')); } catch {}
    } finally {
      try {
        if (pullBtn) pullBtn.disabled = false;
        if (pushBtn) pushBtn.disabled = !(this.vortex.numModes() > 0);
      } catch {}
    }
  }

  async _pushModesToDeviceInEditor(dt, pullBtn, pushBtn) {
    try {
      const hasModes = this.vortex.numModes() > 0;
      if (!hasModes) {
        Notification.failure('No modes to push');
        return;
      }

      // Make sure current mode is saved/initialized before transmit
      try {
        const cur = this._getCurMode();
        if (cur) cur.init();
        this._getModes().saveCurMode();
      } catch {}

      // Try a few likely VortexPort method names (extra args are safe in JS)
      const pushFnNames = [
        'pushEachToDevice',
        'pushAllToDevice',
        'pushModesToDevice',
        'pushToDevice',
      ];

      this._callVortexPortMethod(
        pushFnNames,
        this.vortexLib,
        this.vortex,
        (p) => {
          try {
            if (!p || typeof p !== 'object') return;
            const total = Number(p.total ?? 0);
            const i = Number(p.index ?? 0) + 1;

            let str = `Pushing…`;
            if (p.phase === 'count') str = `Counting… (0 / ${total})`;
            else if (p.phase === 'pushing') str = `Pushing mode ${i} / ${total}…`;
            else if (p.phase === 'finalizing') str = `Finalizing… (${total} modes)`;
            else if (p.phase === 'done') str = `Done (${total} modes)`;

            if (pushBtn) pushBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-2"></i> ${str}`;
          } catch {}
        }
      );

      await this._hideTransferModal();

      if (Notification.success) Notification.success('Pushed modes to device');
    } catch (err) {
      console.error('[Mobile] Push to device failed:', err);
      Notification.failure('Failed to push modes to device');
      try { this._configureTransferModalForDevice(this.selectedDeviceType('Duo')); } catch {}
    } finally {
      try {
        if (pullBtn) pullBtn.disabled = false;
        if (pushBtn) pushBtn.disabled = !(this.vortex.numModes() > 0);
      } catch {}
    }
  }

  bindEditorTools(dt) {
    const toolsEl = this.dom.$('.m-editor-tools');

    const handleTool = async (btn, e) => {
      try {
        e?.preventDefault?.();
        e?.stopPropagation?.();
      } catch {}

      const isDisabled = !!toolsEl?.classList.contains('m-editor-disabled');
      if (isDisabled) return;

      const tool = String(btn.dataset.tool || '');

      if (tool === 'effects') {
        if (this.effectsPanel.isOpen()) {
          this.effectsPanel.close();
        } else {
          await this.openEffectsPanel(dt);
        }
        return;
      }

      // NEW: transfer tool (push/pull modal)
      if (tool === 'transfer') {
        if (!this._requireActivePort()) return;
        this._showTransferModal(dt);
        return;
      }

      console.log('[Mobile Editor] tool:', tool);
    };

    this.dom.all('[data-tool]').forEach((btn) => {
      // Remove any possible click delay path; pointerup is the tap.
      btn.addEventListener(
        'pointerup',
        async (e) => {
          // ignore mouse; desktop clicking can still go through click if you want
          if (e && e.pointerType === 'mouse') return;
          await handleTool(btn, e);
        },
        { passive: false }
      );

      // Fallback for browsers without pointer events (rare)
      btn.addEventListener(
        'click',
        async (e) => {
          await handleTool(btn, e);
        },
        { passive: false }
      );
    });
  }

  _getEngine() {
    if (!this._engine) this._engine = this.vortex.engine();
    return this._engine;
  }

  _getModes() {
    if (!this._modes) this._modes = this._getEngine().modes();
    return this._modes;
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
      const cur = this._getCurMode();
      if (!cur) return;
      try {
        cur.init();
        this._getModes().saveCurMode();
      } catch {}
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
    if (dt === 'Duo') return 2;
    return this.devices?.[dt]?.ledCount ? Math.min(2, this.devices[dt].ledCount) : 1;
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
        try {
          const cur2 = this._getCurMode();
          if (cur2) {
            cur2.init();
            this._getModes().saveCurMode();
          }
        } catch {}
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

        const patID = this.vortexLib.PatternID?.values?.[patValue] || null;
        if (!patID) return null;

        try {
          const set = cur2.getColorset(this._fxLed);
          cur2.setPattern(patID, this._fxLed, null, null);
          if (set) cur2.setColorset(set, this._fxLed);
          cur2.init();
          this._getModes().saveCurMode();
        } catch {}

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

        set.addColor(new this.vortexLib.RGBColor(255, 0, 0));
        cur2.setColorset(set, this._fxLed);

        try {
          cur2.init();
          this._getModes().saveCurMode();
        } catch {}

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

        set.removeColor(idx);
        cur2.setColorset(set, this._fxLed);

        try {
          cur2.init();
          this._getModes().saveCurMode();
        } catch {}

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
        if (idx < 0 || idx >= set.numColors()) return;

        const { r, g, b } = this._hexToRgb(hex);
        set.set(idx, new this.vortexLib.RGBColor(r, g, b));
        cur2.setColorset(set, this._fxLed);

        if (isDragging) {
          this._scheduleFxFinalize(140);
        } else {
          this._clearFxFinalize();
          try {
            cur2.init();
            this._getModes().saveCurMode();
          } catch {}
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

