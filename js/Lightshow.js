/* Lightshow.js */
export default class Lightshow {
  static instanceCount = 0;

  constructor(vortexLib, vortex, canvas, modeData = null, configurableSectionCount = 100) {
    this.id = Lightshow.instanceCount++;
    this.canvas = canvas;
    if (!this.canvas) throw new Error(`Canvas not found`);

    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    this.ctx = this.canvas.getContext('2d');

    this.dotSize = 25;
    this.blurFac = 5;
    this.circleRadius = 400;
    this.tickRate = 1;
    this.trailSize = 100;
    this.spread = 15;

    this.angle = 0;

    // orbit visualization
    this.orbitAngle = 0;
    this.spinAngle = 0;
    this.orbitSpinMul = -3.0;

    // default shape
    this.currentShape = 'circle';
    this.direction = 1;

    this.vortexLib = vortexLib;
    this.vortex = vortex;

    this.animationFrameId = null;
    this.configurableSectionCount = configurableSectionCount;
    this.sectionWidth = this.canvas.width / this.configurableSectionCount;

    this.boundDraw = this.draw.bind(this);

    this.ctx.fillStyle = 'rgba(0, 0, 0)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.modeData = modeData;
    this.applyModeData();

    // Duo editor mode draws only 2 leds on flash canvas
    this.duoEditorMode = false;

    // --- Springy center (works for ALL shapes) ---
    // rest center is the "spinning" center; spring center is where shapes are drawn
    this._restCenter = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    this._center = { x: this._restCenter.x, y: this._restCenter.y };
    this._centerVel = { x: 0, y: 0 };

    // Drag target (pointer position while dragging)
    this._dragging = false;
    this._dragTarget = { x: this._restCenter.x, y: this._restCenter.y };
    this._activePointerId = null;

    // Spring tuning (feel free to tweak)
    // Higher k = stronger pull / faster response; higher damping = less oscillation.
    this.centerSpringK = 38.0;
    this.centerSpringDamping = 11.5;

    // When released, we pull back to rest center (same spring, target changes)
    // You can optionally make return slower/faster by setting these:
    this.returnSpringK = 30.0;
    this.returnSpringDamping = 10.0;

    // dt tracking
    this._lastFrameAt = 0;

    // Interaction listeners (pointer events; desktop + mobile)
    this.addInteractionListeners();

    // Histories
    this.updateHistories();

    // Initial layout
    const isMobile = window.innerWidth < 1200;
    this.updateLayout(isMobile);
  }

  updateLayout(isMobile) {
    if (isMobile) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = Math.floor(window.innerHeight * 0.4);
    } else {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }

