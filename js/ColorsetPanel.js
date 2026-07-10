import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';
import ColorPickerPanel from './ColorPickerPanel.js';
import ContextMenu from './ContextMenu.js';
import { wikiUrl } from './wiki-url.js';

export default class ColorsetPanel extends Panel {
  constructor(editor) {
    const content = `
      <div id="colorset" class="color-row"></div>
      <hr id="colorsetDivider">
      <button id="toggleColorsetGenerator" class="icon-button" title="Show/Hide Generator">
        <i class="fa-solid fa-chevron-down"></i>
      </button>
      <div id="colorsetGenerator" class="hidden">
        <div class="gen-row">
          <div class="gen-half">
            <input type="range" id="genNumColors" class="control-slider" min="1" max="8" value="8">
            <input type="number" id="genNumColorsInput" class="control-input" value="8" min="1" max="8">
          </div>
          <div class="gen-half">
            <span class="gen-label" style="min-width:auto;">Style</span>
            <select id="genStyle" class="gen-select">
              <option value="rainbow">Rainbow</option>
              <option value="random">Random</option>
              <option value="pastel">Pastel</option>
              <option value="dark">Dark</option>
              <option value="grayscale">Grayscale</option>
              <option value="vibrant">Vibrant</option>
              <option value="warm">Warm</option>
              <option value="cool">Cool</option>
            </select>
          </div>
        </div>
        <div class="gen-row">
          <span class="gen-label">Brightness</span>
          <div class="control-slider-container">
            <input type="range" id="genBrightness" class="control-slider" min="10" max="100" value="100">
          </div>
          <input type="number" id="genBrightnessInput" class="control-input" value="100" min="10" max="100">
        </div>
        <button id="generateColorsetBtn" class="gen-button">Generate</button>
      </div>
      <div id="colorPickerMountMobile" style="display: ${editor.detectMobile() ? 'block' : 'none'};"></div>
    `;
    super(editor, 'colorsetPanel', content, 'Colorset');
    this.editor = editor
    this.wikiUrl = wikiUrl('/lightshow-lol/control-panels/colorset');
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
    this.selectedColorIndex = null;
    this.isMulti = false;
  }

  initialize() {
    this.refresh();

    document.getElementById('toggleColorsetGenerator').addEventListener('click', () => this.toggleGenerator());
    document.getElementById('generateColorsetBtn').addEventListener('click', () => this.generateColorset());

    const setupSlider = (slider, input, min, max, fillParent) => {
      const range = max - min;
      const updateFill = () => { fillParent.style.setProperty('--slider-fill', `${((parseInt(slider.value, 10) - min) / range) * 100}%`); };
      const setValue = (clientX) => {
        const rect = slider.getBoundingClientRect();
        let val = Math.round(((clientX - rect.left) / rect.width) * range) + min;
        val = Math.max(min, Math.min(max, val));
        slider.value = val;
        input.value = val;
        updateFill();
      };

      let dragActive = false;
      const onDragEnd = () => {
        if (!dragActive) return;
        dragActive = false;
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
      };
      const onDragMove = (e) => {
        if (!dragActive) return;
        e.preventDefault();
        setValue(e.clientX);
      };

      slider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        setValue(e.clientX);
        dragActive = true;
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
      });

      slider.addEventListener('input', () => {
        if (dragActive) return;
        input.value = slider.value;
        updateFill();
      });

      slider.addEventListener('change', () => {
        input.value = slider.value;
        updateFill();
      });

      input.addEventListener('input', () => {
        let v = parseInt(input.value, 10);
        if (isNaN(v)) v = min;
        v = Math.max(min, Math.min(max, v));
        input.value = v;
        slider.value = v;
        updateFill();
      });

