/* VortexEditor.js */
import Lightshow from './Lightshow.js';
import AboutPanel from './AboutPanel.js';
import AnimationPanel from './AnimationPanel.js';
import PatternPanel from './PatternPanel.js';
import ColorsetPanel from './ColorsetPanel.js';
import ColorPickerPanel from './ColorPickerPanel.js';
import ModesPanel from './ModesPanel.js';
import Modal from './Modal.js';
import VortexPort from './VortexPort.js';
import WelcomePanel from './WelcomePanel.js'; // Add this import

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
    this.welcomePanel = new WelcomePanel(this); // Add WelcomePanel
    this.aboutPanel = new AboutPanel(this);
    this.animationPanel = new AnimationPanel(this);
    this.patternPanel = new PatternPanel(this);
    this.colorsetPanel = new ColorsetPanel(this);
    this.modesPanel = new ModesPanel(this);
    this.colorPicker = new ColorPickerPanel(this);

    this.panels = [
      this.welcomePanel, // Add WelcomePanel to panels array
      this.aboutPanel,
      this.animationPanel,
      this.patternPanel,
      this.colorsetPanel,
      this.modesPanel,
      this.colorPicker,
    ];
  }

  initialize() {
    // Start the lightshow
    this.lightshow.start();

    // Append panels to the DOM
    this.panels.forEach((panel) => panel.appendTo(document.body));

    // Initialize Panels
    this.panels.forEach((panel) => panel.initialize());

    // Handle URL-imported mode data
    this.importModeDataFromUrl();

    // Listen for window resize to adjust lightshow
    window.addEventListener('resize', () => this.lightshow.resetToCenter());
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

