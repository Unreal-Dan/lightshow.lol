import Panel from './Panel.js';

export default class ColorPickerPanel extends Panel {
  constructor(editor) {
    super('colorPickerPanel', '', 'Color Picker', { showCloseButton: true }); // Pass id and title to Panel
    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.selectedIndex = 0;
    this.colorState = { r: 0, g: 0, b: 0, h: 0, s: 0, v: 0 };
    this.preventPropagation = false; // Prevent infinite update loops
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
            <label for="hexInput" id="hexInputLabel">Hex:</label>
            <input type="text" id="hexInput" class="color-input" value="#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1)}">
          </div>
        </div>
      </div>
    `;
  }

  initColorPickerControls(updateColorCallback) {
    const hueSlider = document.querySelector('.hue-slider');
    const hueSelector = document.querySelector('.hue-selector');
    const svBox = document.querySelector('.sv-box');
    const svSelector = document.querySelector('.sv-selector');
    const redSlider = document.getElementById('redSlider');
    const greenSlider = document.getElementById('greenSlider');
    const blueSlider = document.getElementById('blueSlider');
    const redInput = document.getElementById('redInput');
    const greenInput = document.getElementById('greenInput');
    const blueInput = document.getElementById('blueInput');
    const hueInput = document.getElementById('hueInput');
    const satInput = document.getElementById('satInput');
    const valInput = document.getElementById('valInput');
    const hexInput = document.getElementById('hexInput');
    const hueCone = document.querySelector('.radial-hue-cone');
    const hueIndicator = document.querySelector('.hue-indicator');

    if (
      !hueSlider ||
      !hueSelector ||
      !svBox ||
      !svSelector ||
      !redSlider ||
      !greenSlider ||
      !blueSlider ||
      !hueCone ||
      !hueIndicator
    ) {
      console.error('One or more color picker elements are missing.');
      return;
    }

    // Update all color-related elements and call the external callback
    const updateColorUI = (isDragging = false) => {
      if (this.preventPropagation) return;

      this.preventPropagation = true;

      const { r, g, b, h, s, v } = this.colorState;

      // Update controls
      redSlider.value = r;
      greenSlider.value = g;
      blueSlider.value = b;
      redInput.value = r;
      greenInput.value = g;
      blueInput.value = b;
      hueInput.value = Math.round(h);
      satInput.value = Math.round(s);
      valInput.value = Math.round(v);
      hexInput.value = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      this.updateSvBoxBackground(h);
      this.updateSvSelector(s, v);
      this.setHueSlider(h);
      this.setHueIndicator(h);

      // Trigger external callback
      updateColorCallback(
        this.selectedIndex,
        `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`,
        isDragging
      );

      this.preventPropagation = false;
    };

    // Handler functions for different input changes
    const handleRgbSliderChange = (isDragging) => {
      if (this.preventPropagation) return;

      // Get the current RGB values
      const r = parseInt(redSlider.value, 10) & 0xff;
      const g = parseInt(greenSlider.value, 10) & 0xff;
      const b = parseInt(blueSlider.value, 10) & 0xff;

      // Update color state and propagate changes
      const { h, s, v } = this.rgbToHsv(r, g, b);
      this.colorState = { r, g, b, h, s, v };

      // Update UI immediately
      updateColorUI(isDragging);
    };

    const handleRgbInputChange = (event) => {
      if (this.preventPropagation) return;

      const input = event.target;
      let value = parseInt(input.value, 10);

      if (isNaN(value)) value = 0;

      value = Math.max(0, Math.min(255, value));
      input.value = value;

      const r = parseInt(redInput.value, 10) & 0xff;
      const g = parseInt(greenInput.value, 10) & 0xff;
      const b = parseInt(blueInput.value, 10) & 0xff;

      const { h, s, v } = this.rgbToHsv(r, g, b);
      this.colorState = { r, g, b, h, s, v };
      updateColorUI();
    };

    const handleHueSliderChange = (event, isDragging) => {
      const rect = hueSlider.getBoundingClientRect();
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      const hue = (y / rect.height) * 255;
      const { s, v } = this.colorState;
      const { r, g, b } = this.hsvToRgb(hue, s, v);
      hueSelector.style.top = `${y}px`;
      this.colorState = { r, g, b, h: hue, s, v };
      updateColorUI(isDragging);
    };

    const handleHsvInputChange = () => {
      const h = Math.round(parseInt(hueInput.value, 10)) & 0xFF;
      const s = Math.round(parseInt(satInput.value, 10)) & 0xFF;
      const v = Math.round(parseInt(valInput.value, 10)) & 0xFF;
      const { r, g, b } = this.hsvToRgb(h, s, v);
      this.colorState = { r, g, b, h, s, v };
      updateColorUI();
    };

    const handleSvBoxChange = (event, isDragging) => {
      const rect = svBox.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      const s = (x / rect.width) * 255;
      const v = (1 - y / rect.height) * 255;
      const { h } = this.colorState;
      const { r, g, b } = this.hsvToRgb(h, s, v);
      svSelector.style.left = `${x}px`;
      svSelector.style.top = `${y}px`;
      this.colorState = { r, g, b, h, s, v };
      updateColorUI(isDragging);
    };

    const handleHexInputChange = () => {
      const hex = hexInput.value.replace('#', '');
      const bigint = parseInt(hex, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      const { h, s, v } = this.rgbToHsv(r, g, b);
      this.colorState = { r, g, b, h, s, v };
      updateColorUI();
    };

    const handleHueConeChange = (event, isDragging) => {
      if (this.preventPropagation) return;

      const rect = hueCone.getBoundingClientRect();
      const x = event.clientX - rect.left - hueCone.offsetWidth / 2;
      const y = event.clientY - rect.top - hueCone.offsetHeight / 2;
      const angle = Math.atan2(-y, x) * (180 / Math.PI);
      const correctedAngle = angle < 0 ? angle + 360 : angle;
      const hue = (correctedAngle / 360) * 255;

      const { s, v } = this.colorState;
      const { r, g, b } = this.hsvToRgb(hue, s, v);

      this.colorState = { r, g, b, h: hue, s, v };
      updateColorUI(isDragging);
    };

    const startMoveListener = (event, moveHandler) => {
      let isDragging = true;

      const moveEventHandler = (moveEvent) => {
        moveHandler(moveEvent, isDragging);
      };

      const stopDragging = () => {
        isDragging = false;
        document.removeEventListener('mousemove', moveEventHandler);
        document.removeEventListener('mouseup', stopDragging);
        updateColorUI(false); // Final update after dragging ends
      };

      moveHandler(event, isDragging);
      document.addEventListener('mousemove', moveEventHandler);
      document.addEventListener('mouseup', stopDragging, { once: true });
    };

    // Reattach event listeners
    hueSlider.addEventListener('mousedown', (event) =>
      startMoveListener(event, handleHueSliderChange)
    );
    svBox.addEventListener('mousedown', (event) =>
      startMoveListener(event, handleSvBoxChange)
    );
    hueCone.addEventListener('mousedown', (event) =>
      startMoveListener(event, handleHueConeChange)
    );

    const handleRgbSliderMouseDown = (event, slider, handler) => {
      let isDragging = false;

      const handleRgbDrag = () => {
        isDragging = true; // Now dragging
        handler(true); // Call handler with dragging state
      };

      const stopRgbDragging = () => {
        document.removeEventListener('mousemove', handleRgbDrag);
        document.removeEventListener('mouseup', stopRgbDragging);
        handler(false); // Final update when dragging stops
      };

      // Immediate update on click
      handler(false);

      document.addEventListener('mousemove', handleRgbDrag);
      document.addEventListener('mouseup', stopRgbDragging, { once: true });
    };

    // Attach mousedown event for dragging
    redSlider.addEventListener('mousedown', (event) =>
      handleRgbSliderMouseDown(event, redSlider, handleRgbSliderChange)
    );
    greenSlider.addEventListener('mousedown', (event) =>
      handleRgbSliderMouseDown(event, greenSlider, handleRgbSliderChange)
    );
    blueSlider.addEventListener('mousedown', (event) =>
      handleRgbSliderMouseDown(event, blueSlider, handleRgbSliderChange)
    );

    // Simple input handlers (no dragging)
    redInput.addEventListener('input', handleRgbInputChange);
    greenInput.addEventListener('input', handleRgbInputChange);
    blueInput.addEventListener('input', handleRgbInputChange);

    hueInput.addEventListener('input', handleHsvInputChange);
    satInput.addEventListener('input', handleHsvInputChange);
    valInput.addEventListener('input', handleHsvInputChange);

    hexInput.addEventListener('input', handleHexInputChange);
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

  updateSvSelector(sat, val) {
    const svBox = document.querySelector('.sv-box');
    const rect = svBox.getBoundingClientRect();
    const x = (sat / 255) * rect.width;
    const y = (1.0 - (val / 255)) * rect.height;
    const svSelector = document.querySelector('.sv-selector');
    svSelector.style.left = `${x}px`;
    svSelector.style.top = `${y}px`;
  }

  setHueSlider(hue) {
    const hueSlider = document.querySelector('.hue-slider');
    const hueSelector = hueSlider.querySelector('.hue-selector');
    const rect = hueSlider.getBoundingClientRect();
    const topPosition = (hue / 255) * rect.height;
    hueSelector.style.top = `${topPosition}px`;
  }

}

