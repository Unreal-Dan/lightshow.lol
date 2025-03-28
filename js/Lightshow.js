/* Lightshow.js */
export default class Lightshow {
  static instanceCount = 0;

  // constructor for draw6
  constructor(vortexLib, vortex, canvas, modeData = null, configurableSectionCount = 100) {
    this.id = Lightshow.instanceCount++;
    this.canvas = canvas;
    if (!this.canvas) {
      throw new Error(`Canvas not found`);
    }
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
    this.currentShape = 'circle'; // Default shape
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

    // turn this on/off to only draw 2 leds at a time
    this.duoEditorMode = false;

    this.cursorPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 }; // Center default
    this.targetPosition = { x: this.cursorPosition.x, y: this.cursorPosition.y };
    this.velocity = { x: 0, y: 0 };
    this.friction = 0.8; // Friction for glide effect
    this.isDragging = false;

    // Event listeners for desktop and mobile
    this.addInteractionListeners();

    // Initialize histories for each LED
    this.updateHistories();

    // Determine the initial layout and apply it
    const isMobile = window.innerWidth < 1200;
    this.updateLayout(isMobile);
  }

  updateLayout(isMobile) {
    if (isMobile) {
      // Mobile layout: canvas takes up the top half of the screen
      this.canvas.width = window.innerWidth;
      this.canvas.height = Math.floor(window.innerHeight * 0.40);
      this.resetToCenter(); // Adjust the canvas to reflect the new size
    } else {
      // Desktop layout: canvas takes up the entire screen
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.resetToCenter(); // Adjust the canvas to reflect the new size
    }
  }

  addInteractionListeners() {
    // Mouse interactions
    window.addEventListener('mousemove', (event) => {
      this.targetPosition.x = event.clientX;
      this.targetPosition.y = event.clientY;
    });

    window.addEventListener('mousedown', (event) => {
      this.isDragging = true;
      this.velocity = { x: 0, y: 0 }; // Reset momentum
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false; // Release drag
    });

    // Touch interactions for mobile
    window.addEventListener('touchstart', (event) => {
      const touch = event.touches[0];
      this.targetPosition.x = touch.clientX;
      this.targetPosition.y = touch.clientY;
      this.isDragging = true;
      this.velocity = { x: 0, y: 0 };
    });

    window.addEventListener('touchmove', (event) => {
      const touch = event.touches[0];
      this.targetPosition.x = touch.clientX;
      this.targetPosition.y = touch.clientY;
    });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });
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

  // Method to update histories based on the LED count
  updateHistories() {
    const ledCount = this.ledCount();
    this.histories = [];
    for (let i = 0; i < ledCount; i++) {
      this.histories.push([]);
    }
  }

  applyModeData() {
    if (!this.modeData) {
      return;
    }
    var set = new this.vortexLib.Colorset();
    this.modeData.colorset.forEach(hexCode => {
      const normalizedHex = hexCode.replace('0x', '#');
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalizedHex);
      if (result) {
        set.addColor(new this.vortexLib.RGBColor(
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16)
        ));
      }
    });
    // grab the 'preview' mode for the current mode (randomizer)
    let demoMode = this.vortex.engine().modes().curMode();
    if (!demoMode) {
      return;
    }
    // set the colorset of the demo mode
    demoMode.setColorset(set, this.ledCount());
    // set the pattern of the demo mode to the selected dropdown pattern on all LED positions
    // with null args and null colorset (so they are defaulted and won't change)
    let patID = this.vortexLib.intToPatternID(this.modeData.pattern_id);
    demoMode.setPattern(patID, this.ledCount(), null, null);
    let args = new this.vortexLib.PatternArgs();
    for (let i = 0; i < this.modeData.args.length; ++i) {
      args.addArgs(this.modeData.args[i]);
    }
    this.vortex.setPatternArgs(this.ledCount(), args, false);
    // re-initialize the demo mode so it takes the new args into consideration
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

  // function to set the shape
  setShape(shape) {
    if (this.currentShape === shape) {
      this.direction *= -1; // Reverse direction for the same shape
    } else {
      this.currentShape = shape;
    }

    if (shape === 'cursor') {
      this.enableCursorFollow();
    } else {
      this.disableCursorFollow();
    }
  }

  enableCursorFollow() {
    if (!this.cursorMoveListener) {
      this.cursorPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 }; // Default center
      this.cursorMoveListener = (event) => {
        this.cursorPosition.x = event.clientX;
        this.cursorPosition.y = event.clientY;
      };
      window.addEventListener('mousemove', this.cursorMoveListener);
    }
  }

  disableCursorFollow() {
    if (this.cursorMoveListener) {
      window.removeEventListener('mousemove', this.cursorMoveListener);
      this.cursorMoveListener = null;
    }
    this.targetPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.velocity = { x: 0, y: 0 };
    this.cursorPosition = { x: this.targetPosition.x, y: this.targetPosition.y };
  }


  feedCursorPoints() {
    const { x: currentX, y: currentY } = this.cursorPosition;

    const frac = (this.tickRate / 300);

    // Apply velocity for smooth movement
    this.velocity.x += (this.targetPosition.x - currentX) * (frac * 3); // Acceleration toward target
    this.velocity.y += (this.targetPosition.y - currentY) * (frac * 3);

    // constant fraction of tickrate used to effect velocity
    const ratio = frac + this.friction;

    this.velocity.x *= this.friction; // Apply friction but effected by speed
    this.velocity.y *= this.friction;

    this.cursorPosition.x += this.velocity.x;
    this.cursorPosition.y += this.velocity.y;

    const { x: cursorX, y: cursorY } = this.cursorPosition;

    for (let i = 0; i < (this.tickRate / 2); i++) {
      const leds = this.vortexLib.RunTick(this.vortex);
      if (!leds) {
        continue;
      }

      while (this.histories.length < leds.length) {
        this.histories.push([]);
      }

      leds.forEach((col, index) => {
        const angle = (Math.PI * 2 * index) / leds.length;
        const radius = 30 + index * this.spread;

        const x = cursorX + radius * Math.cos(angle);
        const y = cursorY + radius * Math.sin(angle);

        if (!col) col = { red: 0, green: 0, blue: 0 };

        this.histories[index].push({ x, y, color: col });
      });
    }
  }




  draw() {
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
      case 'cursor':
        this.feedCursorPoints();
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
      if (this.duoEditorMode && historyIndex > 1) {
        return;
      }
      for (let index = history.length - 1; index >= 0; index--) {
        const point = history[index];
        if (!point.color.red && !point.color.green && !point.color.blue) {
          continue;
        }

        const gradient = this.ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, this.dotSize);
        const innerAlpha = (1 - ((history.length - 1 - index) / history.length)).toFixed(2);
        const outerAlpha = this.blurFac !== 0 ? (innerAlpha / this.blurFac).toFixed(2) : innerAlpha;

        gradient.addColorStop(0, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${innerAlpha})`);
        gradient.addColorStop(0.8, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${outerAlpha})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, this.dotSize, 0, 2 * Math.PI);
        this.ctx.fill();

        if (this.duoEditorMode && this.flashCtx && index === history.length - 1 && historyIndex < 2) {
          const point = history[index];
          if (!point.color.red && !point.color.green && !point.color.blue) {
            this.flashCtx.fillStyle = `rgba(0, 0, 0, 1)`;
          } else {
            this.flashCtx.fillStyle = `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, 1)`;
          }

          if (historyIndex === 0) {
            this.flashCtx.fillRect(100, 1, 100, 60);
          } else {
            this.flashCtx.fillRect(130, 55, 40, 25);
          }
        }
      }
    });

    // Ensure histories do not exceed the trail size
    this.histories.forEach(history => {
      while (history.length > this.trailSize) {
        history.shift();
      }
    });

    if (!this._pause) {
      requestAnimationFrame(this.draw.bind(this));
    }
  }

  feedCirclePoints() {
    const centerX = (this.canvas.width / 2);
    const centerY = this.canvas.height / 2;
    let baseRadius = Math.min(centerX, centerY) - (500 - parseInt(this.circleRadius));

    for (let i = 0; i < this.tickRate; i++) {
      const leds = this.vortexLib.RunTick(this.vortex);
      if (!leds) {
        continue;
      }

      // Ensure histories array has sub-arrays for each LED
      while (this.histories.length < leds.length) {
        this.histories.push([]);
      }

      this.angle += ((0.02) * this.direction);
      if (this.angle >= 2 * Math.PI) {
        this.angle = 0;
      }

      leds.forEach((col, index) => {
        let radius = baseRadius + index * this.spread; // Adjust this value to control the distance between rings
        const x = centerX + radius * Math.cos(this.angle);
        const y = centerY + radius * Math.sin(this.angle);
        if (!col) {
          col = { red: 0, green: 0, blue: 0 };
        }
        this.histories[index].push({ x, y, color: col });
      });
    }
  }

  feedHeartPoints() {
    const centerX = (this.canvas.width / 2);
    const centerY = this.canvas.height / 2;
    const scale = (this.circleRadius / 20) + 1;

    for (let i = 0; i < this.tickRate; i++) {
      const leds = this.vortexLib.RunTick(this.vortex);
      if (!leds) {
        continue;
      }

      // Ensure histories array has sub-arrays for each LED
      while (this.histories.length < leds.length) {
        this.histories.push([]);
      }

      this.angle += (0.05 * this.direction); // Adjust this value to control the speed of the heart shape
      if (this.angle >= 2 * Math.PI) {
        this.angle = 0;
      }

      leds.forEach((col, index) => {
        const radiusScale = 1 + index * this.spread / 100; // Modify this line to use spread to adjust the scale
        const t = this.angle;
        const x = centerX + scale * radiusScale * 16 * Math.pow(Math.sin(t), 3);
        const y = centerY - scale * radiusScale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        if (!col) {
          col = { red: 0, green: 0, blue: 0 };
        }
        this.histories[index].push({ x, y, color: col });
      });
    }
  }

  feedBoxPoints() {
    const centerX = (this.canvas.width / 2);
    const centerY = (this.canvas.height / 2);
    const baseBoxSize = Math.min(centerX, centerY) - (500 - parseInt(this.circleRadius));  // Start with a reasonable base size for visibility

    for (let i = 0; i < this.tickRate; i++) {
      const leds = this.vortexLib.RunTick(this.vortex);
      if (!leds) {
        continue;
      }

      leds.forEach((col, index) => {
        const boxSize = baseBoxSize + index * this.spread;  // Actual size of the square for this LED
        const halfBoxSize = boxSize / 2;
        const fullPerimeter = 4 * boxSize;  // Total perimeter of the square

        this.angle += (this.direction * (0.01 / leds.length) * (360 / fullPerimeter));  // Increment angle proportionally to the perimeter
        if (this.angle >= 1) {  // Normalize the angle to prevent overflow
          this.angle = 0;
        } else if (this.angle < 0) {
          this.angle = 1;
        }

        const perimeterPosition = (this.angle * fullPerimeter) % fullPerimeter;  // Current position on the perimeter

        let x = centerX, y = centerY;
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

        if (!col) {
          col = { red: 0, green: 0, blue: 0 };
        }
        this.histories[index].push({ x, y, color: col });
      });
    }
  }

  feedFigure8Points() {
    const centerX = (this.canvas.width / 2);
    const centerY = this.canvas.height / 2;
    let baseRadius = Math.min(centerX, centerY) - (500 - parseInt(this.circleRadius));

    for (let i = 0; i < this.tickRate; i++) {
      const leds = this.vortexLib.RunTick(this.vortex);
      if (!leds) {
        continue;
      }

      // Ensure histories array has sub-arrays for each LED
      while (this.histories.length < leds.length) {
        this.histories.push([]);
      }

      this.angle += (0.02 * this.direction);
      if (this.angle >= 2 * Math.PI) {
        this.angle = 0;
      }

      leds.forEach((col, index) => {
        let radius = baseRadius + index * this.spread; // Adjust this value to control the distance between rings
        const x = centerX + (radius * Math.sin(this.angle)) / (1 + Math.cos(this.angle) * Math.cos(this.angle));
        const y = centerY + (radius * Math.sin(this.angle) * Math.cos(this.angle)) / (1 + Math.cos(this.angle) * Math.cos(this.angle));
        if (!col) {
          col = { red: 0, green: 0, blue: 0 };
        }
        this.histories[index].push({ x, y, color: col });
      });
    }
  }

  start() {
    this._pause = false;
    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(this.boundDraw);
    }
  }

  stop() {
    this._pause = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // get the pattern
  getPattern() {
    const demoMode = this.vortex.engine().modes().curMode();
    return demoMode.getPattern(0);
  }

  // set the pattern
  setPattern(patternIDValue, targetLeds) {
    // the selected dropdown pattern
    const selectedPattern = this.vortexLib.PatternID.values[patternIDValue];
    let demoMode = this.vortex.engine().modes().curMode();
    targetLeds.forEach(ledIndex => {
      // set the pattern of the demo mode to the selected dropdown pattern on all LED positions
      // with null args and null colorset (so they are defaulted and won't change)
      demoMode.setPattern(selectedPattern, ledIndex, null, null);
    });
    // re-initialize the demo mode so it takes the new args into consideration
    demoMode.init();
    // save
    this.vortex.engine().modes().saveCurMode();
  }

  // get colorset
  getColorset(led = this.vortex.engine().leds().ledAny()) {
    const demoMode = this.vortex.engine().modes().curMode();
    if (!demoMode) {
      return new this.vortexLib.Colorset();
    }
    return demoMode.getColorset(led);
  }

  // update colorset
  setColorset(colorset, targetLeds) {
    // grab the 'preview' mode for the current mode (randomizer)
    let demoMode = this.vortex.engine().modes().curMode();
    if (!demoMode) {
      return;
    }
    // set the colorset of the demo mode
    targetLeds.forEach(ledIndex => {
      demoMode.setColorset(colorset, ledIndex);
    });
    // re-initialize the demo mode because num colors may have changed
    demoMode.init();
    // save
    this.vortex.engine().modes().saveCurMode();
  }

  // add a color to the colorset
  addColor(r, g, b, targetLeds, sourceLed) {
    // there's two ways we could do this, we could actually add a color to each
    // colorset regardless of whats there... or we could add a color to the displayed
    // colorset (first selected led) then set that colorset on the rest thereby overwriting
    // I think the more intuitive approach is the latter which overwrites
    let set = this.getColorset(sourceLed);
    set.addColor(new this.vortexLib.RGBColor(r, g, b));
    targetLeds.forEach(ledIndex => {
      this.setColorset(set, [ledIndex]);
    });
  }

  // delete a color from the colorset
  delColor(index, targetLeds, sourceLed) {
    let set = this.getColorset(sourceLed);
    if (set.numColors() <= 1) {
      return;
    }
    set.removeColor(index);
    targetLeds.forEach(ledIndex => {
      this.setColorset(set, [ledIndex]);
    });
  }

  // update a color in the colorset
  updateColor(index, r, g, b, targetLeds,  sourceLed) {
    let set = this.getColorset(sourceLed);
    set.set(index, new this.vortexLib.RGBColor(r, g, b));
    targetLeds.forEach(ledIndex => {
      this.setColorset(set, [ledIndex]);
    });
  }

  randomizeColorset(targetLeds) {
    this.vortex.openRandomizer(true);
    let numCmds = 3;
    if (targetLeds.length > 0) {
      this.vortex.clearMenuTargetLeds();
      targetLeds.forEach(led => {
        // by adding or setting our own target leds it will skip led selection in the menu
        this.vortex.addMenuTargetLeds(led);
      });
    } else {
      // otherwise input long click to select all leds
      this.vortex.longClick(0);
      numCmds++;
    }
    // select colorset
    this.vortex.longClick(0);
    // randomize
    this.vortex.shortClick(0);
    // save
    this.vortex.longClick(0);
    // need to run 1 tick per command
    for (let i = 0; i < numCmds; ++i) {
      this.vortexLib.RunTick(this.vortex);
    }
    this.vortex.engine().modes().saveCurMode();
  }

  randomizePattern(targetLeds) {
    this.vortex.openRandomizer(true);
    let numCmds = 4;
    if (targetLeds.length > 0) {
      this.vortex.clearMenuTargetLeds();
      targetLeds.forEach(led => {
        // by adding or setting our own target leds it will skip led selection in the menu
        this.vortex.addMenuTargetLeds(led);
      });
    } else {
      // otherwise input long click to select all leds
      this.vortex.longClick(0);
      numCmds++;
    }
    // select pattern
    this.vortex.shortClick(0);
    this.vortex.longClick(0);
    // randomize
    this.vortex.shortClick(0);
    // save
    this.vortex.longClick(0);
    // need to run 1 tick per command
    for (let i = 0; i < numCmds; ++i) {
      this.vortexLib.RunTick(this.vortex);
    }
    this.vortex.engine().modes().saveCurMode();
  }
}
