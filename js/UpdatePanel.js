/* UpdatePanel.js */

import Panel from './Panel.js';
import Notification from './Notification.js';
import Modal from './Modal.js';
import { wikiUrl } from './wiki-url.js';
import { communityUrl } from './community-url.js';

export default class UpdatePanel extends Panel {
  constructor(editor) {
    const content = `
      <div id="updateOptions">
        <button id="updateFlash" class="update-button">Flash ESP31 Firmware</button>

        <div class="update-progress-container">
          <div id="overallProgress" class="progress-bar">
            <div id="overallProgressBar"></div>
          </div>
        </div>

        <div>
          <span id="updateProgress" style="margin-top: 9px;"></span>
        </div>
      </div>
    `;

    super(editor, 'updatePanel', content, 'Device Updates');

    this.editor = editor;
    this.wikiUrl = wikiUrl('/lightshow-lol/control-panels/update-panel');
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
    this.setInactive('Requires a connected device');
  }

  async onDeviceConnect(deviceName, deviceVersion) {
    console.log('Checking version...');
    this.editor.checkVersion(deviceName, deviceVersion);
  }

  async onDeviceDisconnect(deviceName) {
    this.setInactive('Requires a connected device');
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

  // Local dev only: grab the highest-versioned `VortexEngine-{device}-x.y.z.zip`
  // from ../public/data/, or fall back to the unversioned one.
  async fetchLocalFirmwareZip(targetDevice) {
    const names = await this.listLocalDataDir();
    const rx = new RegExp(`^VortexEngine-${targetDevice}-([0-9.]+)\\.zip$`, 'i');
    const candidates = (names || [])
      .filter((n) => rx.test(n))
      .sort((a, b) => {
        const va = rx.exec(a)[1].split('.').map(Number);
        const vb = rx.exec(b)[1].split('.').map(Number);
        for (let i = 0; i < 3; ++i) {
          const d = (vb[i] || 0) - (va[i] || 0);
          if (d) return d;
        }
        return 0;
      })
      .concat([`VortexEngine-${targetDevice}.zip`]);

    for (const name of candidates) {
      const url = this.publicDataUrl(name);
      const buf = await this.tryFetchArrayBuffer(url);
      if (buf) {
        console.log(`Using local firmware zip: ${url}`);
        return { zipData: buf, sourceUrl: url };
      }
    }

    throw new Error(`Local firmware zip not found for '${targetDevice}' in ../public/data/`);
  }

  async listLocalDataDir() {
    try {
      const res = await fetch(this.publicDataUrl(''));
      if (!res.ok) return null;
      const html = await res.text();
      return (html.match(/href="([^"]*\.zip)"/gi) || []).map((l) =>
        decodeURIComponent(l.match(/href="([^"]*)"/i)[1].split('/').pop())
      );
    } catch {
      return null;
    }
  }

  async fetchRemoteFirmwareZip(targetDevice) {
    const firmwareApiUrl = communityUrl(`/community/downloads/json/${targetDevice}`);

    // Fetch firmware metadata
    const apiResponse = await fetch(firmwareApiUrl, { cache: 'no-store' });
    if (!apiResponse.ok) {
      throw new Error('Failed to fetch firmware metadata');
    }

    const firmwareData = await apiResponse.json();
    let firmwareZipUrl = firmwareData.firmware?.fileUrl;
    if (!firmwareZipUrl) {
      throw new Error('Firmware file URL not found in API response');
    }

    // The downloads JSON still points at vortex.community.
    // Rewrite it to the new host.
    const communityOrigin = new URL(communityUrl()).origin;
    firmwareZipUrl = firmwareZipUrl.replace(
      /^https?:\/\/vortex\.community/i,
      communityOrigin + '/community'
    );

    // Fetch the firmware zip
    const zipResponse = await fetch(firmwareZipUrl, { cache: 'no-store' });
    if (!zipResponse.ok) {
      throw new Error('Failed to fetch firmware zip');
    }

    const zipData = await zipResponse.arrayBuffer();
    return { zipData, sourceUrl: firmwareZipUrl };
  }

