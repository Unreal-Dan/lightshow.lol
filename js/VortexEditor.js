/* VortexEditor.js */
import Lightshow from './Lightshow.js';
import AboutPanel from './AboutPanel.js';
import AnimationPanel from './AnimationPanel.js';
import PatternPanel from './PatternPanel.js';
import ColorsetPanel from './ColorsetPanel.js';
import ColorPickerPanel from './ColorPickerPanel.js';
import DevicePanel from './DevicePanel.js';
import ModesPanel from './ModesPanel.js';
import LedSelectPanel from './LedSelectPanel.js';
import Modal from './Modal.js';
import VortexPort from './VortexPort.js';
import WelcomePanel from './WelcomePanel.js';
import ChromalinkPanel from './ChromalinkPanel.js';
import CommunityBrowserPanel from './CommunityBrowserPanel.js';
import UpdatePanel from './UpdatePanel.js';
import Notification from './Notification.js';
import VortexLib from './VortexLib.js';
import { VERSION } from './version.js';  // Adjust path if needed

export default class VortexEditor {
  devices = {
    'None': {
      image: 'public/images/none-logo-square-512.png',
      icon: 'public/images/none-logo-square-64.png',
      label: 'None',
      ledCount: 1
    },
    'Orbit': {
      image: 'public/images/orbit.png',
      icon: 'public/images/orbit-logo-square-64.png',
      label: 'Orbit',
      ledCount: 28
    },
    'Handle': {
      image: 'public/images/handle.png',
      icon: 'public/images/handle-logo-square-64.png',
      label: 'Handle',
      ledCount: 3
    },
    'Gloves': {
      image: 'public/images/gloves.png',
      icon: 'public/images/gloves-logo-square-64.png',
      label: 'Gloves',
      ledCount: 10
    },
    'Chromadeck': {
      image: 'public/images/chromadeck.png',
      icon: 'public/images/chromadeck-logo-square-64.png',
      label: 'Chromadeck',
      ledCount: 20
    },
    'Spark': {
      image: 'public/images/spark.png',
      icon: 'public/images/spark-logo-square-64.png',
      label: 'Spark',
      ledCount: 6,
      // alternate spark image/icon/label for handle
      altImage: 'public/images/spark-handle.png',
      altIcon: 'public/images/spark-handle-logo-square-64.png',
      altLabel: 'SparkHandle',
    },
    'Duo': {
      image: 'public/images/duo.png',
      icon: 'public/images/duo-logo-square-64.png',
      label: 'Duo',
      ledCount: 2
    }
  };

