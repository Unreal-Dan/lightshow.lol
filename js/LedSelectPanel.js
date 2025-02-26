import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';

export default class LedSelectPanel extends Panel {
  constructor(editor) {
    const content = `
      <div id="ledSelectSection">
        <div id="ledControls">
          <button id="selectAllLeds" class="led-select-button" title="Select All">All</button>
          <button id="selectNoneLeds" class="led-select-button" title="Select None">None</button>
          <button id="invertLeds" class="led-select-button" title="Invert Selection">Invert</button>
          <button id="evenLeds" class="led-select-button" title="Select Even">Evens</button>
          <button id="oddLeds" class="led-select-button" title="Select Odd">Odds</button>
        </div>
      </div>
      <fieldset id="ledsFieldset">
        <div class="flex-container">
          <div id="deviceImageContainer">
            <!-- Device image and LED indicators will be dynamically added here -->
          </div>
        </div>
      </fieldset>
      <select id="ledList" class="hidden" size="8" multiple></select>
      <button id="toggleLedList" class="icon-button" title="Show/Hide Advanced">
        <i class="fa-solid fa-chevron-down"></i>
      </button>
    `;
    super('ledSelectPanel', content, editor.detectMobile() ? 'LEDs' : 'LED Selection');
    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
  }

  initialize() {
    document.getElementById('ledsFieldset').style.display = 'none';

    // Event listeners for LED list and controls
    const ledList = document.getElementById('ledList');
    ledList.addEventListener('change', () => this.handleLedSelectionChange());
    ledList.addEventListener('click', () => this.handleLedSelectionChange());

    document.getElementById('selectAllLeds').addEventListener('click', () => this.selectAllLeds());
    document.getElementById('selectNoneLeds').addEventListener('click', () => this.selectNoneLeds());
    document.getElementById('invertLeds').addEventListener('click', () => this.invertLeds());
    document.getElementById('evenLeds').addEventListener('click', () => this.evenLeds());
    document.getElementById('oddLeds').addEventListener('click', () => this.oddLeds());
    //document.getElementById('randomLeds').addEventListener('click', () => this.randomLeds());
    document.getElementById('toggleLedList').addEventListener('click', () => this.toggleLedList());

    const deviceImageContainer = document.getElementById('deviceImageContainer');
    deviceImageContainer.addEventListener('mousedown', (event) => this.onMouseDown(event));
    document.addEventListener('mousemove', (event) => this.onMouseMove(event));
    document.addEventListener('mouseup', (event) => this.onMouseUp(event));

    // Listen to pattern changes to refresh LED indicators as needed
    document.addEventListener('patternChange', () => this.updateLedIndicators());

    // hide till device connects
    this.hide();
  }

  toggleLedList() {
    const ledList = document.getElementById('ledList');
    const toggleButton = document.getElementById('toggleLedList');
    console.log("ya");

    const isHidden = ledList.classList.toggle('hidden');
    const icon = toggleButton.querySelector('i');

    if (isHidden) {
      icon.classList.remove('fa-chevron-up');
      icon.classList.add('fa-chevron-down');
    } else {
      icon.classList.remove('fa-chevron-down');
      icon.classList.add('fa-chevron-up');
    }
  }

  async toggleAltImage() {
    this.isAlt = !this.isAlt;
    await this.renderLedIndicators(this.selectedDevice);
  }

  async updateSelectedDevice(device) {
    const ledsFieldset = document.getElementById('ledsFieldset');

    if (device === 'None') {
      ledsFieldset.style.display = 'none';
      this.hide();
      return;
    }

    ledsFieldset.style.display = 'block';
    this.selectedDevice = device;
    await this.renderLedIndicators(device);
    this.show();
    this.refreshLedList();
    this.selectAllLeds();
  }

  async getLedPositions(deviceName) {
    try {
      const cacheBuster = '?v=' + new Date().getTime();
      const response = await fetch(`public/data/${deviceName.toLowerCase()}-led-positions.json${cacheBuster}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error loading LED positions for ${deviceName}:`, error);
      return { points: [], original_width: 1, original_height: 1 };
    }
  }

