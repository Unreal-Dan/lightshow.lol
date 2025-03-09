const SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
const WRITE_CHAR_UUID = "12345678-1234-1234-1234-123456789abd";
const NOTIFY_CHAR_UUID = "12345678-1234-1234-1234-123456789abe";

let bleDevice = null;
let writeCharacteristic = null;
let notifyCharacteristic = null;
let isConnected = false;
let accumulatedData = new Uint8Array(0); // Store binary data

/**
 * Connect to the ESP32 Bluetooth device
 */
export async function connect() {
  try {
    console.log("Requesting Bluetooth Device...");
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: "Vortex Chromadeck" }, { name: "Vortex Spark" }],
      optionalServices: [SERVICE_UUID]
    });

    console.log("Connecting to GATT Server...");
    const server = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    console.log("Getting Characteristics...");
    writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
    notifyCharacteristic = await service.getCharacteristic(NOTIFY_CHAR_UUID);

    console.log("Setting up Notifications...");
    await notifyCharacteristic.startNotifications();
    notifyCharacteristic.addEventListener("characteristicvaluechanged", handleNotifications);

    isConnected = true;
    console.log("Connected to Bluetooth Vortex Device!");

    return true;
  } catch (error) {
    console.error("BLE Connection Error:", error);
    return false;
  }
}

/**
 * Handle incoming notifications from ESP32 (BINARY ONLY)
 * @param {Event} event - The characteristic change event
 */
function handleNotifications(event) {
    let rawData = new Uint8Array(event.target.value.buffer);
    accumulatedData = new Uint8Array([...accumulatedData, ...rawData]);
}

/**
 * Send a command string to the ESP32 over BLE
 * @param {string} command - Command string to send
 */
export async function sendRaw(data) {
    if (!writeCharacteristic) {
        console.error("BLE not connected!");
        return;
    }
    await writeCharacteristic.writeValue(data);
}

/**
 * Check if BLE is connected
 * @returns {boolean} - Connection status
 */
export function isBleConnected() {
    return isConnected;
}

/**
 * Read the accumulated BLE binary data
 * @returns {Uint8Array|null} - Returns accumulated data if available, otherwise null
 */
export function readBleData() {
  if (!isBleConnected()) {
    console.error("BLE is not connected!");
    return null;
  }

  if (accumulatedData.length === 0) {
    return null;
  }

  const returnedData = accumulatedData;
  accumulatedData = new Uint8Array(0);  // Reset buffer
  return returnedData;
}

