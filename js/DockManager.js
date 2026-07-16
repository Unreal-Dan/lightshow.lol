// DockManager.js — Full docking system: dock areas, floating panels, resize, reorder

const CLICK_THRESHOLD = 5; // px — mouse move threshold to distinguish click vs drag
const DOCK_HIT_SIZE = 40; // px — width/height of edge hit zones
const MIN_DOCK_SIZE = 160; // px — minimum dock width/height
const DEFAULT_DOCK_SIZE = 320; // px — default left/right dock width
const DEFAULT_BOTTOM_SIZE = 200; // px
const SNAP_DISTANCE = 12; // px — magnetic snap activation distance

export default class DockManager {
  constructor(editor) {
    this.editor = editor;
    this.panels = new Map(); // id -> { panel, record }
    this.dockSizes = {
      left: DEFAULT_DOCK_SIZE,
      right: DEFAULT_DOCK_SIZE,
      bottom: DEFAULT_BOTTOM_SIZE,
    };
    this.dockPanelOrder = { left: [], right: [], bottom: [] };
    this.floatingPanels = []; // panel records

    // DOM elements
    this.container = document.body;
    this.docks = {}; // left/right/bottom: { area, content }
    this.resizeHandles = {};
    this.dropZonePreviews = {};
    this.insertIndicator = null;

    this.drag = null; // current drag state
    this.resize = null; // current resize state
    this._suppressSave = false; // batch-save guard for setup/reset
    this._floatingHeights = new Map(); // panelId -> last known height
    this._floatingObservers = new Map(); // panelId -> ResizeObserver
    this._stackingBusy = false; // prevent re-entrant chain propagation
    this._zCounter = 200; // stacking order for floating panels
    this._suppressStack = false; // suppress stack propagation during restore
    this._observerVersions = new Map(); // panelId -> counter to invalidate stale observer callbacks
  }

  /* ── Initialization ── */

  async initialize() {
    // Guard: don't re-create if already initialized
    if (document.getElementById('dock-left')) return;

    this.createDockAreas();
    this.createResizeHandles();
    this.createDropZonePreviews();
    this.createInsertIndicator();
    this.bindGlobalListeners();
  }

  destroy() {
    ['left', 'right', 'bottom'].forEach(side => {
      const el = document.getElementById(`dock-${side}`);
      if (el) el.remove();
      const re = document.getElementById(`resize-${side}`);
      if (re) re.remove();
    });
    document.querySelectorAll('.dock-zone-preview, .dock-insert-indicator').forEach(el => el.remove());

    // Remove drag listeners from all registered panel headers
    this.panels.forEach((record) => {
      const header = record.panel.panel.querySelector('.panel-header');
      if (header) {
        header._dockDragBound = false;
      }
    });
    // Note: header mousedown listeners survive but _dockDragBound flag prevents re-add
    // The header listeners will call startDrag which will fail gracefully since docks are gone

    this.docks = {};
    this.resizeHandles = {};
    this.dropZonePreviews = {};
    this.insertIndicator = null;
    this.dockPanelOrder = { left: [], right: [], bottom: [] };
    this.floatingPanels = [];
    this.panels.clear();
    this._floatingObservers.forEach(o => o.disconnect());
    this._floatingObservers.clear();
    this._floatingHeights.clear();
    this.drag = null;
    this.resize = null;
  }

  createDockAreas() {
    ['left', 'right', 'bottom'].forEach(side => {
      const area = document.createElement('div');
      area.className = `dock-area ${side} hidden`;
      area.id = `dock-${side}`;

      const content = document.createElement('div');
      content.className = 'dock-content';
      area.appendChild(content);

      this.container.appendChild(area);
      this.docks[side] = { area, content };
    });
  }

  createResizeHandles() {
    // Left resize handle (between left dock and canvas)
    const leftHandle = document.createElement('div');
    leftHandle.className = 'resize-handle vertical';
    leftHandle.id = 'resize-left';
    this.positionResizeHandle('left', leftHandle);
    this.container.appendChild(leftHandle);
    this.resizeHandles.left = leftHandle;

    // Right resize handle (between canvas and right dock)
    const rightHandle = document.createElement('div');
    rightHandle.className = 'resize-handle vertical';
    rightHandle.id = 'resize-right';
    this.positionResizeHandle('right', rightHandle);
    this.container.appendChild(rightHandle);
    this.resizeHandles.right = rightHandle;

    // Bottom resize handle (between canvas and bottom dock)
    const bottomHandle = document.createElement('div');
    bottomHandle.className = 'resize-handle horizontal';
    bottomHandle.id = 'resize-bottom';
    this.positionResizeHandle('bottom', bottomHandle);
    this.container.appendChild(bottomHandle);
    this.resizeHandles.bottom = bottomHandle;

    // Hide resize handles initially (shown when dock has panels)
    ['left', 'right', 'bottom'].forEach(side => {
      this.resizeHandles[side].style.display = 'none';
    });

    // Bind resize events
    ['left', 'right', 'bottom'].forEach(side => {
      const handle = this.resizeHandles[side];
      handle.addEventListener('mousedown', (e) => this.startResize(side, e));
    });
  }

