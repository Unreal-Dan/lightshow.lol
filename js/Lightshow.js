export default class Lightshow {
  constructor(vortexLib) {
    this.dotSize = 25;
    this.blurFac = 5;
    this.tickRate = 3;
    this.trailSize = 100;
    this.canvas = document.getElementById('lightshowCanvas');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx = this.canvas.getContext('2d');
    this.angle = 0;
    this.history = [];
    this.needRefresh = true;
    this.sendDemoNow = false;
    this.currentTooltip = null;
    this.vortexLib = vortexLib;
  }

  set tickRate(value) {
    this._tickRate = parseInt(value, 10);
  }

  get tickRate() {
    return this._tickRate;
  }

  set trailSize(value) {
    this._trailSize = parseInt(value, 10);
    if (this.history && this.history.length > this._trailSize) {
      const itemsToRemove = this.history.length - this._trailSize;
      this.history.splice(0, itemsToRemove);
    }
  }

  get trailSize() {
    return this._trailSize;
  }

  set dotSize(value) {
    this._dotSize = parseInt(value, 10);
  }

  get dotSize() {
    return this._dotSize;
  }

  set blurFac(value) {
    this._blurFac = parseInt(value, 10);
  }

  get blurFac() {
    return this._blurFac;
  }

  set width(value) {
    this.canvas.width = value;
  }

  get width() {
    return this.canvas.width;
  }

  set height(value) {
    this.canvas.height = value;
  }

  get height() {
    return this.canvas.height;
  }

  init() {
    this.draw();
  }

  draw() {
    this.ctx.fillStyle = `rgba(0, 0, 0, 1)`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 50;

    for (let i = 0; i < this.tickRate; i++) {
      const led = this.vortexLib.Tick();
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

  // get the pattern
  getPattern() {
    const demoMode = this.vortexLib.Modes.curMode();
    return demoMode.getPattern(this.vortexLib.LedPos.LED_0);
  }

  // set the pattern
  setPattern(patternIDValue) {
    // the selected dropdown pattern
    const selectedPattern = this.vortexLib.PatternID.values[patternIDValue];
    // grab the 'preview' mode for the current mode (randomizer)
    let demoMode = this.vortexLib.Modes.curMode();
    // set the pattern of the demo mode to the selected dropdown pattern on all LED positions
    // with null args and null colorset (so they are defaulted and won't change)
    demoMode.setPattern(selectedPattern, this.vortexLib.LedPos.LED_ALL, null, null);
    // re-initialize the demo mode so it takes the new args into consideration
    demoMode.init();
  }

  // get colorset
  getColorset() {
    const demoMode = this.vortexLib.Modes.curMode();
    return demoMode.getColorset(this.vortexLib.LedPos.LED_0);
  }

  // update colorset
  setColorset(colorset) {
    // grab the 'preview' mode for the current mode (randomizer)
    let demoMode = this.vortexLib.Modes.curMode();
    // set the colorset of the demo mode
    demoMode.setColorset(colorset, this.vortexLib.LedPos.LED_ALL);
    // re-initialize the demo mode because num colors may have changed
    demoMode.init();
  }

  // add a color to the colorset
  addColor(r, g, b) {
    let set = this.getColorset();
    set.addColor(new this.vortexLib.RGBColor(r, g, b));
    this.setColorset(set);
  }

  // delete a color from the colorset
  delColor(index) {
    let set = this.getColorset();
    if (set.numColors() <= 1) {
      return;
    }
    set.removeColor(index);
    this.setColorset(set);
  }

  // update a color in the colorset
  updateColor(index, r, g, b) {
    let set = this.getColorset();
    set.set(index, new this.vortexLib.RGBColor(r, g, b));
    this.setColorset(set);
  }

  // randomize the pattern
  randomize() {
    this.vortexLib.Vortex.openRandomizer();
    this.vortexLib.Vortex.longClick(0);
    this.vortexLib.Vortex.shortClick(0);
    this.vortexLib.Vortex.longClick(0);
    // whatever reason we need 3 ticks to clear through the longClick
    // randomize idk it really shouldn't take that long
    for (let i = 0; i < 3; ++i) {
      this.vortexLib.Tick();
    }
  }
}
