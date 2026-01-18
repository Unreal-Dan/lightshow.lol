/* js/mobile/SettingsSheet.js */

export default class SettingsSheet {
  constructor({ modalEl }) {
    this.modalEl = modalEl;

    this._bound = false;

    this._dialog = null;
    this._content = null;
    this._body = null;

    this._height = 0; // current sheet height in px

    this._drag = {
      active: false,
      startY: 0,
      startHeight: 0,
      pointerId: null,
      mode: 'none', // 'sheet'
    };

    this._ptr = {
      active: false,
      startY: 0,
    };

    this._onShown = this._onShown.bind(this);
    this._onHidden = this._onHidden.bind(this);

    this._onTouchStartGlobal = this._onTouchStartGlobal.bind(this);
    this._onTouchMoveGlobal = this._onTouchMoveGlobal.bind(this);

    this._onTouchStartBody = this._onTouchStartBody.bind(this);
    this._onTouchMoveBody = this._onTouchMoveBody.bind(this);
    this._onTouchEndBody = this._onTouchEndBody.bind(this);

    this._onPointerDownHandle = this._onPointerDownHandle.bind(this);
    this._onPointerMoveHandle = this._onPointerMoveHandle.bind(this);
    this._onPointerUpHandle = this._onPointerUpHandle.bind(this);
  }

  bind() {
    if (this._bound) return;
    this._bound = true;

    this._dialog = this.modalEl.querySelector('.modal-dialog');
    this._content = this.modalEl.querySelector('.modal-content');
    this._body = this.modalEl.querySelector('.modal-body');

    if (!this._dialog || !this._content || !this._body) return;

    this._content.classList.add('m-settings');

    this._ensureHandle();

    this.modalEl.addEventListener('shown.bs.modal', this._onShown, { passive: true });
    this.modalEl.addEventListener('hidden.bs.modal', this._onHidden, { passive: true });

    // Body drag: if scrollTop == 0 and user pulls down, shrink sheet (prevents PTR)
    this._body.addEventListener('touchstart', this._onTouchStartBody, { passive: true });
    this._body.addEventListener('touchmove', this._onTouchMoveBody, { passive: false });
    this._body.addEventListener('touchend', this._onTouchEndBody, { passive: true });
    this._body.addEventListener('touchcancel', this._onTouchEndBody, { passive: true });
  }

