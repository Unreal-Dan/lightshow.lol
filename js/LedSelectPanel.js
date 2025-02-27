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
      // initialzie all the led indicators
      deviceData.points.forEach((point, index) => {
        const ledIndicator = document.createElement('div');
        ledIndicator.classList.add('led-indicator');
        ledIndicator.style.left = `${point.x * scaleX}px`;
        ledIndicator.style.top = `${point.y * scaleY}px`;
        ledIndicator.dataset.ledIndex = index;
        overlay.appendChild(ledIndicator);
      });
      // update indicators with appropriate highlights
      this.updateLedIndicators();
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
    const targetLeds = this.getSelectedLeds();
    const mainSelectedLed = this.getMainSelectedLed();
    // Default to first if unset
    document.dispatchEvent(new CustomEvent('ledsChange', { detail: { targetLeds, mainSelectedLed } }));
    this.updateLedIndicators(targetLeds, mainSelectedLed);
  }

  getSelectedLeds() {
    const ledList = document.getElementById('ledList');
    return Array.from(ledList.selectedOptions).map(option => option.value);
  }

  getMainSelectedLed() {
    return this.mainSelectedLed;
  }

  updateLedIndicators(selectedLeds = null, mainSelectedLed = null) {
    if (!selectedLeds) {
      selectedLeds = this.getSelectedLeds();
    }
    if (mainSelectedLed === null) {
      mainSelectedLed = selectedLeds.length > 0 ? selectedLeds[0] : null;
    }

    const cur = this.lightshow.vortex.engine().modes().curMode();
    const ledIndicators = document.querySelectorAll('.led-indicator');
    if (!ledIndicators) return;

    ledIndicators.forEach(indicator => {
      const index = Number(indicator.dataset.ledIndex);
      indicator.classList.remove('main-selected'); // Reset styles first

      if (cur && cur.isMultiLed()) {
        indicator.classList.add('selected');
      } else {
        if (selectedLeds.includes(index.toString())) {
          indicator.classList.add('selected');
          if (index == mainSelectedLed) {
            indicator.classList.add('main-selected');
          }
        } else {
          indicator.classList.remove('selected');
        }
      }
      indicator.style.backgroundColor = '';
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

  handleClickOnLed(indicator, event) {
    const clickedLedIndex = indicator.dataset.ledIndex;
    const isSelected = indicator.classList.contains('selected');
    const isCtrl = event.ctrlKey;
    const isShift = event.shiftKey;

    if (!isSelected) {
      if (isCtrl) {
        return; // Do nothing when clicking a red LED while holding CTRL
      } else if (isShift) {
        this.selectLed(clickedLedIndex, true, false);
        if (!this.mainSelectedLed) {
          this.setMainSelection(clickedLedIndex, false);
        }
      } else {
        this.unselectAllLeds();
        this.selectLed(clickedLedIndex, true, false);
        this.setMainSelection(clickedLedIndex, false);
      }
    } else {
      if (isCtrl) {
        this.deselectLed(clickedLedIndex);
      } else if (isShift) {
        return; // Do nothing when clicking a green LED while holding SHIFT
      } else {
        this.setMainSelection(clickedLedIndex, false);
      }
    }
  }

  handleBoxSelection(startX, startY, endX, endY, event) {
    const isCtrl = event.ctrlKey;
    const isShift = event.shiftKey;
    const deviceImageContainer = document.getElementById('deviceImageContainer');
    const rect = deviceImageContainer.getBoundingClientRect();

    let selectedIndices = [];
    let deselectedIndices = [];
    let allIndices = [];

    document.querySelectorAll('.led-indicator').forEach(indicator => {
      const ledRect = indicator.getBoundingClientRect();
      const ledX = ledRect.left - rect.left + ledRect.width / 2;
      const ledY = ledRect.top - rect.top + ledRect.height / 2;
      const ledIndex = indicator.dataset.ledIndex;

      if (ledX >= startX && ledX <= endX && ledY >= startY && ledY <= endY) {
        allIndices.push(ledIndex);
        if (indicator.classList.contains('selected')) {
          deselectedIndices.push(ledIndex);
        } else {
          selectedIndices.push(ledIndex);
        }
      }
    });

    if (isShift) {
      // Shift → Add all red indicators in the box without changing other selections
      selectedIndices.forEach(index => this.selectLed(index, true, false));
      if (!this.mainSelectedLed && selectedIndices.length > 0) {
        this.setMainSelection(Math.min(...selectedIndices), false);
      }
    } else if (isCtrl) {
      // Ctrl → Remove all green indicators from the selection
      allIndices.forEach(index => this.deselectLed(index));
    } else {
      // Default → Select all in the box (don't toggle)
      this.unselectAllLeds();
      allIndices.forEach(index => this.selectLed(index, true, false));
      if (allIndices.length > 0) {
        this.setMainSelection(Math.min(...allIndices), false);
      }
    }
  }


  unselectAllLeds() {
    document.querySelectorAll('.led-indicator.selected').forEach(indicator => {
      indicator.classList.remove('selected');
    });

    document.querySelectorAll('#ledList option').forEach(option => {
      option.selected = false;
    });

    this.mainSelectedLed = null;
    this.lightshow.targetLeds = [];
  }

  deselectLed(index) {
    const indicator = document.querySelector(`.led-indicator[data-led-index='${index}']`);
    if (indicator) {
      indicator.classList.remove('selected');
    }

    const option = document.querySelector(`#ledList option[value='${index}']`);
    if (option) {
      option.selected = false;
    }

    const selectedLeds = this.getSelectedLeds();
    if (this.mainSelectedLed === index) {
      this.setMainSelection(selectedLeds.length ? selectedLeds[0] : null, false);
    }
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

    let clickedLed = null;
    let ledIndicators = Array.from(document.querySelectorAll('.led-indicator'));

    // Determine which LED (if any) was clicked
    for (let indicator of ledIndicators) {
      const ledRect = indicator.getBoundingClientRect();
      const ledX1 = ledRect.left - rect.left;
      const ledY1 = ledRect.top - rect.top;
      const ledX2 = ledRect.right - rect.left;
      const ledY2 = ledRect.bottom - rect.top;

      if (clickX >= ledX1 && clickX <= ledX2 && clickY >= ledY1 && clickY <= ledY2) {
        clickedLed = indicator;
        break;
      }
    }

    if (isClick) {
      if (!clickedLed) {
        this.unselectAllLeds();
      } else {
        this.handleClickOnLed(clickedLed, event);
      }
    } else {
      this.handleBoxSelection(startX, startY, endX, endY, event);
    }

    this.handleLedSelectionChange();
  }

  selectLed(index, selected = true, update = true) {
    const ledList = document.getElementById('ledList');
    let option = ledList.querySelector(`option[value='${index}']`);
    if (!option) return; // no adding new options

    option.selected = selected;
    if (update) {
      this.handleLedSelectionChange();
    }
  }

  setMainSelection(ledIndex, update = true) {
    console.log("Setting main to: " +ledIndex);
    this.mainSelectedLed = ledIndex;
    document.querySelectorAll('.led-indicator').forEach(indicator => {
      indicator.classList.toggle('main-selected', indicator.dataset.ledIndex === ledIndex);
    });

    //this.lightshow.targetLeds = this.getSelectedLeds(); // Maintain the selected LEDs
    if (update) {
      this.handleLedSelectionChange(); // Trigger panel updates
    }
  }
}