  async renderLedIndicators(deviceName = null) {
    const ledsFieldset = document.getElementById('ledsFieldset');
    const deviceImageContainer = document.getElementById('deviceImageContainer');
    const ledControls = document.getElementById('ledControls');

    if (!deviceName || deviceName === 'None') {
      ledsFieldset.style.display = 'none';
      this.hide();
      return;
    }

    ledsFieldset.style.display = 'block';
    ledControls.style.display = 'flex';

    // Check if an existing overlay already exists
    let overlay = deviceImageContainer.querySelector('.led-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.classList.add('led-overlay');
      deviceImageContainer.appendChild(overlay);
    } else {
      overlay.innerHTML = ''; // Clear previous LED indicators
    }

    // Check if the swap button already exists
    let swapDeviceButton = document.getElementById('swapDeviceImage');
    if (!swapDeviceButton) {
      swapDeviceButton = document.createElement('button');
      swapDeviceButton.id = 'swapDeviceImage';
      swapDeviceButton.title = 'Swap Device';
      swapDeviceButton.innerHTML = '<i class="fa-solid fa-right-left"></i>';
      deviceImageContainer.appendChild(swapDeviceButton);
    }
    swapDeviceButton.style.display = (this.selectedDevice === 'Spark') ? 'block' : 'none';
    swapDeviceButton.onclick = async () => this.toggleAltImage();

    const deviceData = await this.getLedPositions(this.isAlt ? this.editor.devices[deviceName].altLabel : deviceName);
    const deviceImageSrc = this.isAlt ? this.editor.devices[deviceName].altImage : this.editor.devices[deviceName].image;

    // Check if the existing device image needs to be replaced
    let deviceImage = deviceImageContainer.querySelector('img');
    if (!deviceImage) {
      deviceImage = document.createElement('img');
      deviceImage.style.display = 'block';
      deviceImage.style.width = '100%';
      deviceImage.style.height = 'auto';
      deviceImageContainer.appendChild(deviceImage);
    }

    deviceImage.src = deviceImageSrc + '?v=' + new Date().getTime();

    deviceImage.onload = () => {
      const scaleX = deviceImageContainer.clientWidth / deviceData.original_width;
      const scaleY = deviceImageContainer.clientHeight / deviceData.original_height;

      const selectedLeds = this.getSelectedLeds();

      deviceData.points.forEach((point, index) => {
        const ledIndicator = document.createElement('div');
        ledIndicator.classList.add('led-indicator');
        if (index in selectedLeds) {
          ledIndicator.classList.add('selected');
        }
        ledIndicator.style.left = `${point.x * scaleX}px`;
        ledIndicator.style.top = `${point.y * scaleY}px`;
        ledIndicator.dataset.ledIndex = index;

        overlay.appendChild(ledIndicator);
      });
      // Ensure indicators get their selection and highlight state immediately
      this.updateLedIndicators(selectedLeds);
    };
  }

  refreshLedList() {
    const ledList = document.getElementById('ledList');
    const ledControls = document.getElementById('ledControls');
    const deviceImageContainer = document.getElementById('deviceImageContainer');

    let selectedLeds = Array.from(ledList.selectedOptions).map(option => option.value);
    const cur = this.lightshow.vortex.engine().modes().curMode();

    if (!cur) {
      ledList.innerHTML = '';
      return;
    }

    this.clearLedList();
    this.clearLedSelections();

    if (!cur.isMultiLed()) {
      for (let pos = 0; pos < this.lightshow.vortex.numLedsInMode(); ++pos) {
        let ledName = this.lightshow.vortex.ledToString(pos) + " (" + this.lightshow.vortex.getPatternName(pos) + ")";
        const option = document.createElement('option');
        option.value = pos;
        option.textContent = ledName;
        ledList.appendChild(option);
      }
      ledControls.style.display = 'flex';
      deviceImageContainer.querySelectorAll('.led-indicator').forEach(indicator => {
        indicator.style.backgroundColor = '';
      });
      if (selectedLeds.includes("multi")) {
        this.selectAllLeds();
        selectedLeds = Array.from(ledList.selectedOptions).map(option => option.value);
      }
    } else {
      let ledName = "Multi led (" + this.lightshow.vortex.getPatternName(this.lightshow.vortex.engine().leds().ledMulti()) + ")";
      const option = document.createElement('option');
      option.value = 'multi';
      option.textContent = ledName;
      ledList.appendChild(option);
      selectedLeds = [ "multi" ];

      // Disable LED controls
      ledControls.style.display = 'none';

      // All LED indicators green
      deviceImageContainer.querySelectorAll('.led-indicator').forEach(indicator => {
        indicator.classList.add('selected');
      });
    }

    if (!selectedLeds.length && ledList.options.length > 0) {
      selectedLeds = [ "0" ];
    }

    this.applyLedSelections(selectedLeds);
  }

