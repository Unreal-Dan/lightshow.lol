/* VortexEditorMobile.js */

import VortexLib from '../VortexLib.js';
import Lightshow from '../Lightshow.js';
import SimpleViews from './SimpleViews.js';

/* -----------------------------
   Mobile App State
----------------------------- */
class MobileAppState {
  constructor() {
    this.deviceType = null; // 'spark' | 'chromadeck' | 'duo'
    this.listeners = new Set();
  }

  setDeviceType(type) {
    this.deviceType = type;
    this.emit();
  }

  subscribe(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit() {
    for (const cb of this.listeners) cb(this);
  }
}

/* -----------------------------
   Mobile Editor Root
----------------------------- */
export default class VortexEditorMobile {
  constructor(vortexLib) {
    this.vortexLib = vortexLib;
    this.state = new MobileAppState();
    this.root = null;

    // Views live next to mobile JS: js/mobile/views/*.html
    this.views = new SimpleViews({ basePath: 'js/mobile/views/' });
  }

  async initialize() {
    console.log('[VortexEditorMobile] initialize');

    // MOBILE MUST OWN THE PAGE (structure only; no styling here)
    document.body.innerHTML = '';

    await this.loadAssets();

    this.createRoot();
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

  /* -----------------------------
     STEP 1: Device Selection
  ----------------------------- */
  async renderDeviceSelect() {
    const cards = [
      {
        id: 'duo',
        label: 'Duo',
        img: 'public/images/duo-logo-square-512.png',
        subtitle: 'Program your Duos via Chromadeck over Bluetooth',
      },
      {
        id: 'spark',
        label: 'Spark',
        img: 'public/images/spark-logo-square-512.png',
        subtitle: 'Program your Spark Orbit or Handles over Bluetooth',
      },
      {
        id: 'chromadeck',
        label: 'Chromadeck',
        img: 'public/images/chromadeck-logo-square-512.png',
        subtitle: 'Program just the Chromadeck over Bluetooth',
      },
    ];

    // Render each card from a view (no embedded HTML templates in JS)
    const cardFragments = await Promise.all(
      cards.map((c) =>
        this.views.render('device-card.html', {
          id: c.id,
          label: c.label,
          img: c.img,
          subtitle: c.subtitle,
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

    // Wire up selection (tap immediately continues)
    this.root.querySelectorAll('[data-device]').forEach((cardEl) => {
      cardEl.addEventListener('click', async () => {
        const type = cardEl.dataset.device;
        this.state.setDeviceType(type);
        this.updateSelectionUI();
        await this.onDeviceSelected(type);
      });
    });

    // No continue button anymore
    this.updateSelectionUI();
  }

  updateSelectionUI() {
    const selected = this.state.deviceType;

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
    if (deviceType === 'duo' || deviceType === 'chromadeck') {
      return {
        deviceImg: 'public/images/chromadeck-logo-square-512.png',
        deviceAlt: 'Chromadeck',
        instructions: 'Turn on your Chromadeck, keep it nearby, then tap Connect and select it from the Bluetooth popup.',
      };
    }

    // Spark connects to Spark (Orbit/Handles) — use your Spark Orbit icon
    return {
      deviceImg: 'public/images/spark-logo-square-512.png',
      deviceAlt: 'Spark',
      instructions: 'Turn on your Spark, keep it nearby, then tap Connect and select it from the Bluetooth popup.',
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
      console.log('[Mobile] BLE connected (placeholder) for:', deviceType);
      await this.renderModeSource({ deviceType });
    });
  }

  async renderEditor({ deviceType }) {
    // Duo-first for now
    if (deviceType !== 'duo') {
      const frag = await this.views.render('device-selected.html', { deviceType });
      this.root.innerHTML = '';
      this.root.appendChild(frag);
      return;
    }

    // Ensure vortex exists but DO NOT create modes
    if (!this.vortex) {
      this.vortex = new this.vortexLib.Vortex();
      this.vortex.init();
      this.vortex.setLedCount(2);
      this.vortexLib.RunTick(this.vortex);
    }

    const hasModes = this.vortex.numModes() > 0;

    // Simple labels
    const modeName = hasModes ? `Mode ${this.vortex.engine().modes().curModeIndex() + 1}` : 'No modes';
    const modeIndexLabel = hasModes
      ? `${this.vortex.engine().modes().curModeIndex() + 1} / ${this.vortex.numModes()}`
      : 'No modes';

    const frag = await this.views.render('editor.html', {
      deviceType,
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
      // Wire the 3 primary actions
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
          await this.renderEditor({ deviceType });
        });
      }

      const loadBtn = this.root.querySelector('#m-load-from-device');
      if (loadBtn) {
        loadBtn.addEventListener('click', () => {
          console.log('[Mobile] Get Mode from Duo');
        });
      }

      const browseBtn = this.root.querySelector('#m-browse-community');
      if (browseBtn) {
        browseBtn.addEventListener('click', () => {
          console.log('[Mobile] Browse Community');
        });
      }

      // Back still works
      const backBtn = this.root.querySelector('#editor-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', async () => {
          const { deviceImg, deviceAlt, instructions } = this.getBleConnectCopy(deviceType);
          await this.renderBleConnect({ deviceType, deviceImg, deviceAlt, instructions });
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

    // Duo rendering
    this.lightshow.setDuoEditorMode(true);
    Object.assign(this.lightshow, {
      tickRate: 3,
      trailSize: 300,
      dotSize: 30,
      blurFac: 3,
      circleRadius: 220,
      spread: 120,
      direction: -1,
    });
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

    // Back
    const backBtn = this.root.querySelector('#editor-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        if (this._editorResizeHandler) {
          window.removeEventListener('resize', this._editorResizeHandler);
          this._editorResizeHandler = null;
        }
        this.stopEditorLightshow();

        const { deviceImg, deviceAlt, instructions } = this.getBleConnectCopy(deviceType);
        await this.renderBleConnect({ deviceType, deviceImg, deviceAlt, instructions });
      });
    }

    // Carousel (placeholder: just cycles vortex current mode index)
    const rerender = async () => {
      await this.renderEditor({ deviceType });
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
    const subtitle =
      deviceType === 'duo'
      ? 'You’re connected to Chromadeck. Choose how to load or create Duo modes.'
      : 'Choose how you want to start.';

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
      // For now: create one mode locally and go to editor
      await this.startNewModeAndEnterEditor(deviceType);
    });

    const loadBtn = this.root.querySelector('#ms-load-device');
    if (!loadBtn) throw new Error('mode-source.html is missing #ms-load-device');
    loadBtn.addEventListener('click', async () => {
      console.log('[Mobile] Load Modes off Device (placeholder)');
      // duo pull mode flow:
      if (deviceType === 'duo') {
        await this.renderDuoReceive({ deviceType, step: 1 });
        return;
      }
      // Later: BLE pull flow, then enter editor
      await this.renderEditor({ deviceType }); // placeholder: just enter editor
    });

    const browseBtn = this.root.querySelector('#ms-browse-community');
    if (!browseBtn) throw new Error('mode-source.html is missing #ms-browse-community');
    browseBtn.addEventListener('click', async () => {
      console.log('[Mobile] Browse Community (placeholder)');
      // Later: navigate to community browser page, import, then enter editor
      await this.renderEditor({ deviceType }); // placeholder: just enter editor
    });
  }

  async renderDuoReceive({ deviceType, step }) {
    // step 1: tell chromadeck to listen
    // step 2: wait for duo to transmit; chromadeck relays to phone

    const step1 = {
      stepNum: '1',
      title: 'Put Chromadeck in Receive Mode',
      body: 'Tap the button below. Your Chromadeck will start listening for a Duo transmission.',
      primaryLabel: 'Start Listening',
      secondaryLabel: 'Skip (debug)',
      secondaryDisplay: '',
    };

    const step2 = {
      stepNum: '2',
      title: 'Send from Duo',
      body: 'Point your Duo at the Chromadeck and send the mode. When the Chromadeck relays it, we’ll continue.',
      primaryLabel: 'I sent it (wait)',
      secondaryLabel: 'Simulate Receive (debug)',
      secondaryDisplay: '',
    };

    const copy = step === 1 ? step1 : step2;

    const frag = await this.views.render('duo-mode-receive.html', copy);
    this.root.innerHTML = '';
    this.root.appendChild(frag);

    const backBtn = this.root.querySelector('#back-btn');
    backBtn.addEventListener('click', async () => {
      await this.renderModeSource({ deviceType });
    });

    const primary = this.root.querySelector('#duo-rx-primary');
    const secondary = this.root.querySelector('#duo-rx-secondary');

    if (step === 1) {
      primary.addEventListener('click', async () => {
        primary.disabled = true;
        primary.textContent = 'Starting…';

        try {
          // PLACEHOLDER: tell Chromadeck to listen for Duo transmit
          await this.duoRequestChromadeckListenPlaceholder();

          // advance to step 2
          await this.renderDuoReceive({ deviceType, step: 2 });
        } finally {
          // (no-op) view was replaced
        }
      });

      secondary.addEventListener('click', async () => {
        await this.renderDuoReceive({ deviceType, step: 2 });
      });

      return;
    }

    // step 2
    primary.addEventListener('click', async () => {
      primary.disabled = true;
      primary.textContent = 'Waiting…';

      try {
        // PLACEHOLDER: wait for mode to arrive from Chromadeck relay
        const modeData = await this.duoWaitForRelayedModePlaceholder();

        // Apply the received mode into vortex (placeholder import)
        await this.duoImportModePlaceholder(modeData);

        // Continue to editor
        await this.renderEditor({ deviceType });
      } catch (err) {
        console.error('[Mobile] Duo receive failed:', err);
        primary.disabled = false;
        primary.textContent = 'I sent it (wait)';
      }
    });

    secondary.addEventListener('click', async () => {
      const modeData = this.duoMakeFakeModeDataPlaceholder();
      await this.duoImportModePlaceholder(modeData);
      await this.renderEditor({ deviceType });
    });
  }

  async duoRequestChromadeckListenPlaceholder() {
    // Later: BLE write to Chromadeck characteristic to start “listen for Duo”
    console.log('[Mobile] (placeholder) Tell Chromadeck to listen for Duo...');
    await new Promise((r) => setTimeout(r, 400));
  }

  async duoWaitForRelayedModePlaceholder() {
    // Later: wait on BLE notifications from Chromadeck containing the relayed mode
    console.log('[Mobile] (placeholder) Waiting for relayed mode...');
    await new Promise((r) => setTimeout(r, 1200));
    return this.duoMakeFakeModeDataPlaceholder();
  }

  duoMakeFakeModeDataPlaceholder() {
    // Minimal “mode-like” placeholder. You’ll replace with real payload.
    return {
      num_leds: 2,
      single_pats: [
        { data: { pattern_id: 0, args: [0, 0, 0, 0], colorset: ['0xFF0000', '0x00FF00', '0x0000FF'] } },
      ],
    };
  }

  async duoImportModePlaceholder(modeData) {
    // Create vortex if needed
    if (!this.vortex) {
      this.vortex = new this.vortexLib.Vortex();
      this.vortex.init();
      this.vortex.setLedCount(2);
      this.vortexLib.RunTick(this.vortex);
    }

    // For now: just create a new empty mode and select it.
    // Later: we’ll map modeData into patterns/colorsets like ModesPanel.finalizeModeImport does.
    const before = this.vortex.numModes();
    if (!this.vortex.addNewMode(false)) {
      throw new Error('Failed to add new mode for import');
    }
    this.vortex.setCurMode(before, false);

    const cur = this.vortex.engine().modes().curMode();
    if (cur) cur.init();
    this.vortex.engine().modes().saveCurMode();

    console.log('[Mobile] (placeholder) Imported Duo mode:', modeData);
  }


  async startNewModeAndEnterEditor(deviceType) {
    // Create vortex once if needed
    if (!this.vortex) {
      this.vortex = new this.vortexLib.Vortex();
      this.vortex.init();

      // Duo editor = 2 LEDs (we can generalize later)
      this.vortex.setLedCount(deviceType === 'duo' ? 2 : 1);
      this.vortexLib.RunTick(this.vortex);
    }

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
    if (deviceType === 'duo') return 2;
    return 1; // placeholder for now
  }

  hasAnyModes() {
    return !!this.vortex && this.vortex.numModes() > 0;
  }


  stopEditorLightshow() {
    if (this.lightshow) {
      try { this.lightshow.stop(); } catch {}
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
  document.addEventListener('DOMContentLoaded', () => {
    boot();
  }, { once: true });
})();
