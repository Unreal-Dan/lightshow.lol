import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';
import ColorPickerPanel from './ColorPickerPanel.js';

export default class ColorsetPanel extends Panel {
  constructor(editor) {
    //<div id="colorset-selected-leds" class="selected-leds-bar"></div>
    const content = `
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

    const createPlaceholder = () => {
      placeholder = document.createElement('div');
      placeholder.className = 'color-box placeholder';
      placeholder.style.height = `${draggingElement.offsetHeight}px`;
    };

    const updatePlaceholder = (target) => {
      if (!placeholder || !target || placeholder === target) return;
      if (target.classList.contains('empty')) return;
      colorsetElement.insertBefore(placeholder, target);
    };

    const DRAG_THRESHOLD = 5; // Adjust for better responsiveness
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const handlePointerDown = (e) => {
      const target = e.target.closest('.color-box');
      if (!target) return;

      const isDeleteButton = e.target.classList.contains('delete-color');
      if (isDeleteButton) return;

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

        createPlaceholder();
        updatePlaceholder(draggingElement.nextSibling);

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
      draggingElement.style.top = `${e.clientY - rect.top}px`;

      const children = Array.from(colorsetElement.children);
      const addColorContainer = children.find(child => child.classList.contains('empty'));

      // Ensure we do not allow the placeholder to interact with the "add color" slot
      const target = document.elementFromPoint(e.clientX, e.clientY + 30)?.closest('.color-box:not(.dragging):not(.empty)');

      if (!target) {
        const lastChild = addColorContainer
          ? children[children.indexOf(addColorContainer) - 1] // Get the last actual color slot
          : children[children.length - 1];
        const rect = lastChild.getBoundingClientRect();
        const midPoint = rect.top + (rect.height / 2);
        if (lastChild && e.clientY > midPoint) {
          colorsetElement.insertBefore(placeholder, addColorContainer || null); // Place before "add color" if it exists
          return;
        }
      }
      if (target) {
        updatePlaceholder(target);
      }
    };

    const handlePointerUp = () => {
      if (!draggingElement || !isDragging) return;

      let dropIndex = Array.from(colorsetElement.children).indexOf(placeholder);

      if (dragStartIndex !== dropIndex) {
        const set = cur.getColorset(this.targetLed);
        if (dropIndex > dragStartIndex) dropIndex -= 1;

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

    for (let i = 0; i < numColors; i++) {
      const container = document.createElement('div');
      container.className = 'color-box';
      container.dataset.index = i;

      const col = set.get(i);
      const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1).toUpperCase()}`;

      const colorEntry = document.createElement('div');
      colorEntry.style.backgroundColor = hexColor;
      colorEntry.className = 'color-entry';
      colorEntry.dataset.index = i;

      // Ensure single-click opens color picker
      colorEntry.addEventListener('click', (e) => {
        if (!isDragging) {
          this.editor.colorPickerPanel.open(i, set, this.updateColor.bind(this));
        }
      });

      const hexLabel = document.createElement('label');
      hexLabel.textContent = hexColor;

      const deleteButton = document.createElement('span');
      deleteButton.className = 'delete-color';
      deleteButton.dataset.index = i;
      deleteButton.textContent = '×';
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.delColor(Number(deleteButton.dataset.index));
        document.dispatchEvent(new CustomEvent('patternChange'));
      });

      container.addEventListener('pointerdown', handlePointerDown);

      container.appendChild(colorEntry);
      container.appendChild(hexLabel);
      container.appendChild(deleteButton);

      colorsetElement.appendChild(container);
    }

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

