import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';

export default class ModesPanel extends Panel {
  constructor(lightshow, vortexPort) {
    const content = `
      <div id="deviceConnectionSection">
        <div>
          <button id="connectDevice">Connect</button>
          <button id="pullFromDevice">Pull</button>
          <button id="pushToDevice">Push</button>
          <button id="transmitVL">Transmit</button>
        </div>
        <div id="deviceStatusContainer">
          <span id="statusLabel">Device Status:</span>
          <span id="deviceStatus">Idle</span>
        </div>
      </div>
      <div id="modesAndLedsSection">
        <div id="modeButtonsSection">
          <button id="addModeButton">Add Mode</button>
          <button id="shareModeButton">Share Mode</button>
          <button id="exportModeButton">Export</button>
          <button id="importModeButton">Import</button>
        </div>
        <div id="modesListScrollContainer">
          <div id="modesListContainer">
            <!-- Dynamic list of modes will be populated here -->
          </div>
        </div>
        <fieldset>
          <legend style="user-select:none;padding-top:15px;">Leds</legend>
          <div class="flex-container">
            <div id="deviceImageContainer">
              <!-- Device image and LED indicators will be dynamically added here -->
            </div>
            <select id="ledList" size="8" multiple style="display:none;"></select>
          </div>
        </fieldset>
      </div>
    `;

    super('modesPanel', content);
    this.lightshow = lightshow;
    this.vortexPort = vortexPort;
    this.shareModal = new Modal();
    this.exportModal = new Modal();
    this.importModal = new Modal();
  }

  initialize() {
    this.refreshLedList();
    this.refreshModeList();
    this.renderLedIndicators();
    this.handleLedSelectionChange();

    const addModeButton = document.getElementById('addModeButton');
    addModeButton.addEventListener('click', () => this.addMode());

    const shareModeButton = document.getElementById('shareModeButton');
    shareModeButton.addEventListener('click', () => this.shareMode());

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

  onDeviceConnect() {
    console.log("Device connected: " + this.vortexPort.name);
    const deviceLedCountMap = {
      'Gloves': 10,
      'Orbit': 28,
      'Handle': 3,
      'Duo': 2,
      'Chromadeck': 20,
      'Spark': 6
    };
    const ledCount = deviceLedCountMap[this.vortexPort.name];
    if (ledCount !== undefined) {
      this.lightshow.vortex.setLedCount(ledCount);
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
  }

  renderLedIndicators() {
    const deviceImageContainer = document.getElementById('deviceImageContainer');
    deviceImageContainer.innerHTML = '';

    const deviceImage = document.createElement('img');
    deviceImage.src = 'public/images/orbit.png'; // Update the path to your device image
    deviceImageContainer.appendChild(deviceImage);

    const ledPositions = this.getLedPositions();
    ledPositions.forEach((position, index) => {
      const ledIndicator = document.createElement('div');
      ledIndicator.classList.add('led-indicator');
      ledIndicator.style.left = position.x + 'px';
      ledIndicator.style.top = position.y + 'px';
      ledIndicator.dataset.ledIndex = index;

      // Add click event listener to toggle LED
      ledIndicator.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent other click events
        this.toggleLed(index);
      });

      deviceImageContainer.appendChild(ledIndicator);
    });
  }

  toggleLed(index) {
    console.log('LED clicked:', index);
    const ledIndicator = document.querySelector(`.led-indicator[data-led-index='${index}']`);
    if (ledIndicator) {
      ledIndicator.classList.toggle('selected');
    }

    // Update internal state
    const ledList = document.getElementById('ledList');
    let option = ledList.querySelector(`option[value='${index}']`);
    if (!option) {
      // Create option if it doesn't exist
      option = document.createElement('option');
      option.value = index;
      option.textContent = `LED ${index}`;
      ledList.appendChild(option);
    }
    option.selected = !option.selected;

    // Dispatch event to notify of LED selection change
    this.handleLedSelectionChange();
  }

