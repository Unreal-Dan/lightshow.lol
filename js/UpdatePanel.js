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
    super('updatePanel', content, 'Updates');
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
    const firmwareZipUrl = 'https://vortex.community/api/getFirmware?device=chromadeck';

    //// Fallback paths if fetch fails (used for local debugging)
    //const fallbackFiles = [
    //  { path: './js/bins/VortexEngine.ino.bootloader.bin', address: 0x0 },
    //  { path: './js/bins/VortexEngine.ino.partitions.bin', address: 0x8000 },
    //  { path: './js/bins/boot_app0.bin', address: 0xE000 },
    //  { path: './js/bins/VortexEngine.ino.bin', address: 0x10000 },
    //];

    let firmwareFiles;
    try {
      // Try to fetch the firmware zip
      const response = await fetch(firmwareZipUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch firmware zip');
      }
      const zipData = await response.arrayBuffer();
      firmwareFiles = await this.unzipFirmware(zipData);
      // Add the boot_app0.bin from the local server
      const bootAppFile = await fetch('./public/data/boot_app0.bin', { cache: 'no-store' });
      firmwareFiles.push({
        path: './public/data/boot_app0.bin',
        address: 0xE000,
        data: new Uint8Array(await bootAppFile.arrayBuffer()),
      });
    } catch (error) {
      throw new Error('Failed to fetch files: ', error.message);
      //// Fallback paths if fetch fails (used for local debugging)
      //console.warn('Falling back to local files due to fetch error:', error.message);
      //firmwareFiles = await Promise.all(
      //  fallbackFiles.map(async (file) => {
      //    const fileData = await fetch(`${file.path}?cacheBust=${Date.now()}`).then((response) => {
      //      if (!response.ok) {
      //        throw new Error(`Failed to fetch ${file.path}`);
      //      }
      //      return response.arrayBuffer();
      //    });
      //    return { ...file, data: new Uint8Array(fileData) };
      //  })
      //);
    }

    // cancel listening for the greeting just in case we are
    if (!this.vortexPort.portActive) {
      this.vortexPort.cancelListening();
    }

    //await this.espStub.setBaudrate(115200);

    // Flash the firmware
    await this.flashFirmware(firmwareFiles);
  }

  async unzipFirmware(zipData) {
    const JSZip = await import('jszip'); // Assuming JSZip is available
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

  async loadLocalFile(filePath) {
    // Fetch the file content
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${filePath}`);
    }

    // Get the ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();

    // Create a Blob from the ArrayBuffer
    const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });

    // Create a File object (mimics a file selected in an input[type="file"])
    const file = new File([blob], "VortexEngine.ino.bootloader.bin", {
      type: "application/octet-stream",
      lastModified: new Date(),
    });

    return file;
  }

  async flashFirmware(files) {
    const blockSize = 0x4000; // Flash memory block size

    for (const file of files) {
      const progressBar = document.getElementById('updateProgress');

      try {
       // // Fetch the binary file
       // const fileData = await fetch(file.path).then((response) => {
       //   if (!response.ok) {
       //     throw new Error(`Failed to fetch ${file.path}`);
       //   }
       //   return response.arrayBuffer();
       // });

       // // Convert to Uint8Array
       // const fileUint8Array = new Uint8Array(fileData);

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

        const localFile = await this.loadLocalFile(file.path);
        let contents = await readUploadedFileAsArrayBuffer(localFile);
        await this.espStub.flashData(
          contents,
          (bytesWritten, totalBytes) => {
            progressBar.style.width =
              Math.floor((bytesWritten / totalBytes) * 100) + "%";
          },
          file.address
        );
        await this.sleep(100);

        //// Align the data to the block size
        //const paddedLength = Math.ceil(fileUint8Array.length / blockSize) * blockSize;
        //const paddedData = new Uint8Array(paddedLength);
        //paddedData.set(fileUint8Array);

        //console.log(`Flashing ${file.path} at address: ${file.address.toString(16)}`);
        //console.log(`Aligned data length: ${paddedData.length}`);

        //document.getElementById('updateProgress').classList.remove('hidden');

        //for (let offset = 0; offset < paddedData.length; offset += blockSize) {
        //  const chunk = paddedData.slice(offset, offset + blockSize);

        //  await this.espStub.flashData(chunk, (bytesWritten, totalBytes) => {
        //    const percent = Math.floor(((offset + bytesWritten) / paddedData.length) * 100);
        //    progressBar.style.width = `${percent}%`;
        //  }, file.address + offset);

        //  console.log(`Chunk flashed: ${offset}-${offset + chunk.length}`);
        //  await this.sleep(100); // Delay between chunks
        //}

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
}

