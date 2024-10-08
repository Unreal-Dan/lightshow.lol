/* ModesPanel.js */
import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';

export default class ModesPanel extends Panel {
  constructor(lightshow, vortexPort) {
    const content = `
      <div id="deviceConnectionSection" style="display:none;">
        <div id="deviceStatusContainer">
          <span id="statusLabel">Device Status:</span>
          <span id="deviceStatus">Connect a Device</span>
          <button id="hamburgerButton" class="hamburger-button">☰</button>
        </div>
        <div id="hamburgerMenu" class="hamburger-menu">
          <button id="connectDevice">Connect</button>
          <button id="pullFromDevice">Pull</button>
          <button id="pushToDevice">Push</button>
          <button id="transmitVL">Transmit</button>
        </div>
      </div>
      <div id="modesAndLedsSection">
        <div id="modeButtonsSection">
          <button id="addModeButton">Add</button>
          <button id="shareModeButton">Share</button>
          <button id="linkModeButton">Link</button>
          <button id="importModeButton">Import</button>
          <button id="exportModeButton">Export</button>
        </div>
        <div id="modesListScrollContainer">
          <div id="modesListContainer">
            <!-- Dynamic list of modes will be populated here -->
          </div>
        </div>
        <div id="deviceTypeContainer" class="custom-dropdown">
          <div id="deviceTypeSelected" class="custom-dropdown-selected">Select Device</div>
          <div id="deviceTypeOptions" class="custom-dropdown-options">
            <div class="custom-dropdown-option" data-value="Orbit" data-icon="public/images/orbit-logo-square-64.png">
              <img src="public/images/orbit-logo-square-64.png" alt="Orbit Logo">
              Orbit
            </div>
          </div>
        </div>
        <fieldset id="ledsFieldset" style="display:none;">
          <legend style="user-select:none;padding-top:15px;">Select Leds</legend>
          <div class="flex-container">
            <div id="deviceImageContainer">
              <!-- Device image and LED indicators will be dynamically added here -->
            </div>
            <div id="ledControls">
              <button id="selectAllLeds" title="Select All">All</button>
              <button id="selectNoneLeds" title="Select None">None</button>
              <button id="invertLeds" title="Invert Selection">Invert</button>
              <button id="evenLeds" title="Select Even">Evens</button>
              <button id="oddLeds" title="Select Odd">Odds</button>
              <button id="randomLeds" title="Select Random">Random</button>
            </div>
            <select id="ledList" size="8" multiple style="display:none;"></select>
          </div>
        </fieldset>
      </div>
    `;

    super('modesPanel', content);
    this.lightshow = lightshow;
    this.vortexPort = vortexPort;
    this.shareModal = new Modal('share');
    this.exportModal = new Modal('export');
    this.importModal = new Modal('import');
    // note changing this will not impact which device is shown, this just records
    // which device was selected or connected for reference later
    this.selectedDevice = 'None';
    this.devices = {
      'None': { image: 'public/images/none-logo-square-512.png', icon: 'public/images/none-logo-square-64.png', label: 'None', ledCount: 1 },
      'Orbit': { image: 'public/images/orbit.png', icon: 'public/images/orbit-logo-square-64.png', label: 'Orbit', ledCount: 28 },
      'Handle': { image: 'public/images/handle.png', icon: 'public/images/handle-logo-square-64.png', label: 'Handle', ledCount: 3 },
      'Gloves': { image: 'public/images/gloves.png', icon: 'public/images/gloves-logo-square-64.png', label: 'Gloves', ledCount: 10 },
      // TODO: uncomment these to make them available:
      //'Chromadeck': { image: 'public/images/chromadeck.png', icon: 'public/images/chromadeck-logo-square-64.png', label: 'Chromadeck', ledCount: 20 },
      //'Spark': { image: 'public/images/spark.png', icon: 'public/images/spark-logo-square-64.png', label: 'Spark', ledCount: 6 },
      //'Duo': { image: 'public/images/duo.png', icon: 'public/images/duo-logo-square-64.png', label: 'Duo', ledCount: 2 }
    };
  }

