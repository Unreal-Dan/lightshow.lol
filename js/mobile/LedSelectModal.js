/* js/mobile/LedSelectModal.js */

import SimpleViews from './SimpleViews.js';
import SimpleDom from './SimpleDom.js';

export default class LedSelectModal {
  constructor({ views = null, basePath = 'js/mobile/views/' } = {}) {
    this.views = views || new SimpleViews({ basePath });

    this.root = null;
    this.dom = null;

    this._preloaded = false;

    this._onDone = null;
    this._onCancel = null;

    this._deviceName = null;

    this._imageSrc = null;
    this._imageSrcAlt = null;
    this._positionsUrl = null;
    this._positionsUrlAlt = null;
    this._swapEnabled = false;
    this._useAlt = false;

    this._ledCount = 0;

    this._selected = new Set(); // ints
    this._source = -1; // int, -1 means none

    this._points = null; // [{x,y},...]
    this._origW = 1;
    this._origH = 1;

    // stage drag-selection
    this._dragging = false;
    this._dragPointerId = -1;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragCurX = 0;
    this._dragCurY = 0;
    this._selectionBox = null;

    // ghost backdrop click right after open
    this._backdropSquelchUntil = 0;

    this._delegatedInstalled = false;

    this._onRootClick = this._onRootClick.bind(this);
    this._onResize = this._onResize.bind(this);

    this._onStagePointerDown = this._onStagePointerDown.bind(this);
    this._onStagePointerMove = this._onStagePointerMove.bind(this);
    this._onStagePointerUp = this._onStagePointerUp.bind(this);
  }

  async preload() {
    if (this._preloaded) return;
    await this.views.load('led-select.html');
    this._preloaded = true;
  }

  mount() {
    if (this.root && this.root.parentElement === document.body) return;

    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }

    this.root = document.createElement('div');
    this.root.className = 'm-led-select';
    document.body.appendChild(this.root);

    this.dom = new SimpleDom(this.root);

    if (!this._delegatedInstalled) {
      this._delegatedInstalled = true;

      // Keep root logic strictly for buttons/backdrop. Do NOT intercept pointers globally.
      this.root.addEventListener('click', this._onRootClick, { passive: false });
      window.addEventListener('resize', this._onResize, { passive: true });
    }

