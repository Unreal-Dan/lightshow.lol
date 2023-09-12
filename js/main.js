let dotSize = 25;
let blurFac = 5;
let tickRate = 1;
let fadeRate = 10;
let trailSize = 50;
const canvas = document.getElementById('lightshowCanvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const ctx = canvas.getContext('2d');
let angle = 0;
const history = [];

Module.onRuntimeInitialized = function() {
    console.log("WASM initialized.");
    Module.VortexInit();
    draw();
};

//document.getElementById('fadeRate').addEventListener('input', function() {
//    fadeRate = this.value;
//});
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

function draw() {
    const adjustedFadeRate = (fadeRate / 10.0);

    // Clear canvas with a stronger fade effect
    ctx.fillStyle = `rgba(0, 0, 0, ${adjustedFadeRate})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 50;

    for (let i = 0; i < tickRate; i++) {
        const led = Module.VortexTick();

        angle -= 0.02;
        if (angle >= 2 * Math.PI) {
            angle = 0;
        }

        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        if (led) {
            history.push({ x, y, color: led[0] });
        }
    }

    for (let index = history.length - 1; index >= 0; index--) {
      const point = history[index];
      if (!point.color.red && !point.color.green && !point.color.blue) {
        continue;
      }

      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, dotSize);
      const innerAlpha = (1 - ((history.length - 1 - index) / history.length)).toFixed(2);
      const outerAlpha = (innerAlpha / blurFactor).toFixed(2); // Using blurFactor here

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

    requestAnimationFrame(draw);
}

function clearCanvas() {
    // Clear entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Event listener for spacebar keydown
document.addEventListener('keydown', function(event) {
    if(event.code === 'Space') {
        Module.VortexClick();
    }
});

canvas.addEventListener('touchstart', function(e) {
    // Prevent the default scrolling action to happen
    e.preventDefault();
    // Call your engine function for handling clicks
    Module.VortexClick();
});
