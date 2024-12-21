import Notification from './Notification.js';

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
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  constructor() {
    this.cancelListeningForGreeting = false;
    this.debugSending = false;
    this.resetState();
  }

  cancelListening() {
    console.log("Cancel listening");
    this.cancelListeningForGreeting = true;
  }

  resetState() {
    if (this.reader) {
      try {
        console.log("resetState(): Release reader");
        this.reader.releaseLock();
      } catch (error) {
        console.warn('Error releasing reader in resetState:', error);
      } finally {
        this.reader = null;
      }
    }
    this.portActive = false;
    this.name = '';
    this.version = 0;
    this.buildDate = '';
    this.isTransmitting = false; // Reset the transmission state on reset
    this.hasUPDI = false;
    // Further state reset logic if necessary
  }

  isActive = () => {
    return this.portActive;
  }

  async requestDevice(callback) {
    this.deviceCallback = callback;
    try {
      if (!this.serialPort) {
        this.serialPort = await navigator.serial.requestPort();
        if (!this.serialPort) {
          throw new Error('Failed to open serial port');
        }
        await this.serialPort.open({ baudRate: 115200 });
        // is this necessary...? I don't remember why it's here
        await this.serialPort.setSignals({ dataTerminalReady: true });
        if (this.deviceCallback && typeof this.deviceCallback === 'function') {
          this.deviceCallback('waiting');
        }
      }
      await this.beginConnection();
    } catch (error) {
      console.error('Error:', error);
    }
  }

  async beginConnection(){
    console.log("Beginning connection...");
    this.portActive = false;
    this.listenForGreeting();
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

  listenForGreeting = async () => {
    while (!this.portActive && !this.cancelListeningForGreeting) {
      if (this.serialPort) {
        try {
          console.log("Listening for greeting...");
          // Read data from the serial port
          const response = await this.readData(true);
          if (!response) {
            console.log("Error: Connection broken");
            // broken connection
            continue;
          }

          console.log("Matching: [" + response + "]...");

          let responseRegex = /== Vortex Engine v(\d+\.\d+.\d+) '([\w\s]+)' \(built (.*)\) ==/;
          let match = response.match(responseRegex);
          if (!match) {
            // TODO: removeme later! backwards compatibility for old connection string
            responseRegex = /== Vortex Engine v(\d+\.\d+) '([\w\s]+)' \( built (.*)\) ==/;
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

            // old logic: sending updi in the name
            // new logic: a command to check if updi is available
            //// check if this is UPDI supported chromadeck
            //const regex = /\bUPDI\b/;
            //if (regex.test(this.name)) {
            //  // Replace 'UPDI' with an empty string and trim any remaining spaces
            //  this.name = this.name.replace(regex, '').replace(/\s+/g, ' ').trim();
            //  // note that we have updi support for this chromadeck
            //  this.hasUPDI = true;
            //}

            // 1.3.0 compatibility layer
            this.useNewPushPull = this.isVersionGreaterOrEqual(this.version, '1.3.0');
            //if (this.useNewPushPull) {
            //  console.log('Detected 1.3.0+');
            //}

            this.portActive = true;
            this.serialPort.addEventListener("disconnect", (event) => {
              this.disconnect();
            });
            if (this.deviceCallback && typeof this.deviceCallback === 'function') {
              this.deviceCallback('connect');
            }
          }
        } catch (err) {
          if (this.cancelListeningForGreeting) {
            this.cancelListeningForGreeting = false;
            console.error('Cancelling...');
          } else {
            console.error('Error reading data:', err);
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    this.cancelListeningForGreeting = false;
  }

  async restartConnecton() {
    await this.beginConnection();
  }

  async disconnect() {
    if (this.reader) {
      await this.reader.cancel();
    }
    this.resetState();
    if (this.deviceCallback && typeof this.deviceCallback === 'function') {
      this.deviceCallback('disconnect');
    }
  }

  startReading() {
    // todo: implement async read waiting for quit that can be canceled
  }

  cancelReading() {
    // todo: implement async read cancel
  }

  async readData(fullResponse) {
    if (!this.serialPort || !this.serialPort.readable) {
      return null;
    }
    if (this.accumulatedData.length > 0) {
      // check the buffer first...
      // Return any single byte
      const singleByte = this.accumulatedData[0];
      this.accumulatedData = this.accumulatedData.substring(1);
      return singleByte;
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
        console.log("Reading...");
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

        if (fullResponse) {
          const responseRegex = /==.*==/;
          const match = this.accumulatedData.match(responseRegex);
          if (match) {
            const result = this.accumulatedData;
            this.accumulatedData = '';
            return result;
          }
        // If it starts with '=' or '==', look for the end delimiter '=='
        //if (this.accumulatedData.startsWith('=') || this.accumulatedData.startsWith('==')) {
        //  const endIndex = this.accumulatedData.indexOf('==', 2); // Search for '==' after the first one.

        //  if (endIndex >= 0) {
        //    const fullMessage = this.accumulatedData.substring(0, endIndex + 2).trim();
        //    this.accumulatedData = this.accumulatedData.substring(endIndex + 2); // Trim accumulatedData
        //    return fullMessage; // Return the full message
        //  }
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

  constructCustomBufferRaw(vortexLib, rawDataArray, size) {
    // Create the custom array with size and rawData
    const sizeArray = new Uint32Array([size]); // No byte swapping

    // Combine sizeArray and rawDataArray into a single array
    const combinedArray = new Uint8Array(sizeArray.length * 4 + rawDataArray.length);
    combinedArray.set(new Uint8Array(sizeArray.buffer), 0); // Copy sizeArray bytes
    combinedArray.set(rawDataArray, sizeArray.length * 4); // Copy rawDataArray bytes

    return combinedArray;
  }

  constructCustomBuffer(vortexLib, curMode) {
    let data = vortexLib.getRawDataArray(curMode);
    //console.log("Raw data: " + JSON.stringify(data));
    return this.constructCustomBufferRaw(vortexLib, data, curMode.rawSize());
  }

  async transmitVL(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    if (!vortex.engine().modes().curMode()) {
      throw new Error('No current mode');
    }
    //console.log("transmitVL Start");
    this.isTransmitting = true; // Set the transmitting flag
    try {
      // Unserialize the stream of data
      const curMode = new vortexLib.ByteStream();
      if (!vortex.getCurMode(curMode)) {
        throw new Error('Failed to get cur mode');
      }
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_TRANSMIT_VL);
      await this.expectData(this.EDITOR_VERB_TRANSMIT_VL_ACK);
    } catch (error) {
      console.error('Error during transmitVL:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("transmitVL End");
    }
  }

  async demoColor(vortexLib, vortex, color) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    //console.log("demoColor Start");
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
    } catch (error) {
      console.error('Error during demoColor:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("demoColor End");
    }
  }

  async demoCurMode(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    if (!vortex.engine().modes().curMode()) {
      throw new Error('No current mode');
    }
    //console.log("demoCurMode Start");
    this.isTransmitting = true; // Set the transmitting flag
    try {
      // Unserialize the stream of data
      const curMode = new vortexLib.ByteStream();
      if (!vortex.getCurMode(curMode)) {
        throw new Error('Failed to get cur mode');
      }
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_DEMO_MODE);
      await this.expectData(this.EDITOR_VERB_READY);
      await this.sendRaw(this.constructCustomBuffer(vortexLib, curMode));
      await this.expectData(this.EDITOR_VERB_DEMO_MODE_ACK);
    } catch (error) {
      console.error('Error during demoCurMode:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("demoCurMode End");
    }
  }

  async pushEachToDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    //console.log("pushEachToDevice Start");
    this.isTransmitting = true; // Set the transmitting flag
    try {
      // Unserialize the stream of data
      const modes = new vortexLib.ByteStream();
      if (!vortex.getModes(modes)) {
        throw new Error('Failed to get cur mode');
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
    } catch (error) {
      console.error('Error during pushToDevice:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("pushEachToDevice End");
    }
  }

  async pushToDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    // 1.3.0+ use new push pull logic
    if (this.useNewPushPull) {
      return await this.pushEachToDevice(vortexLib, vortex);
    }
    //console.log("pushToDevice Start");
    this.isTransmitting = true; // Set the transmitting flag
    try {
      // Unserialize the stream of data
      const modes = new vortexLib.ByteStream();
      if (!vortex.getModes(modes)) {
        throw new Error('Failed to get cur mode');
      }
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PUSH_MODES);
      await this.expectData(this.EDITOR_VERB_READY);
      await this.sendRaw(this.constructCustomBuffer(vortexLib, modes));
      await this.expectData(this.EDITOR_VERB_PUSH_MODES_ACK);
    } catch (error) {
      console.error('Error during pushToDevice:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("pushToDevice End");
    }
  }

  async pullEachFromDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    //console.log("pullEachFromDevice Start");
    this.isTransmitting = true; // Set the transmitting flag
    try {
      // Unserialize the stream of data
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PULL_EACH_MODE);
      const numModesBuf = await this.readByteStream(vortexLib);
      let numModesStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromRawData(numModesBuf, numModesStream);
      // this is quite dumb, idk I guess header is 12 bytes so 13th byte is the one data byte
      let numModes = numModesBuf['12'];
      await this.sendCommand(this.EDITOR_VERB_PULL_EACH_MODE_ACK);
      vortex.clearModes();
      for (let i = 0; i < numModes; ++i) {
        const modeBuf = await this.readByteStream(vortexLib);
        // Call the Wasm function
        let modeStream = new vortexLib.ByteStream();
        vortexLib.createByteStreamFromRawData(modeBuf, modeStream);
        vortex.addNewMode(modeStream, true);
        await this.sendCommand(this.EDITOR_VERB_PULL_EACH_MODE_ACK);
      }
      await this.expectData(this.EDITOR_VERB_PULL_EACH_MODE_DONE);
    } catch (error) {
      console.error('Error during pullFromDevice:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("pullEachFromDevice End");
    }
  }

  async pullFromDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    // 1.3.0+ use new push pull logic
    if (this.useNewPushPull) {
      return await this.pullEachFromDevice(vortexLib, vortex);
    }
    //console.log("pullFromDevice Start");
    this.isTransmitting = true; // Set the transmitting flag
    try {
      // Unserialize the stream of data
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PULL_MODES);
      const modes = await this.readByteStream(vortexLib);
      // Call the Wasm function
      let modesStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromRawData(modes, modesStream);
      vortex.matchLedCount(modesStream, false);
      vortex.setModes(modesStream, true);
      await this.sendCommand(this.EDITOR_VERB_PULL_MODES_DONE);
      await this.expectData(this.EDITOR_VERB_PULL_MODES_ACK);
    } catch (error) {
      console.error('Error during pullFromDevice:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("pullFromDevice End");
    }
  }

  // Function to connect the Duo via Chromalink
  async connectChromalink(vortexLib) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    let duoHeader = {};
    //console.log("connectChromaLink Start");
    this.isTransmitting = true; // Reset the transmitting flag
    try {
      await this.cancelReading();
      // Start the connection process
      await this.sendCommand(this.EDITOR_VERB_PULL_CHROMA_HDR);
      const header = await this.readByteStream(vortexLib);
      // Call the Wasm function
      let headerStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromRawData(header, headerStream);
      if (!headerStream.checkCRC() || headerStream.size() < 5) {
        throw new Error('Bad CRC or size: ' + headerStream.size());
      }
      // process header
      const headerData = vortexLib.getDataArray(headerStream);
      duoHeader.vMajor = headerData[0];
      duoHeader.vMinor = headerData[1];
      duoHeader.vBuild = 0;
      duoHeader.flags = headerData[2];
      duoHeader.brightness = headerData[3];
      duoHeader.numModes = headerData[4];
      if (headerStream.size() > 5) {
        duoHeader.vBuild = headerData[5];
      }
      // construct a full version string
      duoHeader.version = duoHeader.vMajor + '.' + duoHeader.vMinor + '.' + duoHeader.vBuild;
      duoHeader.rawData = headerData;
      console.log('Successfully Chromalinked Duo');
      console.log('Version:', duoHeader.version);
      console.log('Flags:', duoHeader.flags);
      console.log('Brightness:', duoHeader.brightness);
      console.log('Mode Count:', duoHeader.numModes);
    } catch (error) {
      console.error('Error connecting to Duo via Chromalink:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("connectChromaLink End");
    }
    return duoHeader;
  }

  async writeDuoHeader(vortexLib, vortex, duoHeader) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    //console.log("connectChromaLink Start");
    this.isTransmitting = true; // Reset the transmitting flag
    try {
      await this.cancelReading();
      // Start the connection process
      await this.sendCommand(this.EDITOR_VERB_PUSH_CHROMA_HDR);
      await this.expectData(this.EDITOR_VERB_READY);
      // build the header
      const headerData = [
        duoHeader.vMajor,
        duoHeader.vMinor,
        duoHeader.flags,
        duoHeader.brightness,
        duoHeader.numModes,
      ];
      let headerStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromData(headerData, headerStream);
      await this.sendRaw(this.constructCustomBuffer(vortexLib, headerStream));
      await this.expectData(this.EDITOR_VERB_PUSH_CHROMA_HDR_ACK);
      //console.log("DuoHeader: " + JSON.stringify(duoHeader));
      //console.log("Header: " + JSON.stringify(headerData));
    } catch (error) {
      console.error('Error connecting to Duo via Chromalink:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("connectChromaLink End");
    }
  }

  // Function to pull all modes from the Duo via Chromalink
  async pullDuoModes(vortexLib, vortex, numModes) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    vortex.clearModes();
    //console.log("pullDuoModes Start");
    this.isTransmitting = true; // Set the transmitting flag
    try {
      await this.cancelReading();
      for (let i = 0; i < numModes; ++i) {
        // Send command to pull modes from the Duo
        await this.sendCommand(this.EDITOR_VERB_PULL_CHROMA_MODE);
        await this.expectData(this.EDITOR_VERB_READY);  // Wait for ACK
        const sizeBuffer = new Uint8Array([i]);
        await this.sendRaw(sizeBuffer);
        const mode = await this.readByteStream(vortexLib);
        // Call the Wasm function
        let modeStream = new vortexLib.ByteStream();
        vortexLib.createByteStreamFromRawData(mode, modeStream);
        if (!modeStream.checkCRC() || !modeStream.size()) {
          throw new Error(`Bad CRC or size for mode ${i}`);
        }
        // need to use addNewModeRaw here because the duo mode buffers
        // are not the full 'mode save' buffer with the header that would
        // be needed for addNewMode(), this will just 'unserialize' the mode
        // then add it without using the mode.loadFromBuffer() function
        if (!vortex.addNewModeRaw(modeStream, false)) {  // Add each mode
          throw new Error(`Failed to add mode ${i}`);
        }
        // seems to be an issue where it gets stuck on mode 3 (the first flash mode),
        // something to do with the underlying updi connection getting hung up and idk
        // why but the sleep fixes it lol
        await this.sleep(10);
      }
    } catch (error) {
      console.error('Error pulling modes from Duo via Chromalink:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("pullDuoModes End");
    }
    return true;
  }

  // Function to push all modes to the Duo via Chromalink
  async pushDuoModes(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    //console.log("pushDuoModes Start");
    this.isTransmitting = true; // Set the transmitting flag
    try {
      vortex.setCurMode(0, false);
      // TODO: detect total modes?
      for (let i = 0; i < vortex.numModes(); ++i) {
        // Send the push command
        await this.sendCommand(this.EDITOR_VERB_PUSH_CHROMA_MODE);

        await this.expectData(this.EDITOR_VERB_READY);  // Wait for ACK
        const sizeBuffer = new Uint8Array([i]);
        await this.sendRaw(sizeBuffer);

        await this.expectData(this.EDITOR_VERB_READY);  // Wait for ACK

        const modeBuf = new vortexLib.ByteStream();

        vortex.getCurModeRaw(modeBuf);
        await this.sendRaw(this.constructCustomBuffer(vortexLib, modeBuf));

        await this.expectData(this.EDITOR_VERB_PUSH_CHROMA_MODE_ACK);
        vortex.nextMode(false);
      }
    } catch (error) {
      console.error('Error pushing modes to Duo via Chromalink:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; // Reset the transmitting flag
      //console.log("pushDuoModes End");
    }
  }

  // Function to flash firmware to the Duo via Chromalink
  // Method for flashing firmware
  async flashFirmware(vortexLib, firmwareData, progressCallback) {
    try {
      if (!this.isActive()) {
        throw new Error('Port not active');
      }

      // Step 1: Check firmware size
      const firmwareSize = firmwareData.length;
      if (firmwareSize <= 0) {
        throw new Error('Invalid firmware file.');
      }

      // Step 2: Send Flash Firmware command, wait for ACK
      await this.sendCommand(this.EDITOR_VERB_FLASH_FIRMWARE);
      await this.expectData(this.EDITOR_VERB_READY);

      // Step 3: Send firmware size, wait for ACK
      const sizeBuffer = new Uint32Array([firmwareSize]);
      await this.sendRaw(new Uint8Array(sizeBuffer.buffer));
      await this.expectData(this.EDITOR_VERB_READY);

      // Step 4: Send firmware data in chunks
      const chunkSize = 128;  // Firmware chunk size
      let offset = 0;
      let chunk = 0;
      const totalChunks = Math.ceil(firmwareSize / chunkSize);

      while (offset < firmwareSize) {
        const bytesToSend = Math.min(chunkSize, firmwareSize - offset);
        const chunkData = firmwareData.slice(offset, offset + bytesToSend);

        const chunkStream = new vortexLib.ByteStream();
        vortexLib.createByteStreamFromData(chunkData, chunkStream);

        // Send the current chunk, wait for ACK
        await this.sendRaw(this.constructCustomBuffer(vortexLib, chunkStream));
        await this.expectData(this.EDITOR_VERB_FLASH_FIRMWARE_ACK);  // Wait for ACK

        offset += bytesToSend;
        chunk++;

        if (progressCallback && typeof progressCallback === 'function') {
          progressCallback(chunk, totalChunks);
        }
      }
    } catch (error) {
      console.log("Firmware flash failed: " + error);
      Notification.failure('Firmware flash failed: ' + error.message);
    }
  }

  async readFromSerialPort() {
    if (!this.serialPort || !this.serialPort.readable) {
      throw new Error('Serial port is not readable');
    }

    if (this.reader) {
      console.log("readFromSerialPort(): Release reader");
      this.reader.releaseLock();
    }
    this.reader = this.serialPort.readable.getReader();
    console.log("readFromSerialPort(): Got reader");
    let result = null;
    try {
      result = await this.reader.read();
      //console.log("RECEIVED BYTE:" + JSON.stringify(result));
    } catch (error) {
      // do nothing?
      console.log("Failed to read: " + error);
    }
    console.log("readFromSerialPort(): Release reader2");
    this.reader.releaseLock();
    this.reader = null;
    return result;
  }

  async readByteStream(vortexLib) {
    if (!this.isActive()) {
      throw new Error('Port not active');
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
        //console.log("RECEIVED BUFFER (size: " + size + "):" + JSON.stringify(accumulatedData));
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
    //console.log("EXPECTING:" + expectedResponse);
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const response = await this.readData();
      if (response === expectedResponse) {
        //console.log('RECEIVED GOOD:', response, ' (expected: ', expectedResponse, ')');
        return; // Expected response received
      }
      if (!response) {
        //console.log('RECEIVED NOTHING (expected: ', expectedResponse, ')');
        return;
      }
      //console.log('RECEIVED BAD:', response, ' (expected: ', expectedResponse, ')');
      return;
      //throw new Error('BAD: Expected response not received');
    }
    //console.log('RECEIVE TIMEOUT (expected: ', expectedResponse, ')');
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
      //console.log("SENDING RAW: " + JSON.stringify(data));
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
    //console.log("SENDING: " + verb);
    const encodedVerb = new TextEncoder().encode(verb); // Ensure encoding for consistent communication
    await this.sendRaw(encodedVerb);
  }
}

