import Panel from './Panel.js';

export default class ModesPanel extends Panel {
  constructor(lightshow, vortexPort) {
    const content = `
      <button id="connectDevice">Connect Vortex Device</button>
      <div id="statusMessage"></div>
      <fieldset>
        <legend>Modes</legend>
        <div class="flex-container">
          <select id="modeList" size="16"></select>
        </div>
      </fieldset>
      <fieldset>
        <legend>Leds</legend>
        <div class="flex-container">
           <select id="ledList" size="20"></select>
        </div>
      </fieldset>
    `;

    super('modesPanel', content);
    this.lightshow = lightshow;
    this.vortexPort = vortexPort;
  }

  initialize() {
    this.populateLedList();
    this.populateModeList();
    const modeList = document.getElementById('modeList');
    modeList.addEventListener('change', (event) => {
      const selectedMode = event.target.value;
      this.lightshow.vortex.setCurMode(selectedMode, true);
      this.refreshLedList();
      // Dispatch a custom event
      document.dispatchEvent(new CustomEvent('modeChange'));
    });
    document.addEventListener('patternChange', (event) => {
      console.log("Pattern change detected by modes panel, refreshing");
      this.refresh();
    });
  }

  refresh() {
    this.refreshLedList();
    this.refreshModeList();
  }

  refreshLedList() {
    const ledList = document.getElementById('ledList');
    ledList.innerHTML = '';
    this.populateLedList();
  }

  refreshModeList() {
    const modeList = document.getElementById('modeList');
    modeList.innerHTML = '';
    this.populateModeList();
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
    const modeList = document.getElementById('modeList');
    let curSel = this.lightshow.vortex.engine().modes().curModeIndex();
    // We have to actually iterate the modes with nextmode because Vortex can't just
    // instantiate one and return it which is kinda dumb but just how it works for now
    this.lightshow.vortex.setCurMode(0, false);
    for (let i = 0; i < this.lightshow.vortex.numModes(); ++i) {
      // just use the pattern name from the first pattern
      const option = document.createElement('option');
      let modeStr = "Mode " + i + " (" + this.lightshow.vortex.getModeName() + ")";
      option.value = i;
      option.textContent = modeStr;
      modeList.appendChild(option);
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
  }
}
