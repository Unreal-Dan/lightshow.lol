/* js/spectra.js - Spectra Hub (PhotoHub) BLE Integration */

const SPECTRA_ADVERTISED_SERVICE = 'F4DB6DA0-2FCF-D296-A741-42FF6328EF42';
const HUB_CONTROL_SERVICE         = '1D797C00-5BBB-E1BF-3544-07F9C160632E';
const CHAR_GLOVE_COMMAND          = '58511D0A-2CD1-6188-5445-9F98C91BE785';
const CHAR_GLOVE_RESPONSE         = '217E8843-D35D-A180-F041-7298D2B02B5A';
const CHAR_GLOVE_STATE            = '58F54A2A-0E08-0CBD-1340-E3DBB208B41B';

const FLAG_COMMAND  = 0x55;
const FLAG_STATE    = 0xA5;

const CMD = {
  WRITE_MODE_SETTINGS:            1,
  WRITE_BLOCK_SETTINGS:           2,
  CHANGE_DISPLAY_MODE:            3,
  CHANGE_RUN_MODE:                4,
  SET_PWM_COLOR:                  5,
  FACTORY_RESET:                  6,
  WRITE_FLASHING_PATTERN:         7,
  SELECT_MODE_AND_SEQUENCE:       8,
  WRITE_EXIT_PAIRING:             9,
};

const RUN_MODE = {
  DISPLAY: 1,
  PHOTO:   2,
  COLOR:   3,
};

function buildCommand(flag, cmd1, cmd2, data) {
  const payload = new Uint8Array(16);
  const len = Math.min(data ? data.length : 0, 16);
  for (let i = 0; i < len; i++) payload[i] = data[i];
  const header = new Uint8Array([flag, cmd1, cmd2]);
  let crc = 0;
  for (let i = 0; i < 3; i++) crc ^= header[i];
  for (let i = 0; i < 16; i++) crc ^= payload[i];
  const packet = new Uint8Array(20);
  packet[0] = flag; packet[1] = cmd1; packet[2] = cmd2;
  packet.set(payload, 3);
  packet[19] = crc;
  return packet;
}

