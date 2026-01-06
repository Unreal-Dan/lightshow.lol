/* VortexEditorMobile.js */

import VortexLib from '../VortexLib.js';
import Lightshow from '../Lightshow.js';
import SimpleViews from './SimpleViews.js';
import VortexPort from '../VortexPort.js';
//import * as BLE from '../ble.js';

/* -----------------------------
     Mobile App State
----------------------------- */
class MobileAppState {
    constructor() {
        this.listeners = new Set();
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
    devices = {
        'None': {
            image: 'public/images/none-logo-square-512.png',
            icon: 'public/images/none-logo-square-64.png',
            iconBig: 'public/images/none-logo-square-512.png',
            label: 'None',
            ledCount: 1
        },
        'Orbit': {
            image: 'public/images/orbit.png',
            icon: 'public/images/orbit-logo-square-64.png',
            iconBig: 'public/images/orbit-logo-square-512.png',
            label: 'Orbit',
            ledCount: 28
        },
        'Handle': {
            image: 'public/images/handle.png',
            icon: 'public/images/handle-logo-square-64.png',
            iconBig: 'public/images/handle-logo-square-512.png',
            label: 'Handle',
            ledCount: 3
        },
        'Gloves': {
            image: 'public/images/gloves.png',
            icon: 'public/images/gloves-logo-square-64.png',
            iconBig: 'public/images/gloves-logo-square-512.png',
            label: 'Gloves',
            ledCount: 10
        },
        'Chromadeck': {
            image: 'public/images/chromadeck.png',
            icon: 'public/images/chromadeck-logo-square-64.png',
            iconBig: 'public/images/chromadeck-logo-square-512.png',
            label: 'Chromadeck',
            ledCount: 20
        },
        'Spark': {
            image: 'public/images/spark.png',
            icon: 'public/images/spark-logo-square-64.png',
            iconBig: 'public/images/spark-logo-square-512.png',
            label: 'Spark',
            ledCount: 6,
            // alternate spark image/icon/label for handle
            altImage: 'public/images/spark-handle.png',
            altIcon: 'public/images/spark-handle-logo-square-64.png',
            altIconBig: 'public/images/spark-handle-logo-square-512.png',
            altLabel: 'SparkHandle',
        },
        'Duo': {
            image: 'public/images/duo.png',
            icon: 'public/images/duo-logo-square-64.png',
            iconBig: 'public/images/duo-logo-square-512.png',
            label: 'Duo',
            ledCount: 2
        }
    };

    constructor(vortexLib) {
        this.vortexLib = vortexLib;
        this.vortex = new this.vortexLib.Vortex();
        this.vortex.init();
        this.vortexPort = new VortexPort(this, true); // `true` enables BLE
        this.deviceType = null;
        this.root = null;

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
                id: 'Duo',
                label: 'Duo',
                img: 'public/images/duo-logo-square-512.png',
                subtitle: 'Program your Duos via Chromadeck over Bluetooth',
            },
            {
                id: 'Spark',
                label: 'Spark',
                img: 'public/images/spark-logo-square-512.png',
                subtitle: 'Program your Spark Orbit or Handles over Bluetooth',
            },
            {
                id: 'Chromadeck',
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

        const skipLink = document.createElement('div');
        skipLink.className = 'skip-to-editor-link';
        skipLink.innerHTML = `<a href="#" id="skip-to-editor">Skip to Editor <i class="fa-solid fa-arrow-right-long" style="margin-left: 0.4em;"></i></a>`;
        this.root.querySelector('.container-fluid').appendChild(skipLink);

        this.root.querySelector('#skip-to-editor').addEventListener('click', async (e) => {
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
                instructions: 'Unplug the Chromadeck and switch it off and back on, then tap Connect and select the device.',
            };
        }

        // Spark connects to Spark (Orbit/Handles) — use your Spark Orbit icon
        return {
            deviceImg: 'public/images/spark-logo-square-512.png',
            deviceAlt: 'Spark',
            instructions: 'Open the Bluetooth menu on the Spark, then tap Connect and select Vortex Spark.',
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
                        // Optionally handle disconnection here
                    } else if (status === 'waiting') {
                        console.log('[Mobile] BLE connected, waiting for greeting...');
                        // Optional loading spinner UI could go here
                    } else if (status === 'failed') {
                        await this.renderEditor({ deviceType });
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
            // this is often used right after performing some operations and in
            // practice it was found that the operation could take time and this
            // could fire in another handler/thread and it would fail. By simply
            // waiting for about a second it ensures the other operations can pass
            // and then the mode is rendered afterward. A proper queue is needed.
            while (this.vortexPort.isTransmitting || !this.vortexPort.isActive()) {
                if (tries++ > 10) {
                    // failure
                    console.log("Failed to demo mode, waited 10 delays...");
                    return;
                }
                await this.sleep(100);
            }
            // demo the mode
            await this.vortexPort.demoCurMode(this.lightshow.vortexLib, this.lightshow.vortex);
        } catch (error) {
            Notification.failure("Failed to demo mode (" + error + ")");
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

    async renderEditor({ deviceType }) {
        // Duo-first for now
        if (deviceType !== 'Duo') {
            const frag = await this.views.render('device-selected.html', { deviceType });
            this.root.innerHTML = '';
            this.root.appendChild(frag);
            return;
        }

        // Ensure vortex exists but DO NOT create modes
        if (!this.vortex) {
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
                    //if (BLE.isBleConnected()) await BLE.disconnect();
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
            dotSize: 15,
            blurFac: 1,
            circleRadius: 180,
            spread: 50,
            direction: -1,
        });
        const ledCount = this.devices[deviceType].ledCount;
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
            // For now: create one mode locally and go to editor
            await this.startNewModeAndEnterEditor(deviceType);
        });

        const loadBtn = this.root.querySelector('#ms-load-device');
        if (!loadBtn) throw new Error('mode-source.html is missing #ms-load-device');
        loadBtn.addEventListener('click', async () => {
            console.log('[Mobile] Load Modes off Device (placeholder)');
            // duo pull mode flow:
            if (deviceType === 'Duo') {
                await this.renderDuoReceive({ deviceType });
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

    async listenVL() {
        if (!this.vortexPort.isActive()) {
            Notification.failure("Please connect a device first");
            return;
        }
        await this.vortexPort.listenVL(this.vortexLib, this.vortex);
    }

    nextFrame() {
        return new Promise((r) => requestAnimationFrame(() => r()));
    }

    async renderDuoReceive({ deviceType }) {
        const copy = {
            title: 'Waiting for Duo…',
            body: 'Point the Duo at the Chromadeck buttons and send the mode. The Chromadeck is already listening.',
            status: 'Starting…',
        };

        const frag = await this.views.render('duo-mode-receive.html', copy);
        this.root.innerHTML = '';
        this.root.appendChild(frag);

        const backBtn = this.root.querySelector('#back-btn');
        if (!backBtn) throw new Error('duo-mode-receive.html is missing #back-btn');

        backBtn.addEventListener('click', async () => {
            // invalidate this receive flow
            await this.renderModeSource({ deviceType });
        });

        const statusEl = this.root.querySelector('#duo-rx-status');
        const statusTextEl = this.root.querySelector('#duo-rx-status-text');
        const bodyEl = this.root.querySelector('#duo-rx-body');

        // allow the DOM to paint before we block on BLE
        //await this.nextFrame();
        //await this.nextFrame();

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
            if (bodyEl) bodyEl.textContent = 'Make sure the Duo is close to the Chromadeck, then send again.';
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

