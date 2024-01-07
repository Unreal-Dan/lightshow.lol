import Panel from './Panel.js';

export default class ModesPanel extends Panel {
  constructor(lightshow, vortexPort) {
    const content = `
      <div id="deviceConnectionSection">
        <div>
        <button id="connectDevice">Connect Vortex Device</button>
        <button id="pullFromDevice">Pull Save</button>
        <button id="pushToDevice">Push Save</button>
        </div>
        <div id="deviceStatusContainer">
          <span id="statusLabel">Device Status:</span>
          <span id="deviceStatus">Waiting for Connection...</span>
        </div>
      </div>
      <div id="modesAndLedsSection">
        <div id="modeButtonsSection">
          <button id="addModeButton">Add Mode</button>
          <button id="shareModeButton">Share Mode</button>
          <button id="saveModeButton">Save Mode</button>
          <button id="loadModeButton">Load Mode</button>
        </div>
        <div id="modesListScrollContainer">
          <div id="modesListContainer">
            <!-- Dynamic list of modes will be populated here -->
          </div>
        </div>
        <fieldset>
          <legend style="user-select:none;padding-top:15px;">Leds</legend>
          <div class="flex-container">
             <select id="ledList" size="16" multiple></select>
          </div>
        </fieldset>
      </div>
    `;

    super('modesPanel', content);
    this.lightshow = lightshow;
    this.vortexPort = vortexPort;
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
    shareModeButton.shareEventListener('click', event => {
      this.shareMode();
    });
    const saveModeButton = document.getElementById('saveModeButton');
    saveModeButton.saveEventListener('click', event => {
      this.saveMode();
    });
    const loadModeButton = document.getElementById('loadModeButton');
    loadModeButton.loadEventListener('click', event => {
      this.loadMode();
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
      try {
        await this.vortexPort.requestDevice(() => {
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
            this.lightshow.vortex.setLedCount(ledCount);
            console.log(`Set led count to ${ledCount} for ${this.vortexPort.name}`);
          } else {
            console.log(`Device name ${this.vortexPort.name} not recognized`);
          }
          document.dispatchEvent(new CustomEvent('modeChange'));
          document.dispatchEvent(new CustomEvent('patternChange'));
          statusMessage.textContent = 'Succes ' + this.vortexPort.name + ' Connected!';
          statusMessage.classList.add('status-success');
          statusMessage.classList.remove('status-failure');
        });
        // Additional logic to handle successful connection
      } catch (error) {
        statusMessage.textContent = 'Failed to connect: ' + error.message;
        statusMessage.classList.remove('status-success');
        statusMessage.classList.add('status-failure');
        // Handle errors
      }
    });
  }

  refresh(fromEvent = false) {
    this.refreshLedList(fromEvent);
    this.refreshModeList(fromEvent);
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
    document.dispatchEvent(new CustomEvent('modeChange'));
  }

  populateLedList(fromEvent = false) {
    const ledList = document.getElementById('ledList');
    //vector<int> sels;
    //m_ledsMultiListBox.getSelections(sels);
    //m_ledsMultiListBox.clearItems();
    if (this.lightshow.vortex.getPatternID(this.lightshow.vortex.engine().leds().ledMulti()) == this.lightshow.vortexLib.PatternID.PATTERN_NONE) {
      for (let pos = 0; pos < this.lightshow.vortex.numLedsInMode(); ++pos) {
        let ledName = this.lightshow.vortex.ledToString(pos) + " (" + this.lightshow.vortex.getPatternName(pos) + ")";
        const option = document.createElement('option');
        option.value = pos;
        option.textContent = ledName;
        ledList.appendChild(option);
      }
    } else {
      let ledName = "Multi led (" + this.lightshow.vortex.getPatternName(this.lightshow.vortex.engine().leds().ledMulti()) + ")";
      const option = document.createElement('option');
      option.value = this.lightshow.vortex.engine().leds().ledMulti().value;
      option.textContent = ledName;
      ledList.appendChild(option);
      // TODO: support both rendering multi and single at same time... not for now
    }
    // restore the selection
    //m_ledsMultiListBox.setSelections(sels);
    //if (recursive) {
    //  refreshPatternSelect(recursive);
    //  refreshColorSelect(recursive);
    //  refreshParams(recursive);
    //}
  }

  populateModeList(fromEvent = false) {
    const modesListContainer = document.getElementById('modesListContainer');
    modesListContainer.innerHTML = '';

    let curSel = this.lightshow.vortex.engine().modes().curModeIndex();
    // We have to actually iterate the modes with nextmode because Vortex can't just
    // instantiate one and return it which is kinda dumb but just how it works for now
    this.lightshow.vortex.setCurMode(0, false);
    for (let i = 0; i < this.lightshow.vortex.numModes(); ++i) {
      // just use the pattern name from the first pattern
      //const option = document.createElement('option');
      //let modeStr = "Mode " + i + " (" + this.lightshow.vortex.getModeName() + ")";
      //option.value = i;
      //option.textContent = modeStr;
      //modesListContainer.appendChild(option);
      let isSelected = (i == curSel);

      const modeDiv = document.createElement('div');
      modeDiv.className = 'mode-entry';
      modeDiv.setAttribute('mode-index', i);  // Set the mode-index attribute here
      if (isSelected) {
        modeDiv.classList.add('selected');  // Set the mode-index attribute here
      }
      modeDiv.innerHTML = `
        <span class="mode-name">Mode ${i} - ${this.lightshow.vortex.getModeName()}</span>
        <button class="delete-mode-btn">X</button>
      `;

      modesListContainer.appendChild(modeDiv);
      // go to next mode
      this.lightshow.vortex.nextMode(false);
    }
    // restore the selection
    //m_modeListBox.setSelection(curSel);
    this.lightshow.vortex.setCurMode(curSel, false);
    //if (recursive) {
    //  refreshLedList(recursive);
    //}
    // hack: for now just refresh status here
    //refreshStatus();
    //refreshStorageBar();
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

  addMode() {
    // Implement logic to add a new mode
    // ...
    this.lightshow.vortex.addNewMode(true);
    this.refreshModeList();
    this.refreshLedList();
  }

  shareMode() {
    // give url text box popup?
  }

  saveMode() {
    // give json text box popup?
  }

  loadMode() {
    // json text box input popup?
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
    this.refreshModeList();
    this.refreshLedList();
  }

  selectMode(index) {
    // Implement logic to select and show details of the mode at the given index
    this.lightshow.vortex.setCurMode(index, true);
    this.refreshLedList();
    this.refreshPatternControlPanel();
  }

  pushToDevice() {
    this.vortexPort.pushToDevice(this.lightshow.vortexLib, this.lightshow.vortex);
  }

  async pullFromDevice() {
    await this.vortexPort.pullFromDevice(this.lightshow.vortexLib, this.lightshow.vortex);
    this.refreshModeList();
    this.refreshLedList();
    this.refreshPatternControlPanel();
  }
}
