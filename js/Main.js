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

  document.getElementById('connectDevice').addEventListener('click', async () => {
    let statusMessage = document.getElementById('statusMessage');
    try {
      await vortexPort.requestDevice(() => {
        console.log("name: " + vortexPort.name);
        const deviceLedCountMap = {
          'Gloves': 10,
          'Orbit': 28,
          'Handle': 3,
          'Duo': 2,
          'Chromadeck': 20,
          'Spark': 6
        };
        const ledCount = deviceLedCountMap[vortexPort.name];
        if (ledCount !== undefined) {
          lightshow.vortex.setLedCount(ledCount);
          console.log(`Set led count to ${ledCount} for ${vortexPort.name}`);
        } else {
          console.log(`Device name ${vortexPort.name} not recognized`);
        }
        document.dispatchEvent(new CustomEvent('modeChange'));
        document.dispatchEvent(new CustomEvent('patternChange'));
        statusMessage.textContent = 'Device Connected!';
      });
      // Additional logic to handle successful connection
    } catch (error) {
      statusMessage.textContent = 'Failed to connect: ' + error.message;
      // Handle errors
    }
  });

  // resize the lightshow when window drags
  window.addEventListener('resize', () => {
    lightshow.width = window.innerWidth;
    lightshow.height = window.innerHeight;
  });

  window.randomize = controlPanel.randomize.bind(controlPanel);
});