export class SpectraHub {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.commandChar = null;
    this.responseChar = null;
    this.stateChar = null;
    this._disconnectHandlers = [];
    this._connected = false;
  }

  isConnected() { return this._connected && this.device && this.device.gatt && this.device.gatt.connected; }

  /* ---------- Command builders (static, no connection needed) ---------- */

  writeModeSettings(mode, numColors, flashingPatternID, blankTime, motionType, sequenceID, motionThreshold, motionParam1, motionParam2, motionParam3) {
    return buildCommand(FLAG_COMMAND, CMD.WRITE_MODE_SETTINGS, mode,
      [numColors, flashingPatternID, blankTime, motionType, sequenceID,
       motionThreshold, motionParam1, motionParam2, motionParam3]);
  }

  writeBlockSettings(mode, blockNumber, red, green, blue, displayTimeMs, sequenceNum) {
    return buildCommand(FLAG_COMMAND, CMD.WRITE_BLOCK_SETTINGS, mode,
      [blockNumber, red, green, blue, displayTimeMs, sequenceNum]);
  }

  changeDisplayMode(mode, sequenceNum) {
    return buildCommand(FLAG_COMMAND, CMD.CHANGE_DISPLAY_MODE, mode, [sequenceNum]);
  }

  changeRunMode(mode, availableModes) {
    return buildCommand(FLAG_COMMAND, CMD.CHANGE_RUN_MODE, mode, [availableModes || 0]);
  }

  setPWMColor(red, green, blue) {
    return buildCommand(FLAG_COMMAND, CMD.SET_PWM_COLOR, 0, [red, green, blue]);
  }

  writeFlashingPatternSettings(pattern, patternNumber) {
    const d = [
      pattern.strobeLength || 0, pattern.gapLength || 0,
      pattern.groupGapLength || 0, pattern.brightnessSpeed || 0,
      pattern.faderSpeed || 0, pattern.colorRepeat || 0,
      pattern.groupRepeat || 0, pattern.groupingNumber || 0,
      pattern.firstColorStrobeLength || 0, pattern.firstColorRepeat || 0,
      pattern.firstColorPosition || 0, pattern.rampTargetLength || 0,
    ];
    return buildCommand(FLAG_COMMAND, CMD.WRITE_FLASHING_PATTERN, patternNumber || pattern.code || 1, d);
  }

  selectModeAndSequence(mode, sequenceNum) {
    return buildCommand(FLAG_COMMAND, CMD.SELECT_MODE_AND_SEQUENCE, mode, [sequenceNum]);
  }

  writeExitPairingMode() {
    return buildCommand(FLAG_COMMAND, CMD.WRITE_EXIT_PAIRING, 0, []);
  }

  /* ---------- BLE Connection ---------- */

  async scan() {
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [SPECTRA_ADVERTISED_SERVICE] },
          { namePrefix: 'bluenrg' },
          { name: 'PhotoHub' },
        ],
        optionalServices: [HUB_CONTROL_SERVICE],
      });
      this.device.addEventListener('gattserverdisconnected', () => {
        this._connected = false;
        this._cleanup();
        for (const cb of this._disconnectHandlers) try { cb(); } catch (e) {}
      });
      return true;
    } catch (err) {
      if (err.name !== 'NotFoundError') console.error('Spectra scan error:', err);
      return false;
    }
  }

  async connect() {
    if (!this.device) return false;
    try {
      this.server = await this.device.gatt.connect();
      this.service = await this.server.getPrimaryService(HUB_CONTROL_SERVICE);
      this.commandChar = await this.service.getCharacteristic(CHAR_GLOVE_COMMAND);
      try {
        this.responseChar = await this.service.getCharacteristic(CHAR_GLOVE_RESPONSE);
        await this.responseChar.startNotifications();
      } catch (e) {}
      try {
        this.stateChar = await this.service.getCharacteristic(CHAR_GLOVE_STATE);
      } catch (e) {}
      this._connected = true;
      return true;
    } catch (err) {
      console.error('Spectra connect error:', err);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.device && this.device.gatt && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }
    } catch (e) {}
    this._connected = false;
    this._cleanup();
  }

  _cleanup() {
    this.server = null;
    this.service = null;
    this.commandChar = null;
    this.responseChar = null;
    this.stateChar = null;
  }

  onDisconnect(cb) {
    this._disconnectHandlers.push(cb);
    return () => {
      this._disconnectHandlers = this._disconnectHandlers.filter(h => h !== cb);
    };
  }

  async writeCommand(packet) {
    if (!this.commandChar) throw new Error('SpectraHub: not connected');
    await this.commandChar.writeValue(packet);
  }

  async sendCommands(commands) {
    for (const cmd of commands) {
      await this.writeCommand(cmd);
      await new Promise(r => setTimeout(r, 50));
    }
  }

  /* ---------- Mode Translation ---------- */

  extractVortexModeInfo(vortexLib, vortex) {
    const curMode = vortex.engine().modes().curMode();
    if (!curMode) return null;

    const led = vortex.engine().leds().ledAny() || 0;
    const patID = curMode.getPatternID(led);
    const patternValue = patID ? patID.value : 1;
    const set = curMode.getColorset(led);
    const numColors = set ? Math.min(set.numColors(), 7) : 1;
    const colors = [];
    if (set) {
      for (let i = 0; i < numColors; i++) {
        const c = set.get(i);
        colors.push({
          red: (c && c.red) || 0,
          green: (c && c.green) || 0,
          blue: (c && c.blue) || 0,
        });
      }
    }
    const patternObj = curMode.getPattern(led);
    const motionType = 0;
    const motionSpeed = 0;
    const motionP1 = 0;
    const motionP2 = 0;
    const motionP3 = 0;

    return {
      patternID: patternValue,
      numColors,
      colors,
      motionType,
      motionSpeed,
      motionP1,
      motionP2,
      motionP3,
    };
  }

  convertModeToCommands(modeInfo, modeSlot) {
    const slot = modeSlot || 1;
    const commands = [];
    const seqID = 1;

    commands.push(this.writeModeSettings(
      slot, modeInfo.numColors, modeInfo.patternID, 0,
      modeInfo.motionType, seqID,
      modeInfo.motionSpeed, modeInfo.motionP1, modeInfo.motionP2, modeInfo.motionP3
    ));

    for (let ci = 0; ci < modeInfo.colors.length; ci++) {
      const c = modeInfo.colors[ci];
      commands.push(this.writeBlockSettings(slot, ci + 1, c.red, c.green, c.blue, 0, seqID));
    }

    if (modeInfo.colors.length < 7) {
      for (let ci = modeInfo.colors.length; ci < 7; ci++) {
        commands.push(this.writeBlockSettings(slot, ci + 1, 0, 0, 0, 0, seqID));
      }
    }

    return commands;
  }

  async syncVortexMode(vortexLib, vortex, modeSlot) {
    const info = this.extractVortexModeInfo(vortexLib, vortex);
    if (!info) throw new Error('No current mode in editor');

    const commands = this.convertModeToCommands(info, modeSlot || 1);
    commands.push(this.changeDisplayMode(modeSlot || 1, 1));
    commands.push(this.changeRunMode(RUN_MODE.DISPLAY));
    await this.sendCommands(commands);
  }

  async previewColor(r, g, b) {
    await this.sendCommands([
      this.changeRunMode(RUN_MODE.COLOR),
      this.setPWMColor(r, g, b),
    ]);
  }

  async stopPreview() {
    await this.sendCommands([
      this.changeDisplayMode(1, 1),
      this.changeRunMode(RUN_MODE.DISPLAY),
    ]);
  }
}

/* ---------- Convenience Singleton ---------- */

let defaultHub = null;
export function getDefaultHub() {
  if (!defaultHub) defaultHub = new SpectraHub();
  return defaultHub;
}
