import Panel from './Panel.js';
import Notification from './Notification.js';

export default class UpdatePanel extends Panel {
  constructor(editor, modesPanel) {
    const content = `
      <div id="updateOptions">
        <button id="updateFlash" class="update-button">Flash ESP32 Firmware</button>
        <div class="progress-container">
          <div id="overallProgress" class="progress-bar">
            <div id="overallProgressBar"></div>
          </div>
        </div>
        <div>
          <span id="updateProgress" style="margin-top: 10px;"></div>
        </div>
      </div>
    `;
    super('updatePanel', content, 'Device Updates', { showCloseButton: true });
    this.editor = editor;
    this.vortexPort = editor.vortexPort;
    this.modesPanel = modesPanel;
    this.espStub = null;
  }

  initialize() {
    const flashButton = document.getElementById('updateFlash');
    const updateProgress = document.getElementById('updateProgress');

    flashButton.addEventListener('click', async () => {
      if (!this.vortexPort.serialPort) {
        Notification.failure('No device connected.');
        return;
      }

      try {
        Notification.success('Starting ESP32 firmware flash...');
        updateProgress.textContent = 'Initializing ESP32 connection...';

        await this.initializeESPFlasher();
        await this.fetchAndFlashFirmware();

        updateProgress.textContent = 'Firmware flashing completed!';
        Notification.success('Firmware updated successfully.');
      } catch (error) {
        updateProgress.textContent = 'Firmware flash failed.';
        Notification.failure('Firmware flash failed: ' + error.message);
        console.error(error);
      }
    });

    document.addEventListener('deviceConnected', () => {
      Notification.success('Device connected. Ready to flash firmware.');
    });

    this.toggleCollapse(false);
    this.hide();
  }