  getLedPositions() {
    const ledPositions = [];

    let size = 11;

    // Quadrant 1 top
    for (let i = 0; i < 3; ++i) {
      ledPositions.push({ x: 40 + (i * size) + 67, y: 108 + (i * size) });
    }

    // Quadrant 1 edge
    ledPositions.push({
      x: ledPositions[2].x + 16,
      y: ledPositions[2].y + 16
    });

    // Quadrant 1 bottom
    for (let i = 0; i < 3; ++i) {
      ledPositions.push({ x: 140 + (i * size) + 67, y: 129 - (i * size) });
    }

    // Quadrant 2 bottom
    for (let i = 0; i < 3; ++i) {
      ledPositions.push({ x: 208 + (i * size) + 67, y: 108 + (i * size) });
    }

    // Quadrant 2 edge
    ledPositions.push({
      x: 23,
      y: 146
    });

    // Quadrant 2 top
    for (let i = 0; i < 3; ++i) {
      ledPositions.push({ x: 40 + (i * size), y: 129 - (i * size) });
    }

    // Quadrant 3 top
    for (let i = 0; i < 3; ++i) {
      ledPositions.push({ x: 62 - (i * size), y: 62 - (i * size) });
    }

    // Quadrant 3 edge
    ledPositions.push({
      x: ledPositions[16].x - 17,
      y: ledPositions[16].y - 18
    });

    // Quadrant 3 bottom
    for (let i = 0; i < 3; ++i) {
      ledPositions.push({ x: 230 - (i * size) + 67, y: 40 + (i * size) });
    }

    // Quadrant 4 bottom
    for (let i = 0; i < 3; ++i) {
      ledPositions.push({ x: 162 - (i * size) + 67, y: 62 - (i * size) });
    }

    // Quadrant 4 edge
    ledPositions.push({
      x: 145,
      y: 24
    });

    // Quadrant 4 top
    for (let i = 0; i < 3; ++i) {
      ledPositions.push({ x: 130 - (i * size), y: 40 + (i * size) });
    }
    return ledPositions;
  }

  onDeviceDisconnect() {
    console.log("Device disconnected");
    let statusMessage = document.getElementById('deviceStatus');
    statusMessage.textContent = this.vortexPort.name + ' Disconnected!';
    statusMessage.classList.remove('status-success', 'status-pending');
    statusMessage.classList.add('status-failure');
  }

  refresh(fromEvent = false) {
    this.refreshModeList(fromEvent);
    this.refreshLedList(fromEvent);
    this.updateLedIndicators(); // Ensure indicators are updated
  }

  refreshLedList(fromEvent = false) {
    const ledList = document.getElementById('ledList');
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
    }
    if (!selectedLeds.length && ledList.options.length > 0) {
      selectedLeds = [ "0" ];
    }
    this.applyLedSelections(selectedLeds);
  }

  updateLedIndicators() {
    const selectedLeds = this.getSelectedLeds();
    document.querySelectorAll('.led-indicator').forEach(indicator => {
      const index = indicator.dataset.ledIndex;
      if (selectedLeds.includes(index.toString())) {
        indicator.classList.add('selected');
      } else {
        indicator.classList.remove('selected');
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

  handleLedSelectionChange() {
    const ledList = document.getElementById('ledList');
    const selectedOptions = Array.from(ledList.selectedOptions).map(option => option.value);
    if (selectedOptions.length === 0) {
      return;
    }
    this.lightshow.targetLed = selectedOptions[0];
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

  getSelectedLeds() {
    const ledList = document.getElementById('ledList');
    return Array.from(ledList.selectedOptions).map(option => option.value);
  }

  addMode() {
    let modeCount = this.lightshow.vortex.numModes();
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
    const pat = modeData.single_pats[0] ? modeData.single_pats[0] : modeData.multi_pat;
    const base64EncodedData = btoa(JSON.stringify(pat));
    const lightshowUrl = `https://lightshow.lol/importMode?data=${base64EncodedData}`;
    this.shareModal.show({
      defaultValue: lightshowUrl,
      placeholder: 'Share URL',
      title: 'Share Mode',
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
    let pat = modeData.single_pats ? modeData.single_pats[0] : modeData.multi_pat;
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
    let curSel;
    if (addNew) {
      curSel = this.lightshow.vortex.engine().modes().curModeIndex();
      let modeCount = this.lightshow.vortex.numModes();
      if (!this.lightshow.vortex.addNewMode(true)) {
        Notification.failure("Cannot add another mode");
        return;
      }
      this.lightshow.vortex.setCurMode(modeCount, false);
    }
    const cur = this.lightshow.vortex.engine().modes().curMode();
    cur.setColorset(set, 0);
    const patID = this.lightshow.vortexLib.intToPatternID(pat.pattern_id);
    cur.setPattern(patID, 0, null, null);
    const args = new this.lightshow.vortexLib.PatternArgs();
    pat.args.forEach(arg => args.addArgs(arg));
    this.lightshow.vortex.setPatternArgs(this.lightshow.vortex.engine().leds().ledCount(), args, false);
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