  positionResizeHandle(side, el) {
    if (side === 'left') {
      el.style.left = this.dockSizes.left + 'px';
    } else if (side === 'right') {
      el.style.right = this.dockSizes.right + 'px';
    } else if (side === 'bottom') {
      el.style.bottom = this.dockSizes.bottom + 'px';
    }
  }

  createDropZonePreviews() {
    ['left', 'right'].forEach(side => {
      const preview = document.createElement('div');
      preview.className = `dock-zone-preview ${side}`;
      this.container.appendChild(preview);
      this.dropZonePreviews[side] = preview;
    });
  }

  updateDropZonePreviews() {
    ['left', 'right'].forEach(side => {
      const preview = this.dropZonePreviews[side];
      if (!preview) return;
      const area = this.docks[side]?.area;
      if (!area) return;
      const hasPanels = this.dockPanelOrder[side].length > 0;
      const previewW = hasPanels ? area.getBoundingClientRect().width : DEFAULT_DOCK_SIZE / 2;
      if (side === 'left') {
        preview.style.left = '0px';
        preview.style.top = '0px';
        preview.style.width = previewW + 'px';
        preview.style.height = '100%';
        preview.style.bottom = 'auto';
        preview.style.right = 'auto';
      } else {
        preview.style.right = '0px';
        preview.style.top = '0px';
        preview.style.width = previewW + 'px';
        preview.style.height = '100%';
        preview.style.bottom = 'auto';
        preview.style.left = 'auto';
      }
    });
  }

  createInsertIndicator() {
    const el = document.createElement('div');
    el.className = 'dock-insert-indicator';
    this.container.appendChild(el);
    this.insertIndicator = el;
  }

  /* ── Panel Registration ── */

  register(panel, defaultDock = 'left') {
    const id = panel.panel.id;
    const record = { panel, dock: null, index: -1 };
    this.panels.set(id, record);

    // Add headerdrag listener
    this.enableHeaderDrag(panel);

    // Wire collapse toggles to save layout
    const origToggle = panel.toggleCollapse.bind(panel);
    panel.toggleCollapse = () => {
      origToggle();
      this.saveLayout();
    };

    // Add to default dock (skip if null)
    if (defaultDock) {
      this.dockPanel(id, defaultDock);
    }
  }

