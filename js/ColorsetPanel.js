import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';
import ColorPickerPanel from './ColorPickerPanel.js';

export default class ColorsetPanel extends Panel {
  constructor(editor) {
    const content = `
            <div id="colorset-selected-leds" class="selected-leds-bar"></div>
            <div id="colorset" class="grid-container"></div>
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


  refreshSelectedLedsBar() {
    const selectedLedsBar = document.getElementById('colorset-selected-leds');
    if (!selectedLedsBar) return;

    selectedLedsBar.innerHTML = '';

    const ledCount = this.lightshow.vortex.engine().leds().ledCount();

    // Calculate dot size dynamically
    const barWidth = selectedLedsBar.clientWidth;
    const marginPerDot = 4; // total horizontal space per dot from margin
    const desiredDotSize = 10; // base size
    const totalNeededWidth = (desiredDotSize + marginPerDot) * ledCount;

    let dotSize = desiredDotSize;
    if (totalNeededWidth > barWidth) {
      // Scale down if they don't fit
      dotSize = Math.floor((barWidth / ledCount) - marginPerDot);
      if (dotSize < 4) {
        dotSize = 4; // minimum size
      }
    }

    for (let i = 0; i < ledCount; i++) {
      const dot = document.createElement('div');
      dot.classList.add('led-dot');
      dot.style.width = `${dotSize}px`;
      dot.style.height = `${dotSize}px`;
      if (this.isMulti || this.targetLeds.includes(i)) {
        dot.classList.add('selected');
      }
      selectedLedsBar.appendChild(dot);
    }
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

    let draggingElement = null;
    let dragStartIndex = null;
    let placeholder = null;

    // Create a placeholder element for visual feedback
    function createPlaceholder() {
      placeholder = document.createElement('div');
      placeholder.className = 'color-box placeholder';
      colorsetElement.appendChild(placeholder);
    }

    // Move the placeholder to the correct position
    function updatePlaceholder(target) {
      if (!placeholder || !target) return;
      colorsetElement.insertBefore(placeholder, target);
    }

    function handlePointerDown(e) {
      const target = e.target.closest('.color-box');
      if (!target) return;

      draggingElement = target;
      dragStartIndex = parseInt(target.dataset.index, 10);
      target.classList.add('dragging');

      const rect = target.getBoundingClientRect();
      draggingElement.style.position = 'absolute';
      draggingElement.style.width = `${rect.width}px`;
      draggingElement.style.height = `${rect.height}px`;
      draggingElement.style.zIndex = 1000;
      draggingElement.style.pointerEvents = 'none';

      // Set the starting position
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      draggingElement.dataset.offsetX = offsetX;
      draggingElement.dataset.offsetY = offsetY;

      createPlaceholder();
      updatePlaceholder(draggingElement.nextSibling);

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    }

    function handlePointerMove(e) {
      if (!draggingElement) return;

      // Move the dragged element with the cursor
      const offsetX = parseFloat(draggingElement.dataset.offsetX);
      const offsetY = parseFloat(draggingElement.dataset.offsetY);
      draggingElement.style.left = `${e.clientX - offsetX}px`;
      draggingElement.style.top = `${e.clientY - offsetY}px`;

      // Find the nearest color box and update placeholder position
      const target = document.elementFromPoint(e.clientX, e.clientY + 15)?.closest('.color-box:not(.dragging)');
      if (target) updatePlaceholder(target);
    }

    function handlePointerUp() {
      if (!draggingElement || !placeholder) return;

      const dropIndex = Array.from(colorsetElement.children).indexOf(placeholder);

      if (dragStartIndex !== dropIndex && dropIndex >= 0) {
        // Swap colors using VortexLib API
        const set = cur.getColorset(this.targetLed);
        const col1 = set.get(dragStartIndex);
        const col2 = set.get(dropIndex);
        cur.getColorset(this.targetLed).swapColors(dragStartIndex, dropIndex);
        cur.init(); // Reinitialize the mode
        this.lightshow.vortex.engine().modes().saveCurMode(); // Save changes
      }

      // Cleanup
      placeholder.remove();
      placeholder = null;

      draggingElement.classList.remove('dragging');
      draggingElement.style.position = '';
      draggingElement.style.width = '';
      draggingElement.style.height = '';
      draggingElement.style.zIndex = '';
      draggingElement.style.pointerEvents = '';
      draggingElement.style.left = '';
      draggingElement.style.top = '';
      draggingElement = null;

      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);

      //this.refreshColorset(); // Refresh the UI
    }

    for (let i = 0; i < numColors; i++) {
      const container = document.createElement('div');
      container.className = 'color-box';
      container.dataset.index = i;

      const col = set.get(i);
      const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1).toUpperCase()}`;

      // Create color entry
      const colorEntry = document.createElement('div');
      colorEntry.style.backgroundColor = hexColor;
      colorEntry.className = 'color-entry';
      colorEntry.dataset.index = i;
      colorEntry.addEventListener('click', () =>
        this.editor.colorPickerPanel.open(i, set, this.updateColor.bind(this))
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

      // Attach custom drag-and-drop handlers
      container.addEventListener('pointerdown', handlePointerDown.bind(this));

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

  //async refreshColorset(fromEvent = false) {
  //  const colorsetElement = document.getElementById('colorset');
  //  const cur = this.lightshow.vortex.engine().modes().curMode();
  //  colorsetElement.innerHTML = ''; // Clear colorset

  //  if (!cur) {
  //    return;
  //  }

  //  const set = cur.getColorset(this.targetLed);
  //  const numColors = set ? set.numColors() : 0;

  //  for (let i = 0; i < numColors; i++) {
  //    const container = document.createElement('div');
  //    container.className = 'color-box';

  //    const col = set.get(i);
  //    const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1).toUpperCase()}`;

  //    // Create color entry
  //    const colorEntry = document.createElement('div');
  //    colorEntry.style.backgroundColor = hexColor;
  //    colorEntry.className = 'color-entry';
  //    colorEntry.dataset.index = i;
  //    colorEntry.addEventListener('click', () =>
  //      this.editor.colorPickerPanel.open(i, set, this.updateColor.bind(this))
  //    );

  //    // Create hex label
  //    const hexLabel = document.createElement('label');
  //    hexLabel.textContent = hexColor;

  //    // Create delete button
  //    const deleteButton = document.createElement('span');
  //    deleteButton.className = 'delete-color';
  //    deleteButton.dataset.index = i;
  //    deleteButton.textContent = '×';
  //    deleteButton.addEventListener('click', (e) => {
  //      e.stopPropagation(); // Prevent triggering color picker
  //      this.delColor(Number(deleteButton.dataset.index));
  //      document.dispatchEvent(new CustomEvent('patternChange'));
  //    });

  //    // Append elements to container
  //    container.appendChild(colorEntry);
  //    container.appendChild(hexLabel);
  //    container.appendChild(deleteButton);

  //    colorsetElement.appendChild(container);
  //  }

  //  // Add empty slots for adding colors
  //  if (numColors < 8) {
  //    const addColorContainer = document.createElement('div');
  //    addColorContainer.className = 'color-box empty';
  //    addColorContainer.textContent = '+';
  //    addColorContainer.addEventListener('click', () => {
  //      this.addColor();
  //      document.dispatchEvent(new CustomEvent('patternChange'));
  //    });
  //    colorsetElement.appendChild(addColorContainer);
  //  }
  //}

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

