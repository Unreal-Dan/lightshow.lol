import VortexLib from './VortexLib.js';
import Lightshow from './Lightshow.js';
import AboutPanel from './AboutPanel.js';
import ControlPanel from './ControlPanel.js';

// instantiate VortexLib webassembly module
VortexLib().then(vortexLib => {
  const urlParams = new URLSearchParams(window.location.search);
  const encodedData = urlParams.get('data');
  const canvas = document.getElementById('lightshowCanvas');

  let modeData = null;
  let decodedData = null;
  if (encodedData) {
    try {
      // Decode the Base64 string and parse the JSON data
      decodedData = atob(encodedData);
      modeData = JSON.parse(decodedData);
    } catch (error) {
      console.error('Error parsing mode data:', error);
    }
  }

  // instantiate the lightshow
  let lightshow = new Lightshow(vortexLib, canvas.getAttribute('id'), modeData);
  // initialize the lightshow
  lightshow.start();

  // create panels for the lightshow
  let aboutPanel = new AboutPanel(lightshow);
  let controlPanel = new ControlPanel(lightshow);

  // Append panels to the body
  aboutPanel.appendTo(document.body);
  controlPanel.appendTo(document.body);
  controlPanel.initialize();

  // resize the lightshow when window drags
  window.addEventListener('resize', () => {
    lightshow.width = window.innerWidth;
    lightshow.height = window.innerHeight;
  });

  window.randomize = controlPanel.randomize.bind(controlPanel);
});