  clearLedList() {
    const ledList = document.getElementById('ledList');
    ledList.innerHTML = '';
  }

  clearLedSelections() {
    const ledList = document.getElementById('ledList');
    for (let option of ledList.options) {
      option.selected = false;
    }
  }

  applyLedSelections(selectedLeds) {
    const ledList = document.getElementById('ledList');
    for (let option of ledList.options) {
      option.selected = selectedLeds.includes(option.value);
    }
  }

  handleLedSelectionChange() {
    this.lightshow.targetLeds = this.getSelectedLeds();
    document.dispatchEvent(new CustomEvent('ledsChange', { detail: this.lightshow.targetLeds }));
    this.updateLedIndicators(this.lightshow.targetLeds);
  }

  getSelectedLeds() {
    const ledList = document.getElementById('ledList');
    return Array.from(ledList.selectedOptions).map(option => option.value);
  }

  updateLedIndicators(selectedLeds = null) {
    if (!selectedLeds) {
      selectedLeds = this.getSelectedLeds();
    }
    const cur = this.lightshow.vortex.engine().modes().curMode();
    const ledIndicators = document.querySelectorAll('.led-indicator');
    if (!ledIndicators) {
      return;
    }

    let minIndex = Math.min(...selectedLeds.map(Number));

    ledIndicators.forEach(indicator => {
      const index = Number(indicator.dataset.ledIndex);
      if (cur && cur.isMultiLed()) {
        indicator.classList.add('selected');
      } else {
        if (selectedLeds.includes(index.toString())) {
          indicator.classList.add('selected');
          if (index === minIndex) {
            indicator.classList.add('highlighted');
          } else {
            indicator.classList.remove('highlighted');
          }
        } else {
          indicator.classList.remove('selected', 'highlighted');
        }
        indicator.style.backgroundColor = '';
      }
    });

  }

  selectAllLeds() {
    const ledList = document.getElementById('ledList');
    for (let option of ledList.options) {
      option.selected = true;
    }
    this.handleLedSelectionChange();
  }

  selectNoneLeds() {
    const ledList = document.getElementById('ledList');
    for (let option of ledList.options) {
      option.selected = false;
    }
    this.handleLedSelectionChange();
  }

  invertLeds() {
    const ledList = document.getElementById('ledList');
    for (let option of ledList.options) {
      option.selected = !option.selected;
    }
    this.handleLedSelectionChange();
  }

  evenLeds() {
    const ledList = document.getElementById('ledList');
    for (let i = 0; i < ledList.options.length; i++) {
      ledList.options[i].selected = (i % 2 === 0);
    }
    this.handleLedSelectionChange();
  }

  oddLeds() {
    const ledList = document.getElementById('ledList');
    for (let i = 0; i < ledList.options.length; i++) {
      ledList.options[i].selected = (i % 2 !== 0);
    }
    this.handleLedSelectionChange();
  }

  randomLeds(probability = 0.5) {
    const ledList = document.getElementById('ledList');
    for (let option of ledList.options) {
      option.selected = Math.random() < probability;
    }
    this.handleLedSelectionChange();
  }

  // Mouse handling for LED selection box
  onMouseDown(event) {
    if (event.button !== 0) return; // left mouse
    event.preventDefault();

    this.isDragging = true;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.currentX = event.clientX;
    this.currentY = event.clientY;
    this.dragStartTime = Date.now();

    this.selectionBox = document.createElement('div');
    this.selectionBox.classList.add('selection-box');
    document.body.appendChild(this.selectionBox);

    this.selectionBox.style.left = `${this.startX}px`;
    this.selectionBox.style.top = `${this.startY}px`;
  }

