import Panel from './Panel.js';

export default class DuoEditorPanel extends Panel {
  constructor(editor) {
    const content = `
      <button id="duoEditorTransmitVLButton" class="mode-list-btn" title="Transmit Mode to Duo">
        <i class="fa-solid fa-satellite-dish"></i>
      </button>
      <div class="duo-editor-container">
        <img src="public/images/duo-editor-leds.png" id="duoImageOverlay" />
        <canvas id="duoFlashCanvas"></canvas>
        <div class="duo-editor-buttons-container">
          <button class="duo-led-indicator" data-led="0"></button>
          <button class="duo-led-indicator" data-led="1"></button>
        </div>
      </div>
     <div id="duo-popup-editor" class="duo-popup" style="display:none;">
      <div class="popup-header">
        <span id="ledTitle">LED 1 Config (Tip)</span>
        <button class="popup-close" id="closeDuoPopup">&times;</button>
      </div>
      <div class="popup-content" id="duoPopupContent">
      </div>
    </div>

    `;
    super(editor, 'duoEditorPanel', content, 'Duo Editor');
    this.editor = editor;
    this.selectedLeds = ['0']; // LED 0 selected by default
    this.mainSelectedLed = '0';
  }

  initialize() {
    // Setup flash canvas on lightshow
    const flashCanvas = this.panel.querySelector('#duoFlashCanvas');
    this.editor.lightshow.setFlashCanvas(flashCanvas);

    // Hook up the Bluetooth button
    const transmitVLButton = this.panel.querySelector('#duoEditorTransmitVLButton');
    if (transmitVLButton) {
      transmitVLButton.addEventListener('click', () => this.editor.transmitVL());
    }

    // Setup LED click/tap handlers
    this.panel.querySelectorAll('.duo-led-indicator').forEach((led) => {
      led.addEventListener('click', (e) => this.handleLedTap(e));
    });

    this.duoPopup = document.getElementById('duo-popup-editor');
    this.duoPopupContent = document.getElementById('duoPopupContent');
    document.getElementById('closeDuoPopup').addEventListener('click', () => {
      this.duoPopup.classList.add('hidden');
    });
  }

  handleLedTap(event) {
    const ledIndex = event.currentTarget.dataset.led;
    this.selectedLeds = [ledIndex];
    this.mainSelectedLed = ledIndex;
    this.emitLedChange();

    this.duoPopupContent.innerHTML = '';

    // Clone pattern select
    const originalPatternSelect = this.editor.patternPanel.getPatternSelectElement();
    const clonedPatternSelect = originalPatternSelect.cloneNode(true);
    clonedPatternSelect.id = 'duoPatternDropdown';
    clonedPatternSelect.value = originalPatternSelect.value; // sync selection

    // Add pattern change listener
    clonedPatternSelect.addEventListener('change', (e) => {
      const newPatId = parseInt(e.target.value);
      const cur = this.editor.vortex.engine().modes().curMode();
      const args = new this.editor.vortexLib.PatternArgs();
      const set = cur.getColorset(this.mainSelectedLed);
      const patID = this.editor.vortexLib.intToPatternID(newPatId);

      console.log(`patID: ${patID} main: ${this.mainSelectedLed}`);

      cur.setPattern(patID, this.mainSelectedLed, args, set);
      cur.init();

      this.editor.vortex.engine().modes().saveCurMode();
      this.editor.demoModeOnDevice();
    });

    this.duoPopupContent.appendChild(clonedPatternSelect);

    // Clone the colorset panel
    const originalColorsetContent = this.editor.colorsetPanel.contentContainer;
    const clonedColorsetContent = originalColorsetContent.cloneNode(true);
    clonedColorsetContent.style.display = 'block';
    clonedColorsetContent.style.flexGrow = '1';
    clonedColorsetContent.style.height = '100%';
    clonedColorsetContent.style.overflowY = 'auto';

    this.duoPopupContent.appendChild(clonedColorsetContent);

    // Refresh colorset (won’t affect cloned version visually but might help for state)
    this.editor.colorsetPanel.refresh();

    // Show popup
    this.duoPopup.classList.remove('hidden');
    this.duoPopup.style.display = '';

    const ledTitle = this.panel.querySelector('#ledTitle');
    ledTitle.innerHTML = `LED ${ledIndex == 0 ? "1" : "2"} Config (${ledIndex == 0 ? "Tip" : "Top"})`;
  }

