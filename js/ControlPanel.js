import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';
import ColorPicker from './ColorPicker.js';

export default class ControlPanel extends Panel {
  constructor(lightshow, vortexPort) {
    const controls = [
      {
        id: 'tickRate',
        type: 'range',
        min: 1,
        max: 30,
        default: 3,
        label: 'Speed',
        update: value => lightshow.tickRate = value
      },
      {
        id: 'trailSize',
        type: 'range',
        min: 1,
        max: 300,
        default: 100,
        label: 'Trail',
        update: value => lightshow.trailSize = value
      },
      {
        id: 'dotSize',
        type: 'range',
        min: 5,
        max: 50,
        default: 25,
        label: 'Size',
        update: value => lightshow.dotSize = value
      },
      {
        id: 'blurFac',
        type: 'range',
        min: 1,
        max: 10,
        default: 5,
        label: 'Blur',
        update: value => lightshow.blurFac = value
      },
      {
        id: 'circleRadius',
        type: 'range',
        min: 0,
        max: 600,
        default: 400,
        label: 'Radius',
        update: value => lightshow.circleRadius = value
      },
      {
        id: 'spread',  // New Slider ID
        type: 'range',
        min: 0,
        max: 100,
        default: 15,
        label: 'Spread',
        display: 'none',
        update: value => lightshow.spread = parseInt(value)  // Assume 'spread' is a new property in Lightshow
      }
    ];
    
    const content = `
            <fieldset>
                <legend>Animation</legend>
                <div class="flex-container">
                    ${ControlPanel.generateControlsContent(controls)}
                </div>
            </fieldset>
            <fieldset>
                <legend>Pattern</legend>
                <select id="patternDropdown"></select>
                <button id="randomizePattern">Randomize</button>
                <div id="patternParams"></div>
            </fieldset>
            <fieldset>
                <legend>Colorset</legend>
                <button id="randomizeColorset">Randomize</button>
                <div id="colorset"></div>
            </fieldset>
        `;

    super('controlPanel', content);
    this.lightshow = lightshow;
    this.controls = controls;
    this.vortexPort = vortexPort;
    this.targetLed = 0;
    this.targetLeds = [ this.targetLed ];
    this.isMulti = false;
    this.multiEnabled = false;
    // Add click tracking variables for each control
    this.clickCounts = {};
    this.clickTimers = {};
    this.sineWaveAnimations = {};
    this.controls.forEach(control => {
      this.clickCounts[control.id] = 0;
      this.sineWaveAnimations[control.id] = false;
    });

    // Instantiate the ColorPicker
    this.colorPicker = new ColorPicker(lightshow);
  }

  static generateControlsContent(controls) {
    return controls.map(control => `
            <div id="${control.id}_div" style="display:${control.display}">
                <input type="${control.type}" id="${control.id}" min="${control.min}" max="${control.max}" value="${control.default}" style="width:80%">
                <label for="${control.id}">${control.label}</label>
            </div>
        `).join('');
  }

  initialize() {
    this.attachEventListeners();
    this.populatePatternDropdown();
    this.attachPatternDropdownListener();
    this.refresh();
    // Listen for the modeChange event
    document.addEventListener('modeChange', (event) => {
      //console.log("Mode change detected by control panel, refreshing");
      const selectedLeds = event.detail;
      // if array is just multi do this:
      if (selectedLeds.includes('multi')) {
        this.setTargetMulti();
      } else {
        this.setTargetSingles(selectedLeds);
      }
      //console.log('mode changed:', selectedLeds);
      this.refresh(true);
      this.demoModeOnDevice();
    });
    document.addEventListener('ledsChange', (event) => {
      const selectedLeds = event.detail;
      // if array is just multi do this:
      if (selectedLeds.includes('multi')) {
        this.setTargetMulti();
      } else {
        this.setTargetSingles(selectedLeds);
      }
      //console.log('LEDs changed:', this.targetLeds);
      this.refresh(true);
    });
    document.addEventListener('deviceConnected', (event) => {
      //console.log("Control Panel detected device conneted");
      this.multiEnabled = true;
      this.populatePatternDropdown();
      this.refresh(true);
      this.vortexPort.startReading();
      this.demoModeOnDevice();
    });
  }

  setTargetSingles(selectedLeds = null) {
    if (!selectedLeds) {
      const ledCount = this.lightshow.vortex.engine().leds().ledCount();
      selectedLeds = []
      for (let i = 0; i < ledCount; i++) {
        selectedLeds.push(i.toString());
      }
    }
    this.targetLeds = selectedLeds.map(led => parseInt(led, 10));;
    this.targetLed = this.targetLeds[0];
    this.isMulti = false;
  }