    this._recomputeCenters();
    this.resetToCenter();
  }

  _recomputeCenters() {
    this.sectionWidth = this.canvas.width / this.configurableSectionCount;

    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    this._restCenter.x = cx;
    this._restCenter.y = cy;

    // If not currently dragging, keep the spring center glued to rest center on resize
    if (!this._dragging) {
      this._center.x = cx;
      this._center.y = cy;
      this._centerVel.x = 0;
      this._centerVel.y = 0;
      this._dragTarget.x = cx;
      this._dragTarget.y = cy;
    } else {
      // If dragging during resize, clamp drag target into canvas bounds
      this._dragTarget.x = Math.max(0, Math.min(this.canvas.width, this._dragTarget.x));
      this._dragTarget.y = Math.max(0, Math.min(this.canvas.height, this._dragTarget.y));
    }
  }

  addInteractionListeners() {
    // Make the canvas a real touch surface (prevents scroll/zoom gestures stealing moves)
    try {
      this.canvas.style.touchAction = 'none';
      this.canvas.style.webkitUserSelect = 'none';
      this.canvas.style.userSelect = 'none';
      this.canvas.style.webkitTouchCallout = 'none';
    } catch {}

    const getCanvasPointFromClient = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (clientY - rect.top) * (this.canvas.height / rect.height);
      return {
        x: Math.max(0, Math.min(this.canvas.width, x)),
        y: Math.max(0, Math.min(this.canvas.height, y)),
      };
    };

    // If pointer events are working, we don't want touch handlers to fight them.
    let pointerDragActive = false;

    // -------------------------
    // Pointer events (mouse/pen/touch when supported)
    // -------------------------
    const onPointerDown = (e) => {
      if (!e) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      pointerDragActive = true;

      const p = getCanvasPointFromClient(e.clientX, e.clientY);

      this._dragging = true;
      this._activePointerId = e.pointerId;

      this._dragTarget.x = p.x;
      this._dragTarget.y = p.y;

      // keep overshoot, but tame start jitter
      this._centerVel.x *= 0.35;
      this._centerVel.y *= 0.35;

      try {
        this.canvas.setPointerCapture?.(e.pointerId);
      } catch {}

      try {
        e.preventDefault?.();
      } catch {}
    };

    const onPointerMove = (e) => {
      if (!e) return;
      if (!this._dragging) return;
      if (this._activePointerId != null && e.pointerId !== this._activePointerId) return;

      const p = getCanvasPointFromClient(e.clientX, e.clientY);
      this._dragTarget.x = p.x;
      this._dragTarget.y = p.y;

      try {
        e.preventDefault?.();
      } catch {}
    };

    const onPointerUp = (e) => {
      if (!e) return;
      if (!this._dragging) return;
      if (this._activePointerId != null && e.pointerId !== this._activePointerId) return;

      this._dragging = false;
      this._activePointerId = null;
      pointerDragActive = false;

      // return to rest center
      this._dragTarget.x = this._restCenter.x;
      this._dragTarget.y = this._restCenter.y;

      try {
        e.preventDefault?.();
      } catch {}
    };

    this.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    this.canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    this.canvas.addEventListener('pointerup', onPointerUp, { passive: false });
    this.canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
    this.canvas.addEventListener('lostpointercapture', onPointerUp, { passive: false });

    // -------------------------
    // Touch fallback (fixes mobile where pointermove is unreliable / eaten)
    // -------------------------
    let touchActive = false;

    const onTouchStart = (e) => {
      if (!e) return;
      if (pointerDragActive) return; // pointer is handling it

      const t = e.touches && e.touches[0];
      if (!t) return;

      touchActive = true;
      this._dragging = true;
      this._activePointerId = null;

      const p = getCanvasPointFromClient(t.clientX, t.clientY);
      this._dragTarget.x = p.x;
      this._dragTarget.y = p.y;

      this._centerVel.x *= 0.35;
      this._centerVel.y *= 0.35;

      try {
        e.preventDefault();
      } catch {}
    };

    const onTouchMove = (e) => {
      if (!e) return;
      if (pointerDragActive) return;
      if (!touchActive || !this._dragging) return;

      const t = e.touches && e.touches[0];
      if (!t) return;

      const p = getCanvasPointFromClient(t.clientX, t.clientY);
      this._dragTarget.x = p.x;
      this._dragTarget.y = p.y;

      try {
        e.preventDefault();
      } catch {}
    };

    const onTouchEnd = (e) => {
      if (pointerDragActive) return;
      if (!touchActive) return;

      touchActive = false;
      this._dragging = false;

      this._dragTarget.x = this._restCenter.x;
      this._dragTarget.y = this._restCenter.y;

      try {
        e.preventDefault();
      } catch {}
    };

    this.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Resize hook (same as before)
    this._resizeListener = () => {
      const isMobile = window.innerWidth < 1200;
      this.updateLayout(isMobile);
    };
    window.addEventListener('resize', this._resizeListener, { passive: true });
  }
  

  _updateSpringCenter() {
    const now = performance.now();
    if (!this._lastFrameAt) this._lastFrameAt = now;

    let dt = (now - this._lastFrameAt) / 1000;
    this._lastFrameAt = now;

    // clamp dt to avoid huge jumps if tab was backgrounded
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;

    const targetX = this._dragging ? this._dragTarget.x : this._restCenter.x;
    const targetY = this._dragging ? this._dragTarget.y : this._restCenter.y;

    const k = this._dragging ? this.centerSpringK : this.returnSpringK;
    const d = this._dragging ? this.centerSpringDamping : this.returnSpringDamping;

    // Spring force: a = k*(target - pos) - d*vel
    const ax = (targetX - this._center.x) * k - this._centerVel.x * d;
    const ay = (targetY - this._center.y) * k - this._centerVel.y * d;

    this._centerVel.x += ax * dt;
    this._centerVel.y += ay * dt;

    this._center.x += this._centerVel.x * dt;
    this._center.y += this._centerVel.y * dt;

    // keep center within reasonable bounds (small overshoot is fine; prevent going miles away)
    const pad = 80;
    this._center.x = Math.max(-pad, Math.min(this.canvas.width + pad, this._center.x));
    this._center.y = Math.max(-pad, Math.min(this.canvas.height + pad, this._center.y));
  }

  setLedCount(count) {
    this.vortex.setLedCount(count);
    this.updateHistories();
  }

  setFlashCanvas(canvas) {
    this.flashCanvas = canvas;
    this.flashCtx = canvas.getContext('2d');
  }

  setDuoEditorMode(editormode) {
    this.duoEditorMode = editormode;
    this.updateHistories();
  }

  resetToCenter() {
    this.sectionWidth = this.canvas.width / this.configurableSectionCount;
    this.ctx.fillStyle = 'rgba(0, 0, 0)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.histories = this.histories.map(() => []);
  }

  updateHistories() {
    const ledCount = this.ledCount();
    this.histories = [];
    for (let i = 0; i < ledCount; i++) this.histories.push([]);
  }

  applyModeData() {
    if (!this.modeData) return;

    const set = new this.vortexLib.Colorset();
    this.modeData.colorset.forEach((hexCode) => {
      const normalizedHex = hexCode.replace('0x', '#');
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalizedHex);
      if (result) {
        set.addColor(
          new this.vortexLib.RGBColor(parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16))
        );
      }
    });

    const demoMode = this.vortex.engine().modes().curMode();
    if (!demoMode) return;

    demoMode.setColorset(set, this.ledCount());

    const patID = this.vortexLib.intToPatternID(this.modeData.pattern_id);
    demoMode.setPattern(patID, this.ledCount(), null, null);

    const args = new this.vortexLib.PatternArgs();
    for (let i = 0; i < this.modeData.args.length; ++i) args.addArgs(this.modeData.args[i]);
    this.vortex.setPatternArgs(this.ledCount(), args, false);

    demoMode.init();
  }

  set tickRate(value) {
    const intValue = parseInt(value, 10);
    this._tickRate = intValue > 0 ? intValue : 1;
  }

  get tickRate() {
    return this._tickRate || 1;
  }

  set trailSize(value) {
    const intValue = parseInt(value, 10);
    this.history = [];
    this._trailSize = intValue > 0 ? intValue : 1;
  }

  get trailSize() {
    return this._trailSize || 100;
  }

  ledCount() {
    return this.vortex.engine().leds().ledCount();
  }

  setShape(shape) {
    if (this.currentShape === shape) {
      this.direction *= -1;
    } else {
      this.currentShape = shape;
    }
  }

  feedOrbitPoints() {
    // Use spring center instead of fixed canvas center
    const pivotX = this._center.x;
    const pivotY = this._center.y;

    const minR = Math.min(this.canvas.width / 2, this.canvas.height / 2);
    const ropeRadius = Math.max(40, minR - (500 - parseInt(this.circleRadius)));
    const orbitRadius = Math.max(45, Math.min(ropeRadius * 0.22, minR * 0.28));

    const orbitStep = 0.014 * this.direction;
    const spinStep = orbitStep * this.orbitSpinMul;

    for (let i = 0; i < this.tickRate; i++) {
      const leds = this.vortexLib.RunTick(this.vortex);
      if (!leds) continue;

      while (this.histories.length < leds.length) this.histories.push([]);

      this.orbitAngle += orbitStep;
      this.spinAngle += spinStep;

      if (this.orbitAngle >= 2 * Math.PI) this.orbitAngle -= 2 * Math.PI;
      else if (this.orbitAngle < 0) this.orbitAngle += 2 * Math.PI;

      if (this.spinAngle >= 2 * Math.PI) this.spinAngle -= 2 * Math.PI;
      else if (this.spinAngle < 0) this.spinAngle += 2 * Math.PI;

      const cx = pivotX + ropeRadius * Math.cos(this.orbitAngle);
      const cy = pivotY + ropeRadius * Math.sin(this.orbitAngle);

      const n = leds.length || 1;

      for (let index = 0; index < n; index++) {
        let col = leds[index];
        if (!col) col = { red: 0, green: 0, blue: 0 };

        const a = this.spinAngle + (Math.PI * 2 * index) / n;
        const x = cx + orbitRadius * Math.cos(a);
        const y = cy + orbitRadius * Math.sin(a);

        this.histories[index].push({ x, y, color: col });
      }
    }
  }

  draw() {
    // Update springy center once per frame (affects all shapes)
    this._updateSpringCenter();

    switch (this.currentShape) {
      case 'circle':
        this.feedCirclePoints();
        break;
      case 'figure8':
        this.feedFigure8Points();
        break;
      case 'heart':
        this.feedHeartPoints();
        break;
      case 'box':
        this.feedBoxPoints();
        break;
      case 'orbit':
        this.feedOrbitPoints();
        break;
      default:
        console.warn('Unknown shape:', this.currentShape);
        return;
    }

    this.drawHistories();
  }

  drawHistories() {
    this.ctx.fillStyle = `rgba(0, 0, 0, 1)`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.duoEditorMode && this.flashCtx) {
      this.flashCtx.clearRect(0, 0, this.flashCanvas.width, this.flashCanvas.height);
    }

    this.histories.forEach((history, historyIndex) => {
      if (this.duoEditorMode && historyIndex > 1) return;

      for (let index = history.length - 1; index >= 0; index--) {
        const point = history[index];
        if (!point.color.red && !point.color.green && !point.color.blue) continue;

        const gradient = this.ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, this.dotSize);
        const innerAlpha = (1 - (history.length - 1 - index) / history.length).toFixed(2);
        const outerAlpha = this.blurFac !== 0 ? (innerAlpha / this.blurFac).toFixed(2) : innerAlpha;

        gradient.addColorStop(0, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${innerAlpha})`);
        gradient.addColorStop(0.8, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${outerAlpha})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, this.dotSize, 0, 2 * Math.PI);
        this.ctx.fill();

        if (this.duoEditorMode && this.flashCtx && index === history.length - 1 && historyIndex < 2) {
          const p = history[index];
          if (!p.color.red && !p.color.green && !p.color.blue) this.flashCtx.fillStyle = `rgba(0, 0, 0, 1)`;
          else this.flashCtx.fillStyle = `rgba(${p.color.red}, ${p.color.green}, ${p.color.blue}, 1)`;

          if (historyIndex === 0) this.flashCtx.fillRect(100, 1, 100, 60);
          else this.flashCtx.fillRect(130, 55, 40, 25);
        }
      }
    });

    this.histories.forEach((history) => {
      while (history.length > this.trailSize) history.shift();
    });

    if (!this._pause) requestAnimationFrame(this.draw.bind(this));
  }

  feedCirclePoints() {
    const centerX = this._center.x;
    const centerY = this._center.y;

    const minR = Math.min(this.canvas.width / 2, this.canvas.height / 2);
    const baseRadius = minR - (500 - parseInt(this.circleRadius));

    for (let i = 0; i < this.tickRate; i++) {
      const leds = this.vortexLib.RunTick(this.vortex);
      if (!leds) continue;

      while (this.histories.length < leds.length) this.histories.push([]);

      this.angle += 0.02 * this.direction;
      if (this.angle >= 2 * Math.PI) this.angle = 0;

      leds.forEach((col, index) => {
        const radius = baseRadius + index * this.spread;
        const x = centerX + radius * Math.cos(this.angle);
        const y = centerY + radius * Math.sin(this.angle);

        if (!col) col = { red: 0, green: 0, blue: 0 };
        this.histories[index].push({ x, y, color: col });
      });
    }
  }

  feedHeartPoints() {
    const centerX = this._center.x;
    const centerY = this._center.y;

    const scale = this.circleRadius / 20 + 1;

    for (let i = 0; i < this.tickRate; i++) {
      const leds = this.vortexLib.RunTick(this.vortex);
      if (!leds) continue;

      while (this.histories.length < leds.length) this.histories.push([]);

      this.angle += 0.05 * this.direction;
      if (this.angle >= 2 * Math.PI) this.angle = 0;

      leds.forEach((col, index) => {
        const radiusScale = 1 + (index * this.spread) / 100;
        const t = this.angle;

        const x = centerX + scale * radiusScale * 16 * Math.pow(Math.sin(t), 3);
        const y =
          centerY -
          scale * radiusScale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));

        if (!col) col = { red: 0, green: 0, blue: 0 };
        this.histories[index].push({ x, y, color: col });
      });
    }
  }

  feedBoxPoints() {
    const centerX = this._center.x;
    const centerY = this._center.y;

    const minR = Math.min(this.canvas.width / 2, this.canvas.height / 2);
    const baseBoxSize = minR - (500 - parseInt(this.circleRadius));

    for (let i = 0; i < this.tickRate; i++) {
      const leds = this.vortexLib.RunTick(this.vortex);
      if (!leds) continue;

      leds.forEach((col, index) => {
        const boxSize = baseBoxSize + index * this.spread;
        const halfBoxSize = boxSize / 2;
        const fullPerimeter = 4 * boxSize;

        this.angle += this.direction * (0.01 / leds.length) * (360 / fullPerimeter);
        if (this.angle >= 1) this.angle = 0;
        else if (this.angle < 0) this.angle = 1;

        const perimeterPosition = (this.angle * fullPerimeter) % fullPerimeter;

        let x = centerX,
          y = centerY;
        if (perimeterPosition < boxSize) {
          x = centerX - halfBoxSize + perimeterPosition;
          y = centerY - halfBoxSize;
        } else if (perimeterPosition < 2 * boxSize) {
          x = centerX + halfBoxSize;
          y = centerY - halfBoxSize + (perimeterPosition - boxSize);
        } else if (perimeterPosition < 3 * boxSize) {
          x = centerX + halfBoxSize - (perimeterPosition - 2 * boxSize);
          y = centerY + halfBoxSize;
        } else {
          x = centerX - halfBoxSize;
          y = centerY + halfBoxSize - (perimeterPosition - 3 * boxSize);
        }

        if (!col) col = { red: 0, green: 0, blue: 0 };
        if (!this.histories[index]) this.histories[index] = [];
        this.histories[index].push({ x, y, color: col });
      });
    }
  }

  feedFigure8Points() {
    const centerX = this._center.x;
    const centerY = this._center.y;

    const minR = Math.min(this.canvas.width / 2, this.canvas.height / 2);
    const baseRadius = minR - (500 - parseInt(this.circleRadius));

    for (let i = 0; i < this.tickRate; i++) {
      const leds = this.vortexLib.RunTick(this.vortex);
      if (!leds) continue;

      while (this.histories.length < leds.length) this.histories.push([]);

      this.angle += 0.02 * this.direction;
      if (this.angle >= 2 * Math.PI) this.angle = 0;

      leds.forEach((col, index) => {
        const radius = baseRadius + index * this.spread;
        const denom = 1 + Math.cos(this.angle) * Math.cos(this.angle);

        const x = centerX + (radius * Math.sin(this.angle)) / denom;
        const y = centerY + (radius * Math.sin(this.angle) * Math.cos(this.angle)) / denom;

        if (!col) col = { red: 0, green: 0, blue: 0 };
        this.histories[index].push({ x, y, color: col });
      });
    }
  }

  start() {
    this._pause = false;
    if (!this.animationFrameId) this.animationFrameId = requestAnimationFrame(this.boundDraw);
  }

  stop() {
    this._pause = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  getPattern() {
    const demoMode = this.vortex.engine().modes().curMode();
    return demoMode.getPattern(0);
  }

  setPattern(patternIDValue, targetLeds) {
    const selectedPattern = this.vortexLib.PatternID.values[patternIDValue];
    const demoMode = this.vortex.engine().modes().curMode();
    targetLeds.forEach((ledIndex) => {
      demoMode.setPattern(selectedPattern, ledIndex, null, null);
    });
    demoMode.init();
    this.vortex.engine().modes().saveCurMode();
  }

  getColorset(led = this.vortex.engine().leds().ledAny()) {
    const demoMode = this.vortex.engine().modes().curMode();
    if (!demoMode) return new this.vortexLib.Colorset();
    return demoMode.getColorset(led);
  }

  setColorset(colorset, targetLeds) {
    const demoMode = this.vortex.engine().modes().curMode();
    if (!demoMode) return;

    targetLeds.forEach((ledIndex) => {
      demoMode.setColorset(colorset, ledIndex);
    });
    demoMode.init();
    this.vortex.engine().modes().saveCurMode();
  }

  addColor(r, g, b, targetLeds, sourceLed) {
    const set = this.getColorset(sourceLed);
    set.addColor(new this.vortexLib.RGBColor(r, g, b));
    targetLeds.forEach((ledIndex) => {
      this.setColorset(set, [ledIndex]);
    });
  }

  delColor(index, targetLeds, sourceLed) {
    const set = this.getColorset(sourceLed);
    if (set.numColors() <= 1) return;
    set.removeColor(index);
    targetLeds.forEach((ledIndex) => {
      this.setColorset(set, [ledIndex]);
    });
  }

  updateColor(index, r, g, b, targetLeds, sourceLed) {
    const set = this.getColorset(sourceLed);
    set.set(index, new this.vortexLib.RGBColor(r, g, b));
    targetLeds.forEach((ledIndex) => {
      this.setColorset(set, [ledIndex]);
    });
  }

  randomizeColorset(targetLeds) {
    this.vortex.openRandomizer(true);
    let numCmds = 3;

    if (targetLeds.length > 0) {
      this.vortex.clearMenuTargetLeds();
      targetLeds.forEach((led) => this.vortex.addMenuTargetLeds(led));
    } else {
      this.vortex.longClick(0);
      numCmds++;
    }

    this.vortex.longClick(0);
    this.vortex.shortClick(0);
    this.vortex.longClick(0);

    for (let i = 0; i < numCmds; ++i) this.vortexLib.RunTick(this.vortex);
    this.vortex.engine().modes().saveCurMode();
  }

  randomizePattern(targetLeds) {
    this.vortex.openRandomizer(true);
    let numCmds = 4;

    if (targetLeds.length > 0) {
      this.vortex.clearMenuTargetLeds();
      targetLeds.forEach((led) => this.vortex.addMenuTargetLeds(led));
    } else {
      this.vortex.longClick(0);
      numCmds++;
    }

    this.vortex.shortClick(0);
    this.vortex.longClick(0);
    this.vortex.shortClick(0);
    this.vortex.longClick(0);

    for (let i = 0; i < numCmds; ++i) this.vortexLib.RunTick(this.vortex);
    this.vortex.engine().modes().saveCurMode();
  }
}

