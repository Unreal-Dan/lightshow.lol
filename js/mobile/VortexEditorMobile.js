/* VortexEditorMobile.js */

import VortexLib from '../VortexLib.js';
import Lightshow from '../Lightshow.js';
import VortexPort from '../VortexPort.js';
import Notification from '../Notification.js';

import SimpleViews from './SimpleViews.js';
import SimpleDom from './SimpleDom.js';

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

/* -----------------------------
   Mobile Editor Root
----------------------------- */
export default class VortexEditorMobile {
  constructor(vortexLib) {
    this.vortexLib = vortexLib;

    this.vortex = new this.vortexLib.Vortex();
    this.vortex.init();

    this.vortexPort = new VortexPort(this, true); // BLE enabled

    this.deviceType = null;
    this.devices = null;

    this.root = null;
    this.dom = null;

    this.lightshow = null;
    this._editorResizeHandler = null;

    this.views = new SimpleViews({ basePath: 'js/mobile/views/' });
  }

  /* -----------------------------
     Public-ish API (used by VortexPort)
  ----------------------------- */
  detectMobile() {
    return true;
  }

  isBLESupported() {
    return true;
  }

  isVersionGreaterOrEqual(currentVersion, targetVersion = '1.3.0') {
    const currentParts = currentVersion.split('.').map(Number);
    const targetParts = targetVersion.split('.').map(Number);

    for (let i = 0; i < targetParts.length; i++) {
      if ((currentParts[i] ?? 0) > (targetParts[i] ?? 0)) return true;
      if ((currentParts[i] ?? 0) < (targetParts[i] ?? 0)) return false;
    }
    return true;
  }

  /* -----------------------------
     Boot
  ----------------------------- */
  async initialize() {
    console.log('[VortexEditorMobile] initialize');

    document.body.innerHTML = '';

    // load all css and js assets
    await this.loadAssets();

    // create the root node
    this.root = document.createElement('div');
    this.root.id = 'mobile-app-root';
    document.body.appendChild(this.root);

    // create the dom interface
    this.dom = new SimpleDom(this.root);

    // load devices.json which contains data about each device
    const devicesUrl = ASSETS.data.devices;
    const res = await fetch(devicesUrl, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(
        `Failed to load devices JSON (${res.status} ${res.statusText}): ${devicesUrl}`
      );
    }
    this.devices = await res.json();

    // go to the device selection screen
    await this.gotoDeviceSelect();
  }

  setDeviceType(type) {
    this.deviceType = type;
  }