  constructor(vortexLib) {
    this.vortexLib = vortexLib;

    // initialize the vortex container inside vortexlib
    this.vortex = new vortexLib.Vortex();
    this.vortex.init();
    this.vortex.setLedCount(1);

    // run a tick with the vortex container
    this.vortexLib.RunTick(this.vortex);

    // local server if the hostname is not lightshow.lol
    this.isLocalServer = !window.location.hostname.startsWith('lightshow.lol');

    // create a version overlay text in the bottom left
    const vlibVersion = this.vortex.getVersion();
    this.createVersionOverlay(`v${VERSION} (VortexLib v${vlibVersion})`);

    // Create and append canvas dynamically
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'lightshowCanvas';
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    document.body.appendChild(this.canvas);

    // Initialize VortexPort
    this.vortexPort = new VortexPort(this);

    // Instantiate Lightshow
    this.lightshow = new Lightshow(vortexLib, this.vortex, this.canvas);

    // Instantiate Panels
    this.welcomePanel = new WelcomePanel(this);
    this.aboutPanel = new AboutPanel(this);
    this.animationPanel = new AnimationPanel(this);
    this.patternPanel = new PatternPanel(this);
    this.colorsetPanel = new ColorsetPanel(this);
    this.devicePanel = new DevicePanel(this);
    this.modesPanel = new ModesPanel(this);
    this.ledSelectPanel = new LedSelectPanel(this);
    this.colorPickerPanel = new ColorPickerPanel(this);
    this.updatePanel = new UpdatePanel(this);
    this.chromalinkPanel = new ChromalinkPanel(this);
    this.communityBrowserPanel = new CommunityBrowserPanel(this);

    this.panels = [
      this.welcomePanel,
      this.aboutPanel,
      this.animationPanel,
      this.patternPanel,
      this.colorsetPanel,
      this.devicePanel,
      this.modesPanel,
      this.ledSelectPanel,
      this.colorPickerPanel,
      this.updatePanel,
      this.chromalinkPanel,
      this.communityBrowserPanel
    ];
    let allGood = true;
    this.panels.forEach((panel, index) => {
      if (!panel) {
        console.log("Failed to instantiated #" + index);
        allGood = false;
      }
    });
    if (allGood) {
      console.log("All panels instantiated successfully.");
    }
    // initial layout of left panels
    this.leftPanels = [
      this.aboutPanel,
      this.animationPanel,
      this.patternPanel,
      this.colorsetPanel,
      this.communityBrowserPanel
    ];
    this.rightPanels = [
      this.devicePanel,
      this.modesPanel,
      this.ledSelectPanel,
    ];
    this.mobileTabs = [
      // IDs of panels to include as tabs on mobile
      'welcomePanel',
      'animationPanel',
      'patternPanel',
      'colorsetPanel',
      'devicePanel',
      'modesPanel',
      'ledSelectPanel'
    ];
  }

  async initialize() {
    // Load dependencies
    await this.loadDependencies();

    // Start the lightshow
    this.lightshow.start();

    // I think the 3rd party dependencies are triggering some kind of async
    // loading of their own and we need to let it finish before appending the
    // panels to the page, otherwise the panels end up down below
    await this.sleep(300);

    // Append panels to the DOM
    this.panels.forEach((panel) => panel.appendTo(document.body));

    // Initialize Panels
    this.panels.forEach((panel) => panel.initialize());

    // position the panels
    let leftTop = 5;
    this.leftPanels.forEach((panel) => {
      if (!panel || !panel.panel) return;
      panel.panel.style.position = 'absolute';
      panel.panel.style.left = '5px';
      panel.panel.style.top = `${leftTop}px`;
      leftTop += panel.panel.offsetHeight + 5;
    });
    let rightTop = 5;
    this.rightPanels.forEach((panel) => {
      if (!panel || !panel.panel) return;
      panel.panel.style.position = 'absolute';
      panel.panel.style.right = '5px';
      panel.panel.style.top = `${rightTop}px`;
      rightTop += panel.panel.offsetHeight + 5;
    });

    // Handle URL-imported mode data
    this.importModeDataFromUrl();

    // Keydown event to show updatePanel
    document.addEventListener('keydown', async (event) => {
      if (event.key === 'Insert') {
        const device = this.devicePanel.selectedDevice;
        if (!device || device === 'None') {
          Notification.failure("Select a device first");
          return;
        }
        const deviceVersions = await this.getLatestFirmwareVersions(device);
        const latestVersion = deviceVersions.firmware.version;
        this.updatePanel.displayFirmwareUpdateInfo(device, 'N/A',
          latestVersion, 'https://vortex.community/downloads');
        this.updatePanel.show();
      }
    });

    // detect the postmessage from vortex community to send over a mode
    window.addEventListener('message', (event) => {
      console.log('Received message:', event);
      if (event.origin !== 'https://vortex.community') {
        console.warn('Rejected message from unauthorized origin:', event.origin);
        return;
      }
      let { type, data } = event.data;
      try {
        // Decode Base64 URL-safe format
        data = data.replace(/-/g, '+').replace(/_/g, '/');
        while (data.length % 4 !== 0) {
          data += '=';
        }

        // Decode Base64
        const binaryString = atob(data);
        const byteArray = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
          byteArray[i] = binaryString.charCodeAt(i);
        }

        let modeJson;

        // Attempt direct JSON parsing first
        try {
          modeJson = JSON.parse(new TextDecoder().decode(byteArray));
        } catch {
          // If direct parsing fails, assume it's compressed and try decompressing
          try {
            const decompressedJson = pako.inflate(byteArray, { to: 'string' });
            modeJson = JSON.parse(decompressedJson);
          } catch (error) {
            throw new Error("Invalid mode data: unable to parse or decompress.");
          }
        }

        if (type === 'mode') {
          try {
            this.modesPanel.importModeFromData(modeJson, false);
            console.log('Mode loaded successfully via postMessage');
          } catch (error) {
            console.error('Error loading mode via postMessage:', error);
          }
        }
        if (type === 'pattern') {
          try {
            this.modesPanel.importPatternFromData(modeJson, false);
            console.log('Mode loaded successfully via postMessage');
          } catch (error) {
            console.error('Error loading pattern via postMessage:', error);
          }
        }

      } catch (error) {
        console.error('Error decoding or decompressing mode data:', error);
      }
    });