    this.preload().catch(() => {});
  }

  isOpen() {
    return !!(this.root && this.root.classList.contains('is-open'));
  }

  close() {
    this._onDone = null;
    this._onCancel = null;

    this._dragging = false;
    this._dragPointerId = -1;
    this._removeSelectionBox();

    this._points = null;

    this._backdropSquelchUntil = 0;

    if (this.root) {
      this.root.innerHTML = '';
      this.root.classList.remove('is-open');
      this.root.style.pointerEvents = '';
      this.root.style.display = '';
      this.root.style.position = '';
      this.root.style.inset = '';
      this.root.style.opacity = '';
      this.root.style.visibility = '';
      this.root.style.zIndex = '';
    }
  }

  async open({
    title = 'LEDs',
    ledCount = 0,

    deviceName = null,
    imageSrc = null,
    imageSrcAlt = null,
    swapEnabled = false,

    positions = null,
    positionsUrl = null,
    positionsUrlAlt = null,

    selectedLeds = null,
    sourceLed = 0,

    onDone = null,
    onCancel = null,
  } = {}) {
    if (!this.root) this.mount();
    if (!this.root) return;

    await this.preload();

    this._onDone = typeof onDone === 'function' ? onDone : null;
    this._onCancel = typeof onCancel === 'function' ? onCancel : null;

    this._deviceName = deviceName ? String(deviceName) : null;
    this._ledCount = Math.max(0, ledCount | 0);

    this._imageSrc = imageSrc ? String(imageSrc) : null;
    this._imageSrcAlt = imageSrcAlt ? String(imageSrcAlt) : null;
    this._swapEnabled = !!swapEnabled && !!this._imageSrcAlt;

    this._positionsUrl = positionsUrl ? String(positionsUrl) : null;
    this._positionsUrlAlt = positionsUrlAlt ? String(positionsUrlAlt) : null;

    this._useAlt = false;

    // seed selection
    this._selected = new Set();
    if (Array.isArray(selectedLeds) && selectedLeds.length) {
      for (const v of selectedLeds) {
        const n = v | 0;
        if (n >= 0 && n < this._ledCount) this._selected.add(n);
      }
    }

    let src = sourceLed | 0;
    if (!(src >= 0 && src < this._ledCount)) src = 0;

    if (this._ledCount > 0 && this._selected.size === 0) {
      // default to source only if nothing provided
      if (selectedLeds == null) this._selected.add(src);
    }
    if (this._ledCount > 0 && this._selected.size > 0 && !this._selected.has(src)) {
      this._selected.add(src);
    }

    this._source = this._selected.size ? src : -1;

    // load positions
    if (positions && typeof positions === 'object') {
      this._setPositionsFromObj(positions);
    } else {
      const url = this._resolvePositionsUrl();
      if (url) {
        const obj = await this._fetchPositions(url);
        this._setPositionsFromObj(obj);
      } else {
        this._points = null;
        this._origW = 1;
        this._origH = 1;
      }
    }

    const frag = await this.views.render('led-select.html', {
      title: String(title || 'LEDs'),
      hasSwap: this._swapEnabled ? '' : 'hidden',
    });

    this.root.innerHTML = '';
    this.root.appendChild(frag);
    this.dom = new SimpleDom(this.root);

    // bring to front
    this.root.style.zIndex = '1000001';
    this.root.style.position = 'fixed';
    this.root.style.inset = '0';
    this.root.style.display = 'block';
    this.root.style.opacity = '1';
    this.root.style.visibility = 'visible';
    this.root.style.pointerEvents = 'auto';

    this.root.classList.add('is-open');

    // suppress the opening tap’s delayed click from closing the sheet
    this._backdropSquelchUntil = Date.now() + 650;

    // bind stage pointer handlers (ONLY on the selection stage)
    this._bindStageHandlers();

    // set image & wait for layout, then build indicators
    const img = this.dom.$('[data-role="deviceimg"]');
    if (img) {
      const srcToUse = this._useAlt && this._imageSrcAlt ? this._imageSrcAlt : this._imageSrc;
      if (srcToUse) img.src = this._cacheBust(srcToUse);
      await this._waitForImageReady(img);

      // iOS can still settle layout a tick later
      await this._nextFrame();
    }

    this._buildIndicators();
    this._normalizeSelection();
    this._syncUI();
  }

  _bindStageHandlers() {
    const stage = this.dom.$('[data-role="stage"]');
    if (!stage) return;
    if (stage.dataset.ledStageBound === '1') return;
    stage.dataset.ledStageBound = '1';

    stage.addEventListener('pointerdown', this._onStagePointerDown, { passive: false });
    stage.addEventListener('pointermove', this._onStagePointerMove, { passive: false });
    stage.addEventListener('pointerup', this._onStagePointerUp, { passive: false });
    stage.addEventListener('pointercancel', this._onStagePointerUp, { passive: false });
  }

  async _waitForImageReady(img, timeoutMs = 2000) {
    if (!img) return;

    const hasLayout = () => {
      if (!img.complete) return false;
      if (!img.naturalWidth || !img.naturalHeight) return false;
      const r = img.getBoundingClientRect();
      return r.width > 8 && r.height > 8;
    };

    if (hasLayout()) return;

    await new Promise((resolve) => {
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        try { cleanup(); } catch {}
        resolve();
      };

      const cleanup = () => {
        clearTimeout(t);
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onLoad);
      };

      const onLoad = () => {
        requestAnimationFrame(() => requestAnimationFrame(finish));
      };

      img.addEventListener('load', onLoad);
      img.addEventListener('error', onLoad);

      const t = setTimeout(finish, timeoutMs);
    });

    if (!hasLayout()) {
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
  }

  async _nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  _cacheBust(url) {
    const u = String(url || '');
    if (!u) return u;
    const sep = u.includes('?') ? '&' : '?';
    return `${u}${sep}v=${Date.now()}`;
  }

  _resolvePositionsUrl() {
    if (this._useAlt && this._positionsUrlAlt) return this._positionsUrlAlt;
    if (this._positionsUrl) return this._positionsUrl;

    if (this._deviceName) {
      const dn = this._deviceName.toLowerCase();
      return `public/data/${dn}-led-positions.json`;
    }
    return null;
  }

  async _fetchPositions(url) {
    try {
      const res = await fetch(this._cacheBust(url), { cache: 'no-store' });
      if (!res.ok) return { points: [], original_width: 1, original_height: 1 };
      const j = await res.json();
      return j && typeof j === 'object' ? j : { points: [], original_width: 1, original_height: 1 };
    } catch {
      return { points: [], original_width: 1, original_height: 1 };
    }
  }

  _setPositionsFromObj(obj) {
    const pts = Array.isArray(obj?.points) ? obj.points : [];
    this._points = pts;
    this._origW = Math.max(1, (obj?.original_width | 0) || 1);
    this._origH = Math.max(1, (obj?.original_height | 0) || 1);
  }

  _onResize() {
    if (!this.isOpen()) return;
    this._buildIndicators();
    this._normalizeSelection();
    this._syncUI();
  }

  _removeSelectionBox() {
    if (this._selectionBox && this._selectionBox.parentElement) {
      this._selectionBox.parentElement.removeChild(this._selectionBox);
    }
    this._selectionBox = null;
  }

  _buildIndicators() {
    const overlay = this.dom.$('[data-role="overlay"]');
    const grid = this.dom.$('[data-role="grid"]');
    const device = this.dom.$('[data-role="device"]');
    const img = this.dom.$('[data-role="deviceimg"]');

    if (!overlay || !grid || !device) return;

    overlay.innerHTML = '';
    grid.innerHTML = '';

    const havePoints = Array.isArray(this._points) && this._points.length > 0 && !!img;

    if (havePoints) {
      grid.classList.add('hidden');
      device.classList.remove('hidden');

      const devRect = device.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();

      // If layout is still zeroed, bail; resize/load will rebuild.
      if (imgRect.width <= 8 || imgRect.height <= 8) return;

      const scaleX = imgRect.width / this._origW;
      const scaleY = imgRect.height / this._origH;

      const ox = imgRect.left - devRect.left;
      const oy = imgRect.top - devRect.top;

      overlay.style.left = `${ox}px`;
      overlay.style.top = `${oy}px`;
      overlay.style.width = `${imgRect.width}px`;
      overlay.style.height = `${imgRect.height}px`;

      const max = Math.min(this._ledCount, this._points.length);
      for (let i = 0; i < max; i++) {
        const p = this._points[i];
        const x = Number(p?.x ?? 0) * scaleX;
        const y = Number(p?.y ?? 0) * scaleY;

        const el = document.createElement('div');
        el.className = 'm-led-indicator';
        el.dataset.role = 'led';
        el.dataset.ledIndex = String(i);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;

        overlay.appendChild(el);
      }
      return;
    }

    // fallback: grid
    device.classList.add('hidden');
    grid.classList.remove('hidden');

    const count = this._ledCount | 0;
    if (count <= 0) return;

    const cols = Math.max(3, Math.min(10, Math.ceil(Math.sqrt(count))));
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let i = 0; i < count; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'm-led-grid-item';
      el.dataset.role = 'led';
      el.dataset.ledIndex = String(i);
      el.textContent = String(i + 1);
      grid.appendChild(el);
    }
  }

  _syncUI() {
    const els = this.dom.all('[data-role="led"]');
    const src = this._source | 0;

    for (const el of els) {
      const idx = Number(el.dataset.ledIndex ?? -1) | 0;
      const sel = this._selected.has(idx);
      const main = (src >= 0) && (idx === src);
      el.classList.toggle('is-selected', !!sel);
      el.classList.toggle('is-source', !!main);
    }

    const sum = this.dom.$('[data-role="summary"]');
    if (sum) {
      const selectedCount = this._selected.size;
      const total = this._ledCount | 0;

      if (selectedCount === 0) {
        sum.textContent = total > 0 ? `Selected: 0 • Pick at least one` : `Selected: 0`;
      } else {
        sum.textContent = total > 0
          ? `Source: ${(src + 1)} • Selected: ${selectedCount}/${total}`
          : `Selected: ${selectedCount}`;
      }
    }

    const doneBtn = this.dom.$('[data-act="done"]') || this.dom.$('.m-led-done');
    if (doneBtn) doneBtn.disabled = (this._selected.size === 0);

    const hint = this.dom.$('[data-role="proceedhint"]');
    if (hint) hint.classList.toggle('hidden', this._selected.size !== 0);
  }

  _normalizeSelection() {
    if (this._ledCount <= 0) {
      this._selected = new Set();
      this._source = -1;
      return;
    }

    // clamp
    const next = new Set();
    for (const v of this._selected) {
      const n = v | 0;
      if (n >= 0 && n < this._ledCount) next.add(n);
    }
    this._selected = next;

    if (this._selected.size === 0) {
      this._source = -1;
      return;
    }

    let src = this._source | 0;
    if (!(src >= 0 && src < this._ledCount) || !this._selected.has(src)) {
      const arr = Array.from(this._selected).sort((a, b) => a - b);
      src = arr.length ? (arr[0] | 0) : -1;
    }
    this._source = src;
  }

  _selectAll() {
    this._selected = new Set();
    for (let i = 0; i < this._ledCount; i++) this._selected.add(i);
    this._source = this._ledCount > 0 ? 0 : -1;
    this._normalizeSelection();
    this._syncUI();
  }

  _selectNone() {
    this._selected = new Set();
    this._source = -1;
    this._normalizeSelection();
    this._syncUI();
  }

  _invert() {
    const next = new Set();
    for (let i = 0; i < this._ledCount; i++) {
      if (!this._selected.has(i)) next.add(i);
    }
    this._selected = next;
    this._source = this._selected.size ? Math.min(...Array.from(this._selected)) : -1;
    this._normalizeSelection();
    this._syncUI();
  }

  _evens() {
    const next = new Set();
    for (let i = 0; i < this._ledCount; i++) if ((i % 2) === 0) next.add(i);
    this._selected = next;
    this._source = this._selected.size ? Math.min(...Array.from(this._selected)) : -1;
    this._normalizeSelection();
    this._syncUI();
  }

  _odds() {
    const next = new Set();
    for (let i = 0; i < this._ledCount; i++) if ((i % 2) !== 0) next.add(i);
    this._selected = next;
    this._source = this._selected.size ? Math.min(...Array.from(this._selected)) : -1;
    this._normalizeSelection();
    this._syncUI();
  }

  async _swap() {
    if (!this._swapEnabled) return;

    this._useAlt = !this._useAlt;

    const url = this._resolvePositionsUrl();
    if (url) {
      const obj = await this._fetchPositions(url);
      this._setPositionsFromObj(obj);
    } else {
      this._points = null;
      this._origW = 1;
      this._origH = 1;
    }

    const img = this.dom.$('[data-role="deviceimg"]');
    if (img) {
      const srcToUse = this._useAlt && this._imageSrcAlt ? this._imageSrcAlt : this._imageSrc;
      if (srcToUse) img.src = this._cacheBust(srcToUse);
      await this._waitForImageReady(img);
      await this._nextFrame();
    }

    this._buildIndicators();
    this._normalizeSelection();
    this._syncUI();
  }

  _done() {
    this._normalizeSelection();
    if (this._selected.size === 0) {
      this._syncUI();
      return;
    }

    const out = Array.from(this._selected).sort((a, b) => a - b);
    const src = (this._source | 0);

    const fn = this._onDone;
    this.close();
    if (fn) {
      try { fn({ sourceLed: src, selectedLeds: out }); } catch {}
    }
  }

  _cancel() {
    const fn = this._onCancel;
    this.close();
    if (fn) {
      try { fn(); } catch {}
    }
  }

  _tapLed(idx) {
    const i = idx | 0;
    if (!(i >= 0 && i < this._ledCount)) return;

    const isSel = this._selected.has(i);
    const isSrc = (this._source | 0) === i;

    if (!isSel) {
      this._selected.add(i);
      this._source = i;
    } else if (!isSrc) {
      this._source = i;
    } else {
      this._selected.delete(i);
    }

    this._normalizeSelection();
    this._syncUI();
  }

  _startSelectionBox(x, y) {
    const stage = this.dom.$('[data-role="stage"]');
    if (!stage) return;

    this._removeSelectionBox();

    this._selectionBox = document.createElement('div');
    this._selectionBox.className = 'm-led-selection-box';
    stage.appendChild(this._selectionBox);

    this._selectionBox.style.left = `${x}px`;
    this._selectionBox.style.top = `${y}px`;
    this._selectionBox.style.width = '0px';
    this._selectionBox.style.height = '0px';
  }

  _updateSelectionBox(x0, y0, x1, y1) {
    if (!this._selectionBox) return;

    const l = Math.min(x0, x1);
    const t = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);

    this._selectionBox.style.left = `${l}px`;
    this._selectionBox.style.top = `${t}px`;
    this._selectionBox.style.width = `${w}px`;
    this._selectionBox.style.height = `${h}px`;
  }

  _finishBoxSelection(x0, y0, x1, y1) {
    const stage = this.dom.$('[data-role="stage"]');
    if (!stage) return;

    const l = Math.min(x0, x1);
    const t = Math.min(y0, y1);
    const r = Math.max(x0, x1);
    const b = Math.max(y0, y1);

    const isClick = Math.abs(x1 - x0) <= 3 && Math.abs(y1 - y0) <= 3;
    if (isClick) return;

    const ledEls = this.dom.all('[data-role="led"]');

    const stageRect = stage.getBoundingClientRect();
    const sx = stage.scrollLeft || 0;
    const sy = stage.scrollTop || 0;

    const inBox = [];
    for (const el of ledEls) {
      const rect = el.getBoundingClientRect();
      const cx = ((rect.left + rect.right) * 0.5 - stageRect.left) + sx;
      const cy = ((rect.top + rect.bottom) * 0.5 - stageRect.top) + sy;

      if (cx >= l && cx <= r && cy >= t && cy <= b) {
        const idx = Number(el.dataset.ledIndex ?? -1) | 0;
        if (idx >= 0 && idx < this._ledCount) inBox.push(idx);
      }
    }

    if (inBox.length === 0) return;

    inBox.sort((a, b) => a - b);
    this._selected = new Set(inBox);
    this._source = inBox[0] | 0;

    this._normalizeSelection();
    this._syncUI();
  }

  _stageCoords(stage, clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const sx = stage.scrollLeft || 0;
    const sy = stage.scrollTop || 0;
    return {
      x: (clientX - rect.left) + sx,
      y: (clientY - rect.top) + sy,
    };
  }

  _onStagePointerDown(e) {
    if (!this.isOpen()) return;
    if (!e) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const stage = this.dom.$('[data-role="stage"]');
    if (!stage) return;

    const ledEl = e.target?.closest?.('[data-role="led"]') || null;
    if (ledEl) {
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      const idx = Number(ledEl.dataset.ledIndex ?? -1) | 0;
      if (idx >= 0 && idx < this._ledCount) this._tapLed(idx);
      return;
    }

    // start drag selection on stage background
    try { e.preventDefault(); e.stopPropagation(); } catch {}

    this._dragging = true;
    this._dragPointerId = e.pointerId;

    const p = this._stageCoords(stage, e.clientX, e.clientY);
    this._dragStartX = p.x;
    this._dragStartY = p.y;
    this._dragCurX = p.x;
    this._dragCurY = p.y;

    this._startSelectionBox(this._dragStartX, this._dragStartY);

    try { stage.setPointerCapture?.(e.pointerId); } catch {}
  }

  _onStagePointerMove(e) {
    if (!this.isOpen()) return;
    if (!this._dragging) return;
    if (e.pointerId !== this._dragPointerId) return;

    const stage = this.dom.$('[data-role="stage"]');
    if (!stage) return;

    try { e.preventDefault(); e.stopPropagation(); } catch {}

    const p = this._stageCoords(stage, e.clientX, e.clientY);
    this._dragCurX = p.x;
    this._dragCurY = p.y;

    this._updateSelectionBox(this._dragStartX, this._dragStartY, this._dragCurX, this._dragCurY);
  }

  _onStagePointerUp(e) {
    if (!this.isOpen()) return;
    if (!this._dragging) return;
    if (e.pointerId !== this._dragPointerId) return;

    const stage = this.dom.$('[data-role="stage"]');
    if (!stage) return;

    try { e.preventDefault(); e.stopPropagation(); } catch {}

    this._dragging = false;
    this._dragPointerId = -1;

    const p = this._stageCoords(stage, e.clientX, e.clientY);
    this._finishBoxSelection(this._dragStartX, this._dragStartY, p.x, p.y);

    this._removeSelectionBox();
  }

  _onRootClick(e) {
    if (!this.isOpen()) return;
    if (!e) return;

    const actBtn = e.target?.closest?.('[data-act]');
    if (actBtn) {
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      const act = String(actBtn.dataset.act || '');

      if (act === 'cancel') return this._cancel();
      if (act === 'done') return this._done();
      if (act === 'swap') return this._swap();

      if (act === 'all') return this._selectAll();
      if (act === 'none') return this._selectNone();
      if (act === 'invert') return this._invert();
      if (act === 'evens') return this._evens();
      if (act === 'odds') return this._odds();

      return;
    }

    const isLed = !!e.target?.closest?.('[data-role="led"]');
    const isStage = !!e.target?.closest?.('[data-role="stage"]');
    // If the click is inside the stage, ignore it.
    // Stage pointer handlers already handle LED taps and box-drag.
    if (isStage && !isLed) {
      this._selectNone();
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      return;
    }

    // backdrop click closes (but ignore ghost click right after open)
    const sheet = this.dom.$('.m-led-sheet');
    if (sheet && !sheet.contains(e.target)) {
      if (Date.now() < this._backdropSquelchUntil) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      this._cancel();
      return;
    }
  }
}

