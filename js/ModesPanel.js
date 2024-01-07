import Panel from './Panel.js';

export default class ModesPanel extends Panel {
  constructor(lightshow, vortexPort) {
    const content = `
      <div id="deviceConnectionSection">
        <button id="connectDevice">Connect Vortex Device</button>
        <div id="statusMessage"></div>
      </div>
      <div id="modesAndLedsSection">
        <div id="addModeButton">
          <span id="addModeName">Add Mode</span>
        </div>
        <div id="modesListScrollContainer">
          <div id="modesListContainer">
            <!-- Dynamic list of modes will be populated here -->
          </div>
        </div>
        <fieldset>
          <legend>Leds</legend>
          <div class="flex-container">
             <select id="ledList" size="20"></select>
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

    document.addEventListener('patternChange', (event) => {
      this.refresh(true);
    });
  }

  refresh(fromEvent = false) {
    this.refreshLedList(fromEvent);
    this.refreshModeList(fromEvent);
  }

  refreshLedList() {
    const ledList = document.getElementById('ledList');
    ledList.innerHTML = '';
    this.populateLedList();
  }

  refreshModeList() {
    const modesListContainer = document.getElementById('modesListContainer');
    modesListContainer.innerHTML = '';
    this.populateModeList();
  }

  refreshPatternControlPanel() {
    // dispatch an event to the control panel to change
    document.dispatchEvent(new CustomEvent('modeChange'));
  }

  populateLedList() {
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

  populateModeList() {
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

      const modeDiv = document.createElement('div');
      modeDiv.className = 'mode-entry';
      modeDiv.setAttribute('mode-index', i);  // Set the mode-index attribute here
      modeDiv.innerHTML = `
        <span class="mode-name" mode-index="${i}">Mode ${i} - ${this.lightshow.vortex.getModeName()}</span>
        <button class="delete-mode-btn" mode-index="${i}">X</button>
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

    // Select Mode
    modesListContainer.querySelectorAll('.mode-entry').forEach(modeEntry => {
      modeEntry.addEventListener('click', event => {
        const index = event.target.getAttribute('mode-index');
        console.log("Select " + index);
        this.selectMode(index);
      });
    });

    // Delete Mode
    modesListContainer.querySelectorAll('.delete-mode-btn').forEach(deleteBtn => {
      deleteBtn.addEventListener('click', event => {
        event.stopPropagation(); // Prevent click from bubbling up to the parent element
        const index = event.target.getAttribute('mode-index');
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
}
