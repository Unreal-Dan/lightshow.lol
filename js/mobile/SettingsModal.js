/* js/mobile/SettingsModal.js */

import Notification from '../Notification.js';
import SettingsSheet from './SettingsSheet.js';

export default class SettingsModal {
  constructor(editor, { views = null, basePath = 'js/mobile/views/' } = {}) {
    this.editor = editor;
    this.views = views || editor.views;
    this.basePath = basePath;

    this._modalEl = null;
    this._loaded = false;

    this._boundModal = false;
    this._boundAnimation = false;

    this._lastBrightnessPreviewAt = 0;
    this._brightnessPreviewInFlight = false;
    this._brightnessCommitInFlight = false;

    this._animSpecs = [
      { id: 'tickRate', label: 'Speed', min: 1, max: 30, step: 1, get: (ls) => ls.tickRate, set: (ls, v) => (ls.tickRate = v) },
      { id: 'trailSize', label: 'Trail', min: 1, max: 300, step: 1, get: (ls) => ls.trailSize, set: (ls, v) => (ls.trailSize = v) },
      { id: 'dotSize', label: 'Size', min: 1, max: 60, step: 1, get: (ls) => ls.dotSize, set: (ls, v) => (ls.dotSize = (Number(v) | 0)) },
      { id: 'blurFac', label: 'Blur', min: 0, max: 10, step: 1, get: (ls) => ls.blurFac, set: (ls, v) => (ls.blurFac = (Number(v) | 0)) },
      { id: 'circleRadius', label: 'Radius', min: 0, max: 600, step: 1, get: (ls) => ls.circleRadius, set: (ls, v) => (ls.circleRadius = (Number(v) | 0)) },
      { id: 'spread', label: 'Spread', min: 0, max: 200, step: 1, get: (ls) => ls.spread, set: (ls, v) => (ls.spread = (Number(v) | 0)) },

      // Orbit extras
      { id: 'orbitSpinMul', label: 'Orbit spin', min: -12, max: 12, step: 0.1, get: (ls) => ls.orbitSpinMul, set: (ls, v) => (ls.orbitSpinMul = Number(v)) },

      // Cursor extras
      { id: 'friction', label: 'Drag friction', min: 0.05, max: 0.99, step: 0.01, get: (ls) => ls.friction, set: (ls, v) => (ls.friction = Number(v)) },
    ];
  }

  _ensureBootstrap() {
    return !!(window.bootstrap && window.bootstrap.Modal);
  }

  _isConnected() {
    try {
      return !!this.editor?.vortexPort?.isActive?.();
    } catch {
      return false;
    }
  }

  _supportsDeviceBrightness() {
    try {
      if (!this._isConnected()) return false;
      const v = String(this.editor?.vortexPort?.version || '');
      return !!(this.editor.isVersionGreaterOrEqual(v, '1.5.0') || v === '1.3.0');
    } catch {
      return false;
    }
  }

  _selectedDeviceType(fallback = 'Duo') {
    try {
      return this.editor?.selectedDeviceType?.(fallback) || fallback;
    } catch {
      return fallback;
    }
  }

