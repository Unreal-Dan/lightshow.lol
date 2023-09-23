let dotSize = 25;
let blurFac = 5;
let tickRate = 3;
let trailSize = 100;
const canvas = document.getElementById('lightshowCanvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const ctx = canvas.getContext('2d');
let angle = 0;
const history = [];
let needRefresh = true;

Module.onRuntimeInitialized = function() {
  Module.Init();
  populatePatternDropdown();
  updatePatternParameters();
  draw();
};

document.getElementById('tickRate').addEventListener('input', function() {
  tickRate = parseInt(this.value, 10);
});

document.getElementById('trailSize').addEventListener('input', function() {
  trailSize = parseInt(this.value, 10);
  if (history.length > trailSize) {
    const itemsToRemove = history.length - trailSize;
    history.splice(0, itemsToRemove);
  }
});

document.getElementById('dotSize').addEventListener('input', function() {
  dotSize = parseInt(this.value, 10);
});

document.getElementById('blurFac').addEventListener('input', function() {
  blurFac = parseInt(this.value, 10);
});

function draw() {
  ctx.fillStyle = `rgba(0, 0, 0, 1)`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 50;

  for (let i = 0; i < tickRate; i++) {
    const led = Module.Tick();
    if (!led) {
      continue;
    }
    angle -= 0.02;
    if (angle >= 2 * Math.PI) {
      angle = 0;
    }
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    history.push({ x, y, color: led[0] });
  }

  for (let index = history.length - 1; index >= 0; index--) {
    const point = history[index];
    if (!point.color.red && !point.color.green && !point.color.blue) {
      continue;
    }

    const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, dotSize);
    const innerAlpha = (1 - ((history.length - 1 - index) / history.length)).toFixed(2);
    const outerAlpha = blurFac !== 0 ? (innerAlpha / blurFac).toFixed(2) : innerAlpha;

    gradient.addColorStop(0, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${innerAlpha})`);
    gradient.addColorStop(0.8, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${outerAlpha})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.x, point.y, dotSize, 0, 2 * Math.PI);
    ctx.fill();
  }

  if (history.length > trailSize) {
    history.splice(0, tickRate);
  }

  if (needRefresh) {
    updateModeInfo();
    needRefresh = false;
  }

  requestAnimationFrame(draw);
}

function clearCanvas() {
  // Clear entire canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ========================================================================
//  Mode Information Handler
function updateModeInfo() {
  let demoMode = Module.Modes.curMode();

  const patternElement = document.getElementById("pattern");
  const colorsetElement = document.getElementById("colorset");

  if (demoMode) {
    //patternElement.textContent = Module.Vortex.patternToString(demoMode.getPatternID(0)) || 'Unknown';
    let dropdown = document.getElementById('patternDropdown');
    const pat = demoMode.getPatternID(Module.LedPos.LED_0);
    dropdown.value = pat.value;

    const set = demoMode.getColorset(Module.LedPos.LED_0);

    let colorsetHtml = '';
    if (set.numColors()) {
      for (var i = 0; i < set.numColors(); ++i) {
        let col = set.get(i);
        const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1)}`.toUpperCase();
        colorsetHtml += `
          <div class="color-container">
            <span class="delete-color" onclick="deleteColor(${i})">X</span>
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
	updatePatternParameters();
}

// fill pattern dropdown box
function populatePatternDropdown() {
  const dropdown = document.getElementById('patternDropdown');

  // Create optgroups for each pattern type
  const strobeGroup = document.createElement('optgroup');
  strobeGroup.label = "Strobe Patterns";
  const blendGroup = document.createElement('optgroup');
  blendGroup.label = "Blend Patterns";
  const solidGroup = document.createElement('optgroup');
  solidGroup.label = "Solid Patterns";

  // Assume `Module.PatternID` has the patterns you want to display
  for(let pattern in Module.PatternID) {
    // idk why this is in there
    if (pattern === 'values' ||
        Module.PatternID[pattern] === Module.PatternID.PATTERN_NONE ||
        Module.PatternID[pattern].value > Module.PatternID.PATTERN_SOLID.value) {
      continue;
    }
    let option = document.createElement('option');
    let str = Module.Vortex.patternToString(Module.PatternID[pattern]);  // Using the key name as the display text
    if (str.startsWith("complementary")) {
      str = "comp. " + str.slice(14);
    }
    option.text = str;
    option.value = Module.PatternID[pattern].value;
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

// randomize just send a click
function randomize() {
  Module.Vortex.openRandomizer();
  Module.Vortex.longClick(0);
  Module.Vortex.shortClick(0);
  Module.Vortex.longClick(0);
  //Module.Vortex.setLedCount(1);
  needRefresh = true;
}

// pattern update
function updatePattern() {
  // the selected dropdown pattern
  const selectedPattern = Module.PatternID.values[document.getElementById('patternDropdown').value];
  // grab the 'preview' mode for the current mode (randomizer)
  let demoMode = Module.Modes.curMode();
  // set the pattern of the demo mode to the selected dropdown pattern on all LED positions
  // with null args and null colorset (so they are defaulted and won't change)
  demoMode.setPattern(selectedPattern, Module.LedPos.LED_ALL, null, null);
  // re-initialize the demo mode so it takes the new args into consideration
  demoMode.init();
	// re-initialize the params list
	updatePatternParameters();
}

// update the params fields of pattern
function updatePatternParameters() {
  const patternID = Module.PatternID.values[document.getElementById('patternDropdown').value];
  const numOfParams = Module.Vortex.numCustomParams(patternID);
  const paramsDiv = document.getElementById('patternParams');
  let customParams = Module.Vortex.getCustomParams(patternID);

  // Clear existing parameters
  paramsDiv.innerHTML = '';

  let demoMode = Module.Modes.curMode();

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
    slider.min = '0';       // Adjust as necessary
    slider.max = '100';     // Adjust as necessary
    slider.step = '1';      // Adjust as necessary
    slider.value = demoMode.getArg(i, Module.LedPos.LED_0) || '0';

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
      let demoMode = Module.Modes.curMode();
      let pat = demoMode.getPattern(Module.LedPos.LED_0);
      pat.setArg(i, event.target.value);
      demoMode.init();
    });
  }
}

// color update
function updateColor(index, newColor) {
  let demoMode = Module.Modes.curMode();
  set = demoMode.getColorset(Module.LedPos.LED_0);
  let bigint = parseInt(newColor.replace(/^#/, ''), 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;
  console.log(r);
  console.log(g);
  console.log(b);
  set.set(index, new Module.RGBColor(r, g, b)); // Assumes setColor is a function you have to update the color in your engine
  demoMode.setColorset(set, Module.LedPos.LED_0);
  demoMode.init();
  needRefresh = true;
}

// handle clicking the delete color button
function deleteColor(index) {
  let demoMode = Module.Modes.curMode();
  let set = demoMode.getColorset(Module.LedPos.LED_0);
  if (set.numColors() <= 1) {
    return;
  }
  set.removeColor(index); // Assumes remove is a function you have to delete the color in your engine. If it's not, you might need to replace it with the appropriate function call.
  demoMode.setColorset(set, Module.LedPos.LED_0);
  demoMode.init();
  needRefresh = true;
}

// handle clicking the add color button
function addColor() {
  // Here, you can add a new color to your set. Assuming a default color of white.
  let demoMode = Module.Modes.curMode();
  let set = demoMode.getColorset(Module.LedPos.LED_0);
  set.addColor(new Module.RGBColor(255, 255, 255)); // Assumes add is a function to add a new color to your engine.
  demoMode.setColorset(set, Module.LedPos.LED_0);
  demoMode.init();
  needRefresh = true;
}

// Sample code to create a slider with a tooltip
function createSliderWithTooltip(sliderId, tooltipText) {
  const sliderContainer = document.createElement('div');
  sliderContainer.className = 'tooltip';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = sliderId;
  sliderContainer.appendChild(slider);

  const tooltipSpan = document.createElement('span');
  tooltipSpan.className = 'tooltiptext';
  tooltipSpan.textContent = tooltipText;
  sliderContainer.appendChild(tooltipSpan);

  return sliderContainer;
}

let currentTooltip = null;

function toggleTooltip(element) {
  let tooltipText = element.getAttribute('data-tooltip');
  if (!tooltipText) return;

  // Check if a tooltip is currently displayed
  if (currentTooltip) {
    currentTooltip.style.display = 'none';
  }

  let tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.textContent = tooltipText;

  // Position tooltip near the help icon
  tooltip.style.left = (element.getBoundingClientRect().left + window.scrollX + 30) + 'px';
  tooltip.style.top = (element.getBoundingClientRect().top + window.scrollY - 5) + 'px';

  document.body.appendChild(tooltip);

  if (currentTooltip) {
    currentTooltip.remove();
  }
  currentTooltip = tooltip;
}

// This function will hide the currently displayed tooltip
function hideTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

// ==================================================================
//  Code for connecting to Serial
// Helper functions and event listeners

// the hello from the editor to the gloves
const EDITOR_VERB_HELLO             = 'a';

// the response from the gloveset when it's ready to receive something
// after the editor has given it a command to do something the gloveset
// will respond with this then once it's done doing the action it will
// send a different finished response for each action
const EDITOR_VERB_READY             = 'b';

// the command from the editor to send modes over
const EDITOR_VERB_PULL_MODES        = 'c';
// the response from the editor once modes are received
const EDITOR_VERB_PULL_MODES_DONE   = 'd';
// the response from the gloves once it acknowledges the editor got the modes
const EDITOR_VERB_PULL_MODES_ACK    = 'e';

// the command from the editor to send modes over
const EDITOR_VERB_PUSH_MODES        = 'f';
// the response from the gloveset when it received the mode
const EDITOR_VERB_PUSH_MODES_ACK    = 'g';

// the command from the editor to tell the gloveset to demo a mode
const EDITOR_VERB_DEMO_MODE         = 'h';
// the response from the gloveset when it's received the mode to demo
const EDITOR_VERB_DEMO_MODE_ACK     = 'i';

// the command from the editor to tell the gloveset to clear the demo
const EDITOR_VERB_CLEAR_DEMO        = 'j';
// the response from the gloveset when it's received disabled the demo
const EDITOR_VERB_CLEAR_DEMO_ACK    = 'k';

// when the gloveset is leaving the menu and needs to tell the editor
// that it's no longer listening
const EDITOR_VERB_GOODBYE           = 'l';


class VortexPort {
  accumulatedData = ""; // A buffer to store partial lines.

  constructor() {
    this.serialPort = null;
    this.portActive = false;
    this.debugSending = false;
  }

  isActive = () => {
    return this.portActive;
  }

  async requestDevice() {
    try {
      console.log('Requesting device...');
      this.serialPort = await navigator.serial.requestPort();
      await this.serialPort.open({ baudRate: 9600 });
      await this.serialPort.setSignals({ dataTerminalReady: true });

      console.log('Port opened:', this.serialPort);
      console.log('Starting to listen for greetings...');
      this.listenForGreeting();

    } catch (error) {
      console.error('Error:', error);
    }
  }

  async writeData(data) {
    if (!this.serialPort || !this.serialPort.writable) {
      console.error('Port is not writable.');
      return;
    }

    const writer = this.serialPort.writable.getWriter();
    const encoded = new TextEncoder().encode(data);

    try {
      await writer.write(encoded);
    } catch (error) {
      console.error('Error writing data:', error);
    } finally {
      writer.releaseLock();
    }
  }

  listenForGreeting = async () => {
    while (!this.portActive) {
      if (this.serialPort) {
        try {
          // Read data from the serial port
          const response = await this.readData();

          const responseRegex = /^== Vortex Engine v(\d+\.\d+) '(\w+)' \( built (.*)\) ==$/;
          const match = response.match(responseRegex);

          if (match) {
            const version = match[1]; // Capturing the version number
            const name = match[2];    // Capturing the name
            const buildDate = match[3]; // Capturing the build date

            console.log('Received greeting from Vortex Device:');
            console.log('Device Type:', name);
            console.log('Version:', version);
            console.log('Date:', buildDate);
            this.portActive = true;
          }
        } catch (err) {
          console.error('Error reading data:', err);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async readData() {
    if (!this.serialPort || !this.serialPort.readable) {
      console.error('Port is not readable.');
      return null;
    }

    const reader = this.serialPort.readable.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          break;
        }

        const text = new TextDecoder().decode(value);
        this.accumulatedData += text;

        // If it starts with '=' or '==', look for the end delimiter '=='
        if (this.accumulatedData.startsWith('=') || this.accumulatedData.startsWith('==')) {
          const endIndex = this.accumulatedData.indexOf('==', 2); // Search for '==' after the first one.

          if (endIndex >= 0) {
            const fullMessage = this.accumulatedData.substring(0, endIndex + 2).trim();
            this.accumulatedData = this.accumulatedData.substring(endIndex + 2); // Trim accumulatedData
            return fullMessage; // Return the full message
          }

        } else {
          // Return any single byte
          const singleByte = this.accumulatedData[0];
          this.accumulatedData = this.accumulatedData.substring(1);
          return singleByte;
        }
      }
    } catch (error) {
      console.error('Error reading data:', error);
      return null;
    } finally {
      reader.releaseLock();
    }
  }

  async demoCurMode() {
    // Unserialize the stream of data
    const curMode = new Module.ByteStream();
    if (!Module.Vortex.getCurMode(curMode)) {
      console.log("Failed to get cur mode");
      // Error handling - abort or handle as needed
      return;
    }

    // Create the custom array with size and rawData
    const size = curMode.rawSize();
    const sizeArray = new Uint32Array([size]); // No byte swapping
    const rawDataArray = Module.getRawDataArray(curMode);
    // Combine sizeArray and rawDataArray into a single array
    const combinedArray = new Uint8Array(sizeArray.length * 4 + rawDataArray.length);
    combinedArray.set(new Uint8Array(sizeArray.buffer), 0); // Copy sizeArray bytes
    combinedArray.set(rawDataArray, sizeArray.length * 4); // Copy rawDataArray bytes

    console.log("Sending demo command...");
    await this.sendCommand(EDITOR_VERB_DEMO_MODE);
    console.log("Waiting for ready response...");
    await this.expectData('b');
    console.log("Device is ready, sending mode...");
    const writer = this.serialPort.writable.getWriter();
    try {
      await writer.write(combinedArray);
    } catch (error) {
      console.error('Error writing data:', error);
    } finally {
      writer.releaseLock();
    }
    console.log("Sent Mode, waiting for ack...");
    await this.expectData(EDITOR_VERB_DEMO_MODE_ACK);
    console.log("Success!");
  }

  async expectData(expectedResponse, timeoutMs = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const response = await this.readData();
      if (response === expectedResponse) {
        return; // Expected response received
      }
      // You can log the received response here for debugging:
      console.log('Received:', response, ' (expected: ', expectedResponse, ')');
    }
    throw new Error('Timeout: Expected response not received');
  }

  async closePort() {
    if (this.serialPort) {
      await this.serialPort.close();
      this.serialPort = null;
      console.log('Port closed.');
    }
  }

  async sendCommand(verb) {
    if (!this.isActive()) {
      console.error('Port not active. Cannot send command.');
      return;
    }
    const writer = this.serialPort.writable.getWriter();
    const commandByte = new Uint8Array([0x68]);
    try {
      // Write the command and immediately flush it
      await writer.write(commandByte);
      await writer.releaseLock();
      console.log("Sent Command:", verb);
    } catch (error) {
      console.error('Error writing data:', error);
    }
  }
}

const vortexPort = new VortexPort();

const handleDeviceRequest = () => {
  vortexPort.requestDevice();
};
const handleDemoMode = () => {
  vortexPort.demoCurMode();
}

document.getElementById('requestDeviceButton').addEventListener('click', handleDeviceRequest);
document.getElementById('demoModeButton').addEventListener('click', handleDemoMode);

