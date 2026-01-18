/* js/mobile/ble.js */

const SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
const WRITE_CHAR_UUID = "12345678-1234-1234-1234-123456789abd";
const NOTIFY_CHAR_UUID = "12345678-1234-1234-1234-123456789abe";

let bleDevice = null;
let writeCharacteristic = null;
let notifyCharacteristic = null;

let accumulatedData = new Uint8Array(0);

const disconnectListeners = new Set();
let disconnectHandlerBound = false;

function _appendAccumulated(chunk) {
  if (!chunk || !chunk.length) return;
  const next = new Uint8Array(accumulatedData.length + chunk.length);
  next.set(accumulatedData, 0);
  next.set(chunk, accumulatedData.length);
  accumulatedData = next;
}

function _cleanup({ keepDevice = false } = {}) {
  try {
    if (notifyCharacteristic) {
      try { notifyCharacteristic.removeEventListener("characteristicvaluechanged", handleNotifications); } catch {}
    }
  } catch {}

  writeCharacteristic = null;
  notifyCharacteristic = null;
  accumulatedData = new Uint8Array(0);

  if (!keepDevice) {
    bleDevice = null;
    disconnectHandlerBound = false;
  }
}

function _emitDisconnect(reason = "disconnected") {
  for (const cb of disconnectListeners) {
    try { cb(reason); } catch (_) {}
  }
}

function _onGattDisconnected() {
  // Device dropped (power off, out of range, etc.)
  _cleanup({ keepDevice: true }); // keep bleDevice reference (optional)
  _emitDisconnect("gattserverdisconnected");
}

function handleNotifications(event) {
  try {
    const v = event?.target?.value;
    if (!v) return;

    // v is a DataView; copy only the bytes in this view
    const chunk = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    _appendAccumulated(chunk);
  } catch (e) {
    console.warn("BLE notification handler error:", e);
  }
}

export function onDisconnect(cb) {
  if (typeof cb !== "function") return () => {};
  disconnectListeners.add(cb);
  return () => disconnectListeners.delete(cb);
}

export function isBleConnected() {
  // source of truth: GATT connection state
  try {
    return !!(bleDevice && bleDevice.gatt && bleDevice.gatt.connected);
  } catch {
    return false;
  }
}

export async function connect(deviceType = null) {
  try {
    console.log("Requesting Bluetooth Device...");
    const filters = [];
    if (deviceType === 'Spark' || deviceType == null) {
      filters.push({ name: 'Vortex Spark' });
    }
    if (deviceType === 'Chromadeck' || deviceType === 'Duo' || deviceType == null) {
      filters.push({ name: 'Vortex Chromadeck' });
    }
    bleDevice = await navigator.bluetooth.requestDevice({
      filters,
      optionalServices: [SERVICE_UUID],
    });

    if (!bleDevice) return false;

    // Bind disconnect event once per device
    if (!disconnectHandlerBound) {
      disconnectHandlerBound = true;
      bleDevice.addEventListener("gattserverdisconnected", _onGattDisconnected);
    }

    console.log("Connecting to GATT Server...");
    const server = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    console.log("Getting Characteristics...");
    writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
    notifyCharacteristic = await service.getCharacteristic(NOTIFY_CHAR_UUID);

    console.log("Setting up Notifications...");
    await notifyCharacteristic.startNotifications();
    notifyCharacteristic.addEventListener("characteristicvaluechanged", handleNotifications);

    accumulatedData = new Uint8Array(0);

    console.log("Connected to Bluetooth Vortex Device!");
    return true;
  } catch (error) {
    console.error("BLE Connection Error:", error);
    _cleanup({ keepDevice: false });
    return false;
  }
}

export async function disconnect() {
  try {
    // If we're connected, request a disconnect. This will also trigger gattserverdisconnected.
    await Promise.race([
      new Promise((resolve) => {
        try {
          if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) {
            bleDevice.gatt.disconnect();
          }
        } catch {}
        resolve();
      }),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    console.log("Disconnected from BLE device.");
  } catch (error) {
    console.error("BLE disconnect error:", error);
  } finally {
    _cleanup({ keepDevice: false });
    _emitDisconnect("manualdisconnect");
  }
}

export async function sendRaw(data) {
  if (!writeCharacteristic || !isBleConnected()) {
    console.error("BLE not connected!");
    return;
  }
  try {
    await writeCharacteristic.writeValue(data);
  } catch (e) {
    // If write fails because device died mid-write, treat it as disconnect-ish.
    console.warn("BLE write failed:", e);
    // Let higher layers decide what to do; buffer is kept.
    // Optionally, you could call disconnect() here, but it's safer to just signal.
    _emitDisconnect("writefailed");
  }
}

export function readBleData() {
  if (!isBleConnected()) return null;
  if (accumulatedData.length === 0) return null;

  const returned = accumulatedData;
  accumulatedData = new Uint8Array(0);
  return returned;
}

