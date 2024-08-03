import Modal from './Modal.js';

export default class ColorPicker {
  constructor(lightshow) {
    this.lightshow = lightshow;
    this.modals = [];
    this.selectedIndex = 0;
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

  openColorPickerModal(index, colorSet, updateColorCallback) {
    const col = colorSet.get(index);

    // Create or reuse the modal for the current index
    if (!this.modal) {
      this.modal = new Modal('color_picker');
    }
    this.selectedIndex = index;

    const { h, s, v } = this.rgbToHsv(col.red, col.green, col.blue);

    // Show the modal with the current color
    this.modal.show({
      title: 'Edit Color',
      blurb: `<div class="color-picker-modal-content">
                <div class="color-picker-top-section">
                  <div class="sv-box-container">
                    <div class="sv-box" style="background: linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(${(h / 255) * 360}, 100%, 50%));">
                      <div class="sv-selector" style="left: ${(s / 255) * 100}%; top: ${(1 - v / 255) * 100}%;"></div>
                    </div>
                  </div>
                  <div class="hue-slider-container">
                    <div class="hue-slider">
                      <div class="hue-selector" style="top: ${(h / 255) * 100}%;"></div>
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
                      <div class="hue-indicator"></div>
                    </div>
                  </div>
                </div>
              </div>`,
    });

    // Initialize color picker controls
    this.initColorPickerControls(updateColorCallback, index);

    // Initialize the hue circle
    this.initHueCircle(h);
  }

  initColorPickerControls(updateColorCallback, index) {
    const hueSlider = document.querySelector('.hue-slider');
    const hueSelector = document.querySelector('.hue-selector');
    const svBox = document.querySelector('.sv-box');
    const svSelector = document.querySelector('.sv-selector');
    const redSlider = document.getElementById('redSlider');
    const greenSlider = document.getElementById('greenSlider');
    const blueSlider = document.getElementById('blueSlider');
    const hueCone = document.querySelector('.radial-hue-cone');
    const hueIndicator = document.querySelector('.hue-indicator');

    if (!hueSlider || !hueSelector || !svBox || !svSelector || !redSlider || !greenSlider || !blueSlider || !hueCone || !hueIndicator) {
      console.error('One or more color picker elements are missing.');
      return;
    }

    const updateColor = () => {
      const r = parseInt(redSlider.value, 10) & 0xff;
      const g = parseInt(greenSlider.value, 10) & 0xff;
      const b = parseInt(blueSlider.value, 10) & 0xff;
      const { h, s, v } = this.rgbToHsv(r, g, b);
      this.updateSvBoxBackground(h);
      this.setHueSlider(h);
      this.setHueIndicator(h); // Update hue indicator
      updateColorCallback(this.selectedIndex, `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`);
    };

    const updateColorPreview = (h, s, v) => {
      const { r, g, b } = this.hsvToRgb(h, s, v);
      redSlider.value = r;
      greenSlider.value = g;
      blueSlider.value = b;
      this.updateSvBoxBackground(h);
      this.setHueSlider(h);
      this.setHueIndicator(h); // Update hue indicator
      updateColorCallback(this.selectedIndex, `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`);
    };

    const handleHueChange = (event) => {
      const rect = hueSlider.getBoundingClientRect();
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      const hue = (y / rect.height) * 255; // Scale hue to 0-255

      hueSelector.style.top = `${y}px`;

      const { s, v } = this.getSv();
      this.updateSvBoxBackground(hue);
      this.setHueIndicator(hue); // Update hue indicator
      updateColorPreview(hue, s, v);
    };

    const handleSvChange = (event) => {
      const rect = svBox.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));

      const s = (x / rect.width) * 255; // Scale saturation to 0-255
      const v = (1 - y / rect.height) * 255; // Scale value to 0-255

      svSelector.style.left = `${x}px`;
      svSelector.style.top = `${y}px`;

      const h = this.getHue();
      this.setHueIndicator(h); // Update hue indicator
      updateColorPreview(h, s, v);
    };

    const startMoveListener = (event, moveHandler, endHandler) => {
      moveHandler(event);
      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', () => {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', endHandler);
      }, { once: true });
    };

    // Reattach event listeners
    hueSlider.addEventListener('mousedown', (event) => startMoveListener(event, handleHueChange));
    svBox.addEventListener('mousedown', (event) => startMoveListener(event, handleSvChange));

    redSlider.addEventListener('input', updateColor);
    greenSlider.addEventListener('input', updateColor);
    blueSlider.addEventListener('input', updateColor);

    // Handle clicks and drag on the hue cone
    hueCone.addEventListener('mousedown', (event) => startMoveListener(event, (e) => this.handleHueConeMove(e, updateColorPreview)));
  }

  initHueCircle(h) {
    this.setHueIndicator(h);
  }

  setHueIndicator(hue) {
    const hueCone = document.querySelector('.radial-hue-cone');
    const hueIndicator = document.querySelector('.hue-indicator');

    const radius = hueCone.offsetWidth / 2;
    const angle = (hue / 255) * 360;
    const radian = (angle * Math.PI) / 180;

    const x = radius + radius * Math.cos(radian);
    const y = radius - radius * Math.sin(radian); // Corrected the y calculation for top-to-bottom coordinate system

    hueIndicator.style.left = `${x}px`;
    hueIndicator.style.top = `${y}px`;
  }

  handleHueConeMove(event, updateColorPreview) {
    const hueCone = document.querySelector('.radial-hue-cone');
    const rect = hueCone.getBoundingClientRect();
    const x = event.clientX - rect.left - hueCone.offsetWidth / 2;
    const y = event.clientY - rect.top - hueCone.offsetHeight / 2;

    const angle = Math.atan2(-y, x) * (180 / Math.PI); // Convert angle to 0-360 range
    const correctedAngle = (angle < 0) ? angle + 360 : angle; // Ensure angle is non-negative

    const hue = (correctedAngle / 360) * 255;
    const { s, v } = this.getSv();
    updateColorPreview(hue, s, v); // Update color based on angle
  }

  updateSvBoxBackground(hue) {
    const svBox = document.querySelector('.sv-box');
    svBox.style.background = `linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(${(hue / 255) * 360}, 100%, 50%))`;
  }

  setHueSlider(hue) {
    const hueSlider = document.querySelector('.hue-slider');
    const hueSelector = hueSlider.querySelector('.hue-selector');
    const rect = hueSlider.getBoundingClientRect();

    // Calculate the top position based on the hue value
    const topPosition = (hue / 255) * rect.height;

    // Set the top style of the hue selector
    hueSelector.style.top = `${topPosition}px`;
  }

  getHue() {
    const hueSlider = document.querySelector('.hue-slider');
    const rect = hueSlider.getBoundingClientRect();
    const y = hueSlider.querySelector('.hue-selector').offsetTop;
    return (y / rect.height) * 255;
  }

  getSv() {
    const svSelector = document.querySelector('.sv-selector');
    const svBox = document.querySelector('.sv-box');
    const rect = svBox.getBoundingClientRect();
    const s = (svSelector.offsetLeft / rect.width) * 255;
    const v = (1 - svSelector.offsetTop / rect.height) * 255;
    return { s, v };
  }
}

