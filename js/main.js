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
  Module.VortexInit();
  draw();
};

// ========================================================================
//  Control Panel Callbacks
document.getElementById('tickRate').addEventListener('input', function() {
  tickRate = this.value;
});
document.getElementById('trailSize').addEventListener('input', function() {
  trailSize = this.value;
  // Trim history if new trail size is smaller
  if (history.length > trailSize) {
    const itemsToRemove = history.length - trailSize;
    history.splice(0, itemsToRemove);
  }
});
document.getElementById('dotSize').addEventListener('input', function() {
  dotSize = this.value;
});
document.getElementById('blurFac').addEventListener('input', function() {
  blurFac = this.value;
});

// ========================================================================
//  Input Callbacks
document.addEventListener('keydown', function(event) {
  if(event.code === 'Space') {
    Module.VortexClick();
    // refresh the mode information next tick
    needRefresh = true;
  }
});
canvas.addEventListener('touchstart', function(e) {
  // Prevent the default scrolling action to happen
  e.preventDefault();
  // Call your engine function for handling clicks
  Module.VortexClick();
  // refresh the mode information next tick
  needRefresh = true;
});

// ========================================================================
//  Draw Handler
function draw() {
  // Clear canvas with a stronger fade effect
  ctx.fillStyle = `rgba(0, 0, 0, 1)`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 50;

  for (let i = 0; i < tickRate; i++) {
    // Note: Led will be an array but we only used first one
    const led = Module.VortexTick();
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

  // iterate the history and rewrite the extra stuff
  for (let index = history.length - 1; index >= 0; index--) {
    const point = history[index];
    if (!point.color.red && !point.color.green && !point.color.blue) {
      continue;
    }

    const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, dotSize);
    const innerAlpha = (1 - ((history.length - 1 - index) / history.length)).toFixed(2);
    const outerAlpha = (innerAlpha / blurFac).toFixed(2); // Using blurFac here

    gradient.addColorStop(0, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${innerAlpha})`);
    gradient.addColorStop(0.5, `rgba(${point.color.red}, ${point.color.green}, ${point.color.blue}, ${outerAlpha})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.x, point.y, dotSize, 0, 2 * Math.PI);
    ctx.fill();
  }

  if (history.length > trailSize) {
    history.splice(0, tickRate); // Remove 'tickRate' number of points from the beginning
  }

  if (needRefresh) {
    // refresh the mode info
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
  const modeInfo = Module.VortexDemoMode();
  const patternElement = document.getElementById("pattern");
  const colorsetElement = document.getElementById("colorset");

  if (modeInfo) {
    patternElement.textContent = modeInfo.pattern || 'Unknown';

    let colorsetHtml = '';
    if (modeInfo.colorset) {
      modeInfo.colorset.forEach((color) => {
        const hexColor = `#${((1 << 24) + (color.red << 16) + (color.green << 8) + color.blue).toString(16).slice(1)}`;
        colorsetHtml += `<div><span class="color-box" style="background-color: ${hexColor};"></span>${hexColor}</div>`;
      });
    } else {
      colorsetHtml = 'Unknown';
    }
    colorsetElement.innerHTML = colorsetHtml;
  } else {
    patternElement.textContent = 'Unknown';
    colorsetElement.textContent = 'Unknown';
  }
}