  async initializeESPFlasher() {
    try {
      if (!this.vortexPort.serialPort) {
        throw new Error('No serial port available.');
      }

      const esploaderMod = await window.esptoolPackage;
      const esploader = new esploaderMod.ESPLoader(this.vortexPort.serialPort, console);

      await esploader.initialize();
      this.espStub = await esploader.runStub();
    } catch (error) {
      throw new Error('Failed to initialize ESP flasher: ' + error.message);
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async fetchAndFlashFirmware() {
    let targetDevice = this.vortexPort.name.toLowerCase();
    if (!targetDevice) {
      targetDevice = this.editor.modesPanel.selectedDevice.toLowerCase();
    }
    if (targetDevice === 'none') {
      throw new Error(`Select a device first`);
    }
    if (targetDevice !== 'chromadeck' && targetDevice !== 'spark') {
      throw new Error(`Cannot flash '${targetDevice}', wrong device!`);
    }
    const firmwareApiUrl = `https://vortex.community/downloads/json/${targetDevice}`;
    let firmwareFiles;
    try {
      // Fetch the firmware metadata
      const apiResponse = await fetch(firmwareApiUrl);
      if (!apiResponse.ok) {
        throw new Error('Failed to fetch firmware metadata');
      }

      const firmwareData = await apiResponse.json();
      const firmwareZipUrl = firmwareData.firmware?.fileUrl;
      if (!firmwareZipUrl) {
        throw new Error('Firmware file URL not found in API response');
      }

      // Fetch the firmware zip
      const zipResponse = await fetch(firmwareZipUrl);
      if (!zipResponse.ok) {
        throw new Error('Failed to fetch firmware zip');
      }

      const zipData = await zipResponse.arrayBuffer();
      firmwareFiles = await this.unzipFirmware(zipData);

      firmwareFiles.forEach(file => {
        console.log(`Fetched file: ${file.path}, Size: ${file.data.length} bytes`);
      });

      // Add the boot_app0.bin from the local server
      const bootAppResponse = await fetch('./public/data/boot_app0.bin', { cache: 'no-store' });
      if (!bootAppResponse.ok) {
        throw new Error('Failed to fetch boot_app0.bin from local server');
      }

      // Create the boot_app0.bin entry
      const bootAppEntry = {
        path: './public/data/boot_app0.bin',
        address: 0xE000,
        data: new Uint8Array(await bootAppResponse.arrayBuffer()),
      };

      // Insert boot_app0.bin as the 3rd item in the list
      firmwareFiles.splice(2, 0, bootAppEntry);
    } catch (error) {
      console.error('Error during firmware fetching:', error.message);
      throw error;
    }

    // Cancel listening for the greeting just in case
    if (!this.vortexPort.portActive) {
      this.vortexPort.cancelListening();
    }

    // Flash the firmware
    await this.flashFirmware(firmwareFiles);
  }

  async unzipFirmware(zipData) {
    const zip = await JSZip.loadAsync(zipData);

    const firmwareFiles = [];
    const fileMappings = {
      'build/VortexEngine.ino.bootloader.bin': 0x0,
      'build/VortexEngine.ino.partitions.bin': 0x8000,
      'build/VortexEngine.ino.bin': 0x10000,
    };

    for (const [fileName, address] of Object.entries(fileMappings)) {
      const file = zip.file(fileName);
      if (!file) {
        throw new Error(`Missing firmware file: ${fileName}`);
      }
      const fileData = await file.async('arraybuffer');
      firmwareFiles.push({ path: fileName, address, data: new Uint8Array(fileData) });
    }

    return firmwareFiles;
  }

  async flashFirmware(files) {
    const blockSize = 0x4000; // Flash memory block size

    for (const file of files) {
      const progressBar = document.getElementById('updateProgress');

      try {
        console.log(`Preparing to flash: ${file.path}, Size: ${file.data.length} bytes`);

        // Create a File object from the Uint8Array
        const blob = new Blob([file.data], { type: 'application/octet-stream' });
        const fileObject = new File([blob], file.path.split('/').pop(), {
          type: 'application/octet-stream',
          lastModified: Date.now(),
        });

        const readUploadedFileAsArrayBuffer = (inputFile) => {
          const reader = new FileReader();
          return new Promise((resolve, reject) => {
            reader.onerror = () => {
              reader.abort();
              reject(new DOMException("Problem parsing input file."));
            };
            reader.onload = () => {
              resolve(reader.result);
            };
            reader.readAsArrayBuffer(inputFile);
          });
        };

        const contents = await readUploadedFileAsArrayBuffer(fileObject);
        console.log(`Flashing: ` + JSON.stringify(fileObject));
        await this.espStub.flashData(
          contents,
          (bytesWritten, totalBytes) => {
            progressBar.style.width =
              Math.floor((bytesWritten / totalBytes) * 100) + "%";
          },
          file.address
        );
        await this.sleep(100);
        console.log(`${file.path} flashed successfully.`);
        document.getElementById('updateProgress').classList.add('hidden');
      } catch (error) {
        console.error(`Error flashing ${file.path}:`, error);
        throw error;
      }
    }

    console.log('All files flashed successfully.');
    try {
      console.log('Resetting ESP32...');
      await this.espStub.hardReset();
      console.log('ESP32 reset complete.');
    } catch (resetError) {
      console.error('Failed to reset ESP32:', resetError);
    }
  }

  displayFirmwareUpdateInfo(device, currentVersion, latestVersion, downloadUrl) {
    const lowerDevice = device.toLowerCase();
    let content = `
      <p id="deviceUpdateLabel"><strong>Device:</strong> ${device}</p>
      <p id="deviceVersionLabel"><strong>Current Version:</strong> ${currentVersion}</p>
      <p id="deviceLatestVersionLabel"><strong>Latest Version:</strong> ${latestVersion}</p>
    `;

    // Show download links for orbit, handles, and gloves
    if (['orbit', 'handles', 'gloves'].includes(lowerDevice)) {
      content += `
        <div class="firmware-buttons">
          <a href="${downloadUrl}" target="_blank" class="btn-download">Download Latest Version</a>
          <a href="https://stoneorbits.github.io/VortexEngine/${lowerDevice}_upgrade_guide.html" target="_blank" class="btn-upgrade-guide">Read the Upgrade Guide</a>
        </div>
      `;
    }

    // Show update button and progress bar for chromadeck and spark
    if (['chromadeck', 'spark'].includes(lowerDevice)) {
      content += `
        <button id="updateFlash" class="update-button">Update Firmware Now</button>
        <div class="progress-container">
          <div id="overallProgress" class="progress-bar">
            <div id="overallProgressBar"></div>
          </div>
        </div>
        <div class="update-progress-container">
          <span id="updateProgress" style="margin-top: 10px;"></span>
        </div>
      `;
    }

    const updatePanelContent = document.getElementById('updateOptions');
    updatePanelContent.innerHTML = `
      <h3 id="updateTitle">Firmware Update Required</h3>
      <fieldset>
        <div class="firmware-notification">
          ${content}
        </div>
      </fieldset>
    `;

    if (lowerDevice === 'chromadeck' || lowerDevice === 'spark') {
      // Attach the flash button event listener
      const flashButton = document.getElementById('updateFlash');
      flashButton.addEventListener('click', async () => {
        const updateProgress = document.getElementById('updateProgress');
        try {
          Notification.success('Starting firmware update...');
          updateProgress.textContent = 'Initializing firmware update...';
          await this.initializeESPFlasher();
          await this.fetchAndFlashFirmware();
          updateProgress.textContent = 'Firmware update completed successfully!';
          Notification.success('Firmware updated successfully.');
        } catch (error) {
          updateProgress.textContent = 'Firmware update failed.';
          Notification.failure('Firmware update failed: ' + error.message);
          console.error(error);
        }
      });
    }

    Notification.success(`Firmware update available for ${device}.`);
    this.show();
  }


  displayUpToDateMessage(device) {
    const updatePanelContent = document.getElementById('updateOptions');
    updatePanelContent.innerHTML = `
      <h3 id="updateTitle">${device} Firmware</h3>
      <p>Your firmware is up-to-date.</p>
    `;

    Notification.success(`${device} firmware is up-to-date.`);
    this.show();
  }
}