      updateFill();
    };

    setupSlider(
      document.getElementById('genNumColors'),
      document.getElementById('genNumColorsInput'),
      1, 8,
      document.getElementById('genNumColors').parentElement
    );

    setupSlider(
      document.getElementById('genBrightness'),
      document.getElementById('genBrightnessInput'),
      10, 100,
      document.getElementById('genBrightness').parentElement
    );

    document.addEventListener('modeChange', (event) => {
      console.log(`${this.panel.title} Handling: [${event.type}]`);
      this.refresh();
    });
    document.addEventListener('ledsChange', (event) => {
      console.log(`${this.panel.title} Handling: [${event.type}]`);
      const { targetLeds, mainSelectedLed } = event.detail;
      this.refresh(mainSelectedLed);
    });
  }

  toggleGenerator() {
    const panel = document.getElementById('colorsetPanel');
    const gen = document.getElementById('colorsetGenerator');
    const btn = document.getElementById('toggleColorsetGenerator');
    const icon = btn.querySelector('i');

    const previousHeight = panel.offsetHeight;
    const snappedPanels = this.getSnappedPanels();

    const isHidden = gen.classList.toggle('hidden');
    icon.classList.toggle('fa-chevron-down', isHidden);
    icon.classList.toggle('fa-chevron-up', !isHidden);

    const heightChange = panel.offsetHeight - previousHeight;
    snappedPanels.forEach((otherPanel) => {
      otherPanel.moveSnappedPanels(heightChange);
      const currentTop = parseFloat(otherPanel.panel.style.top || otherPanel.panel.getBoundingClientRect().top);
      otherPanel.panel.style.top = `${currentTop + heightChange}px`;
    });
  }

  generateColorset() {
    const numColors = parseInt(document.getElementById('genNumColors').value, 10);
    const style = document.getElementById('genStyle').value;
    const brightness = parseInt(document.getElementById('genBrightness').value, 10);
    const styles = ['rainbow', 'pastel', 'dark', 'vibrant', 'warm', 'cool', 'grayscale'];
    const actualStyle = style === 'random' ? styles[Math.floor(Math.random() * styles.length)] : style;
    this.applyPreset(actualStyle, numColors, brightness);
  }

  getTargetLeds() {
    return this.editor.ledSelectPanel.getSelectedLeds();
  }

  getMainSelectedLed() {
    return this.editor.ledSelectPanel.getMainSelectedLed();
  }

  applyPreset(preset, numColors, brightness = 100) {
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) return;

    const set = cur.getColorset(this.getMainSelectedLed());
    set.clear();

    switch (preset) {
    case 'rainbow': {
      const hueOffset = Math.random() * (360 / numColors);
      const sat = 255;
      const lig = 255;
      const offset = hueOffset + (Math.random() - 0.5) * 5;
      for (let i = 0; i < numColors; i++) {
        const hue = ((i / numColors) * 360 + offset) % 360;
        console.log(hue);
        const rgb = this.hslToRgb(hue, sat, lig);
        set.addColor(new this.lightshow.vortexLib.RGBColor(rgb.r, rgb.g, rgb.b));
      }
      break;
    }
    case 'grayscale':
      for (let i = 0; i < numColors; i++) {
        const gray = Math.floor(Math.random() * 256);
        set.addColor(new this.lightshow.vortexLib.RGBColor(gray, gray, gray));
      }
      break;
    case 'pastel':
      for (let i = 0; i < numColors; i++) {
        const c = {
          r: Math.floor(Math.random() * 128 + 127),
          g: Math.floor(Math.random() * 128 + 127),
          b: Math.floor(Math.random() * 128 + 127),
        };
        set.addColor(new this.lightshow.vortexLib.RGBColor(c.r, c.g, c.b));
      }
      break;
    case 'dark':
      for (let i = 0; i < numColors; i++) {
        const c = {
          r: Math.floor(Math.random() * 128),
          g: Math.floor(Math.random() * 128),
          b: Math.floor(Math.random() * 128),
        };
        set.addColor(new this.lightshow.vortexLib.RGBColor(c.r, c.g, c.b));
      }
      break;
    case 'vibrant':
      for (let i = 0; i < numColors; i++) {
        const c = {
          r: Math.random() < 0.5 ? Math.floor(Math.random() * 128 + 128) : Math.floor(Math.random() * 56),
          g: Math.random() < 0.5 ? Math.floor(Math.random() * 128 + 128) : Math.floor(Math.random() * 56),
          b: Math.random() < 0.5 ? Math.floor(Math.random() * 128 + 128) : Math.floor(Math.random() * 56),
        };
        set.addColor(new this.lightshow.vortexLib.RGBColor(c.r, c.g, c.b));
      }
      break;
    case 'warm':
      for (let i = 0; i < numColors; i++) {
        const c = {
          r: Math.floor(Math.random() * 128 + 128),
          g: Math.floor(Math.random() * 128),
          b: Math.floor(Math.random() * 64),
        };
        set.addColor(new this.lightshow.vortexLib.RGBColor(c.r, c.g, c.b));
      }
      break;
    case 'cool':
      for (let i = 0; i < numColors; i++) {
        const c = {
          r: Math.floor(Math.random() * 64),
          g: Math.floor(Math.random() * 128 + 64),
          b: Math.floor(Math.random() * 128 + 128),
        };
        set.addColor(new this.lightshow.vortexLib.RGBColor(c.r, c.g, c.b));
      }
      break;
    default:
      for (let i = 0; i < numColors; i++) {
        const c = this.getRandomColor();
        set.addColor(new this.lightshow.vortexLib.RGBColor(c.r, c.g, c.b));
      }
      break;
    }

    if (brightness < 100) {
      const scale = brightness / 100;
      const cols = [];
      for (let i = 0; i < set.numColors(); i++) {
        const c = set.get(i);
        cols.push(new this.lightshow.vortexLib.RGBColor(
          Math.round(c.red * scale),
          Math.round(c.green * scale),
          Math.round(c.blue * scale)
        ));
      }
      set.clear();
      cols.forEach(c => set.addColor(c));
    }

    for (let i = 0; i < this.getTargetLeds().length; ++i) {
      cur.setColorset(set, this.getTargetLeds()[i]);
    }
    cur.init();
    this.lightshow.vortex.engine().modes().saveCurMode();
    this.lightshow.vortex.addUndoBuffer();
    this.refresh();
    this.editor.demoModeOnDevice();
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

  async onDeviceSelected(deviceName) {
    // nothing yet
  }

  async onDeviceConnect(deviceName) {
    // nothing yet
  }

  async onDeviceDisconnect(deviceName) {
    // nothing yet
  }

  // Enable copy support if a color is selected
  canCopy() {
    return this.selectedColorIndex !== null;
  }

  // Enable paste support if a color is selected
  canPaste() {
    return this.selectedColorIndex !== null;
  }

  // Copy selected color to clipboard
  copy() {
    if (this.selectedColorIndex === null) return;

    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) return;

    const set = cur.getColorset(this.getMainSelectedLed());
    if (!set || this.selectedColorIndex >= set.numColors()) return;

    const col = set.get(this.selectedColorIndex);
    const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1).toUpperCase()}`;

    navigator.clipboard.writeText(hexColor).then(() => {
      Notification.success("Copied color to clipboard");
    }).catch(() => {
      Notification.failure("Failed to copy color");
    });
  }

  // Paste color from clipboard
  paste() {
    navigator.clipboard.readText().then((hexValue) => {
      this.pasteText(hexValue);
    }).catch(() => {
      Notification.failure("Failed to paste color");
    });
  }

  pasteText(data) {
    if (!data) return;
    if (!/^#?[0-9A-Fa-f]{6}$/.test(data)) {
      if (this.editor.modesPanel) {
        this.editor.modesPanel.pasteText(data);
      }
      return;
    }

    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) return;

    const set = cur.getColorset(this.getMainSelectedLed());
    if (!set || this.selectedColorIndex >= set.numColors()) return;

    const { r, g, b } = this.hexToRGB(data);
    const newColor = new this.lightshow.vortexLib.RGBColor(r, g, b);

    set.set(this.selectedColorIndex, newColor);
    this.getTargetLeds().forEach(led => cur.setColorset(set, led));

    cur.init();
    this.lightshow.vortex.engine().modes().saveCurMode();
    this.lightshow.vortex.addUndoBuffer();
    this.refresh();

    Notification.success("Pasted color successfully");
  }

  showEmptyPanel() {
    this.editor.colorPickerPanel.hide();
    const cur = this.lightshow.vortex.engine().modes().curMode();
    const emptyLabel = document.createElement('div');
    emptyLabel.id = 'colorset-empty-label';
    emptyLabel.className = 'colorset-empty-label';
    emptyLabel.textContent = cur ? 'Select Leds First' : 'Add Modes First';
    emptyLabel.style.display = 'block';
    const colorsetElement = document.getElementById('colorset');
    colorsetElement.appendChild(emptyLabel);
  }

  async refresh(sourceLed = null) {
    if (this.inDuoEditor) {
      // Skip binding colorPickerPanel directly or skip mobile mount logic
      // Maybe hide or collapse things like #colorPickerMountMobile
      const pickerMount = document.getElementById('colorPickerMountMobile');
      if (pickerMount) pickerMount.style.display = 'none';
    }

    const colorsetElement = document.getElementById('colorset');
    if (!colorsetElement) {
      return;
    }
    if (sourceLed === null) {
      sourceLed = this.editor.ledSelectPanel.getMainSelectedLed();
    }
    const cur = this.lightshow.vortex.engine().modes().curMode();
    colorsetElement.innerHTML = ''; // Clear colorset
    if (!cur || sourceLed === null) {
      this.showEmptyPanel();
      return;
    }

    const set = cur.getColorset(sourceLed);
    const numColors = set ? set.numColors() : 0;

    // Preserve selected index
    const prevSelectedIndex = this.selectedColorIndex;

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
      if (e.pointerType === 'touch') {
        e.preventDefault();
      }
      if (e.button !== 0) {
        e.preventDefault();
        return;
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
        const set = cur.getColorset(this.getMainSelectedLed());
        set.shift(dragStartIndex, dropIndex);
        cur.setColorset(set, this.getTargetLeds());
        cur.init();
        this.lightshow.vortex.engine().modes().saveCurMode();
        this.lightshow.vortex.addUndoBuffer();
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

      this.refresh();
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

        // Restore selection after refresh
        if (i === prevSelectedIndex) {
          container.classList.add('selected');
        }

        // Left-click to open color picker
        //container.addEventListener('click', () => {
        //  if (!isDragging) {
        //    this.editor.colorPickerPanel.open(i, set, this.updateColor.bind(this));
        //  }
        //});

        // Replace your existing container click handler with the following:
        if (this.editor.detectMobile()) {
          container.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (!isDragging) {
              this.selectColor(i, container);
              this.editor.colorPickerPanel.open(i, set, this.updateColor.bind(this));
              // Reparent the content with a proper wrapper so CSS applies
              this.activateMobileColorPicker();
              this.setSelected();
            }
          });
        } else {
          container.addEventListener('click', () => {
            if (!isDragging) {
              this.selectColor(i, container);
              this.editor.colorPickerPanel.open(i, set, this.updateColor.bind(this));
              this.setSelected();
            }
          });
        }

        // Right-click context menu
        container.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.selectColor(i, container);
          const menu = ContextMenu.getInstance();
          menu.show(e.clientX, e.clientY, [
            {
              label: 'Copy Color',
              action: () => this.copy()
            },
            { separator: true },
            {
              label: 'Delete Color',
              danger: true,
              action: () => this.delColor(i)
            },
            { separator: true },
            {
              label: 'Paste',
              action: () => this.paste()
            },
            { separator: true },
            {
              label: 'Help',
              action: () => this.editor && this.editor.showHelpPopup(this.wikiUrl)
            }
          ]);
        });

        container.addEventListener('pointerdown', handlePointerDown);
      } else if (i === numColors) {
        container.classList.add('add-color');
        container.textContent = '+';
        container.addEventListener('click', () => {
          this.selectColor(i, container);
          this.addColor();
          this.editor.colorPickerPanel.open(i, cur.getColorset(this.getMainSelectedLed()), this.updateColor.bind(this));
        });
      } else {
        container.classList.add('empty');
      }
      colorsetElement.appendChild(container);
    }
  }

  selectColor(index, container) {
    // Remove previous selection
    document.querySelectorAll('.color-cube.selected').forEach(selected => {
      selected.classList.remove('selected');
    });

    // Mark this one as selected
    container.classList.add('selected');
    this.selectedColorIndex = index;
  }

  // Helper: Convert Hex to RGB
  hexToRGB(hex) {
    let bigint = parseInt(hex.replace(/^#/, ''), 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  }

  async updateColor(index, hexValue, isDragging) {
    let hex = hexValue ? hexValue.replace(/^#/, '') : 0;
    let bigint = parseInt(hex, 16);
    let r = (bigint >> 16) & 255;
    let g = (bigint >> 8) & 255;
    let b = bigint & 255;
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      return;
    }
    let set = cur.getColorset(this.getMainSelectedLed());
    let col = new this.lightshow.vortexLib.RGBColor(r, g, b);
    set.set(index, col);
    this.getTargetLeds().forEach(led => {
      cur.setColorset(set, led);
    });
    // re-initialize the demo mode because num colors may have changed
    cur.init();
    // save
    this.lightshow.vortex.engine().modes().saveCurMode();
    if (!isDragging) {
      this.lightshow.vortex.addUndoBuffer();
    }
    // refresh
    this.refresh();
    if (isDragging) {
      await this.editor.demoColorOnDevice(col);
    } else {
      // demo on device
      await this.editor.demoModeOnDevice();
    }
  }

  addColor() {
    this.lightshow.addColor(255, 0, 0, this.getTargetLeds(), this.getMainSelectedLed());
    this.refresh();
    // demo on device
    this.editor.demoModeOnDevice();
  }

  delColor(index) {
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      return;
    }
    let set = cur.getColorset(this.getMainSelectedLed());
    if (set.numColors() <= 0) {
      return;
    }
    set.removeColor(index);
    this.getTargetLeds().forEach(led => {
      cur.setColorset(set, led);
    });
    // re-initialize the demo mode because num colors may have changed
    cur.init();
    // save
    this.lightshow.vortex.engine().modes().saveCurMode();
    this.lightshow.vortex.addUndoBuffer();
    // refresh
    this.refresh();
    // demo on device
    this.editor.demoModeOnDevice();
  }

  activateMobileColorPicker() {
    const mount = document.getElementById('colorPickerMountMobile');
    if (!mount) return;

    const wrapper = document.createElement('div');
    wrapper.className = "color-picker-panel";
    wrapper.style.position = 'static';
    wrapper.style.width = '100%';
    wrapper.style.display = 'block';
    wrapper.style.marginTop = '10px';

    // Don't move the contentContainer — just mount a wrapper and reuse the component
    this.editor.colorPickerPanel.mount(wrapper);

    mount.innerHTML = '';
    mount.appendChild(wrapper);
  }

  getCopyOptions() {
    if (this.selectedColorIndex === null) return [];
    return [{
      label: 'Copy Color',
      action: () => this.copy()
    }];
  }

  onActive() {
    this.refresh();
  }
}

