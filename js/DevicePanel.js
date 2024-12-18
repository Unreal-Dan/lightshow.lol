import Panel from './Panel.js';
import Notification from './Notification.js';

export default class DevicePanel extends Panel {
  constructor(editor) {
    const content = `
      <div id="deviceConnectionSection">
        <div id="deviceTypeContainer" class="custom-dropdown">
          <div id="deviceTypeSelected" class="custom-dropdown-select">Select Device</div>
          <div id="deviceTypeOptions" class="custom-dropdown-options">
            <!-- Device options populated dynamically -->
          </div>
        </div>
        <button id="connectDeviceButton" class="device-control-btn" title="Connect Device">
          <i class="fa-brands fa-usb"></i>
        </button>
      </div>
    `;
    super('devicePanel', content, 'Device Controls');

    this.editor = editor;
    this.vortexPort = editor.vortexPort;
    this.selectedDevice = 'None';
  }

  initialize() {
    document.getElementById('connectDeviceButton').addEventListener('click', async () => {
      await this.connectDevice();
    });

    this.addIconsToDropdown();

    document.getElementById('deviceTypeOptions').addEventListener('click', (event) => {
      if (event.target.classList.contains('custom-dropdown-option')) {
        const selectedValue = event.target.getAttribute('data-value');
        this.updateSelectedDevice(selectedValue);
      }
    });

    document.getElementById('deviceTypeSelected').addEventListener('click', (event) => {
      // Prevent dropdown from opening if it's locked
      if (event.currentTarget.classList.contains('locked')) {
        return; // Do nothing if locked
      }

      document.getElementById('deviceTypeOptions').classList.toggle('show');
    });
  }

  async connectDevice() {
      try {
        await this.vortexPort.requestDevice(deviceEvent => this.deviceChange(deviceEvent));
      } catch (error) {
        console.log("Error: " + error);
        Notification.failure('Failed to connect: ' + error.message);
      }
  }

  deviceChange(eventType) {
    if (deviceEvent === 'connect') {
      this.onDeviceConnect();
    } else if (deviceEvent === 'disconnect') {
      this.onDeviceDisconnect();
    } else if (deviceEvent === 'waiting') {
      Notification.success("Waiting for device...");
    } else if (deviceEvent === 'select') {
      Notification.success(`Selected '${deviceName}`);
    }

    // dispatch the device change event with the new device name
    document.dispatchEvent(new CustomEvent('deviceChange', { deviceEvent, deviceName }));
  }

  onDeviceConnect() {
    Notification.success("Device Connected!");

    const connectDeviceButton = document.getElementById('connectDeviceButton');

    // Change button to "Disconnect Device"
    //connectDeviceButton.innerHTML = `<i class="fa-solid fa-power-off"></i>`;
    connectDeviceButton.title = "Disconnect Device";
    //connectDeviceButton.classList.add('disconnect'); // Optional: Add a CSS class for styling

    //// Update event listener for disconnect
    //connectDeviceButton.onclick = () => {
    //  this.vortexPort.disconnectDevice();
    //  this.onDeviceDisconnect();
    //};

    // Lock the dropdown to prevent further changes
    document.getElementById('deviceTypeSelected').classList.add('locked');

    // Update selected device
    const deviceName = this.vortexPort.name;
    this.updateSelectedDevice(deviceName, true);
  }

  onDeviceDisconnect() {
    Notification.success("Device Disconnected!");

    const connectDeviceButton = document.getElementById('connectDeviceButton');

    // Change button back to "Connect Device"
    connectDeviceButton.innerHTML = `
    <i class="fa-brands fa-usb"></i> Connect Device
  `;
    connectDeviceButton.title = "Connect Device";
    connectDeviceButton.classList.remove('disconnect'); // Optional: Remove the disconnect styling

    // Restore event listener for connect
    connectDeviceButton.onclick = async () => {
      await this.connectDevice();
    };

    // Unlock the dropdown to allow device selection
    document.getElementById('deviceTypeSelected').classList.remove('locked');

    document.dispatchEvent(new CustomEvent('deviceDisconnected'));
  }

  addIconsToDropdown() {
    const deviceTypeOptions = document.getElementById('deviceTypeOptions');
    deviceTypeOptions.innerHTML = Object.keys(this.editor.devices).map(key => {
      const device = this.editor.devices[key];
      return `
        <div class="custom-dropdown-option" data-value="${key}">
          <img src="${device.icon}" alt="${device.label} Logo"> ${device.label}
        </div>`;
    }).join('');
  }

  updateSelectedDevice(device) {
    const deviceTypeSelected = document.getElementById('deviceTypeSelected');
    const deviceIcon = this.editor.devices[device].icon;

    // Update the UI of the dropdown
    deviceTypeSelected.innerHTML = `
    <img src="${deviceIcon}" alt="${device} Logo"> ${device}`;

    // store the selected device
    this.selectedDevice = device;

    // Set LED count based on the device
    this.editor.lightshow.setLedCount(this.editor.devices[device].ledCount);

    // Update and show the LED Select Panel
    this.editor.ledSelectPanel.updateSelectedDevice(device);
    this.editor.ledSelectPanel.selectAllLeds();
    this.editor.ledSelectPanel.show();
  }
}

