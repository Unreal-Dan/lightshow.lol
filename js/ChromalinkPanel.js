import Panel from './Panel.js';
import Notification from './Notification.js';
import Modal from './Modal.js';

export default class ChromalinkPanel extends Panel {
  constructor(editor) {
    const content = `
      <div id="chromalinkOptions">
        <button id="chromalinkConnect" class="chromalink-button" title="Connect to a chromalinked Duo">Connect Duo</button>
        <div id="chromalinkDetails" style="display: none;">
          <div class="device-info">
            <img src="./public/images/duo-logo-square-64.png" alt="Duo Icon" id="duoIcon">
            <div id="duoInfo">
              <p id="deviceUpdateLabel"><strong>Device:</strong> Duo</p>
              <p id="deviceVersionLabel"><strong>Version:</strong> <span id="duoVersion"></span></p>
              <p id="deviceLatestVersionLabel"><strong>Modes:</strong> <span id="duoModes"></span></p>
            </div>
          </div>
        </div>
        <button id="chromalinkFlash" class="chromalink-button" title="Flash a custom Duo firmware">Flash Custom Firmware</button>
        <button id="chromalinkUpdate" class="chromalink-button" title="Flash latest Duo firmware">Update Firmware</button>
        <div class="chromalink-update-progress-container">
          <div id="firmwareProgress" class="chromalink-update-progress-bar">
            <div id="firmwareProgressBar"></div>
          </div>
        </div>
        <input type="file" id="firmwareFileInput" accept=".bin" style="display:none;" />
      </div>
    `;
    super(editor, 'chromalinkPanel', content, 'Chromalink Duo');
    this.editor = editor;
    this.vortexPort = editor.vortexPort;
    this.isConnected = false;
    this.confirmationModal = new Modal('duo-flash-confirmation');
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
      // Reset the input to ensure change fires
      firmwareFileInput.value = '';
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
        await this.flashFirmware(new Uint8Array(e.target.result));
      };
      reader.readAsArrayBuffer(file);
    });

    updateButton.addEventListener('click', async () => {
      this.confirmationModal.show({
        title: 'Confirm Firmware Flash',
        blurb: 'Are you sure you want to update the Duo firmware?',
        buttons: [
          {
            label: '',
            onClick: () => this.confirmationModal.hide(),
            customHtml: '<button class="modal-button cancel-button">No</button>',
          },
          {
            label: '',
            onClick: () => {
              this.confirmationModal.hide();
              this.updateFirmware();
            },
            customHtml: '<button class="modal-button proceed-button">Yes</button>',
          },
        ],
      });
    });

    this.hide();
  }

  async onDeviceConnect(deviceName) {
    // if the device has UPDI support open a chromalink window
    if (deviceName === 'Chromadeck') {
      this.show();
    }
  }

  async onDeviceDisconnect(deviceName) {
    this.hide();
  }

  async onDeviceSelected(devicename) {
    // maybe do something here
  }

  async reconnect(notify = false) {
    await this.disconnect(notify);
    await this.connect(notify);
  }

  async connect(notify = true) {
    try {
      // Use the connect function from VortexPort
      this.duoHeader = await this.vortexPort.connectChromalink(this.editor.vortexLib);
      if (!this.duoHeader) {
        throw new Error('Failed to read Duo save header');
      }
      this.isConnected = true;
      await this.editor.checkVersion('Duo', this.duoHeader.version);
      const connectButton = document.getElementById('chromalinkConnect');
      connectButton.innerHTML = 'Disconnect Duo'
      if (this.editor.lightshow.vortex.numModes() > 0) {
        this.oldModes = new this.editor.vortexLib.ByteStream();
        if (!this.editor.lightshow.vortex.getModes(this.oldModes)) {
          throw new Error('Failed to backup old modes');
        }
      }
      this.editor.lightshow.vortex.clearModes();
      this.editor.lightshow.setLedCount(2);
      await this.editor.devicePanel.updateSelectedDevice('Duo', true);
      this.editor.devicePanel.toggleBrightnessSlider(255, false);
      const deviceBrightness = await this.editor.vortexPort.getBrightness(
        this.editor.vortexLib, this.editor.lightshow.vortex);
      if (deviceBrightness > 0) {
        this.editor.devicePanel.toggleBrightnessSlider(deviceBrightness, true);
      }
      this.editor.modesPanel.refreshModeList();
      // update ui
      document.getElementById('duoIcon').style.display = 'block';
      document.getElementById('duoInfo').style.display = 'block';
      document.getElementById('duoVersion').textContent = this.duoHeader.version;
      document.getElementById('duoModes').textContent = this.duoHeader.numModes;
      const chromalinkDetails = document.getElementById('chromalinkDetails');
      chromalinkDetails.style.display = 'block';
      // give a notification
      if (notify) {
        Notification.success('Successfully Chromalinked Duo');
      }
    } catch (error) {
      Notification.failure('Failed to connect: ' + error.message);
    }
  }
  
  async disconnect(notify = true) {
    try {
      // Use the connect function from VortexPort
      const connectButton = document.getElementById('chromalinkConnect');
      connectButton.innerHTML = 'Connect Duo'
      this.isConnected = false;
      this.editor.lightshow.vortex.clearModes();
      this.editor.lightshow.setLedCount(20);
      if (this.oldModes) {
        if (!this.editor.lightshow.vortex.setModes(this.oldModes, false)) {
          throw new Error('Failed to restore old modes: ' + JSON.stringify(this.oldModes));
        }
      }
      this.editor.modesPanel.refreshModeList();
      this.oldModes = null;
      await this.editor.devicePanel.updateSelectedDevice('Chromadeck', true);
      const chromalinkDetails = document.getElementById('chromalinkDetails');
      chromalinkDetails.style.display = 'none';
      document.getElementById('duoIcon').style.display = 'none';
      document.getElementById('duoInfo').style.display = 'none';
      if (notify) {
        Notification.success('Successfully Disconnected Chromalink');
      }
    } catch (error) {
      Notification.failure('Failed to disconnect: ' + error.message);
    }
  }

  async getFirmwareUrl() {
    if (this.editor.isLocalServer) {
      console.log('Using local firmware...');
      return 'public/data/VortexEngine-duo-1.4.34.bin';
    }
    // fetch the firmware url from vortex community downloads json api
    const apiResponse = await fetch('https://vortex.community/downloads/json/duo');
    if (!apiResponse.ok) throw new Error('Failed to fetch firmware metadata');
    const responseData = await apiResponse.json();
    return responseData.firmware?.fileUrl;
  }

  async flashFirmware(firmwareData) {
    // Show the progress bar container and reset width
    const progressContainer = document.querySelector('.chromalink-update-progress-container');
    const progressBar = document.getElementById('firmwareProgressBar');
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    this.editor.lightshow.stop();
    try {
      await this.vortexPort.flashFirmware(
        this.editor.vortexLib,
        firmwareData,
        (chunk, totalChunks) => {
          const progress = Math.round((chunk / totalChunks) * 100);
          progressBar.style.width = `${progress}%`;
        }
      );
      Notification.success('Firmware flashed successfully.');
    } catch (error) {
      Notification.failure('Firmware flash failed: ' + error.message);
    }
    this.editor.lightshow.start();
    if (this.isConnected) {
      await this.disconnect();
    }
    if (this.editor.updatePanel.isVisible) {
      this.editor.updatePanel.hide();
    }
    // Hide the progress bar container after a short delay
    setTimeout(() => {
      progressContainer.style.display = 'none';
    }, 1000);
  }

  async updateFirmware() {
    try {
      // fetch latest firmware to flash
      console.log('Fetching latest firmware...');
      const firmwareResponse = await fetch(await this.getFirmwareUrl());
      if (!firmwareResponse.ok) {
        throw new Error('Failed to fetch firmware file.');
      }
      Notification.success('Flashing Latest Duo Firmware...');
      await this.flashFirmware(new Uint8Array(await firmwareResponse.arrayBuffer()));
    } catch (error) {
      Notification.failure('Firmware update failed: ' + error.message);
    }
  }

  // Load modes from Duo via Chromalink
  async pullModes(vortexLib, vortex) {
    if (!this.isConnected) {
      Notification.failure('Please connect first.');
      return;
    }
    try {
      Notification.success('Loading Duo modes via Chromalink...');
      await this.vortexPort.pullDuoModes(vortexLib, vortex, this.duoHeader.numModes);
      Notification.success('Successfully pulled Duo modes via Chromalink');
    } catch (error) {
      Notification.failure('Failed to pull modes: ' + error.message);
    }
    this.editor.modesPanel.refreshModeList(); // Refresh modes in the UI
  }

  // Push modes to Duo via Chromalink
  async pushModes(vortexLib, vortex) {
    if (!this.isConnected) {
      Notification.failure('Please connect first.');
      return;
    }

    try {
      Notification.success('Saving Duo modes via Chromalink...');
      // update the number of modes
      this.duoHeader.numModes = vortex.numModes();
      // then push the header (which will reset the device after)
      await this.vortexPort.writeDuoHeader(vortexLib, vortex, this.duoHeader);
      // push those modes
      await this.vortexPort.pushDuoModes(vortexLib, vortex);
      Notification.success('Successfully pushed Duo modes via Chromalink');
    } catch (error) {
      Notification.failure('Failed to push modes: ' + error.message);
    }
  }
}

