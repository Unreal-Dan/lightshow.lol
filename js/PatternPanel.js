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
      <button id="togglePatternParams" class="icon-button" title="Show/Hide Advanced">
        <i class="fa-solid fa-chevron-down"></i>
      </button>
      <div id="patternParams" class="grid-container hidden"></div>
    `;
    super(editor, 'patternPanel', content, 'Pattern');
    this.editor = editor;
  }

  initialize() {
    this.populatePatternDropdown();
    this.attachPatternDropdownListener();
    this.refresh();
    document.addEventListener('modeChange', this.handleModeChange.bind(this));
    document.addEventListener('ledsChange', this.handleLedsChange.bind(this));

    // Attach event listeners for help and randomize buttons
    document.getElementById('patternRandomizeButton').addEventListener('click', () => this.randomizePattern());

    // Toggle pattern parameters visibility
    const toggleButton = document.getElementById('togglePatternParams');
    toggleButton.addEventListener('click', () => this.togglePatternParams());
  }

  togglePatternParams(propagate = true) {
    const patternPanel = document.getElementById('patternPanel');
    const patternParams = document.getElementById('patternParams');
    const toggleButton = document.getElementById('togglePatternParams');

    // Step 1: Capture the previous height and identify snapped panels
    const previousHeight = patternPanel.offsetHeight;
    const snappedPanels = this.getSnappedPanels(); // Identify panels based on the current height

    // Step 2: Toggle the visibility
    const isHidden = patternParams.classList.toggle('hidden');

    // Update the toggle button icon
    const icon = toggleButton.querySelector('i');
    if (isHidden) {
      icon.classList.remove('fa-chevron-up');
      icon.classList.add('fa-chevron-down');
    } else {
      icon.classList.remove('fa-chevron-down');
      icon.classList.add('fa-chevron-up');
    }

    if (propagate) {
      // Step 3: Calculate the new height
      const heightChange = patternPanel.offsetHeight - previousHeight;
      // Step 4: Move snapped panels after the height change
      snappedPanels.forEach((otherPanel) => {
        otherPanel.moveSnappedPanels(heightChange);
        const currentTop = parseFloat(otherPanel.panel.style.top || otherPanel.panel.getBoundingClientRect().top);
        otherPanel.panel.style.top = `${currentTop + heightChange}px`;
      });
    }
  }

  randomizePattern() {
    const dropdown = document.getElementById('patternDropdown');
    const options = Array.from(dropdown.options);
    const randomOption = options[Math.floor(Math.random() * options.length)];

    if (!this.getTargetLeds().length) {
      return;
    }

    if (randomOption) {
      dropdown.value = randomOption.value;
      this.handlePatternSelect(); // Apply the random pattern
    }
  }

  handleModeChange(event) {
    console.log(`${this.panel.title} Handling: [${event.type}]`);
    const selectedLeds = event.detail;
    this.populatePatternDropdown();
    this.refresh();
    //this.editor.demoModeOnDevice();
  }

  handleLedsChange(event) {
    console.log(`${this.panel.title} Handling: [${event.type}]`);
    const { targetLeds, mainSelectedLed } = event.detail;
    this.populatePatternDropdown();
    this.refresh(mainSelectedLed);
  }

  async onDeviceConnect(deviceName) {
    // nothing yet
  }

  async onDeviceDisconnect(deviceName) {
    // nothing yet
  }

  async onDeviceSelected(deviceName) {
    // when switching to device none make sure multi-led pat isnt selected
    if (deviceName !== 'None') {
      return;
    }
    const curMode = this.editor.vortex.engine().modes().curMode();
    if (!curMode || !curMode.isMultiLed()) {
      return;
    }
    const dropdown = document.getElementById('patternDropdown');
    dropdown.value = 0;
    this.handlePatternSelect();
  }

  refresh(sourceLed = null) {
    this.refreshPatternDropdown(sourceLed);
    this.refreshPatternArgs(sourceLed);
  }

  populatePatternDropdown() {
    const dropdown = document.getElementById('patternDropdown');
    if (!dropdown) {
      return;
    }
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
    const patternEnum = this.editor.vortexLib.PatternID;

    for (let pattern in patternEnum) {
      if (patternEnum.hasOwnProperty(pattern)) {
        if (pattern === 'values' || pattern === 'argCount' ||
          patternEnum[pattern] === patternEnum.PATTERN_NONE ||
          patternEnum[pattern] === patternEnum.PATTERN_COUNT) {
          continue;
        }
        let option = document.createElement('option');
        let str = this.editor.vortex.patternToString(patternEnum[pattern]);
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

    const device = this.editor.devicePanel.selectedDevice;
    if (device !== 'None' && device !== 'Duo') {
      dropdown.appendChild(multiGroup);
    }
  }

  attachPatternDropdownListener() {
    const dropdown = document.getElementById('patternDropdown');
    dropdown.addEventListener('change', this.handlePatternSelect.bind(this));
  }

  getTargetLeds() {
    return this.editor.ledSelectPanel.getSelectedLeds();
  }

  getMainSelectedLed() {
    return this.editor.ledSelectPanel.getMainSelectedLed();
  }

  showEmptyPanel() {
    const curMode = this.editor.vortex.engine().modes().curMode();
    const placeholderOption = document.createElement('option');
    placeholderOption.textContent = curMode ? 'Select Leds First' : 'Add Modes First';
    placeholderOption.value = '-1';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    const dropdown = document.getElementById('patternDropdown');
    dropdown.appendChild(placeholderOption);
    dropdown.disabled = true;
    dropdown.value = -1;
  }

  refreshPatternDropdown(sourceLed = null) {
    if (sourceLed === null) {
      sourceLed = this.getMainSelectedLed();
    }
    const dropdown = document.getElementById('patternDropdown');
    if (!dropdown) {
      return;
    }
    const curMode = this.editor.vortex.engine().modes().curMode();
    if (curMode === null || sourceLed === null) {
      this.showEmptyPanel();
      return;
    }
    dropdown.disabled = false;
    dropdown.value = curMode.getPatternID(sourceLed).value;
  }

  handlePatternSelect() {
    const dropdown = document.getElementById('patternDropdown');
    const selectedPattern = dropdown.value;
    const curMode = this.editor.vortex.engine().modes().curMode();
    const patID = this.editor.vortexLib.PatternID.values[selectedPattern];
    const sourceLed = this.getMainSelectedLed();
    if (curMode === null || patID === null || sourceLed === null) {
      return;
    }

    const set = curMode.getColorset(sourceLed);
    const multiIndex = this.editor.vortex.engine().leds().ledMulti();
    const isMulti = curMode.isMultiLed();

    if (this.editor.vortexLib.isSingleLedPatternID(patID)) {
      // if currently on a multi then need to do some extra steps
      if (isMulti) {
        // clear the multi
        curMode.clearPattern(multiIndex);
        // this will switch back to displaying singles and select them all
        // so that getTargetLeds will return all singles
        this.editor.ledSelectPanel.switchToSelectSingles();
        const allLeds = this.editor.vortex.engine().leds().ledCount();
        curMode.setPattern(patID, allLeds, null, null);
        curMode.setColorset(set, allLeds);
      } else {
        // iterate all target leds and update
        this.getTargetLeds().forEach(led => {
          curMode.setPattern(patID, led, null, null);
          curMode.setColorset(set, led);
        });
      }
    } else {
      curMode.setPattern(patID, multiIndex, null, null);
      curMode.setColorset(set, multiIndex);
      this.editor.ledSelectPanel.switchToSelectMulti();
    }
    curMode.init();
    this.editor.vortex.engine().modes().saveCurMode();
    document.dispatchEvent(new CustomEvent('patternChange'));
    this.refreshPatternArgs();
    this.editor.demoModeOnDevice();
    return;
  }

  refreshPatternArgs(sourceLed = null) {
    const mainLed = this.getMainSelectedLed();
    if (mainLed === null) {
      // this shouldn't happen but just in case
      return;
    }
    const paramsDiv = document.getElementById('patternParams');
    const patternDropdown = document.getElementById('patternDropdown');
    if (!paramsDiv || !patternDropdown) {
      return;
    }
    const curMode = this.editor.vortex.engine().modes().curMode();
    const patternID = this.editor.vortexLib.PatternID.values[patternDropdown.value];

    if (!curMode || !patternID) {
      paramsDiv.innerHTML = this.generateEmptySlots(7);
      return;
    }

    const numOfParams = this.editor.vortex.numCustomParams(patternID);
    paramsDiv.innerHTML = ''; // Clear existing params

    const isMobile = this.editor.detectMobile(); // Check for mobile layout

    for (let i = 0; i < 7; i++) {
      const container = document.createElement('div');
      container.className = 'control-line';
      const isDisabled = i >= numOfParams;

      const sliderContainer = document.createElement('div');
      sliderContainer.className = 'control-slider-container';
      if (isDisabled) sliderContainer.classList.add('disabled');

      const label = document.createElement('span');
      label.className = 'control-label';

      let customParams = this.editor.vortex.getCustomParams(patternID);
      const param = customParams.get(i);
      if (param) {
        // Convert to a user-friendly label
        const sliderNameClean = param.slice(2)
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
          .toLowerCase();
        label.textContent = this.getTooltipNiceName(sliderNameClean);
      }

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '255';
      slider.value = isDisabled ? 0 : curMode.getArg(i, mainLed) || '0';
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

      if (isMobile) {
        // Mobile-specific layout: Stack label, slider, and input
        const mobileContainer = document.createElement('div');
        mobileContainer.className = 'control-slider-container-mobile';
        mobileContainer.appendChild(slider);
        mobileContainer.appendChild(input);

        container.style.flexDirection = 'column'; // Stack elements vertically
        container.appendChild(label);
        container.appendChild(mobileContainer);
      } else {
        // Desktop layout: Inline label, slider, and input
        sliderContainer.append(label, slider);
        container.append(sliderContainer, input);
      }

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
    const curMode = this.editor.vortex.engine().modes().curMode();
    if (curMode === null) {
      return;
    }
    this.getTargetLeds().forEach(led => {
      curMode.getPattern(led).setArg(index, value);
    });
    curMode.init();
    this.editor.vortex.engine().modes().saveCurMode();
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

  getPatternSelectElement() {
    return this.panel.querySelector('#patternDropdown'); // or whatever the actual ID is
  }
}