  initialize() {
    // Hide device connection section and leds fieldset initially
    document.getElementById('deviceConnectionSection').style.display = 'block';
    document.getElementById('ledsFieldset').style.display = 'none';

    const hamburgerButton = document.getElementById('hamburgerButton');
    const hamburgerMenu = document.getElementById('hamburgerMenu');

    hamburgerButton.addEventListener('click', function() {
      hamburgerMenu.style.display = (hamburgerMenu.style.display === 'block' ? 'none' : 'block');
    });

    document.addEventListener('click', function(event) {
      if (!hamburgerButton.contains(event.target) && !hamburgerMenu.contains(event.target)) {
        hamburgerMenu.style.display = 'none';
      }
    });

    const addModeButton = document.getElementById('addModeButton');
    addModeButton.addEventListener('click', () => this.addMode());

    const shareModeButton = document.getElementById('shareModeButton');
    shareModeButton.addEventListener('click', () => this.shareMode());

    const linkModeButton = document.getElementById('linkModeButton');
    linkModeButton.addEventListener('click', () => this.linkMode());

    const exportModeButton = document.getElementById('exportModeButton');
    exportModeButton.addEventListener('click', () => this.exportMode());

    const importModeButton = document.getElementById('importModeButton');
    importModeButton.addEventListener('click', () => this.importMode());

    const pushButton = document.getElementById('pushToDevice');
    pushButton.addEventListener('click', () => this.pushToDevice());

    const pullButton = document.getElementById('pullFromDevice');
    pullButton.addEventListener('click', () => this.pullFromDevice());

    const transmitButton = document.getElementById('transmitVL');
    transmitButton.addEventListener('click', () => this.transmitVL());

    document.addEventListener('patternChange', () => this.refresh(true));

    document.getElementById('connectDevice').addEventListener('click', async () => {
      let statusMessage = document.getElementById('deviceStatus');
      statusMessage.textContent = 'Device selection...';
      statusMessage.classList.add('status-pending');
      statusMessage.classList.remove('status-success', 'status-failure');

      hamburgerMenu.style.display = 'none';

      try {
        await this.vortexPort.requestDevice(deviceEvent => this.deviceChange(deviceEvent));
      } catch (error) {
        statusMessage.textContent = 'Failed to connect: ' + error.message;
        statusMessage.classList.remove('status-success', 'status-pending');
        statusMessage.classList.add('status-failure');
      }
    });

    const ledList = document.getElementById('ledList');
    ledList.addEventListener('change', () => this.handleLedSelectionChange());
    ledList.addEventListener('click', () => this.handleLedSelectionChange());

    document.getElementById('selectAllLeds').addEventListener('click', () => this.selectAllLeds());
    document.getElementById('selectNoneLeds').addEventListener('click', () => this.selectNoneLeds());
    document.getElementById('invertLeds').addEventListener('click', () => this.invertLeds());
    document.getElementById('evenLeds').addEventListener('click', () => this.evenLeds());
    document.getElementById('oddLeds').addEventListener('click', () => this.oddLeds());
    document.getElementById('randomLeds').addEventListener('click', () => this.randomLeds());

    const deviceImageContainer = document.getElementById('deviceImageContainer');
    deviceImageContainer.addEventListener('mousedown', (event) => this.onMouseDown(event));
    document.addEventListener('mousemove', (event) => this.onMouseMove(event));
    document.addEventListener('mouseup', (event) => this.onMouseUp(event));

    document.addEventListener('deviceTypeChange', (event) => {
      this.renderLedIndicators(this.selectedDevice);
      this.handleLedSelectionChange();
    });

    // Initialize dropdown with icons
    this.addIconsToDropdown();
    // Add event listener for device type selection
    document.getElementById('deviceTypeOptions').addEventListener('click', (event) => {
      if (event.target && event.target.classList.contains('custom-dropdown-option')) {
        const selectedValue = event.target.getAttribute('data-value');
        this.updateSelectedDevice(selectedValue);
      }
    });

    // Add event listener for the selected device type dropdown
    document.getElementById('deviceTypeSelected').addEventListener('click', () => {
      if (event.currentTarget.classList.contains('locked')) {
        event.stopPropagation(); // Prevent further propagation of the click event
        event.preventDefault();  // Prevent the default action associated with the click event
        return;
      }
      document.getElementById('deviceTypeOptions').classList.toggle('show');
    });
    this.refreshModeList();
  }

  lockDeviceSelection(locked) {
    const deviceTypeSelected = document.getElementById('deviceTypeSelected');

    if (locked) {
      deviceTypeSelected.classList.add('locked');
    } else {
      deviceTypeSelected.classList.remove('locked');
    }
  }
 
  updateSelectedDevice(device, lock = false) {
    const deviceTypeSelected = document.getElementById('deviceTypeSelected');
    const modesListScrollContainer = document.getElementById('modesListScrollContainer');

    const deviceIcon = this.devices[device].icon;

    this.selectedDevice = device;
    document.dispatchEvent(new CustomEvent('deviceTypeChange', { detail: this.selectedDevice }));

    if (device === 'None') {
      deviceTypeSelected.innerHTML = 'Select Device';
      document.getElementById('deviceTypeOptions').classList.remove('show');
      this.lightshow.setLedCount(1); // Reset to default LED count
      modesListScrollContainer.style.height = '500px';

      // hide the spread slider
      document.getElementById('spread_div').style.display = 'block';

      // Hide the LED selection fieldset
      ledsFieldset.style.display = 'none';

      // set the lock
      this.lockDeviceSelection(lock);

      return;
    }

    // display the spread slider
    document.getElementById('spread_div').style.display = 'block';

    deviceTypeSelected.innerHTML = `
      <img src="${deviceIcon}" alt="${device} Logo">
      ${device}
    `;

    this.lightshow.setLedCount(this.devices[device].ledCount);
    if (device === 'None') {
      document.getElementById('deviceTypeOptions').classList.add('show');
      // make the modes list long again
      if (modesListScrollContainer) {
        modesListScrollContainer.style.height = '500px';
      }
      // hide led selection
      ledsFieldset.style.display = 'none';
      // all done
      return
    }
    
    // otherwise handle all other devices with shorter modes list
    if (modesListScrollContainer) {
      modesListScrollContainer.style.height = '200px';
    }
    ledsFieldset.style.display = 'block'; // Show the fieldset for other devices
    document.getElementById('deviceTypeOptions').classList.remove('show');
    this.lockDeviceSelection(lock);
    this.refreshModeList();
  }

