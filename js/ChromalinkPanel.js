import Panel from './Panel.js';
import Notification from './Notification.js';

export default class ChromalinkPanel extends Panel {
  constructor(editor) {
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
        </div>
        <button id="chromalinkFlash" class="chromalink-button">Flash Custom Firmware</button>
        <button id="chromalinkUpdate" class="chromalink-button">Update Firmware</button>
        <div class="chromalink-update-progress-container">
          <div id="firmwareProgress" class="chromalink-update-progress-bar">
            <div id="firmwareProgressBar"></div>
          </div>
        </div>
        <input type="file" id="firmwareFileInput" style="display:none;" />
      </div>
    `;
    super('chromalinkPanel', content, 'Chromalink Duo');
    this.editor = editor;
    this.vortexPort = editor.vortexPort;
    this.isConnected = false;
    this.chromadeckModes = null;
    this.oldModes = null;
  }

  initialize() {
    const connectButton = document.getElementById('chromalinkConnect');
    const firmwareFileInput = document.getElementById('firmwareFileInput');
    const flashButton = document.getElementById('chromalinkFlash');
    const updateButton = document.getElementById('chromalinkUpdate');
    const chromalinkDetails = document.getElementById('chromalinkDetails');
    const progressContainer = document.querySelector('.chromalink-update-progress-container');

    // Add erase modes checkbox
    const eraseModesContainer = document.createElement('div');
    eraseModesContainer.className = 'chromalink-checkbox-container';
    eraseModesContainer.innerHTML = `
        <input type="checkbox" id="eraseModesCheckbox" />
        <label for="eraseModesCheckbox">Erase Modes</label>
    `;
    progressContainer.parentElement.insertBefore(eraseModesContainer, progressContainer);

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
          progressContainer.style.display = 'block';
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
        } finally {
          setTimeout(() => {
            progressContainer.style.display = 'none';
            document.getElementById('firmwareProgressBar').style.width = '0';
          }, 1000);
        }
      };
      reader.readAsArrayBuffer(file);
    });

    updateButton.addEventListener('click', async () => {
      const backupModes = this.isConnected && !document.getElementById('eraseModesCheckbox').checked;
      if (backupModes && !this.isModernVersion()) {
        Notification.failure('Cannot backup modes on versions below 1.4.x.');
        return;
      }
      progressContainer.style.display = 'block';
      try {
        await this.updateFirmware();
      } catch (error) {
        Notification.failure('Update failed: ' + error.message);
      } finally {
        setTimeout(() => {
          progressContainer.style.display = 'none';
          document.getElementById('firmwareProgressBar').style.width = '0';
        }, 1000);
      }
    });

    this.hide();
  }

  // Add backup and restore modes functions
  async backupModes() {
    console.log("Backing up modes...");
    await this.pullModes(this.editor.vortexLib, this.editor.lightshow.vortex);
    this.oldModes = new this.editor.vortexLib.ByteStream();
    if (!this.editor.lightshow.vortex.getModes(this.oldModes)) {
      throw new Error('Failed to backup modes.');
    }
  }

  async restoreModes() {
    console.log("Restoring modes...");
    if (!this.editor.lightshow.vortex.setModes(this.oldModes, false)) {
      throw new Error('Failed to restore modes.');
    }
    await this.pushModes(this.editor.vortexLib, this.editor.lightshow.vortex);
    this.oldModes = null;
  }

  async writeDefaultModes() {
    console.log("Writing default modes...");
    // default modes on the duo as an array of bytes, can get this by using
    // the function vortexLib.getDataArray to get the array of bytes in a bytestream
    // after using lightshow.vortex.getModes() to get the modes into a bytestream
    // similar to backupModes() above
    let defaultModesData = [0xBB, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
      0x0E, 0x89, 0x0F, 0x74, 0xD2, 0x01, 0x04, 0x04, 0xB9, 0x09, 0x02, 0x06,
      0x06, 0x03, 0xFF, 0x00, 0x00, 0x00, 0x04, 0x00, 0x37, 0x02, 0x02, 0x1C,
      0x0E, 0x00, 0x17, 0x19, 0x0C, 0x00, 0xF0, 0x1A, 0x02, 0x02, 0x00, 0x01,
      0x97, 0x70, 0x9F, 0x00, 0x07, 0x01, 0x4D, 0x00, 0xB2, 0x00, 0x02, 0x02,
      0x00, 0x06, 0xC4, 0x70, 0x00, 0x00, 0x22, 0x00, 0x00, 0x00, 0x00, 0x17,
      0x00, 0x00, 0x3B, 0x00, 0x00, 0xE9, 0x4E, 0x00, 0x00, 0x03, 0x03, 0xC4,
      0x4D, 0x11, 0x00, 0xF0, 0x04, 0x3B, 0xB2, 0xE9, 0x00, 0x02, 0x06, 0x0E,
      0x07, 0xFF, 0x23, 0x00, 0x00, 0x06, 0x48, 0xFF, 0xC6, 0x55, 0xFF, 0x43,
      0x29, 0x00, 0xF0, 0x04, 0x00, 0x66, 0x55, 0xFF, 0x55, 0x57, 0x00, 0x02,
      0x06, 0x0D, 0x05, 0x9F, 0x00, 0x00, 0x5A, 0xFF, 0xFF, 0xFF, 0x9F, 0x15,
      0x00, 0x00, 0x07, 0x00, 0xFF, 0x1A, 0x02, 0x06, 0x05, 0x05, 0x00, 0x00,
      0x30, 0xFF, 0x54, 0xAA, 0xB1, 0x00, 0x00, 0x1B, 0x90, 0xFF, 0x55, 0x2D,
      0x00, 0x00, 0x02, 0x02, 0x08, 0x05, 0x00, 0x40, 0x54, 0x52, 0x26, 0x00,
      0x00, 0x00, 0x54, 0xAA, 0xFF, 0x55, 0x0B, 0x00, 0x00, 0x00, 0x08, 0x54,
      0x00, 0x05, 0xF0, 0x04, 0x02, 0x04, 0x02, 0xFF, 0x00, 0xF6, 0x08, 0x00,
      0x80, 0x00, 0x01, 0x02, 0xFF, 0x00, 0xF6, 0x08, 0x00, 0x80, 0x00 ];
    // turn the above array of bytes into a bytestream
    const defaultModes = new this.editor.vortexLib.ByteStream();
    if (!this.editor.vortexLib.createByteStreamFromRawData(defaultModesData, defaultModes)) {
      throw new Error('Failed to create bytestream from default mode data.');
    }
    // then set the modes with that array of bytes
    if (!this.editor.lightshow.vortex.setModes(defaultModes, false)) {
      throw new Error('Failed to write default modes.');
    }
    // refresh the mode list so they are visible
    this.editor.modesPanel.refreshModeList();
    // connect if necessary
    if (!this.isConnected) {
      await this.connect(false);
    }
    // then push the default modes
    await this.pushModes(this.editor.vortexLib, this.editor.lightshow.vortex);
  }

  // Check for valid version
  isModernVersion() {
    return this.isConnected && this.duoHeader && this.duoHeader.version >= '1.4.0';
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
      //await this.editor.checkVersion('Duo', this.duoHeader.version);
      const connectButton = document.getElementById('chromalinkConnect');
      connectButton.innerHTML = 'Disconnect Duo'
      if (this.editor.lightshow.vortex.numModes() > 0) {
        this.chromadeckModes = new this.editor.vortexLib.ByteStream();
        if (!this.editor.lightshow.vortex.getModes(this.chromadeckModes)) {
          throw new Error('Failed to backup old modes');
        }
      }
      this.editor.lightshow.vortex.clearModes();
      this.editor.lightshow.setLedCount(2);
      this.editor.devicePanel.updateSelectedDevice('Duo', true);
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
        Notification.success('Successfully Chromalinked Duo v' + this.duoHeader.version);
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
      if (this.chromadeckModes) {
        if (!this.editor.lightshow.vortex.setModes(this.chromadeckModes, false)) {
          throw new Error('Failed to restore old modes: ' + JSON.stringify(this.chromadeckModes));
        }
      }
      this.editor.modesPanel.refreshModeList();
      this.chromadeckModes = null;
      this.editor.devicePanel.updateSelectedDevice('Chromadeck', true);
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
    console.log('Fetching latest firmware...');
    const apiResponse = await fetch('https://vortex.community/downloads/json/duo');
    if (!apiResponse.ok) throw new Error('Failed to fetch firmware metadata');
    const responseData = await apiResponse.json();
    return responseData.firmware?.fileUrl;
  }

  async updateFirmware() {
    const progressBar = document.getElementById('firmwareProgressBar');
    try {
      const firmwareResponse = await fetch(await this.getFirmwareUrl());
      if (!firmwareResponse.ok) {
        throw new Error('Failed to fetch firmware file.');
      }
      const firmwareData = new Uint8Array(await firmwareResponse.arrayBuffer());
      Notification.success('Flashing Latest Duo Firmware...');
      await this.vortexPort.flashFirmware(
        this.editor.vortexLib,
        firmwareData,
        (chunk, totalChunks) => {
          const progress = Math.round((chunk / totalChunks) * 100);
          progressBar.style.width = `${progress}%`;
        }
      );
      Notification.success('Duo Firmware Successfully Updated');
      await this.reconnect();
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
      Notification.success('Pushing Duo modes via Chromalink...');
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

