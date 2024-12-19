import Panel from './Panel.js';
import Notification from './Notification.js';

export default class ChromalinkPanel extends Panel {
  constructor(editor, modesPanel) {
    const content = `
      <div id="chromalinkOptions">
        <button id="chromalinkConnect" class="chromalink-button">Connect Duo</button>
        <div id="chromalinkDetails" style="display: none;">
          <div class="device-info">
            <img src="./public/images/duo-logo-square-64.png" alt="Duo Icon" id="duoIcon">
            <div id="duoInfo">
              <p id="deviceUpdateLabel"><strong>Device:</strong> Duo</p>
              <p id="deviceVersionLabel"><strong>Version:</strong> <span id="duoVersion"></span></p>
              <p id="deviceLatestVersionLabel"><strong>Modes:</strong> <span id="duoModes"></span></p>
            </div>
          </div>
          <button id="chromalinkFlash" class="chromalink-button" disabled>Flash Custom Firmware</button>
          <button id="chromalinkUpdate" class="chromalink-button" disabled>Update Firmware</button>
          <div class="progress-container">
            <div id="firmwareProgress" class="progress-bar">
              <div id="firmwareProgressBar"></div>
            </div>
          </div>
          <input type="file" id="firmwareFileInput" style="display:none;" />
        </div>
      </div>
    `;
    super('chromalinkPanel', content, 'Chromalink Duo');
    this.editor = editor;
    this.vortexPort = editor.vortexPort;
    this.modesPanel = modesPanel;
    this.isConnected = false;
  }

  initialize() {
    const connectButton = document.getElementById('chromalinkConnect');
    const firmwareFileInput = document.getElementById('firmwareFileInput');
    const flashButton = document.getElementById('chromalinkFlash');
    const updateButton = document.getElementById('chromalinkUpdate');
    const chromalinkDetails = document.getElementById('chromalinkDetails');

    connectButton.addEventListener('click', async () => {
      if (this.isConnected) {
        await this.disconnect();
      } else {
        await this.connect();
      }
    });

    flashButton.addEventListener('click', () => {
      firmwareFileInput.click();
    });

    firmwareFileInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) {
        Notification.failure('No firmware file selected.');
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const firmwareData = new Uint8Array(e.target.result);
        try {
          await this.vortexPort.flashFirmware(
            this.editor.vortexLib,
            firmwareData,
            (chunk, totalChunks) => {
              const progress = Math.round((chunk / totalChunks) * 100);
              document.getElementById('firmwareProgressBar').style.width = `${progress}%`;
            }
          );
          Notification.success('Firmware flashed successfully.');
        } catch (error) {
          Notification.failure('Firmware flash failed: ' + error.message);
        }
      };
      reader.readAsArrayBuffer(file);
    });

    updateButton.addEventListener('click', async () => {
      await this.updateFirmware();
    });

    this.hide();
  }

  async connect() {
    try {
      this.duoHeader = await this.vortexPort.connectChromalink(this.editor.vortexLib);
      if (!this.duoHeader) {
        throw new Error('Failed to read Duo save header');
      }

      this.isConnected = true;
      this.updateUIAfterConnect();
      Notification.success(`Successfully Chromalinked Duo v${this.duoHeader.version}`);
    } catch (error) {
      Notification.failure('Failed to connect: ' + error.message);
    }
  }

  async disconnect() {
    try {
      this.isConnected = false;
      this.updateUIAfterDisconnect();
      Notification.success('Successfully Disconnected Chromalink');
    } catch (error) {
      Notification.failure('Failed to disconnect: ' + error.message);
    }
  }

  updateUIAfterConnect() {
    const connectButton = document.getElementById('chromalinkConnect');
    const chromalinkDetails = document.getElementById('chromalinkDetails');
    connectButton.textContent = 'Disconnect Duo';

    document.getElementById('duoVersion').textContent = this.duoHeader.version;
    document.getElementById('duoModes').textContent = this.duoHeader.numModes;

    chromalinkDetails.style.display = 'block';
    document.getElementById('chromalinkFlash').disabled = false;
    document.getElementById('chromalinkUpdate').disabled = false;
  }

  updateUIAfterDisconnect() {
    const connectButton = document.getElementById('chromalinkConnect');
    const chromalinkDetails = document.getElementById('chromalinkDetails');
    connectButton.textContent = 'Connect Duo';

    chromalinkDetails.style.display = 'none';
    document.getElementById('chromalinkFlash').disabled = true;
    document.getElementById('chromalinkUpdate').disabled = true;
  }

  async updateFirmware() {
    const progressBar = document.getElementById('firmwareProgressBar');
    try {
      Notification.success('Fetching latest firmware...');
      const apiResponse = await fetch('https://vortex.community/downloads/json/duo');
      if (!apiResponse.ok) throw new Error('Failed to fetch firmware metadata');

      const responseData = await apiResponse.json();
      const firmwareUrl = responseData.firmware?.fileUrl;
      const firmwareResponse = await fetch(firmwareUrl);
      if (!firmwareResponse.ok) throw new Error('Failed to fetch firmware file.');

      const firmwareData = new Uint8Array(await firmwareResponse.arrayBuffer());
      Notification.success('Flashing firmware...');
      await this.vortexPort.flashFirmware(
        this.editor.vortexLib,
        firmwareData,
        (chunk, totalChunks) => {
          const progress = Math.round((chunk / totalChunks) * 100);
          progressBar.style.width = `${progress}%`;
        }
      );
      Notification.success('Firmware updated successfully.');
    } catch (error) {
      Notification.failure('Firmware update failed: ' + error.message);
    }
  }

  // Pull modes from Duo via Chromalink
  async pullModes(vortexLib, vortex) {
    if (!this.isConnected) {
      Notification.failure('Please connect first.');
      return;
    }
    try {
      Notification.success('Pulling Duo modes via Chromalink...');
      await this.vortexPort.pullDuoModes(vortexLib, vortex, this.duoHeader.numModes);
      //Notification.success(`Successfully pulled modes from Duo via Chromalink`);
    } catch (error) {
      Notification.failure('Failed to pull modes: ' + error.message);
    }
    this.modesPanel.refreshModeList(); // Refresh modes in the UI
  }

  // Push modes to Duo via Chromalink
  async pushModes(vortexLib, vortex) {
    if (!this.isConnected) {
      Notification.failure('Please connect first.');
      return;
    }

    try {
      Notification.success('Pushing Duo modes via Chromalink...');
      // update the number of modes
      this.duoHeader.numModes = vortex.numModes();
      // then push the header (which will reset the device after)
      await this.vortexPort.writeDuoHeader(vortexLib, vortex, this.duoHeader);
      // push those modes
      await this.vortexPort.pushDuoModes(vortexLib, vortex);
      Notification.success('Successfully pushed modes to Duo via Chromalink');
    } catch (error) {
      Notification.failure('Failed to push modes: ' + error.message);
    }
  }
}