  enableHeaderDrag(panel) {
    const header = panel.panel.querySelector('.panel-header');
    if (!header || header._dockDragBound) return;
    header._dockDragBound = true;

    header.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.collapse-btn')) return;
      if (e.target.closest('.close-btn')) return;
      if (e.target.closest('button')) return;
      if (e.target.closest('select')) return;
      if (e.target.closest('input')) return;
      if (e.target.closest('a')) return;
      this.startDrag(panel, e);
    });
  }

  /* ── Docking / Undocking ── */

  dockPanel(id, side, index = -1) {
    const record = this.panels.get(id);
    if (!record) return;

    // Remove from current location
    this.removePanel(id);

    // Add to dock
    record.dock = side;
    record.floating = false;

    if (index < 0 || index > this.dockPanelOrder[side].length) {
      this.dockPanelOrder[side].push(id);
      record.index = this.dockPanelOrder[side].length - 1;
    } else {
      this.dockPanelOrder[side].splice(index, 0, id);
      record.index = index;
    }

    // Move DOM element
    const content = this.docks[side].content;
    const panelEl = record.panel.panel;

    // Remove position:fixed if it was floating
    panelEl.style.position = '';
    panelEl.style.left = '';
    panelEl.style.top = '';
    panelEl.style.width = '';
    panelEl.style.zIndex = '';

    // Append at correct index
    const children = content.children;
    if (index >= 0 && index < children.length) {
      content.insertBefore(panelEl, children[index]);
    } else {
      content.appendChild(panelEl);
    }

    this.updateDockVisibility(side);
    this.updateCanvasLayout();
    this.saveLayout();
  }

  floatPanel(id, x, y) {
    const record = this.panels.get(id);
    if (!record) return;

    // Remove from current location
    this.removePanel(id);

    record.dock = null;
    record.floating = true;
    this.floatingPanels.push(record);

    // Style as floating
    const panelEl = record.panel.panel;
    panelEl.style.position = 'fixed';
    panelEl.style.left = x + 'px';
    panelEl.style.top = y + 'px';
    panelEl.style.width = Math.min(400, window.innerWidth - 40) + 'px';
    this._zCounter++;
    panelEl.style.zIndex = String(this._zCounter);
    panelEl.classList.add('floating-panel');

    // Click-to-front: bring panel to highest z-index on mousedown
    panelEl.addEventListener('mousedown', () => {
      this._bringFloatingToFront(panelEl);
    });

    this.container.appendChild(panelEl);

    this._setupFloatingObserver(id, panelEl);
    this._updateStackClasses();
    this.updateCanvasLayout();
    this.saveLayout();
  }

  _bringFloatingToFront(panelEl) {
    this._zCounter++;
    panelEl.style.zIndex = String(this._zCounter);
  }

  /* ── Stacking Chain (floating panels) ── */

  _setupFloatingObserver(panelId, panelEl) {
    this._teardownFloatingObserver(panelId);

    let baselineFired = false;

    const observerVersion = (this._observerVersions.get(panelId) || 0) + 1;
    this._observerVersions.set(panelId, observerVersion);

    const observer = new ResizeObserver((entries) => {
      // Stale observer callback from before re-init — ignore
      if (this._observerVersions.get(panelId) !== observerVersion) return;

      const newHeight = entries[0].contentRect.height;

      // First fire just sets the baseline — offsetHeight includes borders
      // while contentRect.height doesn't, so pre-setting would give a
      // spurious delta on the very first observation.
      if (!baselineFired) {
        baselineFired = true;
        this._floatingHeights.set(panelId, newHeight);
        return;
      }

      if (this._stackingBusy) return;
      if (this._suppressStack) return;

      const oldHeight = this._floatingHeights.get(panelId);
      if (oldHeight === undefined) return;
      const delta = newHeight - oldHeight;
      this._floatingHeights.set(panelId, newHeight);
      if (Math.abs(delta) < 0.5) return;
      this._propagateStackDelta(panelId, Math.round(delta));
    });

    observer.observe(panelEl);
    this._floatingObservers.set(panelId, observer);
  }

  _teardownFloatingObserver(panelId) {
    const obs = this._floatingObservers.get(panelId);
    if (obs) { obs.disconnect(); this._floatingObservers.delete(panelId); }
    this._floatingHeights.delete(panelId);
  }

  _findStackBelow(panelId, delta = 0) {
    const below = new Set();
    let queue = [panelId];

    while (queue.length > 0) {
      const nextQueue = [];

      for (const topId of queue) {
        const topRecord = this.panels.get(topId);
        if (!topRecord) continue;
        const topRect = topRecord.panel.panel.getBoundingClientRect();
        if (!topRect) continue;

        // The source panel's height already changed; use its old bottom
        // to detect the pre-change stacking:
        //   oldBottom = rect.bottom - delta
        //   (for chained panels that haven't moved yet, delta=0, bottom is unchanged)
        const bottomToCheck = topId === panelId ? topRect.bottom - delta : topRect.bottom;

        for (const fp of this.floatingPanels) {
          const fpId = fp.panel.panel.id;
          if (below.has(fpId) || fpId === panelId) continue;

          const fpRect = fp.panel.panel.getBoundingClientRect();
          if (Math.abs(fpRect.top - bottomToCheck) > SNAP_DISTANCE) continue;
          const overlap = Math.min(topRect.right, fpRect.right) - Math.max(topRect.left, fpRect.left);
          if (overlap <= 0) continue;

          below.add(fpId);
          nextQueue.push(fpId);
        }
      }

      queue = nextQueue;
    }

    return below;
  }

  _propagateStackDelta(panelId, delta) {
    this._stackingBusy = true;

    const below = this._findStackBelow(panelId, delta);

    for (const id of below) {
      const rec = this.panels.get(id);
      if (!rec) continue;
      const el = rec.panel.panel;
      const r = el.getBoundingClientRect();
      el.style.top = (r.top + delta) + 'px';
      // Update stored height reference since position changed
      this._floatingHeights.set(id, el.offsetHeight);
    }

    this._stackingBusy = false;
    this._updateStackClasses();
    this.saveLayout();
  }

  _rebuildFloatingStack() {
    // Don't pre-set heights here — the ResizeObserver's first callback
    // sets the baseline from contentRect.height (which excludes borders).
    // Using offsetHeight here would cause a spurious delta on the next
    // observer fire, compounding on every refresh.
    this._updateStackClasses();
  }

  _updateStackClasses() {
    const SNAP = SNAP_DISTANCE;

    for (const fp of this.floatingPanels) {
      const el = fp.panel.panel;
      const r = el.getBoundingClientRect();

      let hasBelow = false;
      for (const other of this.floatingPanels) {
        if (other === fp) continue;
        const or = other.panel.panel.getBoundingClientRect();
        if (Math.abs(or.top - r.bottom) > SNAP) continue;
        const overlap = Math.min(r.right, or.right) - Math.max(r.left, or.left);
        if (overlap <= 0) continue;
        hasBelow = true;
        break;
      }

      el.classList.toggle('stacked-above', hasBelow);
    }
  }

  removePanel(id) {
    const record = this.panels.get(id);
    if (!record) return;

    // Remove from dock
    if (record.dock && this.dockPanelOrder[record.dock]) {
      const arr = this.dockPanelOrder[record.dock];
      const idx = arr.indexOf(id);
      if (idx !== -1) {
        arr.splice(idx, 1);
        this.updateDockVisibility(record.dock);
      }
    }

    // Remove from floating list
    const fi = this.floatingPanels.indexOf(record);
    if (fi !== -1) {
      this.floatingPanels.splice(fi, 1);
      record.panel.panel.classList.remove('floating-panel');
      this._teardownFloatingObserver(id);
    }

    record.dock = null;
    record.floating = false;
    record.index = -1;
  }

  updateDockVisibility(side) {
    const area = this.docks[side].area;
    const hasPanels = this.dockPanelOrder[side].length > 0;
    area.classList.toggle('hidden', !hasPanels);

    // Also toggle resize handle
    const handle = this.resizeHandles[side];
    if (handle) {
      handle.style.display = hasPanels ? '' : 'none';
    }

    // Set dock width when visible
    if (hasPanels) {
      if (side === 'left' || side === 'right') {
        area.style.width = this.dockSizes[side] + 'px';
      } else {
        area.style.height = this.dockSizes[side] + 'px';
      }
    }
  }

  /* ── Reorder within dock ── */

  reorderPanel(id, side, index) {
    const record = this.panels.get(id);
    if (!record) return;
    if (record.dock !== side) return;

    const arr = this.dockPanelOrder[side];
    const oldIdx = arr.indexOf(id);
    if (oldIdx === -1) return;

    arr.splice(oldIdx, 1);
    const newIdx = Math.min(index, arr.length);
    arr.splice(newIdx, 0, id);

    // Move DOM
    const content = this.docks[side].content;
    const panelEl = record.panel.panel;
    const children = content.children;
    if (newIdx < children.length) {
      content.insertBefore(panelEl, children[newIdx]);
    } else {
      content.appendChild(panelEl);
    }
    this.saveLayout();
  }

  /* ── Drag System ── */

  getSnapTargets() {
    const targets = [];
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Screen edges, center, and golden-ratio guides
    targets.push({
      left: 0, right: w, top: 0, bottom: h,
      centerX: w / 2, centerY: h / 2,
      thirdX: w / 3, twoThirdX: 2 * w / 3,
      thirdY: h / 3, twoThirdY: 2 * h / 3,
    });

    // Other floating panels
    for (const fp of this.floatingPanels) {
      if (this.drag && fp === this.drag.record) continue;
      const el = fp.panel.panel;
      const r = el.getBoundingClientRect();
      targets.push({
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        centerX: r.left + r.width / 2, centerY: r.top + r.height / 2,
      });
    }

    // Dock areas
    for (const side of ['left', 'right', 'bottom']) {
      if (!this.dockPanelOrder[side] || this.dockPanelOrder[side].length === 0) continue;
      const el = this.docks[side]?.area;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      targets.push({
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        centerX: r.left + r.width / 2, centerY: r.top + r.height / 2,
      });
    }

    return targets;
  }

  applyMagneticSnap(rawX, rawY) {
    const ghostEl = this.drag.ghost;
    if (!ghostEl) return { x: rawX, y: rawY, guideX: null, guideY: null };

    const gw = ghostEl.offsetWidth;
    const gh = ghostEl.offsetHeight;

    const gLeft = rawX;
    const gRight = rawX + gw;
    const gCenterX = rawX + gw / 2;
    const gTop = rawY;
    const gBottom = rawY + gh;
    const gCenterY = rawY + gh / 2;

    const targets = this.getSnapTargets();

    let snapOffsetX = 0;
    let snapOffsetY = 0;
    let bestDistX = SNAP_DISTANCE + 1;
    let bestDistY = SNAP_DISTANCE + 1;
    let snapGuideX = null;
    let snapGuideY = null;

    for (const t of targets) {
      // X-axis: compare ghost edges to target edges
      const xPairs = [
        [gLeft, t.left], [gRight, t.right], [gCenterX, t.centerX],
        [gLeft, t.right], [gRight, t.left],
      ];
      for (const [gEdge, tEdge] of xPairs) {
        const dist = Math.abs(gEdge - tEdge);
        if (dist < bestDistX) {
          bestDistX = dist;
          snapOffsetX = tEdge - gEdge;
          snapGuideX = tEdge;
        }
      }

      // Y-axis: compare ghost edges to target edges
      const yPairs = [
        [gTop, t.top], [gBottom, t.bottom], [gCenterY, t.centerY],
        [gTop, t.bottom], [gBottom, t.top],
      ];
      for (const [gEdge, tEdge] of yPairs) {
        const dist = Math.abs(gEdge - tEdge);
        if (dist < bestDistY) {
          bestDistY = dist;
          snapOffsetY = tEdge - gEdge;
          snapGuideY = tEdge;
        }
      }
    }

    const snapX = bestDistX <= SNAP_DISTANCE ? Math.round(rawX + snapOffsetX) : Math.round(rawX);
    const snapY = bestDistY <= SNAP_DISTANCE ? Math.round(rawY + snapOffsetY) : Math.round(rawY);

    return {
      x: snapX,
      y: snapY,
      guideX: bestDistX <= SNAP_DISTANCE ? snapGuideX : null,
      guideY: bestDistY <= SNAP_DISTANCE ? snapGuideY : null,
    };
  }

  startDrag(panel, e) {
    const id = panel.panel.id;
    const record = this.panels.get(id);
    if (!record) return;

    const rect = panel.panel.getBoundingClientRect();

    this.drag = {
      record,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      ghost: null,
      posLabel: null,
      snapGuides: null,
      sourceDock: record.dock,
      isDragging: false,
      currentZone: null,
      insertIndex: -1,
      insertSide: null,
    };
  }

  onDragMove(e) {
    if (!this.drag) return;

    const dx = e.clientX - this.drag.startX;
    const dy = e.clientY - this.drag.startY;

    if (!this.drag.isDragging) {
      if (Math.abs(dx) > CLICK_THRESHOLD || Math.abs(dy) > CLICK_THRESHOLD) {
        this.drag.isDragging = true;
        this.beginDragVisuals(e);
      }
      return;
    }

    // Move ghost with magnetic snapping
    if (this.drag.ghost) {
      const rawX = e.clientX - this.drag.offsetX;
      const rawY = e.clientY - this.drag.offsetY;
      const snapped = this.applyMagneticSnap(rawX, rawY);
      this.drag.ghost.style.left = snapped.x + 'px';
      this.drag.ghost.style.top = snapped.y + 'px';

      // Update position label
      if (this.drag.posLabel) {
        this.drag.posLabel.textContent = `${snapped.x}x${snapped.y}`;
      }

      // Update snap guides
      if (this.drag.snapGuides) {
        if (snapped.guideX !== null) {
          this.drag.snapGuides.vertical.style.left = snapped.guideX + 'px';
          this.drag.snapGuides.vertical.classList.add('visible');
        } else {
          this.drag.snapGuides.vertical.classList.remove('visible');
        }
        if (snapped.guideY !== null) {
          this.drag.snapGuides.horizontal.style.top = snapped.guideY + 'px';
          this.drag.snapGuides.horizontal.classList.add('visible');
        } else {
          this.drag.snapGuides.horizontal.classList.remove('visible');
        }
      }
    }

    // Detect drop zone
    this.detectDropZones(e);

    // Hide snap guides while hovering over a drop zone
    if (this.drag.snapGuides && this.drag.currentZone) {
      this.drag.snapGuides.vertical.classList.remove('visible');
      this.drag.snapGuides.horizontal.classList.remove('visible');
    }
  }

  onDragEnd(e) {
    if (!this.drag) return;

    if (this.drag.isDragging) {
      this.completeDrag(e);
    } else {
      // It was a click — toggle collapse instead
      this.drag.record.panel.toggleCollapse();
    }

    this.cleanupDrag();
  }

  beginDragVisuals(e) {
    const { record } = this.drag;
    const panelEl = record.panel.panel;

    // Create ghost element
    const ghost = panelEl.cloneNode(true);
    ghost.className = 'dock-ghost';
    ghost.style.width = panelEl.offsetWidth + 'px';
    const initX = Math.round(e.clientX - this.drag.offsetX);
    const initY = Math.round(e.clientY - this.drag.offsetY);
    ghost.style.left = initX + 'px';
    ghost.style.top = initY + 'px';
    this.container.appendChild(ghost);
    this.drag.ghost = ghost;

    // Create snap guide elements
    const vGuide = document.createElement('div');
    vGuide.className = 'snap-guide vertical';
    this.container.appendChild(vGuide);
    const hGuide = document.createElement('div');
    hGuide.className = 'snap-guide horizontal';
    this.container.appendChild(hGuide);
    this.drag.snapGuides = { vertical: vGuide, horizontal: hGuide };

    // Create position label
    const label = document.createElement('div');
    label.className = 'drag-position-label';
    label.textContent = `${initX}x${initY}`;
    this.container.appendChild(label);
    this.drag.posLabel = label;

    // Hide original panel during drag
    panelEl.style.opacity = '0';
  }

  detectDropZones(e) {
    const { innerWidth: w, innerHeight: h } = window;
    let zone = null;

    // Check edge hit zones (left/right only — no bottom dock)
    if (e.clientX < DOCK_HIT_SIZE) zone = 'left';
    else if (e.clientX > w - DOCK_HIT_SIZE) zone = 'right';

    // Check hover over existing docks (if empty or has panels)
    if (!zone) {
      // Check if over left dock area
      if (this.dockPanelOrder.left.length > 0) {
        const leftArea = this.docks.left.area;
        const lRect = leftArea.getBoundingClientRect();
        if (e.clientX >= lRect.left && e.clientX <= lRect.right &&
            e.clientY >= lRect.top && e.clientY <= lRect.bottom) {
          zone = 'left';
        }
      }
      if (!zone && this.dockPanelOrder.right.length > 0) {
        const rightArea = this.docks.right.area;
        const rRect = rightArea.getBoundingClientRect();
        if (e.clientX >= rRect.left && e.clientX <= rRect.right &&
            e.clientY >= rRect.top && e.clientY <= rRect.bottom) {
          zone = 'right';
        }
      }
    }

    this.highlightDropZone(zone, e);
  }

  highlightDropZone(zone, e) {
    // Update preview sizing to match current dock dimensions
    this.updateDropZonePreviews();

    Object.keys(this.dropZonePreviews).forEach(side => {
      const preview = this.dropZonePreviews[side];
      preview.classList.toggle('active', side === zone);
    });

    this.drag.currentZone = zone;

    // Calculate insert index within dock
    // Walks children top-to-bottom; inserts before the first child whose
    // vertical midpoint the cursor is above. If cursor is below all
    // midpoints, appends at the end.
    if (zone && this.docks[zone]) {
      const content = this.docks[zone].content;
      const children = Array.from(content.children);
      let insertIdx = children.length;

      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          insertIdx = i;
          break;
        }
      }

      this.drag.insertIndex = insertIdx;
      this.drag.insertSide = zone;
      this.showInsertIndicator(zone, insertIdx);
    } else {
      this.hideInsertIndicator();
    }
  }

  showInsertIndicator(side, index) {
    const content = this.docks[side].content;
    const children = content.children;
    if (children.length === 0) {
      this.insertIndicator.classList.remove('active');
      return;
    }

    let targetRect;
    if (index < children.length) {
      targetRect = children[index].getBoundingClientRect();
    } else {
      targetRect = children[children.length - 1].getBoundingClientRect();
    }

    const areaRect = this.docks[side].area.getBoundingClientRect();
    let top;
    if (index < children.length) {
      top = targetRect.top - areaRect.top;
    } else {
      top = targetRect.bottom - areaRect.top;
    }

    this.insertIndicator.style.top = (areaRect.top + top - 1.5) + 'px';
    this.insertIndicator.style.left = (areaRect.left + 4) + 'px';
    this.insertIndicator.style.width = (areaRect.width - 8) + 'px';
    this.insertIndicator.classList.add('active');
  }

  hideInsertIndicator() {
    this.insertIndicator.classList.remove('active');
  }

  completeDrag(e) {
    const { record, sourceDock, currentZone, insertIndex, ghost, posLabel, snapGuides } = this.drag;
    const id = record.panel.panel.id;

    // Remove ghost
    if (ghost) ghost.remove();

    // Remove position label
    if (posLabel) posLabel.remove();

    // Remove snap guides
    if (snapGuides) {
      snapGuides.vertical.remove();
      snapGuides.horizontal.remove();
    }

    // Restore original opacity
    record.panel.panel.style.opacity = '';

    if (currentZone) {
      // Dock to zone
      this.dockPanel(id, currentZone, insertIndex);
    } else {
      // Float at drop position with magnetic snap
      const rawX = e.clientX - this.drag.offsetX;
      const rawY = e.clientY - this.drag.offsetY;
      // Re-use ghost's last snapped position if available
      let fx = Math.round(rawX);
      let fy = Math.round(rawY);
      if (ghost) {
        fx = parseInt(ghost.style.left) || fx;
        fy = parseInt(ghost.style.top) || fy;
      }
      this.floatPanel(id, Math.max(0, fx), Math.max(0, fy));
    }
  }

  cleanupDrag() {
    if (this.drag) {
      if (this.drag.ghost) this.drag.ghost.remove();
      if (this.drag.posLabel) this.drag.posLabel.remove();
      if (this.drag.snapGuides) {
        this.drag.snapGuides.vertical.remove();
        this.drag.snapGuides.horizontal.remove();
      }
      if (this.drag.record) this.drag.record.panel.panel.style.opacity = '';
    }
    this.hideInsertIndicator();
    Object.values(this.dropZonePreviews).forEach(p => p.classList.remove('active'));
    this.drag = null;
  }

  /* ── Resize System ── */

  startResize(side, e) {
    this.resize = { side, startX: e.clientX, startY: e.clientY, startSize: this.dockSizes[side] };
    this.resizeHandles[side].classList.add('active');
    e.preventDefault();
  }

  onResizeMove(e) {
    if (!this.resize) return;
    const { side, startX, startY, startSize } = this.resize;
    let newSize;

    if (side === 'left') {
      newSize = startSize + (e.clientX - startX);
    } else if (side === 'right') {
      newSize = startSize + (startX - e.clientX);
    } else {
      newSize = startSize + (startY - e.clientY);
    }

    newSize = Math.max(MIN_DOCK_SIZE, Math.min(newSize, window.innerWidth * 0.4));
    this.dockSizes[side] = Math.round(newSize);
    this.applyDockSize(side);
    this.updateCanvasLayout();
  }

  onResizeEnd() {
    if (!this.resize) return;
    this.resizeHandles[this.resize.side].classList.remove('active');
    this.resize = null;
    this.saveLayout();
  }

  applyDockSize(side) {
    const area = this.docks[side].area;
    if (side === 'left' || side === 'right') {
      area.style.width = this.dockSizes[side] + 'px';
    } else if (side === 'bottom') {
      area.style.height = this.dockSizes[side] + 'px';
    }
    this.positionResizeHandle(side, this.resizeHandles[side]);
  }

  /* ── Canvas Layout ── */

  updateCanvasLayout() {
    const leftW = this.dockPanelOrder.left.length > 0 ? this.dockSizes.left : 0;
    const rightW = this.dockPanelOrder.right.length > 0 ? this.dockSizes.right : 0;
    const bottomH = this.dockPanelOrder.bottom.length > 0 ? this.dockSizes.bottom : 0;

    const canvas = this.editor.canvas;
    const availW = window.innerWidth - leftW - rightW;
    const availH = window.innerHeight - bottomH;

    canvas.style.position = 'fixed';
    canvas.style.left = leftW + 'px';
    canvas.style.top = '0';
    canvas.style.width = availW + 'px';
    canvas.style.height = availH + 'px';

    // Update Lightshow pixel dimensions
    if (this.editor.lightshow) {
      this.editor.lightshow.updateLayout(false);
    }

    // Keep version overlay locked to canvas bottom-left
    const versionOverlay = document.getElementById('versionOverlay');
    if (versionOverlay) {
      versionOverlay.style.left = (leftW + 10) + 'px';
    }
  }

  /* ── Global Listeners ── */

  bindGlobalListeners() {
    document.addEventListener('mousemove', (e) => {
      if (this.drag) this.onDragMove(e);
      if (this.resize) this.onResizeMove(e);
    });

    document.addEventListener('mouseup', (e) => {
      if (this.drag) this.onDragEnd(e);
      if (this.resize) this.onResizeEnd();
    });
  }

  /* ── Panel Visibility Helpers ── */

  getDockWidth(side) {
    if (!this.dockPanelOrder[side] || this.dockPanelOrder[side].length === 0) return 0;
    return this.dockSizes[side] || 0;
  }

  getDockHeight(side) {
    if (!this.dockPanelOrder[side] || this.dockPanelOrder[side].length === 0) return 0;
    return this.dockSizes[side] || 0;
  }

  getLeftWidth() { return this.getDockWidth('left'); }
  getRightWidth() { return this.getDockWidth('right'); }
  getBottomHeight() { return this.getDockHeight('bottom'); }

  /* ── Layout Persistence ── */

  _layoutCookieName() {
    return 'lightshow_layout_v1';
  }

  _saveLayoutCookie(data) {
    try {
      const json = JSON.stringify(data);
      document.cookie = `${this._layoutCookieName()}=${encodeURIComponent(json)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (e) {
      // Silently fail — cookies not available
    }
  }

  _loadLayoutCookie() {
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${this._layoutCookieName()}=([^;]*)`));
      if (match) {
        return JSON.parse(decodeURIComponent(match[1]));
      }
    } catch (e) {
      // Invalid cookie data
    }
    return null;
  }

  _clearLayoutCookie() {
    document.cookie = `${this._layoutCookieName()}=; path=/; max-age=0; SameSite=Lax`;
  }

  hasSavedLayout() {
    return this._loadLayoutCookie() !== null;
  }

  saveLayout() {
    if (this._suppressSave) return;
    const data = {
      ver: 1,
      dockSizes: { ...this.dockSizes },
      panels: {},
    };

    this.panels.forEach((record, id) => {
      if (id === 'welcomePanel' || id === 'colorPickerPanel') return;
      const panelEl = record.panel.panel;
      const entry = {
        collapsed: panelEl.querySelector('.panel-content')?.classList.contains('collapsed') ?? false,
      };

      if (record.floating) {
        entry.floating = true;
        entry.x = parseInt(panelEl.style.left) || 0;
        entry.y = parseInt(panelEl.style.top) || 0;
      } else if (record.dock) {
        entry.dock = record.dock;
        entry.index = this.dockPanelOrder[record.dock].indexOf(id);
      }

      data.panels[id] = entry;
    });

    this._saveLayoutCookie(data);
  }

  restoreLayout() {
    const data = this._loadLayoutCookie();
    if (!data || !data.panels) return false;

    // Restore dock sizes
    if (data.dockSizes) {
      Object.assign(this.dockSizes, data.dockSizes);
    }

    // Process panels in order of their saved index
    const ids = Object.keys(data.panels);

    // Suppress stack propagation during restore — heights haven't settled
    this._suppressStack = true;

    // First, undock all panels and reset their state
    ids.forEach(id => {
      const record = this.panels.get(id);
      if (!record) return;
      this.removePanel(id);
      const panelEl = record.panel.panel;
      panelEl.style.position = '';
      panelEl.style.left = '';
      panelEl.style.top = '';
      panelEl.style.width = '';
      panelEl.style.zIndex = '';
      panelEl.classList.remove('floating-panel');
    });

    // Now re-apply saved positions
    ids.forEach(id => {
      const entry = data.panels[id];
      if (!entry) return;
      if (entry.floating) {
        // Float at saved position
        this.floatPanel(id, entry.x || 0, entry.y || 0);
      } else if (entry.dock) {
        // Dock at saved position, maintaining order
        this.dockPanel(id, entry.dock, entry.index >= 0 ? entry.index : -1);
      }

      // Apply collapse state AFTER positioning (toggle if doesn't match)
      const record = this.panels.get(id);
      if (record) {
        const content = record.panel.panel.querySelector('.panel-content');
        const isCurrentlyCollapsed = content?.classList.contains('collapsed') ?? false;
        if (isCurrentlyCollapsed !== entry.collapsed) {
          record.panel.toggleCollapse();
        }
      }
    });

    // Re-init floating observers.
    for (const fp of this.floatingPanels) {
      const id = fp.panel.panel.id;
      this._teardownFloatingObserver(id);
      this._setupFloatingObserver(id, fp.panel.panel);
    }

    // Keep stack suppressed until collapse transitions finish (0.3s CSS).
    // During the animation the ResizeObserver fires repeatedly with
    // intermediate heights, and propagating each would pull all panels
    // upward — causing overlap.
    this._suppressStack = true;
    setTimeout(() => {
      // Reset all baselines to final (post-transition) heights so the
      // first observer callback after re-enable sees delta ≈ 0.
      for (const fp of this.floatingPanels) {
        const id = fp.panel.panel.id;
        this._floatingHeights.set(id, fp.panel.panel.offsetHeight);
      }
      this._suppressStack = false;
      this._rebuildFloatingStack();
    }, 350);

    this._rebuildFloatingStack();

    // Apply saved dock sizes to visible docks
    ['left', 'right', 'bottom'].forEach(side => {
      if (this.dockPanelOrder[side].length > 0) {
        this.updateDockVisibility(side);
        this.applyDockSize(side);
      }
    });

    this.updateCanvasLayout();
    console.log('restoreLayout complete — positions should now be final');
    return true;
  }

  resetLayout() {
    this._clearLayoutCookie();

    // Disable auto-save during reset to avoid intermediate saves
    const origSave = this.saveLayout.bind(this);
    this.saveLayout = () => {};

    // Gather all registered panel IDs
    const ids = Array.from(this.panels.keys());

    // Undock and unfloat all panels
    ids.forEach(id => {
      const record = this.panels.get(id);
      if (!record) return;
      this.removePanel(id);
      const panelEl = record.panel.panel;
      panelEl.style.position = '';
      panelEl.style.left = '';
      panelEl.style.top = '';
      panelEl.style.width = '';
      panelEl.style.zIndex = '';
      panelEl.classList.remove('floating-panel');
    });

    // Reset dock sizes to defaults
    this.dockSizes.left = DEFAULT_DOCK_SIZE;
    this.dockSizes.right = DEFAULT_DOCK_SIZE;
    this.dockSizes.bottom = DEFAULT_BOTTOM_SIZE;

    // Dock all panels on left, collapsed
    ids.forEach(id => {
      this.dockPanel(id, 'left');
    });

    // Collapse all using the header click handler (not toggleCollapse which saves)
    ids.forEach(id => {
      const record = this.panels.get(id);
      if (record && !record.panel.isCollapsed) {
        record.panel.toggleCollapse();
      }
    });

    // Re-position resize handles and canvas for the reset dock sizes
    ['left', 'right', 'bottom'].forEach(side => {
      if (this.dockPanelOrder[side].length > 0) {
        this.updateDockVisibility(side);
        this.applyDockSize(side);
      }
    });
    this.updateCanvasLayout();

    // Re-enable and save final state
    this.saveLayout = origSave;
    this.saveLayout();
  }
}
