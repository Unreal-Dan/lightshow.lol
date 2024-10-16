// ChromalinkPanel.js
import Panel from './Panel.js';
import Notification from './Notification.js';

export default class ChromalinkPanel extends Panel {
  constructor(vortexPort, modesPanel) {
    const content = `
      <h2>Chromalink Duo</h2>
      <div id="chromalinkOptions">
        <button id="chromalinkFlash" class="chromalink-button">Flash Duo Firmware</button>
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
        this.isConnected = true;
        connectedOptions.style.display = 'block';
        this.modesPanel.clearModeList();
        this.modesPanel.lightshow.setLedCount(2);
        this.modesPanel.updateSelectedDevice('Duo', true);
        Notification.success('Chromalink connected successfully.');
      } catch (error) {
        Notification.failure('Failed to connect: ' + error.message);
      }
    });

    // Flash firmware button logic
    flashButton.addEventListener('click', () => {
      this.flashFirmware();
    });

    // Pull modes button logic
    pullModesButton.addEventListener('click', () => {
      this.pullModes();
    });

    // Push modes button logic
    pushModesButton.addEventListener('click', () => {
      this.pushModes();
    });
  }

  // Simulated actions (replace with actual logic)
  async flashFirmware() {
    try {
      Notification.success('Flashing firmware...');
      // Simulate firmware flash
      await new Promise(resolve => setTimeout(resolve, 2000));
      Notification.success('Firmware flashed successfully.');
    } catch (error) {
      Notification.failure('Firmware flash failed: ' + error.message);
    }
  }

  async pullModes() {
    if (!this.isConnected) {
      Notification.failure('Please connect first.');
      return;
    }
    Notification.success('Pulling modes from Chromalink...');
    // Simulate pulling modes
    await new Promise(resolve => setTimeout(resolve, 1500));
    Notification.success('Modes pulled successfully.');
  }

  async pushModes() {
    if (!this.isConnected) {
      Notification.failure('Please connect first.');
      return;
    }
    Notification.success('Pushing modes to Chromalink...');
    // Simulate pushing modes
    await new Promise(resolve => setTimeout(resolve, 1500));
    Notification.success('Modes pushed successfully.');
  }

  onDeviceConnect() {
    console.log('Device connected through Chromalink.');
    // Add more actions upon connection if needed
  }
}

