export default class VortexPort {
  // Constants
  EDITOR_VERB_HELLO = 'a';
  EDITOR_VERB_READY = 'b';
  EDITOR_VERB_PULL_MODES = 'c';
  EDITOR_VERB_PULL_MODES_DONE = 'd';
  EDITOR_VERB_PULL_MODES_ACK = 'e';
  EDITOR_VERB_PUSH_MODES = 'f';
  EDITOR_VERB_PUSH_MODES_ACK = 'g';
  EDITOR_VERB_DEMO_MODE = 'h';
  EDITOR_VERB_DEMO_MODE_ACK = 'i';
  EDITOR_VERB_CLEAR_DEMO = 'j';
  EDITOR_VERB_CLEAR_DEMO_ACK = 'k';
  EDITOR_VERB_GOODBYE = 'l';

  accumulatedData = ""; // A buffer to store partial lines.

  constructor() {
    this.serialPort = null;
    this.portActive = false;
    this.debugSending = false;
  }

  isActive = () => {
    return this.portActive;
  }

  async requestDevice() {
    try {
      if (!this.serialPort) {
        this.serialPort = await navigator.serial.requestPort();
      }
      if (!this.serialPort.readable || !this.serialPort.writable) {
        await this.serialPort.open({ baudRate: 9600 });
      }
      await this.serialPort.setSignals({ dataTerminalReady: true });
      this.listenForGreeting();
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

  listenForGreeting = async () => {
    while (!this.portActive) {
      if (this.serialPort) {
        try {
          // Read data from the serial port
          const response = await this.readData();

          const responseRegex = /^== Vortex Engine v(\d+\.\d+) '(\w+)' \( built (.*)\) ==$/;
          const match = response.match(responseRegex);

          if (match) {
            const version = match[1]; // Capturing the version number
            const name = match[2];    // Capturing the name
            const buildDate = match[3]; // Capturing the build date

            console.log('Received greeting from Vortex Device:');
            console.log('Device Type:', name);
            console.log('Version:', version);
            console.log('Date:', buildDate);
            this.portActive = true;
            await this.demoCurMode();
          }
        } catch (err) {
          console.error('Error reading data:', err);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async readData() {
    if (!this.serialPort || !this.serialPort.readable) {
      return null;
    }

    const reader = this.serialPort.readable.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
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
      reader.releaseLock();
    }
  }

  constructCustomBuffer(curMode) {
    // Create the custom array with size and rawData
    const size = curMode.rawSize();
    const sizeArray = new Uint32Array([size]); // No byte swapping
    const rawDataArray = Module.getRawDataArray(curMode);

    // Combine sizeArray and rawDataArray into a single array
    const combinedArray = new Uint8Array(sizeArray.length * 4 + rawDataArray.length);
    combinedArray.set(new Uint8Array(sizeArray.buffer), 0); // Copy sizeArray bytes
    combinedArray.set(rawDataArray, sizeArray.length * 4); // Copy rawDataArray bytes

    return combinedArray;
  }  

  async demoCurMode() {
    if (!this.isActive()) {
      return;
    }
    // Unserialize the stream of data
    const curMode = new Module.ByteStream();
    if (!Module.Vortex.getCurMode(curMode)) {
      console.log("Failed to get cur mode");
      // Error handling - abort or handle as needed
      return;
    }
    // send the command to indicate we will send over a demo mode
    await this.sendCommand(this.EDITOR_VERB_DEMO_MODE);
    // wait for the device to say it's ready
    await this.expectData(this.EDITOR_VERB_READY);
    // send over the mode
    await this.sendRaw(this.constructCustomBuffer(curMode));
    // wait for the acknolwedgement of the mode
    await this.expectData(this.EDITOR_VERB_DEMO_MODE_ACK);
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
      // You can log the received response here for debugging:
      console.log('Received:', response, ' (expected: ', expectedResponse, ')');
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
      console.error('Port not active. Cannot send command.');
      return;
    }

    const encodedVerb = new TextEncoder().encode(verb); // Ensure encoding for consistent communication
    await this.sendRaw(encodedVerb);
  }
}
