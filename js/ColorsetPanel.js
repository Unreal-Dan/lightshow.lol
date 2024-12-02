import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';
import ColorPickerPanel from './ColorPickerPanel.js';

export default class ColorsetPanel extends Panel {
  constructor(editor) {
    const content = `
          <fieldset>
            <legend>Colorset</legend>
            <div id="colorset" class="grid-container"></div>
          </fieldset>
        `;

    super('colorsetPanel', content, 'Colorset');
    this.editor = editor
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
    this.targetLed = 0;
    this.targetLeds = [ this.targetLed ];
    this.isMulti = false;
    this.multiEnabled = false;

    // Instantiate the ColorPicker
    this.colorPicker = new ColorPickerPanel(editor);
  }

  initialize() {
    this.refresh();
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
    document.addEventListener('deviceConnected', (event) => {
      //console.log("Control Panel detected device conneted");
      this.multiEnabled = true;
      this.populatePatternDropdown();
      this.refresh(true);
      this.vortexPort.startReading();
      this.editor.demoModeOnDevice();
    });
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
    this.refreshColorset(fromEvent);
  }

  async refreshColorset(fromEvent = false) {
    const colorsetElement = document.getElementById('colorset');
    const cur = this.lightshow.vortex.engine().modes().curMode();
    colorsetElement.innerHTML = ''; // Clear colorset

    if (!cur) {
      return;
    }

    const set = cur.getColorset(this.targetLed);
    const numColors = set ? set.numColors() : 0;

    for (let i = 0; i < numColors; i++) {
      const container = document.createElement('div');
      container.className = 'color-box';

      const col = set.get(i);
      const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1).toUpperCase()}`;

      // Create color entry
      const colorEntry = document.createElement('div');
      colorEntry.style.backgroundColor = hexColor;
      colorEntry.className = 'color-entry';
      colorEntry.dataset.index = i;
      colorEntry.addEventListener('click', () =>
        this.colorPicker.openColorPicker(i, set, this.updateColor.bind(this))
      );

      // Create hex label
      const hexLabel = document.createElement('label');
      hexLabel.textContent = hexColor;

      // Create delete button
      const deleteButton = document.createElement('span');
      deleteButton.className = 'delete-color';
      deleteButton.dataset.index = i;
      deleteButton.textContent = '×';
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering color picker
        this.delColor(Number(deleteButton.dataset.index));
        document.dispatchEvent(new CustomEvent('patternChange'));
      });

      // Append elements to container
      container.appendChild(colorEntry);
      container.appendChild(hexLabel);
      container.appendChild(deleteButton);

      colorsetElement.appendChild(container);
    }

    // Add empty slots for adding colors
    if (numColors < 8) {
      const addColorContainer = document.createElement('div');
      addColorContainer.className = 'color-box empty';
      addColorContainer.textContent = '+';
      addColorContainer.addEventListener('click', () => {
        this.addColor();
        document.dispatchEvent(new CustomEvent('patternChange'));
      });
      colorsetElement.appendChild(addColorContainer);
    }
  }

  // Helper: Update Color from Hex Input
  updateColorHex(index, hexValue) {
    const cur = this.lightshow.vortex.engine().modes().curMode();
    const set = cur.getColorset(this.targetLed);
    const color = this.hexToRGB(hexValue);
    set.set(index, new this.lightshow.vortexLib.RGBColor(color.r, color.g, color.b));
    cur.init();
    this.refreshColorset();
  }

  // Helper: Convert Hex to RGB
  hexToRGB(hex) {
    let bigint = parseInt(hex.replace(/^#/, ''), 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  }

  updateColor(index, hexValue, isDragging) {
    let hex = hexValue.replace(/^#/, '');
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

