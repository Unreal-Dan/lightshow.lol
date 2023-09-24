import VortexPort from './VortexPort.js';
import VortexLib from './VortexLib.js';

export default class Lightshow {
  constructor() {
    this.dotSize = 25;
    this.blurFac = 5;
    this.tickRate = 3;
    this.trailSize = 100;
    this.canvas = document.getElementById('lightshowCanvas');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx = this.canvas.getContext('2d');
    this.angle = 0;
    this.history = [];
    this.needRefresh = true;
    this.sendDemoNow = false;
    this.currentTooltip = null;
    this.port = new VortexPort();
    this.vortexLib = null;

    this.attachEventListeners();

    VortexLib().then(module => {
      this.vortexLib = module;
      this.init();
    });
  }

  connectDevice() {
    this.port.requestDevice();
  }

  attachEventListeners() {
    document.getElementById('tickRate').addEventListener('input', (event) => {
      this.tickRate = parseInt(event.target.value, 10);
    });

    document.getElementById('trailSize').addEventListener('input', (event) => {
      this.trailSize = parseInt(event.target.value, 10);
      if (this.history.length > this.trailSize) {
        const itemsToRemove = this.history.length - this.trailSize;
        this.history.splice(0, itemsToRemove);
      }
    });

    document.getElementById('dotSize').addEventListener('input', (event) => {
      this.dotSize = parseInt(event.target.value, 10);
    });

    document.getElementById('blurFac').addEventListener('input', (event) => {
      this.blurFac = parseInt(event.target.value, 10);
    });

    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });
  }

  init() {
    this.vortexLib.Init();
    this.populatePatternDropdown();
    this.updatePatternParameters();
    this.draw();
  }

  draw() {
    this.ctx.fillStyle = `rgba(0, 0, 0, 1)`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 50;

    for (let i = 0; i < this.tickRate; i++) {
      const led = this.vortexLib.Tick();
      if (!led) {
        continue;
      }
      this.angle -= 0.02;
      if (this.angle >= 2 * Math.PI) {
        this.angle = 0;
      }
      const x = centerX + radius * Math.cos(this.angle);
      const y = centerY + radius * Math.sin(this.angle);
      this.history.push({ x, y, color: led[0] });
    }

    for (let index = this.history.length - 1; index >= 0; index--) {
      const point = this.history[index];
      if (!point.color.red && !point.color.green && !point.color.blue) {
        continue;
      }

      const gradient = this.ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, this.dotSize);
      const innerAlpha = (1 - ((this.history.length - 1 - index) / this.history.length)).toFixed(2);
      const outerAlpha = this.blurFac !== 0 ? (innerAlpha / this.blurFac).toFixed(2) : innerAlpha;

      gradient.addColorStop(0, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${innerAlpha})`);
      gradient.addColorStop(0.8, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${outerAlpha})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, this.dotSize, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    if (this.history.length > this.trailSize) {
      this.history.splice(0, this.tickRate);
    }

    if (this.needRefresh) {
      this.updateModeInfo();
      this.needRefresh = false;
    }
    if (this.sendDemoNow) {
      this.port.demoCurMode();
      this.sendDemoNow = false;
    }

    requestAnimationFrame(this.draw.bind(this));
  }


  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  updateModeInfo() {
    let demoMode = this.vortexLib.Modes.curMode();

    const patternElement = document.getElementById("pattern");
    const colorsetElement = document.getElementById("colorset");

    if (demoMode) {
      //patternElement.textContent = this.vortexLib.Vortex.patternToString(demoMode.getPatternID(0)) || 'Unknown';
      let dropdown = document.getElementById('patternDropdown');
      const pat = demoMode.getPatternID(this.vortexLib.LedPos.LED_0);
      dropdown.value = pat.value;

      const set = demoMode.getColorset(this.vortexLib.LedPos.LED_0);

      let colorsetHtml = '';
      if (set.numColors()) {
        for (var i = 0; i < set.numColors(); ++i) {
          let col = set.get(i);
          const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1)}`.toUpperCase();
          colorsetHtml += `<div class="color-container">
                             <span class="delete-color" onclick="delColor(${i})">X</span>
                             <input class="color-picker" type="color" value="${hexColor}" onchange="updateColor(${i}, this.value)">
                             <label>${hexColor}</label>
                           </div>`;
        }
        if(set.numColors() < 8) {
          colorsetHtml += `
          <div class="color-container add-color" onclick="addColor()">
            +
          </div>`;
        }
      } else {
        colorsetHtml = 'Unknown';
      }
      colorsetElement.innerHTML = colorsetHtml;
    } else {
      //patternElement.textContent = 'Unknown';
      colorsetElement.textContent = 'Unknown';
    }
    this.updatePatternParameters();
    this.port.demoCurMode();
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

    // Assume `this.vortexLib.PatternID` has the patterns you want to display
    for(let pattern in this.vortexLib.PatternID) {
      // idk why this is in there
      if (pattern === 'values' ||
        this.vortexLib.PatternID[pattern] === this.vortexLib.PatternID.PATTERN_NONE ||
        this.vortexLib.PatternID[pattern].value > this.vortexLib.PatternID.PATTERN_SOLID.value) {
        continue;
      }
      let option = document.createElement('option');
      let str = this.vortexLib.Vortex.patternToString(this.vortexLib.PatternID[pattern]);  // Using the key name as the display text
      if (str.startsWith("complementary")) {
        str = "comp. " + str.slice(14);
      }
      option.text = str;
      option.value = this.vortexLib.PatternID[pattern].value;
      dropdown.appendChild(option);

      if (str.includes("blend")) {
        blendGroup.appendChild(option);
      } else if (str.includes("solid")) {
        solidGroup.appendChild(option);
      } else {
        strobeGroup.appendChild(option);
      }
    }

    // Append the groups to the dropdown
    dropdown.appendChild(strobeGroup);
    dropdown.appendChild(blendGroup);
    dropdown.appendChild(solidGroup);
  }

  randomize() {
    this.vortexLib.Vortex.openRandomizer();
    this.vortexLib.Vortex.longClick(0);
    this.vortexLib.Vortex.shortClick(0);
    this.vortexLib.Vortex.longClick(0);
    this.needRefresh = true;
  }

  updatePattern() {
    // the selected dropdown pattern
    const selectedPattern = this.vortexLib.PatternID.values[document.getElementById('patternDropdown').value];
    // grab the 'preview' mode for the current mode (randomizer)
    let demoMode = this.vortexLib.Modes.curMode();
    // set the pattern of the demo mode to the selected dropdown pattern on all LED positions
    // with null args and null colorset (so they are defaulted and won't change)
    demoMode.setPattern(selectedPattern, this.vortexLib.LedPos.LED_ALL, null, null);
    // re-initialize the demo mode so it takes the new args into consideration
    demoMode.init();
    // re-initialize the params list
    this.updatePatternParameters();
    // update the current mode
    this.port.demoCurMode();
  }

  updatePatternParameters() {
    const patternID = this.vortexLib.PatternID.values[document.getElementById('patternDropdown').value];
    const numOfParams = this.vortexLib.Vortex.numCustomParams(patternID);
    const paramsDiv = document.getElementById('patternParams');
    let customParams = this.vortexLib.Vortex.getCustomParams(patternID);

    // Clear existing parameters
    paramsDiv.innerHTML = '';

    let demoMode = this.vortexLib.Modes.curMode();

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
      slider.value = demoMode.getArg(i, this.vortexLib.LedPos.LED_0) || '0';

      // Display value
      const displayValue = document.createElement('span');
      displayValue.className = 'slider-value';
      displayValue.textContent = slider.value;

      // Description of what the slider does
      const helpIcon = document.createElement('i');
      helpIcon.className = 'fas fa-question-circle help-icon';
      helpIcon.setAttribute('data-tooltip', descriptions[sliderName]);  // Modify this line for each slider's specific tooltip content.
      helpIcon.onclick = function() { toggleTooltip(helpIcon); };

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
      slider.addEventListener('input', function(event) {
        const paramName = camelCaseToSpaces(label.textContent);
        displayValue.textContent = event.target.value;  // Update the displayed value
        let demoMode = this.vortexLib.Modes.curMode();
        for (let j = 0; j < 10; ++j) {
          let pat = demoMode.getPattern(this.vortexLib.LedPos.values[j]);
          pat.setArg(i, event.target.value);
        }
        demoMode.init();
      });
      slider.addEventListener('change', async () => {
        await this.port.demoCurMode();
      });
    }
  }

  // handle clicking the add color button
  addColor() {
    let demoMode = this.vortexLib.Modes.curMode();
    let set = demoMode.getColorset(this.vortexLib.LedPos.LED_0);
    set.addColor(new this.vortexLib.RGBColor(255, 255, 255));
    demoMode.setColorset(set, this.vortexLib.LedPos.LED_ALL);
    demoMode.init();
    this.needRefresh = true;
  }

  // handle clicking the delete color button
  delColor(index) {
    let demoMode = this.vortexLib.Modes.curMode();
    let set = demoMode.getColorset(this.vortexLib.LedPos.LED_0);
    if (set.numColors() <= 1) {
      return;
    }
    set.removeColor(index);
    demoMode.setColorset(set, this.vortexLib.LedPos.LED_ALL);
    demoMode.init();
    this.needRefresh = true;
  }

  updateColor(index, newColor) {
    let demoMode = this.vortexLib.Modes.curMode();
    let set = demoMode.getColorset(this.vortexLib.LedPos.LED_0);
    let bigint = parseInt(newColor.replace(/^#/, ''), 16);
    let r = (bigint >> 16) & 255;
    let g = (bigint >> 8) & 255;
    let b = bigint & 255;
    set.set(index, new this.vortexLib.RGBColor(r, g, b));
    demoMode.setColorset(set, this.vortexLib.LedPos.LED_ALL);
    demoMode.init();
    this.needRefresh = true;
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
}
