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
  Module.Vortex.openRandomizer();
  Module.Vortex.longClick(0);
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
  let demoMode = Module.Vortex.getMenuDemoMode();

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
        const hexColor = `#${((1 << 24) + (col.red << 16) + (col.green << 8) + col.blue).toString(16).slice(1)}`;
        colorsetHtml += `
          <div class="color-container">
            <span class="delete-color" onclick="deleteColor(${i})">X</span>
            <input class="color-picker" type="color" value="${hexColor}" onchange="updateColor(${i}, this.value)">
            ${hexColor}
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
  }
}

// randomize just send a click
function randomize() {
  Module.Vortex.shortClick(0);
  needRefresh = true;
}

// pattern update
function updatePattern() {
  // the selected dropdown pattern
  const selectedPattern = Module.PatternID.values[document.getElementById('patternDropdown').value];
  // grab the 'preview' mode for the current mode (randomizer)
  let demoMode = Module.Vortex.getMenuDemoMode();
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

  let demoMode = Module.Vortex.getMenuDemoMode();

  function camelCaseToSpaces(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
      .toLowerCase();
  }

  for (let i = 0; i < numOfParams; i++) {
    const container = document.createElement('div');
    container.className = 'param-container';

    const label = document.createElement('label');
    let str = camelCaseToSpaces(customParams.get(i).slice(2));
    label.textContent = str;

    // Create the slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'param-slider';
    slider.min = '0';       // Adjust as necessary
    slider.max = '100';     // Adjust as necessary
    slider.step = '1';    // Adjust as necessary
    slider.value = demoMode.getArg(i, Module.LedPos.LED_0) || '0';

    // Display value
    const displayValue = document.createElement('span');
    displayValue.className = 'slider-value';
    displayValue.textContent = slider.value;

    container.appendChild(label);
    container.appendChild(slider);
    container.appendChild(displayValue);
    paramsDiv.appendChild(container);

    // Event for slider
    slider.addEventListener('input', function(event) {
      const paramName = camelCaseToSpaces(label.textContent);
      console.log(`Parameter: ${paramName}, New Value: ${event.target.value}`);

      displayValue.textContent = event.target.value;  // Update the displayed value

      let demoMode = Module.Vortex.getMenuDemoMode();
      let pat = demoMode.getPattern(Module.LedPos.LED_0);
      pat.setArg(i, event.target.value);
      demoMode.init();
    });
  }
}

// color update
function updateColor(index, newColor) {
  let demoMode = Module.Vortex.getMenuDemoMode();
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
  let demoMode = Module.Vortex.getMenuDemoMode();
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
  let demoMode = Module.Vortex.getMenuDemoMode();
  let set = demoMode.getColorset(Module.LedPos.LED_0);
  set.addColor(new Module.RGBColor(255, 255, 255)); // Assumes add is a function to add a new color to your engine.
  demoMode.setColorset(set, Module.LedPos.LED_0);
  demoMode.init();
  needRefresh = true;
}