  _ensureHandle() {
    const existing = this._content.querySelector('.m-sheet-handle-wrap');
    if (existing) {
      const handle = existing.querySelector('.m-sheet-handle');
      if (handle) this._bindHandle(handle);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'm-sheet-handle-wrap';

    const bar = document.createElement('div');
    bar.className = 'm-sheet-handle';
    wrap.appendChild(bar);

    this._content.insertBefore(wrap, this._content.firstChild);
    this._bindHandle(wrap);
  }

  _bindHandle(handleEl) {
    handleEl.style.touchAction = 'none';

    handleEl.addEventListener('pointerdown', this._onPointerDownHandle, { passive: false });
    window.addEventListener('pointermove', this._onPointerMoveHandle, { passive: false });
    window.addEventListener('pointerup', this._onPointerUpHandle, { passive: false });
    window.addEventListener('pointercancel', this._onPointerUpHandle, { passive: false });
  }

  _onShown() {
    document.documentElement.classList.add('m-no-ptr');
    document.body.classList.add('m-no-ptr');

    window.addEventListener('touchstart', this._onTouchStartGlobal, { passive: true });
    window.addEventListener('touchmove', this._onTouchMoveGlobal, { passive: false });

    const vh = window.innerHeight || 800;

    // Start lower (top around ~65% => height ~35%), but not tiny
    const initial = Math.round(vh * 0.85);
    this._setHeight(this._clamp(initial, this._minHeight(), this._maxHeight()), true);
  }

  _onHidden() {
    window.removeEventListener('touchstart', this._onTouchStartGlobal, { passive: true });
    window.removeEventListener('touchmove', this._onTouchMoveGlobal, { passive: false });

    document.documentElement.classList.remove('m-no-ptr');
    document.body.classList.remove('m-no-ptr');

    this._drag.active = false;
    this._drag.pointerId = null;
  }

  /* -------------------------------------------------------------
     Pull-to-refresh blocker (global)
  ------------------------------------------------------------- */

  _onTouchStartGlobal(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    this._ptr.active = true;
    this._ptr.startY = t.clientY;
  }

  _onTouchMoveGlobal(e) {
    if (!this._ptr.active) return;
    const t = e.touches && e.touches[0];
    if (!t) return;

    const dy = t.clientY - this._ptr.startY;
    if (dy <= 0) return;

    const target = e.target && e.target.nodeType === 1 ? e.target : null;
    if (target && target.closest && target.closest('#m-settings-modal .modal-body')) return;

    try {
      e.preventDefault();
    } catch {}
  }

  /* -------------------------------------------------------------
     Sheet resizing from HANDLE (pointer events)
     - Drag UP => increase height
     - Drag DOWN => decrease height
     - No snap
  ------------------------------------------------------------- */

  _onPointerDownHandle(e) {
    if (!e) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    try {
      e.preventDefault();
      e.stopPropagation();
    } catch {}

    this._drag.active = true;
    this._drag.pointerId = e.pointerId;
    this._drag.startY = e.clientY;
    this._drag.startHeight = this._height || this._currentHeightFromCss();
    this._drag.mode = 'sheet';

    // remove easing during live drag
    this._content.style.transition = 'none';

    try {
      e.target.setPointerCapture(e.pointerId);
    } catch {}
  }

  _onPointerMoveHandle(e) {
    if (!this._drag.active) return;
    if (e.pointerId !== this._drag.pointerId) return;
    if (this._drag.mode !== 'sheet') return;

    try {
      e.preventDefault();
    } catch {}

    const dy = this._drag.startY - e.clientY; // up is +dy
    const next = this._drag.startHeight + dy;

    this._setHeight(this._clamp(next, this._minHeight(), this._maxHeight()), false);
  }

  _onPointerUpHandle(e) {
    if (!this._drag.active) return;
    if (e.pointerId !== this._drag.pointerId) return;

    this._drag.active = false;
    this._drag.pointerId = null;

    // restore easing on release
    this._content.style.transition = 'height 160ms ease';
  }

  /* -------------------------------------------------------------
     Sheet resizing from BODY pull-down at scrollTop=0
     - Only shrink when at top and pulling down
  ------------------------------------------------------------- */

  _onTouchStartBody(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;

    this._drag.active = true;
    this._drag.mode = 'none';
    this._drag.startY = t.clientY;
    this._drag.startHeight = this._height || this._currentHeightFromCss();
  }

  _onTouchMoveBody(e) {
    if (!this._drag.active) return;

    const t = e.touches && e.touches[0];
    if (!t) return;

    const st = this._body.scrollTop || 0;
    const dyDown = t.clientY - this._drag.startY;

    // Only convert to sheet resize when at top and pulling down
    if (st <= 0 && dyDown > 0) {
      this._drag.mode = 'sheet';

      try {
        e.preventDefault();
      } catch {}

      // during touch resize, kill easing
      this._content.style.transition = 'none';

      const next = this._drag.startHeight - dyDown;
      this._setHeight(this._clamp(next, this._minHeight(), this._maxHeight()), false);
    }
  }

  _onTouchEndBody() {
    if (!this._drag.active) return;
    this._drag.active = false;

    // restore easing after touch resize
    this._content.style.transition = 'height 160ms ease';
  }

  /* -------------------------------------------------------------
     Helpers
  ------------------------------------------------------------- */

  _minHeight() {
    // Must always show header + footer + a bit of body
    return 220;
  }

  _maxHeight() {
    // Full viewport height
    return Math.max(this._minHeight(), (window.innerHeight || 800));
  }

  _currentHeightFromCss() {
    try {
      const cs = window.getComputedStyle(this._content);
      const h = parseFloat(cs.height || '0');
      return Number.isFinite(h) && h > 0 ? h : 0;
    } catch {
      return 0;
    }
  }

  _setHeight(px, animate) {
    const v = Math.max(0, Math.round(px));
    this._height = v;

    if (animate) this._content.style.transition = 'height 160ms ease';
    else this._content.style.transition = 'none';

    // Drive CSS var so CSS can choose svh/vh fallback, etc.
    this._content.style.setProperty('--m-sheet-h', `${v}px`);
  }

  _clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }
}

