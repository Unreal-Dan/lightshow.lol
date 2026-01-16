/* js/mobile/ColorPicker.js */

import LedSelectModal from './LedSelectModal.js';
import SimpleViews from './SimpleViews.js';
import SimpleDom from './SimpleDom.js';
import LedSelectionState from './LedSelectionState.js';

export default class ColorPicker {
  constructor({
    vortexLib,
    views = null,
    basePath = 'js/mobile/views/',
    ledSelectModal = null,

    // Host adapter (lets ColorPicker access Vortex + device meta + demo functions)
    // {
    //   getVortex: () => vortex,
    //   getDeviceType: () => 'Duo' | 'Spark' | 'Chromadeck',
    //   getDevices: () => devicesJson,
    //   demoMode: async () => {},
    //   demoColor: async (rgbColor) => {},
    //   notifyFailure: (msg) => {}
    // }
    host = null,
  } = {}) {
    this.vortexLib = vortexLib;
    this.views = views || new SimpleViews({ basePath });

    this.ledSelectModal =
      ledSelectModal ||
      new LedSelectModal({
        views: this.views,
        basePath,
      });

    this.host = host || null;

    // Selection state (moved out of VortexEditorMobile)
    this.ledSelectionState = new LedSelectionState();
    this._ledSelFallback = { sourceLed: 0, selectedLeds: null }; // null => all leds (single-led mode)

    this.root = null;
    this.dom = null;

    this.onDone = null;

    this.ctx = {
      title: 'Effects',
      ledCount: 2,
      ledIndex: 0,
      patternValue: -1,
      patternOptionsHtml: '',
      colorsetHtml: '',
      selectedColorIndex: null,
      pickerEnabled: false,

      deviceType: 'Duo',
      ledModalSummary: 'LEDs',

      // UI-provided state for LED modal
      ledSelectState: null, // { title, deviceName, imageSrc, imageSrcAlt, swapEnabled, positionsUrl, positionsUrlAlt, positions, selectedLeds, sourceLed }
    };

    this.cb = {
      onLedChange: null,
      onPatternChange: null,
      onColorsetSelect: null,
      onColorsetAdd: null,
      onColorsetDelete: null,
      onColorChange: null,
      onOff: null,
      onLedSelectApply: null,
    };

    this.state = { r: 255, g: 0, b: 0, h: 0, s: 255, v: 255 };
    this._prevent = false;

    this._preloaded = false;

    this._svRect = null;
    this._hueRect = null;

    this._throttleMs = 16;
    this._lastEmitAt = 0;
    this._pendingEmit = null;
    this._pendingTimer = 0;

    this._boundKeydown = null;

    // tap / pointer state
    this._squelchClickUntil = 0;
    this._lastPointerUpAt = 0;
    this._moved = false;
    this._startX = 0;
    this._startY = 0;

    // long-press delete (arm -> delete on release)
    this._lpTimer = 0;
    this._lpIdx = -1;
    this._lpCubeEl = null;
    this._lpArmed = false;

    // bound handlers (installed once)
    this._delegatedInstalled = false;
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onResize = this._onResize.bind(this);

    // tap target tracking (touch retargeting fix)
    this._tapTargetEl = null;
    this._tapOnBackdrop = false;

    // =========================================================
    // Device demo scheduling (color preview -> revert to mode)
    // =========================================================
    this._demoIdleMs = 2000;

    this._demoRevertTimer = 0;
    this._demoLastPreviewAt = 0;

    // Color preview coalescing/throttle (separate from _emit throttle)
    this._demoColorThrottleMs = 33;
    this._demoColorLastSendAt = 0;
    this._demoColorPending = null; // {r,g,b}
    this._demoColorTimer = 0;
  }

  setHost(host) {
    this.host = host || null;
  }

  _getVortex() {
    const h = this.host;
    if (!h) return null;
    try {
      if (typeof h.getVortex === 'function') return h.getVortex() || null;
    } catch {}
    return h.vortex || null;
  }

  _getDevicesJson() {
    const h = this.host;
    if (!h) return null;
    try {
      if (typeof h.getDevices === 'function') return h.getDevices() || null;
    } catch {}
    return h.devices || null;
  }

  _getHostDeviceType(fallback = 'Duo') {
    const h = this.host;
    if (!h) return fallback;
    try {
      if (typeof h.getDeviceType === 'function') {
        const v = h.getDeviceType();
        if (v != null) return String(v);
      }
    } catch {}
    if (h.deviceType != null) return String(h.deviceType);
    return fallback;
  }

  async _hostDemoMode() {
    const h = this.host;
    if (!h || typeof h.demoMode !== 'function') return;
    try {
      await h.demoMode();
    } catch {}
  }

  async _hostDemoColor(rgbColor) {
    const h = this.host;
    if (!h || typeof h.demoColor !== 'function') return;
    try {
      await h.demoColor(rgbColor);
    } catch {}
  }

  _hostFailure(msg) {
    const h = this.host;
    if (!h || typeof h.notifyFailure !== 'function') return;
    try {
      h.notifyFailure(String(msg || ''));
    } catch {}
  }

  _demoCancelRevertTimer() {
    if (this._demoRevertTimer) {
      clearTimeout(this._demoRevertTimer);
      this._demoRevertTimer = 0;
    }
  }

  _demoCancelColorTimer() {
    if (this._demoColorTimer) {
      clearTimeout(this._demoColorTimer);
      this._demoColorTimer = 0;
    }
    this._demoColorPending = null;
  }

  _demoNowMs() {
    return performance.now ? performance.now() : Date.now();
  }

  _demoScheduleRevertToMode() {
    this._demoCancelRevertTimer();

    const lastAt = (this._demoLastPreviewAt | 0) || Date.now();
    const delay = this._demoIdleMs;

    this._demoRevertTimer = setTimeout(() => {
      this._demoRevertTimer = 0;

      const dt = Date.now() - lastAt;
      if (dt + 8 < this._demoIdleMs) {
        // another preview happened since scheduling; reschedule from latest timestamp
        this._demoScheduleRevertToMode();
        return;
      }

      // Return to mode demo after inactivity
      this._demoCancelColorTimer();
      this._defer(() => this._hostDemoMode());
    }, delay);
  }

  _demoSendPendingColorNow() {
    const p = this._demoColorPending;
    if (!p) return;

    this._demoColorPending = null;
    this._demoColorLastSendAt = this._demoNowMs();

    try {
      const rgb = new this.vortexLib.RGBColor(p.r & 0xff, p.g & 0xff, p.b & 0xff);
      this._defer(() => this._hostDemoColor(rgb));
    } catch {}
  }

  _demoPreviewRgb(r, g, b) {
    const rr = this._clampByte(r);
    const gg = this._clampByte(g);
    const bb = this._clampByte(b);

    this._demoLastPreviewAt = Date.now();
    this._demoScheduleRevertToMode();

    this._demoColorPending = { r: rr, g: gg, b: bb };

    const now = this._demoNowMs();
    const dt = now - (this._demoColorLastSendAt || 0);

    if (dt >= this._demoColorThrottleMs) {
      this._demoSendPendingColorNow();
      return;
    }

    if (!this._demoColorTimer) {
      const wait = Math.max(0, this._demoColorThrottleMs - dt);
      this._demoColorTimer = setTimeout(() => {
        this._demoColorTimer = 0;
        this._demoSendPendingColorNow();
      }, wait);
    }
  }

  _demoPreviewFromState() {
    const { r, g, b } = this.state || { r: 0, g: 0, b: 0 };
    this._demoPreviewRgb(r, g, b);
  }

  _demoModeImmediate() {
    // Any non-color change should immediately return to mode demo.
    this._demoCancelRevertTimer();
    this._demoCancelColorTimer();
    this._defer(() => this._hostDemoMode());
  }

  _demoAfterColorsetChange() {
    if (this.ctx && this.ctx.pickerEnabled && this.ctx.selectedColorIndex != null) {
      this._demoPreviewFromState();
    } else {
      this._demoModeImmediate();
    }
  }

  async preload() {
    if (this._preloaded) return;
    await this.views.load('color-picker.html');
    this._preloaded = true;
  }

  mount() {
    if (this.root && this.root.parentElement === document.body) return;

    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }

    this.root = document.createElement('div');
    this.root.className = 'm-color-picker';
    document.body.appendChild(this.root);

