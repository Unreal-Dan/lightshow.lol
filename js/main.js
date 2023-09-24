import Lightshow from './Lightshow.js';

// instantiate the lightshow
let lightshow = new Lightshow();

// bind functions for access from html
window.randomize = lightshow.randomize.bind(lightshow);
window.updatePattern = lightshow.updatePattern.bind(lightshow);
window.clearCanvas = lightshow.clearCanvas.bind(lightshow);
window.delColor = lightshow.delColor.bind(lightshow);
window.addColor = lightshow.addColor.bind(lightshow);
window.updateColor = lightshow.updateColor.bind(lightshow);
window.toggleTooltip = lightshow.toggleTooltip.bind(lightshow);
window.connect = lightshow.connectDevice.bind(lightshow)
