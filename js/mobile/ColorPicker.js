/* js/mobile/ColorPicker.js */

import SimpleViews from './SimpleViews.js';
import SimpleDom from './SimpleDom.js';

export default class ColorPicker {
  constructor({ vortexLib, views = null, basePath = 'js/mobile/views/' }) {
    this.vortexLib = vortexLib;
    this.views = views || new SimpleViews({ basePath });

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
    };

    this.cb = {
      onLedChange: null,
      onPatternChange: null,
      onColorsetSelect: null,
      onColorsetAdd: null,
      onColorsetDelete: null,
      onColorChange: null,
      onOff: null,
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
    };
  }

  isOpen() {
    return !!(this.root && this.root.classList.contains('is-open'));
  }

  /* ---------------------------------
     Public open: Effects panel
  --------------------------------- */
  async openEffects({
    title = 'Effects',
    ledCount = 2,
    ledIndex = 0,
    patternValue = -1,
    patternOptionsHtml = '',
    colors = [],
    selectedColorIndex = null,
    rgb = null,

    onDone = null,
    onLedChange = null,
    onPatternChange = null,
    onColorsetSelect = null,
    onColorsetAdd = null,
    onColorsetDelete = null,
    onColorChange = null,
    onOff = null,
  }) {
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

    const lc = Math.max(0, ledCount | 0);
    const li = Math.max(0, Math.min(Math.max(0, lc - 1), ledIndex | 0));

    this.ctx.title = String(title || 'Effects');
    this.ctx.ledCount = lc;
    this.ctx.ledIndex = li;
    this.ctx.patternValue = Number.isFinite(patternValue) ? (patternValue | 0) : -1;
    this.ctx.patternOptionsHtml = String(patternOptionsHtml || '');

    this.ctx.selectedColorIndex =
      selectedColorIndex == null ? null : Math.max(0, selectedColorIndex | 0);

    this.ctx.colorsetHtml = this._buildColorsetHtml(colors, this.ctx.selectedColorIndex);
    this.ctx.pickerEnabled = this.ctx.selectedColorIndex != null;

    // seed picker color
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

  async _nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  // Defer backend work so the browser can paint optimistic UI immediately.
  _defer(fn) {
    setTimeout(() => {
      Promise.resolve()
        .then(fn)
        .catch(() => {});
    }, 0);
  }

  async _render() {
    const { r, g, b, h, s, v } = this.state;
    const hex = this._rgbToHex(r, g, b);
    const hueDeg = String((h / 255) * 360);

    const led0Active = this.ctx.ledIndex === 0 ? 'is-active' : '';
    const led1Active = this.ctx.ledIndex === 1 ? 'is-active' : '';
    const showLed1 = this.ctx.ledCount >= 2 ? '' : 'hidden';

    const pickerDisabledClass = this.ctx.pickerEnabled ? '' : 'is-disabled';

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

  /* -----------------------------
     Fast close (don’t block on onDone)
  ----------------------------- */
  _fastDone() {
    if (!this.root) return;

    // hide immediately
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

  /* -----------------------------
     Long press delete (arm -> delete on release)
  ----------------------------- */
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

    // capture the element the user ACTUALLY pressed (touch can retarget on pointerup)
    const sheet = this.dom.$('.m-color-picker-sheet');
    this._tapOnBackdrop = !!(sheet && !sheet.contains(e.target));
    this._tapTargetEl =
      e.target?.closest?.('[data-act],[data-role="led"],[data-role="cube"]') || null;

    // only arm delete for actual color cubes
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

    // if armed, delete on release and swallow tap
    if (this._lpArmed && this.cb.onColorsetDelete && this._lpIdx >= 0) {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}

      const idx = this._lpIdx;
      const cubeEl = this._lpCubeEl;

      // clear tap tracking
      this._tapTargetEl = null;
      this._tapOnBackdrop = false;

      this._cancelLongPress();

      if (cubeEl) {
        cubeEl.classList.add('is-deleting');
        cubeEl.style.opacity = '0.55';
      }

      this._defer(async () => {
        const next = await this.cb.onColorsetDelete(idx);
        await this._applyCtx(next);
      });

      return;
    }

    // not armed; cancel any pending timer
    if (this._lpTimer) this._cancelLongPress();

    // moved/scrolling => not a tap
    if (this._moved) {
      this._tapTargetEl = null;
      this._tapOnBackdrop = false;
      return;
    }

    // if press started on backdrop, close even if pointerup retargets
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

    // use the element from pointerdown (fixes touch retargeting)
    const t =
      (this._tapTargetEl && this.root.contains(this._tapTargetEl) && this._tapTargetEl) ||
      e.target;

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
    // squelch synthetic click after pointer sequences
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

  /* -----------------------------
     Tap routing (instant UI, async backend)
  ----------------------------- */
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

    // 1) Try inline styles first (sometimes still "#RRGGBB")
    const inline = String(cubeEl.style.background || cubeEl.style.backgroundColor || '').trim();
    let m = inline.match(/#([0-9a-fA-F]{6})/);
    if (m) return `#${m[1].toUpperCase()}`;

    // 2) Fall back to computed color (usually "rgb(...)" / "rgba(...)")
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

  _optimisticAddFromPlus(plusBtn) {
    const row = this.dom.$('[data-role="colorset-row"]');
    if (!row || !plusBtn) return null;

    const colorBtns = this.dom.all('[data-role="cube"][data-kind="color"]');
    const newIdx = colorBtns.length | 0;
    if (newIdx < 0 || newIdx >= 8) return null;

    // convert the + button into a real color cube (red)
    plusBtn.classList.remove('is-add', 'is-busy');
    plusBtn.classList.add('is-selected');
    plusBtn.textContent = '';
    plusBtn.dataset.kind = 'color';
    plusBtn.dataset.index = String(newIdx);
    plusBtn.style.background = '#FF0000';

    // find next empty to become the next +
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

      // replace the empty with the add button
      nextEmpty.replaceWith(add);
    }

    // clear selection on others
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

  async _handleTapTarget(e) {
    const t = e?.target;
    if (!t) return;

    const sheet = this.dom.$('.m-color-picker-sheet');

    // Backdrop tap closes
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

      const act = actBtn.dataset.act;

      if (act === 'done') {
        this._fastDone();
        return;
      }

      if (act === 'off') {
        if (!this.ctx.pickerEnabled) return;

        if (this.cb.onOff) {
          this._defer(() => this.cb.onOff());
        }

        this._setRGB(0, 0, 0, true);
        this._emit(false, true);
        return;
      }

      if (act === 'delete') {
        if (!this.ctx.pickerEnabled) return;
        if (!this.cb.onColorsetDelete || this.ctx.selectedColorIndex == null) return;

        const idx = this.ctx.selectedColorIndex | 0;

        // light feedback immediately
        const cubeEl = this.dom.$(`[data-role="cube"][data-kind="color"][data-index="${idx}"]`);
        if (cubeEl) {
          cubeEl.classList.add('is-deleting');
          cubeEl.style.opacity = '0.55';
        }

        this._defer(async () => {
          const next = await this.cb.onColorsetDelete(idx);
          await this._applyCtx(next);
        });

        return;
      }

      return;
    }

    const ledBtn = t.closest?.('[data-role="led"]');
    if (ledBtn) {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}

      const led = Number(ledBtn.dataset.led ?? 0) | 0;

      // optimistic UI
      this.dom.all('[data-role="led"]').forEach((b) => b.classList.remove('is-active'));
      ledBtn.classList.add('is-active');

      if (!this.cb.onLedChange) return;

      this._defer(async () => {
        const next = await this.cb.onLedChange(led);
        await this._applyCtx(next);
      });

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
        // instant UI + async backend
        cube.classList.add('is-busy');

        const newIdx = this._optimisticAddFromPlus(cube);
        if (newIdx == null || !this.cb.onColorsetAdd) return;

        this._defer(async () => {
          const next = await this.cb.onColorsetAdd();
          await this._applyCtx(next);
        });

        return;
      }

      if (kind === 'color') {
        // instant selection outline movement
        this._selectCubeUI(idx);

        // seed picker immediately from cube background (handles rgb(...) as well)
        const hex = this._extractHexFromCube(cube);
        if (hex) this._seedPickerFromHex(hex);

        if (!this.cb.onColorsetSelect) return;

        // async ctx sync (don’t block paint)
        this._defer(async () => {
          const next = await this.cb.onColorsetSelect(idx);
          await this._applyCtx(next, { keepPickerSeed: true });
        });

        return;
      }

      return;
    }
  }

  /* -----------------------------
     Per-render bindings (controls that need it)
  ----------------------------- */
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
          this._handleHuePointer(ev, false);
          this._emit(false, true);
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

  async _applyCtx(next, { keepPickerSeed = false } = {}) {
    if (!next || typeof next !== 'object') return;

    if (Number.isFinite(next.ledCount)) this.ctx.ledCount = next.ledCount | 0;
    if (Number.isFinite(next.ledIndex)) this.ctx.ledIndex = next.ledIndex | 0;
    if (Number.isFinite(next.patternValue)) this.ctx.patternValue = next.patternValue | 0;
    if (typeof next.patternOptionsHtml === 'string') this.ctx.patternOptionsHtml = next.patternOptionsHtml;

    const newSelected =
      next.selectedColorIndex == null ? null : Math.max(0, next.selectedColorIndex | 0);
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

        const cube = this.dom.$(
          `[data-role="cube"][data-kind="color"][data-index="${payload.idx}"]`
        );
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
}

