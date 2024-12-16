/* VortexEditor.js */
import Lightshow from './Lightshow.js';
import AboutPanel from './AboutPanel.js';
import AnimationPanel from './AnimationPanel.js';
import PatternPanel from './PatternPanel.js';
import ColorsetPanel from './ColorsetPanel.js';
import ColorPickerPanel from './ColorPickerPanel.js';
import ModesPanel from './ModesPanel.js';
import LedSelectPanel from './LedSelectPanel.js';
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
    this.ledSelectPanel = new LedSelectPanel(this);
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
      this.ledSelectPanel,
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

    // Keydown event to show updatePanel
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Insert') {
        this.checkVersion(this.vortexPort.name, this.vortexPort.version);
        this.updatePanel.show();
      }
    });
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

  async checkVersion(device, version) {
    // the results are lowercased
    if (!device.length || device === 'None') {
      device = this.modesPanel.selectedDevice;
      if (!device.length || device === 'None') {
        // not connected?
        return;
      }
    }
    let lowerDevice = device.toLowerCase();

    // this can happen if the update panel is forced open with Insert
    if (!version) {
      version = '1.0.0';
    }

    // Fetch the latest firmware versions from vortex.community
    let latestFirmwareVersions;

    if (window.location.hostname.startsWith('vortex.community')) {
      const response = await fetch('https://vortex.community/downloads/json');
      latestFirmwareVersions = await response.json();
    } else {
      // example result that can be used for debugging:
      const latestFirmwareVersions = JSON.parse('{"gloves":{"firmware":{"_id":"6746b9c217de589dbc81c805", "device":"gloves", "version":"1.4.29", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-gloves-1.4.29.uf2", "fileSize":178688, "downloadCount":0, "releaseDate":"2024-11-27T06:18:42.708Z", "__v":0}}, "orbit":{"firmware":{"_id":"6746b9d417de589dbc81c807", "device":"orbit", "version":"1.4.31", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-orbit-1.4.31.uf2", "fileSize":189440, "downloadCount":0, "releaseDate":"2024-11-27T06:19:00.806Z", "__v":0}}, "handle":{"firmware":{"_id":"6746b9ec17de589dbc81c809", "device":"handle", "version":"1.4.31", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-handle-1.4.31.uf2", "fileSize":160768, "downloadCount":0, "releaseDate":"2024-11-27T06:19:24.621Z", "__v":0}}, "duo":{"firmware":{"_id":"674ebd4c17de589dbc81d6d6", "device":"duo", "version":"1.4.32", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-duo-1.4.32.bin", "fileSize":31612, "downloadCount":0, "releaseDate":"2024-12-03T08:11:56.380Z", "__v":0}}, "chromadeck":{"firmware":{"_id":"6758db20bc1e490fcc46cffd", "device":"chromadeck", "version":"1.4.34", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-chromadeck-1.4.34.zip", "fileSize":233557, "downloadCount":0, "releaseDate":"2024-12-11T00:21:52.767Z", "__v":0}}, "spark":{"firmware":{"_id":"6757fc1cbc1e490fcc46ceaf", "device":"spark", "version":"1.4.36", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-spark-1.4.36.zip", "fileSize":229031, "downloadCount":0, "releaseDate":"2024-12-10T08:30:20.822Z", "__v":0}}, "desktop":{"editor":{"_id":"66c3f4b5ec075d0abbdf3bb3", "device":"desktop", "version":"1.0.1.2", "category":"editor", "fileUrl":"https://vortex.community/firmwares/VortexEditor-desktop-1.0.1.2.exe", "fileSize":978432, "downloadCount":0, "releaseDate":"2024-08-20T01:43:17.125Z", "__v":0}, "library":{"_id":"6746b96817de589dbc81c7ff", "device":"desktop", "version":"1.4.34", "category":"library", "fileUrl":"https://vortex.community/firmwares/VortexDesktopLibrary-desktop-1.4.34.zip", "fileSize":9103976, "downloadCount":0, "releaseDate":"2024-11-27T06:17:12.475Z", "__v":0}}}');
    }

    // Compare versions
    if (latestFirmwareVersions && latestFirmwareVersions[lowerDevice]) {
      const latestVersion = latestFirmwareVersions[lowerDevice].firmware.version;
      const downloadUrl = latestFirmwareVersions[lowerDevice].firmware.fileUrl;
      this.updatePanel.displayFirmwareUpdateInfo(device, version, latestVersion, downloadUrl);
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
    this.modesPanel.refreshModeList();
    this.modesPanel.refreshPatternControlPanel();
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

