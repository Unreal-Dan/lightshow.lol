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

  accumulatedData = "";
  reader = null;
  isTransmitting = false; 
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  constructor() {
    this.cancelListeningForGreeting = false;
    this.debugSending = false;
    this.resetState();

    // Use a binary buffer rather than text for both binary and normal data.
    this.buffer = new Uint8Array(0); 
    this.pollingActive = false;
  }

  cancelListening() {
    console.log("Cancel listening");
    this.cancelListeningForGreeting = true;
  }

  resetState() {
    this.serialPort = null;
    this.portActive = false;
    this.name = '';
    this.version = 0;
    this.buildDate = '';
    if (this.reader) {
      this.reader.releaseLock();
      this.reader = null;
    }
    this.isTransmitting = false;
    this.hasUPDI = false;
  }

  isActive = () => {
    return this.portActive;
  }

  stopBackgroundReader() {
    if (this.backgroundReaderInterval) {
      clearInterval(this.backgroundReaderInterval);
      this.backgroundReaderInterval = null;
    }
    this.pollingActive = false;

    if (this.reader) {
      this.reader.releaseLock();
      this.reader = null;
    }

    console.log('Background reader stopped.');
  }

  startBackgroundReader() {
    if (this.pollingActive) {
      console.warn('Background reader already active.');
      return;
    }

    this.pollingActive = true;
          console.log("Reading");

    this.backgroundReaderInterval = setInterval(async () => {
      try {
        if (!this.serialPort || !this.serialPort.readable) return;
        if (!this.reader) {
          this.reader = this.serialPort.readable.getReader();
        }

        const { value, done } = await this.reader.read();
          console.log("Received");

        if (done) {
          console.warn('Stream ended.');
          this.stopBackgroundReader(); 
          return;
        }

        if (value) {
          // Append binary data directly
          const newData = value;
          const combined = new Uint8Array(this.buffer.length + newData.length);
          combined.set(this.buffer, 0);
          combined.set(newData, this.buffer.length);
          this.buffer = combined;
          console.log("Accumulated: " + this.buffer);
        }
      } catch (error) {
        console.error('Error in background reader:', error);
        this.stopBackgroundReader(); 
      }
    }, 50); 
  }

  async requestDevice(callback) {
    try {
      if (!this.serialPort) {
        this.serialPort = await navigator.serial.requestPort();
        if (!this.serialPort) {
          throw new Error('Failed to open serial port');
        }
        await this.serialPort.open({ baudRate: 115200 });
      }
      this.portActive = false;
      if (callback && typeof callback === 'function') {
        callback('waiting');
      }
      await this.startBackgroundReader();
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
    console.log("Listening for greeting...");
    while (!this.portActive && !this.cancelListeningForGreeting) {
      if (this.serialPort) {
        try {
          console.log("Reading...");
          const response = await this.readData();
          if (!response) {
            await this.sleep(100);
            continue;
          }

          let textResp = '';
          if (response.value) {
            textResp = new TextDecoder().decode(response.value);
          }
          
          let responseRegex = /^== Vortex Engine v(\d+\.\d+.\d+) '([\w\s]+)' \(built (.*)\) ==$/;
          let match = textResp.match(responseRegex);
          if (!match) {
            responseRegex = /^== Vortex Engine v(\d+\.\d+) '([\w\s]+)' \( built (.*)\) ==$/;
            match = textResp.match(responseRegex);
          }

          if (match) {
            this.version = match[1]; 
            this.name = match[2];    
            this.buildDate = match[3]; 

            console.log('Successfully Received greeting from Vortex Device');
            console.log('Device Type:', this.name);
            console.log('Version:', this.version);
            console.log('Date:', this.buildDate);

            this.useNewPushPull = this.isVersionGreaterOrEqual(this.version, '1.3.0');

            this.portActive = true;
            this.serialPort.addEventListener("disconnect", (event) => {
              this.disconnect(callback);
            });
            if (callback && typeof callback === 'function') {
              callback('connect');
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
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    this.cancelListeningForGreeting = false;
  }

  disconnect(callback = null) {
    this.resetState(); 
    if (callback && typeof callback === 'function') {
      callback('disconnect');
    }
  }

  startReading() {
  }

  cancelReading() {
  }

  // Updated readData to return binary data and mimic reader.read() style response
  readData() {
    if (this.buffer.length > 0) {
      const returnValue = { value: this.buffer, done: false };
      this.buffer = new Uint8Array(0);
      return returnValue;
    }
    return null;
  }

  constructCustomBufferRaw(vortexLib, rawDataArray, size) {
    const sizeArray = new Uint32Array([size]);
    const combinedArray = new Uint8Array(sizeArray.length * 4 + rawDataArray.length);
    combinedArray.set(new Uint8Array(sizeArray.buffer), 0);
    combinedArray.set(rawDataArray, sizeArray.length * 4);
    return combinedArray;
  }

  constructCustomBuffer(vortexLib, curMode) {
    let data = vortexLib.getRawDataArray(curMode);
    return this.constructCustomBufferRaw(vortexLib, data, curMode.rawSize());
  }

  async transmitVL(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    this.isTransmitting = true; 
    try {
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
      this.isTransmitting = false; 
    }
  }

  async demoColor(vortexLib, vortex, color) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    this.isTransmitting = true; 
    try {
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
      this.isTransmitting = false; 
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
    this.isTransmitting = true; 
    try {
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
      this.isTransmitting = false; 
    }
  }

  async pushEachToDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    this.isTransmitting = true; 
    try {
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
    } catch (error) {
      console.error('Error during pushToDevice:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; 
    }
  }

  async pushToDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    if (this.useNewPushPull) {
      return await this.pushEachToDevice(vortexLib, vortex);
    }
    this.isTransmitting = true; 
    try {
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
      this.isTransmitting = false; 
    }
  }

  async pullEachFromDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    this.isTransmitting = true; 
    try {
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PULL_EACH_MODE);
      const numModesBuf = await this.readByteStream(vortexLib);
      let numModesStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromRawData(numModesBuf, numModesStream);
      let numModes = numModesBuf[12];
      await this.sendCommand(this.EDITOR_VERB_PULL_EACH_MODE_ACK);
      vortex.clearModes();
      for (let i = 0; i < numModes; ++i) {
        const modeBuf = await this.readByteStream(vortexLib);
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
      this.isTransmitting = false; 
    }
  }

  async pullFromDevice(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    if (this.useNewPushPull) {
      return await this.pullEachFromDevice(vortexLib, vortex);
    }
    this.isTransmitting = true; 
    try {
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PULL_MODES);
      const modes = await this.readByteStream(vortexLib);
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
      this.isTransmitting = false; 
    }
  }

  async connectChromalink(vortexLib) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    let duoHeader = {};
    this.isTransmitting = true; 
    try {
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PULL_CHROMA_HDR);
      const header = await this.readByteStream(vortexLib);
      let headerStream = new vortexLib.ByteStream();
      vortexLib.createByteStreamFromRawData(header, headerStream);
      if (!headerStream.checkCRC() || headerStream.size() < 5) {
        throw new Error('Bad CRC or size: ' + headerStream.size());
      }
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
      duoHeader.version = duoHeader.vMajor + '.' + duoHeader.vMinor + '.' + duoHeader.vBuild;
      duoHeader.rawData = headerData;
      console.log(JSON.stringify(headerData));
      console.log('Successfully Chromalinked Duo');
      console.log('Version:', duoHeader.version);
      console.log('Flags:', duoHeader.flags);
      console.log('Brightness:', duoHeader.brightness);
      console.log('Mode Count:', duoHeader.numModes);
    } catch (error) {
      console.error('Error connecting to Duo via Chromalink:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; 
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
    this.isTransmitting = true; 
    try {
      await this.cancelReading();
      await this.sendCommand(this.EDITOR_VERB_PUSH_CHROMA_HDR);
      await this.expectData(this.EDITOR_VERB_READY);
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
    } catch (error) {
      console.error('Error connecting to Duo via Chromalink:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; 
    }
  }

  async pullDuoModes(vortexLib, vortex, numModes) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    vortex.clearModes();
    this.isTransmitting = true; 
    try {
      await this.cancelReading();
      for (let i = 0; i < numModes; ++i) {
        await this.sendCommand(this.EDITOR_VERB_PULL_CHROMA_MODE);
        await this.expectData(this.EDITOR_VERB_READY);  
        const sizeBuffer = new Uint8Array([i]);
        await this.sendRaw(sizeBuffer);
        const mode = await this.readByteStream(vortexLib);
        let modeStream = new vortexLib.ByteStream();
        vortexLib.createByteStreamFromRawData(mode, modeStream);
        if (!modeStream.checkCRC() || !modeStream.size()) {
          throw new Error(`Bad CRC or size for mode ${i}`);
        }
        if (!vortex.addNewModeRaw(modeStream, false)) { 
          throw new Error(`Failed to add mode ${i}`);
        }
        await this.sleep(10);
      }
    } catch (error) {
      console.error('Error pulling modes from Duo via Chromalink:', error);
    } finally {
      this.startReading();
      this.isTransmitting = false; 
    }
    return true;
  }

  async pushDuoModes(vortexLib, vortex) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }
    if (this.isTransmitting) {
      throw new Error('Already transmitting');
    }
    this.isTransmitting = true; 
    try {
      vortex.setCurMode(0, false);
      for (let i = 0; i < vortex.numModes(); ++i) {
        await this.sendCommand(this.EDITOR_VERB_PUSH_CHROMA_MODE);
        await this.expectData(this.EDITOR_VERB_READY);  
        const sizeBuffer = new Uint8Array([i]);
        await this.sendRaw(sizeBuffer);
        await this.expectData(this.EDITOR_VERB_READY);  
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
      this.isTransmitting = false; 
    }
  }

  async flashFirmware(vortexLib, firmwareData, progressCallback) {
    try {
      if (!this.isActive()) {
        throw new Error('Port not active');
      }
      const firmwareSize = firmwareData.length;
      if (firmwareSize <= 0) {
        throw new Error('Invalid firmware file.');
      }
      await this.sendCommand(this.EDITOR_VERB_FLASH_FIRMWARE);
      await this.expectData(this.EDITOR_VERB_READY);
      const sizeBuffer = new Uint32Array([firmwareSize]);
      await this.sendRaw(new Uint8Array(sizeBuffer.buffer));
      await this.expectData(this.EDITOR_VERB_READY);

      const chunkSize = 128;  
      let offset = 0;
      let chunk = 0;
      const totalChunks = Math.ceil(firmwareSize / chunkSize);

      while (offset < firmwareSize) {
        const bytesToSend = Math.min(chunkSize, firmwareSize - offset);
        const chunkData = firmwareData.slice(offset, offset + bytesToSend);

        const chunkStream = new vortexLib.ByteStream();
        vortexLib.createByteStreamFromData(chunkData, chunkStream);

        await this.sendRaw(this.constructCustomBuffer(vortexLib, chunkStream));
        await this.expectData(this.EDITOR_VERB_FLASH_FIRMWARE_ACK);  

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

  async readByteStream(vortexLib) {
    if (!this.isActive()) {
      throw new Error('Port not active');
    }

    try {
      const appendData = (existing, newData) => {
        const combined = new Uint8Array(existing.length + newData.value.length);
        combined.set(existing);
        combined.set(newData.value, existing.length);
        return combined;
      };

      let sizeData = new Uint8Array(0);
      while (sizeData.length < 4) {
        const data = await this.readData();
        if (!data) {
          await this.sleep(100);
          continue;
        }
        sizeData = appendData(sizeData, data);
      }

      const size = new DataView(sizeData.buffer).getUint32(0, true);
      let accumulatedData = sizeData.slice(4);
      while (accumulatedData.length < size) {
        const data = await this.readData();
        if (!data) {
          await this.sleep(100);
          continue;
        }
        const combined = new Uint8Array(accumulatedData.length + data.value.length);
        combined.set(accumulatedData);
        combined.set(data.value, accumulatedData.length);
        accumulatedData = combined;
      }

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

  async expectData(expectedResponse, timeoutMs = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const response = await this.readData();
      if (!response) {
        continue;
      }
      const textResponse = new TextDecoder().decode(response.value);
      console.log("Expecting: " + expectedResponse);
      if (textResponse === expectedResponse) {
        return;
      }
      console.log("Got: " + textResponse);
      return;
    }
    throw new Error('Timeout: Expected response not received');
  }

  async closePort() {
    if (this.serialPort) {
      await this.serialPort.close();
      this.serialPort = null;
      console.log('Port closed.');
    }
    this.stopBackgroundReader();
  }

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

  async sendCommand(verb) {
    if (!this.isActive()) {
      console.error('Port not active or another transmission is ongoing. Cannot send command.');
      return;
    }
    const encodedVerb = new TextEncoder().encode(verb);
    await this.sendRaw(encodedVerb);
  }

  // A helper that waits for a certain number of bytes or times out
  async readBytes(numBytes, timeoutMs = 100) {
    const startTime = Date.now();
    while (this.isActive()) {
      if (this.buffer.length >= numBytes) {
        const data = this.buffer.slice(0, numBytes);
        this.buffer = this.buffer.slice(numBytes);
        return data;
      }

      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Timeout waiting for data');
      }

      await this.sleep(10);
    }
    throw new Error('Port not active');
  }
}

