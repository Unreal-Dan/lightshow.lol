import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';

export default class ModesPanel extends Panel {
  constructor(lightshow, vortexPort) {
    const content = `
      <div id="deviceConnectionSection">
        <div>
        <button id="connectDevice">Connect Device</button>
        <button id="pullFromDevice">Pull Save</button>
        <button id="pushToDevice">Push Save</button>
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
             <select id="ledList" size="8" multiple></select>
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
    this.populateLedList();
    this.populateModeList();
    const modesListContainer = document.getElementById('modesListContainer');
    //modesListContainer.addEventListener('change', (event) => {
    //  const selectedMode = event.target.value;
    //  this.lightshow.vortex.setCurMode(selectedMode, true);
    //  this.refreshLedList();
    //  // Dispatch a custom event
    //  document.dispatchEvent(new CustomEvent('modeChange'));
    //});
    //modesListContainer.addEventListener('click', (event) => {
    //  if (event.target.classList.contains('delete-mode-btn')) {
    //    const modeIndex = event.target.getAttribute('mode-index');
    //    this.removeMode(modeIndex);
    //  }
    //});
    // Add Mode
    const addModeButton = document.getElementById('addModeButton');
    addModeButton.addEventListener('click', event => {
      this.addMode();
    });
    const shareModeButton = document.getElementById('shareModeButton');
    shareModeButton.addEventListener('click', event => {
      this.shareMode();
    });
    const exportModeButton = document.getElementById('exportModeButton');
    exportModeButton.addEventListener('click', event => {
      this.exportMode();
    });
    const importModeButton = document.getElementById('importModeButton');
    importModeButton.addEventListener('click', event => {
      this.importMode();
    });
    const pushButton = document.getElementById('pushToDevice');
    pushButton.addEventListener('click', event => {
      this.pushToDevice();
    });
    const pullButton = document.getElementById('pullFromDevice');
    pullButton.addEventListener('click', event => {
      this.pullFromDevice();
    });
    document.addEventListener('patternChange', (event) => {
      //console.log("Pattern change detected by modes panel, refreshing");
      this.refresh(true);
    });
    document.getElementById('connectDevice').addEventListener('click', async () => {
      let statusMessage = document.getElementById('deviceStatus');
      statusMessage.textContent = 'Waiting for connection...';
      statusMessage.classList.add('status-pending');
      statusMessage.classList.remove('status-success');
      statusMessage.classList.remove('status-failure');

      try {
        await this.vortexPort.requestDevice((deviceEvent) => {
          this.deviceChange(deviceEvent);
        });
        // Additional logic to handle successful connection
      } catch (error) {
        let statusMessage = document.getElementById('deviceStatus');
        statusMessage.textContent = 'Failed to connect: ' + error.message;
        statusMessage.classList.remove('status-success');
        statusMessage.classList.remove('status-pending');
        statusMessage.classList.add('status-failure');
        // Handle errors
      }
    });
    // led list changes
    const ledList = document.getElementById('ledList');
    ledList.addEventListener('change', () => {
      this.handleLedSelectionChange();
    });
  }

  deviceChange(deviceEvent) {
    if (deviceEvent === 'connect') {
      this.onDeviceConnect();
    }
    if (deviceEvent === 'disconnect') {
      this.onDeviceDisconnect();
    }
  }

  onDeviceConnect() {
    console.log("name: " + this.vortexPort.name);
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
      //this.changeLedListHeight(newHeight);
      this.lightshow.vortex.setLedCount(ledCount);
      console.log(`Set led count to ${ledCount} for ${this.vortexPort.name}`);
    } else {
      console.log(`Device name ${this.vortexPort.name} not recognized`);
    }
    document.dispatchEvent(new CustomEvent('deviceConnected'));
    this.refresh(true);
    let statusMessage = document.getElementById('deviceStatus');
    statusMessage.textContent = this.vortexPort.name + ' Connected!';
    statusMessage.classList.add('status-success');
    statusMessage.classList.remove('status-pending');
    statusMessage.classList.remove('status-failure');
    Notification.success("Successfully Connected " + this.vortexPort.name);
  }

  onDeviceDisconnect() {
    console.log("Device disconnected");
    let statusMessage = document.getElementById('deviceStatus');
    statusMessage.textContent = this.vortexPort.name + ' Disconnected!';
    statusMessage.classList.remove('status-success');
    statusMessage.classList.remove('status-pending');
    statusMessage.classList.add('status-failure');
  }

  refresh(fromEvent = false) {
    this.refreshLedList(fromEvent);
    this.refreshModeList(fromEvent);
  }

  changeLedListHeight(newHeight) {
    const ledList = document.getElementById('ledList');
    ledList.size = newHeight; // newHeight is a string like '200px', '50%', etc.
  }

  refreshLedList(fromEvent = false) {
    const ledList = document.getElementById('ledList');
    ledList.innerHTML = '';
    this.populateLedList(fromEvent);
  }

  refreshModeList(fromEvent = false) {
    const modesListContainer = document.getElementById('modesListContainer');
    modesListContainer.innerHTML = '';
    this.populateModeList(fromEvent);
  }

  refreshPatternControlPanel() {
    // dispatch an event to the control panel to change
    document.dispatchEvent(new CustomEvent('modeChange', { detail: this.getSelectedLeds() }));
  }

  clearLedSelections() {
    const ledList = document.getElementById('ledList');
    // Iterate over each option and set 'selected' to false
    for (let option of ledList.options) {
      option.selected = false;
    }
  }

  applyLedSelections(selectedLeds) {
    const ledList = document.getElementById('ledList');

    // Iterate over each option in the LED list
    for (let option of ledList.options) {
      // Check if the option's value is in the selectedLeds array
      // Set the option's selected property accordingly
      if (selectedLeds.includes(option.value)) {
        option.selected = true;
      } else {
        option.selected = false;
      }
    }
  }

  populateLedList(fromEvent = false) {
    const ledList = document.getElementById('ledList');
    const selectedLeds = Array.from(ledList.selectedOptions).map(option => option.value);
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
       return;
    }
    this.clearLedSelections();
    if (!cur.isMultiLed()) {
      //this.changeLedListHeight(this.lightshow.vortex.numLedsInMode());
      for (let pos = 0; pos < this.lightshow.vortex.numLedsInMode(); ++pos) {
        let ledName = this.lightshow.vortex.ledToString(pos) + " (" + this.lightshow.vortex.getPatternName(pos) + ")";
        const option = document.createElement('option');
        option.value = pos;
        option.textContent = ledName;
        ledList.appendChild(option);
      }
    } else {
      //this.changeLedListHeight(1);
      let ledName = "Multi led (" + this.lightshow.vortex.getPatternName(this.lightshow.vortex.engine().leds().ledMulti()) + ")";
      const option = document.createElement('option');
      option.value = 'multi';
      option.textContent = ledName;
      ledList.appendChild(option);
      // TODO: support both rendering multi and single at same time... not for now
    }
    this.applyLedSelections(selectedLeds);
    if (!selectedLeds.length && ledList.options.length > 0) {
      ledList.options[0].selected = true;
    }
  }

  handleLedSelectionChange() {
    const selectedOptions = Array.from(ledList.selectedOptions).map(option => option.value);
    // Check the number of selected options
    if (selectedOptions.length === 0) {
      // If no option is selected, reselect the last option that was selected
      selectedOptions[selectedOptions.length - 1].selected = true;
    }
    this.lightshow.targetLed = selectedOptions[0].value;
    document.dispatchEvent(new CustomEvent('ledsChange', { detail: this.getSelectedLeds() }));
  }

  populateModeList(fromEvent = false) {
    const modesListContainer = document.getElementById('modesListContainer');
    modesListContainer.innerHTML = '';
    let curSel = this.lightshow.vortex.engine().modes().curModeIndex();
    // We have to actually iterate the modes with nextmode because Vortex can't just
    // instantiate one and return it which is kinda dumb but just how it works for now
    this.lightshow.vortex.setCurMode(0, false);
    for (let i = 0; i < this.lightshow.vortex.numModes(); ++i) {
      let isSelected = (i == curSel);
      const modeDiv = document.createElement('div');
      modeDiv.className = 'mode-entry';
      modeDiv.setAttribute('mode-index', i);  // Set the mode-index attribute here
      if (isSelected) {
        modeDiv.classList.add('selected');  // Set the mode-index attribute here
      }
      modeDiv.innerHTML = `
        <span class="mode-name">Mode ${i} - ${this.lightshow.vortex.getModeName()}</span>
        <button class="delete-mode-btn">&times;</button>
      `;
      modesListContainer.appendChild(modeDiv);
      // go to next mode
      this.lightshow.vortex.nextMode(false);
    }
    this.lightshow.vortex.setCurMode(curSel, false);
    this.attachModeEventListeners();
  }

  attachModeEventListeners() {
    const modesListContainer = document.getElementById('modesListContainer');

    // click on mode
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

        // Clear previously selected mode entries
        document.querySelectorAll('.mode-entry.selected').forEach(selected => {
          selected.classList.remove('selected');
        });

        // Add 'selected' class to the clicked mode entry
        modeElement.classList.add('selected');

        // Add 'click-animation' class and then remove it after animation
        modeElement.classList.add('click-animation');
        setTimeout(() => {
          modeElement.classList.remove('click-animation');
        }, 100); // 100ms matches the CSS transition time
      });
    });

    // Delete Mode
    modesListContainer.querySelectorAll('.delete-mode-btn').forEach(deleteBtn => {
      deleteBtn.addEventListener('click', event => {
        event.stopPropagation(); // Prevent click from bubbling up to the parent element
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
    // Implement logic to add a new mode
    // ...
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
    const pat = (modeData.single_pats[0]) ? modeData.single_pats[0] : modeData.multi_pat;
    const base64EncodedData = btoa(JSON.stringify(pat));
    const lightshowUrl = `https://lightshow.lol/importMode?data=${base64EncodedData}`;
    this.shareModal.show({
      defaultValue: lightshowUrl,
      placeholder: 'Share URL',
      title: 'Share Mode',
    });
    this.shareModal.selectAndCopyText();
    Notification.success("Copied mode URL to clipboard");
    // give url text box popup?
  }

