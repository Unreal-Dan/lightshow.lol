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
        <button id="pullFromDeviceButton" class="mode-list-btn" title="Pull Modes from Device" disabled>
          <i class="fa-solid fa-upload fa-flip-vertical"></i>
        </button>
        <button id="pushToDeviceButton" class="mode-list-btn" title="Push Modes to Device" disabled>
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
    super('modesPanel', content, 'Modes List');
    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
    this.shareModal = new Modal('share');
    this.exportModal = new Modal('export');
    this.importModal = new Modal('import');
  }

  initialize() {
    // Hide device connection section and leds fieldset initially
    //document.getElementById('deviceConnectionSection').style.display = 'block';
    //document.getElementById('ledsFieldset').style.display = 'none';

    // optionally initialize the chromalink now:
    //this.chromalinkPanel = new ChromalinkPanel(this.editor, this);
    //this.chromalinkPanel.appendTo(document.body); // Or any other parent element
    //this.chromalinkPanel.initialize();


    //const hamburgerButton = document.getElementById('hamburgerButton');
    //const hamburgerMenu = document.getElementById('hamburgerMenu');

    //hamburgerButton.addEventListener('click', function() {
    //  hamburgerMenu.style.display = (hamburgerMenu.style.display === 'block' ? 'none' : 'block');
    //});

    //document.addEventListener('click', function(event) {
    //  if (!hamburgerButton.contains(event.target) && !hamburgerMenu.contains(event.target)) {
    //    hamburgerMenu.style.display = 'none';
    //  }
    //});


    const addModeButton = document.getElementById('addModeButton');
    addModeButton.addEventListener('click', () => this.addMode());

    //const shareModeButton = document.getElementById('shareModeButton');
    //shareModeButton.addEventListener('click', () => this.shareMode());

    //const linkModeButton = document.getElementById('linkModeButton');
    //linkModeButton.addEventListener('click', () => this.linkMode());

    //const exportModeButton = document.getElementById('exportModeButton');
    //exportModeButton.addEventListener('click', () => this.exportMode());

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

  async onDeviceConnect() {
    console.log("Device connected: " + this.vortexPort.name);
    const ledCount = this.editor.devices[this.vortexPort.name].ledCount;
    if (ledCount !== undefined) {
      this.lightshow.setLedCount(ledCount);
      console.log(`Set LED count to ${ledCount} for ${this.vortexPort.name}`);
    } else {
      console.log(`Device name ${this.vortexPort.name} not recognized`);
    }
    document.dispatchEvent(new CustomEvent('deviceConnected'));
    this.refresh(true);
    //Notification.success(this.vortexPort.name + ' Connected!');
    //let statusMessage = document.getElementById('deviceStatus');
    //statusMessage.textContent = this.vortexPort.name + ' Connected!';
    //statusMessage.classList.add('status-success');
    //statusMessage.classList.remove('status-pending', 'status-failure');
    Notification.success("Successfully Connected " + this.vortexPort.name);

    // Enable the 3 buttons when a device is connected
    document.getElementById('pushToDeviceButton').disabled = false;
    document.getElementById('pullFromDeviceButton').disabled = false;
    document.getElementById('transmitVLButton').disabled = false;
    document.getElementById('connectDeviceButton').disabled = true;

    // if the device has UPDI support open a chromalink window
    if (!this.editor.chromalinkPanel.isVisible && this.vortexPort.name === 'Chromadeck') {
      this.editor.chromalinkPanel.show();
      //this.editor.updatePanel.show();
    }
    //if (!this.editor.updatePanel.isVisible && this.vortexPort.name === 'Spark') {
    //  this.editor.updatePanel.show();
    //}

    // check version numbers
    this.editor.checkVersion(this.vortexPort.name, this.vortexPort.version);

    // show device options
    //document.getElementById('deviceActionContainer').style.display = 'flex';
    //document.getElementById('deviceConnectContainer').style.display = 'none';

    // Show the device connection section and leds fieldset
    //document.getElementById('deviceConnectionSection').style.display = 'block';

    // display the spread slider
    document.getElementById('spread_div').style.display = 'block';

    // Change the height of the #modesListScrollContainer when the device connects
    const modesListScrollContainer = document.getElementById('modesListScrollContainer');
    if (modesListScrollContainer) {
      modesListScrollContainer.style.height = '200px';
    }

    // update device selection and lock it so it can't change
    this.editor.ledSelectPanel.updateSelectedDevice(this.vortexPort.name, true);

    this.editor.ledSelectPanel.selectAllLeds();
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
    Notification.success("Waiting for device...");
    //let statusMessage = document.getElementById('deviceStatus');
    //statusMessage.textContent = 'Waiting for device...';
    //statusMessage.classList.add('status-pending');
    //statusMessage.classList.remove('status-success', 'status-failure');
  }

  onDeviceDisconnect() {
    console.log("Device disconnected");
    Notification.success(this.vortexPort.name + ' Disconnected!');

    // Enable the 3 buttons when a device is connected
    document.getElementById('pushToDeviceButton').disabled = true;
    document.getElementById('pullFromDeviceButton').disabled = true;
    document.getElementById('transmitVLButton').disabled = true;
    document.getElementById('connectDeviceButton').disabled = false;

    //let statusMessage = document.getElementById('deviceStatus');
    //statusMessage.textContent = this.vortexPort.name + ' Disconnected!';
    //statusMessage.classList.remove('status-success', 'status-pending');
    //statusMessage.classList.add('status-failure');
    //this.lockDeviceSelection(false);
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
    case 'Duo':
      // TODO: version check?
      if (modeCount >= 5) {
        Notification.failure("This device can only hold 5 modes");
        return;
      }
      break;
    default:
      break;
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
      title: 'Export/Copy a Mode',
    });
    this.exportModal.selectAndCopyText();
    Notification.success("Copied JSON mode to clipboard");
  }

  importMode() {
    this.importModal.show({
      placeholder: 'Paste a JSON mode',
      title: 'Import/Paste a Mode',
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
    this.refreshPatternControlPanel();
    Notification.success("Successfully Deleted Mode " + index);
  }
}