  async fetchAndFlashFirmware() {
    // Use the device selected in the Device Controls panel; the serial greeting
    // name (vortexPort.name) can be stale when flashing a different device.
    let targetDevice = this.editor?.devicePanel?.selectedDevice?.toLowerCase();
    if (!targetDevice || targetDevice === 'none') {
      targetDevice = this.vortexPort?.name?.toLowerCase();
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
    this.setInactive(null);
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

    const upgradeGuidePaths = {
      gloves: '/vortex-devices/vortex-gloves/upgrade-guide.html',
      orbit: '/vortex-devices/vortex-orbit/upgrade-guide.html',
      handle: '/vortex-devices/omega-handles/upgrade-guide.html',
      duo: '/vortex-devices/duo/programming-guide/chromalink-guide/upgrade-guide.html',
      chromadeck: '/vortex-devices/chromadeck/upgrade-guide.html',
      spark: '/vortex-devices/spark-handle/upgrade-guide.html',
    };

    const guidePath = upgradeGuidePaths[lowerDevice];

    if (lowerDevice === 'duo') {
      content += `
        <div class="firmware-buttons">
          <a href="${wikiUrl(guidePath)}" target="_blank" class="btn-upgrade-guide">Read the Upgrade Guide</a>
        </div>
      `;
    } else if (['orbit', 'handle', 'gloves'].includes(lowerDevice)) {
      content += `
        <div class="firmware-buttons">
          <a href="${downloadUrl}" target="_blank" class="btn-download">Download Latest Version</a>
          <a href="${wikiUrl(guidePath)}" target="_blank" class="btn-upgrade-guide">Read the Upgrade Guide</a>
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
      // flashing wipes flash storage; offer to back the device's modes up and
      // restore them afterwards (default on).
      //
      // The Chromadeck backup switches across every profile, which is only
      // available on firmware 1.5.53+ — only offer it then, and skip it when
      // the version is unknown (eg. the forced update path passes 'N/A').
      //
      // The Spark has no profiles — just the single set of 16 modes — so its
      // backup is offered unconditionally.
      this.backupDevice = lowerDevice;
      const isRealVersion = /^\d+\.\d+(\.\d+)?$/.test(String(currentVersion));
      this.forcedUpdate = !isRealVersion;
      const supportsProfiles = lowerDevice === 'chromadeck'
        && isRealVersion
        && this.editor.isVersionGreaterOrEqual(currentVersion, '1.5.53');
      const canOfferBackup = lowerDevice === 'spark' || supportsProfiles;

      const backupHtml = canOfferBackup
        ? `<label for="backupModesCheckbox" style="display:flex;gap:.5em;align-items:center;margin-top:.9em;cursor:pointer;">
             <input type="checkbox" id="backupModesCheckbox"${isRealVersion ? ' checked' : ''}>
             <span>Back up modes first and restore them after the update</span>
           </label>`
        : '';

      const flashButton = document.getElementById('updateFlash');

      flashButton.addEventListener('click', () => {
        this.confirmationModal.show({
          title: 'Confirm Firmware Flash',
          blurb: `<p style="margin:0;">Are you sure you want to update the ${device} firmware?</p>${backupHtml}`,
          buttons: [
            {
              label: '',
              onClick: () => this.confirmationModal.hide(),
              customHtml: '<button class="modal-button cancel-button">No</button>',
            },
            {
              label: '',
              onClick: () => {
                const checkbox = document.getElementById('backupModesCheckbox');
                const backupModes = checkbox ? checkbox.checked : false;
                this.confirmationModal.hide();
                this.handleFirmwareUpdate(backupModes);
              },
              customHtml: '<button class="modal-button proceed-button">Yes</button>',
            },
          ],
        });
      });
    }

    this.show();
  }

  getNumProfiles() {
    const chromadeck = this.editor.devices?.['Chromadeck'];
    return chromadeck?.ledCount ? Math.floor(chromadeck.ledCount / 2) : 10;
  }

  canBackupModes() {
    const vp = this.vortexPort;
    if (!vp || !vp.isActive()) return false;
    // the Spark doesn't need profile switching — just the single live mode set
    if (this.backupDevice === 'spark') return true;
    return vp.useNewProfileSwitch;
  }

  // make sure the editor has a live, active connection to the current (pre-flash)
  // firmware so we can pull modes from it
  async ensureUpdateConnection() {
    const vp = this.vortexPort;
    if (vp.isActive()) return true;
    if (!vp.serialPort) {
      if (!this.serialPort) {
        this.serialPort = await navigator.serial.requestPort();
        if (!this.serialPort) return false;
        await this.serialPort.open({ baudRate: 115200 });
        await this.serialPort.setSignals({ dataTerminalReady: true });
      }
      vp.serialPort = this.serialPort;
    }
    vp.cancelListeningForGreeting = false;
    vp.portActive = false;
    try {
      await vp.listenForGreeting();
    } catch (e) {
      console.warn('ensureUpdateConnection: no greeting', e);
      return false;
    }
    return vp.portActive;
  }

  // switch to each Chromadeck profile and silently pull+cache its modes
  async backupAllProfiles() {
    const vp = this.vortexPort;
    const vl = this.editor.vortexLib;
    console.log('[UpdatePanel] backup diag:', {
      isActive: vp?.isActive(),
      device: this.backupDevice,
      useNewProfileSwitch: vp?.useNewProfileSwitch,
      serialPort: !!vp?.serialPort,
      numProfiles: this.getNumProfiles(),
    });
    if (!vp || !vp.isActive()) {
      console.warn('[UpdatePanel] cannot back up modes');
      return null;
    }
    // the Spark has no profiles — just backup its single set of modes
    if (this.backupDevice === 'spark') {
      try {
        const modes = await vp.pullProfileModesRaw(vl);
        console.log('[UpdatePanel] backed up spark modes:', modes ? modes.length : 'n/a');
        return modes && modes.length ? [{ profile: 0, modes }] : null;
      } catch (e) {
        console.error('[UpdatePanel] failed to back up spark modes', e);
        return null;
      }
    }
    if (!vp.useNewProfileSwitch) {
      console.warn('[UpdatePanel] cannot switch profiles for backup');
      return null;
    }
    const backup = [];
    for (let p = 0; p < this.getNumProfiles(); ++p) {
      try {
        const switched = await vp.switchProfile(vl, p);
        if (!switched) {
          console.warn('[UpdatePanel] switchProfile', p, 'returned false');
          continue;
        }
        const modes = await vp.pullProfileModesRaw(vl);
        console.log('[UpdatePanel] backed up profile', p, 'modes:', modes ? modes.length : 'n/a');
        backup.push({ profile: p, modes });
      } catch (e) {
        console.error('[UpdatePanel] failed to back up profile', p, e);
      }
    }
    // leave the deck on a stable profile
    try { await vp.switchProfile(vl, 0); } catch (e) {}
    return backup;
  }

  // after flashing + reconnecting, switch to each profile and push the cached modes back
  async restoreAllProfiles(backup) {
    if (!backup || !this.canBackupModes()) return;
    const vp = this.vortexPort;
    const vl = this.editor.vortexLib;
    // the Spark has no profiles — just push its modes back
    if (this.backupDevice === 'spark') {
      for (const item of backup) {
        try {
          await vp.pushProfileModesRaw(vl, item.modes);
        } catch (e) {
          console.warn('Failed to restore spark modes', e);
        }
      }
      return;
    }
    for (const item of backup) {
      try {
        await vp.switchProfile(vl, item.profile);
        await vp.pushProfileModesRaw(vl, item.modes);
      } catch (e) {
        console.warn('Failed to restore profile', item.profile, e);
      }
    }
    // switch back to the default profile
    try { await vp.switchProfile(vl, 0); } catch (e) {}
  }

  // re-establish the editor connection to the freshly-booted firmware so we pick
  // up the new greeting it sends after a flash/reset
  async reconnectAfterFlash() {
    const vp = this.vortexPort;
    if (!vp) return false;
    // make sure the editor connection is attached to the flashed port
    if (!vp.serialPort && this.serialPort) {
      vp.serialPort = this.serialPort;
    }
    vp.cancelListeningForGreeting = false;
    vp.portActive = false;
    // give the freshly-reset ESP32 a moment to boot its app and reattach USB
    await this.sleep(2000);
    try {
      await vp.listenForGreeting();
    } catch (e) {
      console.warn('Reconnect after flash failed:', e);
      return false;
    }
    return vp.portActive;
  }

  // A forced update (Insert key) opens its own private serial port. Once the
  // flash is done the device resets and re-enumerates USB, leaving that port
  // handle stale — it must be closed and dropped, otherwise the next flash
  // reuses the dead handle and fails with 'Failed to set control signals'.
  async disconnectForcedPort() {
    const vp = this.vortexPort;
    const port = this.serialPort;
    // if the editor connection is riding on this port, tear it down first so
    // its read loop releases the port
    if (vp && vp.serialPort === port) {
      try { await vp.disconnect(); } catch (e) {}
    }
    // release any reader lock the ESP flasher still holds
    try { this.espLoader?._reader?.releaseLock(); } catch (e) {}
    // close the port so the next flash can request a fresh one
    try {
      if (port) {
        await port.close();
        console.log('[UpdatePanel] Disconnected forced-update serial port.');
      }
    } catch (e) {
      console.warn('[UpdatePanel] Failed to close serial port:', e);
    }
    this.espLoader = null;
    this.espStub = null;
    this.serialPort = null;
  }

  async handleFirmwareUpdate(backupModes = false) {
    const updateProgress = document.getElementById('updateProgress');
    let backup = null;
    let flashed = false;
    try {
      Notification.success('Starting firmware update...');
      if (updateProgress) updateProgress.textContent = 'Initializing firmware update...';
      console.log('[UpdatePanel] handleFirmwareUpdate, backupModes =', backupModes);

      if (backupModes) {
        // ensure a live connection to the current firmware first (needed for backup)
        if (!(await this.ensureUpdateConnection())) {
          throw new Error('Could not establish a connection with the device');
        }

        // cache the current modes across all profiles BEFORE anything is erased.
        // if the backup fails we abort before flashing so the modes are never lost.
        if (updateProgress) updateProgress.textContent = 'Backing up modes...';
        Notification.success('Backing up modes...');
        backup = await this.backupAllProfiles();
        if (!backup || backup.length === 0) {
          throw new Error('Backup failed — not flashing so your modes are safe');
        }
        const backedUpModes = backup.reduce((n, i) => n + i.modes.length, 0);
        const backupScope = this.backupDevice === 'spark'
          ? 'your current 16 modes'
          : `across ${backup.length} profiles`;
        Notification.success(`Backed up ${backedUpModes} modes ${backupScope}.`);
      } else {
        // no backup — just make sure we have a serial port for the ESP flasher
        // without wasting time on a greeting handshake
        if (!this.serialPort) {
          if (!this.vortexPort.serialPort) {
            this.serialPort = await navigator.serial.requestPort();
            if (!this.serialPort) throw new Error('No serial port selected');
            await this.serialPort.open({ baudRate: 115200 });
            await this.serialPort.setSignals({ dataTerminalReady: true });
          } else {
            this.serialPort = this.vortexPort.serialPort;
          }
        }
      }

      this.editor.lightshow.stop();
      flashed = true;

      await this.initializeESPFlasher();
      await this.fetchAndFlashFirmware();

      // reconnect to the freshly-booted firmware so we see its new greeting
      // skip for forced updates (Insert key) — the device was never connected
      if (!this.forcedUpdate) {
        if (updateProgress) updateProgress.textContent = 'Reconnecting...';
        await this.reconnectAfterFlash();
      }

      // push the cached modes back to each profile
      if (backup) {
        if (updateProgress) updateProgress.textContent = 'Restoring modes...';
        Notification.success('Restoring modes...');
        await this.restoreAllProfiles(backup);
        Notification.success('Modes restored.');
      }

      this.editor.lightshow.start();
      if (updateProgress) updateProgress.textContent = 'Firmware updated successfully!';
      Notification.success('Firmware updated successfully.');
    } catch (error) {
      // never leave the show stuck if we aborted before actually flashing
      if (!flashed) this.editor.lightshow.start();
      if (updateProgress) updateProgress.textContent = 'Firmware update failed.';
      Notification.failure('Firmware update failed: ' + error.message);
      console.error(error);
    } finally {
      // a forced update (Insert key) opened its own private serial port;
      // disconnect it once done so the next flash starts with a fresh port
      if (this.forcedUpdate) {
        await this.disconnectForcedPort();
      }
    }
  }
}

