import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';
import ColorPickerPanel from './ColorPickerPanel.js';

export default class ColorsetPanel extends Panel {
  constructor(editor) {
    //<div id="colorset-selected-leds" class="selected-leds-bar"></div>
    const content = `
      <div id="colorset-status">
        <button id="colorset-preset-one" class="preset-button"></button>
        <button id="colorset-preset-two" class="preset-button"></button>
        <button id="colorset-preset-three" class="preset-button"></button>
        <button id="colorset-preset-four" class="preset-button"></button>
        <button id="colorset-preset-rainbow" class="preset-button"></button>
        <button id="colorset-preset-grayscale" class="preset-button"></button>
        <button id="colorset-preset-pastel" class="preset-button"></button>
        <button id="colorset-preset-dark" class="preset-button"></button>
      </div>
      <hr id="patternDivider">
      <div id="colorset" class="color-row"></div>
    `;
    super('colorsetPanel', content, 'Colorset');
    this.editor = editor
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
    this.targetLed = 0;
    this.targetLeds = [ this.targetLed ];
    this.isMulti = false;
    this.multiEnabled = false;
  }

  initialize() {
    this.refresh();
    // Add event listeners for preset buttons
    document.getElementById('colorset-preset-rainbow').addEventListener('click', () => this.applyPreset('rainbow'));
    document.getElementById('colorset-preset-grayscale').addEventListener('click', () => this.applyPreset('grayscale'));
    document.getElementById('colorset-preset-pastel').addEventListener('click', () => this.applyPreset('pastel'));
    document.getElementById('colorset-preset-dark').addEventListener('click', () => this.applyPreset('dark'));
    document.getElementById('colorset-preset-one').addEventListener('click', () => this.applyPreset('one'));
    document.getElementById('colorset-preset-two').addEventListener('click', () => this.applyPreset('two'));
    document.getElementById('colorset-preset-three').addEventListener('click', () => this.applyPreset('three'));
    document.getElementById('colorset-preset-four').addEventListener('click', () => this.applyPreset('four'));
    // Listen for the modeChange event
    document.addEventListener('modeChange', (event) => {
      //console.log("Mode change detected by control panel, refreshing");
      const selectedLeds = event.detail;
      // if array is just multi do this:
      if (selectedLeds.includes('multi')) {
        this.setTargetMulti();
      } else {
        this.setTargetSingles(selectedLeds);
      }
      //console.log('mode changed:', selectedLeds);
      this.refresh(true);
      this.editor.demoModeOnDevice();
    });
    document.addEventListener('ledsChange', (event) => {
      const selectedLeds = event.detail;
      // if array is just multi do this:
      if (selectedLeds.includes('multi')) {
        this.setTargetMulti();
      } else {
        this.setTargetSingles(selectedLeds);
      }
      //console.log('LEDs changed:', this.targetLeds);
      this.refresh(true);
    });
    document.addEventListener('deviceChange', this.handleDeviceEvent.bind(this));
  }

  applyPreset(preset) {
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) return;

    const set = cur.getColorset(this.targetLed);
    set.clear();
    let numCols = ((Math.random() * 100) % 8);

