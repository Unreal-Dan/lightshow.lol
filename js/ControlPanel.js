import Panel from './Panel.js';
import Modal from './Modal.js';
import Notification from './Notification.js';
import ColorPicker from './ColorPicker.js';

export default class ControlPanel extends Panel {
  constructor(lightshow, vortexPort) {
    const content = `
  <fieldset>
    <legend>Pattern</legend>
    <div id="patternDropdownContainer">
      <select id="patternDropdown"></select>
    </div>
    <div id="patternParams" class="grid-container"></div>
  </fieldset>
  <fieldset>
    <legend>Colorset</legend>
    <div id="colorset" class="grid-container"></div>
  </fieldset>
        `;

    super('controlPanel', content);
    this.lightshow = lightshow;
    this.vortexPort = vortexPort;
    this.targetLed = 0;
    this.targetLeds = [ this.targetLed ];
    this.isMulti = false;
    this.multiEnabled = true;
    // Add click tracking variables for each control
    this.clickCounts = {};
    this.clickTimers = {};
    this.sineWaveAnimations = {};

    // Instantiate the ColorPicker
    this.colorPicker = new ColorPicker(lightshow);
  }

  initialize() {
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
        if (pattern === 'values' || pattern === 'argCount' ||
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
    const colorsetElement = document.getElementById('colorset');
    const cur = this.lightshow.vortex.engine().modes().curMode();
    colorsetElement.innerHTML = ''; // Clear colorset

    if (!cur) {
      return;
    }

    const set = cur.getColorset(this.targetLed);
    const numColors = set ? set.numColors() : 0;

    for (let i = 0; i < numColors; i++) {
      const container = document.createElement('div');
      container.className = 'color-container';

      const col = set.get(i);
      const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1).toUpperCase()}`;

      // Create color entry
      const colorEntry = document.createElement('div');
      colorEntry.style.backgroundColor = hexColor;
      colorEntry.className = 'color-entry';
      colorEntry.dataset.index = i;
      colorEntry.addEventListener('click', () =>
        this.colorPicker.openColorPickerModal(i, set, this.updateColor.bind(this))
      );

      // Create hex label
      const hexLabel = document.createElement('label');
      hexLabel.textContent = hexColor;

      // Create delete button
      const deleteButton = document.createElement('span');
      deleteButton.className = 'delete-color';
      deleteButton.dataset.index = i;
      deleteButton.textContent = '×';
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering color picker
        this.delColor(Number(deleteButton.dataset.index));
        document.dispatchEvent(new CustomEvent('patternChange'));
      });

      // Append elements to container
      container.appendChild(deleteButton);
      container.appendChild(colorEntry);
      container.appendChild(hexLabel);

      colorsetElement.appendChild(container);
    }

    // Add empty slots for adding colors
    if (numColors < 8) {
      const addColorContainer = document.createElement('div');
      addColorContainer.className = 'color-container add-color';
      addColorContainer.textContent = '+';
      addColorContainer.addEventListener('click', () => {
        this.addColor();
        document.dispatchEvent(new CustomEvent('patternChange'));
      });
      colorsetElement.appendChild(addColorContainer);
    }
  }

  // Helper: Update Color from Hex Input
  updateColorHex(index, hexValue) {
    const cur = this.lightshow.vortex.engine().modes().curMode();
    const set = cur.getColorset(this.targetLed);
    const color = this.hexToRGB(hexValue);
    set.set(index, new this.lightshow.vortexLib.RGBColor(color.r, color.g, color.b));
    cur.init();
    this.refreshColorset();
  }

  // Helper: Convert Hex to RGB
  hexToRGB(hex) {
    let bigint = parseInt(hex.replace(/^#/, ''), 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
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
    if (isDragging) {
      this.demoColorOnDevice(col);
    } else {
      // demo on device
      this.demoModeOnDevice();
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
      // hueshift
      "blink on duration": "Blink On Duration",
      "blink off duration": "Blink Off Duration",
      "blend delay": "Blend Delay",
      // theatre_case
      "step duration": "Step Duration",
      // zigzag
      "snake size": "Snake Size",
      "fade amount": "Fade Amount",
      // dripmorph
      "speed": "Speed",
      // lighthouse
      "fade rate": "Fade Rate",
      // pulsish
      "on duration1": "On Duration 1",
      "off duration1": "Off Duration 1",
      "on duration2": "On Duration 2",
      "off duration2": "Off Duration 2",
      // split strobie
      "first pattern args.arg1": "First Pattern Arg 1",
      "first pattern args.arg2": "First Pattern Arg 2",
      "first pattern args.arg3": "First Pattern Arg 3",
      "second pattern args.arg1": "Second Pattern Arg 1",
      "second pattern args.arg2": "Second Pattern Arg 2",
      "first pat": "First Pattern ID",
      "sec pat": "Second Pattern ID",
      // Add more slider names and their descriptions as needed
    };
    return nicerNames[sliderName] || sliderName; // Default text if no description is found
  }

  //async refreshPatternArgs(fromEvent = false) {
  //  const paramsDiv = document.getElementById('patternParams');
  //  const patternID = this.lightshow.vortexLib.PatternID.values[document.getElementById('patternDropdown').value];
  //  if (!patternID) {
  //    // Clear existing parameters
  //    paramsDiv.innerHTML = '';
  //    return;
  //  }
  //  const numOfParams = this.lightshow.vortex.numCustomParams(patternID);
  //  let customParams = this.lightshow.vortex.getCustomParams(patternID);
  //  // Clear existing parameters
  //  paramsDiv.innerHTML = '';
  //  let cur = this.lightshow.vortex.engine().modes().curMode();
  //  if (!cur) {
  //    // Clear existing parameters
  //    paramsDiv.innerHTML = '';
  //    return;
  //  }

  //  for (let i = 0; i < numOfParams; i++) {
  //    const container = document.createElement('div');
  //    container.className = 'param-container';
  //    const label = document.createElement('label');
  //    let sliderName = customParams.get(i).slice(2)
  //                                        .replace(/([a-z])([A-Z])/g, '$1 $2')
  //                                        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
  //                                        .toLowerCase();
  //    label.textContent = this.getTooltipNiceName(sliderName);
  //    const slider = document.createElement('input');
  //    slider.type = 'range';
  //    slider.className = 'param-slider';
  //    if (sliderName === 'on duration') {
  //      // on duration cannot be 0, it can but it kinda breaks stuff
  //      slider.min = '1';
  //    } else {
  //      slider.min = '0';
  //    }
  //    slider.max = '255';
  //    slider.step = '1';
  //    slider.value = cur.getArg(i, this.targetLed) || '0';

  //    // Display value
  //    const displayValue = document.createElement('span');
  //    displayValue.className = 'slider-value';
  //    displayValue.textContent = slider.value;

  //    // Description of what the slider does
  //    const helpIcon = document.createElement('i');
  //    helpIcon.className = 'fas fa-question-circle help-icon';
  //    helpIcon.setAttribute('data-tooltip', this.getTooltipText(sliderName));  // Modify this line for each slider's specific tooltip content.
  //    helpIcon.onclick = () => { this.toggleTooltip(helpIcon); };

  //    helpIcon.addEventListener('click', function(event) {
  //      event.stopPropagation();  // Prevent the document click event from immediately hiding the tooltip
  //    });

  //    const labelContainer = document.createElement('div');
  //    labelContainer.className = 'label-container';
  //    labelContainer.appendChild(label);
  //    labelContainer.appendChild(helpIcon);

  //    const sliderContainer = document.createElement('div');
  //    sliderContainer.className = 'slider-container';
  //    sliderContainer.appendChild(slider);
  //    sliderContainer.appendChild(displayValue);

  //    container.appendChild(labelContainer);
  //    container.appendChild(sliderContainer);
  //    paramsDiv.appendChild(container);

  //    // Event for slider
  //    slider.addEventListener('input', (event) => {
  //      const paramName = label.textContent.replace(/([a-z])([A-Z])/g, '$1 $2')
  //                                         .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
  //                                         .toLowerCase();
  //      displayValue.textContent = event.target.value;  // Update the displayed value
  //      let cur = this.lightshow.vortex.engine().modes().curMode();
  //      this.targetLeds.forEach((led) => {
  //        let pat = cur.getPattern(led);
  //        pat.setArg(i, event.target.value);
  //      });
  //    });
  //    slider.addEventListener('change', async () => {
  //      // init
  //      cur.init();
  //      // save
  //      this.lightshow.vortex.engine().modes().saveCurMode();
  //      // send to device
  //      document.dispatchEvent(new CustomEvent('patternChange'));
  //      // demo on device
  //      this.demoModeOnDevice();
  //    });
  //  }
  //}
  async refreshPatternArgs(fromEvent = false) {
    const paramsDiv = document.getElementById('patternParams');
    const patternID = this.lightshow.vortexLib.PatternID.values[document.getElementById('patternDropdown').value];
    if (!patternID) {
      paramsDiv.innerHTML = this.generateEmptySlots(7); // Fill with placeholders up to max 7
      return;
    }

    const numOfParams = this.lightshow.vortex.numCustomParams(patternID);
    let customParams = this.lightshow.vortex.getCustomParams(patternID);
    paramsDiv.innerHTML = ''; // Clear existing params

    for (let i = 0; i < 7; i++) { // Fixed 7 slots for layout consistency
      const container = document.createElement('div');
      container.className = 'param-container';

      if (i < numOfParams) {
        let sliderName = customParams.get(i)
          .slice(2)
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
          .toLowerCase();

        const label = document.createElement('label');
        label.textContent = this.getTooltipNiceName(sliderName);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '255';
        slider.step = '1';
        slider.value = this.lightshow.vortex.engine().modes().curMode().getArg(i, this.targetLed) || '0';
        slider.className = 'custom-slider';

        const textbox = document.createElement('input');
        textbox.type = 'number';
        textbox.min = slider.min;
        textbox.max = slider.max;
        textbox.value = slider.value;
        textbox.className = 'custom-textbox';

        // Sync slider and textbox values
        slider.addEventListener('input', (event) => {
          textbox.value = event.target.value;
          this.updatePatternArg(i, event.target.value);
        });
        textbox.addEventListener('input', (event) => {
          slider.value = event.target.value;
          this.updatePatternArg(i, event.target.value);
        });

        container.appendChild(label);
        container.appendChild(slider);
        container.appendChild(textbox);
      }

      paramsDiv.appendChild(container);
    }
  }

  // Helper: Update Pattern Argument
  updatePatternArg(index, value) {
    const cur = this.lightshow.vortex.engine().modes().curMode();
    this.targetLeds.forEach((led) => {
      cur.getPattern(led).setArg(index, value);
    });
    cur.init();
    this.lightshow.vortex.engine().modes().saveCurMode();
    document.dispatchEvent(new CustomEvent('patternChange'));
    this.demoModeOnDevice();
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

