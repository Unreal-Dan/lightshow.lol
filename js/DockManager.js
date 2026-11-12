// DockManager.js — Full docking system: dock areas, floating panels, resize, reorder

const CLICK_THRESHOLD = 5; // px — mouse move threshold to distinguish click vs drag
const DOCK_HIT_SIZE = 40; // px — width/height of edge hit zones
const MIN_DOCK_SIZE = 160; // px — minimum dock width/height
const DEFAULT_DOCK_SIZE = 400; // px — default left/right dock width (matches floating panel width)
const DEFAULT_BOTTOM_SIZE = 200; // px
const SNAP_DISTANCE = 12; // px — magnetic snap activation distance
const STACK_SNAP_DISTANCE = 18; // px — magnetization range for panel-stack snapping
const MIN_STACK_OVERLAP = 24; // px — horizontal overlap required to stack onto a panel
const SAVE_DEBOUNCE_MS = 250; // ms — coalesce bursts of layout saves

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
    this._floatingRelPos = new Map(); // panelId -> { anchorX, gapPxX, anchorY, gapPxY }
    this._stackingBusy = false; // prevent re-entrant chain propagation
    this._zCounter = 200; // stacking order for floating panels
    this._suppressStack = false; // suppress stack propagation during restore
    this._observerVersions = new Map(); // panelId -> counter to invalidate stale observer callbacks
    this._stacks = []; // explicit panel stacks: arrays of floating ids, [0] = master (topmost)
    this.stackDropIndicator = null;
    this._debug = false; // toggle with dockManager._debug = true
    this._stackProtected = new Set(); // panels shielded from auto-collapse during overflow resolution
    this._saveTimer = null; // pending debounced layout save
  }

  _log(...args) {
    if (this._debug) console.log('[dock]', ...args);
  }

  /* ── Initialization ── */

  async initialize() {
    // Guard: don't re-create if already initialized
    if (document.getElementById('dock-left')) return;

    this.createDockAreas();
    this.createResizeHandles();
    this.createDropZonePreviews();
    this.createInsertIndicator();
    this.createStackDropIndicator();
    this.bindGlobalListeners();

    const hasStackSystem = typeof this._createStack === 'function' && typeof this._insertIntoStack === 'function';
    console.debug(`[dock] DockManager ready — panel-stack system ${hasStackSystem ? 'active' : 'MISSING (stale cache?)'}`);
  }

  destroy() {
    ['left', 'right', 'bottom'].forEach(side => {
      const el = document.getElementById(`dock-${side}`);
      if (el) el.remove();
      const re = document.getElementById(`resize-${side}`);
      if (re) re.remove();
    });
    document.querySelectorAll('.dock-zone-preview, .dock-insert-indicator, .stack-drop-indicator').forEach(el => el.remove());
    this.stackDropIndicator = null;
    this._stacks = [];

    // Header drag / click-to-front listeners survive destroy and keep
    // routing to this instance; their bound flags stay set so re-registering
    // after initialize() doesn't add duplicates.
    clearTimeout(this._saveTimer);
    this._saveTimer = null;

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
    this._floatingRelPos.clear();
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
    const size = this._effectiveDockSize(side) + 'px';
    if (side === 'left') {
      el.style.left = size;
    } else if (side === 'right') {
      el.style.right = size;
    } else if (side === 'bottom') {
      el.style.bottom = size;
    }
  }

  /**
   * The dock size actually applied: the saved size clamped to 40% of the
   * viewport so docks can't swallow the canvas on a small window. The saved
   * size is kept so the dock grows back when the window does.
   */
  _effectiveDockSize(side) {
    const limit = side === 'bottom' ? window.innerHeight : window.innerWidth;
    const max = Math.max(MIN_DOCK_SIZE, Math.floor(limit * 0.4));
    return Math.min(this.dockSizes[side], max);
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

  createStackDropIndicator() {
    const el = document.createElement('div');
    el.className = 'stack-drop-indicator';
    this.container.appendChild(el);
    this.stackDropIndicator = el;
  }

  _updateStackDropIndicator() {
    if (!this.stackDropIndicator) return;
    const targetId = this.drag?.pendingStackTarget;
    if (!targetId || this.drag.currentZone) {
      this.stackDropIndicator.classList.remove('active');
      return;
    }
    const rec = this.panels.get(targetId);
    if (!rec || !rec.floating) {
      this.stackDropIndicator.classList.remove('active');
      return;
    }
    const r = rec.panel.panel.getBoundingClientRect();
    this.stackDropIndicator.style.top = (r.bottom - 1.5) + 'px';
    this.stackDropIndicator.style.left = r.left + 'px';
    this.stackDropIndicator.style.width = r.width + 'px';
    this.stackDropIndicator.classList.add('active');
  }

  _hideStackIndicator() {
    if (this.stackDropIndicator) this.stackDropIndicator.classList.remove('active');
  }

  /* ── Panel Registration ── */

  register(panel, defaultDock = 'left') {
    const id = panel.panel.id;
    const record = { panel, dock: null, index: -1 };
    this.panels.set(id, record);

    // Add headerdrag listener
    this.enableHeaderDrag(panel);

    // Click-to-front for floating panels. Bound once per panel element —
    // the panel may float/dock many times over a session.
    if (!panel.panel._dockFrontBound) {
      panel.panel._dockFrontBound = true;
      panel.panel.addEventListener('mousedown', () => {
        if (this.panels.get(id)?.floating) this._bringFloatingToFront(panel.panel);
      });
    }

    // Wire collapse toggles to save layout (once — re-registering after a
    // destroy/initialize cycle must not nest wrappers)
    if (!panel._dockCollapseWrapped) {
      panel._dockCollapseWrapped = true;
      const origToggle = panel.toggleCollapse.bind(panel);
      panel.toggleCollapse = () => {
        origToggle();
        this.saveLayout();
      };
    }

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
    this._updateStackClasses();
    this.saveLayout();
  }

  /**
   * Float a panel at (x, y). Pass `anchor` ({ edgeX, gapX }) to position the
   * panel relative to a screen edge instead of an absolute x — the panel is
   * measured after being styled so the gap math uses its real rendered width.
   */
  floatPanel(id, x, y, anchor = null) {
    const record = this.panels.get(id);
    if (!record) return;

    const oldLeft = record.panel.panel.style.left;

    // Remove from current location
    this.removePanel(id);

    record.dock = null;
    record.floating = true;
    this.floatingPanels.push(record);

    // Style as floating and attach to the container BEFORE measuring — the
    // panel may still be inside a hidden dock (display:none) otherwise, and
    // offsetWidth (which includes borders) must match what reflow measures.
    const panelEl = record.panel.panel;
    panelEl.style.position = 'fixed';
    panelEl.style.width = Math.min(400, window.innerWidth - 40) + 'px';
    panelEl.classList.add('floating-panel');
    this.container.appendChild(panelEl);

    const w = panelEl.offsetWidth;
    if (anchor && anchor.edgeX === 'right') {
      x = window.innerWidth - w - (anchor.gapX || 0);
    } else if (anchor && anchor.edgeX === 'left') {
      x = anchor.gapX || 0;
    }
    const px = Math.round(Math.max(0, Math.min(x, Math.max(0, window.innerWidth - w))));
    const py = Math.round(Math.max(0, Math.min(y, Math.max(0, window.innerHeight - 40))));
    panelEl.style.left = px + 'px';
    panelEl.style.top = py + 'px';

    if (oldLeft !== '' && oldLeft !== panelEl.style.left) {
      this._log(`floatPanel ${id}: left ${oldLeft} → ${panelEl.style.left} (requested x=${x})`);
    }

    // Anchor the panel to whichever horizontal screen edge it is closest to.
    // Raw x/y coordinates don't survive different screen sizes; an edge gap
    // does. Window resizes re-pin the panel via this anchor.
    const anchorInfo = this._anchorFromRect({ left: px, top: py, width: w });
    this._floatingRelPos.set(id, anchorInfo);
    this._log(`floatPanel ${id}: px=${px} w=${w} anchorX=${anchorInfo.anchorX} gapPxX=${anchorInfo.gapPxX}`);

    this._zCounter++;
    panelEl.style.zIndex = String(this._zCounter);

    this._setupFloatingObserver(id, panelEl);
    this._updateStackClasses();
    this.updateCanvasLayout();
    this.saveLayout();
  }

  /**
   * Build an edge anchor for a floating panel at the given rect: X is stored
   * as a gap from the nearest horizontal screen edge (width = offsetWidth,
   * border included, matching what reflow measures); Y is a top offset.
   */
  _anchorFromRect(r) {
    const left = Math.round(r.left);
    const rightGap = Math.round(window.innerWidth - left - r.width);
    const anchorX = left <= rightGap ? 'left' : 'right';
    return {
      anchorX,
      gapPxX: Math.max(0, anchorX === 'left' ? left : rightGap),
      anchorY: 'top',
      gapPxY: Math.round(r.top),
    };
  }

  _anchorPanel(id) {
    const el = this.panels.get(id)?.panel.panel;
    if (!el) return;
    const r = el.getBoundingClientRect();
    this._floatingRelPos.set(id, this._anchorFromRect({ left: r.left, top: r.top, width: el.offsetWidth }));
  }

  _bringFloatingToFront(panelEl) {
    // Raise the whole stack together so stacked panels keep their order
    const info = this._findStackInfo(panelEl.id);
    const ids = info ? info.stack : [panelEl.id];
    for (const id of ids) {
      const rec = this.panels.get(id);
      if (!rec || !rec.floating) continue;
      this._zCounter++;
      rec.panel.panel.style.zIndex = String(this._zCounter);
    }
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
        this._floatingHeights.set(panelId, Math.round(newHeight));
        return;
      }

      if (this._stackingBusy) return;
      if (this._suppressStack) return;

      const oldHeight = this._floatingHeights.get(panelId);
      if (oldHeight === undefined) return;
      const delta = newHeight - oldHeight;
      this._floatingHeights.set(panelId, Math.round(newHeight));
      if (Math.abs(delta) < 0.5) return;
      this._propagateStackDelta(panelId);
    });

    observer.observe(panelEl);
    this._floatingObservers.set(panelId, observer);
  }

  _teardownFloatingObserver(panelId) {
    const obs = this._floatingObservers.get(panelId);
    if (obs) { obs.disconnect(); this._floatingObservers.delete(panelId); }
    this._floatingHeights.delete(panelId);
  }

  /* ── Panel Stacks (explicit) ──
   *
   * A panel stack is an ordered array of floating panel ids, [0] being the
   * master (topmost). The master owns group movement: dragging it moves the
   * entire stack. Any height change in a member propagates downward so the
   * members below stay flush. Stacks are created by magnetically snapping a
   * dragged panel onto the bottom edge of another floating panel. */

  _findStackInfo(panelId) {
    for (const stack of this._stacks) {
      const index = stack.indexOf(panelId);
      if (index !== -1) return { stack, index };
    }
    return null;
  }

  _getMembersBelow(panelId) {
    const info = this._findStackInfo(panelId);
    if (!info) return [];
    return info.stack.slice(info.index + 1);
  }

  /**
   * Create a stack from an ordered id list (top -> bottom). All ids must be
   * currently floating. Re-flushes vertical alignment and refreshes classes.
   */
  _createStack(ids) {
    const members = ids.filter(id => {
      const rec = this.panels.get(id);
      return rec && rec.floating;
    });
    if (members.length < 2) return null;
    this._stacks.push(members);
    this._alignStack(members);
    // Non-master members follow the master; drop any stale edge anchoring
    for (const id of members.slice(1)) this._floatingRelPos.delete(id);
    this._updateStackClasses();
    this.saveLayout();
    this._log(`panel stack created: ${members.join(' → ')}`);
    return members;
  }

  /**
   * Remove a panel from its stack. If the master was removed, the next
   * member is promoted. A middle removal splits the members below into their
   * own stack (the gap is left open). Either way, the new master gets a
   * screen-edge anchor so window resizes keep pinning it.
   */
  _removeFromStack(panelId) {
    const info = this._findStackInfo(panelId);
    if (!info) return null;

    const { stack, index } = info;
    stack.splice(index, 1);

    if (stack.length === 0) {
      this._stacks.splice(this._stacks.indexOf(stack), 1);
    } else {
      if (index === 0) {
        // Promote new master and re-anchor to its current screen position
        this._anchorPanel(stack[0]);
      } else if (index < stack.length) {
        // Middle removal: split the remainder into its own stack. The lower
        // panel becomes a master — it no longer has a panel above it so the
        // gap should not close.
        const lower = stack.splice(index);
        this._stacks.push(lower);
        this._anchorPanel(lower[0]);
      }
      // Drop single-panel leftovers — a lone panel isn't a stack
      for (let i = this._stacks.length - 1; i >= 0; i--) {
        if (this._stacks[i].length < 2) this._stacks.splice(i, 1);
      }
      this._updateStackClasses();
    }

    return { index };
  }

  /**
   * Insert one or more panels directly below targetId in the stack. Creates a
   * new stack when the target isn't stacked yet. Positions the incoming
   * panels flush beneath the target chain.
   */
  _insertIntoStack(targetId, incomingIds) {
    const incoming = incomingIds.filter(id => id !== targetId && (() => {
      const rec = this.panels.get(id);
      return rec && rec.floating;
    })());
    if (incoming.length === 0) return;

    const tRec = this.panels.get(targetId);
    if (!tRec || !tRec.floating) return;

    let info = this._findStackInfo(targetId);
    let startIndex;
    if (info) {
      info.stack.splice(info.index + 1, 0, ...incoming);
      startIndex = info.index + 1;
    } else {
      const stack = [targetId, ...incoming];
      this._stacks.push(stack);
      info = { stack, index: 0 };
      startIndex = 1;
    }

    // Drop stale edge anchoring on non-master members
    for (const id of incoming) this._floatingRelPos.delete(id);

    // Position incoming members flush below their predecessor
    const { stack } = info;
    let prevEl = this.panels.get(stack[startIndex - 1]).panel.panel;
    for (let i = startIndex; i < stack.length; i++) {
      const el = this.panels.get(stack[i])?.panel.panel;
      if (!el) continue;
      const prevRect = prevEl.getBoundingClientRect();
      el.style.left = Math.round(prevRect.left) + 'px';
      el.style.top = Math.round(prevRect.bottom) + 'px';
      this._floatingHeights.set(stack[i], el.offsetHeight);
      prevEl = el;
    }

    this._updateStackClasses();
    this.saveLayout();
    this._log(`${incoming.join(', ')} joined stack: ${stack.join(' → ')}`);
  }

  /**
   * Re-seat every member of a stack flush below its predecessor, preserving
   * each member's horizontal offset. Applies dx to keep members locked to a
   * horizontally-moving master.
   */
  _alignStack(stack, dx = 0) {
    for (let i = 1; i < stack.length; i++) {
      const prevRec = this.panels.get(stack[i - 1]);
      const rec = this.panels.get(stack[i]);
      if (!prevRec || !rec || !prevRec.floating || !rec.floating) continue;
      const prevEl = prevRec.panel.panel;
      const el = rec.panel.panel;
      const prevRect = prevEl.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      if (dx !== 0) el.style.left = Math.round(rect.left + dx) + 'px';
      el.style.top = Math.round(prevRect.bottom) + 'px';
    }
  }

  _propagateStackDelta(panelId) {
    this._stackingBusy = true;

    // Re-seat every member flush below its predecessor rather than
    // shifting by a computed delta — avoids subpixel drift.
    const info = this._findStackInfo(panelId);
    if (info) {
      const masterEl = this.panels.get(info.stack[0])?.panel.panel;
      if (masterEl) {
        this._log(`propagateDelta from ${panelId} — stack master ${info.stack[0]} left=${masterEl.style.left}`);
      }
      this._alignStack(info.stack);
      this._keepStackOnScreen(info.stack, panelId);
    }

    this._stackingBusy = false;
    this._updateStackClasses();
    this.saveLayout();
  }

  /**
   * Ensure a stack fits within the viewport. When a panel grows and pushes
   * the group below the screen, collapse the minimum number of other
   * panels needed to bring the stack back on-screen.  Among panels that
   * save the same amount of height, older (top-of-stack) panels are
   * preferred.  The panel that triggered the overflow and any panel
   * currently being expanded across ResizeObserver cascades
   * (_stackProtected) are never collapsed.
   */
  _keepStackOnScreen(stack, triggeredBy) {
    if (!stack || stack.length <= 1) return;
    const lastId = stack[stack.length - 1];
    const lastEl = this.panels.get(lastId)?.panel.panel;
    if (!lastEl) return;

    const bottom = lastEl.getBoundingClientRect().bottom;
    if (bottom <= window.innerHeight) {
      this._stackProtected.clear();
      return;
    }

    this._stackProtected.add(triggeredBy);
    const overflow = bottom - window.innerHeight;

    // Collect eligible panels with their estimated height savings
    const candidates = [];
    for (let i = 0; i < stack.length; i++) {
      const pid = stack[i];
      if (this._stackProtected.has(pid)) continue;
      const rec = this.panels.get(pid);
      if (!rec) continue;
      const el = rec.panel.panel;
      const content = el.querySelector(':scope > .panel-content');
      if (!content || content.classList.contains('collapsed')) continue;

      // Savings ≈ content area height (what collapsing removes)
      const savings = content.scrollHeight + parseFloat(getComputedStyle(content).paddingTop)
        + parseFloat(getComputedStyle(content).paddingBottom);
      candidates.push({ rec, index: i, savings });
    }

    if (candidates.length === 0) return;

    // Sort: most height saved first (fewest collapses), oldest first as tiebreaker
    candidates.sort((a, b) => b.savings - a.savings || a.index - b.index);

    // Greedily pick panels until overflow is resolved
    let freed = 0;
    const toCollapse = [];
    for (const c of candidates) {
      toCollapse.push(c);
      freed += c.savings;
      if (freed >= overflow) break;
    }

    if (freed < overflow) return; // even collapsing everything won't fit

    // Collapse chosen panels, then re-seat the whole stack
    for (const c of toCollapse) {
      c.rec.panel.setCollapsed(true, true);
    }
    this._alignStack(stack);

    if (lastEl.getBoundingClientRect().bottom <= window.innerHeight) {
      this._stackProtected.clear();
    }
  }

  _rebuildFloatingStack() {
    // Don't pre-set heights here — the ResizeObserver's first callback
    // sets the baseline from contentRect.height (which excludes borders).
    // Using offsetHeight here would cause a spurious delta on the next
    // observer fire, compounding on every refresh.
    this._updateStackClasses();
  }

  /**
   * Suppress stack propagation while collapse transitions settle (0.3s CSS),
   * then reset all floating-height baselines to the final post-transition
   * heights so the next observer fire sees delta ≈ 0. Call after bulk
   * repositioning + collapsing of floating panels (restore/preset/import).
   */
  _settleFloatingStack() {
    this._suppressStack = true;
    setTimeout(() => {
      for (const fp of this.floatingPanels) {
        const id = fp.panel.panel.id;
        this._floatingHeights.set(id, fp.panel.panel.offsetHeight);
      }
      this._suppressStack = false;
      this._rebuildFloatingStack();
    }, 350);
  }

  _updateStackClasses() {
    for (const fp of this.floatingPanels) {
      fp.panel.panel.classList.remove('stacked-above', 'stacked-below');
    }

    for (const stack of this._stacks) {
      for (let i = 0; i < stack.length - 1; i++) {
        const upper = this.panels.get(stack[i]);
        const lower = this.panels.get(stack[i + 1]);
        if (!upper || !lower || !upper.floating || !lower.floating) continue;
        upper.panel.panel.classList.add('stacked-above');
        lower.panel.panel.classList.add('stacked-below');
      }
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
      record.panel.panel.classList.remove('stacked-above', 'stacked-below');
      this._teardownFloatingObserver(id);
    }

    // Detach from any panel stack (no shifting — callers handle reflow)
    this._removeFromStack(id);

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

    // Set dock size and reposition handle when visible
    // (handles may be stale if dockSizes changed while this dock was empty)
    if (hasPanels) {
      this.applyDockSize(side);
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

    // Screen edges and center
    targets.push({
      left: 0, right: w, top: 0, bottom: h,
      centerX: w / 2, centerY: h / 2,
    });

    // Other floating panels
    const carried = new Set((this.drag?.stackMembers || []).map(m => m.id));
    for (const fp of this.floatingPanels) {
      if (this.drag && fp === this.drag.record) continue;
      if (carried.has(fp.panel.panel.id)) continue;
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
    let snapY = bestDistY <= SNAP_DISTANCE ? Math.round(rawY + snapOffsetY) : Math.round(rawY);
    let guideXFinal = bestDistX <= SNAP_DISTANCE ? snapGuideX : null;
    let guideYFinal = bestDistY <= SNAP_DISTANCE ? snapGuideY : null;

    // Panel-stack magnetization: when the ghost's top edge nears the bottom
    // edge of another floating panel (with meaningful horizontal overlap),
    // apply an eased pull toward perfect alignment and arm a stack drop.
    // The ghost ALWAYS tracks the cursor — the pull just dampens its motion
    // as it approaches the seam, so it settles into alignment without ever
    // locking up. The drop itself seats members exactly flush, so a panel
    // can never join a stack misaligned by a few pixels.
    this.drag.pendingStackTarget = null;
    if (!this.drag.currentZone) {
      const exclude = new Set([this.drag.record.panel.panel.id]);
      for (const m of (this.drag.stackMembers || [])) exclude.add(m.id);

      let bestTarget = null;
      let bestRect = null;
      let bestStackDist = STACK_SNAP_DISTANCE + 1;
      for (const fp of this.floatingPanels) {
        const fid = fp.panel.panel.id;
        if (exclude.has(fid)) continue;
        const fr = fp.panel.panel.getBoundingClientRect();
        const overlap = Math.min(gRight, fr.right) - Math.max(gLeft, fr.left);
        if (overlap < MIN_STACK_OVERLAP) continue;
        const dist = Math.abs(gTop - fr.bottom);
        if (dist < bestStackDist) {
          bestStackDist = dist;
          bestTarget = fid;
          bestRect = fr;
        }
      }

      if (bestTarget && bestStackDist <= STACK_SNAP_DISTANCE) {
        // Preview-only magnetization. The ghost keeps following the cursor
        // one-to-one — overriding its position mid-drag reads as a frozen,
        // broken drag no matter how the transition is eased. The indicator
        // and guide communicate the join instead, and completeDrag seats
        // members exactly flush on drop, so a misaligned join is impossible.
        guideYFinal = Math.round(bestRect.bottom);
        this.drag.pendingStackTarget = bestTarget;
      }
    }

    this._updateStackDropIndicator();

    return {
      x: snapX,
      y: snapY,
      guideX: guideXFinal,
      guideY: guideYFinal,
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
      stackSnapshot: null, // original top->bottom order when dragging a master group
      stackMembers: null, // [{ id, relX, relY }] relative to ghost origin during drag
      pendingStackTarget: null, // floating panel id the ghost is magnetized onto
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
      let snapped;
      try {
        snapped = this.applyMagneticSnap(rawX, rawY);
      } catch (err) {
        console.error('[snap] EXCEPTION in applyMagneticSnap:', err);
        snapped = { x: rawX, y: rawY, guideX: null, guideY: null };
      }
      this.drag.ghost.style.left = snapped.x + 'px';
      this.drag.ghost.style.top = snapped.y + 'px';

      // Throttled drag-move log
      const _now = performance.now();
      if (!this._lastMoveLog || _now - this._lastMoveLog > 300) {
        this._lastMoveLog = _now;
        const g = this.drag.ghost;
        console.log('[snap] MOVE raw:', Math.round(rawX), Math.round(rawY),
          '→ snapped:', snapped.x, snapped.y,
          'ghost.left:', g.style.left, 'ghost.top:', g.style.top,
          'stackTarget:', snapped._stackTarget || this.drag.pendingStackTarget || null);
      }

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

    // Hide snap guides and stack indicator while hovering over a drop zone
    if (this.drag.snapGuides && this.drag.currentZone) {
      this.drag.snapGuides.vertical.classList.remove('visible');
      this.drag.snapGuides.horizontal.classList.remove('visible');
      this._hideStackIndicator();
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
    const id = panelEl.id;

    // ── Stack detachment ──
    // Master with members below: lift the entire stack as one group.
    // Any other stacked member: leave the stack; members below split off.
    const info = this._findStackInfo(id);
    if (info) {
      if (info.index === 0 && info.stack.length > 1) {
        this.drag.stackSnapshot = info.stack.slice();
        this._stacks.splice(this._stacks.indexOf(info.stack), 1);
        this._log(`lifting stack as group: ${this.drag.stackSnapshot.join(' → ')}`);
      } else {
        this._removeFromStack(id);
        this._log(`${id} left its stack`);
      }
      this._updateStackClasses();
    }

    // Members carried by this drag (leader first). A plain drag carries only
    // itself; a master drag carries the whole former stack.
    const carryIds = this.drag.stackSnapshot || [id];
    this.drag.stackMembers = carryIds.map(pid => ({ id: pid, relX: 0, relY: 0 }));

    // Create ghost element
    let ghost;
    if (this.drag.stackMembers.length > 1) {
      ghost = this._buildGroupGhost();
    } else {
      ghost = panelEl.cloneNode(true);
      ghost.className = this._ghostClassName(panelEl);
      this._mirrorInactiveState(ghost);
      ghost.style.width = panelEl.offsetWidth + 'px';
    }

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

    // Hide original panels during drag
    for (const m of this.drag.stackMembers) {
      const rec = this.panels.get(m.id);
      if (rec) rec.panel.panel.style.opacity = '0';
    }
  }

  /**
   * Class list for a drag-ghost clone. Root-level state classes that control
   * which content is visible (e.g. panel-inactive swaps controls for a
   * "requires device" note) are preserved; layout classes are dropped since
   * .dock-ghost supersedes them.
   */
  _ghostClassName(panelEl, extra = '') {
    const classes = ['dock-ghost'];
    if (panelEl.classList.contains('panel-inactive')) classes.push('panel-inactive');
    if (extra) classes.push(extra);
    return classes.join(' ');
  }

  /**
   * Inactive panels swap their controls for a note via stylesheet rules.
   * Mirror that state with inline styles on the ghost clone so the ghost
   * renders correctly even if the relevant stylesheet is cached stale.
   */
  _mirrorInactiveState(clone) {
    if (!clone.classList.contains('panel-inactive')) return;
    const content = clone.querySelector(':scope > .panel-content');
    if (!content) return;
    for (const child of content.children) {
      child.style.display = child.classList.contains('panel-inactive-note') ? 'block' : 'none';
    }
  }

  /**
   * Build a combined ghost representing an entire panel stack so a master
   * drag visually moves the whole column. The ghost origin becomes the union
   * bounding box top-left; drag offsets are rebased so cursor math keeps
   * working, and each member records its offset inside the box.
   */
  _buildGroupGhost() {
    const members = this.drag.stackMembers;

    // Union bounds across all carried panels
    let uLeft = Infinity, uTop = Infinity, uRight = -Infinity, uBottom = -Infinity;
    const rects = new Map();
    for (const m of members) {
      const rec = this.panels.get(m.id);
      const r = rec.panel.panel.getBoundingClientRect();
      rects.set(m.id, r);
      uLeft = Math.min(uLeft, r.left);
      uTop = Math.min(uTop, r.top);
      uRight = Math.max(uRight, r.right);
      uBottom = Math.max(uBottom, r.bottom);
    }

    // Rebase drag offsets onto the union origin so cursor math keeps the
    // same grip while the ghost origin tracks the bounding box
    const leaderRect = rects.get(members[0].id);
    this.drag.offsetX += leaderRect.left - uLeft;
    this.drag.offsetY += leaderRect.top - uTop;

    const ghost = document.createElement('div');
    ghost.className = 'dock-ghost dock-ghost-group';
    ghost.style.width = Math.round(uRight - uLeft) + 'px';
    ghost.style.height = Math.round(uBottom - uTop) + 'px';

    members.forEach((m, i) => {
      const r = rects.get(m.id);
      m.relX = Math.round(r.left - uLeft);
      m.relY = Math.round(r.top - uTop);

      const clone = this.panels.get(m.id).panel.panel.cloneNode(true);
      clone.className = this._ghostClassName(this.panels.get(m.id).panel.panel, 'stack-ghost-item');
      this._mirrorInactiveState(clone);
      clone.style.position = 'absolute';
      clone.style.left = m.relX + 'px';
      clone.style.top = m.relY + 'px';
      clone.style.width = r.width + 'px';
      clone.style.zIndex = String(i + 1);
      clone.style.opacity = '';
      ghost.appendChild(clone);
    });

    return ghost;
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
    this._hideStackIndicator();

    // Restore original opacity
    for (const m of (this.drag.stackMembers || [{ id }])) {
      const rec = this.panels.get(m.id);
      if (rec) rec.panel.panel.style.opacity = '';
    }

    if (currentZone) {
      // Dock to zone — a carried stack docks as a column in original order
      const order = this.drag.stackSnapshot || [id];
      let idx = insertIndex;
      for (const pid of order) {
        this.dockPanel(pid, currentZone, idx);
        if (idx >= 0) idx++;
      }
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
      fx = Math.max(0, fx);
      fy = Math.max(0, fy);

      const members = this.drag.stackMembers || [{ id, relX: 0, relY: 0 }];
      if (members.length > 1) {
        // Drop the whole carried group, then rebuild (or merge) its stack
        for (const m of members) {
          this.floatPanel(m.id, fx + m.relX, fy + m.relY);
        }
        const order = this.drag.stackSnapshot;
        const targetId = this.drag.pendingStackTarget;
        const targetRec = targetId ? this.panels.get(targetId) : null;
        if (targetRec && targetRec.floating) {
          this._insertIntoStack(targetId, order);
        } else {
          this._createStack(order);
        }
        this._updateStackClasses();
      } else {
        this.floatPanel(id, fx, fy);
        // Magnetized onto another panel's bottom edge → join its stack.
        // _insertIntoStack re-seats the panel flush so no pixel drifts.
        const targetId = this.drag.pendingStackTarget;
        const targetRec = targetId ? this.panels.get(targetId) : null;
        if (targetRec && targetRec.floating) {
          this._insertIntoStack(targetId, [id]);
        }
      }
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
      for (const m of (this.drag.stackMembers || [])) {
        const rec = this.panels.get(m.id);
        if (rec) rec.panel.panel.style.opacity = '';
      }
    }
    this.hideInsertIndicator();
    this._hideStackIndicator();
    Object.values(this.dropZonePreviews).forEach(p => p.classList.remove('active'));
    this.drag = null;
  }

  /* ── Resize System ── */

  startResize(side, e) {
    this.resize = { side, startX: e.clientX, startY: e.clientY, startSize: this._effectiveDockSize(side) };
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

    const limit = side === 'bottom' ? window.innerHeight : window.innerWidth;
    newSize = Math.max(MIN_DOCK_SIZE, Math.min(newSize, limit * 0.4));
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
    const size = this._effectiveDockSize(side) + 'px';
    if (side === 'left' || side === 'right') {
      area.style.width = size;
    } else if (side === 'bottom') {
      area.style.height = size;
    }
    this.positionResizeHandle(side, this.resizeHandles[side]);
  }

  /* ── Canvas Layout ── */

  updateCanvasLayout() {
    const leftW = this.getDockWidth('left');
    const rightW = this.getDockWidth('right');
    const bottomH = this.getDockHeight('bottom');

    const canvas = this.editor.canvas;
    const availW = Math.max(0, window.innerWidth - leftW - rightW);
    const availH = Math.max(0, window.innerHeight - bottomH);

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
    // Document/window listeners survive destroy(); bind them only once
    if (this._globalListenersBound) return;
    this._globalListenersBound = true;

    document.addEventListener('mousemove', (e) => {
      if (this.drag) this.onDragMove(e);
      if (this.resize) this.onResizeMove(e);
    });

    document.addEventListener('mouseup', (e) => {
      if (this.drag) this.onDragEnd(e);
      if (this.resize) this.onResizeEnd();
    });

    // Keep docks within the viewport and anchored floating panels pinned
    // to their screen edge on resize
    window.addEventListener('resize', () => {
      ['left', 'right', 'bottom'].forEach(side => {
        if (this.dockPanelOrder[side].length > 0) this.applyDockSize(side);
      });
      this._reflowFloatingPanels();
    });

    // When the user switches browser tabs and comes back, the browser may
    // recalculate layout or resume frozen CSS transitions.  Re-anchor all
    // floating panels so they stay pinned to their correct screen edge.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this._log('tab visible — reflowing floating panels');
        this._reflowFloatingPanels();
      }
    });

    // Flush any pending debounced save before the page goes away
    window.addEventListener('pagehide', () => this.flushSave());
  }

  /**
   * Re-pin floating panels to their saved screen-edge anchor, then clamp
   * them so their header stays reachable inside the viewport. The anchor
   * itself is left untouched, so a panel pushed in by a shrinking window
   * returns to its original spot when the window grows again.
   */
  _reflowFloatingPanels() {
    this._log('_reflowFloatingPanels called — stacks:', this._stacks.length, 'floatingRelPos entries:', this._floatingRelPos.size);
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Remember where each stack master sits so carried members can follow
    // any horizontal shift
    const masterLeftBefore = new Map();
    this._stacks.forEach(stack => {
      const m = this.panels.get(stack[0]);
      if (m && m.floating) masterLeftBefore.set(stack, m.panel.panel.getBoundingClientRect().left);
    });

    for (const record of this.floatingPanels) {
      const id = record.panel.panel.id;
      // Non-master stack members follow their master instead
      const stackInfo = this._findStackInfo(id);
      if (stackInfo && stackInfo.index > 0) continue;

      const el = record.panel.panel;
      const w = el.offsetWidth;
      const oldLeft = el.style.left;
      const info = this._floatingRelPos.get(id);

      let left = parseFloat(el.style.left) || 0;
      let top = parseFloat(el.style.top) || 0;
      if (info) {
        left = info.anchorX === 'right' ? vw - info.gapPxX - w : info.gapPxX;
        top = info.anchorY === 'bottom' ? vh - info.gapPxY - el.offsetHeight : info.gapPxY;
      }

      // Keep the panel horizontally on-screen and its header visible
      const headerH = el.querySelector(':scope > .panel-header')?.offsetHeight || 40;
      left = Math.max(0, Math.min(left, vw - w));
      top = Math.max(0, Math.min(top, vh - headerH));

      el.style.left = Math.round(left) + 'px';
      el.style.top = Math.round(top) + 'px';

      if (oldLeft !== el.style.left) {
        this._log(`reflow moved ${id}: left ${oldLeft} → ${el.style.left} (anchorX=${info?.anchorX} gapPxX=${info?.gapPxX} w=${w})`);
      }
    }

    // Re-seat every stack member flush below its predecessor, preserving
    // each member's horizontal offset relative to a moved master
    this._stacks.forEach(stack => {
      const m = this.panels.get(stack[0]);
      if (!m || !m.floating) return;
      const dx = m.panel.panel.getBoundingClientRect().left - (masterLeftBefore.get(stack) ?? 0);
      this._alignStack(stack, dx);
    });
  }

  /* ── Panel Visibility Helpers ── */

  getDockWidth(side) {
    if (!this.dockPanelOrder[side] || this.dockPanelOrder[side].length === 0) return 0;
    return this._effectiveDockSize(side) || 0;
  }

  getDockHeight(side) {
    if (!this.dockPanelOrder[side] || this.dockPanelOrder[side].length === 0) return 0;
    return this._effectiveDockSize(side) || 0;
  }

  getLeftWidth() { return this.getDockWidth('left'); }
  getRightWidth() { return this.getDockWidth('right'); }
  getBottomHeight() { return this.getDockHeight('bottom'); }

  /* ── Layout Persistence ── */

  _layoutStorageKey() {
    return 'lightshow_layout_v1';
  }

  _writeSavedLayout(data) {
    try {
      localStorage.setItem(this._layoutStorageKey(), JSON.stringify(data));
    } catch (e) {
      // Storage unavailable (private mode, quota) — layout just won't persist
    }
  }

  _readSavedLayout() {
    try {
      const raw = localStorage.getItem(this._layoutStorageKey());
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // Storage unavailable or invalid data
    }

    // One-time migration from the old cookie-based storage
    try {
      const name = this._layoutStorageKey();
      const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
      if (match) {
        const data = JSON.parse(decodeURIComponent(match[1]));
        this._writeSavedLayout(data);
        document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
        return data;
      }
    } catch (e) {
      // Invalid cookie data
    }
    return null;
  }

  clearSavedLayout() {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    try {
      localStorage.removeItem(this._layoutStorageKey());
    } catch (e) {
      // Storage unavailable
    }
  }

  hasSavedLayout() {
    return this._readSavedLayout() !== null;
  }

  // Snapshot the current layout (same shape persisted to storage).
  // Stacks serialize as top->bottom id arrays; only stack masters carry
  // positioning data.
  getLayoutData() {
    const data = {
      ver: 3,
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

        // Grouped panels follow their master — only the master (topmost
        // member of a stack) carries positioning data.
        const info = this._findStackInfo(id);
        if (!info || info.index === 0) {
          const left = Math.round(parseFloat(panelEl.style.left)) || 0;
          const w = panelEl.offsetWidth;
          // Store X relative to whichever screen edge the panel is closest
          // to so layouts stay portable across different screen sizes.
          const rightGap = Math.round(window.innerWidth - left - w);
          if (left <= rightGap) {
            entry.edgeX = 'left';
            entry.gapX = Math.max(0, left);
          } else {
            entry.edgeX = 'right';
            entry.gapX = Math.max(0, rightGap);
          }
          entry.y = Math.round(parseFloat(panelEl.style.top)) || 0;
        }
      } else if (record.dock) {
        entry.dock = record.dock;
        entry.index = this.dockPanelOrder[record.dock].indexOf(id);
      }

      data.panels[id] = entry;
    });

    // Persist explicit panel stacks (top -> bottom), floating members only
    data.stacks = this._stacks
      .filter(stack => stack.length > 1 && stack.every(id => {
        const r = this.panels.get(id);
        return r && r.floating;
      }))
      .map(stack => stack.slice());

    return data;
  }

  /**
   * Schedule a layout save. Saves are debounced — ResizeObserver cascades
   * and collapse animations can request dozens per second.
   */
  saveLayout() {
    if (this._suppressSave) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.flushSave(), SAVE_DEBOUNCE_MS);
  }

  /** Write any pending layout save immediately. */
  flushSave() {
    if (!this._saveTimer) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    if (this._suppressSave || !this.docks.left) return;
    const data = this.getLayoutData();
    // Log floating master positions for diagnosis
    const floatingMasters = [];
    this._stacks.forEach(stack => {
      const m = this.panels.get(stack[0]);
      if (m && m.floating) {
        const el = m.panel.panel;
        floatingMasters.push(`${stack[0]}:left=${el.style.left}`);
      }
    });
    if (floatingMasters.length > 0) {
      this._log(`saveLayout — floating masters: ${floatingMasters.join(', ')}`);
    }
    this._writeSavedLayout(data);
  }

  restoreLayout() {
    const data = this._readSavedLayout();
    if (!data || !data.panels) return false;
    return this.applyLayoutData(data);
  }

  // Public: apply a layout snapshot produced by getLayoutData() (or a legacy
  // ver<3 snapshot — absolute x/y with no stacks is handled gracefully).
  applyLayoutData(data) {
    // Restore dock sizes
    if (data.dockSizes) {
      Object.assign(this.dockSizes, data.dockSizes);
    }

    // Process panels in order of their saved index
    const ids = Object.keys(data.panels);

    // Undock every registered panel — not just the ones present in the
    // snapshot — so applying a partial layout can't leave strays behind
    const allIds = Array.from(this.panels.keys());

    // Suppress stack propagation during restore — heights haven't settled
    this._suppressStack = true;
    this._stacks = [];

    // First, undock all panels and reset their state
    allIds.forEach(id => {
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

    // Ensure floating-only panels are detached from any dock they may
    // have ended up in from a prior layout
    ['welcomePanel', 'colorPickerPanel'].forEach(id => {
      const record = this.panels.get(id);
      if (!record) return;
      if (record.dock || record.floating) this.removePanel(id);
      const panelEl = record.panel.panel;
      if (panelEl.parentElement) {
        panelEl.parentElement.removeChild(panelEl);
      }
      panelEl.style.position = '';
      panelEl.style.left = '';
      panelEl.style.top = '';
      panelEl.style.width = '';
      panelEl.style.zIndex = '';
      panelEl.classList.remove('floating-panel');
    });

    // Validate saved panel stacks up-front so stack children can be skipped
    // during placement — they are positioned relative to their master after
    // the masters exist.
    const validStacks = [];
    if (Array.isArray(data.stacks)) {
      for (const saved of data.stacks) {
        if (!Array.isArray(saved)) continue;
        const valid = saved.filter(pid => {
          const e = data.panels[pid];
          return e && e.floating && this.panels.has(pid);
        });
        if (valid.length > 1) validStacks.push(valid);
      }
    }
    const stackChildIds = new Set();
    for (const stack of validStacks) {
      for (const pid of stack.slice(1)) stackChildIds.add(pid);
    }

    // Now re-apply saved positions
    ids.forEach(id => {
      const entry = data.panels[id];
      if (!entry) return;
      const record = this.panels.get(id);
      if (!record) return;

      // Apply collapse state BEFORE placing the panel so it never paints
      // expanded and then animates shut during load
      record.panel.setCollapsed(entry.collapsed, true);

      if (entry.floating) {
        // Stack children follow their master — placed in a second pass below
        if (stackChildIds.has(id)) return;

        // edgeX/gapX: offset from a screen edge (floatPanel measures the
        // real width); legacy ver<3 snapshots carry an absolute x instead
        const anchor = entry.edgeX ? { edgeX: entry.edgeX, gapX: entry.gapX } : null;
        this.floatPanel(id, entry.x || 0, entry.y || 0, anchor);
      } else if (entry.dock) {
        // Dock at saved position, maintaining order
        this.dockPanel(id, entry.dock, entry.index >= 0 ? entry.index : -1);
      }
    });

    // Place grouped panels flush below their predecessor. Only the master
    // carried positioning data; children inherit its x and chain downwards.
    for (const stack of validStacks) {
      for (let i = 1; i < stack.length; i++) {
        const crec = this.panels.get(stack[i]);
        const prevRec = this.panels.get(stack[i - 1]);
        if (!crec || !prevRec) break;
        const prevRect = prevRec.panel.panel.getBoundingClientRect();
        this.floatPanel(stack[i], prevRect.left, prevRect.bottom);
      }
    }

    // Re-init floating observers.
    for (const fp of this.floatingPanels) {
      const id = fp.panel.panel.id;
      this._teardownFloatingObserver(id);
      this._setupFloatingObserver(id, fp.panel.panel);
    }

    // Register restored stacks and absorb any rounding drift; members drop
    // stale anchoring since they follow their master.
    this._stacks = validStacks;
    for (const stack of validStacks) {
      for (const id of stack.slice(1)) this._floatingRelPos.delete(id);
      this._alignStack(stack);
    }

    // Keep stack suppressed until collapse transitions finish (0.3s CSS).
    // During the animation the ResizeObserver fires repeatedly with
    // intermediate heights, and propagating each would pull all panels
    // upward — causing overlap.
    this._settleFloatingStack();

    this._rebuildFloatingStack();

    // Apply saved dock sizes to visible docks
    ['left', 'right', 'bottom'].forEach(side => {
      if (this.dockPanelOrder[side].length > 0) {
        this.updateDockVisibility(side);
        this.applyDockSize(side);
      }
    });

    this.updateCanvasLayout();
    console.log('applyLayoutData complete — positions should now be final');
    return true;
  }
}
