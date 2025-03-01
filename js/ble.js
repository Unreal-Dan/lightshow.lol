const SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
const WRITE_CHAR_UUID = "12345678-1234-1234-1234-123456789abd";
const NOTIFY_CHAR_UUID = "12345678-1234-1234-1234-123456789abe";

let bleDevice = null;
let writeCharacteristic = null;
let notifyCharacteristic = null;
let isConnected = false;
let notificationCallback = null;
let accumulatedData = "";

/**
 * Connect to the ESP32 Bluetooth device
 */
export async function connect() {
  try {
    console.log("Requesting Bluetooth Device...");
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: "ESP32-C3 BLE" }],
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
    console.log("Connected to ESP32 BLE!");

    return true;
  } catch (error) {
    console.error("BLE Connection Error:", error);
    return false;
  }
}

/**
 * Handle incoming notifications from ESP32
 * @param {Event} event - The characteristic change event
 */
function handleNotifications(event) {
    let value = new TextDecoder().decode(event.target.value);
    console.log("Received from ESP32:", value);
    accumulatedData += value;
}

/**
 * Send a command string to the ESP32 over BLE
 * @param {string} command - Command string to send
 */
export async function sendCommand(command) {
    if (!writeCharacteristic) {
        console.error("BLE not connected!");
        return;
    }
    console.log("Sending:", command);
    let encoder = new TextEncoder();
    await writeCharacteristic.writeValue(encoder.encode(command));
}

/**
 * Check if BLE is connected
 * @returns {boolean} - Connection status
 */
export function isBleConnected() {
    return isConnected;
}


/**
 * Read the accumulated BLE data
 * @returns {string|null} - Returns accumulated data if available, otherwise null
 */
export function readBleData() {
    if (accumulatedData.length > 0) {
        let data = accumulatedData;
        accumulatedData = ""; // Clear buffer after reading
        return data;
    }
    return null;
}