  showPopup(ledIndex) {
    this.editor.ledSelectPanel.deselectLed(ledIndex === 0 ? 1 : 0);
    this.editor.ledSelectPanel.setMainSelection(ledIndex, true);

    const ledTitle = this.panel.querySelector('#ledTitle');
    const indexPlus = parseInt(ledIndex, 10) + 1;
    ledTitle.innerHTML = `LED ${ledIndex == 0 ? "1" : "2"} Config (${ledIndex == 0 ? "Tip" : "Top"})`;

    const popup = this.panel.querySelector('#duo-popup-editor');
    popup.classList.add('visible');

    const closeBtn = popup.querySelector('.popup-close');
    closeBtn.onclick = () => {
      this.duoPopup.classList.add('hidden');
    };

    const cur = this.editor.vortex.engine().modes().curMode();
    if (!cur) return;

    const colorset = cur.getColorset(ledIndex);
    const colorsetDiv = popup.querySelector('#popupColorset');
    colorsetDiv.innerHTML = '';
    for (let i = 0; i < colorset.numColors(); i++) {
      const col = colorset.get(i);
      const hex = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1)}`;
      const swatch = document.createElement('div');
      swatch.style.backgroundColor = hex;
      colorsetDiv.appendChild(swatch);
    }

    const select = popup.querySelector('#popupPatternSelect');
    select.innerHTML = '';
    const patternId = cur.getPatternId(ledIndex);

    const availablePatterns = this.editor.vortexLib.getAllPatternNames();
    availablePatterns.forEach((name, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = name;
      if (i === patternId) opt.selected = true;
      select.appendChild(opt);
    });

    select.onchange = () => {
      const newPatId = parseInt(select.value);
      const args = new this.editor.vortexLib.PatternArgs();
      cur.setPattern(this.editor.vortexLib.intToPatternID(newPatId), ledIndex, args, colorset);
      cur.init();
      this.editor.vortex.engine().modes().saveCurMode();
      this.editor.demoModeOnDevice();
    };
  }


  showLedPopup(x, y, ledIndex) {
    const popup = document.getElementById('ledPopup');
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.style.display = 'block';
    popup.innerHTML = `
      <button onclick="openPattern(${ledIndex})">Pattern</button>
      <button onclick="openColor(${ledIndex})">Color</button>
    `;
  }

  emitLedChange() {
    document.dispatchEvent(new CustomEvent('ledsChange', {
      detail: {
        targetLeds: this.selectedLeds,
        mainSelectedLed: this.mainSelectedLed
      }
    }));
  }

  updateLayout(isMobile) {
    if (isMobile) {
      this.panel.classList.add('mobile-panel');
      this.panel.style.width = '100%';
      this.panel.style.height = '100%';
      this.panel.style.padding = '0';
      this.panel.style.boxShadow = 'none';
      this.panel.style.backgroundColor = 'transparent';
    } else {
      this.panel.classList.remove('mobile-panel');
      this.panel.style.width = '';
      this.panel.style.height = '';
      this.panel.style.padding = '';
      this.panel.style.boxShadow = '';
      this.panel.style.backgroundColor = '';
    }
  }

  onActive() {
    this.editor.lightshow.setDuoEditorMode(true);
    this.editor.animationPanel.applyPreset('DuoEditor');
    this.editor.ledSelectPanel.unselectAllLeds();
  }

  onInactive() {
    this.editor.lightshow.setDuoEditorMode(false);
    this.editor.animationPanel.applyPreset('Chromadeck');
    this.editor.ledSelectPanel.unselectAllLeds();

    // Restore pattern select
    const patternSelect = this.editor.patternPanel.getPatternSelectElement();
    if (patternSelect && this.originalPatternSelectParent) {
      this.originalPatternSelectParent.appendChild(patternSelect);
    }

    // Restore colorset panel
    const colorsetPanelContent = this.editor.colorsetPanel.contentContainer;
    if (colorsetPanelContent && this.originalColorsetPanelParent) {
      this.originalColorsetPanelParent.appendChild(colorsetPanelContent);
    }

    // Hide popup if it's still open
    this.duoPopup.classList.add('hidden');
    this.duoPopup.style.display = 'none';

    console.log("switch off duo editor");
  }

  canOpen() {
    return this.editor.devicePanel.selectedDevice === 'Chromadeck';
  }
}

