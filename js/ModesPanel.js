/* ModesPanel.js */
import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';
import ChromalinkPanel from './ChromalinkPanel.js';

export default class ModesPanel extends Panel {
  constructor(editor) {
    const content = `
      <div id="modeButtonsSection">
        <button id="addModeButton" class="mode-list-btn" title="New Random Mode">
          <i class="fas fa-plus-circle"></i>
        </button>
        <button id="importModeButton" class="mode-list-btn" title="Paste JSON mode">
          <i class="fa-solid fa-paste"></i>
        </button>
        <button id="pullFromDeviceButton" class="mode-list-btn" title="Load Modes from Device" disabled>
          <i class="fa-solid fa-upload fa-flip-vertical"></i>
        </button>
        <button id="pushToDeviceButton" class="mode-list-btn" title="Save Modes to Device" disabled>
          <i class="fa-solid fa-download fa-flip-vertical"></i>
        </button>
        <button id="transmitVLButton" class="mode-list-btn" title="Transmit Mode to Duo" disabled>
          <i class="fa-solid fa-satellite-dish"></i>
        </button>
      </div>
      <div id="modesListScrollContainer">
        <div id="modesListContainer">
          <!-- Dynamic list of modes will be populated here -->
        </div>
      </div>
    `;
    super('modesPanel', content, editor.detectMobile() ? 'Modes' : 'Modes List');
    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
    this.shareModal = new Modal('share');
    this.exportModal = new Modal('export');
    this.importModal = new Modal('import');
    this.deviceSelectionModal = new Modal('device-selection');
  }

  initialize() {
    const addModeButton = document.getElementById('addModeButton');
    addModeButton.addEventListener('click', () => this.addMode());

    const importModeButton = document.getElementById('importModeButton');
    importModeButton.addEventListener('click', () => this.importMode());

    const pushButton = document.getElementById('pushToDeviceButton');
    pushButton.addEventListener('click', () => this.editor.pushToDevice());

    const pullButton = document.getElementById('pullFromDeviceButton');
    pullButton.addEventListener('click', () => this.editor.pullFromDevice());

    const transmitButton = document.getElementById('transmitVLButton');
    transmitButton.addEventListener('click', () => this.editor.transmitVL());

    document.addEventListener('patternChange', () => this.refresh(true));

    this.refreshModeList();
  }

  onDeviceConnect(deviceName) {
    // if the device has UPDI support open a chromalink window
    if (deviceName === 'Chromadeck') {
      this.show();
    }
  }

  async onDeviceDisconnect(deviceName) {
    this.hide();
  }

  async onDeviceSelected(devicename) {
    // maybe do something here
  }

  async onDeviceConnect(deviceName) {
    // Enable the 3 buttons when a device is connected
    document.getElementById('pushToDeviceButton').disabled = false;
    document.getElementById('pullFromDeviceButton').disabled = false;
    document.getElementById('transmitVLButton').disabled = false;
    document.getElementById('connectDeviceButton').disabled = true;
  }

  async onDeviceDisconnect(deviceName) {
    // Disable the 3 buttons when a device is disconnected
    document.getElementById('pushToDeviceButton').disabled = true;
    document.getElementById('pullFromDeviceButton').disabled = true;
    document.getElementById('transmitVLButton').disabled = true;
    document.getElementById('connectDeviceButton').disabled = false;
  }

  async onDeviceSelected(devicename) {
    // nothing really to do at this step
  }

  refresh(fromEvent = false) {
    this.refreshModeList(fromEvent);
  }

  refreshPatternControlPanel() {
    document.dispatchEvent(new CustomEvent('modeChange', { detail: this.editor.ledSelectPanel.getSelectedLeds() }));
  }

  clearModeList() {
    const modesListContainer = document.getElementById('modesListContainer');
    modesListContainer.innerHTML = '';
  }

