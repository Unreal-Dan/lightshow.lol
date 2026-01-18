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
        <button id="listenVLButton" class="mode-list-btn" title="Receive Mode from Duo" disabled>
          <i class="fa-solid fa-satellite-dish"></i>
        </button>
      </div>
      <div id="modesListScrollContainer">
        <div id="modesListContainer">
          <!-- Dynamic list of modes will be populated here -->
        </div>
        <div id="emptyModesLabel" class="empty-modes-label" style="display: none;">Add Modes to Begin</div>
      </div>
    `;
    super(editor, 'modesPanel', content, editor.detectMobile() ? 'Modes' : 'Modes List');
    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
    this.shareModal = new Modal('share');
    this.exportModal = new Modal('export');
    this.importModal = new Modal('import');
    this.conversionModal = new Modal('conversion');
  }

  initialize() {
    const addModeButton = document.getElementById('addModeButton');
    addModeButton.addEventListener('click', () => this.addMode());

    const importModeButton = document.getElementById('importModeButton');
    importModeButton.addEventListener('click', () => this.showPasteModeModal());

    const pushButton = document.getElementById('pushToDeviceButton');
    pushButton.addEventListener('click', async () => this.pushToDevice());

    const pullButton = document.getElementById('pullFromDeviceButton');
    pullButton.addEventListener('click', async () => this.pullFromDevice());

    const transmitButton = document.getElementById('transmitVLButton');
    const listenVLButton = document.getElementById('listenVLButton');

    this.transmitActive = false;
    this.transmitInterval = null;

    const startTransmit = () => {
      if (this.transmitActive || transmitButton.disabled) return;
      this.transmitActive = true;
      transmitButton.classList.add('pressed');
      let transmitRunning = false;
      Notification.success("Transmitting mode to duo...");
      this.transmitInterval = setInterval(async () => {
        if (transmitRunning) return;
        transmitRunning = true;
        try {
          await this.editor.transmitVL();
          await this.editor.sleep(200);
        } finally {
          transmitRunning = false;
        }
      }, 100);
    };

    const stopTransmit = () => {
      if (!this.transmitActive) return;
      this.transmitActive = false;
      clearInterval(this.transmitInterval);
      this.transmitInterval = null;
      transmitButton.classList.remove('pressed');
      Notification.success("Stopped transmitting mode to Duo");
    };

    transmitButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.transmitActive) {
        stopTransmit();
      } else {
        startTransmit();
      }
    });

    document.addEventListener('click', (e) => {
      if (!transmitButton.contains(e.target)) {
        stopTransmit();
      }
    });

    listenVLButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editor.listenVL();
    });

    document.addEventListener('patternChange', () => this.refresh(true));

    this.refreshModeList();
  }

  async pushToDevice() {
    await this.editor.pushToDevice();
  }

  async pullFromDevice() {
    // first pull
    await this.editor.pullFromDevice();
    // if there was at least one mode
    if (this.editor.vortex.numModes() > 0) {
      // then make sure the first mode is selected
      this.selectMode(0);
    }
  }

  async onDeviceConnect(deviceName) {
    // Enable the 3 buttons when a device is connected
    const pushToDevice = document.getElementById('pushToDeviceButton');
    if (pushToDevice) {
      pushToDevice.disabled = false;
    }
    const pullFromDevice = document.getElementById('pullFromDeviceButton');
    if (pullFromDevice) {
      pullFromDevice.disabled = false;
    }
    const transmitVL = document.getElementById('transmitVLButton');
    if (transmitVL) {
      transmitVL.disabled = false;
    }
    const listenVL = document.getElementById('listenVLButton');
    if (listenVL) {
      listenVL.disabled = false;
    }
    const connectDevice = document.getElementById('connectDeviceButton');
    if (connectDevice) {
      connectDevice.disabled = true;
    }
  }

  async onDeviceDisconnect(deviceName) {
    // Disable the 3 buttons when a device is disconnected
    const pushToDevice = document.getElementById('pushToDeviceButton');
    if (pushToDevice) {
      pushToDevice.disabled = true;
    }
    const pullFromDevice = document.getElementById('pullFromDeviceButton');
    if (pullFromDevice) {
      pullFromDevice.disabled = true;
    }
    const transmitVL = document.getElementById('transmitVLButton');
    if (transmitVL) {
      transmitVL.disabled = true;
    }
    const listenVL = document.getElementById('listenVLButton');
    if (listenVL) {
      listenVL.disabled = true;
    }
    const connectDevice = document.getElementById('connectDeviceButton');
    if (connectDevice) {
      connectDevice.disabled = false;
    }
  }

  async onDeviceSelected(devicename) {
    // nothing really to do at this step
  }

  refresh(fromEvent = false) {
    this.refreshModeList(fromEvent);
  }

  refreshOtherPanels() {
    document.dispatchEvent(new CustomEvent('modeChange'));
  }

  clearModeList() {
    const modesListContainer = document.getElementById('modesListContainer');
    modesListContainer.innerHTML = '';
  }

  refreshModeList(fromEvent = false) {
    const modesListContainer = document.getElementById('modesListContainer');
    this.clearModeList();
    // make sure the 'empty label' never shows
    const emptyLabel = document.getElementById('emptyModesLabel');
    emptyLabel.style.display = 'none';
    let cur = this.editor.vortex.engine().modes().curMode();
    if (!cur) {
      this.editor.vortex.setCurMode(0, false);
      cur = this.editor.vortex.engine().modes().curMode();
      if (!cur) {
        // actually show the label, there's no modes
        emptyLabel.style.display = 'block';
        this.editor.ledSelectPanel.refreshLedList();
        return;
      }
    }
    this.forEachMode((index, mode, curSel) => { 
      let isSelected = (index == curSel);
      const modeDiv = document.createElement('div');
      modeDiv.className = 'mode-entry';
      modeDiv.setAttribute('mode-index', index);
      if (isSelected) {
        modeDiv.classList.add('selected');
      }
      modeDiv.innerHTML = `
        <span class="mode-name">Mode ${index + 1} - ${this.editor.vortex.getModeName()}</span>
        <div style="display:flex">
        <div class="mode-btn-container" style="display: ${isSelected ? 'flex' : 'none'};">
          <button class="share-mode-btn mode-btn" title="Share Mode"><i class="fas fa-share-alt"></i></button>
          <button class="link-mode-btn mode-btn" title="Get Link"><i class="fas fa-link"></i></button>
          <button class="export-mode-btn mode-btn" title="Copy Mode"><i class="fa-solid fa-copy"></i></button>
        </div>
        <button class="delete-mode-btn mode-btn" title="Delete Mode">&times;</button>
        </div>
      `;
      modesListContainer.appendChild(modeDiv);
    });
    this.attachModeEventListeners();



  }

  hasMultiLedPatterns() {
    let hasMultiLedPatterns = false;
    this.forEachMode((index, mode) => {
      if (mode && mode.isMultiLed()) {
        hasMultiLedPatterns = true;
      }
    });
    return hasMultiLedPatterns;
  }

  convertModesToSingle() {
    let count = 0;
    this.forEachMode((index, mode) => {
      console.log("Checking mode " + index);
      if (mode && mode.isMultiLed()) {
        const multiIndex = this.editor.vortex.engine().leds().ledMulti();
        const set = mode.getColorset(multiIndex);
        mode.clearPattern(multiIndex);
        this.editor.ledSelectPanel.switchToSelectSingles();
        const allLeds = this.editor.vortex.engine().leds().ledCount();
        const patID = this.editor.vortexLib.intToPatternID(0);
        mode.setPattern(patID, allLeds, null, null);
        mode.setColorset(set, allLeds);
        mode.init();
        this.editor.vortex.engine().modes().saveCurMode();
        count++;
      }
    });
    if (count > 0) {
      this.refreshModeList();
      Notification.success(`Converted ${count} Multi-LED patterns to Single-LED`);
    }
  }

  forEachMode(callback) {
    // backup the current mode index/selection
    const curSel = this.editor.vortex.engine().modes().curModeIndex();
    // switch to mode 0
    this.editor.vortex.setCurMode(0, false);
    for (let i = 0; i < this.editor.vortex.numModes(); ++i) {
      // call curMode each time after calling nextMode
      const cur = this.editor.vortex.engine().modes().curMode();
      // call the callback with the mode
      callback(i, cur, curSel);
      // iterate to next mode
      this.editor.vortex.nextMode(false);
    }
    // restore the mode
    this.editor.vortex.setCurMode(curSel, false);
  }

  selectMode(index, refresh = true) {
    this.editor.vortex.setCurMode(index, true);

    // Hide buttons for all modes first
    document.querySelectorAll('.mode-btn-container').forEach(buttonContainer => {
      buttonContainer.style.display = 'none';
    });

    // Show buttons for the selected mode
    const selectedMode = document.querySelector(`.mode-entry[mode-index="${index}"] .mode-btn-container`);
    if (selectedMode) {
      selectedMode.style.display = 'flex';
    }

    const cur = this.editor.vortex.engine().modes().curMode();
    const isMultiLed = (cur && cur.isMultiLed());
    const device = this.editor.devicePanel.selectedDevice;
    const shouldDisable = (!this.editor.vortexPort.isActive() || device === 'None' || isMultiLed); 
    document.getElementById('transmitVLButton').disabled = shouldDisable;
    document.getElementById('listenVLButton').disabled = shouldDisable;

    if (refresh) {
      this.editor.ledSelectPanel.refreshLedList();
      this.refreshOtherPanels();
      this.editor.demoModeOnDevice();
    }
  }

  // Override setSelected to set this panel as the active panel
  setSelected() {
    super.setSelected();
    this.selectedModeIndex = this.editor.vortex.engine().modes().curModeIndex();
  }

  // Enable copy support
  canCopy() {
    return this.selectedModeIndex !== undefined;
  }

  // Enable paste support
  canPaste() {
    return true;
  }

  // Copy selected mode data
  copy() {
    if (this.selectedModeIndex === undefined) {
      return;
    }
    const modeData = this.editor.vortex.printModeJson(false);
    navigator.clipboard.writeText(modeData).then(() => {
      Notification.success("Copied mode to clipboard");
    }).catch(() => {
      Notification.failure("Failed to copy mode");
    });
  }

  // Paste copied mode data
  paste() {
    navigator.clipboard.readText().then((data) => {
      if (/^#?[0-9A-Fa-f]{6}$/.test(data)) {
        if (this.editor.colorsetPanel) {
          this.editor.colorsetPanel.paste();
          return;
        }
      }
      this.importModeFromData(JSON.parse(data), true);
    }).catch(() => {
      Notification.failure("Failed to paste mode");
    });
  }

  attachModeEventListeners() {
    const modesListContainer = document.getElementById('modesListContainer');
    let draggedElement = null;
    let draggedIndex = null;

    modesListContainer.querySelectorAll('.mode-entry').forEach(modeEntry => {

      // Add dragstart event to each mode
      modeEntry.setAttribute('draggable', true);
      modeEntry.addEventListener('dragstart', (event) => {
        draggedElement = event.target;
        draggedIndex = parseInt(draggedElement.getAttribute('mode-index'));
        draggedElement.classList.add('dragging');
        event.dataTransfer.effectAllowed = "move";
      });

      // Remove styling when dragging ends
      modeEntry.addEventListener('dragend', () => {
        draggedElement.classList.remove('dragging');
        draggedElement = null;
      });

      // Handle drag over - prevent default behavior to allow dropping
      modeEntry.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      });

      // Handle drop - reorder the modes
      modeEntry.addEventListener('drop', (event) => {
        event.preventDefault();

        const targetElement = event.target.closest('.mode-entry');
        if (!draggedElement || !targetElement || draggedElement === targetElement) return;

        const targetIndex = parseInt(targetElement.getAttribute('mode-index'));

        const curIdx = this.editor.vortex.engine().modes().curModeIndex();
        if (curIdx !== draggedIndex) {
          // dragging wrong element? how?
          console.log(`Not dragging current index! (curIdx: ${curIdx} dragged: ${draggedIndex})`);
          this.editor.vortex.setCurMode(draggedIndex, true);
        }
        this.editor.vortex.shiftCurMode(targetIndex - draggedIndex, true);
        this.refreshModeList();
        this.refreshOtherPanels();
      });

      // Click select - Fix multi-selection issue
      modeEntry.addEventListener('mousedown', (event) => {
        const modeElement = event.target.closest('.mode-entry');

        if (!modeElement) return;

        // Ensure only one mode is selected at a time
        document.querySelectorAll('.mode-entry.selected').forEach(selected => {
          selected.classList.remove('selected');
        });

        modeElement.classList.add('selected');

        // Set this panel as selected
        this.setSelected();
      });

      // Prevent selection when mouse moves off original element before release
      //modeEntry.addEventListener('mouseleave', (event) => {
      //  const modeElement = event.target.closest('.mode-entry');
      //  if (modeElement) {
      //    modeElement.classList.remove('selected');
      //  }
      //});

      //modeEntry.addEventListener('mousedown', event => {
      //  const modeElement = event.target.closest('.mode-entry');
      //  modeElement.classList.add('pressed');
      //});

      modeEntry.addEventListener('mouseup', event => {
        const modeElement = event.target.closest('.mode-entry');
        modeElement.classList.remove('pressed');
      });
      // Share Mode
      modeEntry.querySelector('.share-mode-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        this.shareModeToCommunity();
      });
      // Link Mode
      modeEntry.querySelector('.link-mode-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        this.showLinkModeModal();
      });
      // Copy Mode
      modeEntry.querySelector('.export-mode-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        this.showCopyModeModal();
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

  getMaxModes(deviceType) {
    return this.editor.devices?.[deviceType]?.maxModes ?? 1;
  }

  addMode() {
    let modeCount = this.editor.vortex.numModes();
    // check the mode count against max
    const device = this.editor.devicePanel.selectedDevice;
    const maxModes = this.getMaxModes(device)
    if (modeCount >= maxModes) {
      Notification.failure(`The ${device} can only hold ${maxModes} modes`);
      return;
    }
    if (!this.editor.vortex.addNewMode(false)) {
      Notification.failure("Failed to add another mode");
      return;
    }
    setTimeout(() => {
      this.selectMode(modeCount);
      this.refreshModeList();
      this.refreshOtherPanels();
    }, 0);
    Notification.success(`Successfully Added Mode ${modeCount + 1}`);
  }

  shareModeToCommunity() {
    if (!this.editor.vortex.engine().modes().curMode()) {
      Notification.failure("Must select a mode to share");
      return;
    }

    const modeJson = this.editor.vortex.printModeJson(false);
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

  showLinkModeModal() {
    if (!this.editor.vortex.engine().modes().curMode()) {
      Notification.failure("Must select a mode to share");
      return;
    }

    const modeJson = this.editor.vortex.printModeJson(false);

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
      // Import mode
      this.decodeAndImportMode(data, true);
      Notification.success("Successfully imported mode from link.");
    } catch (error) {
      Notification.failure("Failed to import mode from link.");
      console.error("Error decoding and importing mode:", error);
    }
  }

  showCopyModeModal() {
    if (!this.editor.vortex.engine().modes().curMode()) {
      Notification.failure("Must select a mode to export");
      return;
    }
    const modeJson = this.editor.vortex.printModeJson(false);
    // Compress with pako (Gzip)
    const compressed = pako.deflate(modeJson, { level: 9 });
    // Convert to Base64 (for clipboard/export safety)
    const compressedBase64 = btoa(String.fromCharCode(...compressed));
    this.exportModal.show({
      buttons: [],
      defaultValue: compressedBase64,
      title: 'Copy a Mode',
    });
    this.exportModal.selectAndCopyText();
    Notification.success("Copied mode to clipboard");
  }

  showPasteModeModal() {
    this.importModal.show({
      placeholder: 'Paste a compressed JSON mode',
      title: 'Import/Paste a Mode',
      onInput: (event) => {
        try {
          this.decodeAndImportMode(event.target.value, true);
        } catch (error) {
          Notification.failure("Invalid compressed mode data");
          console.error("Failed to decompress/import mode:", error);
        }
      }
    });

    this.importModal.selectText();
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

    // Two options when devices don't match
    buttons.push({
      label: `Switch to ${importedDevice}`,
      class: 'modal-button switch-button',
      onClick: async () => {
        this.conversionModal.hide();
        await this.finalizeModeImport(importedDevice, modeData, addNew);
      }
    });

    buttons.push({
      label: `Convert to ${currentDevice}`,
      class: 'modal-button convert-button',
      onClick: async () => {
        this.conversionModal.hide();
        await this.finalizeModeImport(currentDevice, modeData, addNew);
      }
    });

    // Show the modal
    this.conversionModal.show({
      title: `Change to ${importedDevice}?`,
      blurb: modalBlurb,
      buttons: buttons
    });
  }

  async finalizeModeImport(deviceName, modeData, addNew) {
    if (!this.editor.devicePanel.isSelectionLocked()) {
      this.lightshow.setLedCount(modeData.num_leds);
      await this.editor.devicePanel.updateSelectedDevice(deviceName, true);
    }

    const modeCount = this.editor.vortex.numModes();
    let curSel = this.editor.vortex.engine().modes().curModeIndex();
    if (addNew) {
      const device = this.editor.devicePanel.selectedDevice;
      const maxModes = this.getMaxModes(device);
      if (modeCount >= maxModes) {
        Notification.failure(`The ${device} can only hold ${maxModes} modes`);
        return;
      }
      if (!this.editor.vortex.addNewMode(false)) {
        Notification.failure("Failed to add another mode");
        return;
      }
      this.editor.vortex.setCurMode(modeCount, false);
    }

    let cur = this.editor.vortex.engine().modes().curMode();
    if (!cur) {
      console.log("cur empty!");
      return;
    }
    cur.init();

    const patterns = modeData.single_pats || [modeData.multi_pat];
    if (!patterns || patterns.length === 0) {
      console.log("Patterns empty!");
      return;
    }

    const totalLeds = this.editor.vortex.engine().leds().ledCount(); // Get target device LED count
    const modeLeds = modeData.num_leds; // Get mode's original LED count

    for (let i = 0; i < totalLeds; i++) {
      const patternIndex = i % patterns.length; // Repeat patterns cyclically
      const pat = patterns[patternIndex];

      if (!pat) continue;

      let patData = pat.data || pat;
      if (!patData.colorset) {
        Notification.failure("Invalid pattern data: " + JSON.stringify(pat));
        return;
      }

      const set = new this.editor.vortexLib.Colorset();
      patData.colorset.forEach(hexCode => {
        const normalizedHex = hexCode.replace('0x', '#');
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalizedHex);
        if (result) {
          set.addColor(new this.editor.vortexLib.RGBColor(
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
          ));
        }
      });

      const patID = this.editor.vortexLib.intToPatternID(patData.pattern_id);
      const args = new this.editor.vortexLib.PatternArgs();
      patData.args.forEach(arg => args.addArgs(arg));

      cur = this.editor.vortex.engine().modes().curMode();
      cur.setPattern(patID, i, args, set);
      this.editor.vortex.setPatternArgs(i, args, true);
    }

    cur = this.editor.vortex.engine().modes().curMode();
    cur.init();
    this.editor.vortex.engine().modes().saveCurMode();

    if (addNew) {
      this.editor.vortex.setCurMode(curSel, false);
    }

    // select the new mode and refresh a moment later
    setTimeout(() => {
        this.selectMode(addNew ? modeCount : curSel);
        this.refresh();
        Notification.success("Successfully imported mode");
    }, 100);
  }

  importPatternFromData(patternData, addNew = false) {
    if (!patternData) {
      Notification.failure("No pattern data");
      return false;
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

  importModeFromData(modeData, addNew = true) {
    if (!modeData) {
      Notification.failure("No mode data provided");
      return false;
    }

    const initialDevice = this.getDeviceForMode(modeData);
    const selectedDevice = this.editor.devicePanel.selectedDevice;

    if (this.requiresDeviceSelection(initialDevice, selectedDevice)) {
      this.showImportModeModal(initialDevice, selectedDevice, modeData, addNew);
      return true;
    }

    return this.finalizeModeImport(initialDevice, modeData, addNew);
  }

  decodeAndImportMode(data, addNew = true) {
    try {
      if (!data) return false;

      let modeJson;
      const binaryString = atob(data);
      const byteArray = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        byteArray[i] = binaryString.charCodeAt(i);
      }

      try {
        modeJson = JSON.parse(new TextDecoder().decode(byteArray));
      } catch {
        try {
          const decompressedJson = pako.inflate(byteArray, { to: 'string' });
          modeJson = JSON.parse(decompressedJson);
        } catch (error) {
          throw new Error("Invalid mode data: unable to parse or decompress.");
        }
      }

      return this.importModeFromData(modeJson, addNew);
    } catch (error) {
      Notification.failure("Failed to import mode");
      console.error("Error decoding and importing mode:", error);
      return false;
    }
  }

  getDeviceForMode(modeData) {
    return Object.entries(this.editor.devices).find(
      ([, device]) => device.ledCount === modeData.num_leds
    )?.[0] || 'None';
  }

  requiresDeviceSelection(importedDevice, selectedDevice) {
    return importedDevice && selectedDevice !== importedDevice && selectedDevice !== 'None' &&
      !this.editor.devicePanel.isSelectionLocked();
  }

  deleteMode(index) {
    let cur = this.editor.vortex.curModeIndex();
    this.editor.vortex.setCurMode(index, false);
    this.editor.vortex.delCurMode(true);
    if (cur && cur >= index) {
      cur--;
    }
    this.editor.vortex.setCurMode(cur, false);
    this.editor.vortex.engine().modes().saveCurMode();
    this.refreshModeList();
    this.refreshOtherPanels();
    Notification.success(`Successfully Deleted Mode ${parseInt(index) + 1}`);
  }
}