  addIconsToDropdown() {
    const deviceTypeOptions = document.getElementById('deviceTypeOptions');
    deviceTypeOptions.innerHTML = Object.keys(this.devices).map(key => {
      const device = this.devices[key];
      return `
    <div class="custom-dropdown-option" data-value="${key}">
      <img src="${device.icon}" alt="${device.label} Logo">
      ${device.label}
    </div>
  `;
    }).join('');
  }

  showDeviceConnectionSection() {
    document.getElementById('deviceConnectionSection').style.display = 'block';
    document.getElementById('ledsFieldset').style.display = 'block';
  }

  async fetchLatestFirmwareVersions() {
    try {
      const response = await fetch('https://vortex.community/downloads/json');
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch firmware versions:', error);
      return null;
    }
  }

  async onDeviceConnect() {
    console.log("Device connected: " + this.vortexPort.name);
    const ledCount = this.devices[this.vortexPort.name].ledCount;
    if (ledCount !== undefined) {
      this.lightshow.setLedCount(ledCount);
      console.log(`Set LED count to ${ledCount} for ${this.vortexPort.name}`);
    } else {
      console.log(`Device name ${this.vortexPort.name} not recognized`);
    }
    document.dispatchEvent(new CustomEvent('deviceConnected'));
    this.refresh(true);
    let statusMessage = document.getElementById('deviceStatus');
    statusMessage.textContent = this.vortexPort.name + ' Connected!';
    statusMessage.classList.add('status-success');
    statusMessage.classList.remove('status-pending', 'status-failure');
    Notification.success("Successfully Connected " + this.vortexPort.name);

    // Fetch the latest firmware versions from vortex.community
    //const latestFirmwareVersions = await this.fetchLatestFirmwareVersions();
    const latestFirmwareVersions = await this.fetchLatestFirmwareVersions();

    const device = this.vortexPort.name.toLowerCase();
    // Compare versions
    if (latestFirmwareVersions && latestFirmwareVersions[device]) {
      const latestVersion = latestFirmwareVersions[device].firmware.version;
      const downloadUrl = latestFirmwareVersions[device].firmware.fileUrl;
      if (this.vortexPort.version !== latestVersion) {
        this.showOutdatedFirmwareNotification(device, latestVersion, downloadUrl);
      }
    }

    // Render LED indicators for the connected device
    this.renderLedIndicators(this.vortexPort.name);

    // Show the device connection section and leds fieldset
    document.getElementById('deviceConnectionSection').style.display = 'block';
    document.getElementById('ledsFieldset').style.display = 'block';

    // display the spread slider
    document.getElementById('spread_div').style.display = 'block';

    // Change the height of the #modesListScrollContainer when the device connects
    const modesListScrollContainer = document.getElementById('modesListScrollContainer');
    if (modesListScrollContainer) {
      modesListScrollContainer.style.height = '200px';
    }

    // update device selection and lock it so it can't change
    this.updateSelectedDevice(this.vortexPort.name, true);

    this.selectAllLeds();
  }

  showOutdatedFirmwareNotification(device, latestVersion, downloadUrl) {
    const content = `
      <div class="firmware-notification">
        <p class="firmware-notification-blurb">Your device is out of date, please install the latest version</p>
        <p class="firmware-notification-label"><strong>Device:</strong> ${this.vortexPort.name}</p>
        <p class="firmware-notification-label"><strong>Current Version:</strong> ${this.vortexPort.version}</p>
        <p class="firmware-notification-label"><strong>Latest Version:</strong> ${latestVersion}</p>
        <div class="firmware-buttons">
          <a href="${downloadUrl}" target="_blank" class="btn-download">Download Latest Version</a>
          <a href="https://stoneorbits.github.io/VortexEngine/upgrade_guide.html" target="_blank" class="btn-upgrade-guide">Read the Upgrade Guide</a>
        </div>
      </div>
    `;

    const modal = new Modal('outdatedFirmwareModal');
    modal.show({ title: 'Firmware Update', blurb: content });
  }