  refreshModeList(fromEvent = false) {
    const modesListContainer = document.getElementById('modesListContainer');
    this.clearModeList();
    let cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      this.lightshow.vortex.setCurMode(0, false);
      cur = this.lightshow.vortex.engine().modes().curMode();
      if (!cur) {
        return;
      }
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
        <div style="display:flex">
        <div class="mode-btn-container" style="display: ${isSelected ? 'flex' : 'none'};">
          <button class="share-mode-btn mode-btn" title="Share Mode"><i class="fas fa-share-alt"></i></button>
          <button class="link-mode-btn mode-btn" title="Get Link"><i class="fas fa-link"></i></button>
          <button class="export-mode-btn mode-btn" title="Export Mode"><i class="fa-solid fa-copy"></i></button>
        </div>
        <button class="delete-mode-btn mode-btn" title="Delete Mode">&times;</button>
        </div>
      `;
      modesListContainer.appendChild(modeDiv);
      this.lightshow.vortex.nextMode(false);
    }
    this.lightshow.vortex.setCurMode(curSel, false);
    this.attachModeEventListeners();
    this.editor.ledSelectPanel.refreshLedList(fromEvent);
  }

  selectMode(index) {
    this.lightshow.vortex.setCurMode(index, true);

    // Hide buttons for all modes first
    document.querySelectorAll('.mode-btn-container').forEach(buttonContainer => {
      buttonContainer.style.display = 'none';
    });

    // Show buttons for the selected mode
    const selectedMode = document.querySelector(`.mode-entry[mode-index="${index}"] .mode-btn-container`);
    if (selectedMode) {
      selectedMode.style.display = 'flex';
    }

    this.editor.ledSelectPanel.refreshLedList();
    this.refreshPatternControlPanel();
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
      // Share Mode
      modeEntry.querySelector('.share-mode-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        this.shareMode();
      });
      // Link Mode
      modeEntry.querySelector('.link-mode-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        this.linkMode();
      });
      // Export Mode
      modeEntry.querySelector('.export-mode-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        this.exportMode();
      });
      // click select
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

  getMaxModes(device) {
    let maxModes = 16;
    switch (device) {
      case 'Orbit':
      case 'Handle':
      case 'Gloves':
        // these devices had 14
        maxModes = 14;
        break;
      case 'Duo':
        // default duo max is 9
        maxModes = 9;
        break;
      case 'Chromadeck':
      case 'Spark':
        // 16 modes
        break;
      default:
        break;
    }
    return maxModes;
  }

  addMode() {
    let modeCount = this.lightshow.vortex.numModes();
    // check the mode count against max
    const device = this.editor.devicePanel.selectedDevice;
    const maxModes = this.getMaxModes(device)
    if (modeCount >= maxModes) {
      Notification.failure(`The ${device} can only hold ${maxModes} modes`);
      return;
    }
    if (!this.lightshow.vortex.addNewMode(false)) {
      Notification.failure("Failed to add another mode");
      return;
    }
    this.refreshModeList();
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
    let shareUrl = `https://vortex.community/upload/json?data=${encodeURIComponent(base64EncodedData)}`;
    if (this.editor.isLocalServer) {
      shareUrl = `https://127.0.0.1:3000/upload/json?data=${encodeURIComponent(base64EncodedData)}`;
    }

    // Open the URL in a new tab
    window.open(shareUrl, '_blank');
  }

  linkMode() {
    if (!this.lightshow.vortex.engine().modes().curMode()) {
      Notification.failure("Must select a mode to share");
      return;
    }

    const modeJson = this.lightshow.vortex.printModeJson(false);

    // Compress with Pako (Gzip)
    const compressed = pako.deflate(modeJson, { level: 9 });

    // Convert to Base64 (URL-safe)
    let compressedBase64 = btoa(String.fromCharCode(...compressed))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
        .replace(/=+$/, ''); // Remove padding

        // Generate the link
        const lightshowUrl = `https://lightshow.lol/importMode?data=${compressedBase64}`;

        // Show the modal
        this.shareModal.show({
          defaultValue: lightshowUrl,
          placeholder: 'Link URL',
          title: 'Link Mode',
        });

    this.shareModal.selectAndCopyText();
    Notification.success("Copied mode URL to clipboard");
  }