  setTargetMulti() {
    this.targetLed = this.lightshow.vortex.engine().leds().ledMulti();
    this.targetLeds = [ this.targetLed ];
    this.isMulti = true;
  }

  refresh(fromEvent = false) {
    this.refreshPatternDropdown(fromEvent);
    this.refreshPatternArgs(fromEvent);
    this.refreshColorset(fromEvent);
  }

  handleControlClick(event) {
    const controlId = event.target.id;
    this.clickCounts[controlId]++;
    if (this.clickCounts[controlId] === 5) {
      if (this.sineWaveAnimations[controlId]) {
        this.stopSineWaveAnimation(controlId);
      } else {
        this.startSineWaveAnimation(controlId);
      }
      this.clickCounts[controlId] = 0;
    }
    clearTimeout(this.clickTimers[controlId]);
    this.clickTimers[controlId] = setTimeout(() => {
      this.clickCounts[controlId] = 0;
    }, 300);
  }

  startSineWaveAnimation(controlId) {
    this.sineWaveAnimations[controlId] = true;
    const slider = this.panel.querySelector(`#${controlId}`);
    const amplitude = (slider.max - slider.min) / 2; // Adjust as needed
    const frequency = 0.002; // Adjust as needed
    const centerValue = (parseInt(slider.min) + parseInt(slider.max)) / 2;
    let startTime = null;

    const animate = (timestamp) => {
      if (!this.sineWaveAnimations[controlId]) return;
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      const sineValue = Math.sin(elapsed * frequency) * amplitude;
      const newValue = centerValue + sineValue;
      slider.value = newValue;
      slider.dispatchEvent(new Event('input'));

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  stopSineWaveAnimation(controlId) {
    this.sineWaveAnimations[controlId] = false;
  }

  attachEventListeners() {
    this.controls.forEach(control => {
      const element = this.panel.querySelector(`#${control.id}`);
      element.addEventListener('input', (event) => {
        control.update(event.target.value);
      });
      element.addEventListener('click', this.handleControlClick.bind(this));
    });
    const randomizePatternButton = document.getElementById('randomizePattern');
    randomizePatternButton.addEventListener('click', () => {
      this.lightshow.randomizePattern(this.targetLeds);
      document.dispatchEvent(new CustomEvent('patternChange'));
      // refresh
      this.refreshPatternDropdown();
      this.refreshPatternArgs();
      this.refreshColorset();
      // demo on device
      this.demoModeOnDevice();
    });
    const randomizeColorsetButton = document.getElementById('randomizeColorset');
    randomizeColorsetButton.addEventListener('click', () => {
      this.lightshow.randomizeColorset(this.targetLeds);
      document.dispatchEvent(new CustomEvent('patternChange'));
      // refresh
      this.refreshPatternDropdown();
      this.refreshPatternArgs();
      this.refreshColorset();
      // demo on device
      this.demoModeOnDevice();
    });
  }

  populatePatternDropdown() {
    const dropdown = document.getElementById('patternDropdown');
    dropdown.innerHTML = '';

    // Create optgroups for each pattern type
    const strobeGroup = document.createElement('optgroup');
    strobeGroup.label = "Strobe Patterns";
    const blendGroup = document.createElement('optgroup');
    blendGroup.label = "Blend Patterns";
    const solidGroup = document.createElement('optgroup');
    solidGroup.label = "Solid Patterns";
    const multiGroup = document.createElement('optgroup');
    multiGroup.label = "MultiLed Patterns";

    // Get the PatternID enum values from your wasm module
    const patternEnum = this.lightshow.vortexLib.PatternID;

    for (let pattern in patternEnum) {
      if (patternEnum.hasOwnProperty(pattern)) {
        if (pattern === 'values' ||
            patternEnum[pattern] === patternEnum.PATTERN_NONE ||
            patternEnum[pattern] === patternEnum.PATTERN_COUNT) {
          continue;
        }
        let option = document.createElement('option');
        let str = this.lightshow.vortex.patternToString(patternEnum[pattern]);
        if (str.startsWith("complementary")) {
          str = "comp. " + str.slice(14);
        }
        option.text = str;
        option.value = patternEnum[pattern].value;
        dropdown.appendChild(option);

        if (str.includes("blend")) {
          blendGroup.appendChild(option);
        } else if (str.includes("solid")) {
          solidGroup.appendChild(option);
        } else if (patternEnum[pattern].value > patternEnum.PATTERN_SOLID.value) {
          multiGroup.appendChild(option);
        } else {
          strobeGroup.appendChild(option);
        }
      }
    }

    // Append the optgroups to the dropdown
    dropdown.appendChild(strobeGroup);
    dropdown.appendChild(blendGroup);
    dropdown.appendChild(solidGroup);
    if (this.multiEnabled) {
      dropdown.appendChild(multiGroup);
    }
  }

  attachPatternDropdownListener() {
    const dropdown = document.getElementById('patternDropdown');
    dropdown.addEventListener('change', this.handlePatternSelect.bind(this));
  }

  refreshPatternDropdown() {
    const dropdown = document.getElementById('patternDropdown');
    let cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      dropdown.value = -1;
      dropdown.disabled = true;
      return;
    }
    dropdown.disabled = false
    const pat = cur.getPatternID(this.targetLed);
    dropdown.value = pat.value;
  }

  handlePatternSelect() {
    const dropdown = document.getElementById('patternDropdown');
    if (!dropdown) {
      return;
    }
    const selectedPattern = dropdown.value;
    if (!selectedPattern) {
      return;
    }
    // the selected dropdown pattern
    const patID = this.lightshow.vortexLib.PatternID.values[selectedPattern];
    // grab the 'preview' mode for the current mode (randomizer)
    let cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      return;
    }
    const set = cur.getColorset(this.targetLed);
    // we are trying to set a single led pattern
    if (this.lightshow.vortexLib.isSingleLedPatternID(patID)) {
      // clear any multis manually when switching from multi to single
      cur.clearPattern(this.lightshow.vortex.engine().leds().ledMulti());
      // but we selected multi from the led list
      if (this.isMulti) {
        // just set the single pat ID on all
        cur.setPattern(patID, this.lightshow.vortex.engine().leds().ledCount(), null, null);
        cur.setColorset(set, this.lightshow.vortex.engine().leds().ledCount());
        // switch the led target because we switched the pattern
        this.setTargetSingles();
      } else {
        // otherwise we selected some singles to apply to
        this.targetLeds.forEach((led) => {
          cur.setPattern(patID, led, null, null);
          cur.setColorset(set, led);
        });
      }
    } else {
      // or we are actually applying a multi and it doesn't matter just apply the multi
      cur.setPattern(patID, this.lightshow.vortex.engine().leds().ledMulti(), null, null);
      cur.setColorset(set, this.lightshow.vortex.engine().leds().ledMulti());
      this.setTargetMulti();
    }
    // re-initialize the demo mode so it takes the new args into consideration
    cur.init();
    // save
    this.lightshow.vortex.engine().modes().saveCurMode();
    // notify the modes panel that we changed
    document.dispatchEvent(new CustomEvent('patternChange'));
    this.refreshPatternArgs();
    this.refreshColorset();  // Refresh the display if needed
    // demo on device
    this.demoModeOnDevice();
  }