  exportMode() {
    if (!this.lightshow.vortex.engine().modes().curMode()) {
      Notification.failure("Must select a mode to export");
      return;
    }
    const modeJson = this.lightshow.vortex.printModeJson(false);
    this.exportModal.show({
      buttons: [
        //{ label: 'JSON Format', onClick: () => this.handleExportJson() },
        //{ label: 'Binary Format', onClick: () => this.handleExportBinary() }
      ],
      defaultValue: modeJson,
      title: 'Export Current Mode',
    });
    this.exportModal.selectAndCopyText();
    Notification.success("Copied JSON mode to clipboard");
  }

  handleExportJson() {

  }

  handleExportBinary() {

  }

  importMode() {
    // json text box input popup?
    this.importModal.show({
      placeholder: 'Paste a json mode',
      title: 'Import New Mode',
      onInput: (event) => {
        this.importModeFromData(event.target.value);
      }
    });
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
    }
    if (!modeData) {
      Notification.failure("Invalid mode data");
      return;
    }
    let pat;
    if (modeData.single_pats && modeData.multi_pat) {
      pat = (modeData.single_pats[0]) ? modeData.single_pats[0] : modeData.multi_pat;
    } else {
      pat = modeData;
    }
    if (!pat.colorset) {
      Notification.failure("Invalid pattern data");
      return;
    }
    var set = new this.lightshow.vortexLib.Colorset();
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
    if (addNew) {
      let curSel = this.lightshow.vortex.engine().modes().curModeIndex();
      // grab the 'preview' mode for the current mode (randomizer)
      let modeCount = this.lightshow.vortex.numModes();
      if (!this.lightshow.vortex.addNewMode(true)) {
        Notification.failure("Cannot add another mode");
        return;
      }
      this.lightshow.vortex.setCurMode(modeCount, false);
    }
    const cur = this.lightshow.vortex.engine().modes().curMode();
    // set the colorset of the demo mode
    cur.setColorset(set, 0);
    // set the pattern of the demo mode to the selected dropdown pattern on all LED positions
    // with null args and null colorset (so they are defaulted and won't change)
    let patID = this.lightshow.vortexLib.intToPatternID(pat.pattern_id);
    cur.setPattern(patID, 0, null, null);
    let args = new this.lightshow.vortexLib.PatternArgs();
    for (let i = 0; i < pat.args.length; ++i) {
      args.addArgs(pat.args[i]);
    }
    this.lightshow.vortex.setPatternArgs(this.lightshow.vortex.engine().leds().ledCount(), args, false);
    // re-initialize the demo mode so it takes the new args into consideration
    cur.init();
    this.lightshow.vortex.engine().modes().saveCurMode();
    if (addNew) {
      this.lightshow.vortex.setCurMode(curSel, false);
    }
    // refresh
    this.refreshPatternControlPanel();
    this.refresh();
    Notification.success("Successfully imported mode");
  }

  deleteMode(index) {
    // due to the way vortex engine works internally you can only delete
    // the current mode you are on, but you can very secretly and quickly
    // switch to any mode before deleting it then switching back, to give
    // the complete illusion that any mode can be deleted

    // grab current mode index we're using
    let cur = this.lightshow.vortex.curModeIndex();
    // switch to the target mode we want to delete without saving
    this.lightshow.vortex.setCurMode(index, false);
    // delete this mode (save)
    this.lightshow.vortex.delCurMode(true);
    // if this was the mode we were on, shift down one, if possible
    if (cur && cur == index) {
      cur--;
    }
    // then switch back to that mode without saving (invisible switch)
    this.lightshow.vortex.setCurMode(cur, false);
    this.lightshow.vortex.engine().modes().saveCurMode();
    this.refreshModeList();
    this.refreshLedList();
    this.refreshPatternControlPanel();
    Notification.success("Successfully Deleted Mode " + index);
  }

  selectMode(index) {
    // Implement logic to select and show details of the mode at the given index
    this.lightshow.vortex.setCurMode(index, true);
    this.refreshLedList();
    this.refreshPatternControlPanel();
  }

  pushToDevice() {
    this.vortexPort.pushToDevice(this.lightshow.vortexLib, this.lightshow.vortex);
    Notification.success("Successfully pushed save");
  }

  async pullFromDevice() {
    await this.vortexPort.pullFromDevice(this.lightshow.vortexLib, this.lightshow.vortex);
    this.refreshModeList();
    this.refreshLedList();
    this.refreshPatternControlPanel();
    Notification.success("Successfully pulled save");
  }
}