  async _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async _waitPortIdle(timeoutMs = 1200) {
    const vp = this.editor?.vortexPort;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        if (!vp?.isActive?.()) return false;
        if (vp.isTransmitting == null) return true;
      } catch {
        return false;
      }
      await this._sleep(40);
    }
    return false;
  }

  async _getDeviceBrightnessSafe() {
    try {
      if (!this._supportsDeviceBrightness()) return 255;
      const b = await this.editor.vortexPort.getBrightness(this.editor.vortexLib, this.editor.vortex);
      const n = Number(b);
      if (!Number.isFinite(n)) return 255;
      return Math.max(0, Math.min(255, n | 0));
    } catch {
      return 255;
    }
  }

  async _setDeviceBrightnessSafe(value) {
    const b = Math.max(0, Math.min(255, Number(value) | 0));
    if (!this._supportsDeviceBrightness()) return;

    const dt = this._selectedDeviceType('Duo');
    const useChromalink = dt === 'Duo';

    // If demos are mid-flight, wait a beat so the setBrightness call actually runs.
    await this._waitPortIdle(1400);

    await this.editor.vortexPort.setBrightness(this.editor.vortexLib, this.editor.vortex, b, useChromalink);
  }

  async ensure() {
    if (this._modalEl && document.body.contains(this._modalEl)) return this._modalEl;

    const existing = document.getElementById('m-settings-modal');
    if (existing) {
      this._modalEl = existing;
      this._loaded = true;
      this._bindModalOnce();
      return existing;
    }

    if (this._loaded) {
      throw new Error('settings-modal.html was loaded but #m-settings-modal is missing');
    }

    const frag = await this.views.render('settings-modal.html', {});
    document.body.appendChild(frag);

    const el = document.getElementById('m-settings-modal');
    if (!el) throw new Error('settings-modal.html must contain #m-settings-modal');

    if (!this._settingsSheet) {
      this._settingsSheet = new SettingsSheet({ modalEl: el });
      this._settingsSheet.bind();
    }

    this._modalEl = el;
    this._loaded = true;

    this._bindModalOnce();
    return el;
  }

  _bindModalOnce() {
    if (this._boundModal) return;
    this._boundModal = true;

    const modalEl = this._modalEl;
    if (!modalEl) return;

    modalEl.addEventListener(
      'show.bs.modal',
      async () => {
        try {
          await this.sync();
        } catch {}
      },
      { passive: true }
    );

    modalEl.addEventListener(
      'shown.bs.modal',
      async () => {
        try {
          await this.sync();
        } catch {}
      },
      { passive: true }
    );
  }

  _clearMount(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  _getAnimSpecsForLightshow(ls) {
    if (!ls) return this._animSpecs;
    return this._animSpecs.filter((s) => {
      try {
        const v = s.get(ls);
        return v !== undefined;
      } catch {
        return false;
      }
    });
  }

  async _renderDeviceSection({ dt, connected, brightnessSupported }) {
    const modalEl = this._modalEl;
    if (!modalEl) return;

    const mount = modalEl.querySelector('#m-settings-device-mount');
    if (!mount) return;

    this._clearMount(mount);

    // Requirement: device section not shown at all if NOT connected
    if (!connected) return;

    const frag = await this.views.render('settings-device-section.html', {
      chipText: 'Connected',
      chipClass: 'm-settings-chip is-connected',
      hintStyle: 'display:none;',
      showBrightnessStyle: brightnessSupported ? '' : 'display:none;',
      deviceLabel: dt,
    });

    mount.appendChild(frag);

    if (!brightnessSupported) return;

    const rowMount = modalEl.querySelector('#m-settings-device-brightness-mount');
    if (!rowMount) return;

    this._clearMount(rowMount);

    const rowFrag = await this.views.render('settings-brightness-row.html', {});
    rowMount.appendChild(rowFrag);

    const slider = modalEl.querySelector('#m-brightness-slider');
    const valEl = modalEl.querySelector('#m-brightness-value');

    if (slider) {
      const b = await this._getDeviceBrightnessSafe();
      slider.value = String(b);
      if (valEl) valEl.textContent = String(b);
    }

    // IMPORTANT: bind to the CURRENT slider element (it gets re-rendered)
    this._bindBrightnessForCurrentSlider();
  }

  async _renderAnimationSection({ dt }) {
    const modalEl = this._modalEl;
    if (!modalEl) return;

    const mount = modalEl.querySelector('#m-settings-animation-mount');
    if (!mount) return;

    if (mount.dataset.built === '1') return;
    mount.dataset.built = '1';

    const frag = await this.views.render('settings-animation-section.html', { deviceLabel: dt });
    mount.appendChild(frag);

    this._bindAnimationOnce();
  }

  async _renderAnimationSliders() {
    const modalEl = this._modalEl;
    if (!modalEl) return;

    const ls = this.editor.lightshow || null;
    const controlsMount = modalEl.querySelector('#m-anim-controls-mount');
    if (!controlsMount) return;

    this._clearMount(controlsMount);

    const specs = this._getAnimSpecsForLightshow(ls);

    for (const spec of specs) {
      const rowFrag = await this.views.render('settings-anim-slider-row.html', {
        id: spec.id,
        label: spec.label,
        min: spec.min,
        max: spec.max,
        step: spec.step,
      });
      controlsMount.appendChild(rowFrag);
    }

    this._syncAnimationValues();
  }

  _syncAnimationValues() {
    const modalEl = this._modalEl;
    if (!modalEl) return;

    const ls = this.editor.lightshow || null;
    const specs = this._getAnimSpecsForLightshow(ls);

    for (const spec of specs) {
      const row = modalEl.querySelector(`#m-anim-row-${spec.id}`);
      const slider = modalEl.querySelector(`#m-anim-slider-${spec.id}`);
      const valEl = modalEl.querySelector(`#m-anim-value-${spec.id}`);

      const enabled = !!ls;

      if (row) row.classList.toggle('is-disabled', !enabled);
      if (slider) slider.disabled = !enabled;

      if (!ls) {
        if (valEl) valEl.textContent = '-';
        continue;
      }

      let v = 0;
      try {
        v = spec.get(ls);
      } catch {
        v = 0;
      }

      if (!Number.isFinite(Number(v))) v = 0;

      if (slider) {
        const min = Number(slider.min);
        const max = Number(slider.max);
        if (Number.isFinite(min)) v = Math.max(min, v);
        if (Number.isFinite(max)) v = Math.min(max, v);
        slider.value = String(v);
      }

      if (valEl) {
        if (spec.step < 1) valEl.textContent = String(Number(v));
        else valEl.textContent = String(Number(v) | 0);
      }
    }
  }

  _bindBrightnessForCurrentSlider() {
    const modalEl = this._modalEl;
    if (!modalEl) return;

    const slider = modalEl.querySelector('#m-brightness-slider');
    const valEl = modalEl.querySelector('#m-brightness-value');
    if (!slider) return;

    if (slider.dataset.bound === '1') return;
    slider.dataset.bound = '1';

    slider.addEventListener(
      'input',
      (e) => {
        const v = Number(e.target.value) | 0;
        if (valEl) valEl.textContent = String(v);

        // Preview while dragging (throttled, non-blocking)
        const now = Date.now();
        if (now - this._lastBrightnessPreviewAt < 90) return;
        this._lastBrightnessPreviewAt = now;

        if (this._brightnessCommitInFlight) return;
        if (this._brightnessPreviewInFlight) return;
        if (!this._supportsDeviceBrightness()) return;

        const vp = this.editor?.vortexPort;
        if (!vp?.isActive?.()) return;
        if (vp.isTransmitting != null) return;

        this._brightnessPreviewInFlight = true;
        try {
          const rgb = new this.editor.vortexLib.RGBColor(v, v, 0);
          // fire-and-forget so we don't block UI
          Promise.resolve(vp.demoColor(this.editor.vortexLib, this.editor.vortex, rgb))
            .catch(() => {})
            .finally(() => {
              this._brightnessPreviewInFlight = false;
            });
        } catch {
          this._brightnessPreviewInFlight = false;
        }
      },
      { passive: true }
    );

    slider.addEventListener(
      'change',
      async (e) => {
        const v = Number(e.target.value) | 0;
        if (valEl) valEl.textContent = String(v);

        if (this._brightnessCommitInFlight) return;
        this._brightnessCommitInFlight = true;

        try {
          await this._setDeviceBrightnessSafe(v);
          await this.editor.demoModeOnDevice?.();
          Notification.success?.(`Brightness: ${v}`);
        } catch (err) {
          console.error('[Mobile] setBrightness failed:', err);
          Notification.failure?.('Failed to set brightness');
        } finally {
          this._brightnessCommitInFlight = false;
        }
      },
      { passive: true }
    );
  }

  _bindAnimationOnce() {
    if (this._boundAnimation) return;
    this._boundAnimation = true;

    const modalEl = this._modalEl;
    if (!modalEl) return;

    const shapesRow = modalEl.querySelector('#m-anim-shapes-row');
    if (shapesRow && shapesRow.dataset.bound !== '1') {
      shapesRow.dataset.bound = '1';

      const setAnimSlider = (id, value) => {
        const slider = modalEl.querySelector(`#m-anim-slider-${id}`);
        if (!slider) return;

        slider.value = String(value);

        // Let your existing delegated handler update LS + the value label
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      };

      shapesRow.querySelectorAll('[data-shape]').forEach((btn) => {
        btn.addEventListener(
          'click',
          () => {
            const ls = this.editor.lightshow;
            if (!ls) return;
            const shape = String(btn.dataset.shape || '');
            if (!shape) return;

            try {
              ls.setShape(shape);
              if (shape === 'heart') setAnimSlider('circleRadius', 45);
              else if (shape === 'orbit') setAnimSlider('circleRadius', 400);
              else if (shape === 'circle') setAnimSlider('circleRadius', 355);
              else setAnimSlider('circleRadius', 385);
              ls.angle = 0;
            } catch {}
          },
          { passive: true }
        );
      });
    }

    const controlsMount = modalEl.querySelector('#m-anim-controls-mount');
    if (controlsMount && controlsMount.dataset.bound !== '1') {
      controlsMount.dataset.bound = '1';

      controlsMount.addEventListener(
        'input',
        (e) => {
          const t = e.target;
          if (!t || t.nodeType !== 1) return;
          const id = String(t.dataset.animId || '');
          if (!id) return;

          const ls = this.editor.lightshow;
          if (!ls) return;

          const spec = this._animSpecs.find((s) => s.id === id);
          if (!spec) return;

          const raw = t.value;
          const num = spec.step < 1 ? Number(raw) : (Number(raw) | 0);

          try {
            spec.set(ls, num);
          } catch {}

          const valEl = modalEl.querySelector(`#m-anim-value-${id}`);
          if (valEl) valEl.textContent = spec.step < 1 ? String(num) : String(num | 0);
        },
        { passive: true }
      );
    }
  }

  async sync({ deviceType = null } = {}) {
    const modalEl = this._modalEl;
    if (!modalEl) return;

    const dt = deviceType || this._selectedDeviceType('Duo');

    const connected = this._isConnected();
    const brightnessSupported = this._supportsDeviceBrightness();

    await this._renderDeviceSection({ dt, connected, brightnessSupported });
    await this._renderAnimationSection({ dt });
    await this._renderAnimationSliders();
  }

  async show(deviceType = null) {
    await this.ensure();

    if (!this._ensureBootstrap()) {
      Notification.failure?.('Bootstrap modal is unavailable');
      return;
    }

    await this.sync({ deviceType });

    const inst = window.bootstrap.Modal.getOrCreateInstance(this._modalEl, { backdrop: true, keyboard: true });
    inst.show();
  }

  async hide() {
    await this.ensure();
    if (!this._ensureBootstrap()) return;
    const inst = window.bootstrap.Modal.getOrCreateInstance(this._modalEl);
    inst.hide();
  }
}