  async refreshColorset(fromEvent = false) {
    const colorsetElement = document.getElementById("colorset");
    let cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      colorsetElement.textContent = '';
      return;
    }
    let colorsetHtml = '';
    let dropdown = document.getElementById('patternDropdown');
    const pat = cur.getPatternID(this.targetLed);
    dropdown.value = pat.value;
    const set = cur.getColorset(this.targetLed);
    let numCol = set.numColors();
    if (numCol) {
      for (var i = 0; i < numCol; ++i) {
        let col = set.get(i);
        const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1)}`.toUpperCase();
        colorsetHtml += `<div class="color-container">
                            <span class="delete-color" data-index="${i}">&times;</span>
                            <div class="color-entry" data-index="${i}" style="background-color: ${hexColor};"></div>
                            <label>${hexColor}</label>
                          </div>`;
      }
    }
    if (!numCol || numCol < 8) {
      colorsetHtml += `
                    <div class="color-container add-color">
                        +
                    </div>`;
    }

    colorsetElement.innerHTML = colorsetHtml;

    // Attach event listeners for color entries
    const colorEntries = colorsetElement.querySelectorAll('.color-entry');
    colorEntries.forEach((entry, idx) => {
      entry.addEventListener('click', () => {
        const cur = this.lightshow.vortex.engine().modes().curMode();
        if (!cur) {
          return;
        }
        const set = cur.getColorset(this.targetLed);
        this.colorPicker.openColorPickerModal(idx, set, (index, color, dragging) => this.updateColor(index, color, dragging));
      });
    });

    // Attach event listeners for del col buttons
    const deleteButtons = colorsetElement.querySelectorAll('.delete-color');
    deleteButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.delColor(Number(button.getAttribute('data-index')));
        document.dispatchEvent(new CustomEvent('patternChange'));
      });
    });

    // Attach event listeners for add col button
    const addButton = colorsetElement.querySelector('.add-color');
    if (addButton) {
      addButton.addEventListener('click', () => {
        this.addColor();
        document.dispatchEvent(new CustomEvent('patternChange'));
      });
    }
  }

  updateColor(index, hexValue, isDragging) {
    let hex = hexValue.replace(/^#/, '');
    let bigint = parseInt(hex, 16);
    let r = (bigint >> 16) & 255;
    let g = (bigint >> 8) & 255;
    let b = bigint & 255;
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      return;
    }
    let set = cur.getColorset(this.targetLed);
    let col = new this.lightshow.vortexLib.RGBColor(r, g, b);
    set.set(index, col);
    this.targetLeds.forEach(led => {
      cur.setColorset(set, led);
    });
    // re-initialize the demo mode because num colors may have changed
    cur.init();
    // save
    this.lightshow.vortex.engine().modes().saveCurMode();
    // refresh
    this.refreshColorset();
    console.log("Update: " + isDragging + ", " + col);
    if (isDragging) {
      this.demoColorOnDevice(col);
    } else {
      // demo on device
      this.demoModeOnDevice();
    }
  }

  async demoColorOnDevice(color) {
    try {
      await this.vortexPort.demoColor(this.lightshow.vortexLib, this.lightshow.vortex, color);
    } catch (error) {
      Notification.failure("Failed to demo color (" + error + ")");
    }
  }

  async demoModeOnDevice() {
    try {
      await this.vortexPort.demoCurMode(this.lightshow.vortexLib, this.lightshow.vortex);
    } catch (error) {
      Notification.failure("Failed to demo mode (" + error + ")");
    }
  }

  getTooltipText(sliderName) {
    const descriptions = {
      "on duration": "This determines how long the LED light stays 'on' during each blink. Think of it like the length of time each color shows up when the LED is cycling through colors.",
      "off duration": "This is the amount of time the LED light stays 'off' between each blink. It's like the pause or gap between each color as the LED cycles.",
      "gap duration": "After the LED completes one full cycle of colors, this sets the length of the pause before it starts the next cycle.",
      "dash duration": "After the main gap, this adds an extra 'on' period. Imagine it as an additional burst of light after the cycle completes.",
      "group size": "This is the amount of on-off blinks in a cycle. If this is 0, it will use the number of colors. This will do nothing if gap is 0",
      "blend speed": "This controls the speed at which the LED transitions or blends from one color to the next. If it's set to 0, the LED will stay on a single color without moving to the next.",
      "num flips": "Every other blink the LED will show a hue that's related to the current color. This setting controls how many times that happens.",
      "col index": "If you're using a solid pattern, this decides which specific color from the colorset will be displayed. For example, if you set it to 0, it will pick the first color; if 1, the second, and so on.",
      // Add more slider names and their descriptions as needed
    }
    return descriptions[sliderName] || "Description not available"; // Default text if no description is found
  }

  getTooltipNiceName(sliderName) {
    // these names come from vortexlib we give them nicer names for labaels
    const nicerNames = {
      "on duration": "Blink On Duration",
      "off duration": "Blink Off Duration",
      "gap duration": "Blink Gap Duration",
      "dash duration": "Blink Dash Duration",
      "group size": "Blink Group Size",
      "blend speed": "Blend Speed",
      "num flips": "Blend Flip Count",
      "col index": "Solid Color Index",
      // Add more slider names and their descriptions as needed
    };
    return nicerNames[sliderName] || "Name not available"; // Default text if no description is found
  }

  async refreshPatternArgs(fromEvent = false) {
    const paramsDiv = document.getElementById('patternParams');
    const patternID = this.lightshow.vortexLib.PatternID.values[document.getElementById('patternDropdown').value];
    if (!patternID) {
      // Clear existing parameters
      paramsDiv.innerHTML = '';
      return;
    }
    const numOfParams = this.lightshow.vortex.numCustomParams(patternID);
    let customParams = this.lightshow.vortex.getCustomParams(patternID);
    // Clear existing parameters
    paramsDiv.innerHTML = '';
    let cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      // Clear existing parameters
      paramsDiv.innerHTML = '';
      return;
    }

    for (let i = 0; i < numOfParams; i++) {
      const container = document.createElement('div');
      container.className = 'param-container';
      const label = document.createElement('label');
      let sliderName = customParams.get(i).slice(2)
                                          .replace(/([a-z])([A-Z])/g, '$1 $2')
                                          .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
                                          .toLowerCase();
      label.textContent = this.getTooltipNiceName(sliderName);
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'param-slider';
      if (sliderName === 'on duration') {
        // on duration cannot be 0, it can but it kinda breaks stuff
        slider.min = '1';
      } else {
        slider.min = '0';
      }
      slider.max = '255';
      slider.step = '1';
      slider.value = cur.getArg(i, this.targetLed) || '0';

      // Display value
      const displayValue = document.createElement('span');
      displayValue.className = 'slider-value';
      displayValue.textContent = slider.value;

      // Description of what the slider does
      const helpIcon = document.createElement('i');
      helpIcon.className = 'fas fa-question-circle help-icon';
      helpIcon.setAttribute('data-tooltip', this.getTooltipText(sliderName));  // Modify this line for each slider's specific tooltip content.
      helpIcon.onclick = () => { this.toggleTooltip(helpIcon); };

      helpIcon.addEventListener('click', function(event) {
        event.stopPropagation();  // Prevent the document click event from immediately hiding the tooltip
      });

      const labelContainer = document.createElement('div');
      labelContainer.className = 'label-container';
      labelContainer.appendChild(label);
      labelContainer.appendChild(helpIcon);

      const sliderContainer = document.createElement('div');
      sliderContainer.className = 'slider-container';
      sliderContainer.appendChild(slider);
      sliderContainer.appendChild(displayValue);

      container.appendChild(labelContainer);
      container.appendChild(sliderContainer);
      paramsDiv.appendChild(container);

      // Event for slider
      slider.addEventListener('input', (event) => {
        const paramName = label.textContent.replace(/([a-z])([A-Z])/g, '$1 $2')
                                           .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
                                           .toLowerCase();
        displayValue.textContent = event.target.value;  // Update the displayed value
        let cur = this.lightshow.vortex.engine().modes().curMode();
        this.targetLeds.forEach((led) => {
          let pat = cur.getPattern(led);
          pat.setArg(i, event.target.value);
        });
      });
      slider.addEventListener('change', async () => {
        // init
        cur.init();
        // save
        this.lightshow.vortex.engine().modes().saveCurMode();
        // send to device
        document.dispatchEvent(new CustomEvent('patternChange'));
        // demo on device
        this.demoModeOnDevice();
      });
    }
  }

  toggleTooltip(element) {
    const tooltipText = element.getAttribute('data-tooltip');
    if (!tooltipText) return;

    // Check if a tooltip is currently displayed
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'tooltip';
      document.body.appendChild(this.tooltip);
    }

    this.tooltip.textContent = tooltipText;
    this.tooltip.style.left = (element.getBoundingClientRect().left + window.scrollX + 30) + 'px';
    this.tooltip.style.top = (element.getBoundingClientRect().top + window.scrollY - 5) + 'px';
    this.tooltip.style.display = 'block';

    // click anywhere -> hide tooltip
    document.addEventListener('click', (event) => {
      if (!event.target.classList.contains('help-icon')) {
        this.tooltip.style.display = 'none';
      }
    });
  }

  addColor() {
    this.lightshow.addColor(255, 255, 255, this.targetLeds);
    this.refreshColorset();
    // demo on device
    this.demoModeOnDevice();
  }

  delColor(index) {
    const cur = this.lightshow.vortex.engine().modes().curMode();
    if (!cur) {
      return;
    }
    let set = cur.getColorset(this.targetLed);
    if (set.numColors() <= 0) {
      return;
    }
    set.removeColor(index);
    this.targetLeds.forEach(led => {
      cur.setColorset(set, led);
    });
    // re-initialize the demo mode because num colors may have changed
    cur.init();
    // save
    this.lightshow.vortex.engine().modes().saveCurMode();
    // refresh
    this.refreshColorset();
    // demo on device
    this.demoModeOnDevice();
  }

  randomize() {
    this.lightshow.randomize();
    // refresh
    this.refreshPatternDropdown();
    this.refreshPatternArgs();
    this.refreshColorset();
    // demo on device
    this.demoModeOnDevice();
  }
}