  onMouseMove(event) {
    if (!this.isDragging) return;
    event.preventDefault();

    this.currentX = event.clientX;
    this.currentY = event.clientY;

    this.selectionBox.style.width = `${Math.abs(this.currentX - this.startX)}px`;
    this.selectionBox.style.height = `${Math.abs(this.currentY - this.startY)}px`;
    this.selectionBox.style.left = `${Math.min(this.currentX, this.startX)}px`;
    this.selectionBox.style.top = `${Math.min(this.currentY, this.startY)}px`;
  }

  onMouseUp(event) {
    if (event.button !== 0) return;
    event.preventDefault();

    if (!this.selectionBox) {
      this.isDragging = false;
      return;
    }

    if (this.selectionBox) {
      document.body.removeChild(this.selectionBox);
      this.selectionBox = null;
    }

    if (!this.isDragging) {
      return;
    }

    this.isDragging = false;

    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (cur && cur.isMultiLed()) {
      Notification.failure("To select LEDs switch to a single led pattern.", 3000);
      return;
    }

    const deviceImageContainer = document.getElementById('deviceImageContainer');
    const rect = deviceImageContainer.getBoundingClientRect();

    let startX = Math.min(this.startX, this.currentX) - rect.left;
    let startY = Math.min(this.startY, this.currentY) - rect.top;
    let endX = Math.max(this.startX, this.currentX) - rect.left;
    let endY = Math.max(this.startY, this.currentY) - rect.top;

    // Ensure within container
    startX = Math.max(startX, 0);
    startY = Math.max(startY, 0);
    endX = Math.min(endX, rect.width);
    endY = Math.min(endY, rect.height);

    const isClick = Math.abs(startX - endX) <= 3 && Math.abs(startY - endY) <= 3;
    const clickX = (startX + endX) / 2;
    const clickY = (startY + endY) / 2;

    document.querySelectorAll('.led-indicator').forEach(indicator => {
      const ledRect = indicator.getBoundingClientRect();
      const ledX1 = (ledRect.left - rect.left) + 1;
      const ledY1 = (ledRect.top - rect.top) + 1;
      const ledX2 = (ledRect.right - rect.left) - 1;
      const ledY2 = (ledRect.bottom - rect.top) - 1;
      const ledMidX = ledX1 + (ledRect.width / 2);
      const ledMidY = ledY1 + (ledRect.height / 2);

      const ledList = document.getElementById('ledList');
      let option = ledList.querySelector(`option[value='${indicator.dataset.ledIndex}']`);

      let withinBounds = false;

      if (isClick) {
        withinBounds = clickX >= ledX1 && clickX <= ledX2 && clickY >= ledY1 && clickY <= ledY2;
      } else {
        withinBounds =
          (ledX1 >= startX && ledX1 <= endX && ledY1 >= startY && ledY1 <= endY) ||
          (ledX2 >= startX && ledX2 <= endX && ledY1 >= startY && ledY1 <= endY) ||
          (ledX1 >= startX && ledX1 <= endX && ledY2 >= startY && ledY2 <= endY) ||
          (ledX2 >= startX && ledX2 <= endX && ledY2 >= startY && ledY2 <= endY) ||
          (ledMidX >= startX && ledMidX <= endX && ledMidY >= startY && ledMidY <= endY);
      }

      if (withinBounds) {
        this.selectLed(indicator.dataset.ledIndex, !event.ctrlKey);
        option.selected = !event.ctrlKey;
        if (option.selected) {
          indicator.classList.add('selected');
        } else {
          indicator.classList.remove('selected');
        }
      } else if (!event.shiftKey && !event.ctrlKey) {
        this.selectLed(indicator.dataset.ledIndex, false);
        if (option) option.selected = false;
        indicator.classList.remove('selected');
      }
    });

    this.handleLedSelectionChange();
  }

  selectLed(index, selected = true) {
    const ledList = document.getElementById('ledList');
    let option = ledList.querySelector(`option[value='${index}']`);
    if (!option) return; // no adding new options
    option.selected = selected;

    this.handleLedSelectionChange();
  }
}

