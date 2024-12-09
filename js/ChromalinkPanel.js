import Panel from './Panel.js';
import Notification from './Notification.js';

export default class ChromalinkPanel extends Panel {
  constructor(editor, modesPanel) {
    const content = `
      <div id="chromalinkOptions">
        <button id="chromalinkFlash" class="chromalink-button">Flash Duo Firmware</button>
        <input type="file" id="firmwareFileInput" style="display:none;" />
        <button id="chromalinkConnect" class="chromalink-button">Connect Duo</button>
      </div>
    `;
    super('chromalinkPanel', content, 'Chromalink Duo');
    this.editor = editor;
    this.vortexPort = editor.vortexPort;
    this.modesPanel = editor.modesPanel;
    this.isConnected = false;
  }

  initialize() {
    const connectButton = document.getElementById('chromalinkConnect');
    const flashButton = document.getElementById('chromalinkFlash');
    const panelElement = document.getElementById('chromalinkPanel');
    const firmwareFileInput = document.getElementById('firmwareFileInput');

    // Connect button logic
    connectButton.addEventListener('click', async () => {
      if (this.isConnected) {
        await this.disconnect();
      } else {
        await this.connect();
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
          await this.vortexPort.flashFirmware(this.modesPanel.lightshow.vortexLib, firmwareData, (chunk, totalChunks) => {
            // Update progress
            const progress = Math.round((chunk / totalChunks) * 100);
            Notification.success(`Writing firmware: ${progress}%...`);
          });
          // Call the vortexPort flash method
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
    // don't show to start
    this.hide();
  }

  async connect() {
    try {
      // Use the connect function from VortexPort
      this.duoHeader = await this.vortexPort.connectChromalink(this.modesPanel.lightshow.vortexLib);
      if (!this.duoHeader) {
        throw new Error('Failed to read Duo save header');
      }
      await this.modesPanel.checkVersion('Duo', this.duoHeader.version);
      const connectButton = document.getElementById('chromalinkConnect');
      connectButton.innerHTML = 'Disconnect Duo'
      this.isConnected = true;
      this.oldModes = new this.modesPanel.lightshow.vortexLib.ByteStream();
      if (!this.modesPanel.lightshow.vortex.getModes(this.oldModes)) {
        throw new Error('Failed to backup old modes');
      }
      this.modesPanel.lightshow.vortex.clearModes();
      this.modesPanel.lightshow.setLedCount(2);
      this.modesPanel.updateSelectedDevice('Duo', true);
      this.modesPanel.renderLedIndicators('Duo');
      this.modesPanel.selectAllLeds();
      Notification.success('Successfully Chromalinked Duo v' + this.duoHeader.version);
    } catch (error) {
      Notification.failure('Failed to connect: ' + error.message);
    }
  }

  async disconnect() {
    try {
      // Use the connect function from VortexPort
      const connectButton = document.getElementById('chromalinkConnect');
      connectButton.innerHTML = 'Connect Duo'
      this.isConnected = false;
      this.modesPanel.lightshow.vortex.clearModes();
      this.modesPanel.lightshow.setLedCount(20);
      if (!this.modesPanel.lightshow.vortex.setModes(this.oldModes, false)) {
        throw new Error('Failed to restore old modes');
      }
      this.oldModes = null;
      this.modesPanel.updateSelectedDevice('Chromadeck', true);
      this.modesPanel.renderLedIndicators('Chromadeck');
      this.modesPanel.selectAllLeds();
      Notification.success('Successfully Disconnected Chromalink');
    } catch (error) {
      Notification.failure('Failed to connect: ' + error.message);
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

  onDeviceConnect() {
    console.log('Device connected through Chromalink.');
    // Add more actions upon connection if needed
  }
}

