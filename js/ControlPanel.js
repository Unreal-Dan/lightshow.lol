import Panel from './Panel.js';

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
      }
    ];

    const content = `
            <fieldset>
                <legend>Animation</legend>
                <div class="flex-container">
                    ${ControlPanel.generateControlsContent(controls)}
                </div>
            </fieldset>
            <div id="randomizeContainer">
                <button id="randomizeButton" onclick="randomize()">Randomize</button>
            </div>
            <fieldset>
                <legend>Pattern</legend>
                <select id="patternDropdown"></select>
                <div id="patternParams"></div>
            </fieldset>
            <fieldset>
                <legend>Colorset</legend>
                <div id="colorset"></div>
            </fieldset>
        `;

    super('controlPanel', content);
    this.lightshow = lightshow;
    this.controls = controls;
    this.vortexPort = vortexPort;
  }

  static generateControlsContent(controls) {
    return controls.map(control => `
            <div>
                <input type="${control.type}" id="${control.id}" min="${control.min}" max="${control.max}" value="${control.default}">
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
      console.log("Mode change detected by control panel, refreshing");
      this.refresh();
    });
  }

  refresh() {
    this.updatePatternParameters();
    //this.updatePatternDropdown();
    this.updateModeInfo();
  }

  attachEventListeners() {
    this.controls.forEach(control => {
      this.panel.querySelector(`#${control.id}`).addEventListener('input', (event) => {
        control.update(event.target.value);
      });
    });
  }

  populatePatternDropdown() {
    const dropdown = document.getElementById('patternDropdown');

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
        if (pattern === 'values' || patternEnum[pattern] === patternEnum.PATTERN_NONE) {
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
    dropdown.appendChild(multiGroup);
  }


  attachPatternDropdownListener() {
    const dropdown = document.getElementById('patternDropdown');
    dropdown.addEventListener('change', this.updatePattern.bind(this));
  }

  updatePatternDropdown() {
    let demoMode = this.lightshow.vortex.engine().modes().curMode();
    if (!demoMode) {
      return;
    }
    let dropdown = document.getElementById('patternDropdown');
    const pat = demoMode.getPatternID(this.lightshow.vortex.engine().leds().ledAny());
    dropdown.value = pat.value;
  }

  updatePattern() {
    const dropdown = document.getElementById('patternDropdown');
    const selectedPattern = dropdown.value;
    // Now, you can use the selectedPattern value to update your lightshow or do whatever you need.
    // For example:
    this.lightshow.setPattern(selectedPattern);
    this.updateModeInfo();  // Refresh the display if needed
  }

  updateModeInfo() {
    let demoMode = this.lightshow.vortex.engine().modes().curMode();

    const patternElement = document.getElementById("pattern");
    const colorsetElement = document.getElementById("colorset");

    let colorsetHtml = '';

    if (demoMode) {
      let dropdown = document.getElementById('patternDropdown');
      const pat = demoMode.getPatternID(this.lightshow.vortex.engine().leds().ledAny());
      dropdown.value = pat.value;

      const set = demoMode.getColorset(this.lightshow.vortex.engine().leds().ledAny());

      let numCol = set.numColors();

      if (numCol) {
        for (var i = 0; i < numCol; ++i) {
          let col = set.get(i);
          const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1)}`.toUpperCase();
          colorsetHtml += `<div class="color-container">
                             <span class="delete-color" data-index="${i}">X</span>
                             <input class="color-picker" type="color" value="${hexColor}">
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

      // Attach event listeners for color pickers
      const colorPickers = colorsetElement.querySelectorAll('.color-picker');
      colorPickers.forEach((picker, idx) => {
        picker.addEventListener('change', (event) => {
          this.updateColor(idx, event.target.value);
          // Dispatch a custom event
          document.dispatchEvent(new CustomEvent('patternChange'));
        });
      });

      // Attach event listeners for del col buttons
      const deleteButtons = colorsetElement.querySelectorAll('.delete-color');
      deleteButtons.forEach(button => {
        button.addEventListener('click', () => {
          this.delColor(Number(button.getAttribute('data-index')));
          // Dispatch a custom event
          document.dispatchEvent(new CustomEvent('patternChange'));
        });
      });

      // Attach event listeners for add col button
      const addButton = colorsetElement.querySelector('.add-color');
      if (addButton) {
        addButton.addEventListener('click', () => {
          // Dispatch a custom event
          this.addColor();
          document.dispatchEvent(new CustomEvent('patternChange'));
        });
      }

      this.updatePatternParameters();
      this.vortexPort.demoCurMode(this.lightshow.vortexLib, this.lightshow.vortex);
      document.dispatchEvent(new CustomEvent('patternChange'));
    } else {
      colorsetElement.textContent = 'Unknown';
    }
  }

  updatePatternParameters() {
    const patternID = this.lightshow.vortexLib.PatternID.values[document.getElementById('patternDropdown').value];
    if (!patternID) {
      return;
    }
    const numOfParams = this.lightshow.vortex.numCustomParams(patternID);
    const paramsDiv = document.getElementById('patternParams');
    let customParams = this.lightshow.vortex.getCustomParams(patternID);

    // Clear existing parameters
    paramsDiv.innerHTML = '';

    let demoMode = this.lightshow.vortex.engine().modes().curMode();

    function camelCaseToSpaces(str) {
      return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .toLowerCase();
    }

    const descriptions = {
      "on duration": "This determines how long the LED light stays 'on' during each blink. Think of it like the length of time each color shows up when the LED is cycling through colors.",
      "off duration": "This is the amount of time the LED light stays 'off' between each blink. It's like the pause or gap between each color as the LED cycles.",
      "gap duration": "After the LED completes one full cycle of colors, this sets the length of the pause before it starts the next cycle.",
      "dash duration": "After the main gap, this adds an extra 'on' period. Imagine it as an additional burst of light after the cycle completes.",
      "group size": "This is the amount of on-off blinks in a cycle. If this is 0, it will use the number of colors. This will do nothing if gap is 0",
      "blend speed": "This controls the speed at which the LED transitions or blends from one color to the next. If it's set to 0, the LED will stay on a single color without moving to the next.",
      "num flips": "Every other blink the LED will show a hue that's related to the current color. This setting controls how many times that happens.",
      "col index": "If you're using a solid pattern, this decides which specific color from the colorset will be displayed. For example, if you set it to 0, it will pick the first color; if 1, the second, and so on.",
    };

    for (let i = 0; i < numOfParams; i++) {
      const container = document.createElement('div');
      container.className = 'param-container';

      const label = document.createElement('label');
      let sliderName = camelCaseToSpaces(customParams.get(i).slice(2));
      label.textContent = sliderName;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'param-slider';
      if (sliderName === 'on duration') {
        // on duration cannot be 0, it can but it kinda breaks stuff
        slider.min = '1';
      } else {
        slider.min = '0';
      }
      slider.max = '100';
      slider.step = '1';
      slider.value = demoMode.getArg(i, this.lightshow.vortex.engine().leds().ledAny()) || '0';

      // Display value
      const displayValue = document.createElement('span');
      displayValue.className = 'slider-value';
      displayValue.textContent = slider.value;

      // Description of what the slider does
      const helpIcon = document.createElement('i');
      helpIcon.className = 'fas fa-question-circle help-icon';
      helpIcon.setAttribute('data-tooltip', descriptions[sliderName]);  // Modify this line for each slider's specific tooltip content.
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
        const paramName = camelCaseToSpaces(label.textContent);
        displayValue.textContent = event.target.value;  // Update the displayed value
        let demoMode = this.lightshow.vortex.engine().modes().curMode();
        let pat = demoMode.getPattern(this.lightshow.vortex.engine().leds().ledAny());
        pat.setArg(i, event.target.value);
      });
      slider.addEventListener('change', async () => {
        // init
        demoMode.init();
        // save
        this.lightshow.vortex.engine().modes().saveCurMode();
        // send to device
        await this.vortexPort.demoCurMode(this.lightshow.vortexLib, this.lightshow.vortex);
        document.dispatchEvent(new CustomEvent('patternChange'));
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
    this.lightshow.addColor(255, 255, 255);
    this.updateModeInfo();
  }

  delColor(index) {
    this.lightshow.delColor(index);
    this.updateModeInfo();
  }

  updateColor(index, hexValue) {
    let hex = hexValue.replace(/^#/, '');
    let bigint = parseInt(hex, 16);
    let r = (bigint >> 16) & 255;
    let g = (bigint >> 8) & 255;
    let b = bigint & 255;
    this.lightshow.updateColor(index, r, g, b);
    this.updateModeInfo();
  }

  randomize() {
    this.lightshow.randomize();
    this.updateModeInfo();
  }
}

