export default class ESPUpdater {
  constructor(port, logger) {
    this.port = port;
    this.logger = logger;
    this.reader = null;
    this.writer = null;
    this.inputBuffer = [];
    this.flashWriteSize = 4096; // Default for ESP
  }

  async connect() {
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.logger.log("Connected to ESP device.");
  }

  async disconnect() {
    this.reader.releaseLock();
    this.writer.releaseLock();
    await this.port.close();
    this.logger.log("Disconnected from ESP device.");
  }

  async initialize() {
    await this.hardReset(true);
    await this.sync();
  }

  async sync() {
    for (let i = 0; i < 5; i++) {
      this.inputBuffer.length = 0;
      await this.sendCommand(ESP_SYNC, SYNC_PACKET);
      try {
        let [_reply, data] = await this.getResponse(ESP_SYNC);
        if (data[0] === 0 && data[1] === 0) {
          this.logger.log("Device synchronized.");
          return true;
        }
      } catch (e) {
        this.logger.log("Sync attempt failed.");
      }
    }
    throw new Error("Failed to synchronize with the ESP.");
  }

  async flashFirmware(binaryData, updateProgress) {
    await this.flashBegin(binaryData.byteLength);
    let position = 0;
    let seq = 0;
    while (position < binaryData.byteLength) {
      const chunk = binaryData.slice(position, position + this.flashWriteSize);
      await this.flashBlock(chunk, seq);
      position += chunk.byteLength;
      seq++;
      updateProgress(position, binaryData.byteLength);
    }
    await this.flashFinish();
  }

  async flashBegin(size) {
    const numBlocks = Math.ceil(size / this.flashWriteSize);
    const buffer = pack("<IIII", size, numBlocks, this.flashWriteSize, 0);
    await this.sendCommand(ESP_FLASH_BEGIN, buffer);
    this.logger.log("Flash prepared.");
  }

  async flashBlock(data, seq) {
    const checksum = this.calculateChecksum(data);
    const buffer = pack("<IIII", data.byteLength, seq, 0, 0).concat([...data]);
    await this.sendCommand(ESP_FLASH_DATA, buffer, checksum);
  }

  async flashFinish() {
    const buffer = pack("<I", 1);
    await this.sendCommand(ESP_FLASH_END, buffer);
    this.logger.log("Flashing complete.");
  }

  calculateChecksum(data) {
    let checksum = 0xEF; // Initial value for ESP checksum
    for (const byte of data) {
      checksum ^= byte;
    }
    return checksum;
  }

  async sendCommand(opcode, buffer, checksum = 0) {
    const packet = slipEncode([...pack("<BBHI", 0x00, opcode, buffer.length, checksum), ...buffer]);
    await this.writer.write(new Uint8Array(packet));
  }

  async getResponse(opcode) {
    const packet = await this.readPacket();
    const [resp, opRet, _lenRet, val] = unpack("<BBHI", packet.slice(0, 8));
    if (resp !== 1 || opRet !== opcode) {
      throw new Error(`Invalid response for command ${opcode}`);
    }
    return [val, packet.slice(8)];
  }

  async readPacket() {
    let packet = [];
    let inEscape = false;
    while (true) {
      const { value, done } = await this.reader.read();
      if (done) throw new Error("Connection closed.");
      for (const byte of value) {
        if (inEscape) {
          packet.push(byte === 0xdc ? 0xc0 : byte === 0xdd ? 0xdb : byte);
          inEscape = false;
        } else if (byte === 0xdb) {
          inEscape = true;
        } else if (byte === 0xc0) {
          return packet;
        } else {
          packet.push(byte);
        }
      }
    }
  }

  async hardReset(bootloader = false) {
    await this.port.setSignals({ dataTerminalReady: !bootloader, requestToSend: bootloader });
    await sleep(100);
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await sleep(1000);
  }
}