  /* -----------------------------
     Asset helpers
  ----------------------------- */
  async loadAssets() {
    // load all css assets
    for (const s of ASSETS.styles) {
      this.loadStylesheet(s.id, s.href);
    }
    // load all script assets
    for (const s of ASSETS.scripts) {
      await this.loadScript(s.id, s.src);
    }
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

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  stopEditorLightshow() {
    if (!this.lightshow) return;
    try {
      this.lightshow.stop();
    } catch {}
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
    if (deviceType === 'Duo') {
      return `<i class="fa-solid fa-satellite-dish"></i> Load from Duo`;
    }
    return `<i class="fa-solid fa-upload"></i> Load modes from device`;
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

  /* -----------------------------
     Navigation
  ----------------------------- */
  async gotoDeviceSelect() {
    const cardFragments = await Promise.all(
      DEVICE_CARDS.map((c) =>
        this.views.render('device-card.html', { id: c.id, label: c.label, img: c.img })
      )
    );

    const containerFrag = await this.views.render('device-select.html', {});
    this.dom.set(containerFrag);

    const mount = this.dom.must(
      '#device-cards-mount',
      'device-select.html is missing #device-cards-mount'
    );
    cardFragments.forEach((frag) => mount.appendChild(frag));

    const skipLink = document.createElement('div');
    skipLink.className = 'skip-to-editor-link';
    skipLink.innerHTML =
      `<a href="#" id="skip-to-editor">Skip to Editor ` +
      `<i class="fa-solid fa-arrow-right-long" style="margin-left: 0.4em;"></i></a>`;
    this.dom.$('.container-fluid')?.appendChild(skipLink);

    this.dom.onClick(
      '#skip-to-editor',
      async () => {
        await this.gotoEditor({ deviceType: 'Duo' });
      },
      { preventDefault: true }
    );

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
    const frag = await this.views.render('ble-connect.html', {
      deviceType,
      deviceImg,
      deviceAlt,
      instructions,
    });

    this.dom.set(frag);

    this.dom.onClick('#back-btn', async () => {
      await this.gotoDeviceSelect();
    });

    const connectBtn = this.dom.must(
      '#ble-connect-btn',
      'ble-connect.html is missing #ble-connect-btn'
    );

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

              if (status === 'waiting') {
                console.log('[Mobile] BLE connected, waiting for greeting...');
                return;
              }

              if (status === 'disconnect') {
                console.warn('[Mobile] Device disconnected');
                return;
              }

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

    this.dom.onClick('#ms-new-mode', async () => {
      await this.startNewModeAndEnterEditor(deviceType);
    });

    const loadBtn = this.dom.must(
      '#ms-load-device',
      'mode-source.html is missing #ms-load-device'
    );
    loadBtn.innerHTML = this.loadActionLabel(deviceType);

    this.dom.onClick(loadBtn, async () => {
      console.log('[Mobile] Load modes start:', deviceType);

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

  /* -----------------------------
     Device interaction flows
  ----------------------------- */
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
        if (tries++ > 10) {
          console.log('Failed to demo mode, waited 10 delays...');
          return;
        }
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

    // small helper so we can update the busy label with progress
    const setBusyHtml = (html) => {
      if (!loadBtn) return;
      loadBtn.innerHTML = html;
    };

    await this.dom.busy(
      loadBtn,
      baseBusyHtml,
      async () => {
        try {
          this.vortex.clearModes();

          await this.vortexPort.pullEachFromDevice(this.vortexLib, this.vortex, (p) => {
            if (!p || typeof p !== 'object') {
              return;
            }
            const total = Number(p.total ?? 0);
            const i = Number(p.index ?? 0) + 1;
            let str = ` Loading modes…`;
            if (p.phase === 'count') {
              str = ` Loading modes… (0 / ${total})`;
            } else if (p.phase === 'pulling') {
              str = ` Pulling mode ${i} / ${total}…`;
            } else if (p.phase === 'finalizing') {
              str = ` Finalizing… (${total} modes)`;
            } else if (p.phase === 'done') {
              str = ` Done (${total} modes)`;
            }
            setBusyHtml(`<i class="fa-solid fa-spinner fa-spin"></i> ${str}`);
          });
          if (this.vortex.numModes() > 0) {
            this.vortex.setCurMode(0, false);
          }
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
    if (!this.vortex.addNewMode(false)) {
      console.log('[Mobile] Failed to add new mode');
      return;
    }

    this.vortex.setCurMode(before, false);
    const cur = this.vortex.engine().modes().curMode();
    if (cur) cur.init();
    this.vortex.engine().modes().saveCurMode();

    await this.gotoEditor({ deviceType });
  }

  /* -----------------------------
     Duo receive flow
  ----------------------------- */
  async gotoDuoReceive({ deviceType }) {
    const copy = {
      title: 'Listening for Duo…',
      body: "Point the Duo at the Chromadeck's buttons and send the mode.  The Chromadeck is listening.",
      status: 'Starting…',
    };

    const frag = await this.views.render('duo-mode-receive.html', copy);
    this.dom.set(frag);

    this.dom.onClick('#back-btn', async () => {
      await this.gotoModeSource({ deviceType });
    });

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

  /* -----------------------------
     Editor
  ----------------------------- */
  async gotoEditor({ deviceType }) {
    if (!this.vortex) return;

    const dt = deviceType || this.selectedDeviceType('Duo');
    const hasModes = this.vortex.numModes() > 0;

    const modeName = hasModes
      ? `Mode ${this.vortex.engine().modes().curModeIndex() + 1}`
      : 'No modes';

    const modeIndexLabel = hasModes
      ? `${this.vortex.engine().modes().curModeIndex() + 1} / ${this.vortex.numModes()}`
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

    if (!hasModes) {
      await this.bindEmptyEditorActions(dt);
      return;
    }

    await this.startEditorLightshow(dt);
    await this.demoModeOnDevice();

    this.bindEditorModeNav(dt);
    this.bindEditorTools();
  }

  async bindEmptyEditorActions(dt) {
    this.dom.onClick('#m-start-new-mode', async () => {
      const before = this.vortex.numModes();
      if (!this.vortex.addNewMode(false)) {
        console.log('[Mobile] Failed to add new mode');
        return;
      }
      this.vortex.setCurMode(before, false);
      const cur = this.vortex.engine().modes().curMode();
      if (cur) cur.init();
      this.vortex.engine().modes().saveCurMode();
      await this.gotoEditor({ deviceType: dt });
    });

    const loadBtn = this.dom.$('#m-load-from-device');
    if (loadBtn) {
      loadBtn.innerHTML = this.loadActionLabel(dt);

      this.dom.onClick(loadBtn, async () => {
        if (dt === 'Duo') {
          await this.gotoDuoReceive({ deviceType: dt });
        } else {
          await this.pullFromDeviceAndEnterEditor(dt, { source: 'editor-empty' });
        }
      });
    }

    this.dom.onClick('#m-browse-community', async () => {
      console.log('[Mobile] Browse Community');
    });
  }

  async startEditorLightshow(dt) {
    const canvas = this.dom.must(
      '#mobile-lightshow-canvas',
      'editor.html is missing #mobile-lightshow-canvas'
    );

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
    const rerender = async () => {
      await this.gotoEditor({ deviceType: dt });
    };

    const prev = this.dom.$('#mode-prev');
    const next = this.dom.$('#mode-next');

    if (prev) {
      prev.addEventListener('click', async () => {
        const curIdx = this.vortex.engine().modes().curModeIndex();
        const n = this.vortex.numModes();
        const nextIdx = (curIdx - 1 + n) % n;
        this.vortex.setCurMode(nextIdx, true);
        await rerender();
      });
    }

    if (next) {
      next.addEventListener('click', async () => {
        const curIdx = this.vortex.engine().modes().curModeIndex();
        const n = this.vortex.numModes();
        const nextIdx = (curIdx + 1) % n;
        this.vortex.setCurMode(nextIdx, true);
        await rerender();
      });
    }
  }

  bindEditorTools() {
    this.dom.all('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        console.log('[Mobile Editor] tool:', btn.dataset.tool);
      });
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

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      boot();
    },
    { once: true }
  );
})();