  importModeFromLink(data) {
    try {
      if (!data) {
        Notification.failure("No mode data provided in the link.");
        return;
      }

      // Decode Base64 URL-safe format
      data = data.replace(/-/g, '+').replace(/_/g, '/');
      while (data.length % 4 !== 0) {
        data += '=';
      }

      // Decode Base64
      const binaryString = atob(data);
      const byteArray = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        byteArray[i] = binaryString.charCodeAt(i);
      }

      let modeJson;

      // Attempt direct JSON parsing first
      try {
        modeJson = JSON.parse(new TextDecoder().decode(byteArray));
      } catch {
        // If direct parsing fails, assume it's compressed and try decompressing
        try {
          const decompressedJson = pako.inflate(byteArray, { to: 'string' });
          modeJson = JSON.parse(decompressedJson);
        } catch (error) {
          throw new Error("Invalid mode data: unable to parse or decompress.");
        }
      }

      // Import mode
      this.importModeFromData(modeJson, true);
      Notification.success("Successfully imported mode from link.");
    } catch (error) {
      Notification.failure("Failed to import mode from link.");
      console.error("Error decoding and importing mode:", error);
    }
  }

  exportMode() {
    if (!this.lightshow.vortex.engine().modes().curMode()) {
      Notification.failure("Must select a mode to export");
      return;
    }
    const modeJson = this.lightshow.vortex.printModeJson(false);
    // Compress with pako (Gzip)
    const compressed = pako.deflate(modeJson, { level: 9 });
    // Convert to Base64 (for clipboard/export safety)
    const compressedBase64 = btoa(String.fromCharCode(...compressed));
    this.exportModal.show({
      buttons: [],
      defaultValue: compressedBase64,
      title: 'Export/Copy a Mode',
    });
    this.exportModal.selectAndCopyText();
    Notification.success("Copied JSON mode to clipboard");
  }

  importMode() {
    this.importModal.show({
      placeholder: 'Paste a compressed JSON mode',
      title: 'Import/Paste a Mode',
      onInput: (event) => {
        try {
          const data = event.target.value;
          const binaryString = atob(data);
          const byteArray = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            byteArray[i] = binaryString.charCodeAt(i);
          }
          const decompressedJson = pako.inflate(byteArray, { to: 'string' });
          this.importModeFromData(JSON.parse(decompressedJson));
        } catch (error) {
          Notification.failure("Invalid compressed mode data");
          console.error("Failed to decompress/import mode:", error);
        }
      }
    });

    this.importModal.selectText();
  }

  importPatternFromData(patternData, addNew = false) {
    if (!patternData) {
      Notification.failure("No pattern data");
      return;
    }
    const modeData = {
      flags: 6,
      num_leds: 1,
      single_pats: [
        patternData
      ]
    };
    return this.importModeFromData(modeData, addNew);
  }

  showImportModeModal(importedDevice, currentDevice, modeData, addNew) {
    const importedDeviceData = this.editor.devices[importedDevice] || {};
    const currentDeviceData = this.editor.devices[currentDevice] || {};

    // Extract mode name
    const modeName = modeData.name || "Unnamed Mode";

    // Extract pattern set details (if available)
    const patternSets = modeData.single_pats || (modeData.multi_pat ? [modeData.multi_pat] : []);
    const patternDetails = patternSets.length
      ? patternSets.map((pat, index) => `<li><strong>Pattern ${index + 1}:</strong> ${pat?.data?.colorset ? pat.data.colorset.length + " Colors" : "No Color Data"}</li>`).join("")
      : "<li>No Patterns</li>";

    // Create modal content with proper side-by-side layout
    const modalBlurb = `
      <div class="modal-device-container">
        <div class="modal-device">
          <img src="/${importedDeviceData.iconBig}" alt="${importedDevice}">
          <div>
            <strong>LED Count:</strong> ${modeData.num_leds}
          </div>
        </div>
        <div class="modal-device">
          <img src="/${currentDeviceData.iconBig}" alt="${currentDevice}">
          <div>
            <strong>LED Count:</strong> ${this.editor.devices[currentDevice]?.ledCount || 'Unknown'}
          </div>
        </div>
      </div>
    `;

    // Determine which buttons to show
    const buttons = [];

    if (currentDevice === 'None' || importedDevice === currentDevice) {
      // Single "Import Mode" button when devices match
      buttons.push({
        label: 'Import Mode',
        class: 'modal-button primary-button',
        onClick: () => {
          this.deviceSelectionModal.hide();
          this.finalizeModeImport(modeData, addNew);
        }
      });
    } else {
      // Two options when devices don't match
      buttons.push({
        label: `Switch to ${importedDevice}`,
        class: 'modal-button switch-button',
        onClick: async () => {
          this.deviceSelectionModal.hide();
          this.editor.lightshow.setLedCount(modeData.num_leds);
          await this.editor.devicePanel.updateSelectedDevice(importedDevice, true);
          this.finalizeModeImport(modeData, addNew);
        }
      });

      buttons.push({
        label: `Convert to ${currentDevice}`,
        class: 'modal-button secondary-button',
        onClick: () => {
          this.deviceSelectionModal.hide();
          this.finalizeModeImport(modeData, addNew);
        }
      });
    }

    // Show the modal
    this.deviceSelectionModal.show({
      title: `Change to ${importedDevice}?`,
      blurb: modalBlurb,
      buttons: buttons
    });
  }


  finalizeModeImport(modeData, addNew) {
    //this.lightshow.setLedCount(modeData.num_leds);
    const modeCount = this.lightshow.vortex.numModes();
    let curSel;
    if (addNew) {
      curSel = this.lightshow.vortex.engine().modes().curModeIndex();
      const device = this.editor.devicePanel.selectedDevice;
      const maxModes = this.getMaxModes(device);
      if (modeCount >= maxModes) {
        Notification.failure(`The ${device} can only hold ${maxModes} modes`);
        return;
      }
      if (!this.lightshow.vortex.addNewMode(false)) {
        Notification.failure("Failed to add another mode");
        return;
      }
      this.lightshow.vortex.setCurMode(modeCount, false);
    }

    let cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      console.log("cur empty!");
      return;
    }
    cur.init();

    const patterns = modeData.single_pats || [modeData.multi_pat];
    if (!patterns) {
      console.log("Patterns empty!");
      return;
    }

    patterns.forEach((pat, index) => {
      if (!pat) return;

      let patData = pat.data || pat;
      if (!patData.colorset) {
        Notification.failure("Invalid pattern data: " + JSON.stringify(pat));
        return;
      }

      const set = new this.lightshow.vortexLib.Colorset();
      patData.colorset.forEach(hexCode => {
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

      const patID = this.lightshow.vortexLib.intToPatternID(patData.pattern_id);
      const args = new this.lightshow.vortexLib.PatternArgs();
      patData.args.forEach(arg => args.addArgs(arg));

      cur = this.lightshow.vortex.engine().modes().curMode();
      cur.setPattern(patID, index, args, set);
      this.lightshow.vortex.setPatternArgs(index, args, true);
    });

    cur = this.lightshow.vortex.engine().modes().curMode();
    cur.init();
    this.lightshow.vortex.engine().modes().saveCurMode();

    if (addNew) {
      this.lightshow.vortex.setCurMode(curSel, false);
    }

    this.refreshModeList();
    this.editor.ledSelectPanel.renderLedIndicators(this.editor.devicePanel.selectedDevice);
    this.editor.ledSelectPanel.handleLedSelectionChange();
    this.selectMode(addNew ? modeCount : curSel);
    this.refreshPatternControlPanel();
    this.refresh();
    Notification.success("Successfully imported mode");
  }

  importModeFromData(modeData, addNew = true) {
    if (!modeData) {
      Notification.failure("No mode data");
      return;
    }
    let initialDevice = Object.entries(this.editor.devices).find(
      ([, device]) => device.ledCount === modeData.num_leds
    )?.[0] || 'None';

    const selectedDevice = this.editor.devicePanel.selectedDevice;

    // If the imported mode has a different device, ask the user to choose
    if (initialDevice && selectedDevice !== initialDevice && selectedDevice !== 'None' && !this.editor.devicePanel.isSelectionLocked()) {
      this.showImportModeModal(initialDevice, selectedDevice, modeData, addNew);
      return;
    }
    if (!this.editor.devicePanel.isSelectionLocked()) {
      this.lightshow.setLedCount(modeData.num_leds);
      this.editor.devicePanel.updateSelectedDevice(initialDevice, true);
    }
    const modeCount = this.lightshow.vortex.numModes();
    let curSel;
    if (addNew) {
      curSel = this.lightshow.vortex.engine().modes().curModeIndex();
      // check the mode count against max
      const device = this.editor.devicePanel.selectedDevice;
      const maxModes = this.getMaxModes(device)
      if (modeCount >= maxModes) {
        Notification.failure(`The ${device} can only hold ${maxModes} modes`);
        return;
      }
      if (!this.lightshow.vortex.addNewMode(false)) {
        Notification.failure("Failed to add another mode");
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

    const patterns = modeData.single_pats ? modeData.single_pats : [modeData.multi_pat];
    if (!patterns) {
      console.log("Patterns empty!");
      return;
    }
    patterns.forEach((pat, index) => {
      if (!pat) {
        return;
      }
      let patData = pat.data;
      if (!patData) {
        patData = pat;
      }
      if (!patData.colorset) {
        Notification.failure("Invalid pattern data: " + JSON.stringify(pat));
        return;
      }

      const set = new this.lightshow.vortexLib.Colorset();
      patData.colorset.forEach(hexCode => {
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

      const patID = this.lightshow.vortexLib.intToPatternID(patData.pattern_id);
      const args = new this.lightshow.vortexLib.PatternArgs();
      patData.args.forEach(arg => args.addArgs(arg));
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

    this.refreshModeList();
    this.selectMode(addNew ? modeCount : curSel);
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
    this.refreshPatternControlPanel();
    Notification.success("Successfully Deleted Mode " + index);
  }
}
