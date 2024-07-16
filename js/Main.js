import VortexLib from './VortexLib.js';
import Lightshow from './Lightshow.js';
import AboutPanel from './AboutPanel.js';
import ControlPanel from './ControlPanel.js';
import ModesPanel from './ModesPanel.js';
import VortexPort from './VortexPort.js';
import Modal from './Modal.js';

const vortexPort = new VortexPort();

const welcomeTitle = "<h1>Welcome to lightshow.lol</h1>";
const welcomeBlurb = `
  <p>If you found this website then you're likely a flow artist or glover, if you have no idea what that means then welcome to your first lightshow. 
  This website is an ongoing development and you can expect to find daily changes and fixes, below are some basic descriptions of the controls</p>

  <h2><strong>Animation</strong></h2>
  <p>The four 'Animation' controls in the top left only effect the lightshow on this website, they do not effect Vortex Devices and will not be saved.</p>

  <h2><strong>Pattern & Colorset</strong></h2>
  <p>Pick a pre-made pattern from the list, or adjust the parameters to fine-tune any pattern. Decide on a group of 1 to 8 colors to accompany the pattern. There are two types of patterns: strobes and blends, blends are the same as strobes but instead of blinking from color to color they smoothly blend. All patterns in the list can be made by adjusting the sliders (blend adds two sliders).</p>

  <h2><strong>Modes & Leds</strong></h2>
  <p>Each mode allows for a different pattern and colorset combination, you can add more modes to the list, share a mode by URL, or export & import a mode in JSON format.
  If a Vortex Device is connected then alternative leds can be selected to target, otherwise only one led is available</p>

  <div class="checkbox-container">
    <label><input type="checkbox" id="doNotShowAgain"> Do not show this again</label>
  </div>
`;

// instantiate VortexLib webassembly module
VortexLib().then(vortexLib => {
  // the lightshow needs the canvas id to operate on
  const canvas = document.getElementById('lightshowCanvas');
  // instantiate the lightshow
  let lightshow = new Lightshow(vortexLib, canvas);
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

  // finally import the modedata on the url if there is any
  const urlParams = new URLSearchParams(window.location.search);
  const encodedData = urlParams.get('data');
  if (encodedData) {
    try {
      // Decode the Base64 string and parse the JSON data
      modesPanel.importPatternFromData(atob(encodedData), false);
    } catch (error) {
      console.error('Error parsing mode data:', error);
    }
  }

  // resize the lightshow when window drags
  window.addEventListener('resize', () => {
    lightshow.resetToCenter();
  });

  window.randomize = controlPanel.randomize.bind(controlPanel);

  // Check if the welcome modal should be shown
  const showWelcome = localStorage.getItem('showWelcome') !== 'false';

  if (showWelcome) {
    // Create a new instance of the Modal class
    const welcomeModal = new Modal();

    // Configuration for the welcome modal
    const welcomeConfig = {
      title: welcomeTitle,
      blurb: welcomeBlurb,
    };

    // Show the welcome modal
    welcomeModal.show(welcomeConfig);

    // Add event listener to the checkbox
    document.getElementById('doNotShowAgain').addEventListener('change', (event) => {
      localStorage.setItem('showWelcome', !event.target.checked);
    });
  }
});

