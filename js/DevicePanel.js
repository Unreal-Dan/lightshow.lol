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
    super('devicePanel', content, editor.detectMobile() ? 'Device' : 'Device Controls');
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

  // call to disconnect the device
  //async disconnectDevice() {
  //  await this.vortexPort.disconnect(); 
  //}

  async connectDevice() {
    try {
      if (this.vortexPort.serialPort) {
        Notification.failure("Already connected");
        return;
      }
      await this.vortexPort.requestDevice(deviceEvent => this.deviceChange(deviceEvent));
    } catch (error) {
      console.log("Error: " + error);
      Notification.failure('Failed to connect: ' + error.message);
    }
  }

  deviceChange(deviceEvent) {
    // name is either the selected device or on connect the vortexport name
    let deviceName = this.selectedDevice;
    if (deviceEvent === 'connect' && this.vortexPort) {
      deviceName = this.vortexPort.name;
    } 
    // version is only available on conect
    const deviceVersion = this.vortexPort ? this.vortexPort.version : 0;
    // dispatch the device change event with the new device name and version
    document.dispatchEvent(new CustomEvent('deviceChange', { 
      detail: { deviceEvent, deviceName, deviceVersion }
    }));
  }

  async onDeviceConnect(deviceName, deviceVersion) {
    const connectDeviceButton = document.getElementById('connectDeviceButton');

    // Change button to "Disconnect Device"
    //connectDeviceButton.innerHTML = `<i class="fa-solid fa-power-off"></i>`;
    connectDeviceButton.title = "Disconnect Device";
    //connectDeviceButton.classList.add('disconnect'); // Optional: Add a CSS class for styling

    //// Update event listener for disconnect
    //connectDeviceButton.onclick = () => {
    //  this.disconnectDevice();
    //};

    // Lock the dropdown to prevent further changes
    document.getElementById('deviceTypeSelected').classList.add('locked');

    // Update selected device
    this.updateSelectedDevice(deviceName, true);
    this.lockDeviceSelection(true);

    // start reading and demo on device
    // not sure if this is actually necessary
    this.vortexPort.startReading();
    this.editor.demoModeOnDevice();

    console.log("Device connected: " + deviceName);
    Notification.success("Successfully Connected " + deviceName);
  }

  async onDeviceDisconnect() {
    Notification.success("Device Disconnected!");

    const connectDeviceButton = document.getElementById('connectDeviceButton');

    // Change button back to "Connect Device"
    //connectDeviceButton.innerHTML = `<i class="fa-brands fa-usb"></i>`;
    connectDeviceButton.title = "Connect Device";
    //connectDeviceButton.classList.remove('disconnect'); // Optional: Remove the disconnect styling

    this.vortexPort.resetState();

    // Restore event listener for connect
    connectDeviceButton.onclick = async () => {
      await this.connectDevice();
    };

    // Unlock the dropdown to allow device selection
    document.getElementById('deviceTypeSelected').classList.remove('locked');

    // unlock device selection
    this.lockDeviceSelection(false);
  }

  async onDeviceWaiting(deviceName) {
    console.log("Waiting for ${deviceName}...");
  }

  async onDeviceSelected(deviceName) {
    Notification.success(`Selected '${deviceName}`);
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

    // ensure the dropdown is closed
    document.getElementById('deviceTypeOptions').classList.remove('show');

    if (device === 'None') {
      // Update the UI of the dropdown to 'select device'
      deviceTypeSelected.innerHTML = 'Select Device';
      // hide the spread slider in animation panel
      this.editor.animationPanel.hideSpreadSlider();
    } else {
      // Update the UI of the dropdown to device name
      deviceTypeSelected.innerHTML = `<img src="${deviceIcon}" alt="${device} Logo"> ${device}`;
      // show the spread slider in animation panel
      this.editor.animationPanel.showSpreadSlider();
    }

    // store the selected device
    this.selectedDevice = device;

    // update the lightshow led count
    const ledCount = this.editor.devices[this.selectedDevice].ledCount;
    if (ledCount !== undefined) {
      this.editor.lightshow.setLedCount(ledCount);
      console.log(`Set LED count to ${ledCount} for ${this.vortexPort.name}`);
    } else {
      console.log(`Device name ${this.vortexPort.name} not recognized`);
    }

    // Update and show the LED Select Panel
    this.editor.ledSelectPanel.updateSelectedDevice(device);
  }

  lockDeviceSelection(locked) {
    const deviceTypeSelected = document.getElementById('deviceTypeSelected');
    if (locked) {
      deviceTypeSelected.classList.add('locked');
    } else {
      deviceTypeSelected.classList.remove('locked');
    }
  }
}

