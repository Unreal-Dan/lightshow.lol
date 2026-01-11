/* UpdatePanel.js */

import Panel from './Panel.js';
import Notification from './Notification.js';
import Modal from './Modal.js';

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
          <span id="updateProgress" style="margin-top: 10px;"></span>
        </div>
      </div>
    `;

    super(editor, 'updatePanel', content, 'Device Updates', { showCloseButton: true });

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
    this.espLoader = null;

    // update confirmation modal
    this.confirmationModal = new Modal('flash-confirmation');
  }

  initialize() {
    this.toggleCollapse(false);
    this.hide();
  }

  async onDeviceConnect(deviceName, deviceVersion) {
    console.log('Checking version...');
    this.editor.checkVersion(deviceName, deviceVersion);
  }

  async onDeviceDisconnect(deviceName) {
    this.hide();
  }

  async onDeviceSelected(devicename) {
    // maybe do something here
  }

  isLocalServer() {
    // Prefer the editor's detection if present.
    if (typeof this.editor?.isLocalServer === 'boolean') return this.editor.isLocalServer;

    // Fallback (same as your VortexEditor logic)
    return !window.location.hostname.startsWith('lightshow.lol');
  }

  publicDataUrl(fileName) {
    // IMPORTANT: resolves relative to this module file (UpdatePanel.js),
    // so ../public/data/ works on local dev + GH pages subpaths.
    return new URL(`../public/data/${fileName}`, import.meta.url).toString();
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async initializeESPFlasher() {
    try {
      // this.serialPort will already be filled if they pressed 'insert' to force an update
      if (!this.serialPort) {
        // otherwise must use vortexPort.serialPort
        if (!this.vortexPort.serialPort) {
          throw new Error('No serial port available.');
        }
        this.serialPort = this.vortexPort.serialPort;
      }

      const esptool = await window.esptoolPackage;
      this.espLoader = new esptool.ESPLoader(this.serialPort, console);
      await this.espLoader.initialize();
      this.espStub = await this.espLoader.runStub();
    } catch (error) {
      throw new Error('Failed to initialize ESP flasher: ' + error.message);
    }
  }

  async fetchArrayBufferOrThrow(url, errMsg) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`${errMsg} (${res.status} ${res.statusText})`);
    }
    return await res.arrayBuffer();
  }

  async tryFetchArrayBuffer(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  }

  async fetchLocalFirmwareZip(targetDevice) {
    // Try common local filenames first. You can drop your zip in ../public/data/
    // without touching any API.
    const candidates = [
      `VortexEngine-chromadeck.zip`,
      // add other file names here if you want to try them
    ];

    let lastTried = [];

    for (const name of candidates) {
      const url = this.publicDataUrl(name);
      lastTried.push(url);
      const buf = await this.tryFetchArrayBuffer(url);
      if (buf) {
        console.log(`Using local firmware zip: ${url}`);
        return { zipData: buf, sourceUrl: url };
      }
    }

    throw new Error(
      `Local firmware zip not found for '${targetDevice}'. Tried:\n` + lastTried.join('\n')
    );
  }

  async fetchRemoteFirmwareZip(targetDevice) {
    const firmwareApiUrl = `https://vortex.community/downloads/json/${targetDevice}`;

    // Fetch firmware metadata
    const apiResponse = await fetch(firmwareApiUrl, { cache: 'no-store' });
    if (!apiResponse.ok) {
      throw new Error('Failed to fetch firmware metadata');
    }

    const firmwareData = await apiResponse.json();
    const firmwareZipUrl = firmwareData.firmware?.fileUrl;
    if (!firmwareZipUrl) {
      throw new Error('Firmware file URL not found in API response');
    }

    // Fetch the firmware zip
    const zipResponse = await fetch(firmwareZipUrl, { cache: 'no-store' });
    if (!zipResponse.ok) {
      throw new Error('Failed to fetch firmware zip');
    }

    const zipData = await zipResponse.arrayBuffer();
    return { zipData, sourceUrl: firmwareZipUrl };
  }

  async fetchAndFlashFirmware() {
    let targetDevice = this.vortexPort?.name?.toLowerCase();
    if (!targetDevice) {
      targetDevice = this.editor?.devicePanel?.selectedDevice?.toLowerCase();
    }

    if (!targetDevice || targetDevice === 'none') {
      throw new Error(`Select a device first`);
    }

    if (targetDevice !== 'chromadeck' && targetDevice !== 'spark') {
      throw new Error(`Cannot flash '${targetDevice}', wrong device!`);
    }

    let firmwareFiles;

    try {
      const local = this.isLocalServer();

      const { zipData, sourceUrl } = local
        ? await this.fetchLocalFirmwareZip(targetDevice)
        : await this.fetchRemoteFirmwareZip(targetDevice);

      console.log(`Firmware zip source: ${sourceUrl}`);

      firmwareFiles = await this.unzipFirmware(zipData);

      firmwareFiles.forEach((file) => {
        console.log(`Fetched file: ${file.path}, Size: ${file.data.length} bytes`);
      });

      // Add boot_app0.bin from ../public/data/ (works both local + hosted)
      const bootAppUrl = this.publicDataUrl('boot_app0.bin');
      const bootAppBuf = await this.fetchArrayBufferOrThrow(
        bootAppUrl,
        'Failed to fetch boot_app0.bin'
      );

      const bootAppEntry = {
        path: bootAppUrl,
        address: 0xE000,
        data: new Uint8Array(bootAppBuf),
      };

      // Insert boot_app0.bin as the 3rd item in the list
      firmwareFiles.splice(2, 0, bootAppEntry);
    } catch (error) {
      console.error('Error during firmware fetching:', error.message);
      throw error;
    }

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
    const progressBar = document.getElementById('overallProgressBar');
    const progressMessage = document.getElementById('updateProgress');

    if (progressBar) progressBar.style.width = '0%';
    if (progressMessage) progressMessage.textContent = 'Erasing flash...';

    // Slowly fill progress bar from 0% to 50% while eraseFlash is in progress
    let currentWidth = 0;
    const targetWidth = 50;
    const incrementSteps = 50;
    const intervalDelay = 300;
    const incrementValue = (targetWidth - currentWidth) / incrementSteps;

    const intervalId = setInterval(() => {
      currentWidth += incrementValue;
      if (currentWidth >= targetWidth) currentWidth = targetWidth;
      if (progressBar) progressBar.style.width = Math.floor(currentWidth) + '%';
    }, intervalDelay);

    await this.espStub.eraseFlash();

    clearInterval(intervalId);
    if (progressBar) progressBar.style.width = targetWidth + '%';

    // Now proceed with flashing firmware
    if (progressMessage) progressMessage.textContent = 'Flashing firmware...';

    const totalBytes = files.reduce((sum, file) => sum + file.data.length, 0);
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
              reject(new DOMException('Problem parsing input file.'));
            };
            reader.onload = () => resolve(reader.result);
            reader.readAsArrayBuffer(inputFile);
          });
        };

        const contents = await readUploadedFileAsArrayBuffer(fileObject);

        await this.espStub.flashData(
          contents,
          (bytesWritten /* this file */, totalThisFile) => {
            const overallWritten = totalBytesFlashed + bytesWritten;
            const progress = Math.floor((overallWritten / totalBytes) * 50) + 50;
            if (progressBar) progressBar.style.width = Math.max(50, Math.min(100, progress)) + '%';

            const msg = `Flashing ${overallWritten} / ${totalBytes} (${Math.max(
              50,
              Math.min(100, progress)
            )}%)...`;

            if (progressMessage) progressMessage.textContent = msg;
            console.log(msg);
          },
          file.address
        );

        totalBytesFlashed += file.data.length;

        await this.sleep(100);
        console.log(`${file.path} flashed successfully.`);
      } catch (error) {
        console.error(`Error flashing ${file.path}:`, error);
        throw error;
      }
    }

    if (progressBar) progressBar.style.width = '100%';
    console.log('All files flashed successfully.');

    try {
      console.log('ESP32 reset complete.');
      if (this.espLoader && this.espLoader._reader) {
        await this.espLoader._reader.releaseLock();
        console.log('Disconnected ESP Loader.');
      }
      console.log('Resetting ESP32...');
      await this.espStub.hardReset();
      // TODO: get this working sometime again
      // await this.editor.vortexPort.restartConnecton();
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

    if (lowerDevice === 'duo') {
      content += `
        <div class="firmware-buttons">
          <a href="https://stoneorbits.github.io/VortexEngine/${lowerDevice}_upgrade_guide.html" target="_blank" class="btn-upgrade-guide">Read the Upgrade Guide</a>
        </div>
      `;
    } else if (['orbit', 'handle', 'gloves'].includes(lowerDevice)) {
      content += `
        <div class="firmware-buttons">
          <a href="${downloadUrl}" target="_blank" class="btn-download">Download Latest Version</a>
          <a href="https://stoneorbits.github.io/VortexEngine/${lowerDevice}_upgrade_guide.html" target="_blank" class="btn-upgrade-guide">Read the Upgrade Guide</a>
        </div>
      `;
    } else if (['chromadeck', 'spark'].includes(lowerDevice)) {
      const local = this.isLocalServer();
      const hint = local
        ? `<div class="text-secondary" style="margin-top: 6px;">Local server detected — flashing from <code>../public/data/</code></div>`
        : '';

      content += `
        <button id="updateFlash" class="update-button">Update Firmware Now</button>
        ${hint}
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
      const flashButton = document.getElementById('updateFlash');

      flashButton.addEventListener('click', () => {
        this.confirmationModal.show({
          title: 'Confirm Firmware Flash',
          blurb: `Are you sure you want to update the ${device} firmware?`,
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
                this.handleFirmwareUpdate();
              },
              customHtml: '<button class="modal-button proceed-button">Yes</button>',
            },
          ],
        });
      });
    }

    this.show();
  }

  async handleFirmwareUpdate() {
    const updateProgress = document.getElementById('updateProgress');
    try {
      Notification.success('Starting firmware update...');
      if (updateProgress) updateProgress.textContent = 'Initializing firmware update...';

      this.editor.lightshow.stop();

      // Check for active device connection or request a new one
      if (!this.vortexPort.serialPort) {
        this.serialPort = await navigator.serial.requestPort();
        if (!this.serialPort) {
          throw new Error('Failed to open serial port');
        }
        await this.serialPort.open({ baudRate: 115200 });
        await this.serialPort.setSignals({ dataTerminalReady: true });
      }

      await this.initializeESPFlasher();
      await this.fetchAndFlashFirmware();

      this.editor.lightshow.start();
      if (updateProgress) updateProgress.textContent = 'Firmware update completed successfully!';
      Notification.success('Firmware updated successfully.');
    } catch (error) {
      if (updateProgress) updateProgress.textContent = 'Firmware update failed.';
      Notification.failure('Firmware update failed: ' + error.message);
      console.error(error);
    }
  }
}

