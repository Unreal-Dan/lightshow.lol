import Panel from './Panel.js';
import Notification from './Notification.js';

export default class ChromalinkPanel extends Panel {
  constructor(vortexPort, modesPanel) {
    const content = `
      <h2>Chromalink Duo</h2>
      <div id="chromalinkOptions">
        <button id="chromalinkFlash" class="chromalink-button">Flash Duo Firmware</button>
        <input type="file" id="firmwareFileInput" style="display:none;" />
        <button id="chromalinkConnect" class="chromalink-button">Connect Duo</button>
      </div>
      <div id="chromalinkConnectedOptions" style="display:none;">
        <button id="chromalinkPullModes" class="chromalink-button">Pull Modes</button>
        <button id="chromalinkPushModes" class="chromalink-button">Push Modes</button>
      </div>
    `;

    super('chromalinkPanel', content);
    this.vortexPort = vortexPort;
    this.modesPanel = modesPanel;
    this.isConnected = false;
  }

  initialize() {
    const connectButton = document.getElementById('chromalinkConnect');
    const flashButton = document.getElementById('chromalinkFlash');
    const pullModesButton = document.getElementById('chromalinkPullModes');
    const pushModesButton = document.getElementById('chromalinkPushModes');
    const connectedOptions = document.getElementById('chromalinkConnectedOptions');

    // Connect button logic
    connectButton.addEventListener('click', async () => {
      try {
        // Use the connect function from VortexPort
        if (!await this.vortexPort.connectChromalink(this.modesPanel.lightshow.vortexLib)) {
          // failed to connect
          return;
        }
        this.isConnected = true;
        connectedOptions.style.display = 'block';
        this.modesPanel.lightshow.vortex.clearModes();
        this.modesPanel.lightshow.setLedCount(2);
        this.modesPanel.updateSelectedDevice('Duo', true);
        this.modesPanel.renderLedIndicators('Duo');
        this.modesPanel.selectAllLeds();
      } catch (error) {
        Notification.failure('Failed to connect: ' + error.message);
      }
    });

    // Flash firmware button logic
    flashButton.addEventListener('click', async () => {
      firmwareFileInput.click(); // Trigger file input
    });

    // Handle file selection and flash firmware
    firmwareFileInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) {
        Notification.failure('No firmware file selected.');
        return;
      }

      // Read file as ArrayBuffer
      const reader = new FileReader();
      reader.onload = async (e) => {
        const firmwareData = new Uint8Array(e.target.result); // Get the binary data
        try {
          //Notification.success('Flashing firmware...');
          await this.vortexPort.flashFirmware(this.modesPanel.lightshow.vortexLib, firmwareData); // Call the vortexPort flash method
          Notification.success('Firmware flashed successfully.');
        } catch (error) {
          Notification.failure('Firmware flash failed: ' + error.message);
        }
      };
      reader.onerror = () => {
        Notification.failure('Error reading firmware file.');
      };
      reader.readAsArrayBuffer(file); // Read the file as binary data
    });

    // Pull modes button logic
    pullModesButton.addEventListener('click', async () => {
      await this.pullModes();
    });

    // Push modes button logic
    pushModesButton.addEventListener('click', async () => {
      await this.pushModes();
    });
  }

  // Pull modes from Duo via Chromalink
  async pullModes() {
    if (!this.isConnected) {
      Notification.failure('Please connect first.');
      return;
    }
    try {
      Notification.success('Pulling modes from Chromalink...');
      await this.vortexPort.pullDuoModes(this.modesPanel.lightshow.vortexLib, this.modesPanel.lightshow.vortex);
      Notification.success('Modes pulled successfully.');
    } catch (error) {
      Notification.failure('Failed to pull modes: ' + error.message);
    }
    this.modesPanel.refreshModeList(); // Refresh modes in the UI
  }

  // Push modes to Duo via Chromalink
  async pushModes() {
    if (!this.isConnected) {
      Notification.failure('Please connect first.');
      return;
    }

    try {
      Notification.success('Pushing modes to Chromalink...');
      await this.vortexPort.pushDuoModes(this.modesPanel.lightshow.vortexLib, this.modesPanel.lightshow.vortex);
      Notification.success('Modes pushed successfully.');
    } catch (error) {
      Notification.failure('Failed to push modes: ' + error.message);
    }
  }

  onDeviceConnect() {
    console.log('Device connected through Chromalink.');
    // Add more actions upon connection if needed
  }
}

