import Panel from './Panel.js';

export default class PatternPanel extends Panel {
  constructor(editor) {
    const content = `
        <div id="patternDropdownContainer">
          <select id="patternDropdown"></select>
          <div class="pattern-buttons">
            <button id="patternRandomizeButton" class="icon-button" title="Randomize">
              <i class="fa-solid fa-dice"></i>
            </button>
          </div>
        </div>
        <hr id="patternDivider">
        <div id="patternParams" class="grid-container"></div>
    `;
    super('patternPanel', content, 'Pattern');
    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
    this.targetLed = 0;
    this.targetLeds = [this.targetLed];
    this.multiEnabled = false;
    this.isMulti = false;
  }

  initialize() {
    this.populatePatternDropdown();
    this.attachPatternDropdownListener();
    this.refresh();
    document.addEventListener('modeChange', this.handleModeChange.bind(this));
    document.addEventListener('ledsChange', this.handleLedsChange.bind(this));
    document.addEventListener('deviceChange', this.handleDeviceEvent.bind(this));

    // Attach event listeners for help and randomize buttons
    document.getElementById('patternRandomizeButton').addEventListener('click', () => this.randomizePattern());
  }

  randomizePattern() {
    const dropdown = document.getElementById('patternDropdown');
    const options = Array.from(dropdown.options);
    const randomOption = options[Math.floor(Math.random() * options.length)];

    if (randomOption) {
      dropdown.value = randomOption.value;
      this.handlePatternSelect(); // Apply the random pattern
    }
  }

  handleModeChange(event) {
    const selectedLeds = event.detail;
    if (selectedLeds.includes('multi')) {
      this.setTargetMulti();
    } else {
      this.setTargetSingles(selectedLeds);
    }
    this.populatePatternDropdown();
    this.refresh(true);
    this.editor.demoModeOnDevice();
  }

  handleLedsChange(event) {
    const selectedLeds = event.detail;
    if (selectedLeds.includes('multi')) {
      this.setTargetMulti();
    } else {
      this.setTargetSingles(selectedLeds);
    }
    this.populatePatternDropdown();
    this.refresh(true);
  }

  handleDeviceEvent(deviceChangeEvent) {
    // Access the custom data from `event.detail`
    const { deviceEvent, deviceName } = deviceChangeEvent.detail;
    if (deviceEvent === 'waiting') {
      this.onDeviceWaiting(deviceName);
    } else if (deviceEvent === 'connect') {
      this.onDeviceConnect(deviceName);
    } else if (deviceEvent === 'disconnect') {
      this.onDeviceDisconnect(deviceName);
    }
  }

  onDeviceWaiting(deviceName) {
    // nothing yet
  }

  onDeviceConnect(deviceName) {
    this.multiEnabled = true;
    this.populatePatternDropdown();
    this.refresh(true);
    // uh is this supposed to be here?
    this.vortexPort.startReading();
    this.editor.demoModeOnDevice();
  }

  onDeviceDisconnect(deviceName) {
    // nothing yet
  }

  setTargetSingles(selectedLeds = null) {
    const ledCount = this.lightshow.vortex.engine().leds().ledCount();
    this.targetLeds = (selectedLeds || Array.from({ length: ledCount }, (_, i) => i.toString()))
      .map(led => parseInt(led, 10));
    this.targetLed = this.targetLeds[0];
    this.isMulti = false;
  }

  setTargetMulti() {
    this.targetLed = this.lightshow.vortex.engine().leds().ledMulti();
    this.targetLeds = [this.targetLed];
    this.isMulti = true;
  }

  refresh() {
    this.refreshPatternDropdown();
    this.refreshPatternArgs();
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
    multiGroup.label = "Special Patterns (Multi Led)";

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

    if (this.editor.devicePanel.selectedDevice !== 'None') {
      dropdown.appendChild(multiGroup);
    }
  }

  attachPatternDropdownListener() {
    const dropdown = document.getElementById('patternDropdown');
    dropdown.addEventListener('change', this.handlePatternSelect.bind(this));
  }

  refreshPatternDropdown() {
    const dropdown = document.getElementById('patternDropdown');
    const curMode = this.lightshow.vortex.engine().modes().curMode();
    if (!curMode) {
      dropdown.value = -1;
      dropdown.disabled = true;
      return;
    }
    dropdown.disabled = false;
    dropdown.value = curMode.getPatternID(this.targetLed).value;
  }

