import Panel from './Panel.js';

export default class ColorPickerPanel extends Panel {
  constructor(editor) {
    super('colorPickerPanel', '', 'Color Picker'); // Pass id and title to Panel
    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.selectedIndex = 0;
    this.colorState = { r: 0, g: 0, b: 0, h: 0, s: 0, v: 0 };
  }

  initialize() {
    this.initColorPickerContent();

    // Automatically append to the document body
    this.appendTo(document.body);
    this.hide(); // Initially hide the panel
  }

  initColorPickerContent() {
    // Create and structure the content container for the color picker
    this.contentContainer.innerHTML = `<div class="color-picker-controls"></div>`;
  }

  openColorPicker(index, colorSet, updateColorCallback) {
    const col = colorSet.get(index);
    this.selectedIndex = index;

    const { h, s, v } = this.rgbToHsv(col.red, col.green, col.blue);
    this.colorState = { r: col.red, g: col.green, b: col.blue, h, s, v };

    const controlsContainer = this.contentContainer.querySelector('.color-picker-controls');
    controlsContainer.innerHTML = this.createColorPickerHTML(h, s, v, col);

    this.show(); // Show the panel
    this.initColorPickerControls(updateColorCallback);
    this.initHueCircle(h);
  }

  rgbToHsv(r, g, b) {
    const RGBCol = new this.lightshow.vortexLib.RGBColor(r, g, b);
    const HSVCol = this.lightshow.vortexLib.rgb_to_hsv_generic(RGBCol);
    return { h: HSVCol.hue, s: HSVCol.sat, v: HSVCol.val };
  }

  hsvToRgb(h, s, v) {
    const HSVCol = new this.lightshow.vortexLib.HSVColor(h, s, v);
    const RGBCol = this.lightshow.vortexLib.hsv_to_rgb_generic(HSVCol);
    return { r: RGBCol.red, g: RGBCol.green, b: RGBCol.blue };
  }

  createColorPickerHTML(h, s, v, col) {
    return `
      <div class="color-picker-top-section">
        <div class="sv-box-container">
          <label for="svSelector">Saturation x Value</label>
          <div class="sv-box" style="background: linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(${(h / 255) * 360}, 100%, 50%));">
            <div id="svSelector" class="sv-selector" style="left: ${(s / 255) * 100}%; top: ${(1 - v / 255) * 100}%;"></div>
          </div>
        </div>
        <div class="hue-slider-container">
          <label for="hueSelector">Hue</label>
          <div class="hue-slider">
            <div id="hueSelector" class="hue-selector" style="top: ${(h / 255) * 100}%;"></div>
          </div>
        </div>
        <div class="sliders-section">
          <div class="rgb-sliders">
            <div class="slider-group">
              <label for="redSlider">R</label>
              <input type="range" id="redSlider" min="0" max="255" value="${col.red}" style="--slider-color: rgb(255,0,0);">
            </div>
            <div class="slider-group">
              <label for="greenSlider">G</label>
              <input type="range" id="greenSlider" min="0" max="255" value="${col.green}" style="--slider-color: rgb(0,255,0);">
            </div>
            <div class="slider-group">
              <label for="blueSlider">B</label>
              <input type="range" id="blueSlider" min="0" max="255" value="${col.blue}" style="--slider-color: rgb(0,0,255);">
            </div>
          </div>
        </div>
      </div>
      <div class="color-picker-bottom-section">
        <div class="radial-hue-cone-container">
          <div class="radial-hue-cone">
            <div class="radial-hue-inner-circle"></div>
            <div class="hue-indicator hue-selector-animate"></div>
          </div>
          <div class="hue-labels">
            <div class="hue-label hue-label-red">R</div>
            <div class="hue-label hue-label-yellow">Y</div>
            <div class="hue-label hue-label-lime">G</div>
            <div class="hue-label hue-label-cyan">C</div>
            <div class="hue-label hue-label-blue">B</div>
            <div class="hue-label hue-label-magenta">P</div>
          </div>
        </div>
        <div class="input-box-container">
          <div class="input-group">
            <label for="redInput">R:</label>
            <input type="text" id="redInput" class="color-input" min="0" max="255" value="${col.red}">
            <label for="greenInput">G:</label>
            <input type="text" id="greenInput" class="color-input" min="0" max="255" value="${col.green}">
            <label for="blueInput">B:</label>
            <input type="text" id="blueInput" class="color-input" min="0" max="255" value="${col.blue}">
          </div>
          <div class="input-group">
            <label for="hueInput">H:</label>
            <input type="text" id="hueInput" class="color-input" min="0" max="255" value="${h}">
            <label for="satInput">S:</label>
            <input type="text" id="satInput" class="color-input" min="0" max="255" value="${s}">
            <label for="valInput">V:</label>
            <input type="text" id="valInput" class="color-input" min="0" max="255" value="${v}">
          </div>
          <div class="hex-input-group">
            <label for="hexInput">Hex:</label>
            <input type="text" id="hexInput" class="color-input" value="#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1)}">
          </div>
        </div>
      </div>
    `;
  }

  initColorPickerControls(updateColorCallback) {
    const redSlider = document.getElementById('redSlider');
    const greenSlider = document.getElementById('greenSlider');
    const blueSlider = document.getElementById('blueSlider');

    redSlider.addEventListener('input', () => {
      this.colorState.r = parseInt(redSlider.value, 10);
      updateColorCallback(this.selectedIndex, this.colorState);
    });

    greenSlider.addEventListener('input', () => {
      this.colorState.g = parseInt(greenSlider.value, 10);
      updateColorCallback(this.selectedIndex, this.colorState);
    });

    blueSlider.addEventListener('input', () => {
      this.colorState.b = parseInt(blueSlider.value, 10);
      updateColorCallback(this.selectedIndex, this.colorState);
    });

    // Add event listeners for other controls...
  }

  initHueCircle(h) {
    this.setHueIndicator(h);
  }

  setHueIndicator(hue) {
    const hueIndicator = document.querySelector('.hue-indicator');
    const angle = 360 - (hue / 255) * 360 + 90;
    hueIndicator.style.transform = `rotate(${angle}deg)`;
  }

  updateSvBoxBackground(hue) {
    const svBox = document.querySelector('.sv-box');
    svBox.style.background = `linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(${(hue / 255) * 360}, 100%, 50%))`;
  }
}

