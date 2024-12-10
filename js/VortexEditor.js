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
import WelcomePanel from './WelcomePanel.js';
import ChromalinkPanel from './ChromalinkPanel.js';
import UpdatePanel from './UpdatePanel.js';
import Notification from './Notification.js';

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
    this.welcomePanel = new WelcomePanel(this);
    this.aboutPanel = new AboutPanel(this);
    this.animationPanel = new AnimationPanel(this);
    this.patternPanel = new PatternPanel(this);
    this.colorsetPanel = new ColorsetPanel(this);
    this.modesPanel = new ModesPanel(this);
    this.colorPickerPanel = new ColorPickerPanel(this);
    this.updatePanel = new UpdatePanel(this);
    this.chromalinkPanel = new ChromalinkPanel(this);

    this.panels = [
      this.welcomePanel,
      this.aboutPanel,
      this.animationPanel,
      this.patternPanel,
      this.colorsetPanel,
      this.modesPanel,
      this.colorPickerPanel,
      this.updatePanel,
      this.chromalinkPanel
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

  async pushToDevice() {
    if (!this.vortexPort.isActive()) {
      Notification.failure("Please connect a device first");
      return;
    }
    if (this.chromalinkPanel && this.chromalinkPanel.isConnected) {
      await this.chromalinkPanel.pushModes(this.lightshow.vortexLib, this.lightshow.vortex);
    } else {
      await this.vortexPort.pushToDevice(this.lightshow.vortexLib, this.lightshow.vortex);
      Notification.success("Successfully pushed save");
    }
  }

  async pullFromDevice() {
    if (!this.vortexPort.isActive()) {
      Notification.failure("Please connect a device first");
      return;
    }
    if (this.chromalinkPanel && this.chromalinkPanel.isConnected) {
      await this.chromalinkPanel.pullModes(this.lightshow.vortexLib, this.lightshow.vortex);
    } else {
      await this.vortexPort.pullFromDevice(this.lightshow.vortexLib, this.lightshow.vortex);
      Notification.success("Successfully pulled save");
    }
    this.refreshModeList();
    this.refreshPatternControlPanel();
  }

  async transmitVL() {
    if (!this.vortexPort.isActive()) {
      Notification.failure("Please connect a device first");
      return;
    }
    await this.vortexPort.transmitVL(this.lightshow.vortexLib, this.lightshow.vortex);
    Notification.success("Successfully finished transmitting");
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

