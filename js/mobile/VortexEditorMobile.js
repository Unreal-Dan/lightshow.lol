/* VortexEditorMobile.js */

import VortexLib from '../VortexLib.js';
import Lightshow from '../Lightshow.js';
import SimpleViews from './SimpleViews.js';
import VortexPort from '../VortexPort.js';
import Notification from '../Notification.js';

/* -----------------------------
   Mobile Editor Root
----------------------------- */
export default class VortexEditorMobile {
  constructor(vortexLib) {
    // store vortexlib reference
    this.vortexLib = vortexLib;
    this.vortex = new this.vortexLib.Vortex();
    this.vortex.init();

    this.vortexPort = new VortexPort(this, true); // `true` enables BLE
    this.deviceType = null;
    this.devices = null;
    this.root = null;
    this.lightshow = null;
    this._editorResizeHandler = null;

    // Views live next to mobile JS: js/mobile/views/*.html
    this.views = new SimpleViews({ basePath: 'js/mobile/views/' });
  }

  setDeviceType(type) {
    this.deviceType = type;
  }

  async initialize() {
    console.log('[VortexEditorMobile] initialize');
    // MOBILE MUST OWN THE PAGE (structure only; no styling here)
    document.body.innerHTML = '';
    // load dependencies
    await this.loadAssets();
    // create root panel
    this.createRoot();
    // render the device selection page
    await this.renderDeviceSelect();
  }

  async loadAssets() {
    this.loadStylesheet(
      'fa-css',
      'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'
    );

    this.loadStylesheet(
      'bootstrap-css',
      'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css'
    );

    // Your single mobile css file
    this.loadStylesheet('mobile-app-styles-css', 'css/mobile-app-styles.css');

    // Bootstrap JS bundle (for future offcanvas/modals etc.)
    await this.loadScript(
      'bootstrap-js',
      'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js'
    );

    // fetch devices json
    const devicesUrl = 'js/devices.json';
    const res = await fetch(devicesUrl, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(
        `Failed to load devices JSON (${res.status} ${res.statusText}): ${devicesUrl}`
      );
    }
    this.devices = await res.json();
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

  createRoot() {
    this.root = document.createElement('div');
    this.root.id = 'mobile-app-root';
    document.body.appendChild(this.root);
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* -----------------------------
     STEP 1: Device Selection
  ----------------------------- */
  async renderDeviceSelect() {
    const cards = [
      {
        id: 'Duo',
        label: 'Duo',
        img: 'public/images/duo-logo-square-512.png',
      },
      {
        id: 'Spark',
        label: 'Spark',
        img: 'public/images/spark-logo-square-512.png',
      },
      {
        id: 'Chromadeck',
        label: 'Chromadeck',
        img: 'public/images/chromadeck-logo-square-512.png',
      },
    ];

    // Render each card from a view (no embedded HTML templates in JS)
    const cardFragments = await Promise.all(
      cards.map((c) =>
        this.views.render('device-card.html', {
          id: c.id,
          label: c.label,
          img: c.img,
        })
      )
    );

    const containerFrag = await this.views.render('device-select.html', {});
    this.root.innerHTML = '';
    this.root.appendChild(containerFrag);

    // Insert the card fragments into the placeholder mount
    const mount = this.root.querySelector('#device-cards-mount');
    if (!mount) {
      throw new Error('device-select.html is missing #device-cards-mount');
    }
    cardFragments.forEach((frag) => mount.appendChild(frag));

    const skipLink = document.createElement('div');
    skipLink.className = 'skip-to-editor-link';
    skipLink.innerHTML = `<a href="#" id="skip-to-editor">Skip to Editor <i class="fa-solid fa-arrow-right-long" style="margin-left: 0.4em;"></i></a>`;
    this.root.querySelector('.container-fluid')?.appendChild(skipLink);

    this.root.querySelector('#skip-to-editor')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.renderEditor({ deviceType: 'Duo' });
    });

    // Wire up selection (tap immediately continues)
    this.root.querySelectorAll('[data-device]').forEach((cardEl) => {
      cardEl.addEventListener('click', async () => {
        const type = cardEl.dataset.device;
        this.setDeviceType(type);
        this.updateSelectionUI();
        await this.onDeviceSelected(type);
      });
    });

    // No continue button anymore
    this.updateSelectionUI();
  }