    switch (preset) {
    case 'rainbow':
      if (numCols < 5) {
        numCols = 4 + (numCols % 4);
      }
      for (let i = 0; i < numCols; i++) {
        const hue = (i / numCols) * 360;
        const rgb = this.hslToRgb(hue, 1, 0.5); // Full saturation, medium lightness
        set.addColor(new this.lightshow.vortexLib.RGBColor(rgb.r, rgb.g, rgb.b));
      }
      break;
    case 'grayscale':
      for (let i = 0; i < numCols; i++) {
        const gray = Math.floor(Math.random() * 256);
        set.addColor(new this.lightshow.vortexLib.RGBColor(gray, gray, gray));
      }
      break;
    case 'pastel':
      for (let i = 0; i < numCols; i++) {
        const pastel = {
          r: Math.floor(Math.random() * 128 + 127),
          g: Math.floor(Math.random() * 128 + 127),
          b: Math.floor(Math.random() * 128 + 127),
        };
        set.addColor(new this.lightshow.vortexLib.RGBColor(pastel.r, pastel.g, pastel.b));
      }
      break;
    case 'dark':
      for (let i = 0; i < numCols; i++) {
        const dark = {
          r: Math.floor(Math.random() * 128),
          g: Math.floor(Math.random() * 128),
          b: Math.floor(Math.random() * 128),
        };
        set.addColor(new this.lightshow.vortexLib.RGBColor(dark.r, dark.g, dark.b));
      }
      break;
    case 'one':
      const color = this.getRandomColor();
      set.addColor(new this.lightshow.vortexLib.RGBColor(color.r, color.g, color.b));
      break;
    case 'two':
      for (let i = 0; i < 2; i++) {
        const color = this.getRandomColor();
        set.addColor(new this.lightshow.vortexLib.RGBColor(color.r, color.g, color.b));
      }
      break;
    case 'three':
      for (let i = 0; i < 3; i++) {
        const color = this.getRandomColor();
        set.addColor(new this.lightshow.vortexLib.RGBColor(color.r, color.g, color.b));
      }
      break;
    case 'four':
      for (let i = 0; i < 4; i++) {
        const color = this.getRandomColor();
        set.addColor(new this.lightshow.vortexLib.RGBColor(color.r, color.g, color.b));
      }
      break;
    default:
      break;
    }
    cur.setColorset(set, this.targetLed);
    cur.init();
    this.lightshow.vortex.engine().modes().saveCurMode();
    this.refreshColorset();
  }

  hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0,
      g = 0,
      b = 0;

    if (h >= 0 && h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h >= 60 && h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h >= 180 && h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h >= 240 && h < 300) {
      r = x;
      g = 0;
      b = c;
    } else if (h >= 300 && h < 360) {
      r = c;
      g = 0;
      b = x;
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  getRandomColor() {
    return {
      r: Math.floor(Math.random() * 256),
      g: Math.floor(Math.random() * 256),
      b: Math.floor(Math.random() * 256),
    };
  }

  handleDeviceEvent(deviceChangeEvent) {
    // Access the custom data from `event.detail`
    const { deviceEvent, deviceName } = deviceChangeEvent.detail;
    if (deviceEvent === 'waiting') {
      this.onDeviceWaiting(deviceName);
    } else if (deviceEvent === 'connect') {
      this.onDeviceConnect(deviceName);
    } else if (deviceEvent === 'disconnect') {
      this.onDeviceDisconnect(deviceName);
    } else if (deviceEvent === 'select') {
      this.onDeviceSelected(deviceName);
    }
  }

  onDeviceSelected(deviceName) {
    // nothing yet
  }

  onDeviceWaiting(deviceName) {
    // nothing yet
  }

  onDeviceConnect(deviceName) {
    // nothing yet
  }

  onDeviceDisconnect(deviceName) {
    // nothing yet
  }

  setTargetSingles(selectedLeds = null) {
    if (!selectedLeds) {
      const ledCount = this.lightshow.vortex.engine().leds().ledCount();
      selectedLeds = []
      for (let i = 0; i < ledCount; i++) {
        selectedLeds.push(i.toString());
      }
    }
    this.targetLeds = selectedLeds.map(led => parseInt(led, 10));;
    this.targetLed = this.targetLeds[0];
    this.isMulti = false;
  }

  setTargetMulti() {
    this.targetLed = this.lightshow.vortex.engine().leds().ledMulti();
    this.targetLeds = [ this.targetLed ];
    this.isMulti = true;
  }

  refresh(fromEvent = false) {
    //this.refreshSelectedLedsBar();
    this.refreshColorset(fromEvent);
  }

  async refreshColorset(fromEvent = false) {
    const colorsetElement = document.getElementById('colorset');
    const cur = this.lightshow.vortex.engine().modes().curMode();
    colorsetElement.innerHTML = ''; // Clear colorset

    if (!cur) return;

    const set = cur.getColorset(this.targetLed);
    const numColors = set ? set.numColors() : 0;

    let draggingElement = null;
    let dragStartIndex = null;
    let placeholder = null;

    const createPlaceholder = () => {
      placeholder = document.createElement('div');
      placeholder.className = 'color-cube placeholder';
      placeholder.style.width = `${draggingElement.offsetWidth}px`;
      placeholder.style.height = `${draggingElement.offsetHeight}px`;
    };

    const updatePlaceholder = (target) => {
      if (!placeholder || !target || placeholder === target) return;
      if (target.classList.contains('empty') || target.classList.contains('add-color')) return; // Skip the + icon

      const targetRect = target.getBoundingClientRect();
      const placeholderRect = placeholder.getBoundingClientRect();

      // Check if dragging to the right or left
      const isDraggingRight = draggingElement.getBoundingClientRect().left > targetRect.left;

      if (isDraggingRight) {
        // Insert the placeholder after the target
        colorsetElement.insertBefore(placeholder, target.nextSibling);
      } else {
        // Insert the placeholder before the target
        colorsetElement.insertBefore(placeholder, target);
      }
    };


    const DRAG_THRESHOLD = 5; // Adjust for better responsiveness
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const handlePointerDown = (e) => {
      if (e.button !== 0) {
        e.preventDefault(); // Prevent default right-click behavior if necessary
        return; // Abort drag handling for non-left-clicks
      }

      const target = e.target.closest('.color-cube');
      if (!target || target.classList.contains('empty')) return;

      draggingElement = target;
      dragStartIndex = parseInt(target.dataset.index, 10);

      startX = e.clientX;
      startY = e.clientY;

      document.addEventListener('pointermove', checkForDragStart);
      document.addEventListener('pointerup', cancelDragStart);
    };


    const checkForDragStart = (e) => {
      const movedX = Math.abs(e.clientX - startX);
      const movedY = Math.abs(e.clientY - startY);

      if (movedX > DRAG_THRESHOLD || movedY > DRAG_THRESHOLD) {
        isDragging = true;

        draggingElement.classList.add('dragging');
        draggingElement.style.position = 'absolute';
        draggingElement.style.zIndex = 1000;
        draggingElement.style.pointerEvents = 'none';
        const rect = colorsetElement.getBoundingClientRect();
        draggingElement.style.left = `${e.clientX - rect.left}px`;
        draggingElement.style.top = `${e.clientY - rect.top + 70}px`;

        createPlaceholder();
        colorsetElement.insertBefore(placeholder, draggingElement.nextSibling);

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);

        document.removeEventListener('pointermove', checkForDragStart);
        document.removeEventListener('pointerup', cancelDragStart);
      }
    };

    const cancelDragStart = () => {
      document.removeEventListener('pointermove', checkForDragStart);
      document.removeEventListener('pointerup', cancelDragStart);

      draggingElement = null;
      isDragging = false;
    };

    const handlePointerMove = (e) => {
      if (!draggingElement || !isDragging) return;

      const rect = colorsetElement.getBoundingClientRect();
      draggingElement.style.left = `${e.clientX - rect.left}px`;
      draggingElement.style.top = `${e.clientY - rect.top + 70}px`;

      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.color-cube:not(.dragging):not(.empty)');
      updatePlaceholder(target);
    };

    const handlePointerUp = () => {
      if (!draggingElement || !isDragging) return;

      const children = Array.from(colorsetElement.children);
      let dropIndex = children.indexOf(placeholder);

      if (dropIndex > dragStartIndex) dropIndex -= 1; // Adjust for placeholder
      if (dragStartIndex !== dropIndex && dropIndex >= 0) {
        const set = cur.getColorset(this.targetLed);
        set.shift(dragStartIndex, dropIndex);
        cur.setColorset(set, this.targetLed);
        cur.init();
        this.lightshow.vortex.engine().modes().saveCurMode();
      }

      placeholder?.remove();
      placeholder = null;

      draggingElement.classList.remove('dragging');
      draggingElement.style.position = '';
      draggingElement.style.zIndex = '';
      draggingElement.style.pointerEvents = '';
      draggingElement.style.left = '';
      draggingElement.style.top = '';
      draggingElement = null;
      isDragging = false;

      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);

      this.refreshColorset();
    };

    for (let i = 0; i < 8; i++) {
      const container = document.createElement('div');
      container.className = 'color-cube';
      container.dataset.index = i;

      if (i < numColors) {
        const col = set.get(i);
        const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1).toUpperCase()}`;

        container.style.backgroundColor = hexColor;
        container.style.boxShadow = `0 0 10px ${hexColor}`;

        // Left-click to open color picker
        container.addEventListener('click', () => {
          if (!isDragging) {
            this.editor.colorPickerPanel.open(i, set, this.updateColor.bind(this));
          }
        });

        // Right-click to delete
        container.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.delColor(i);
        });

        container.addEventListener('pointerdown', handlePointerDown);
      } else if (i === numColors) {
        container.classList.add('add-color');
        container.textContent = '+';
        container.addEventListener('click', () => {
          this.addColor();
        });
      } else {
        container.classList.add('empty');
      }
      colorsetElement.appendChild(container);
    }
  }

  // Helper: Convert Hex to RGB
  hexToRGB(hex) {
    let bigint = parseInt(hex.replace(/^#/, ''), 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  }

  updateColor(index, hexValue, isDragging) {
    let hex = hexValue ? hexValue.replace(/^#/, '') : 0;
    let bigint = parseInt(hex, 16);
    let r = (bigint >> 16) & 255;
    let g = (bigint >> 8) & 255;
    let b = bigint & 255;
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      return;
    }
    let set = cur.getColorset(this.targetLed);
    let col = new this.lightshow.vortexLib.RGBColor(r, g, b);
    set.set(index, col);
    this.targetLeds.forEach(led => {
      cur.setColorset(set, led);
    });
    // re-initialize the demo mode because num colors may have changed
    cur.init();
    // save
    this.lightshow.vortex.engine().modes().saveCurMode();
    // refresh
    this.refreshColorset();
    if (isDragging) {
      this.editor.demoColorOnDevice(col);
    } else {
      // demo on device
      this.editor.demoModeOnDevice();
    }
  }

  addColor() {
    this.lightshow.addColor(255, 255, 255, this.targetLeds);
    this.refreshColorset();
    // demo on device
    this.editor.demoModeOnDevice();
  }

  delColor(index) {
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      return;
    }
    let set = cur.getColorset(this.targetLed);
    if (set.numColors() <= 0) {
      return;
    }
    set.removeColor(index);
    this.targetLeds.forEach(led => {
      cur.setColorset(set, led);
    });
    // re-initialize the demo mode because num colors may have changed
    cur.init();
    // save
    this.lightshow.vortex.engine().modes().saveCurMode();
    // refresh
    this.refreshColorset();
    // demo on device
    this.editor.demoModeOnDevice();
  }
}