  handlePatternSelect() {
    const dropdown = document.getElementById('patternDropdown');
    const selectedPattern = dropdown.value;
    const curMode = this.lightshow.vortex.engine().modes().curMode();
    const patID = this.lightshow.vortexLib.PatternID.values[selectedPattern];
    if (!curMode || !patID) return;

    const set = curMode.getColorset(this.targetLed);

    if (this.lightshow.vortexLib.isSingleLedPatternID(patID)) {
      curMode.clearPattern(this.lightshow.vortex.engine().leds().ledMulti());
      if (this.isMulti) {
        curMode.setPattern(patID, this.lightshow.vortex.engine().leds().ledCount(), null, null);
        curMode.setColorset(set, this.lightshow.vortex.engine().leds().ledCount());
        this.setTargetSingles();
      } else {
        this.targetLeds.forEach(led => {
          curMode.setPattern(patID, led, null, null);
          curMode.setColorset(set, led);
        });
      }
    } else {
      curMode.setPattern(patID, this.lightshow.vortex.engine().leds().ledMulti(), null, null);
      curMode.setColorset(set, this.lightshow.vortex.engine().leds().ledMulti());
      this.setTargetMulti();
    }
    curMode.init();
    this.lightshow.vortex.engine().modes().saveCurMode();
    document.dispatchEvent(new CustomEvent('patternChange'));
    this.refreshPatternArgs();
    this.editor.demoModeOnDevice();
  }

  refreshPatternArgs() {
    const paramsDiv = document.getElementById('patternParams');
    const curMode = this.lightshow.vortex.engine().modes().curMode();
    const patternID = this.lightshow.vortexLib.PatternID.values[document.getElementById('patternDropdown').value];

    if (!curMode || !patternID) {
      paramsDiv.innerHTML = this.generateEmptySlots(7);
      return;
    }

    const numOfParams = this.lightshow.vortex.numCustomParams(patternID);
    paramsDiv.innerHTML = ''; // Clear existing params

    for (let i = 0; i < 7; i++) {
      const container = document.createElement('div');
      container.className = 'control-line';
      const isDisabled = i >= numOfParams;

      const sliderContainer = document.createElement('div');
      sliderContainer.className = 'control-slider-container';
      if (isDisabled) sliderContainer.classList.add('disabled');

      const label = document.createElement('span');
      label.className = 'control-label';

      let customParams = this.lightshow.vortex.getCustomParams(patternID);
      const param = customParams.get(i)
      if (param) {
        // convert to all lowercase cleaned version
        const sliderNameClean = param.slice(2)
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
          .toLowerCase();
        // lookup the friendly nice name with clean version
        label.textContent = this.getTooltipNiceName(sliderNameClean);
      }

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '255';
      slider.value = isDisabled ? 0 : curMode.getArg(i, this.targetLed) || '0';
      slider.className = 'control-slider';
      this.updateSliderFill(slider); // Set initial gradient

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '255';
      input.value = slider.value;
      input.className = `control-input ${isDisabled ? 'disabled' : ''}`;
      if (isDisabled) {
        input.disabled = true;
        slider.disabled = true;
      }

      // Sync slider and input values
      slider.addEventListener('input', (e) => {
        input.value = e.target.value;
        this.updatePatternArg(i, e.target.value);
        this.updateSliderFill(slider); // Update gradient
      });
      input.addEventListener('input', (e) => {
        slider.value = e.target.value;
        this.updatePatternArg(i, e.target.value);
        this.updateSliderFill(slider); // Update gradient
      });

      sliderContainer.append(label, slider);
      container.append(sliderContainer, input);
      paramsDiv.appendChild(container);
    }
  }

  updateSliderFill(slider) {
    const value = slider.value;
    const max = slider.max || 255; // Default max to 255
    const percent = (value / max) * 100; // Calculate fill percentage
    slider.style.setProperty('--slider-fill', `${percent}%`);
  }

  updatePatternArg(index, value) {
    const curMode = this.lightshow.vortex.engine().modes().curMode();
    if (!curMode) return;
    this.targetLeds.forEach(led => {
      curMode.getPattern(led).setArg(index, value);
    });
    curMode.init();
    this.lightshow.vortex.engine().modes().saveCurMode();
    document.dispatchEvent(new CustomEvent('patternChange'));
    this.editor.demoModeOnDevice();
  }

  generateEmptySlots(max) {
    return Array.from({ length: max }, () => `<div class="control-line empty-slot"></div>`).join('');
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
      "on duration": "'On' Duration",
      "off duration": "'Off' Duration",
      "gap duration": "'Gap' Duration",
      "dash duration": "'Dash' Duration",
      "group size": "Group Size",
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
      "on duration1": "'On' Duration 1",
      "off duration1": "'Off' Duration 1",
      "on duration2": "'On' Duration 2",
      "off duration2": "'Off' Duration 2",
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
}