  updateSelectionUI() {
    const selected = this.deviceType;

    this.root.querySelectorAll('[data-device]').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.device === selected);
    });
  }

  /* -----------------------------
     Wizard Branch Point
  ----------------------------- */
  async onDeviceSelected(deviceType) {
    console.log('[Mobile] selected device:', deviceType);

    const { deviceImg, deviceAlt, instructions } = this.getBleConnectCopy(deviceType);

    await this.renderBleConnect({
      deviceType,
      deviceImg,
      deviceAlt,
      instructions,
    });
  }

  getBleConnectCopy(deviceType) {
    // Duo and Chromadeck both connect to Chromadeck
    if (deviceType === 'Duo' || deviceType === 'Chromadeck') {
      return {
        deviceImg: 'public/images/chromadeck-logo-square-512.png',
        deviceAlt: 'Chromadeck',
        instructions: 'Unplug the Chromadeck and switch it off and back on, then tap Connect below.',
      };
    }

    // Spark connects to Spark (Orbit/Handles)
    return {
      deviceImg: 'public/images/spark-logo-square-512.png',
      deviceAlt: 'Spark',
      instructions: 'Unplug the Spark and open the Bluetooth menu, then tap Connect below.',
    };
  }

  async renderBleConnect({ deviceType, deviceImg, deviceAlt, instructions }) {
    const frag = await this.views.render('ble-connect.html', {
      deviceType,
      deviceImg,
      deviceAlt,
      instructions,
    });

    this.root.innerHTML = '';
    this.root.appendChild(frag);

    const backBtn = this.root.querySelector('#back-btn');
    if (!backBtn) throw new Error('ble-connect.html is missing #back-btn');
    backBtn.addEventListener('click', async () => {
      await this.renderDeviceSelect();
    });

    const connectBtn = this.root.querySelector('#ble-connect-btn');
    if (!connectBtn) throw new Error('ble-connect.html is missing #ble-connect-btn');

    connectBtn.addEventListener('click', async () => {
      console.log('[Mobile] Attempting BLE connection for:', deviceType);

      // Ask VortexPort to connect via BLE and wait for greeting
      try {
        await this.vortexPort.requestDevice(async (status) => {
          if (status === 'connect') {
            this.vortexPort.startReading();
            console.log('[Mobile] BLE connected and greeting received');
            await this.renderModeSource({ deviceType });
          } else if (status === 'disconnect') {
            console.warn('[Mobile] Device disconnected');
          } else if (status === 'waiting') {
            console.log('[Mobile] BLE connected, waiting for greeting...');
          } else if (status === 'failed') {
            // You had this behavior already; leaving it.
            await this.renderModeSource({ deviceType });
          }
        });
      } catch (err) {
        console.error('BLE connection failed:', err);
        alert('Failed to connect to Bluetooth device.');
      }
    });
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
      if (currentParts[i] > targetParts[i]) return true;
      if (currentParts[i] < targetParts[i]) return false;
    }
    return true;
  }

  /* -----------------------------
     Mobile Pull Flow (Spark/Chromadeck)
  ----------------------------- */
  async pullFromDeviceAndEnterEditor(deviceType, { source = 'mode-source' } = {}) {
    const loadBtnId = source === 'editor-empty' ? '#m-load-from-device' : '#ms-load-device';
    const newBtnId = source === 'editor-empty' ? '#m-start-new-mode' : '#ms-new-mode';
    const browseBtnId = source === 'editor-empty' ? '#m-browse-community' : '#ms-browse-community';

    const loadBtn = this.root.querySelector(loadBtnId);
    const newBtn = this.root.querySelector(newBtnId);
    const browseBtn = this.root.querySelector(browseBtnId);
    const backBtn = this.root.querySelector('#back-btn');

    const disableAll = (disabled) => {
      if (loadBtn) loadBtn.disabled = disabled;
      if (newBtn) newBtn.disabled = disabled;
      if (browseBtn) browseBtn.disabled = disabled;
      if (backBtn) backBtn.disabled = disabled;
    };

    const prevLoadHTML = loadBtn ? loadBtn.innerHTML : null;
    try {
      disableAll(true);
      if (loadBtn) {
        loadBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading modes…`;
      }

      // Clear existing modes before pull (matches your Duo receive flow behavior).
      this.vortex.clearModes();

      await this.vortexPort.pullFromDevice(this.lightshow.vortexLib, this.lightshow.vortex);

      if (this.vortex.numModes() > 0) {
        this.vortex.setCurMode(0, false);
      }

      await this.renderEditor({ deviceType });
    } catch (err) {
      console.error('[Mobile] Pull from device failed:', err);
      Notification.failure('Failed to load modes from device');
      // Stay on current page, restore UI.
    } finally {
      if (loadBtn && prevLoadHTML != null) loadBtn.innerHTML = prevLoadHTML;
      disableAll(false);
    }
  }

  async renderEditor({ deviceType }) {
    // Ensure vortex exists but DO NOT create modes here
    if (!this.vortex) return;

    // Ensure we have a deviceType fallback
    const dt = deviceType || this.deviceType || 'Duo';

    const hasModes = this.vortex.numModes() > 0;

    const modeName = hasModes ? `Mode ${this.vortex.engine().modes().curModeIndex() + 1}` : 'No modes';
    const modeIndexLabel = hasModes
      ? `${this.vortex.engine().modes().curModeIndex() + 1} / ${this.vortex.numModes()}`
      : 'No modes';

    const frag = await this.views.render('editor.html', {
      deviceType: dt,
      modeName,
      modeIndexLabel,
      emptyDisplay: hasModes ? 'none' : 'grid',
    });

    this.root.innerHTML = '';
    this.root.appendChild(frag);

    // Disable side tools + carousel when empty
    const tools = this.root.querySelector('.m-editor-tools');
    const carousel = this.root.querySelector('.m-editor-carousel');
    if (!hasModes) {
      tools?.classList.add('m-editor-disabled');
      carousel?.classList.add('m-editor-disabled');
    } else {
      tools?.classList.remove('m-editor-disabled');
      carousel?.classList.remove('m-editor-disabled');
    }

    // Stop any existing lightshow
    this.stopEditorLightshow();
    if (this._editorResizeHandler) {
      window.removeEventListener('resize', this._editorResizeHandler);
      this._editorResizeHandler = null;
    }

    // If we have no modes, do NOT start the lightshow yet
    if (!hasModes) {
      const startNewBtn = this.root.querySelector('#m-start-new-mode');
      if (startNewBtn) {
        startNewBtn.addEventListener('click', async () => {
          const before = this.vortex.numModes();
          if (!this.vortex.addNewMode(false)) {
            console.log('[Mobile] Failed to add new mode');
            return;
          }
          this.vortex.setCurMode(before, false);
          const cur = this.vortex.engine().modes().curMode();
          if (cur) cur.init();
          this.vortex.engine().modes().saveCurMode();
          await this.renderEditor({ deviceType: dt });
        });
      }

      const loadBtn = this.root.querySelector('#m-load-from-device');
      if (loadBtn) {
        // Duo: receive from Duo. Others: pull immediately and enter editor.
        loadBtn.addEventListener('click', async () => {
          if (dt === 'Duo') {
            await this.renderDuoReceive({ deviceType: dt });
          } else {
            await this.pullFromDeviceAndEnterEditor(dt, { source: 'editor-empty' });
          }
        });

        // Optional: change label for Duo
        if (dt === 'Duo') {
          loadBtn.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> Load from Duo`;
        } else {
          loadBtn.innerHTML = `<i class="fa-solid fa-upload"></i> Load modes from device`;
        }
      }

      const browseBtn = this.root.querySelector('#m-browse-community');
      if (browseBtn) {
        browseBtn.addEventListener('click', () => {
          console.log('[Mobile] Browse Community');
        });
      }

      return;
    }

    // ---- Start Lightshow now that we have a mode ----
    const canvas = this.root.querySelector('#mobile-lightshow-canvas');
    if (!canvas) throw new Error('editor.html is missing #mobile-lightshow-canvas');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    this.lightshow = new Lightshow(this.vortexLib, this.vortex, canvas);

    // Fullscreen behavior
    this.lightshow.updateLayout(false);

    const isDuo = dt === 'Duo';
    this.lightshow.setDuoEditorMode(isDuo);

    // Pull ledCount from devices.json when available
    const ledCount = this.devices?.[dt]?.ledCount ?? (isDuo ? 2 : 1);

    // Shared defaults (then tweak for Duo)
    Object.assign(this.lightshow, {
      tickRate: 3,
      trailSize: 260,
      dotSize: 14,
      blurFac: 1,
      circleRadius: 170,
      spread: 50,
      direction: -1,
    });

    if (isDuo) {
      Object.assign(this.lightshow, {
        tickRate: 3,
        trailSize: 300,
        dotSize: 15,
        circleRadius: 180,
      });
    } else {
      Object.assign(this.lightshow, {
        trailSize: 220,
        dotSize: 13,
        circleRadius: 160,
      });
    }

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

    // demo the mode on the device
    await this.demoModeOnDevice();

    const rerender = async () => {
      await this.renderEditor({ deviceType: dt });
    };

    const prev = this.root.querySelector('#mode-prev');
    const next = this.root.querySelector('#mode-next');

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

    this.root.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        console.log('[Mobile Editor] tool:', btn.dataset.tool);
      });
    });
  }

  async renderModeSource({ deviceType }) {
    const subtitle = 'Choose how to start';

    const frag = await this.views.render('mode-source.html', { subtitle });

    this.root.innerHTML = '';
    this.root.appendChild(frag);

    const backBtn = this.root.querySelector('#back-btn');
    if (!backBtn) throw new Error('mode-source.html is missing #back-btn');
    backBtn.addEventListener('click', async () => {
      const { deviceImg, deviceAlt, instructions } = this.getBleConnectCopy(deviceType);
      await this.renderBleConnect({ deviceType, deviceImg, deviceAlt, instructions });
    });

    const newBtn = this.root.querySelector('#ms-new-mode');
    if (!newBtn) throw new Error('mode-source.html is missing #ms-new-mode');
    newBtn.addEventListener('click', async () => {
      await this.startNewModeAndEnterEditor(deviceType);
    });

    const loadBtn = this.root.querySelector('#ms-load-device');
    if (!loadBtn) throw new Error('mode-source.html is missing #ms-load-device');

    // Change the copy per device WITHOUT touching the template.
    if (deviceType === 'Duo') {
      loadBtn.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> Load from Duo`;
    } else {
      loadBtn.innerHTML = `<i class="fa-solid fa-upload"></i> Load modes from device`;
    }

    loadBtn.addEventListener('click', async () => {
      console.log('[Mobile] Load modes start:', deviceType);

      if (deviceType === 'Duo') {
        await this.renderDuoReceive({ deviceType });
        return;
      }

      // Spark/Chromadeck: pull immediately and enter editor (no additional screen)
      await this.pullFromDeviceAndEnterEditor(deviceType, { source: 'mode-source' });
    });

    const browseBtn = this.root.querySelector('#ms-browse-community');
    if (!browseBtn) throw new Error('mode-source.html is missing #ms-browse-community');
    browseBtn.addEventListener('click', async () => {
      console.log('[Mobile] Browse Community');
      await this.renderEditor({ deviceType });
    });
  }

  async listenVL() {
    if (!this.vortexPort.isActive()) {
      Notification.failure('Please connect a device first');
      return;
    }
    await this.vortexPort.listenVL(this.vortexLib, this.vortex);
  }

  nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  async renderDuoReceive({ deviceType }) {
    const copy = {
      title: 'Listening for Duo…',
      body: "Point the Duo at the Chromadeck's buttons and send the mode.  The Chromadeck is listening.",
      status: 'Starting…',
    };

    const frag = await this.views.render('duo-mode-receive.html', copy);
    this.root.innerHTML = '';
    this.root.appendChild(frag);

    const backBtn = this.root.querySelector('#back-btn');
    if (!backBtn) throw new Error('duo-mode-receive.html is missing #back-btn');

    backBtn.addEventListener('click', async () => {
      await this.renderModeSource({ deviceType });
    });

    const statusEl = this.root.querySelector('#duo-rx-status');
    const statusTextEl = this.root.querySelector('#duo-rx-status-text');
    const bodyEl = this.root.querySelector('#duo-rx-body');

    try {
      if (statusTextEl) statusTextEl.textContent = 'Listening…';

      // clear existing modes and immediately start listening
      this.vortex.clearModes();

      await this.listenVL();

      if (statusTextEl) statusTextEl.textContent = 'Received. Opening editor…';
      await this.renderEditor({ deviceType });
    } catch (err) {
      console.error('[Mobile] Duo receive failed:', err);
      if (statusEl) statusEl.classList.add('is-error');
      if (statusTextEl) statusTextEl.textContent = 'Receive failed. Tap Back and try again.';
      if (bodyEl) bodyEl.textContent = "Point the Duo at the Chromadeck's buttons, then send again.";
    }
  }

  async startNewModeAndEnterEditor(deviceType) {
    const before = this.vortex.numModes();
    if (!this.vortex.addNewMode(false)) {
      console.log('[Mobile] Failed to add new mode');
      return;
    }

    // Select it + init + save
    this.vortex.setCurMode(before, false);
    const cur = this.vortex.engine().modes().curMode();
    if (cur) cur.init();
    this.vortex.engine().modes().saveCurMode();

    await this.renderEditor({ deviceType });
  }

  getEditorLedCount(deviceType) {
    if (deviceType === 'Duo') return 2;
    return 1;
  }

  hasAnyModes() {
    return !!this.vortex && this.vortex.numModes() > 0;
  }

  stopEditorLightshow() {
    if (this.lightshow) {
      try {
        this.lightshow.stop();
      } catch {}
      this.lightshow = null;
    }
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
  // If the page is already loaded (or interactive), run immediately.
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot();
    return;
  }

  // Otherwise wait for DOM (not full load of images/fonts/etc).
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      boot();
    },
    { once: true }
  );
})();