    window.addEventListener('resize', () => {
      // TODO: Responsive layout
      //this.applyLayout();
      // always shift the lightshow to be centered
      this.lightshow.resetToCenter();
    });

    // In `VortexEditor.js` inside the `initialize` method:
    if (this.detectMobile()) {
      const panelContainer = document.createElement('div');
      panelContainer.className = 'mobile-panel-container';

      // Create tab buttons container
      const tabButtonsContainer = document.createElement('div');
      tabButtonsContainer.className = 'mobile-tab-buttons';

      // Create panel content container
      const panelContentContainer = document.createElement('div');
      panelContentContainer.className = 'mobile-panel-content';

      // Append tabs and content containers
      panelContainer.appendChild(tabButtonsContainer);
      panelContainer.appendChild(panelContentContainer);
      document.body.appendChild(panelContainer);

      // add panels to mobile tabs list
      this.panels.forEach((panel) => {
        if (this.mobileTabs.includes(panel.panel.id)) {
          const tabButton = document.createElement('button');
          tabButton.className = 'mobile-tab-button';
          tabButton.dataset.panelId = panel.panel.id; // Link tab to panel by ID
          tabButton.innerText = panel.panel.title;
          tabButton.addEventListener('click', () => {
            this.setActiveTab(panel.panel.id);
          });
          tabButtonsContainer.appendChild(tabButton);
        }
      });

      // apply the mobile layout
      this.applyLayout();
    }
  }

  // Function to create the version overlay
  createVersionOverlay(versionText = "v1.0.0") {
    // Check if overlay already exists
    let overlay = document.getElementById('versionOverlay');
    if (!overlay) {
      // Create overlay element
      overlay = document.createElement('div');
      overlay.id = 'versionOverlay';
      document.body.appendChild(overlay);
    }

    // Style the overlay
    Object.assign(overlay.style, {
      position: 'absolute',
      bottom: '10px',
      left: '10px',
      background: 'rgba(0, 0, 0, 0.1)', // Semi-transparent background
      color: 'rgba(255, 255, 255, 0.2)', // semi transparent text
      padding: '5px 10px',
      borderRadius: '5px',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      pointerEvents: 'none', // Prevent interactions
      zIndex: '9999',
    });

    // Set version text
    overlay.innerText = `${versionText}`;
  }

  // sleep function
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // helper for 1.3.0 compatibility version check
  isVersionGreaterOrEqual(currentVersion, targetVersion = '1.3.0') {
    const currentParts = currentVersion.split('.').map(Number);
    const targetParts = targetVersion.split('.').map(Number);

    for (let i = 0; i < targetParts.length; i++) {
      if (currentParts[i] > targetParts[i]) return true;
      if (currentParts[i] < targetParts[i]) return false;
    }
    return true;
  }

  setActiveTab(panelId) {
    const panelContentContainer = document.querySelector('.mobile-panel-content');

    // Hide all panels except the selected one
    this.panels.forEach(panel => {
      const isActive = panel.panel.id === panelId;
      panel.setActiveForMobile(isActive);

      if (isActive) {
        panelContentContainer.innerHTML = ''; // Clear previous panel
        panelContentContainer.appendChild(panel.panel); // Show the active panel
      }
    });

    // Update the active state of the tab buttons
    const tabButtons = document.querySelectorAll('.mobile-tab-button');
    tabButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.panelId === panelId);
    });
  }

  async loadDependencies() {
    this.loadStylesheet("mainStyles", "css/styles.css");
    this.loadStylesheet("fontsAwesomeStyles", "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css");
    await this.loadScript("pako", "https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js");
    await this.loadScript("jszip", "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    await this.loadScript("lzstring", "https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.4.4/lz-string.min.js");

    // Dynamically load ESPTool
    window.esptoolPackage = await import("https://cdn.jsdelivr.net/gh/adafruit/Adafruit_WebSerial_ESPTool@latest/dist/web/index.js");
  }

  // Utility to dynamically load a script with cache buster
  loadScript(name, src, isModule = false) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const cacheBuster = `?v=${new Date().getTime()}`;
      script.src = `${src}${cacheBuster}`;
      script.id = name;
      if (isModule) script.type = 'module';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Utility to dynamically load a stylesheet with cache buster
  loadStylesheet(name, href) {
    const link = document.createElement('link');
    const cacheBuster = `?v=${new Date().getTime()}`;
    link.rel = 'stylesheet';
    link.id = name;
    link.href = `${href}${cacheBuster}`;
    document.head.appendChild(link);
  }

  detectMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) || window.innerWidth < 1200;
  }

  applyLayout() {
    const isNowMobile = this.detectMobile();
    if (isNowMobile === this.isMobile) {
      // nothing to change
      return;
    }
    // when switching between mobile and non mobile update the layout
    this.isMobile = isNowMobile;

    // update the stylesheet
    const currentStylesheet = document.getElementById('mainStyles');
    if (this.isMobile && currentStylesheet) {
      currentStylesheet.href = "css/mobile-styles.css?v=__CACHE_BUSTER__";
    }

    // Update layout for all panels
    this.panels.forEach(panel => {
      panel.updateLayout(this.isMobile);
    });

    // update the lightshow layout
    this.lightshow.updateLayout(this.isMobile);

    // set the active tab if mobile
    if (this.isMobile && this.panels.length > 0) {
      this.setActiveTab(this.panels[0].panel.id);
    }
  }

  setActiveTab(panelId) {
    const panelContentContainer = document.querySelector('.mobile-panel-content');

    // Ensure only the active panel is visible
    this.panels.forEach(panel => {
      const isActive = panel.panel.id === panelId;

      if (isActive) {
        panel.panel.classList.add('active'); // Mark as active
        panelContentContainer.innerHTML = ''; // Clear any previously active panel
        panelContentContainer.appendChild(panel.panel); // Show the active panel
      } else {
        panel.panel.classList.remove('active'); // Mark as inactive
      }
    });

    // Update tab button states
    const tabButtons = document.querySelectorAll('.mobile-tab-button');
    tabButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.panelId === panelId);
    });
  }

  importModeDataFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const encodedData = urlParams.get('data');

    if (encodedData) {
      this.modesPanel.importModeFromLink(encodedData);
    }
  }

  async getLatestFirmwareVersions(device) {
    let latestFirmwareVersions;
    // detect local server and return fake data
    if (this.isLocalServer) {
      console.log("Detected local server! Using fake version data response for comparison...");
      // example result that can be used for debugging:
      latestFirmwareVersions = JSON.parse('{"gloves":{"firmware":{"_id":"6746b9c217de589dbc81c805", "device":"gloves", "version":"1.4.29", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-gloves-1.4.29.uf2", "fileSize":178688, "downloadCount":0, "releaseDate":"2024-11-27T06:18:42.708Z", "__v":0}}, "orbit":{"firmware":{"_id":"6746b9d417de589dbc81c807", "device":"orbit", "version":"1.4.31", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-orbit-1.4.31.uf2", "fileSize":189440, "downloadCount":0, "releaseDate":"2024-11-27T06:19:00.806Z", "__v":0}}, "handle":{"firmware":{"_id":"6746b9ec17de589dbc81c809", "device":"handle", "version":"1.4.31", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-handle-1.4.31.uf2", "fileSize":160768, "downloadCount":0, "releaseDate":"2024-11-27T06:19:24.621Z", "__v":0}}, "duo":{"firmware":{"_id":"674ebd4c17de589dbc81d6d6", "device":"duo", "version":"1.4.32", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-duo-1.4.32.bin", "fileSize":31612, "downloadCount":0, "releaseDate":"2024-12-03T08:11:56.380Z", "__v":0}}, "chromadeck":{"firmware":{"_id":"6758db20bc1e490fcc46cffd", "device":"chromadeck", "version":"1.4.34", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-chromadeck-1.4.34.zip", "fileSize":233557, "downloadCount":0, "releaseDate":"2024-12-11T00:21:52.767Z", "__v":0}}, "spark":{"firmware":{"_id":"6757fc1cbc1e490fcc46ceaf", "device":"spark", "version":"1.4.36", "category":"firmware", "fileUrl":"https://vortex.community/firmwares/VortexEngine-spark-1.4.36.zip", "fileSize":229031, "downloadCount":0, "releaseDate":"2024-12-10T08:30:20.822Z", "__v":0}}, "desktop":{"editor":{"_id":"66c3f4b5ec075d0abbdf3bb3", "device":"desktop", "version":"1.0.1.2", "category":"editor", "fileUrl":"https://vortex.community/firmwares/VortexEditor-desktop-1.0.1.2.exe", "fileSize":978432, "downloadCount":0, "releaseDate":"2024-08-20T01:43:17.125Z", "__v":0}, "library":{"_id":"6746b96817de589dbc81c7ff", "device":"desktop", "version":"1.4.34", "category":"library", "fileUrl":"https://vortex.community/firmwares/VortexDesktopLibrary-desktop-1.4.34.zip", "fileSize":9103976, "downloadCount":0, "releaseDate":"2024-11-27T06:17:12.475Z", "__v":0}}}');
    } else {
      // fetch the firmware versions from vortex community
      const response = await fetch('https://vortex.community/downloads/json');
      latestFirmwareVersions = await response.json();
    }
    if (!device) {
      return latestFirmwareVersions;
    }
    return latestFirmwareVersions[device.toLowerCase()];
  }

  // TODO: maybe move this function to UpdatePanel.js not sure
  async checkVersion(device, version) {
    // the results are lowercased
    if (!device.length) {
      console.log("Missing device for comparison, checking devicePanel...");
      device = this.devicePanel.selectedDevice;
      if (!device.length) {
        console.log("Missing device for comparison, devicePanel and port device empty");
        // not connected?
        return;
      }
    }
    // this can happen if the update panel is forced open with Insert
    if (!version) {
      console.log("Missing version for comparison, using 1.0.0...");
      version = '1.0.0';
    }

    // Fetch the latest firmware versions from vortex.community
    const deviceVersions = await this.getLatestFirmwareVersions(device);
    if (!deviceVersions) {
      console.log("Missing latest firmware version info");
      return;
    }
    const latestVersion = deviceVersions.firmware.version;
    const downloadUrl = deviceVersions.firmware.fileUrl;
    console.log(`Comparing ${latestVersion} with ${downloadUrl} for ${device}...`);
    this.updatePanel.displayFirmwareUpdateInfo(device, version, latestVersion, downloadUrl);
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

window.addEventListener('load', async () => {
  try {
    // Wait until everything (including external scripts) is fully loaded
    const vortexLib = await VortexLib();
    const vortexEditor = new VortexEditor(vortexLib);
    await vortexEditor.initialize();
  } catch (error) {
    console.error('Error initializing Vortex:', error);
  }
});
