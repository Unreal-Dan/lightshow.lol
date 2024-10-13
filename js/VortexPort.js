export default class VortexPort {
  // Constants
  EDITOR_VERB_HELLO                 = 'a';
  EDITOR_VERB_READY                 = 'b';
  EDITOR_VERB_PULL_MODES            = 'c';
  EDITOR_VERB_PULL_MODES_DONE       = 'd';
  EDITOR_VERB_PULL_MODES_ACK        = 'e';
  EDITOR_VERB_PUSH_MODES            = 'f';
  EDITOR_VERB_PUSH_MODES_ACK        = 'g';
  EDITOR_VERB_DEMO_MODE             = 'h';
  EDITOR_VERB_DEMO_MODE_ACK         = 'i';
  EDITOR_VERB_CLEAR_DEMO            = 'j';
  EDITOR_VERB_CLEAR_DEMO_ACK        = 'k';
  EDITOR_VERB_GOODBYE               = 'l';
  EDITOR_VERB_TRANSMIT_VL           = 'm';
  EDITOR_VERB_TRANSMIT_VL_ACK       = 'n';
  EDITOR_VERB_LISTEN_VL             = 'o';
  EDITOR_VERB_LISTEN_VL_ACK         = 'p';
  EDITOR_VERB_PULL_CHROMA_HDR       = 'q';
  EDITOR_VERB_PULL_CHROMA_HDR_ACK   = 'r';
  EDITOR_VERB_PUSH_CHROMA_HDR       = 's';
  EDITOR_VERB_PUSH_CHROMA_HDR_ACK   = 't';
  EDITOR_VERB_PULL_CHROMA_MODE      = 'u';
  EDITOR_VERB_PULL_CHROMA_MODE_ACK  = 'v';
  EDITOR_VERB_PUSH_CHROMA_MODE      = 'w';
  EDITOR_VERB_PUSH_CHROMA_MODE_ACK  = 'x';
  EDITOR_VERB_PULL_SINGLE_MODE      = 'y';
  EDITOR_VERB_PULL_SINGLE_MODE_ACK  = 'z';
  EDITOR_VERB_PUSH_SINGLE_MODE      = 'A';
  EDITOR_VERB_PUSH_SINGLE_MODE_ACK  = 'B';
  EDITOR_VERB_PULL_EACH_MODE        = 'C';
  EDITOR_VERB_PULL_EACH_MODE_ACK    = 'D';
  EDITOR_VERB_PULL_EACH_MODE_DONE   = 'E';
  EDITOR_VERB_PUSH_EACH_MODE        = 'F';
  EDITOR_VERB_PUSH_EACH_MODE_ACK    = 'G';
  EDITOR_VERB_PUSH_EACH_MODE_DONE   = 'H';
  EDITOR_VERB_FLASH_FIRMWARE        = "I";
  EDITOR_VERB_FLASH_FIRMWARE_ACK    = "J";
  EDITOR_VERB_FLASH_FIRMWARE_DONE   = "K";

  accumulatedData = ""; // A buffer to store partial lines.
  reader = null;
  isTransmitting = false; // Flag to track if a transmission is active

  constructor() {
    this.debugSending = false;
    this.resetState();
  }

  resetState() {
    // Reset properties to default state
    this.serialPort = null;
    this.portActive = false;
    this.name = '';
    this.version = 0;
    this.buildDate = '';
    if (this.reader) {
      this.reader.releaseLock();
      this.reader = null;
    }
    this.isTransmitting = false; // Reset the transmission state on reset
    // Further state reset logic if necessary
  }

  isActive = () => {
    return this.portActive;
  }

  async requestDevice(callback) {
    try {
      if (!this.serialPort) {
        this.serialPort = await navigator.serial.requestPort();
      }
      if (!this.serialPort.readable || !this.serialPort.writable) {
        await this.serialPort.open({ baudRate: 9600 });
      }
      await this.serialPort.setSignals({ dataTerminalReady: true });
      this.portActive = false;
      if (callback && typeof callback === 'function') {
        callback('waiting');
      }
      this.listenForGreeting(callback);
    } catch (error) {
      console.error('Error:', error);
    }
  }

  async writeData(data) {
    if (!this.serialPort || !this.serialPort.writable) {
      console.error('Port is not writable.');
      return;
    }

    const writer = this.serialPort.writable.getWriter();
    const encoded = new TextEncoder().encode(data);

    try {
      await writer.write(encoded);
    } catch (error) {
      console.error('Error writing data:', error);
    } finally {
      writer.releaseLock();
    }
  }

  // helper for 1.3.0 compatibility version check
  isVersionGreaterOrEqual(currentVersion, targetVersion = '1.3.0') {
    const currentParts = currentVersion.split('.').map(Number);
    const targetParts = targetVersion.split('.').map(Number);

    for (let i = 0; i < targetParts.length; i++) {
      if (currentParts[i] > targetParts[i]) return true;
      if (currentParts[i] < targetParts[i]) return false;
    }
    return true;
  }

  listenForGreeting = async (callback) => {
    while (!this.portActive) {
      if (this.serialPort) {
        try {
          // Read data from the serial port
          const response = await this.readData();

          let responseRegex = /^== Vortex Engine v(\d+\.\d+.\d+) '(\w+)' \(built (.*)\) ==$/;
          let match = response.match(responseRegex);
          if (!match) {
            // TODO: removeme later! backwards compatibility for old connection string
            responseRegex = /^== Vortex Engine v(\d+\.\d+) '(\w+)' \( built (.*)\) ==$/;
            match = response.match(responseRegex);
          }

          if (match) {
            this.version = match[1]; // Capturing the version number
            this.name = match[2];    // Capturing the name
            this.buildDate = match[3]; // Capturing the build date

            console.log('Successfully Received greeting from Vortex Device');
            console.log('Device Type:', this.name);
            console.log('Version:', this.version);
            console.log('Date:', this.buildDate);

            // 1.3.0 compatibility layer
            this.useNewPushPull = this.isVersionGreaterOrEqual(this.version, '1.3.0');
            if (this.useNewPushPull) {
              console.log('Detected 1.3.0+');
            }

            this.portActive = true;
            this.serialPort.addEventListener("disconnect", (event) => {
              this.resetState(); // Reset the state of the class
              if (callback && typeof callback === 'function') {
                callback('disconnect');
              }
            });
            if (callback && typeof callback === 'function') {
              callback('connect');
            }
          }
        } catch (err) {
          console.error('Error reading data:', err);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  startReading() {
    // todo: implement async read waiting for quit that can be canceled
  }

  cancelReading() {
    // todo: implement async read cancel
  }

  async readData() {
    if (!this.serialPort || !this.serialPort.readable) {
      return null;
    }
    if (this.reader) {
      try {
        this.reader.releaseLock();
      } catch (error) {
        console.warn('Failed to release reader lock:', error);
      }
    }
    this.reader = this.serialPort.readable.getReader();
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) {
          // Ensure the reader is not released multiple times
          if (this.reader) {
            this.reader.releaseLock();
            this.reader = null;
          }
          break;
        }

        const text = new TextDecoder().decode(value);
        this.accumulatedData += text;

        // If it starts with '=' or '==', look for the end delimiter '=='
        if (this.accumulatedData.startsWith('=') || this.accumulatedData.startsWith('==')) {
          const endIndex = this.accumulatedData.indexOf('==', 2); // Search for '==' after the first one.

          if (endIndex >= 0) {
            const fullMessage = this.accumulatedData.substring(0, endIndex + 2).trim();
            this.accumulatedData = this.accumulatedData.substring(endIndex + 2); // Trim accumulatedData
            return fullMessage; // Return the full message
          }
        } else {
          // Return any single byte
          const singleByte = this.accumulatedData[0];
          this.accumulatedData = this.accumulatedData.substring(1);
          return singleByte;
        }
      }
    } catch (error) {
      console.error('Error reading data:', error);
      return null;
    } finally {
      if (this.reader) {
        try {
          this.reader.releaseLock(); // Ensure release of reader in the finally block
        } catch (error) {
          console.warn('Failed to release reader lock in finally:', error);
        }
        this.reader = null;
      }
    }
  }

  constructCustomBuffer(vortexLib, curMode) {
    // Create the custom array with size and rawData
    const size = curMode.rawSize();
    const sizeArray = new Uint32Array([size]); // No byte swapping
    const rawDataArray = vortexLib.getRawDataArray(curMode);

    // Combine sizeArray and rawDataArray into a single array
    const combinedArray = new Uint8Array(sizeArray.length * 4 + rawDataArray.length);
    combinedArray.set(new Uint8Array(sizeArray.buffer), 0); // Copy sizeArray bytes
    combinedArray.set(rawDataArray, sizeArray.length * 4); // Copy rawDataArray bytes

    return combinedArray;
  }

  async transmitVL(vortexLib, vortex) {
    if (!this.isActive() || this.isTransmitting) {
      return;
    }
    if (!vortex.engine().modes().curMode()) {
      return;
    }
    this.isTransmitting = true; // Set the transmitting flag

    try {
      // Unserialize the stream of data
      const curMode = new vortexLib.ByteStream();
      if (!vortex.getCurMode(curMode)) {
        console.log("Failed to get cur mode");
        // Error handling - abort or handle as needed
        return;
      }
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_TRANSMIT_VL);
      await this.expectData(this.EDITOR_VERB_TRANSMIT_VL_ACK);
      this.startReading();
    } catch (error) {
      console.error('Error during transmitVL:', error);
    } finally {
      this.isTransmitting = false; // Reset the transmitting flag
    }
  }

  async demoColor(vortexLib, vortex, color) {
    if (!this.isActive() || this.isTransmitting) {
      return;
    }
    this.isTransmitting = true; // Set the transmitting flag

    try {
      // Unserialize the stream of data
      const curMode = new vortexLib.ByteStream();
      let args = new vortexLib.PatternArgs();
      args.addArgs(1);
      let set = new vortexLib.Colorset();
      set.addColor(color);
      let patID = vortexLib.intToPatternID(0);
      let mode = new vortexLib.createMode(vortex, patID, args, set);
      mode.init();
      mode.saveToBuffer(curMode, vortex.engine().leds().ledCount());
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_DEMO_MODE);
      await this.expectData(this.EDITOR_VERB_READY);
      await this.sendRaw(this.constructCustomBuffer(vortexLib, curMode));
      await this.expectData(this.EDITOR_VERB_DEMO_MODE_ACK);
      this.startReading();
    } catch (error) {
      console.error('Error during demoColor:', error);
    } finally {
      this.isTransmitting = false; // Reset the transmitting flag
    }
  }

  async demoCurMode(vortexLib, vortex) {
    if (!this.isActive() || this.isTransmitting) {
      return;
    }
    if (!vortex.engine().modes().curMode()) {
      return;
    }
    this.isTransmitting = true; // Set the transmitting flag

    try {
      // Unserialize the stream of data
      const curMode = new vortexLib.ByteStream();
      if (!vortex.getCurMode(curMode)) {
        console.log("Failed to get cur mode");
        // Error handling - abort or handle as needed
        return;
      }
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_DEMO_MODE);
      await this.expectData(this.EDITOR_VERB_READY);
      await this.sendRaw(this.constructCustomBuffer(vortexLib, curMode));
      await this.expectData(this.EDITOR_VERB_DEMO_MODE_ACK);
      this.startReading();
    } catch (error) {
      console.error('Error during demoCurMode:', error);
    } finally {
      this.isTransmitting = false; // Reset the transmitting flag
    }
  }

  async pushEachToDevice(vortexLib, vortex) {
    if (!this.isActive() || this.isTransmitting) {
      return;
    }
    this.isTransmitting = true; // Set the transmitting flag
    try {
      // Unserialize the stream of data
      const modes = new vortexLib.ByteStream();
      if (!vortex.getModes(modes)) {
        console.log("Failed to get cur mode");
        // Error handling - abort or handle as needed
        return;
      }
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PUSH_EACH_MODE);
      await this.expectData(this.EDITOR_VERB_PUSH_EACH_MODE_ACK);
      const numModes = vortex.numModes();
      const numModesBuf = new vortexLib.ByteStream();
      numModesBuf.serialize8(numModes);
      await this.sendRaw(this.constructCustomBuffer(vortexLib, numModesBuf));
      await this.expectData(this.EDITOR_VERB_PUSH_EACH_MODE_ACK);
      vortex.setCurMode(0, false);
      for (let i = 0; i < numModes; ++i) {
        const modeBuf = new vortexLib.ByteStream();
        vortex.getCurMode(modeBuf);
        await this.sendRaw(this.constructCustomBuffer(vortexLib, modeBuf));
        await this.expectData(this.EDITOR_VERB_PUSH_EACH_MODE_ACK);
        vortex.nextMode(false);
      }
      // these aren't really working... oh well it works good without them
      //await this.sendCommand(this.EDITOR_VERB_PUSH_EACH_MODE_DONE);
      //await this.expectData(this.EDITOR_VERB_PUSH_EACH_MODE_DONE);
      this.startReading();
    } catch (error) {
      console.error('Error during pushToDevice:', error);
    } finally {
      this.isTransmitting = false; // Reset the transmitting flag
    }
  }

  async pushToDevice(vortexLib, vortex) {
    if (!this.isActive() || this.isTransmitting) {
      return;
    }
    // 1.3.0+ use new push pull logic
    if (this.useNewPushPull) {
      return await this.pushEachToDevice(vortexLib, vortex);
    }
    this.isTransmitting = true; // Set the transmitting flag
    try {
      // Unserialize the stream of data
      const modes = new vortexLib.ByteStream();
      if (!vortex.getModes(modes)) {
        console.log("Failed to get cur mode");
        // Error handling - abort or handle as needed
        return;
      }
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PUSH_MODES);
      await this.expectData(this.EDITOR_VERB_READY);
      await this.sendRaw(this.constructCustomBuffer(vortexLib, modes));
      await this.expectData(this.EDITOR_VERB_PUSH_MODES_ACK);
      this.startReading();
    } catch (error) {
      console.error('Error during pushToDevice:', error);
    } finally {
      this.isTransmitting = false; // Reset the transmitting flag
    }
  }

  async pullEachFromDevice(vortexLib, vortex) {
    if (!this.isActive() || this.isTransmitting) {
      return;
    }
    this.isTransmitting = true; // Set the transmitting flag

    try {
      // Unserialize the stream of data
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PULL_EACH_MODE);
      const numModesBuf = await this.readByteStream(vortexLib);
      let numModesStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromData(numModesBuf, numModesStream);
      // this is quite dumb, idk I guess header is 12 bytes so 13th byte is the one data byte
      let numModes = numModesBuf['12'];
      await this.sendCommand(this.EDITOR_VERB_PULL_EACH_MODE_ACK);
      vortex.clearModes();
      for (let i = 0; i < numModes; ++i) {
        const modeBuf = await this.readByteStream(vortexLib);
        // Call the Wasm function
        let modeStream = new vortexLib.ByteStream();
        vortexLib.createByteStreamFromData(modeBuf, modeStream);
        vortex.addNewMode(modeStream, true);
        await this.sendCommand(this.EDITOR_VERB_PULL_EACH_MODE_ACK);
      }
      await this.expectData(this.EDITOR_VERB_PULL_EACH_MODE_DONE);
      this.startReading();
    } catch (error) {
      console.error('Error during pullFromDevice:', error);
    } finally {
      this.isTransmitting = false; // Reset the transmitting flag
    }
  }

  async pullFromDevice(vortexLib, vortex) {
    if (!this.isActive() || this.isTransmitting) {
      return;
    }
    // 1.3.0+ use new push pull logic
    if (this.useNewPushPull) {
      return await this.pullEachFromDevice(vortexLib, vortex);
    }
    this.isTransmitting = true; // Set the transmitting flag
    try {
      // Unserialize the stream of data
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PULL_MODES);
      const modes = await this.readByteStream(vortexLib);
      // Call the Wasm function
      let modesStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromData(modes, modesStream);
      vortex.matchLedCount(modesStream, false);
      vortex.setModes(modesStream, true);
      await this.sendCommand(this.EDITOR_VERB_PULL_MODES_DONE);
      await this.expectData(this.EDITOR_VERB_PULL_MODES_ACK);
      this.startReading();
    } catch (error) {
      console.error('Error during pullFromDevice:', error);
    } finally {
      this.isTransmitting = false; // Reset the transmitting flag
    }
  }

  // Function to connect the Duo via Chromalink
  async connectChromalink() {
    if (!this.isActive()) {
      console.error('Port not active. Cannot connect to Duo.');
      return;
    }
    try {
      // Start the connection process
      await this.sendCommand(this.EDITOR_VERB_PULL_CHROMA_HDR);
      // Wait for the header acknowledgment
      await this.expectData(this.EDITOR_VERB_PULL_CHROMA_HDR_ACK);
      console.log('Duo connected via Chromalink.');
    } catch (error) {
      console.error('Error connecting to Duo via Chromalink:', error);
    }
  }

  // Function to pull all modes from the Duo via Chromalink
  async pullDuoModes(vortexLib, vortex) {
    if (!this.isActive()) {
      console.error('Port not active. Cannot pull modes.');
      return;
    }
    try {
      // Send command to pull modes from the Duo
      await this.sendCommand(this.EDITOR_VERB_PULL_CHROMA_MODE);
      vortex.clearModes();  // Clear existing modes

      const numModes = await this.readByteStream(vortexLib);  // Read the number of modes
      vortex.setCurMode(0);  // Start with the first mode

      for (let i = 0; i < numModes; ++i) {
        const modeBuffer = await this.readByteStream(vortexLib);
        vortex.addNewMode(modeBuffer, true);  // Add each mode
        await this.sendCommand(this.EDITOR_VERB_PULL_CHROMA_MODE_ACK);
      }
      console.log(`Pulled ${numModes} modes from Duo via Chromalink.`);
    } catch (error) {
      console.error('Error pulling modes from Duo via Chromalink:', error);
    }
  }

  // Function to push all modes to the Duo via Chromalink
  async pushDuoModes(vortexLib, vortex) {
    if (!this.isActive()) {
      console.error('Port not active. Cannot push modes.');
      return;
    }
    try {
      // Send the push command
      await this.sendCommand(this.EDITOR_VERB_PUSH_CHROMA_MODE);
      vortex.setCurMode(0);  // Start with the first mode

      const numModes = vortex.numModes();
      for (let i = 0; i < numModes; ++i) {
        const modeBuffer = vortex.getCurModeBuffer();
        await this.sendRaw(this.constructCustomBuffer(vortexLib, modeBuffer));  // Send mode buffer
        await this.expectData(this.EDITOR_VERB_PUSH_CHROMA_MODE_ACK);
        vortex.nextMode();
      }
      console.log(`Pushed ${numModes} modes to Duo via Chromalink.`);
    } catch (error) {
      console.error('Error pushing modes to Duo via Chromalink:', error);
    }
  }

  // Function to flash firmware to the Duo via Chromalink
  async flashFirmware(firmwareData) {
    if (!this.isActive()) {
      console.error('Port not active. Cannot flash firmware.');
      return;
    }
    try {
      // Start firmware flashing
      await this.sendCommand(this.EDITOR_VERB_FLASH_FIRMWARE);
      await this.expectData(this.EDITOR_VERB_READY);

      const chunkSize = 128;  // Firmware chunk size
      let offset = 0;
      while (offset < firmwareData.length) {
        const chunk = firmwareData.slice(offset, offset + chunkSize);
        await this.sendRaw(chunk);  // Send firmware chunk
        await this.expectData(this.EDITOR_VERB_FLASH_FIRMWARE_ACK);
        offset += chunkSize;
      }
      console.log('Firmware flashed successfully.');
    } catch (error) {
      console.error('Error flashing firmware to Duo via Chromalink:', error);
    }
  }

  // Function to pull a single mode from the Duo via Chromalink
  async pullSingleMode(vortexLib, vortex) {
    if (!this.isActive()) {
      console.error('Port not active. Cannot pull single mode.');
      return;
    }
    try {
      // Send command to pull the current mode
      await this.sendCommand(this.EDITOR_VERB_PULL_SINGLE_MODE);
      const modeBuffer = await this.readByteStream(vortexLib);  // Read mode data
      vortex.addNewMode(modeBuffer, true);
      await this.sendCommand(this.EDITOR_VERB_PULL_SINGLE_MODE_ACK);
      console.log('Pulled single mode from Duo via Chromalink.');
    } catch (error) {
      console.error('Error pulling single mode from Duo via Chromalink:', error);
    }
  }

  // Function to push a single mode to the Duo via Chromalink
  async pushSingleMode(vortexLib, vortex) {
    if (!this.isActive()) {
      console.error('Port not active. Cannot push single mode.');
      return;
    }
    try {
      const modeBuffer = vortex.getCurModeBuffer();  // Get the current mode data
      await this.sendCommand(this.EDITOR_VERB_PUSH_SINGLE_MODE);
      await this.sendRaw(this.constructCustomBuffer(vortexLib, modeBuffer));  // Send mode buffer
      await this.expectData(this.EDITOR_VERB_PUSH_SINGLE_MODE_ACK);
      console.log('Pushed single mode to Duo via Chromalink.');
    } catch (error) {
      console.error('Error pushing single mode to Duo via Chromalink:', error);
    }
  }

  async readFromSerialPort() {
    if (!this.serialPort || !this.serialPort.readable) {
      throw new Error('Serial port is not readable');
    }

    if (this.reader) {
      this.reader.releaseLock();
    }
    this.reader = this.serialPort.readable.getReader();
    try {
      const result = await this.reader.read();
      return result;
    } finally {
      this.reader.releaseLock();
      this.reader = null;
    }
  }

  async readByteStream(vortexLib) {
    if (!this.isActive()) {
      console.error('Port is not active. Cannot read modes.');
      return null;
    }

    try {
      // Function to append new data to existing data
      const appendData = (existing, newData) => {
        const combined = new Uint8Array(existing.length + newData.length);
        combined.set(existing);
        combined.set(newData, existing.length);
        return combined;
      };

      // Read the initial 4 bytes for size
      let sizeData = new Uint8Array(0);
      while (sizeData.length < 4) {
        const data = await this.readFromSerialPort();
        sizeData = appendData(sizeData, data.value);
      }

      // Interpret the first 4 bytes as size
      const size = new DataView(sizeData.buffer).getUint32(0, true);

      // Read the remaining data
      let accumulatedData = sizeData.slice(4);
      while (accumulatedData.length < size) {
        const data = await this.readFromSerialPort();
        accumulatedData = appendData(accumulatedData, data.value);
      }

      // Validate the size of the accumulated data
      if (accumulatedData.length === size) {
        return new Uint8Array(accumulatedData);
      } else {
        console.error("Data size mismatch.");
        return null;
      }
    } catch (error) {
      console.error('Error reading modes:', error);
      return null;
    }
  }

  // wait for a specific response
  async expectData(expectedResponse, timeoutMs = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const response = await this.readData();
      if (response === expectedResponse) {
        return; // Expected response received
      }
      if (!response) {
        return;
      }
      //console.log('Received:', response, ' (expected: ', expectedResponse, ')');
    }
    throw new Error('Timeout: Expected response not received');
  }

  // finish up and close
  async closePort() {
    if (this.serialPort) {
      await this.serialPort.close();
      this.serialPort = null;
      console.log('Port closed.');
    }
  }

  // send raw data to the device
  async sendRaw(data) {
    if (!this.serialPort || !this.serialPort.writable) {
      console.error('Port is not writable.');
      return;
    }

    const writer = this.serialPort.writable.getWriter();
    try {
      await writer.write(data);
    } catch (error) {
      console.error('Error writing data:', error);
    } finally {
      writer.releaseLock();
    }
  }

  // send a command to the device
  async sendCommand(verb) {
    if (!this.isActive()) {
      console.error('Port not active or another transmission is ongoing. Cannot send command.');
      return;
    }

    const encodedVerb = new TextEncoder().encode(verb); // Ensure encoding for consistent communication
    await this.sendRaw(encodedVerb);
  }
}

