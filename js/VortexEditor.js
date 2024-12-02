/* VortexEditor.js */
import Lightshow from './Lightshow.js';
import AboutPanel from './AboutPanel.js';
import ControlPanel from './ControlPanel.js';
import PatternPanel from './PatternPanel.js';
import ColorsetPanel from './ColorsetPanel.js';
import ColorPickerPanel from './ColorPickerPanel.js';
import ModesPanel from './ModesPanel.js';
import Modal from './Modal.js';
import VortexPort from './VortexPort.js';

export default class VortexEditor {
  constructor(vortexLib) {
    this.vortexLib = vortexLib;

    // Create and append canvas dynamically
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'lightshowCanvas';
    this.canvas.width = 800;
    this.canvas.height = 600;
    document.body.appendChild(this.canvas);

    // Initialize VortexPort
    this.vortexPort = new VortexPort();

    // Instantiate Lightshow
    this.lightshow = new Lightshow(vortexLib, this.canvas);

    // Instantiate Panels
    this.aboutPanel = new AboutPanel(this);
    this.patternPanel = new PatternPanel(this);
    this.colorsetPanel = new ColorsetPanel(this);
    this.modesPanel = new ModesPanel(this);
    this.colorPicker = new ColorPickerPanel(this);

    this.panels = [this.aboutPanel, this.patternPanel, this.colorsetPanel, this.modesPanel, this.colorPicker];
  }

  initialize() {
    // Start the lightshow
    this.lightshow.start();

    // Append panels to the DOM
    this.panels.forEach(panel => panel.appendTo(document.body));

    // Initialize Panels
    this.panels.forEach(panel => panel.initialize());

    // Handle welcome modal
    this.handleWelcomeModal();

    // Handle URL-imported mode data
    this.importModeDataFromUrl();

    // Listen for window resize to adjust lightshow
    window.addEventListener('resize', () => this.lightshow.resetToCenter());
  }

  handleWelcomeModal() {
    const welcomeTitle = "<h1>Welcome to lightshow.lol</h1>";
    const welcomeBlurb = `
      <p>If you found this website then you're likely a flow artist or glover, if you have no idea what that means then welcome to your first lightshow. 
      This website is an ongoing development and you can expect to find daily changes and fixes, below are some basic descriptions of the controls</p>
      <h2><strong>Animation</strong></h2>
      <p>The four 'Animation' controls in the top left only affect the lightshow on this website, they do not affect Vortex Devices and will not be saved.</p>
      <h2><strong>Pattern & Colorset</strong></h2>
      <p>Pick a pre-made pattern from the list, or adjust the parameters to fine-tune any pattern. Decide on a group of 1 to 8 colors to accompany the pattern. There are two types of patterns: strobes and blends, blends are the same as strobes but instead of blinking from color to color they smoothly blend. All patterns in the list can be made by adjusting the sliders (blend adds two sliders).</p>
      <h2><strong>Modes & Leds</strong></h2>
      <p>Each mode allows for a different pattern and colorset combination, you can add more modes to the list, share a mode by URL, or export & import a mode in JSON format.
      If a Vortex Device is connected then alternative leds can be selected to target, otherwise only one led is available</p>
      <div class="checkbox-container">
        <label><input type="checkbox" id="doNotShowAgain"> Do not show this again</label>
      </div>
    `;

    const showWelcome = localStorage.getItem('showWelcome') !== 'false';

    if (showWelcome) {
      const welcomeModal = new Modal('welcome');
      const welcomeConfig = { title: welcomeTitle, blurb: welcomeBlurb };
      welcomeModal.show(welcomeConfig);

      document.getElementById('doNotShowAgain').addEventListener('change', (event) => {
        localStorage.setItem('showWelcome', !event.target.checked);
      });
    }
  }

  importModeDataFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const encodedData = urlParams.get('data');

    if (encodedData) {
      try {
        this.modesPanel.importPatternFromData(atob(encodedData), false);
      } catch (error) {
        console.error('Error parsing mode data:', error);
      }
    }
  }

  async demoColorOnDevice(color) {
    try {
      if (!this.vortexPort.isTransmitting && this.vortexPort.isActive()) {
        await this.vortexPort.demoColor(this.lightshow.vortexLib, this.lightshow.vortex, color);
      }
    } catch (error) {
      Notification.failure("Failed to demo color (" + error + ")");
    }
  }

  async demoModeOnDevice() {
    try {
      if (!this.vortexPort.isTransmitting && this.vortexPort.isActive()) {
        await this.vortexPort.demoCurMode(this.lightshow.vortexLib, this.lightshow.vortex);
      }
    } catch (error) {
      Notification.failure("Failed to demo mode (" + error + ")");
    }
  }


}

