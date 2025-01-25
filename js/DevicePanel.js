import Panel from './Panel.js';
import Notification from './Notification.js';

export default class DevicePanel extends Panel {
  constructor(editor) {
    const content = `
      <div id="deviceConnectionSection">
        <div id="deviceTypeContainer" class="custom-dropdown" title="Pick which device is simulated">
          <div id="deviceTypeSelected" class="custom-dropdown-select">Select Device</div>
          <div id="deviceTypeOptions" class="custom-dropdown-options">
            <!-- Device options populated dynamically -->
          </div>
        </div>
        <button id="connectDeviceButton" class="device-control-btn" title="Connect a device over USB">
          <i class="fa-brands fa-usb"></i>
        </button>
      </div>
      <div id="brightnessControl">
        <input type="range" id="brightnessSlider" min="0" max="255" step="1" value="255" />
        <i class="fa-solid fa-sun" id="brightnessIcon"></i>
      </div>
    `;
    super('devicePanel', content, editor.detectMobile() ? 'Device' : 'Device Controls');
    this.editor = editor;
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

    // Brightness slider listener
    const brightnessSlider = document.getElementById('brightnessSlider');
    brightnessSlider.addEventListener('input', async (event) => {
      const brightness = event.target.value;
      const vortexPort = this.editor.vortexPort;
      if (vortexPort && vortexPort.setBrightness) {
        if (vortexPort.isTransmitting === null) {
          const vortexLib = this.editor.vortexLib;
          const vortex = this.editor.lightshow.vortex;
          // set the brightness of the device
          await vortexPort.setBrightness(vortexLib, vortex, brightness);
          // set the demo color
          const rgbcol = new vortexLib.RGBColor(brightness, brightness, 0);
          await vortexPort.demoColor(vortexLib, vortex, rgbcol);
        }
      }
    });
    // Extra action when the slider is released
    brightnessSlider.addEventListener('change', async (event) => {
      this.editor.demoModeOnDevice();
    });
  }

  // call to disconnect the device
  //async disconnectDevice() {
  //  await this.vortexPort.disconnect(); 
  //}

  async connectDevice() {
    try {
      if (this.editor.vortexPort.serialPort) {
        Notification.failure("Already connected");
        return;
      }
      await this.editor.vortexPort.requestDevice(deviceEvent => this.deviceChange(deviceEvent));
    } catch (error) {
      console.log("Error: " + error);
      Notification.failure('Failed to connect: ' + error.message);
    }
  }

  deviceChange(deviceEvent) {
    // name is either the selected device or on connect the vortexport name
    let deviceName = this.selectedDevice;
    if (deviceEvent === 'connect' && this.editor.vortexPort) {
      deviceName = this.editor.vortexPort.name;
    } 
    // version is only available on conect
    const deviceVersion = this.editor.vortexPort ? this.editor.vortexPort.version : 0;
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

    // brightness added and versions rolled to 1.5.x at same time
    // TODO: removeme this 1.3.0 check is for dev testing
    if (this.editor.isVersionGreaterOrEqual(deviceVersion, '1.5.0') || deviceVersion === '1.3.0') {
      const vortexLib = this.editor.vortexLib;
      const vortex = this.editor.lightshow.vortex;
      const deviceBrightness = await this.editor.vortexPort.getBrightness(vortexLib, vortex);
      // Unlock and show brightness control
      this.toggleBrightnessSlider(deviceBrightness);
    }

    // start reading and demo on device
    // not sure if this is actually necessary
    this.editor.vortexPort.startReading();
    this.editor.demoModeOnDevice();

    console.log("Device connected: " + deviceName);
    Notification.success("Successfully Connected " + deviceName);
  }

  isBrightnessHidden() {
    const brightnessControl = document.getElementById('brightnessControl');
    return (brightnessControl.style.display === 'none');
  }

  toggleBrightnessSlider(brightness = 255) {
    const devicePanel = document.getElementById('devicePanel');
    const patternParams = document.getElementById('patternParams');
    const toggleButton = document.getElementById('togglePatternParams');
    const brightnessSlider = document.getElementById('brightnessSlider');

    // Step 1: Capture the previous height and identify snapped panels
    const previousHeight = devicePanel.offsetHeight;
    const snappedPanels = this.getSnappedPanels(); // Identify panels based on the current height

    const brightnessControl = document.getElementById('brightnessControl');
    brightnessControl.style.display = 'flex';

    // Step 2: Toggle the visibility
    const isHidden = (brightnessControl.style.display === 'none');
    if (isHidden) {
      brightnessControl.style.display === 'flex';
    } else {
      brightnessControl.style.display === 'none';
    }

    // Step 3: Calculate the new height
    const heightChange = devicePanel.offsetHeight - previousHeight;

    // Step 4: Move snapped panels after the height change
    snappedPanels.forEach((otherPanel) => {
      otherPanel.moveSnappedPanels(heightChange);
      const currentTop = parseFloat(otherPanel.panel.style.top || otherPanel.panel.getBoundingClientRect().top);
      otherPanel.panel.style.top = `${currentTop + heightChange}px`;
    });

    brightnessSlider.value = brightness;
  }

  async onDeviceDisconnect() {
    Notification.success("Device Disconnected!");

    const connectDeviceButton = document.getElementById('connectDeviceButton');

    // Change button back to "Connect Device"
    //connectDeviceButton.innerHTML = `<i class="fa-brands fa-usb"></i>`;
    connectDeviceButton.title = "Connect Device";
    //connectDeviceButton.classList.remove('disconnect'); // Optional: Remove the disconnect styling

    this.editor.vortexPort.resetState();

    // Restore event listener for connect
    connectDeviceButton.onclick = async () => {
      await this.connectDevice();
    };

    // lock and hide brightness control only if it's showing
    if (!this.isBrightnessHidden()) {
      this.toggleBrightnessSlider();
    }

    // Unlock the dropdown to allow device selection
    document.getElementById('deviceTypeSelected').classList.remove('locked');

    // unlock device selection
    this.lockDeviceSelection(false);
  }

  async onDeviceWaiting(deviceName) {
    console.log(`Waiting for ${deviceName}...`);
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
      console.log(`Set LED count to ${ledCount} for ${this.editor.vortexPort.name}`);
    } else {
      console.log(`Device name ${this.editor.vortexPort.name} not recognized`);
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

