import Panel from './Panel.js';
import Notification from './Notification.js';

export default class UpdatePanel extends Panel {
  constructor(editor) {
    const content = `
      <div id="updateOptions">
        <button id="updateFlash" class="update-button">Flash ESP32 Firmware</button>
        <div class="update-progress-container">
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
    // this.serialPort is a local copy of the vortexport.serialport if it's
    // open yet, but most likely it's not so this will probably just be null.
    // But later we will use it to hold a private copy of the serial port if
    // the 'insert' force update key is pressed for an esp device when there's
    // no active vortexPort.serialPort then it will open this.serialPort as a
    // new port.  Otherwise if there is a vortexport.serialPort then it will be
    // again copied into this.serialPort and used for the ESP update process 
    this.serialPort = this.vortexPort.serialPort;
    // this tracks whether the serialport was forced open with insert or not
    this.forcedUpdate = false;
    // this is used for the updating process
    this.espStub = null;
  }

  initialize() {
    const flashButton = document.getElementById('updateFlash');
    const updateProgress = document.getElementById('updateProgress');

    this.toggleCollapse(false);
    this.hide();
  }

  async onDeviceConnect(deviceName, deviceVersion) {
    console.log("Checking version...");
    // check version which
    this.editor.checkVersion(deviceName, deviceVersion);
  }

  async onDeviceDisconnect(deviceName) {
    this.hide();
  }

  async onDeviceSelected(devicename) {
    // maybe do something here
  }

  async initializeESPFlasher() {
    try {
      // this.serialPort will already be filled if they pressed 'insert' to
      // force an update and there was no vortexPort already active
      if (!this.serialPort) {
        // otherwise if they didn't press 'insert' and this is a normal update
        // notification then there must be a vortexPort.serialPort active and
        // that will be used for the ESP update serial port instead
        if (!this.vortexPort.serialPort) {
          throw new Error('No serial port available.');
        }
        this.serialPort = this.vortexPort.serialPort;
      }
      // run the esptool update and pass this.serialPort as the active port to use
      const esptool = await window.esptoolPackage;
      this.espLoader = new esptool.ESPLoader(this.serialPort, console);
      await this.espLoader.initialize();
      this.espStub = await this.espLoader.runStub();
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
      targetDevice = this.editor.devicePanel.selectedDevice.toLowerCase();
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

    const progressBar = document.getElementById('overallProgressBar');
    const progressMessage = document.getElementById('updateProgress');

    // Set initial progress to 0%
    progressBar.style.width = '0%';
    progressMessage.textContent = 'Erasing flash...';

    // Slowly fill progress bar from 0% to 15% while eraseFlash is in progress
    let currentWidth = 0;
    const targetWidth = 15;
    const incrementSteps = 50; // number of increments
    const intervalDelay = 300; // ms
    const incrementValue = (targetWidth - currentWidth) / incrementSteps;

    const intervalId = setInterval(() => {
      currentWidth += incrementValue;
      if (currentWidth >= targetWidth) {
        currentWidth = targetWidth;
      }
      progressBar.style.width = Math.floor(currentWidth) + '%';
    }, intervalDelay);

    await this.espStub.eraseFlash();

    clearInterval(intervalId);
    progressBar.style.width = targetWidth + '%';

    // Now proceed with flashing firmware
    progressMessage.textContent = 'Flashing firmware...';
    let totalBytes = files.reduce((sum, file) => sum + file.data.length, 0);
    let totalBytesFlashed = 0;

    for (const file of files) {
      try {
        console.log(`Preparing to flash: ${file.path}, Size: ${file.data.length} bytes`);

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

        await this.espStub.flashData(
          contents,
          (bytesWritten, totalThisFile) => {
            totalBytesFlashed += bytesWritten;
            const progress = Math.floor((totalBytesFlashed / totalBytes) * 85) + 15; 
            // 85% range left after 15% used for erase
            progressBar.style.width = progress + '%';
          },
          file.address
        );

        await this.sleep(100);
        console.log(`${file.path} flashed successfully.`);
      } catch (error) {
        console.error(`Error flashing ${file.path}:`, error);
        throw error;
      }
    }

    // Finish progress at 100% when done
    progressBar.style.width = '100%';
    console.log('All files flashed successfully.');

    try {
      console.log('ESP32 reset complete.');
      if (this.espLoader) {
        await this.espLoader._reader.releaseLock();
        console.log('Disconnected ESP Loader.');
      }
      console.log('Resetting ESP32...');
      await this.espStub.hardReset();
      await this.editor.vortexPort.restartConnecton();
    } catch (resetError) {
      console.error('Failed to reset ESP32:', resetError);
    }
  }


  displayFirmwareUpdateInfo(device, currentVersion, latestVersion, downloadUrl) {
    const lowerDevice = device.toLowerCase();
    const deviceIconUrl = `./public/images/${lowerDevice}-logo-square-64.png`;
    let content = `
      <div class="device-update-labels">
        <div>
          <p id="deviceUpdateLabel"><strong>Device:</strong> ${device}</p>
          <p id="deviceVersionLabel"><strong>Current Version:</strong> ${currentVersion}</p>
          <p id="deviceLatestVersionLabel"><strong>Latest Version:</strong> ${latestVersion}</p>
        </div>
        <div>
          <img src="${deviceIconUrl}" alt="${device} Icon" class="device-icon">
        </div>
      </div>
    `;

    if (currentVersion === latestVersion) {
      const updatePanelContent = document.getElementById('updateOptions');
      updatePanelContent.innerHTML = `
        <h3 id="updateTitle">${device} Firmware</h3>
        <fieldset>
          <div class="firmware-notification">
            ${content}
            <p>Your firmware is up-to-date.</p>
          </div>
        </fieldset>
      `;
      Notification.success(`${device} ${currentVersion} is up-to-date.`);
      this.show();
      return;
    }

    // Show download links for orbit, handle, and gloves
    if (['orbit', 'handle', 'gloves', 'duo'].includes(lowerDevice)) {
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
        <div class="update-progress-container">
          <div id="overallProgress" class="update-progress-bar">
            <div id="overallProgressBar"></div>
          </div>
        </div>
        <div class="update-status-container">
          <span id="updateProgress"></span>
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
          // if there is no vortexPort.serialPort that means this update
          // windows was forced open with 'insert' and there is no active
          // device connection yet. So simply request a new device connection
          // that will be used exclusively for the update
          if (!this.vortexPort.serialPort) {
            this.serialPort = await navigator.serial.requestPort();
            if (!this.serialPort) {
              throw new Error('Failed to open serial port');
            }
            await this.serialPort.open({ baudRate: 115200 });
            // is this necessary...? I don't remember why it's here
            await this.serialPort.setSignals({ dataTerminalReady: true });
          }
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
    this.show();
  }
}
