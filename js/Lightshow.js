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
    this.tickRate = 3;
    this.trailSize = 100;
    this.angle = 0;
    this.history = [];
    this.vortexLib = vortexLib;
    this.vortex = new vortexLib.Vortex();
    this.vortex.init();
    this.vortex.setLedCount(1);
    // Run the first tick, at the moment I'm not quite sure why this first
    // tick is spitting out the color red instead of whatever it's supposed to be
    // I think it's just a wasm thing though so I'll find it later
    this.vortexLib.RunTick(this.vortex);
    this.animationFrameId = null;
    this.configurableSectionCount = configurableSectionCount;
    this.sectionWidth = this.canvas.width / this.configurableSectionCount;
    this.boundDraw = this.draw.bind(this);
    this.ctx.fillStyle = 'rgba(0, 0, 0)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.modeData = modeData;
    this.applyModeData();
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

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 50;

    for (let i = 0; i < this.tickRate; i++) {
      const led = this.vortexLib.RunTick(this.vortex);
      if (!led) {
        continue;
      }
      this.angle -= 0.02;
      if (this.angle >= 2 * Math.PI) {
        this.angle = 0;
      }
      const x = centerX + radius * Math.cos(this.angle);
      const y = centerY + radius * Math.sin(this.angle);
      this.history.push({ x, y, color: led[0] });
    }

    for (let index = this.history.length - 1; index >= 0; index--) {
      const point = this.history[index];
      if (!point.color.red && !point.color.green && !point.color.blue) {
        continue;
      }

      const gradient = this.ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, this.dotSize);
      const innerAlpha = (1 - ((this.history.length - 1 - index) / this.history.length)).toFixed(2);
      const outerAlpha = this.blurFac !== 0 ? (innerAlpha / this.blurFac).toFixed(2) : innerAlpha;

      gradient.addColorStop(0, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${innerAlpha})`);
      gradient.addColorStop(0.8, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${outerAlpha})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, this.dotSize, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    if (this.history.length > this.trailSize) {
      this.history.splice(0, this.tickRate);
    }

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
  setPattern(patternIDValue) {
    // the selected dropdown pattern
    const selectedPattern = this.vortexLib.PatternID.values[patternIDValue];
    // grab the 'preview' mode for the current mode (randomizer)
    let demoMode = this.vortex.engine().modes().curMode();
    // set the pattern of the demo mode to the selected dropdown pattern on all LED positions
    // with null args and null colorset (so they are defaulted and won't change)
    demoMode.setPattern(selectedPattern, this.ledCount(), null, null);
    // re-initialize the demo mode so it takes the new args into consideration
    demoMode.init();
  }

  // get colorset
  getColorset() {
    const demoMode = this.vortex.engine().modes().curMode();
    if (!demoMode) {
      return new this.vortexLib.Colorset();
    }
    return demoMode.getColorset(this.vortex.engine().leds().ledAny());
  }

  // update colorset
  setColorset(colorset) {
    // grab the 'preview' mode for the current mode (randomizer)
    let demoMode = this.vortex.engine().modes().curMode();
    if (!demoMode) {
      return;
    }
    // set the colorset of the demo mode
    demoMode.setColorset(colorset, this.ledCount());
    // re-initialize the demo mode because num colors may have changed
    demoMode.init();
  }

  // add a color to the colorset
  addColor(r, g, b) {
    let set = this.getColorset(this.vortex.engine().leds().ledAny());
    set.addColor(new this.vortexLib.RGBColor(r, g, b));
    this.setColorset(set);
  }

  // delete a color from the colorset
  delColor(index) {
    let set = this.getColorset(this.vortex.engine().leds().ledAny());
    if (set.numColors() <= 1) {
      return;
    }
    set.removeColor(index);
    this.setColorset(set);
  }

  // update a color in the colorset
  updateColor(index, r, g, b) {
    let set = this.getColorset(this.vortex.engine().leds().ledAny());
    set.set(index, new this.vortexLib.RGBColor(r, g, b));
    this.setColorset(set);
  }

  // randomize the pattern
  randomize() {
    this.vortex.openRandomizer();
    this.vortex.longClick(0);
    this.vortex.shortClick(0);
    this.vortex.longClick(0);
    // whatever reason we need 3 ticks to clear through the longClick
    // randomize idk it really shouldn't take that long
    for (let i = 0; i < 3; ++i) {
      this.vortexLib.RunTick(this.vortex);
    }
  }
}
