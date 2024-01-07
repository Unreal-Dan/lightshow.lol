import VortexLib from './VortexLib.js';
import Lightshow from './Lightshow.js';
import AboutPanel from './AboutPanel.js';
import ControlPanel from './ControlPanel.js';
import ModesPanel from './ModesPanel.js';
import VortexPort from './VortexPort.js';

const vortexPort = new VortexPort();

// instantiate VortexLib webassembly module
VortexLib().then(vortexLib => {
  const urlParams = new URLSearchParams(window.location.search);
  const encodedData = urlParams.get('data');

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

  // the lightshow needs the canvas id to operate on
  const canvas = document.getElementById('lightshowCanvas');
  // instantiate the lightshow
  let lightshow = new Lightshow(vortexLib, canvas, modeData);
  // initialize the lightshow
  lightshow.start();

  // create panels for the lightshow
  let aboutPanel = new AboutPanel(lightshow, vortexPort);
  let controlPanel = new ControlPanel(lightshow, vortexPort);
  let modesPanel = new ModesPanel(lightshow, vortexPort);

  // Append panels to the body
  aboutPanel.appendTo(document.body);
  controlPanel.appendTo(document.body);
  modesPanel.appendTo(document.body);

  // initialize the modes panel
  aboutPanel.initialize();
  controlPanel.initialize();
  modesPanel.initialize();

  // resize the lightshow when window drags
  window.addEventListener('resize', () => {
    lightshow.width = window.innerWidth;
    lightshow.height = window.innerHeight;
  });

  window.randomize = controlPanel.randomize.bind(controlPanel);
});
