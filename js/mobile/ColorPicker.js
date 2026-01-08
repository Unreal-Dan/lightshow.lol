/* js/mobile/ColorPicker.js */

import SimpleViews from './SimpleViews.js';
import SimpleDom from './SimpleDom.js';

export default class ColorPicker {
  constructor({ vortexLib, views = null, basePath = 'js/mobile/views/' }) {
    this.vortexLib = vortexLib;

    this.views = views || new SimpleViews({ basePath });

    this.root = null;
    this.dom = null;

    this.onChange = null;
    this.onDone = null;
    this.onDelete = null;

    this.selectedIndex = 0;

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
  }

  async preload() {
    if (this._preloaded) return;
    await this.views.load('color-picker.html');
    this._preloaded = true;
  }

  mount(_containerIgnored) {
    // Portal to <body> so fixed overlay is never trapped by transformed parents.
    if (this.root && this.root.parentElement === document.body) return;

    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }

    this.root = document.createElement('div');
    this.root.className = 'm-color-picker';
    document.body.appendChild(this.root);

    this.dom = new SimpleDom(this.root);

    this.preload().catch(() => {});
  }

  close() {
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = 0;
    }
    this._pendingEmit = null;

    this._svRect = null;
    this._hueRect = null;

    if (this._boundKeydown) {
      document.removeEventListener('keydown', this._boundKeydown);
      this._boundKeydown = null;
    }

    if (this.root) {
      this.root.innerHTML = '';
      this.root.classList.remove('is-open');
    }

    this.onChange = null;
    this.onDone = null;
    this.onDelete = null;
  }

  async open({ index, rgb, onChange, onDone, onDelete }) {
    if (!this.root || !this.dom) return;

    await this.preload();

    this.selectedIndex = index | 0;
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.onDone = typeof onDone === 'function' ? onDone : null;
    this.onDelete = typeof onDelete === 'function' ? onDelete : null;

    const r = this._clampByte(rgb?.r ?? 255);
    const g = this._clampByte(rgb?.g ?? 0);
    const b = this._clampByte(rgb?.b ?? 0);

    const hsv = this.rgbToHsv(r, g, b);
    this.state = { r, g, b, h: hsv.h, s: hsv.s, v: hsv.v };

    this.root.classList.add('is-open');

    await this._render();
    this._bind();

    await this._nextFrame();
    this._cacheRects();
    this._syncUI(true); // do not emit on open
  }

  /* -----------------------------
     Conversion helpers (WASM-backed)
  ----------------------------- */
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

  /* -----------------------------
     Render
  ----------------------------- */
  async _nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  async _render() {
    const { r, g, b, h, s, v } = this.state;
    const hex = this._rgbToHex(r, g, b);
    const hueDeg = String((h / 255) * 360);

    const frag = await this.views.render('color-picker.html', {
      r,
      g,
      b,
      h,
      s,
      v,
      hex,
      hueDeg,
      deleteDisabled: this.onDelete ? '' : 'disabled',
    });

    this.root.innerHTML = '';
    this.root.appendChild(frag);

    this.dom = new SimpleDom(this.root);
  }

  _cacheRects() {
    const svBox = this.dom.$('[data-role="svbox"]');
    const hueSlider = this.dom.$('[data-role="hueslider"]');
    this._svRect = svBox ? svBox.getBoundingClientRect() : null;
    this._hueRect = hueSlider ? hueSlider.getBoundingClientRect() : null;
  }

  /* -----------------------------
     Bind
  ----------------------------- */
  _bind() {
    // Backdrop click closes
    this.root.addEventListener('pointerdown', (e) => {
      const sheet = this.dom.$('.m-color-picker-sheet');
      if (sheet && !sheet.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        if (this.onDone) this.onDone();
      }
    });

    // Esc closes
    if (!this._boundKeydown) {
      this._boundKeydown = (e) => {
        if (e.key === 'Escape') {
          if (this.onDone) this.onDone();
        }
      };
      document.addEventListener('keydown', this._boundKeydown);
    }

    const svBox = this.dom.$('[data-role="svbox"]');
    const hueSlider = this.dom.$('[data-role="hueslider"]');

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

    this.dom.all('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'done') {
          if (this.onDone) await this.onDone();
          return;
        }
        if (act === 'delete') {
          if (this.onDelete) await this.onDelete();
          return;
        }
        if (act === 'off') {
          this._setRGB(0, 0, 0, true);
          this._emit(false, true);
          return;
        }
      });
    });

    if (svBox) {
      svBox.addEventListener('pointerdown', (e) => {
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
          this._handleSvPointer(ev, false);
          this._emit(false, true);
        };

        svBox.addEventListener('pointermove', onMove);
        svBox.addEventListener('pointerup', onUp, { once: true });
        svBox.addEventListener('pointercancel', onUp, { once: true });
      });
    }

    if (hueSlider) {
      hueSlider.addEventListener('pointerdown', (e) => {
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
          this._handleHuePointer(ev, false);
          this._emit(false, true);
        };

        hueSlider.addEventListener('pointermove', onMove);
        hueSlider.addEventListener('pointerup', onUp, { once: true });
        hueSlider.addEventListener('pointercancel', onUp, { once: true });
      });
    }

    const onRgbRange = (isDragging) => {
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

    window.addEventListener('resize', () => {
      if (!this.root || !this.root.classList.contains('is-open')) return;
      this._cacheRects();
      this._syncUI(true);
    });
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
    if (!this.onChange) return;

    const { r, g, b } = this.state;
    const hex = this._rgbToHex(r, g, b);

    const now = performance.now ? performance.now() : Date.now();

    if (immediate || !isDragging) {
      try {
        this.onChange(this.selectedIndex, hex, !!isDragging);
      } catch {}
      this._lastEmitAt = now;
      return;
    }

    const dt = now - this._lastEmitAt;
    if (dt >= this._throttleMs) {
      this._lastEmitAt = now;
      try {
        this.onChange(this.selectedIndex, hex, true);
      } catch {}
      return;
    }

    this._pendingEmit = { idx: this.selectedIndex, hex };
    if (!this._pendingTimer) {
      const wait = Math.max(0, this._throttleMs - dt);
      this._pendingTimer = setTimeout(() => {
        this._pendingTimer = 0;
        if (!this._pendingEmit) return;
        const payload = this._pendingEmit;
        this._pendingEmit = null;
        this._lastEmitAt = performance.now ? performance.now() : Date.now();
        try {
          this.onChange(payload.idx, payload.hex, true);
        } catch {}
      }, wait);
    }
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
}