    this.dom = new SimpleDom(this.root);

    if (!this._delegatedInstalled) {
      this._delegatedInstalled = true;

      this.root.addEventListener('pointerdown', this._onPointerDown, { passive: false });
      this.root.addEventListener('pointermove', this._onPointerMove, { passive: true });
      this.root.addEventListener('pointerup', this._onPointerUp, { passive: false });
      this.root.addEventListener('pointercancel', this._onPointerUp, { passive: false });

      // click fallback (mouse / non-pointer browsers). We squelch after pointer sequences.
      this.root.addEventListener('click', this._onClick, { passive: false });

      window.addEventListener('resize', this._onResize, { passive: true });
    }

    this.preload().catch(() => {});
  }

  close() {
    // Closing should always return to mode demo.
    this._demoModeImmediate();

    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = 0;
    }
    this._pendingEmit = null;

    this._svRect = null;
    this._hueRect = null;

    this._cancelLongPress();

    if (this._boundKeydown) {
      document.removeEventListener('keydown', this._boundKeydown);
      this._boundKeydown = null;
    }

    if (this.root) {
      this.root.innerHTML = '';
      this.root.classList.remove('is-open');
      this.root.style.pointerEvents = '';
    }

    this.onDone = null;
    this.cb = {
      onLedChange: null,
      onPatternChange: null,
      onColorsetSelect: null,
      onColorsetAdd: null,
      onColorsetDelete: null,
      onColorChange: null,
      onOff: null,
      onLedSelectApply: null,
    };

    this.ctx = {
      title: 'Effects',
      ledCount: 2,
      ledIndex: 0,
      patternValue: -1,
      patternOptionsHtml: '',
      colorsetHtml: '',
      selectedColorIndex: null,
      pickerEnabled: false,

      deviceType: 'Duo',
      ledModalSummary: 'LEDs',
      ledSelectState: null,
    };
  }

  isOpen() {
    return !!(this.root && this.root.classList.contains('is-open'));
  }

  ensureLedSelectionDefaults(ledCount) {
    this._ledSelEnsureDefaults(ledCount);
  }

  async openForCurrentMode({ deviceType = null, title = 'Effects' } = {}) {
    const vortex = this._getVortex();
    if (!vortex) {
      this._hostFailure('Vortex is unavailable');
      return;
    }

    const dt = String(deviceType || this._getHostDeviceType('Duo') || 'Duo');

    const engine = vortex.engine();
    const modes = engine.modes();
    const leds = engine.leds();

    const curMode = modes.curMode();
    if (!curMode) {
      this._hostFailure('No active mode');
      return;
    }

    const ledCount = (leds.ledCount() | 0) >>> 0;
    const multiIndex = leds.ledMulti() | 0;

    this._ledSelEnsureDefaults(ledCount);

    const isMulti = this._isMultiMode(curMode);
    const deviceMeta = this._getDevicesJson()?.[dt] || {};

    const eff = this._effectiveSelection(curMode);
    const srcLed = eff.sourceLed | 0;

    const set = curMode.getColorset(srcLed);
    const colors = this._extractColorsHexFromColorset(set);

    const initialSelectedColorIndex = colors.length ? 0 : null;
    const seedHex = initialSelectedColorIndex != null ? colors[initialSelectedColorIndex] : '#FF0000';
    const seedRgb = this._hexToRgb(seedHex);

    const allowMulti = dt !== 'None' && dt !== 'Duo';
    const patternOptionsHtml = this._patternOptionsHtml({ vortex, allowMulti });

    let patternValue = -1;
    try {
      patternValue = curMode.getPatternID(srcLed).value | 0;
    } catch {
      patternValue = -1;
    }

    const ledSelectState = {
      title: 'LEDs',
      deviceName: dt,
      imageSrc: deviceMeta?.image ?? null,
      imageSrcAlt: deviceMeta?.altImage ?? null,
      swapEnabled: !!deviceMeta?.altImage,
      positionsUrl: `public/data/${String(dt).toLowerCase()}-led-positions.json`,
      positionsUrlAlt: deviceMeta?.altLabel
        ? `public/data/${String(deviceMeta.altLabel).toLowerCase()}-led-positions.json`
        : null,
      selectedLeds: isMulti
        ? [multiIndex]
        : this._ledSelGetSingleSelected(ledCount) ?? Array.from({ length: ledCount }, (_, i) => i),
      sourceLed: isMulti ? multiIndex : this._ledSelGetSingleSource(ledCount),
    };

    await this.openEffects({
      title: String(title || 'Effects'),
      deviceType: dt,
      ledCount,

      // IMPORTANT: keep the Duo "selected LED" UI in sync with the colors/pattern we load
      ledIndex: srcLed,

      patternValue,
      patternOptionsHtml,

      colors,
      selectedColorIndex: initialSelectedColorIndex,
      rgb: seedRgb,

      ledModalSummary: this._ledSelGetSummary({ isMultiMode: isMulti, ledCount }),
      ledSelectState,

      onDone: () => {},

      onLedSelectApply: async (sourceLed, selectedLeds) => {
        const vortex2 = this._getVortex();
        if (!vortex2) return null;

        const cur = vortex2.engine().modes().curMode();
        if (!cur) return null;

        const lc = (vortex2.engine().leds().ledCount() | 0) >>> 0;
        const mi = vortex2.engine().leds().ledMulti() | 0;

        const isM = this._isMultiMode(cur);
        if (!isM) {
          this._ledSelSetFromModal({ ledCount: lc, sourceLed, selectedLeds });
        }

        const eff2 = this._effectiveSelection(cur);
        const src2 = eff2.sourceLed | 0;

        let patVal = -1;
        try {
          patVal = cur.getPatternID(src2).value | 0;
        } catch {
          patVal = -1;
        }

        const set2 = cur.getColorset(src2);
        const cols2 = this._extractColorsHexFromColorset(set2);

        const selIdx = cols2.length ? 0 : null;
        const rgb2 = cols2.length ? this._hexToRGB(cols2[0]) : { r: 255, g: 0, b: 0 };

        const nextSummary = this._ledSelGetSummary({ isMultiMode: eff2.isMulti, ledCount: lc });

        return {
          // keep duo UI in sync too (even though modal isn't used for Duo)
          ledIndex: src2,

          ledModalSummary: nextSummary,
          ledSelectState: {
            ...ledSelectState,
            selectedLeds: eff2.isMulti
              ? [mi]
              : this._ledSelGetSingleSelected(lc) ?? Array.from({ length: lc }, (_, i) => i),
            sourceLed: eff2.isMulti ? mi : this._ledSelGetSingleSource(lc),
          },

          patternValue: patVal,
          colors: cols2,
          selectedColorIndex: selIdx,
          rgb: rgb2,
        };
      },

      onPatternChange: async (newPatternValue) => {
        const vortex2 = this._getVortex();
        if (!vortex2) return null;

        const cur2 = vortex2.engine().modes().curMode();
        if (!cur2) return null;

        const patID = this.vortexLib.PatternID.values[String(newPatternValue)];
        if (!patID) return null;

        this._applyPatternToSelection(patID);

        const isM2 = this._isMultiMode(cur2);

        const lc = (vortex2.engine().leds().ledCount() | 0) >>> 0;
        return {
          patternValue: newPatternValue | 0,
          ledModalSummary: this._ledSelGetSummary({ isMultiMode: isM2, ledCount: lc }),
        };
      },

      onColorsetSelect: async (idx) => {
        const vortex2 = this._getVortex();
        if (!vortex2) return null;

        const cur2 = vortex2.engine().modes().curMode();
        if (!cur2) return null;

        const lc = (vortex2.engine().leds().ledCount() | 0) >>> 0;

        const eff2 = this._effectiveSelection(cur2);
        const set2 = cur2.getColorset(eff2.sourceLed);
        const cols2 = this._extractColorsHexFromColorset(set2);

        const sel = idx | 0;
        const hx = cols2[sel] || cols2[0] || '#FF0000';
        const rgb = this._hexToRgb(hx);

        return {
          colors: cols2,
          selectedColorIndex: cols2.length ? Math.max(0, Math.min(sel, cols2.length - 1)) : null,
          rgb,
          ledModalSummary: this._ledSelGetSummary({ isMultiMode: eff2.isMulti, ledCount: lc }),
        };
      },

      onColorsetAdd: async () => {
        const res = this._applyColorsetMutation((setX) => {
          setX.addColor(new this.vortexLib.RGBColor(255, 0, 0));
        });
        if (!res) return null;

        const cols2 = this._extractColorsHexFromColorset(res.set);
        const selectedColorIndex = cols2.length ? cols2.length - 1 : null;

        return {
          colors: cols2,
          selectedColorIndex,
          rgb: { r: 255, g: 0, b: 0 },
        };
      },

      onColorsetDelete: async (idx) => {
        const delIdx = idx | 0;

        const res = this._applyColorsetMutation((setX) => {
          if ((setX.numColors() | 0) <= 0) return;
          setX.removeColor(delIdx);
        });
        if (!res) return null;

        const cols2 = this._extractColorsHexFromColorset(res.set);
        const selectedColorIndex = cols2.length ? Math.min(delIdx, cols2.length - 1) : null;

        let rgb = null;
        if (selectedColorIndex != null) {
          rgb = this._hexToRgb(cols2[selectedColorIndex] || '#000000');
        }

        return { colors: cols2, selectedColorIndex, rgb };
      },

      onColorChange: async (colorIndex, hex, isDragging) => {
        const { r, g, b } = this._hexToRgb(hex);

        this._applyColorsetMutation((setX) => {
          const i = colorIndex | 0;
          if (i < 0 || i >= (setX.numColors() | 0)) return;
          setX.set(i, new this.vortexLib.RGBColor(r, g, b));
        });

        // Color preview is handled by ColorPicker itself (realtime + 2s revert).
        // Keep callback focused on mutating the underlying mode.
        void isDragging;
      },

      onOff: async () => {
        this._applyColorsetMutation((setX) => {
          if ((setX.numColors() | 0) <= 0) {
            setX.addColor(new this.vortexLib.RGBColor(0, 0, 0));
          } else {
            setX.set(0, new this.vortexLib.RGBColor(0, 0, 0));
          }
        });
      },
    });
  }

  async openEffects({
    title = 'Effects',
    ledCount = 2,
    ledIndex = 0,
    patternValue = -1,
    patternOptionsHtml = '',
    colors = [],
    selectedColorIndex = null,
    rgb = null,

    deviceType = 'Duo',
    ledModalSummary = 'LEDs',
    ledSelectState = null,

    onDone = null,
    onLedChange = null,
    onPatternChange = null,
    onColorsetSelect = null,
    onColorsetAdd = null,
    onColorsetDelete = null,
    onColorChange = null,
    onOff = null,
    onLedSelectApply = null,
  } = {}) {
    if (!this.root || !this.dom) return;

    await this.preload();

    this.onDone = typeof onDone === 'function' ? onDone : null;

    this.cb.onLedChange = typeof onLedChange === 'function' ? onLedChange : null;
    this.cb.onPatternChange = typeof onPatternChange === 'function' ? onPatternChange : null;
    this.cb.onColorsetSelect = typeof onColorsetSelect === 'function' ? onColorsetSelect : null;
    this.cb.onColorsetAdd = typeof onColorsetAdd === 'function' ? onColorsetAdd : null;
    this.cb.onColorsetDelete = typeof onColorsetDelete === 'function' ? onColorsetDelete : null;
    this.cb.onColorChange = typeof onColorChange === 'function' ? onColorChange : null;
    this.cb.onOff = typeof onOff === 'function' ? onOff : null;
    this.cb.onLedSelectApply = typeof onLedSelectApply === 'function' ? onLedSelectApply : null;

    const lc = Math.max(0, ledCount | 0);
    const li = Math.max(0, Math.min(Math.max(0, lc - 1), ledIndex | 0));

    this.ctx.title = String(title || 'Effects');
    this.ctx.ledCount = lc;
    this.ctx.ledIndex = li;
    this.ctx.patternValue = Number.isFinite(patternValue) ? (patternValue | 0) : -1;
    this.ctx.patternOptionsHtml = String(patternOptionsHtml || '');

    this.ctx.deviceType = String(deviceType || 'Duo');
    this.ctx.ledModalSummary = String(ledModalSummary || 'LEDs');
    this.ctx.ledSelectState = ledSelectState && typeof ledSelectState === 'object' ? ledSelectState : null;

    this.ctx.selectedColorIndex = selectedColorIndex == null ? null : Math.max(0, selectedColorIndex | 0);

    this.ctx.colorsetHtml = this._buildColorsetHtml(colors, this.ctx.selectedColorIndex);
    this.ctx.pickerEnabled = this.ctx.selectedColorIndex != null;

    let seed = rgb;
    if (!seed && Array.isArray(colors) && this.ctx.selectedColorIndex != null) {
      const hx = colors[this.ctx.selectedColorIndex];
      if (hx) seed = this._hexToRGB(hx);
    }
    if (!seed) seed = { r: 255, g: 0, b: 0 };

    const r = this._clampByte(seed?.r ?? 255);
    const g = this._clampByte(seed?.g ?? 0);
    const b = this._clampByte(seed?.b ?? 0);

    const hsv = this.rgbToHsv(r, g, b);
    this.state = { r, g, b, h: hsv.h, s: hsv.s, v: hsv.v };

    this.root.classList.add('is-open');

    if (!this.ledSelectModal) {
      this.ledSelectModal = new LedSelectModal({ views: this.views, basePath: 'js/mobile/views/' });
    }
    this.ledSelectModal.mount();

    await this._render();
    this._bindPerRender();

    if (!this._boundKeydown) {
      this._boundKeydown = (e) => {
        if (e.key === 'Escape') {
          this._fastDone();
        }
      };
      document.addEventListener('keydown', this._boundKeydown);
    }

    await this._nextFrame();
    this._cacheRects();
    this._syncUI(true);
    this._syncEffectsUI();
  }

  rgbToHsv(r, g, b) {
    const RGBCol = new this.vortexLib.RGBColor(r & 0xff, g & 0xff, b & 0xff);
    const HSVCol = this.vortexLib.rgb_to_hsv_generic(RGBCol);
    return { h: HSVCol.hue & 0xff, s: HSVCol.sat & 0xff, v: HSVCol.val & 0xff };
  }

  hsvToRgb(h, s, v) {
    const HSVCol = new this.vortexLib.HSVColor(h & 0xff, s & 0xff, v & 0xff);
    const RGBCol = this.vortexLib.hsv_to_rgb_generic(HSVCol);
    return { r: RGBCol.red & 0xff, g: RGBCol.green & 0xff, b: RGBCol.blue & 0xff };
  }

  async _nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  _defer(fn) {
    setTimeout(() => {
      Promise.resolve()
        .then(fn)
        .catch(() => {});
    }, 0);
  }

  _getEngine() {
    const vortex = this._getVortex();
    return vortex ? vortex.engine() : null;
  }
  _getModes() {
    const e = this._getEngine();
    return e ? e.modes() : null;
  }
  _getCurMode() {
    const m = this._getModes();
    return m ? m.curMode() : null;
  }
  _getLedCountForDevice() {
    const e = this._getEngine();
    return e ? (e.leds().ledCount() | 0) : (this.ctx.ledCount | 0);
  }
  _getMultiIndex() {
    const e = this._getEngine();
    return e ? (e.leds().ledMulti() | 0) : 0;
  }
  _isMultiMode(curMode) {
    return !!(curMode && curMode.isMultiLed && curMode.isMultiLed());
  }

  async _render() {
    const { r, g, b, h, s, v } = this.state;
    const hex = this._rgbToHex(r, g, b);
    const hueDeg = String((h / 255) * 360);

    const led0Active = this.ctx.ledIndex === 0 ? 'is-active' : '';
    const led1Active = this.ctx.ledIndex === 1 ? 'is-active' : '';
    const showLed1 = this.ctx.ledCount >= 2 ? '' : 'hidden';

    const pickerDisabledClass = this.ctx.pickerEnabled ? '' : 'is-disabled';

    const isDuo = String(this.ctx.deviceType || '').toLowerCase() === 'duo';
    const ledPairHidden = isDuo ? '' : 'hidden';
    const ledModalHidden = isDuo ? 'hidden' : '';
    const ledModalSummary = String(this.ctx.ledModalSummary || 'LEDs');

    const frag = await this.views.render('color-picker.html', {
      title: this.ctx.title,
      led0Active,
      led1Active,
      showLed1,
      patternOptions: this.ctx.patternOptionsHtml,
      colorsetHtml: this.ctx.colorsetHtml,
      pickerDisabledClass,
      r,
      g,
      b,
      h,
      s,
      v,
      hex,
      hueDeg,

      ledPairHidden,
      ledModalHidden,
      ledModalSummary,
    });

    this.root.innerHTML = '';
    this.root.appendChild(frag);

    this.dom = new SimpleDom(this.root);
  }

  _onResize() {
    if (!this.root || !this.root.classList.contains('is-open')) return;
    this._cacheRects();
    this._syncUI(true);
    this._syncEffectsUI();
  }

  _cacheRects() {
    const svBox = this.dom.$('[data-role="svbox"]');
    const hueSlider = this.dom.$('[data-role="hueslider"]');
    this._svRect = svBox ? svBox.getBoundingClientRect() : null;
    this._hueRect = hueSlider ? hueSlider.getBoundingClientRect() : null;
  }

  _syncEffectsUI() {
    const patSel = this.dom.$('[data-role="pattern"]');
    if (patSel) patSel.value = String(this.ctx.patternValue ?? -1);

    const body = this.dom.$('.m-cp-body');
    if (body) body.classList.toggle('is-disabled', !this.ctx.pickerEnabled);

    const hint = this.dom.$('[data-role="pick-hint"]');
    if (hint) hint.style.display = this.ctx.pickerEnabled ? 'none' : 'block';

    this.dom.all('[data-role="cube"][data-kind="color"]').forEach((cube) => {
      const idx = Number(cube.dataset.index ?? -1);
      const sel = this.ctx.selectedColorIndex != null && idx === this.ctx.selectedColorIndex;
      cube.classList.toggle('is-selected', !!sel);
    });
  }

  _fastDone() {
    if (!this.root) return;

    // Closing should always return to mode demo.
    this._demoModeImmediate();

    this.root.classList.remove('is-open');
    this.root.style.pointerEvents = 'none';

    requestAnimationFrame(() => {
      if (!this.root) return;
      if (!this.root.classList.contains('is-open')) {
        this.root.innerHTML = '';
      }
      this.root.style.pointerEvents = '';
    });

    const fn = this.onDone;
    if (typeof fn === 'function') {
      this._defer(() => fn());
    }
  }

  _cancelLongPress() {
    if (this._lpTimer) {
      clearTimeout(this._lpTimer);
      this._lpTimer = 0;
    }
    if (this._lpCubeEl) {
      this._lpCubeEl.classList.remove('is-delete-armed');
    }
    this._lpIdx = -1;
    this._lpCubeEl = null;
    this._lpArmed = false;
  }

  _onPointerDown(e) {
    if (!this.root || !this.root.classList.contains('is-open')) return;

    this._moved = false;
    this._startX = e.clientX;
    this._startY = e.clientY;

    const sheet = this.dom.$('.m-color-picker-sheet');
    this._tapOnBackdrop = !!(sheet && !sheet.contains(e.target));

    // casing-safe data-role matching
    this._tapTargetEl =
      e.target?.closest?.('[data-act],[data-role="ledmodal" i],[data-role="led" i],[data-role="cube"]') || null;

    const cube = e.target?.closest?.('[data-role="cube"][data-kind="color"]');
    if (!cube) {
      this._cancelLongPress();
      return;
    }

    const idx = Number(cube.dataset.index ?? -1) | 0;
    if (idx < 0) return;

    this._cancelLongPress();

    this._lpIdx = idx;
    this._lpCubeEl = cube;
    this._lpArmed = false;

    this._lpTimer = setTimeout(() => {
      this._lpTimer = 0;
      if (!this._lpCubeEl) return;
      this._lpArmed = true;
      this._lpCubeEl.classList.add('is-delete-armed');
    }, 420);
  }

  _onPointerMove(e) {
    if (!this.root || !this.root.classList.contains('is-open')) return;
    if (this._moved) return;

    const dx = Math.abs((e.clientX ?? this._startX) - this._startX);
    const dy = Math.abs((e.clientY ?? this._startY) - this._startY);

    if (dx > 8 || dy > 8) {
      this._moved = true;
      this._tapTargetEl = null;
      this._tapOnBackdrop = false;
      this._cancelLongPress();
    }
  }

  async _onPointerUp(e) {
    if (!this.root || !this.root.classList.contains('is-open')) return;

    this._lastPointerUpAt = Date.now();
    this._squelchClickUntil = this._lastPointerUpAt + 450;

    if (this._lpArmed && this.cb.onColorsetDelete && this._lpIdx >= 0) {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}

      const idx = this._lpIdx;

      this._tapTargetEl = null;
      this._tapOnBackdrop = false;

      this._cancelLongPress();

      this._optimisticDeleteFromDom(idx);

      this._defer(async () => {
        const next = await this.cb.onColorsetDelete(idx);
        await this._applyCtx(next);
        this._demoAfterColorsetChange();
      });

      return;
    }

    if (this._lpTimer) this._cancelLongPress();

    if (this._moved) {
      this._tapTargetEl = null;
      this._tapOnBackdrop = false;
      return;
    }

    if (this._tapOnBackdrop) {
      this._tapTargetEl = null;
      this._tapOnBackdrop = false;
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}
      this._fastDone();
      return;
    }

    const t = (this._tapTargetEl && this.root.contains(this._tapTargetEl) && this._tapTargetEl) || e.target;

    this._tapTargetEl = null;
    this._tapOnBackdrop = false;

    await this._handleTapTarget({
      target: t,
      preventDefault: () => {
        try {
          e.preventDefault();
        } catch {}
      },
      stopPropagation: () => {
        try {
          e.stopPropagation();
        } catch {}
      },
    });
  }

  async _onClick(e) {
    if (Date.now() < this._squelchClickUntil) {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}
      return;
    }

    if (!this.root || !this.root.classList.contains('is-open')) return;
    await this._handleTapTarget(e);
  }

  async _handleTapTarget(e) {
    const t = e?.target;
    if (!t) return;

    const sheet = this.dom.$('.m-color-picker-sheet');
    if (sheet && !sheet.contains(t)) {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}
      this._fastDone();
      return;
    }

    const actBtn = t.closest?.('[data-act]');
    if (actBtn) {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}
      const act = String(actBtn.dataset.act || '');

      if (act === 'done') {
        this._fastDone();
        return;
      }

      if (act === 'off') {
        if (!this.ctx.pickerEnabled) return;
        if (this.cb.onOff) {
          this._defer(async () => {
            await this.cb.onOff();
            // Off is a change; show the selected color (black) then revert to mode.
            this._demoPreviewFromState();
          });
        }
        this._setRGB(0, 0, 0, true);
        this._emit(false, true);
        return;
      }

      if (act === 'delete') {
        if (!this.ctx.pickerEnabled) return;
        if (!this.cb.onColorsetDelete || this.ctx.selectedColorIndex == null) return;

        const idx = this.ctx.selectedColorIndex | 0;

        this._optimisticDeleteFromDom(idx);

        this._defer(async () => {
          const next = await this.cb.onColorsetDelete(idx);
          await this._applyCtx(next);
          this._demoAfterColorsetChange();
        });
        return;
      }
    }

    const roleEl = t.closest?.('[data-role]') || null;
    const role = roleEl ? String(roleEl.dataset.role || '').toLowerCase() : '';

    if (role === 'ledmodal') {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}

      const isDuo = String(this.ctx.deviceType || '').toLowerCase() === 'duo';
      if (isDuo) return;

      const curMode = this._getCurMode();
      const isMulti = this._isMultiMode(curMode);
      if (isMulti) return;

      if (!this.ledSelectModal) {
        this.ledSelectModal = new LedSelectModal({ views: this.views, basePath: 'js/mobile/views/' });
      }
      this.ledSelectModal.mount();

      const st = this.ctx.ledSelectState && typeof this.ctx.ledSelectState === 'object' ? this.ctx.ledSelectState : {};

      const total = this.ctx.ledCount | 0;
      const initialSource = Number.isFinite(st.sourceLed) ? (st.sourceLed | 0) : 0;

      const initialSelected =
        Array.isArray(st.selectedLeds) && st.selectedLeds.length
          ? st.selectedLeds
          : total > 0
            ? Array.from({ length: total }, (_, i) => i)
            : [];

      const restorePickerPointerEvents = () => {
        try {
          if (this.root) this.root.style.pointerEvents = '';
        } catch {}
      };
      try {
        if (this.root) this.root.style.pointerEvents = 'none';
      } catch {}

      await this.ledSelectModal.open({
        title: String(st.title || 'LEDs'),
        ledCount: total,

        deviceName: st.deviceName ?? null,
        imageSrc: st.imageSrc ?? null,
        imageSrcAlt: st.imageSrcAlt ?? null,
        swapEnabled: !!st.swapEnabled,

        positions: st.positions ?? null,
        positionsUrl: st.positionsUrl ?? null,
        positionsUrlAlt: st.positionsUrlAlt ?? null,

        selectedLeds: initialSelected,
        sourceLed: initialSource,

        onDone: ({ sourceLed, selectedLeds }) => {
          restorePickerPointerEvents();

          if (typeof this.cb.onLedSelectApply !== 'function') return;

          this._defer(async () => {
            const next = await this.cb.onLedSelectApply(
              sourceLed | 0,
              Array.isArray(selectedLeds) ? selectedLeds : []
            );
            await this._applyCtx(next, { keepPickerSeed: true });

            // Selection change is a change; demo mode immediately.
            this._demoModeImmediate();
          });
        },

        onCancel: () => {
          restorePickerPointerEvents();
          // Canceling just returns focus; keep whatever is currently demoing.
        },
      });

      return;
    }

    if (role === 'led') {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}

      const isDuo = String(this.ctx.deviceType || '').toLowerCase() === 'duo';
      if (!isDuo) return;

      const ledBtn = t.closest?.('[data-role]');
      const led = Number(ledBtn?.dataset.led ?? 0) | 0;

      this.dom.all('[data-role="led"]').forEach((b) => b.classList.remove('is-active'));
      ledBtn?.classList?.add?.('is-active');

      // If the host wired onLedChange, use it.
      if (typeof this.cb.onLedChange === 'function') {
        this._defer(async () => {
          const next = await this.cb.onLedChange(led);
          await this._applyCtx(next);
          this._demoModeImmediate();
        });
        return;
      }

      // Fallback: Duo LED buttons directly select a single LED (source + selected)
      // and rebuild picker state from the current mode.
      const vortex = this._getVortex();
      if (!vortex) return;

      const engine = vortex.engine?.();
      const curMode = engine?.modes?.()?.curMode?.();
      if (!curMode) return;

      const lc = (engine?.leds?.()?.ledCount?.() | 0) >>> 0;
      if (lc <= 0) return;

      const clampedLed = Math.max(0, Math.min(lc - 1, led | 0));

      // Store the selection in the same mechanism used for non-Duo devices
      this._ledSelSetFromModal({ ledCount: lc, sourceLed: clampedLed, selectedLeds: [clampedLed] });

      let patVal = -1;
      try {
        patVal = curMode.getPatternID(clampedLed).value | 0;
      } catch {
        patVal = -1;
      }

      const set = curMode.getColorset(clampedLed);
      const cols = this._extractColorsHexFromColorset(set);

      const selIdx = cols.length ? 0 : null;
      const rgb = cols.length ? this._hexToRGB(cols[0]) : { r: 255, g: 0, b: 0 };

      await this._applyCtx(
        {
          ledCount: lc,
          ledIndex: clampedLed,
          patternValue: patVal,
          colors: cols,
          selectedColorIndex: selIdx,
          rgb,
        },
        { keepPickerSeed: false }
      );

      this._demoModeImmediate();
      return;
    }

    const cube = t.closest?.('[data-role="cube"]');
    if (cube) {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}

      const kind = String(cube.dataset.kind || '');
      const idx = Number(cube.dataset.index ?? -1) | 0;

      if (kind === 'add') {
        cube.classList.add('is-busy');

        const newIdx = this._optimisticAddFromPlus(cube);
        if (newIdx == null || !this.cb.onColorsetAdd) return;

        this._defer(async () => {
          const next = await this.cb.onColorsetAdd();
          await this._applyCtx(next);
          this._demoAfterColorsetChange();
        });

        return;
      }

      if (kind === 'color') {
        this._selectCubeUI(idx);

        const hex = this._extractHexFromCube(cube);
        if (hex) this._seedPickerFromHex(hex);

        // Selecting a color cube should preview the selected color immediately (then revert to mode).
        if (this.ctx.pickerEnabled) this._demoPreviewFromState();

        if (!this.cb.onColorsetSelect) return;

        this._defer(async () => {
          const next = await this.cb.onColorsetSelect(idx);
          await this._applyCtx(next, { keepPickerSeed: true });
          // Keep showing the picked color; revert is already scheduled by preview above.
        });

        return;
      }

      return;
    }
  }

  _selectCubeUI(idx) {
    this.ctx.selectedColorIndex = idx;
    this.ctx.pickerEnabled = idx != null;

    this.dom.all('[data-role="cube"][data-kind="color"]').forEach((cube) => {
      const i = Number(cube.dataset.index ?? -1);
      cube.classList.toggle('is-selected', i === idx);
    });

    const body = this.dom.$('.m-cp-body');
    if (body) body.classList.toggle('is-disabled', !this.ctx.pickerEnabled);

    const hint = this.dom.$('[data-role="pick-hint"]');
    if (hint) hint.style.display = this.ctx.pickerEnabled ? 'none' : 'block';
  }

  _seedPickerFromHex(hex) {
    const { r, g, b } = this._hexToRGB(hex);
    const hsv = this.rgbToHsv(r, g, b);
    this.state = { r, g, b, h: hsv.h, s: hsv.s, v: hsv.v };
    this._cacheRects();
    this._syncUI(true);
  }

  _extractHexFromCube(cubeEl) {
    if (!cubeEl) return null;

    const inline = String(cubeEl.style.background || cubeEl.style.backgroundColor || '').trim();
    let m = inline.match(/#([0-9a-fA-F]{6})/);
    if (m) return `#${m[1].toUpperCase()}`;

    let bg = '';
    try {
      bg = String(getComputedStyle(cubeEl).backgroundColor || '').trim();
    } catch {
      bg = '';
    }

    const m2 = bg.match(
      /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i
    );
    if (!m2) return null;

    const r = this._clampByte(Math.round(parseFloat(m2[1])));
    const g = this._clampByte(Math.round(parseFloat(m2[2])));
    const b = this._clampByte(Math.round(parseFloat(m2[3])));

    return this._rgbToHex(r, g, b);
  }

  _snapshotColorsFromDom() {
    const cubes = this.dom
      .all('[data-role="cube"][data-kind="color"]')
      .slice()
      .sort((a, b) => (Number(a.dataset.index ?? 0) | 0) - (Number(b.dataset.index ?? 0) | 0));

    const out = [];
    for (const c of cubes) {
      const hx = this._extractHexFromCube(c) || '#000000';
      out.push(hx);
      if (out.length >= 8) break;
    }
    return out;
  }

  _optimisticDeleteFromDom(deleteIdx) {
    const colors = this._snapshotColorsFromDom();
    const idx = deleteIdx | 0;
    if (idx < 0 || idx >= colors.length) return false;

    colors.splice(idx, 1);

    const prevSel = this.ctx.selectedColorIndex == null ? null : (this.ctx.selectedColorIndex | 0);
    let nextSel = prevSel;

    if (prevSel == null) {
      nextSel = null;
    } else if (prevSel === idx) {
      nextSel = colors.length ? Math.min(idx, colors.length - 1) : null;
    } else if (prevSel > idx) {
      nextSel = prevSel - 1;
    } else {
      nextSel = prevSel;
      if (colors.length === 0) nextSel = null;
      else if (nextSel >= colors.length) nextSel = colors.length - 1;
    }

    this.ctx.selectedColorIndex = nextSel;
    this.ctx.pickerEnabled = nextSel != null;

    this.ctx.colorsetHtml = this._buildColorsetHtml(colors, this.ctx.selectedColorIndex);

    const row = this.dom.$('[data-role="colorset-row"]');
    if (row) row.innerHTML = this.ctx.colorsetHtml;

    this._syncEffectsUI();

    if (this.ctx.selectedColorIndex != null) {
      const hx = colors[this.ctx.selectedColorIndex | 0];
      if (hx) this._seedPickerFromHex(hx);
    }

    return true;
  }

  _optimisticAddFromPlus(plusBtn) {
    const row = this.dom.$('[data-role="colorset-row"]');
    if (!row || !plusBtn) return null;

    const colorBtns = this.dom.all('[data-role="cube"][data-kind="color"]');
    const newIdx = colorBtns.length | 0;
    if (newIdx < 0 || newIdx >= 8) return null;

    plusBtn.classList.remove('is-add', 'is-busy');
    plusBtn.classList.add('is-selected');
    plusBtn.textContent = '';
    plusBtn.dataset.kind = 'color';
    plusBtn.dataset.index = String(newIdx);
    plusBtn.style.background = '#FF0000';

    const empties = this.dom.all('[data-role="cube"][data-kind="empty"]');
    const nextEmpty = empties.length ? empties[0] : null;
    if (nextEmpty) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'm-color-cube is-add';
      add.dataset.role = 'cube';
      add.dataset.kind = 'add';
      add.dataset.index = String(newIdx + 1);
      add.textContent = '+';
      nextEmpty.replaceWith(add);
    }

    this.dom.all('[data-role="cube"][data-kind="color"]').forEach((b) => {
      const i = Number(b.dataset.index ?? -1);
      b.classList.toggle('is-selected', i === newIdx);
    });

    this.ctx.selectedColorIndex = newIdx;
    this.ctx.pickerEnabled = true;

    const body = this.dom.$('.m-cp-body');
    if (body) body.classList.remove('is-disabled');

    const hint = this.dom.$('[data-role="pick-hint"]');
    if (hint) hint.style.display = 'none';

    this._seedPickerFromHex('#FF0000');

    return newIdx;
  }

  async _applyCtx(next, { keepPickerSeed = false } = {}) {
    if (!next || typeof next !== 'object') return;

    if (Number.isFinite(next.ledCount)) this.ctx.ledCount = next.ledCount | 0;
    if (Number.isFinite(next.ledIndex)) this.ctx.ledIndex = next.ledIndex | 0;
    if (Number.isFinite(next.patternValue)) this.ctx.patternValue = next.patternValue | 0;
    if (typeof next.patternOptionsHtml === 'string') this.ctx.patternOptionsHtml = next.patternOptionsHtml;

    if (typeof next.deviceType === 'string') this.ctx.deviceType = next.deviceType;
    if (typeof next.ledModalSummary === 'string') this.ctx.ledModalSummary = next.ledModalSummary;
    if (next.ledSelectState && typeof next.ledSelectState === 'object') this.ctx.ledSelectState = next.ledSelectState;

    const newSelected = next.selectedColorIndex == null ? null : Math.max(0, next.selectedColorIndex | 0);
    this.ctx.selectedColorIndex = newSelected;

    if (Array.isArray(next.colors)) {
      this.ctx.colorsetHtml = this._buildColorsetHtml(next.colors, this.ctx.selectedColorIndex);
    }

    this.ctx.pickerEnabled = this.ctx.selectedColorIndex != null;

    if (!keepPickerSeed) {
      let seed = next.rgb || null;
      if (!seed && Array.isArray(next.colors) && this.ctx.selectedColorIndex != null) {
        const hx = next.colors[this.ctx.selectedColorIndex];
        if (hx) seed = this._hexToRGB(hx);
      }
      if (seed) {
        const r = this._clampByte(seed.r);
        const g = this._clampByte(seed.g);
        const b = this._clampByte(seed.b);
        const hsv = this.rgbToHsv(r, g, b);
        this.state = { r, g, b, h: hsv.h, s: hsv.s, v: hsv.v };
      }
    }

    await this._render();
    this._bindPerRender();

    await this._nextFrame();
    this._cacheRects();
    this._syncUI(true);
    this._syncEffectsUI();
  }

  _bindPerRender() {
    const patSel = this.dom.$('[data-role="pattern"]');
    if (patSel) {
      patSel.addEventListener('change', () => {
        const v = parseInt(String(patSel.value ?? '-1'), 10);
        this.ctx.patternValue = Number.isFinite(v) ? (v | 0) : -1;

        if (!this.cb.onPatternChange) return;

        this._defer(async () => {
          const next = await this.cb.onPatternChange(this.ctx.patternValue);
          await this._applyCtx(next, { keepPickerSeed: true });

          // Pattern change is a change; demo the mode immediately.
          this._demoModeImmediate();
        });
      });
    }

    const pickerDisabled = () => !this.ctx.pickerEnabled;

    const svBox = this.dom.$('[data-role="svbox"]');
    const hueSlider = this.dom.$('[data-role="hueslider"]');

    if (svBox) {
      svBox.addEventListener('pointerdown', (e) => {
        if (pickerDisabled()) return;
        e.preventDefault();
        e.stopPropagation();

        this._cacheRects();
        svBox.setPointerCapture(e.pointerId);

        this._handleSvPointer(e, true);

        const onMove = (ev) => this._handleSvPointer(ev, true);
        const onUp = (ev) => {
          svBox.removeEventListener('pointermove', onMove);
          svBox.removeEventListener('pointerup', onUp);
          svBox.removeEventListener('pointercancel', onUp);
          this._handleSvPointer(ev, true);
        };

        svBox.addEventListener('pointermove', onMove);
        svBox.addEventListener('pointerup', onUp, { once: true });
        svBox.addEventListener('pointercancel', onUp, { once: true });
      });
    }

    if (hueSlider) {
      hueSlider.addEventListener('pointerdown', (e) => {
        if (pickerDisabled()) return;
        e.preventDefault();
        e.stopPropagation();

        this._cacheRects();
        hueSlider.setPointerCapture(e.pointerId);

        this._handleHuePointer(e, true);

        const onMove = (ev) => this._handleHuePointer(ev, true);
        const onUp = (ev) => {
          hueSlider.removeEventListener('pointermove', onMove);
          hueSlider.removeEventListener('pointerup', onUp);
          hueSlider.removeEventListener('pointercancel', onUp);
          this._handleHuePointer(ev, true);
        };

        hueSlider.addEventListener('pointermove', onMove);
        hueSlider.addEventListener('pointerup', onUp, { once: true });
        hueSlider.addEventListener('pointercancel', onUp, { once: true });
      });
    }

    const rRange = this.dom.$('[data-role="r"]');
    const gRange = this.dom.$('[data-role="g"]');
    const bRange = this.dom.$('[data-role="b"]');

    const rIn = this.dom.$('[data-role="rin"]');
    const gIn = this.dom.$('[data-role="gin"]');
    const bIn = this.dom.$('[data-role="bin"]');

    const hIn = this.dom.$('[data-role="hin"]');
    const sIn = this.dom.$('[data-role="sin"]');
    const vIn = this.dom.$('[data-role="vin"]');

    const hexIn = this.dom.$('[data-role="hex"]');

    const onRgbRange = (isDragging) => {
      if (pickerDisabled()) return;
      const r = this._clampByte(parseInt(rRange?.value ?? '0', 10));
      const g = this._clampByte(parseInt(gRange?.value ?? '0', 10));
      const b = this._clampByte(parseInt(bRange?.value ?? '0', 10));
      this._setRGB(r, g, b, true);
      this._emit(isDragging, false);
    };

    if (rRange) {
      rRange.addEventListener('input', () => onRgbRange(true));
      rRange.addEventListener('change', () => onRgbRange(false));
    }
    if (gRange) {
      gRange.addEventListener('input', () => onRgbRange(true));
      gRange.addEventListener('change', () => onRgbRange(false));
    }
    if (bRange) {
      bRange.addEventListener('input', () => onRgbRange(true));
      bRange.addEventListener('change', () => onRgbRange(false));
    }

    const onRgbNum = () => {
      if (pickerDisabled()) return;
      const r = this._clampByte(parseInt(rIn?.value ?? '0', 10));
      const g = this._clampByte(parseInt(gIn?.value ?? '0', 10));
      const b = this._clampByte(parseInt(bIn?.value ?? '0', 10));
      this._setRGB(r, g, b, true);
      this._emit(false, true);
    };

    if (rIn) rIn.addEventListener('input', onRgbNum);
    if (gIn) gIn.addEventListener('input', onRgbNum);
    if (bIn) bIn.addEventListener('input', onRgbNum);

    const onHsvNum = () => {
      if (pickerDisabled()) return;
      const h = this._clampByte(parseInt(hIn?.value ?? '0', 10));
      const s = this._clampByte(parseInt(sIn?.value ?? '0', 10));
      const v = this._clampByte(parseInt(vIn?.value ?? '0', 10));

      const rgb = this.hsvToRgb(h, s, v);
      this.state = { r: rgb.r, g: rgb.g, b: rgb.b, h, s, v };
      this._syncUI(true);
      this._emit(false, true);
    };

    if (hIn) hIn.addEventListener('input', onHsvNum);
    if (sIn) sIn.addEventListener('input', onHsvNum);
    if (vIn) vIn.addEventListener('input', onHsvNum);

    if (hexIn) {
      hexIn.addEventListener('input', () => {
        if (pickerDisabled()) return;
        const txt = String(hexIn.value || '').trim();
        const m = txt.match(/^#?([0-9a-fA-F]{6})$/);
        if (!m) return;

        const val = parseInt(m[1], 16) >>> 0;
        const r = (val >> 16) & 0xff;
        const g = (val >> 8) & 0xff;
        const b = val & 0xff;

        this._setRGB(r, g, b, true);
        this._emit(false, true);
      });
    }
  }

  _handleHuePointer(e, isDragging) {
    const rect = this._hueRect || this.dom.$('[data-role="hueslider"]')?.getBoundingClientRect();
    if (!rect) return;

    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const h = this._clampByte(Math.round((y / rect.height) * 255));

    const { s, v } = this.state;
    const rgb = this.hsvToRgb(h, s, v);
    this.state = { r: rgb.r, g: rgb.g, b: rgb.b, h, s, v };

    this._syncUI(true);
    this._emit(isDragging, false);
  }

  _handleSvPointer(e, isDragging) {
    const rect = this._svRect || this.dom.$('[data-role="svbox"]')?.getBoundingClientRect();
    if (!rect) return;

    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const s = this._clampByte(Math.round((x / rect.width) * 255));
    const v = this._clampByte(Math.round((1 - y / rect.height) * 255));

    const { h } = this.state;
    const rgb = this.hsvToRgb(h, s, v);
    this.state = { r: rgb.r, g: rgb.g, b: rgb.b, h, s, v };

    this._syncUI(true);
    this._emit(isDragging, false);
  }

  _setRGB(r, g, b, resyncHSV) {
    const rr = this._clampByte(r);
    const gg = this._clampByte(g);
    const bb = this._clampByte(b);

    if (resyncHSV) {
      const hsv = this.rgbToHsv(rr, gg, bb);
      this.state = { r: rr, g: gg, b: bb, h: hsv.h, s: hsv.s, v: hsv.v };
    } else {
      this.state = { ...this.state, r: rr, g: gg, b: bb };
    }

    this._syncUI(true);
  }

  _syncUI(skipEmit) {
    if (this._prevent) return;
    this._prevent = true;

    const { r, g, b, h, s, v } = this.state;

    const swatch = this.dom.$('[data-role="swatch"]');
    if (swatch) swatch.style.background = `rgb(${r},${g},${b})`;

    const hexIn = this.dom.$('[data-role="hex"]');
    if (hexIn) hexIn.value = this._rgbToHex(r, g, b);

    const rRange = this.dom.$('[data-role="r"]');
    const gRange = this.dom.$('[data-role="g"]');
    const bRange = this.dom.$('[data-role="b"]');
    if (rRange) rRange.value = String(r);
    if (gRange) gRange.value = String(g);
    if (bRange) bRange.value = String(b);

    const rIn = this.dom.$('[data-role="rin"]');
    const gIn = this.dom.$('[data-role="gin"]');
    const bIn = this.dom.$('[data-role="bin"]');
    if (rIn) rIn.value = String(r);
    if (gIn) gIn.value = String(g);
    if (bIn) bIn.value = String(b);

    const hIn = this.dom.$('[data-role="hin"]');
    const sIn = this.dom.$('[data-role="sin"]');
    const vIn = this.dom.$('[data-role="vin"]');
    if (hIn) hIn.value = String(h);
    if (sIn) sIn.value = String(s);
    if (vIn) vIn.value = String(v);

    const hueSlider = this.dom.$('[data-role="hueslider"]');
    const hueSel = this.dom.$('[data-role="huesel"]');
    if (hueSlider && hueSel) {
      const rect = this._hueRect || hueSlider.getBoundingClientRect();
      hueSel.style.top = `${(h / 255) * rect.height}px`;
    }

    const svBox = this.dom.$('[data-role="svbox"]');
    const svSel = this.dom.$('[data-role="svsel"]');
    if (svBox && svSel) {
      const rect = this._svRect || svBox.getBoundingClientRect();
      svSel.style.left = `${(s / 255) * rect.width}px`;
      svSel.style.top = `${(1 - v / 255) * rect.height}px`;

      const hueDeg = (h / 255) * 360;
      svBox.style.background =
        `linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0)), ` +
        `linear-gradient(to right, rgba(255,255,255,1), hsla(${hueDeg}, 100%, 50%, 1))`;
    }

    this._prevent = false;

    if (!skipEmit) this._emit(false, true);
  }

  _emit(isDragging, immediate) {
    if (!this.ctx.pickerEnabled) return;
    if (!this.cb.onColorChange) return;
    if (this.ctx.selectedColorIndex == null) return;

    const { r, g, b } = this.state;
    const hex = this._rgbToHex(r, g, b);
    const idx = this.ctx.selectedColorIndex | 0;

    // Always preview color changes in realtime, then revert to mode after idle.
    this._demoPreviewRgb(r, g, b);

    const now = performance.now ? performance.now() : Date.now();

    if (immediate || !isDragging) {
      try {
        this.cb.onColorChange(idx, hex, !!isDragging);
      } catch {}
      this._lastEmitAt = now;

      const cube = this.dom.$(`[data-role="cube"][data-kind="color"][data-index="${idx}"]`);
      if (cube) cube.style.background = hex;

      return;
    }

    const dt = now - this._lastEmitAt;
    if (dt >= this._throttleMs) {
      this._lastEmitAt = now;
      try {
        this.cb.onColorChange(idx, hex, true);
      } catch {}

      const cube = this.dom.$(`[data-role="cube"][data-kind="color"][data-index="${idx}"]`);
      if (cube) cube.style.background = hex;

      return;
    }

    this._pendingEmit = { idx, hex };
    if (!this._pendingTimer) {
      const wait = Math.max(0, this._throttleMs - dt);
      this._pendingTimer = setTimeout(() => {
        this._pendingTimer = 0;
        if (!this._pendingEmit) return;
        const payload = this._pendingEmit;
        this._pendingEmit = null;
        this._lastEmitAt = performance.now ? performance.now() : Date.now();
        try {
          this.cb.onColorChange(payload.idx, payload.hex, true);
        } catch {}

        const cube = this.dom.$(`[data-role="cube"][data-kind="color"][data-index="${payload.idx}"]`);
        if (cube) cube.style.background = payload.hex;
      }, wait);
    }
  }

  _buildColorsetHtml(colors, selectedIdx) {
    const safe = Array.isArray(colors) ? colors : [];
    const num = safe.length;
    const parts = [];

    for (let i = 0; i < 8; i++) {
      if (i < num) {
        const hex = String(safe[i] || '#000000');
        const sel = selectedIdx != null && i === selectedIdx ? ' is-selected' : '';
        parts.push(
          `<button type="button" class="m-color-cube${sel}" data-role="cube" data-kind="color" data-index="${i}" style="background:${hex};" aria-label="Color ${i + 1}"></button>`
        );
      } else if (i === num && num < 8) {
        parts.push(
          `<button type="button" class="m-color-cube is-add" data-role="cube" data-kind="add" data-index="${i}" aria-label="Add color">+</button>`
        );
      } else {
        parts.push(
          `<div class="m-color-cube is-empty" data-role="cube" data-kind="empty" data-index="${i}"></div>`
        );
      }
    }

    return parts.join('');
  }

  _hexToRGB(hexValue) {
    const m = String(hexValue || '').trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return { r: 0, g: 0, b: 0 };
    const val = parseInt(m[1], 16) >>> 0;
    return { r: (val >> 16) & 255, g: (val >> 8) & 255, b: val & 255 };
  }

  _rgbToHex(r, g, b) {
    const rr = this._clampByte(r);
    const gg = this._clampByte(g);
    const bb = this._clampByte(b);
    return `#${((1 << 24) | (rr << 16) | (gg << 8) | bb).toString(16).slice(1).toUpperCase()}`;
  }

  _clampByte(v) {
    const n = Number.isFinite(v) ? (v | 0) : 0;
    if (n < 0) return 0;
    if (n > 255) return 255;
    return n;
  }

  // =========================================================
  // Extracted logic from VortexEditorMobile
  // =========================================================

  _escape(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  _hexToRgb(hex) {
    const m = String(hex || '').trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return { r: 255, g: 0, b: 0 };
    const v = parseInt(m[1], 16) >>> 0;
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  _rgbToHexFast(r, g, b) {
    const rr = (r & 255) >>> 0;
    const gg = (g & 255) >>> 0;
    const bb = (b & 255) >>> 0;
    return `#${((1 << 24) | (rr << 16) | (gg << 8) | bb).toString(16).slice(1).toUpperCase()}`;
  }

  _extractColorsHexFromColorset(set) {
    const out = [];
    if (!set) return out;
    const n = Math.min(8, set.numColors ? (set.numColors() | 0) : 0);
    for (let i = 0; i < n; i++) {
      const c = set.get(i);
      const r = (c?.red ?? 0) & 0xff;
      const g = (c?.green ?? 0) & 0xff;
      const b = (c?.blue ?? 0) & 0xff;
      out.push(this._rgbToHexFast(r, g, b));
    }
    return out;
  }

  _patternOptionsHtml({ vortex, allowMulti }) {
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
        label = vortex.patternToString(pat);
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

    const mk = (label, arr) => (arr.length ? `<optgroup label="${this._escape(label)}">${arr.join('')}</optgroup>` : '');

    return (
      mk('Strobe Patterns', strobe) +
      mk('Blend Patterns', blend) +
      mk('Solid Patterns', solid) +
      (allowMulti ? mk('Special Patterns (Multi Led)', multi) : '')
    );
  }

  _ledSelEnsureDefaults(ledCount) {
    const lc = Math.max(0, ledCount | 0);

    if (this.ledSelectionState && typeof this.ledSelectionState.ensureDefaultsForSingleLed === 'function') {
      try {
        this.ledSelectionState.ensureDefaultsForSingleLed({ ledCount: lc });
        return;
      } catch {}
    }

    const src = this._ledSelFallback.sourceLed | 0;
    if (!(src >= 0 && src < lc)) this._ledSelFallback.sourceLed = 0;

    let sel = this._ledSelFallback.selectedLeds;
    if (!Array.isArray(sel) || sel.length === 0) this._ledSelFallback.selectedLeds = null;
  }

  _ledSelGetSingleSource(ledCount) {
    const lc = Math.max(0, ledCount | 0);

    if (this.ledSelectionState && typeof this.ledSelectionState.getSingleSource === 'function') {
      try {
        const v = this.ledSelectionState.getSingleSource() | 0;
        return v >= 0 && v < lc ? v : 0;
      } catch {}
    }

    const v = this._ledSelFallback.sourceLed | 0;
    return v >= 0 && v < lc ? v : 0;
  }

  _ledSelGetSingleSelected(ledCount) {
    const lc = Math.max(0, ledCount | 0);

    if (this.ledSelectionState && typeof this.ledSelectionState.getSingleSelected === 'function') {
      try {
        const a = this.ledSelectionState.getSingleSelected();
        if (Array.isArray(a) && a.length) return a.map((x) => x | 0).filter((x) => x >= 0 && x < lc);
      } catch {}
    }

    const a = this._ledSelFallback.selectedLeds;
    if (!Array.isArray(a) || a.length === 0) return null;

    const out = a.map((x) => x | 0).filter((x) => x >= 0 && x < lc);
    return out.length ? out : null;
  }

  _ledSelSetFromModal({ ledCount, sourceLed, selectedLeds }) {
    const lc = Math.max(0, ledCount | 0);
    const src = sourceLed | 0;
    const sel = Array.isArray(selectedLeds) ? selectedLeds.map((x) => x | 0) : null;

    if (this.ledSelectionState && typeof this.ledSelectionState.setFromModal === 'function') {
      try {
        this.ledSelectionState.setFromModal({ ledCount: lc, sourceLed: src, selectedLeds: sel });
        return;
      } catch {}
    }

    this._ledSelFallback.sourceLed = src >= 0 && src < lc ? src : 0;
    if (!sel || sel.length === 0) this._ledSelFallback.selectedLeds = null;
    else this._ledSelFallback.selectedLeds = sel.filter((x) => x >= 0 && x < lc);
  }

  _ledSelGetSummary({ isMultiMode, ledCount }) {
    const lc = Math.max(0, ledCount | 0);

    if (this.ledSelectionState && typeof this.ledSelectionState.getSummary === 'function') {
      try {
        return String(this.ledSelectionState.getSummary({ isMultiMode: !!isMultiMode, ledCount: lc }));
      } catch {}
    }

    if (isMultiMode) return 'Multi';
    const sel = this._ledSelGetSingleSelected(lc);
    const n = Array.isArray(sel) ? sel.length : lc;
    return `${n}/${lc}`;
  }

  _effectiveSelection(curMode) {
    const ledCount = this._getLedCountForDevice();
    const multiIndex = this._getMultiIndex();
    const isMulti = this._isMultiMode(curMode);

    if (isMulti) {
      return { isMulti: true, sourceLed: multiIndex, targetLeds: [multiIndex] };
    }

    this._ledSelEnsureDefaults(ledCount);

    let src = this._ledSelGetSingleSource(ledCount);
    let sel = this._ledSelGetSingleSelected(ledCount);

    let targetLeds;
    if (!Array.isArray(sel) || sel.length === 0) {
      targetLeds = Array.from({ length: ledCount }, (_, i) => i);
    } else {
      targetLeds = sel.slice();
    }

    if (!targetLeds.includes(src)) targetLeds.push(src);
    targetLeds = targetLeds.filter((x) => x >= 0 && x < ledCount);
    targetLeds.sort((a, b) => a - b);

    return { isMulti: false, sourceLed: src, targetLeds };
  }

  _applyColorsetMutation(mutatorFn) {
    const cur = this._getCurMode();
    if (!cur) return null;

    const { sourceLed, targetLeds } = this._effectiveSelection(cur);
    const set = cur.getColorset(sourceLed);
    if (!set) return null;

    try {
      mutatorFn(set);
    } catch (e) {
      console.error('[ColorPicker] colorset mutation failed:', e);
      return null;
    }

    try {
      for (const led of targetLeds) {
        cur.setColorset(set, led);
      }
    } catch (e) {
      console.error('[ColorPicker] setColorset apply failed:', e);
    }

    try {
      cur.init();
    } catch {}

    try {
      const modes = this._getModes();
      modes?.saveCurMode?.();
    } catch {}

    return { cur, set, sourceLed, targetLeds };
  }

  _applyPatternToSelection(patID) {
    const cur = this._getCurMode();
    if (!cur || !patID) return;

    const e = this._getEngine();
    if (!e) return;

    const ledCount = (e.leds().ledCount() | 0) >>> 0;
    const multiIndex = e.leds().ledMulti() | 0;

    const isSingle = !!this.vortexLib.isSingleLedPatternID?.(patID);
    const isMultiBefore = this._isMultiMode(cur);

    const { sourceLed, targetLeds } = this._effectiveSelection(cur);
    const set = cur.getColorset(sourceLed);

    if (isSingle) {
      if (isMultiBefore) {
        try {
          if (typeof cur.clearPattern === 'function') cur.clearPattern(multiIndex);
        } catch {}

        this._ledSelSetFromModal({ ledCount, sourceLed: 0, selectedLeds: null });

        try {
          cur.setPattern(patID, ledCount, null, null);
        } catch {}
        try {
          if (set) cur.setColorset(set, ledCount);
        } catch {}
      } else {
        for (const led of targetLeds) {
          try {
            cur.setPattern(patID, led, null, null);
          } catch {}
          try {
            if (set) cur.setColorset(set, led);
          } catch {}
        }
      }
    } else {
      try {
        cur.setPattern(patID, multiIndex, null, null);
      } catch {}
      try {
        if (set) cur.setColorset(set, multiIndex);
      } catch {}
    }

    try {
      cur.init();
    } catch {}
    try {
      this._getModes()?.saveCurMode?.();
    } catch {}
  }
}