  // Add the rest of the unchanged methods here...
  onMouseDown(event) {
    if (event.button !== 0) return; // Only react to left mouse button
    event.preventDefault();

    this.isDragging = true;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.currentX = event.clientX;
    this.currentY = event.clientY;
    this.dragStartTime = Date.now(); // Record the time when dragging started

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
    if (event.button !== 0) return; // Only react to left mouse button
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
    if (this.lightshow.vortex.engine().modes().curMode().isMultiLed()) {
      Notification.failure("To select LEDs switch to a single led pattern.", 3000);
      // Prevent selection if multi-LED pattern is applied
      return;
    }

    const deviceImageContainer = document.getElementById('deviceImageContainer');
    const rect = deviceImageContainer.getBoundingClientRect();

    let startX = Math.min(this.startX, this.currentX) - rect.left;
    let startY = Math.min(this.startY, this.currentY) - rect.top;
    let endX = Math.max(this.startX, this.currentX) - rect.left;
    let endY = Math.max(this.startY, this.currentY) - rect.top;

    // Ensure values are within bounds of the container
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
        // Check if click is within the bounds of the indicator
        withinBounds = clickX >= ledX1 && clickX <= ledX2 && clickY >= ledY1 && clickY <= ledY2;
      } else {
        // Check if any part of the indicator is within the selection box
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
        option.selected = false;
        indicator.classList.remove('selected');
      }
    });

    // Manually call the handler
    this.handleLedSelectionChange();
  }

  selectLed(index, selected = true) {
    const ledList = document.getElementById('ledList');
    let option = ledList.querySelector(`option[value='${index}']`);
    if (!option) {
      // don't add it if it's not there
      return;
    }
    option.selected = selected;

    this.handleLedSelectionChange();
  }

  deviceChange(deviceEvent) {
    if (deviceEvent === 'waiting') {
      this.onDeviceWaiting();
    } else if (deviceEvent === 'connect') {
      this.onDeviceConnect();
    } else if (deviceEvent === 'disconnect') {
      this.onDeviceDisconnect();
    }
  }

  onDeviceWaiting() {
    let statusMessage = document.getElementById('deviceStatus');
    statusMessage.textContent = 'Waiting for device...';
    statusMessage.classList.add('status-pending');
    statusMessage.classList.remove('status-success', 'status-failure');
  }

  toggleLed(index) {
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (cur.isMultiLed()) return; // Prevent toggling if multi-LED pattern is applied

    const ledIndicator = document.querySelector(`.led-indicator[data-led-index='${index}']`);
    if (ledIndicator) {
      ledIndicator.classList.toggle('selected');
    }

    // Update internal state without triggering change event
    const ledList = document.getElementById('ledList');
    const option = ledList.querySelector(`option[value='${index}']`);
    if (!option) {
      // Create option if it doesn't exist
      const newOption = document.createElement('option');
      newOption.value = index;
      newOption.textContent = `LED ${index}`;
      ledList.appendChild(newOption);
      newOption.selected = true;
    } else {
      option.selected = !option.selected;
    }

    // Directly call the handler to avoid cyclic event loop
    this.handleLedSelectionChange();
  }

  getLedPositions(deviceName = 'Orbit') {
    // Add logic to return LED positions based on the device name
    const ledPositions = [];

    // Example logic for different devices
    if (deviceName === 'Orbit') {
      return this.getLedPositionsOrbit();
    } else if (deviceName === 'Gloves') {
      return this.getLedPositionsGlove();
    } else if (deviceName === 'Handle') {
      return this.getLedPositionsHandle();
    } else if (deviceName === 'Duo') {
      return this.getLedPositionsDuo();
    } else if (deviceName === 'Chromadeck') {
      return this.getLedPositionsChromadeck();
    } else if (deviceName === 'Spark') {
      return this.getLedPositionsSpark();
    }
    return ledPositions;
  }

  getLedPositionsHandle() {
    const ledPositions = [
      { x: 100, y: 125 }, // front
      { x: 100, y: 160 }, // tip
      { x: 233, y: 125 }, // back
    ];
    return ledPositions;

  }

  getLedPositionsGlove() {
    const ledPositions = [
      { x: 246, y: 45 }, // pinkie tip
      { x: 246, y: 60 }, // pinkie top
      { x: 207, y: 20 }, // ring tip
      { x: 207, y: 35 }, // ring top
      { x: 168, y: 9 },  // middle tip
      { x: 168, y: 24 }, // middle top
      { x: 128, y: 20 }, // index tip
      { x: 128, y: 35 }, // index top
      { x: 89, y: 86 },  // thumb tip
      { x: 89, y: 101 }, // thumb top
    ];
    return ledPositions;
  }

  getLedPositionsOrbit() {
    const ledPositions = [];
    let size = 11;
    // Quadrant 1 top
    for (let i = 0; i < 3; ++i) ledPositions.push({ x: 40 + (i * size) + 67, y: 108 + (i * size) });
    // Quadrant 1 edge
    ledPositions.push({ x: ledPositions[2].x + 16, y: ledPositions[2].y + 16 });
    // Quadrant 1 bottom
    for (let i = 0; i < 3; ++i) ledPositions.push({ x: 140 + (i * size) + 67, y: 129 - (i * size) });
    // Quadrant 2 bottom
    for (let i = 0; i < 3; ++i) ledPositions.push({ x: 208 + (i * size) + 67, y: 108 + (i * size) });
    // Quadrant 2 edge
    ledPositions.push({ x: 23, y: 146 });
    // Quadrant 2 top
    for (let i = 0; i < 3; ++i) ledPositions.push({ x: 40 + (i * size), y: 129 - (i * size) });
    // Quadrant 3 top
    for (let i = 0; i < 3; ++i) ledPositions.push({ x: 62 - (i * size), y: 62 - (i * size) });
    // Quadrant 3 edge
    ledPositions.push({ x: ledPositions[16].x - 17, y: ledPositions[16].y - 18 });
    // Quadrant 3 bottom
    for (let i = 0; i < 3; ++i) ledPositions.push({ x: 297 - (i * size), y: 40 + (i * size) });
    // Quadrant 4 bottom
    for (let i = 0; i < 3; ++i) ledPositions.push({ x: 162 - (i * size) + 67, y: 62 - (i * size) });
    // Quadrant 4 edge
    ledPositions.push({ x: 145, y: 24 });
    // Quadrant 4 top
    for (let i = 0; i < 3; ++i) ledPositions.push({ x: 130 - (i * size), y: 40 + (i * size) });
    return ledPositions;
  }

  getLedPositionsChromadeck() {
    const ledPositions = [
        // lol poor mans scaling
        {x: 250 * (334 / 500), y: 11  * (333 / 500)}, // Outer Ring 12 Oclock
        {x: 318 * (334 / 500), y: 32  * (333 / 500)}, // Outer Ring 1 Oclock
        {x: 360 * (334 / 500), y: 90  * (333 / 500)}, // Outer Ring 2 Oclock
        {x: 360 * (334 / 500), y: 162 * (333 / 500) }, // Outer Ring 4 Oclock
        {x: 318 * (334 / 500), y: 219 * (333 / 500) }, // Outer Ring 5 Oclock
        {x: 250 * (334 / 500), y: 241 * (333 / 500) }, // Outer Ring 6 Oclock
        {x: 183 * (334 / 500), y: 219 * (333 / 500) }, // Outer Ring 7 Oclock
        {x: 141 * (334 / 500), y: 161 * (333 / 500) }, // Outer Ring 8 Oclock
        {x: 141 * (334 / 500), y: 90  * (333 / 500) }, // Outer Ring 10 Oclock
        {x: 183 * (334 / 500), y: 33  * (333 / 500) }, // Outer Ring 11 Oclock
        {x: 250 * (334 / 500), y: 44  * (333 / 500) }, // Inner Ring 12 Oclock
        {x: 298 * (334 / 500), y: 60  * (333 / 500) }, // Inner Ring 1 Oclock
        {x: 328 * (334 / 500), y: 100 * (333 / 500) }, // Inner Ring 2 Oclock
        {x: 328 * (334 / 500), y: 150 * (333 / 500) }, // Inner Ring 4 Oclock
        {x: 298 * (334 / 500), y: 192 * (333 / 500) }, // Inner Ring 5 Oclock
        {x: 250 * (334 / 500), y: 206 * (333 / 500) }, // Inner Ring 6 Oclock
        {x: 203 * (334 / 500), y: 191 * (333 / 500) }, // Inner Ring 7 Oclock
        {x: 173 * (334 / 500), y: 151 * (333 / 500) }, // Inner Ring 8 Oclock
        {x: 173 * (334 / 500), y: 100 * (333 / 500) }, // Inner Ring 10 Oclock
        {x: 203 * (334 / 500), y: 60  * (333 / 500) }, // Inner Ring 11 Oclock
    ];
    return ledPositions;
  }

  getLedPositionsSpark() {
    const ledPositions = [
        // lol poor mans scaling
        {x: 300 * (334 / 500), y: 40  * (333 / 500)}, // 1 oclock
        {x: 350 * (334 / 500), y: 125  * (333 / 500)}, // 3 oclock
        {x: 300 * (334 / 500), y: 212  * (333 / 500)}, // 5 oclock
        {x: 200 * (334 / 500), y: 212  * (333 / 500)}, // 7 oclock
        {x: 150 * (334 / 500), y: 125  * (333 / 500)}, // 9 oclock
        {x: 200 * (334 / 500), y: 40  * (333 / 500)}, // 11 oclock
    ];
    return ledPositions;
  }

  getLedPositionsDuo() {
    const ledPositions = [
        // lol poor mans scaling
        {x: 250 * (334 / 500), y: 25  * (333 / 500)}, // tip led
        {x: 250 * (334 / 500), y: 140  * (333 / 500)}, // top led
    ];
    return ledPositions;
  }

  onDeviceDisconnect() {
    console.log("Device disconnected");
    let statusMessage = document.getElementById('deviceStatus');
    statusMessage.textContent = this.vortexPort.name + ' Disconnected!';
    statusMessage.classList.remove('status-success', 'status-pending');
    statusMessage.classList.add('status-failure');
    this.lockDeviceSelection(false);
  }

  refresh(fromEvent = false) {
    this.refreshModeList(fromEvent);
    this.refreshLedList(fromEvent);
    this.updateLedIndicators(); // Ensure indicators are updated
  }

  refreshLedList(fromEvent = false) {
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
        indicator.style.backgroundColor = ''; // Reset to default
      });
      if (selectedLeds.includes("multi")) {
        this.selectAllLeds();
        selectedLeds = Array.from(ledList.selectedOptions).map(option => option.value);
      }
    } else {
      // If multi-LED pattern is applied
      let ledName = "Multi led (" + this.lightshow.vortex.getPatternName(this.lightshow.vortex.engine().leds().ledMulti()) + ")";
      const option = document.createElement('option');
      option.value = 'multi';
      option.textContent = ledName;
      ledList.appendChild(option);
      selectedLeds = [ "multi" ];

      // Disable LED controls
      ledControls.style.display = 'none';

      // Set all LED indicators to green
      deviceImageContainer.querySelectorAll('.led-indicator').forEach(indicator => {
        indicator.classList.add('selected');
      });
    }
    if (!selectedLeds.length && ledList.options.length > 0) {
      selectedLeds = [ "0" ];
    }
    this.applyLedSelections(selectedLeds);
  }

  renderLedIndicators(deviceName = null) {
    const ledsFieldset = document.getElementById('ledsFieldset');
    const deviceImageContainer = document.getElementById('deviceImageContainer');
    const ledList = document.getElementById('ledList');
    const ledControls = document.getElementById('ledControls');

    if (!deviceName || deviceName === 'None') {
      ledsFieldset.style.display = 'none'; // Hide the entire fieldset
      return;
    }

    ledsFieldset.style.display = 'block'; // Show the fieldset
    deviceImageContainer.innerHTML = ''; // Clear any existing content
    ledList.style.display = 'block'; // Show the LED list
    ledControls.style.display = 'flex'; // Show the LED controls

    const deviceImageSrc = this.devices[deviceName].image;
    if (deviceImageSrc) {
      const deviceImage = document.createElement('img');
      deviceImage.src = deviceImageSrc;
      deviceImageContainer.appendChild(deviceImage);
    }

    const ledPositions = this.getLedPositions(deviceName);
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      return;
    }
    const isMultiLed = cur.isMultiLed(); // Check if the current mode uses a multi-LED pattern

    ledPositions.forEach((position, index) => {
      const ledIndicator = document.createElement('div');
      ledIndicator.classList.add('led-indicator');
      ledIndicator.style.left = position.x + 'px';
      ledIndicator.style.top = position.y + 'px';
      ledIndicator.dataset.ledIndex = index;

      if (isMultiLed) {
        ledIndicator.classList.add('selected');
      }

      deviceImageContainer.appendChild(ledIndicator);
    });

    // Disable LED controls if multi-LED pattern is applied
    if (isMultiLed) {
      ledControls.style.display = 'none';
    } else {
      ledControls.style.display = 'flex';
    }
  }

  updateLedIndicators() {
    const selectedLeds = this.getSelectedLeds();
    const cur = this.lightshow.vortex.engine().modes().curMode();

    document.querySelectorAll('.led-indicator').forEach(indicator => {
      const index = indicator.dataset.ledIndex;
      if (cur.isMultiLed()) {
        indicator.classList.add('selected');
      } else {
        if (selectedLeds.includes(index.toString())) {
          indicator.classList.add('selected');
        } else {
          indicator.classList.remove('selected');
        }
        indicator.style.backgroundColor = ''; // Reset to default if not multi-LED
      }
    });
  }

  refreshPatternControlPanel() {
    document.dispatchEvent(new CustomEvent('modeChange', { detail: this.getSelectedLeds() }));
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

  selectAllLeds() {
    const ledList = document.getElementById('ledList');
    for (let option of ledList.options) {
      option.selected = true;
    }
    this.handleLedSelectionChange();
  }

  applyLedSelections(selectedLeds) {
    const ledList = document.getElementById('ledList');
    for (let option of ledList.options) {
      if (selectedLeds.includes(option.value)) {
        option.selected = true;
      } else {
        option.selected = false;
      }
    }
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

  handleLedSelectionChange() {
    const selectedOptions = this.getSelectedLeds();
    this.lightshow.targetLeds = selectedOptions;
    document.dispatchEvent(new CustomEvent('ledsChange', { detail: selectedOptions }));
    this.updateLedIndicators();
  }

  clearModeList() {
    const modesListContainer = document.getElementById('modesListContainer');
    modesListContainer.innerHTML = '';
  }

  refreshModeList(fromEvent = false) {
    const modesListContainer = document.getElementById('modesListContainer');
    this.clearModeList();
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      return;
    }
    let curSel = this.lightshow.vortex.engine().modes().curModeIndex();
    this.lightshow.vortex.setCurMode(0, false);
    for (let i = 0; i < this.lightshow.vortex.numModes(); ++i) {
      let isSelected = (i == curSel);
      const modeDiv = document.createElement('div');
      modeDiv.className = 'mode-entry';
      modeDiv.setAttribute('mode-index', i);
      if (isSelected) {
        modeDiv.classList.add('selected');
      }
      modeDiv.innerHTML = `
        <span class="mode-name">Mode ${i} - ${this.lightshow.vortex.getModeName()}</span>
        <button class="delete-mode-btn">&times;</button>
      `;
      modesListContainer.appendChild(modeDiv);
      this.lightshow.vortex.nextMode(false);
    }
    this.lightshow.vortex.setCurMode(curSel, false);
    this.attachModeEventListeners();
    this.refreshLedList();
  }

  attachModeEventListeners() {
    const modesListContainer = document.getElementById('modesListContainer');

    modesListContainer.querySelectorAll('.mode-entry').forEach(modeEntry => {
      modeEntry.addEventListener('mousedown', event => {
        const modeElement = event.target.closest('.mode-entry');
        modeElement.classList.add('pressed');
      });

      modeEntry.addEventListener('mouseup', event => {
        const modeElement = event.target.closest('.mode-entry');
        modeElement.classList.remove('pressed');
      });
      modeEntry.addEventListener('click', event => {
        const modeElement = event.target.closest('.mode-entry');
        const index = modeElement.getAttribute('mode-index');
        this.selectMode(index);

        document.querySelectorAll('.mode-entry.selected').forEach(selected => {
          selected.classList.remove('selected');
        });

        modeElement.classList.add('selected');

        modeElement.classList.add('click-animation');
        setTimeout(() => {
          modeElement.classList.remove('click-animation');
        }, 100);
      });
    });

    modesListContainer.querySelectorAll('.delete-mode-btn').forEach(deleteBtn => {
      deleteBtn.addEventListener('click', event => {
        event.stopPropagation();
        const index = event.currentTarget.closest('.mode-entry').getAttribute('mode-index');
        this.deleteMode(index);
      });
    });
  }

  getLedList() {
    const ledList = document.getElementById('ledList');
    return Array.from(ledList.options).map(option => option.value);
  }

  getSelectedLeds() {
    const ledList = document.getElementById('ledList');
    return Array.from(ledList.selectedOptions).map(option => option.value);
  }

  addMode() {
    let modeCount = this.lightshow.vortex.numModes();
    switch (this.selectedDevice) {
    case 'Orbit':
    case 'Handle':
    case 'Gloves':
      if (modeCount >= 14) {
        Notification.failure("This device can only hold 14 modes");
        return;
      }
      break;
    default:
      break;
    }
    if (!this.lightshow.vortex.addNewMode(true)) {
      Notification.failure("Cannot add another mode");
      return;
    }
    this.refreshModeList();
    this.refreshLedList();
    this.refreshPatternControlPanel();
    Notification.success("Successfully Added Mode " + modeCount);
  }

  shareMode() {
    if (!this.lightshow.vortex.engine().modes().curMode()) {
      Notification.failure("Must select a mode to share");
      return;
    }

    const modeJson = this.lightshow.vortex.printModeJson(false);
    const modeData = JSON.parse(modeJson);
    const base64EncodedData = btoa(JSON.stringify(modeData));

    // Construct the URL with the mode data
    const shareUrl = `https://vortex.community/upload/json?data=${encodeURIComponent(base64EncodedData)}`;

    // Open the URL in a new tab
    window.open(shareUrl, '_blank');
  }

  linkMode() {
    if (!this.lightshow.vortex.engine().modes().curMode()) {
      Notification.failure("Must select a mode to share");
      return;
    }
    const modeJson = this.lightshow.vortex.printModeJson(false);
    const modeData = JSON.parse(modeJson);
    const pat = modeData.single_pats[0] ? modeData.single_pats[0] : modeData.multi_pat;
    const base64EncodedData = btoa(JSON.stringify(pat));
    const lightshowUrl = `https://lightshow.lol/importMode?data=${base64EncodedData}`;
    this.shareModal.show({
      defaultValue: lightshowUrl,
      placeholder: 'Link URL',
      title: 'Link Mode',
    });
    this.shareModal.selectAndCopyText();
    Notification.success("Copied mode URL to clipboard");
  }

  exportMode() {
    if (!this.lightshow.vortex.engine().modes().curMode()) {
      Notification.failure("Must select a mode to export");
      return;
    }
    const modeJson = this.lightshow.vortex.printModeJson(false);
    this.exportModal.show({
      buttons: [],
      defaultValue: modeJson,
      title: 'Export Current Mode',
    });
    this.exportModal.selectAndCopyText();
    Notification.success("Copied JSON mode to clipboard");
  }

  importMode() {
    this.importModal.show({
      placeholder: 'Paste a JSON mode',
      title: 'Import New Mode',
      onInput: (event) => {
        this.importModeFromData(event.target.value);
      }
    });
    this.importModal.selectText();
  }

  importPatternFromData(patternJson) {
    if (!patternJson) {
      Notification.failure("No pattern data");
      return;
    }
    let patternData;
    try {
      patternData = JSON.parse(patternJson);
    } catch (error) {
      Notification.failure("Invalid JSON pattern");
      return;
    }
    if (!patternData) {
      Notification.failure("Invalid pattern data");
      return;
    }
    if ('num_leds' in patternData) {
      let initialDevice = null;
      switch (patternData.num_leds) {
        case 28:
          this.lightshow.setLedCount(28);
          initialDevice = 'Orbit';
          break;
        case 3:
          this.lightshow.setLedCount(3);
          initialDevice = 'Handle';
          break;
        case 10:
          this.lightshow.setLedCount(10);
          initialDevice = 'Gloves';
          break;
        case 20:
          this.lightshow.setLedCount(20);
          initialDevice = 'Chromadeck';
          break;
        case 6:
          this.lightshow.setLedCount(6);
          initialDevice = 'Spark';
          break;
        case 2:
          this.lightshow.setLedCount(2);
          initialDevice = 'Duo';
          break;
        default:
          // technically this doesn't really need to be done, the engine starts at 1
          this.lightshow.setLedCount(1);
          break;
      }
      this.refreshLedList();
      this.refreshModeList();
      this.renderLedIndicators(initialDevice);
      this.handleLedSelectionChange();
      // Change the height of the #modesListScrollContainer when the device connects
      const modesListScrollContainer = document.getElementById('modesListScrollContainer');
      if (modesListScrollContainer) {
        modesListScrollContainer.style.height = '200px';
      }
      return this.importModeFromData(patternJson, false);
    }

    let curSel;
    const cur = this.lightshow.vortex.engine().modes().curMode();

    if (!patternData.colorset) {
      Notification.failure("Invalid pattern data");
      return;
    }

    const set = new this.lightshow.vortexLib.Colorset();
    patternData.colorset.forEach(hexCode => {
      const normalizedHex = hexCode.replace('0x', '#');
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalizedHex);
      if (result) {
        set.addColor(new this.lightshow.vortexLib.RGBColor(
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16)
        ));
      }
    });

    cur.setColorset(set, 0); // Assuming the pattern data is for the first pattern slot
    const patID = this.lightshow.vortexLib.intToPatternID(patternData.pattern_id);
    cur.setPattern(patID, 0, null, null);
    const args = new this.lightshow.vortexLib.PatternArgs();
    patternData.args.forEach(arg => args.addArgs(arg));
    this.lightshow.vortex.setPatternArgs(this.lightshow.vortex.engine().leds().ledCount(), args, 0);

    cur.init();
    this.lightshow.vortex.engine().modes().saveCurMode();

    this.refreshPatternControlPanel();
    this.refresh();
    Notification.success("Successfully imported pattern");
  }

  importModeFromData(modeJson, addNew = true) {
    if (!modeJson) {
      Notification.failure("No mode data");
      return;
    }
    let modeData;
    try {
      modeData = JSON.parse(modeJson);
    } catch (error) {
      Notification.failure("Invalid JSON mode");
      return;
    }
    if (!modeData) {
      Notification.failure("Invalid mode data");
      return;
    }

    const patterns = modeData.single_pats ? modeData.single_pats : [modeData.multi_pat];
    if (!patterns) {
      console.log("Patterns empty!");
      return;
    }
    let curSel;
    if (addNew) {
      curSel = this.lightshow.vortex.engine().modes().curModeIndex();
      let modeCount = this.lightshow.vortex.numModes();
      switch (this.selectedDevice) {
      case 'Orbit':
      case 'Handle':
      case 'Gloves':
        if (modeCount >= 14) {
          Notification.failure("This device can only hold 14 modes");
          return;
        }
        break;
      default:
        break;
      }
      if (!this.lightshow.vortex.addNewMode(true)) {
        Notification.failure("Cannot add another mode");
        return;
      }
      this.lightshow.vortex.setCurMode(modeCount, false);
    }

    let cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      console.log("cur empty!");
      return;
    }
    // TODO: investigate this, if all modes are deleted then the first mode added back
    //       seems to need initialization... If we don't init here it seems to crash
    //       actually might have been the fetching of cur once for all operations
    cur.init();

    patterns.forEach((pat, index) => {
      if (!pat.colorset) {
        Notification.failure("Invalid pattern data");
        return;
      }

      const set = new this.lightshow.vortexLib.Colorset();
      pat.colorset.forEach(hexCode => {
        const normalizedHex = hexCode.replace('0x', '#');
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalizedHex);
        if (result) {
          set.addColor(new this.lightshow.vortexLib.RGBColor(
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
          ));
        }
      });

      const patID = this.lightshow.vortexLib.intToPatternID(pat.pattern_id);
      const args = new this.lightshow.vortexLib.PatternArgs();
      pat.args.forEach(arg => args.addArgs(arg));
      // TODO: Have to fetch cur each time some reason... Use after free I guess
      cur = this.lightshow.vortex.engine().modes().curMode();
      cur.setPattern(patID, index, args, set);
      this.lightshow.vortex.setPatternArgs(index, args, true);
    });

    // TODO: Have to fetch cur each time some reason... Use after free I guess
    cur = this.lightshow.vortex.engine().modes().curMode();
    cur.init();
    this.lightshow.vortex.engine().modes().saveCurMode();

    if (addNew) {
      this.lightshow.vortex.setCurMode(curSel, false);
    }

    this.refreshPatternControlPanel();
    this.refresh();
    Notification.success("Successfully imported mode");
  }

  deleteMode(index) {
    let cur = this.lightshow.vortex.curModeIndex();
    this.lightshow.vortex.setCurMode(index, false);
    this.lightshow.vortex.delCurMode(true);
    if (cur && cur >= index) {
      cur--;
    }
    this.lightshow.vortex.setCurMode(cur, false);
    this.lightshow.vortex.engine().modes().saveCurMode();
    this.refreshModeList();
    this.refreshLedList();
    this.refreshPatternControlPanel();
    Notification.success("Successfully Deleted Mode " + index);
  }

  selectMode(index) {
    this.lightshow.vortex.setCurMode(index, true);
    this.refreshLedList();
    this.refreshPatternControlPanel();
  }

  pushToDevice() {
    if (!this.vortexPort.isActive()) {
      Notification.failure("Please connect a device first");
      return;
    }
    this.vortexPort.pushToDevice(this.lightshow.vortexLib, this.lightshow.vortex);
    Notification.success("Successfully pushed save");
  }

  async pullFromDevice() {
    if (!this.vortexPort.isActive()) {
      Notification.failure("Please connect a device first");
      return;
    }
    await this.vortexPort.pullFromDevice(this.lightshow.vortexLib, this.lightshow.vortex);
    this.refreshModeList();
    this.refreshLedList();
    this.refreshPatternControlPanel();
    Notification.success("Successfully pulled save");
  }

  async transmitVL() {
    if (!this.vortexPort.isActive()) {
      Notification.failure("Please connect a device first");
      return;
    }
    await this.vortexPort.transmitVL(this.lightshow.vortexLib, this.lightshow.vortex);
    Notification.success("Successfully finished transmitting");
  }
}

