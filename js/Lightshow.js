/* Lightshow.js */
export default class Lightshow {
  static instanceCount = 0;

  // constructor for draw6
  constructor(vortexLib, canvas, modeData = null, configurableSectionCount = 100) {
    this.id = Lightshow.instanceCount++;
    this.canvas = canvas;
    if (!this.canvas) {
      throw new Error(`Canvas with ID ${canvasId} not found`);
    }
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx = this.canvas.getContext('2d');
    this.dotSize = 25;
    this.blurFac = 5;
    this.circleRadius = 400;
    this.tickRate = 3;
    this.trailSize = 100;
    this.angle = 0;
    this.vortexLib = vortexLib;
    this.vortex = new vortexLib.Vortex();
    this.vortex.init();
    this.vortex.setLedCount(1);
    this.vortexLib.RunTick(this.vortex);
    this.animationFrameId = null;
    this.configurableSectionCount = configurableSectionCount;
    this.sectionWidth = this.canvas.width / this.configurableSectionCount;
    this.boundDraw = this.draw.bind(this);
    this.ctx.fillStyle = 'rgba(0, 0, 0)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.modeData = modeData;
    this.applyModeData();
    this.targetLeds = [0];

    // Initialize histories for each LED
    this.updateHistories();
  }

  setLedCount(count) {
    this.vortex.setLedCount(count);
    this.updateHistories();
  }

  resetToCenter() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
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

  set targetLeds(value) {
    this._targetLeds = value;
  }

  get targetLeds() {
    return this._targetLeds || [];
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


  draw() {
    this.ctx.fillStyle = `rgba(0, 0, 0, 1)`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

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

      this.angle -= 0.02;
      if (this.angle >= 2 * Math.PI) {
        this.angle = 0;
      }

      leds.forEach((col, index) => {
        let radius = baseRadius + index * 15; // Adjust this value to control the distance between rings
        const x = centerX + radius * Math.cos(this.angle);
        const y = centerY + radius * Math.sin(this.angle);
        if (!col) {
          col = { red: 0, green: 0, blue: 0 };
        }
        this.histories[index].push({ x, y, color: col });
      });
    }

    this.histories.forEach(history => {
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
      }
    });

    this.histories.forEach(history => {
      if (history.length > this.trailSize) {
        history.splice(0, this.tickRate);
      }
    });

    requestAnimationFrame(this.draw.bind(this));
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
  setPattern(patternIDValue, targetLeds = this.targetLeds) {
    // the selected dropdown pattern
    const selectedPattern = this.vortexLib.PatternID.values[patternIDValue];
    // grab the 'preview' mode for the current mode (randomizer)
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
  setColorset(colorset, targetLeds = this.targetLeds) {
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
  addColor(r, g, b, targetLeds = this.targetLeds) {
    // there's two ways we could do this, we could actually add a color to each
    // colorset regardless of whats there... or we could add a color to the displayed
    // colorset (first selected led) then set that colorset on the rest thereby overwriting
    // I think the more intuitive approach is the latter which overwrites
    let set = this.getColorset(targetLeds[0]);
    set.addColor(new this.vortexLib.RGBColor(r, g, b));
    targetLeds.forEach(ledIndex => {
      this.setColorset(set, [ ledIndex ]);
    });
  }

  // delete a color from the colorset
  delColor(index, targetLeds = this.targetLeds) {
    let set = this.getColorset(targetLeds[0]);
    if (set.numColors() <= 1) {
      return;
    }
    set.removeColor(index);
    targetLeds.forEach(ledIndex => {
      this.setColorset(set, [ ledIndex ]);
    });
  }

  // update a color in the colorset
  updateColor(index, r, g, b, targetLeds = this.targetLeds) {
    let set = this.getColorset(targetLeds[0]);
    set.set(index, new this.vortexLib.RGBColor(r, g, b));
    targetLeds.forEach(ledIndex => {
      this.setColorset(set, [ ledIndex ]);
    });
  }

  randomizeColorset(targetLeds = this.targetLeds) {
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

  randomizePattern(targetLeds = this.targetLeds) {
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
