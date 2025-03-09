import Notification from './Notification.js';
import * as BLE from './ble.js'; // Import BLE module

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
  EDITOR_VERB_SET_GLOBAL_BRIGHTNESS = "L";
  EDITOR_VERB_GET_GLOBAL_BRIGHTNESS = "M";

  accumulatedData = ""; // A buffer to store partial lines.
  reader = null;
  isTransmitting = null; // Flag to track if a transmission is active
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  constructor(editor, useBLE = false) {
    this.cancelListeningForGreeting = false;
    this.debugSending = false;
    this.resetState();
    this.debugLogging = false;
    this.editor = editor;
    this.useBLE = useBLE; // Determine if BLE should be used
    // Check for mobile + BLE support
    this.bleConnected = false;
    this.useBLE = this.editor.detectMobile() && this.editor.isBLESupported();
  }

  cancelListening() {
    console.log("Cancel listening");
    this.cancelListeningForGreeting = true;
    if (this.reader) {
      this.reader.cancel().catch(err => {
        console.warn('Error canceling reader:', err);
      });
    }
  }

  resetState() {
    if (this.reader) {
      try {
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
    this.isTransmitting = null; // Reset the transmission state on reset
    this.hasUPDI = false;
    if (this.serialPort) {
      this.serialPort.close();
      this.serialPort = null;
    }
    this.bleConnected = false;
    // Further state reset logic if necessary
  }

  isActive = () => {
    return this.useBLE ? BLE.isBleConnected() : this.portActive;
  }

  async requestDevice(callback) {
    this.deviceCallback = callback;

    if (this.useBLE) {
      Notification.success("Using BLE for VortexPort...");
      this.bleConnected = await BLE.connect();
      if (this.bleConnected) {
        Notification.success("BLE Connected!");
        if (this.deviceCallback && typeof this.deviceCallback === 'function') {
          this.deviceCallback('waiting');
        }
      } else {
        Notification.failure("BLE Connection Failed");
      }
    } else {
      try {
        if (!this.serialPort) {
          this.serialPort = await navigator.serial.requestPort();
          if (!this.serialPort) {
            throw new Error('Failed to open serial port');
          }
          await this.serialPort.open({ baudRate: 115200 });
          await this.serialPort.setSignals({ dataTerminalReady: true });

          if (this.deviceCallback && typeof this.deviceCallback === 'function') {
            this.deviceCallback('waiting');
          }
        }
      } catch (error) {
        console.error('Error:', error);
      }
    }
    // finally
    await this.beginConnection();
  }

  async beginConnection(){
    if (!this.useBLE && !this.serialPort) {
      return;
    }
    console.log("Beginning connection...");
    this.portActive = false;
    this.listenForGreeting();
  }

  async writeData(data) {
    const encoded = new TextEncoder().encode(data);
    if (this.useBLE) {
      if (!BLE.isBleConnected()) {
        console.error("BLE is not connected!");
        return;
      }
      console.log("Sending via BLE: ", data);
      await BLE.sendRaw(encoded);
      return;
    }

    if (!this.serialPort || !this.serialPort.writable) {
      console.error('Port is not writable.');
      return;
    }

    const writer = this.serialPort.writable.getWriter();

    try {
      await writer.write(encoded);
    } catch (error) {
      console.error('Error writing data:', error);
    } finally {
      writer.releaseLock();
    }
  }

  listenForGreeting = async () => {
    let tries = 0;
    while (!this.portActive && !this.cancelListeningForGreeting && tries++ < 30) {
      if (this.useBLE || this.serialPort) {
        try {
          console.log("Listening for greeting...");
          // Read data from the serial port
          const responseEncoded = await this.readData(true);
          if (!responseEncoded) {
            console.log("Error: Connection broken");
            if (this.useBLE) {
              // Using BLE, abort listen
              return;
            }
            // broken connection
            await this.sleep(500);
            continue;
          }

          const response = this.useBLE ? new TextDecoder().decode(responseEncoded) : responseEncoded;

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
            this.useNewPushPull = this.editor.isVersionGreaterOrEqual(this.version, '1.3.0');
            //if (this.useNewPushPull) {
            //  console.log('Detected 1.3.0+');
            //}

            this.portActive = true;
            if (this.serialPort) {
              this.serialPort.addEventListener("disconnect", (event) => {
                this.disconnect();
              });
            }
            // TODO: BLE disconnect handler?
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
    if (tries >= 30) {
      throw new Error('Failed to listen for greeting, tried 30 times');
    }
    this.cancelListeningForGreeting = false;
  }

  async restartConnecton() {
    await this.beginConnection();
  }

  async disconnect() {
    if (this.useBLE) {
      if (BLE.isBleConnected()) {
        await BLE.disconnect();
      }
    } else if (this.reader) {
      await this.reader.cancel();
    }
    this.resetState();
    if (this.deviceCallback && typeof this.deviceCallback === 'function') {
      this.deviceCallback('disconnect');
    }
  }

  startReading() {
    // todo: implement async read waiting for quit that can be canceled
    // lol this function is called all over the place and does nothing
  }

  cancelReading() {
    // todo: implement async read cancel
  }

  async readData(fullResponse) {
    if (this.useBLE) {
      if (!BLE.isBleConnected()) {
        console.error("BLE is not connected!");
        return null;
      }
      let data = BLE.readBleData(); // Read directly from BLE buffer
      if (data) return data;
      // If no data yet, wait until new data arrives
      return new Promise((resolve) => {
        let interval = setInterval(() => {
          let newData = BLE.readBleData();
          if (newData) {
            clearInterval(interval);
            resolve(newData);
          }
        }, 50);
      });
    }

    // Serial Port Handling (Unchanged)
    if (!this.serialPort || !this.serialPort.readable) return null;

    if (this.accumulatedData.length > 0) {
      const singleByte = this.accumulatedData[0];
      this.accumulatedData = this.accumulatedData.substring(1);
      return singleByte;
    }

    if (this.reader) {
      try { this.reader.releaseLock(); } catch (error) {}
    }

    this.reader = this.serialPort.readable.getReader();
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) {
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
        } else {
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
        try { this.reader.releaseLock(); } catch (error) {}
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
    if (this.debugLogging) console.log("Raw data: " + JSON.stringify(data));
    return this.constructCustomBufferRaw(vortexLib, data, curMode.rawSize());
  }

  async transmitVL(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    if (!vortex.engine().modes().curMode()) {
      throw new Error('No current mode');
    }
    if (this.debugLogging) console.log("transmitVL Start");
    this.isTransmitting = 'transmitVL'; // Set the transmitting flag
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
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("transmitVL End");
    }
  }

  async demoColor(vortexLib, vortex, color) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    if (this.debugLogging) console.log("demoColor Start");
    this.isTransmitting = 'demoColor'; // Set the transmitting flag
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
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("demoColor End");
    }
  }

  async demoCurMode(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    if (!vortex.engine().modes().curMode()) {
      // no error just return, no mode to demo
      return;
    }
    if (this.debugLogging) console.log("demoCurMode Start");
    this.isTransmitting = 'demoCurMode'; // Set the transmitting flag
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
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("demoCurMode End");
    }
  }

  async setBrightness(vortexLib, vortex, brightness) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    if (this.debugLogging) console.log("setBrightness Start");
    this.isTransmitting = 'setBrightness'; // Reset the transmitting flag
    try {
      await this.cancelReading();
      // Start the connection process
      await this.sendCommand(this.EDITOR_VERB_SET_GLOBAL_BRIGHTNESS);
      await this.expectData(this.EDITOR_VERB_READY, 1000);
      // build the brightness packet
      let brightnessStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromData([ brightness ], brightnessStream);
      await this.sendRaw(this.constructCustomBuffer(vortexLib, brightnessStream));
    } catch (error) {
      console.error('Error setting brightness:', error);
    } finally {
      this.startReading();
      this.isTransmitting = null; // Reset the transmitting flag
    }
  }

  async getBrightness(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    if (this.debugLogging) console.log("getBrightness Start");
    this.isTransmitting = 'getBrightness'; // Reset the transmitting flag
    console.log("Getting brightness...");
    let brightness = 255;
    try {
      await this.cancelReading();
      // Start the connection process
      await this.sendCommand(this.EDITOR_VERB_GET_GLOBAL_BRIGHTNESS);
      const brightnessBuf = await this.readByteStream(vortexLib);
      let brightnessStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromRawData(brightnessBuf, brightnessStream);
      // this is quite dumb, idk I guess header is 12 bytes so 13th byte is the one data byte
      brightness = brightnessBuf['12'];
    } catch (error) {
      console.error('Error setting brightness:', error);
    } finally {
      this.startReading();
      this.isTransmitting = null; // Reset the transmitting flag
    }
    console.log("Got brightness: " + brightness);
    return brightness;
  }

  async pushEachToDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    if (this.debugLogging) console.log("pushEachToDevice Start");
    this.isTransmitting = 'pushEachToDevice'; // Set the transmitting flag
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
      numModesBuf.recalcCRC();
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
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("pushEachToDevice End");
    }
  }

  async pushToDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    // 1.3.0+ use new push pull logic
    if (this.useNewPushPull) {
      return await this.pushEachToDevice(vortexLib, vortex);
    }
    if (this.debugLogging) console.log("pushToDevice Start");
    this.isTransmitting = 'pushToDevice'; // Set the transmitting flag
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
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("pushToDevice End");
    }
  }

  async pullEachFromDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    if (this.debugLogging) console.log("pullEachFromDevice Start");
    this.isTransmitting = 'pullEachFromDevice'; // Set the transmitting flag
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
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("pullEachFromDevice End");
    }
  }

  async pullFromDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    // 1.3.0+ use new push pull logic
    if (this.useNewPushPull) {
      return await this.pullEachFromDevice(vortexLib, vortex);
    }
    if (this.debugLogging) console.log("pullFromDevice Start");
    this.isTransmitting = 'pullFromDevice'; // Set the transmitting flag
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
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("pullFromDevice End");
    }
  }

  // Function to connect the Duo via Chromalink
  async connectChromalink(vortexLib) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    let duoHeader = {};
    if (this.debugLogging) console.log("connectChromaLink Start");
    this.isTransmitting = 'connectChromalink'; // Reset the transmitting flag
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
      if (headerStream.size() > 5 && duoHeader.vMinor > 2) {
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
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("connectChromaLink End");
    }
    return duoHeader;
  }

  async writeDuoHeader(vortexLib, vortex, duoHeader) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    if (this.debugLogging) console.log("connectChromaLink Start");
    this.isTransmitting = 'writeDuoHeader'; // Reset the transmitting flag
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
        duoHeader.vBuild,
      ];
      let headerStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromData(headerData, headerStream);
      await this.sendRaw(this.constructCustomBuffer(vortexLib, headerStream));
      await this.expectData(this.EDITOR_VERB_PUSH_CHROMA_HDR_ACK);
      if (this.debugLogging) console.log("DuoHeader: " + JSON.stringify(duoHeader));
      if (this.debugLogging) console.log("Header: " + JSON.stringify(headerData));
    } catch (error) {
      console.error('Error connecting to Duo via Chromalink:', error);
    } finally {
      this.startReading();
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("connectChromaLink End");
    }
  }

  // Function to pull all modes from the Duo via Chromalink
  async pullDuoModes(vortexLib, vortex, numModes) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    vortex.clearModes();
    if (this.debugLogging) console.log("pullDuoModes Start");
    this.isTransmitting = 'pullDuoModes'; // Set the transmitting flag
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
        //await this.sleep(10);
      }
    } catch (error) {
      console.error('Error pulling modes from Duo via Chromalink:', error);
    } finally {
      this.startReading();
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("pullDuoModes End");
    }
    return true;
  }

  // Function to push all modes to the Duo via Chromalink
  async pushDuoModes(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting:' + this.isTransmitting);
    }
    if (this.debugLogging) console.log("pushDuoModes Start");
    this.isTransmitting = 'pushDuoModes'; // Set the transmitting flag
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
      this.isTransmitting = null; // Reset the transmitting flag
      if (this.debugLogging) console.log("pushDuoModes End");
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
      // NOTE: don't increase the chunkSize
      const chunkSize = 128;
      let offset = 0;
      let chunk = 0;
      // add 30 fake chunks so progress bar has some space left for the restore modes
      const totalChunks = Math.ceil(firmwareSize / chunkSize) + 30;

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
      // wait for a final done
      await this.expectData(this.EDITOR_VERB_FLASH_FIRMWARE_DONE);
      // deliver the last 30 fake chunks to progress so the progress bar fills
      progressCallback(chunk + 30, totalChunks);
    } catch (error) {
      console.error("Firmware flash failed: " + error);
      Notification.failure('Firmware flash failed: ' + error.message);
    }
  }

  async readFromSerialPort() {
    if (this.useBLE) {
      if (!BLE.isBleConnected()) {
        console.error("BLE is not connected!");
        return null;
      }

      let data = BLE.readBleData();
      if (data) return { value: new TextEncoder().encode(data), done: false };

      return new Promise((resolve) => {
        let interval = setInterval(() => {
          let newData = BLE.readBleData();
          if (newData) {
            clearInterval(interval);
            resolve({ value: new TextEncoder().encode(newData), done: false });
          }
        }, 50);
      });
    }
    if (!this.serialPort || !this.serialPort.readable) {
      throw new Error('Serial port is not readable');
    }

    if (this.reader) {
      this.reader.releaseLock();
    }
    this.reader = this.serialPort.readable.getReader();
    let result = null;
    try {
      result = await this.reader.read();
      if (this.debugLogging) console.log("RECEIVED BYTE:" + JSON.stringify(result));
    } catch (error) {
      // do nothing?
      console.error("Failed to read: " + error);
    } finally {
      this.reader.releaseLock();
      this.reader = null;
    }
    return result;
  }

  async readByteStream(vortexLib) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }

    const appendData = (existing, newData) => {
      const combined = new Uint8Array(existing.length + newData.length);
      combined.set(existing);
      combined.set(newData, existing.length);
      return combined;
    };

    let sizeData = new Uint8Array(0);

    // Helper to poll BLE until we get data:
    const pollBleUntilData = async () => {
      return new Promise((resolve) => {
        const tryRead = () => {
          const chunk = BLE.readBleData();
          if (chunk) {
            resolve(chunk);
          } else {
            setTimeout(tryRead, 1);
          }
        };
        tryRead();
      });
    };

    // -----------------------
    // Read 4-byte size:
    // -----------------------
    if (this.useBLE) {
      while (sizeData.length < 4) {
        // Try immediate read:
        let data = BLE.readBleData();
        if (!data) {
          // If none, poll until we have some:
          data = await pollBleUntilData();
        }
        sizeData = appendData(sizeData, data);
      }
    } else {
      while (sizeData.length < 4) {
        const data = await this.readFromSerialPort();
        // data.value for the Web Serial scenario
        sizeData = appendData(sizeData, data.value);
      }
    }

    const size = new DataView(sizeData.buffer).getUint32(0, true);
    let accumulatedData = sizeData.slice(4);

    if (this.debugLogging) {
      console.log("Expected data size:", size);
    }

    // -----------------------
    // Read the actual data:
    // -----------------------
    if (this.useBLE) {
      while (accumulatedData.length < size) {
        // Try immediate read:
        let data = BLE.readBleData();
        if (!data) {
          // Poll for data if none is ready right away
          data = await pollBleUntilData();
        }
        accumulatedData = appendData(accumulatedData, data);
      }
    } else {
      while (accumulatedData.length < size) {
        const data = await this.readFromSerialPort();
        accumulatedData = appendData(accumulatedData, data.value);
      }
    }

    // -----------------------
    // Final check:
    // -----------------------
    if (accumulatedData.length === size) {
      if (this.debugLogging) {
        console.log("RECEIVED BUFFER (size: " + size + "):", accumulatedData);
      }
      return new Uint8Array(accumulatedData);
    } else {
      console.error("Data size mismatch.");
      return null;
    }
  }

  // wait for a specific response
  async expectData(expectedResponse, timeoutMs = 10000) {
    if (this.debugLogging) console.log("EXPECTING:" + expectedResponse);
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const responseEncoded = await this.readData();
      const response = this.useBLE ? new TextDecoder().decode(responseEncoded) : responseEncoded;
      if (response === expectedResponse) {
        if (this.debugLogging) console.log('RECEIVED GOOD:', response, ' (expected: ', expectedResponse, ')');
        return; // Expected response received
      }
      if (!response) {
        if (this.debugLogging) console.log('RECEIVED NOTHING (expected: ', expectedResponse, ')');
        return;
      }
      if (this.debugLogging) console.log('RECEIVED BAD:', response, ' (expected: ', expectedResponse, ')');
      return;
      //throw new Error('BAD: Expected response not received');
    }
    if (this.debugLogging) console.log('RECEIVE TIMEOUT (expected: ', expectedResponse, ')');
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
    if (!this.isActive()) {
      console.error("Port not active. Cannot send raw data.");
      return;
    }

    if (this.useBLE) {
      if (this.debugLogging) console.log("Sending raw data via BLE:", data);
      await BLE.sendRaw(data);
      return;
    }

    if (!this.serialPort || !this.serialPort.writable) {
      console.error('Port is not writable.');
      return;
    }

    const writer = this.serialPort.writable.getWriter();
    try {
      if (this.debugLogging) console.log("Sending raw data via Serial:", data);
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
      console.error('Port not active. Cannot send command.');
      return;
    }

    if (this.debugLogging) console.log("Sending command:", verb);
    const encodedVerb = new TextEncoder().encode(verb);
    await this.sendRaw(encodedVerb);
  }

}

