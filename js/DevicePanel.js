import Panel from './Panel.js';
import Notification from './Notification.js';
import Modal from './Modal.js';
import SimpleViews from './SimpleViews.js';

export default class DevicePanel extends Panel {
  constructor(editor) {
    // create a placeholder that will be filled in later
    super(editor, 'devicePanel', '', 'Device');

    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
    this._views = new SimpleViews({ basePath: 'js/views/' });
    this.multiLedWarningModal = new Modal('multiLedWarning');

    this.selectedDevice = 'None';
    this.currentBrightness = 0; // Current brightness value
  }

  initialize() {
    // delay init to allow events to settle
    setTimeout(() => {
      this.initDevicePanel();
    }, 500);
  }

  initDevicePanel() {
    this.contentContainer.innerHTML = `
      <div id="connectContainer">
        <button id="connectDeviceButton" class="btn btn-primary">
          <i class="fa-solid fa-plug"></i> Connect
        </button>
        <button id="disconnectDeviceButton" class="btn btn-danger" style="display: none;">
          <i class="fa-solid fa-plug"></i> Disconnect
        </button>
      </div>
      <div id="deviceInfoText" style="display:none;">No device selected</div>
      <div id="brightnessSliderContainer">
        <label for="brightnessSlider">Brightness: <span id="brightnessValue">100</span>%</label>
        <input type="range" id="brightnessSlider" min="0" max="255" value="255">
      </div>
      <div class="device-type-selector">
        <h4>Device Type</h4>
        <div class="custom-dropdown">
          <div id="deviceTypeSelected" class="custom-dropdown-selected">
            Select Device
          </div>
          <div id="deviceTypeOptions" class="custom-dropdown-options"></div>
        </div>
      </div>
    `;

    this.brightnessSlider = document.getElementById('brightnessSlider');
    this.brightnessValue = document.getElementById('brightnessValue');

    document.getElementById('connectDeviceButton').addEventListener('click', async () => {
      if (this.editor.vortexPort.isActive()) {
        // Device is connected => show multi-led warning?
        if (this.editor.lightshow.hasMultiLed()) {
          await this.confirmSwitchToDuo();
        } else {
          await this.connectDevice();
        }
      } else {
        // No device => connect
        await this.connectDevice();
      }
    });

    document.getElementById('disconnectDeviceButton').addEventListener('click', async () => {
      await this.disconnectDevice();
    });

    document.getElementById('deviceTypeOptions').addEventListener('click', async (event) => {
      const option = event.target.closest('.custom-dropdown-option');
      if (option) {
        const deviceKey = option.dataset.value;
        if (deviceKey) {
          await this.updateSelectedDevice(deviceKey, true);
        }
      }
    });

    this.brightnessSlider.addEventListener('input', (event) => this.onBrightnessSliderInput(event));
    this.brightnessSlider.addEventListener('change', (event) => this.onBrightnessSliderChange(event));

    this.addIconsToDropdown();
  }

  onBrightnessSliderInput(event) {
    const value = event.target.value;
    this.brightnessValue.textContent = Math.round((value / 255) * 100);
  }

  async onBrightnessSliderChange(event) {
    const value = parseInt(event.target.value, 10);
    try {
      await this.editor.vortexPort.setBrightness(this.editor.vortexLib, this.editor.lightshow.vortex, value);
      Notification.success(`Brightness set to ${Math.round((value / 255) * 100)}%`);
    } catch (error) {
      console.error('Failed to set brightness:', error);
      Notification.failure('Failed to set brightness.');
    }
  }

  async confirmSwitchToDuo() {
    return new Promise((resolve) => {
      this.multiLedWarningModal.show({
        title: 'Switching to Duo',
        blurb: 'Duo does not support multi-LED patterns. Switching will convert all multi-LED patterns. Are you sure you want to proceed?',
        buttons: [
          { label: 'Convert & Switch', class: 'modal-button primary', onClick: () => { this.multiLedWarningModal.hide(); resolve(true); } },
          { label: 'Cancel', class: 'modal-button', onClick: () => { this.multiLedWarningModal.hide(); resolve(false); } }
        ]
      });
    });
  }

  async disconnectDevice() {
    try {
      this.editor.lightshow.stop();
      await this.editor.vortexPort.disconnect();
      await this.editor.vortexPort.closePort();
      Notification.success('Device disconnected');
    } catch (error) {
      console.error('Failed to disconnect device:', error);
      Notification.failure('Failed to disconnect device.');
    }
    this.editor.lightshow.start();
  }

  async connectDevice() {
    // Ensure device type is selected
    if (this.selectedDevice === 'None') {
      Notification.failure('Please select a device type first.');
      return;
    }

    try {
      this.editor.lightshow.stop();
      await this.editor.vortexPort.requestDevice(
        this.editor.vortexLib,
        this.selectedDevice
      );
      await this.editor.vortexPort.beginConnection();
    } catch (error) {
      console.error('Connection failed:', error);
      Notification.failure('Connection failed: ' + error.message);
    }
    this.editor.lightshow.start();
  }

  async onDeviceConnect(deviceName, deviceVersion) {
    const port = this.editor.vortexPort;
    const isActive = port.isActive();

    // Show disconnect button and hide connect button
    document.getElementById('connectDeviceButton').style.display = 'none';
    document.getElementById('disconnectDeviceButton').style.display = '';

    this.showDeviceInfo(deviceName, deviceVersion);
    this.toggleDeviceInfo(255, true);

    if (this.selectedDevice == 'Spark') {
      try {
        await this.editor.vortexPort.setCpuSpeed(port.vortex.getRecommendedCpuSpeed());
      } catch (error) {
        console.log("detectMobile false: could not set CPU speed", error)
      }
    }
  }

  async onDeviceDisconnect(deviceName) {
    // Show connect button and hide disconnect button
    document.getElementById('disconnectDeviceButton').style.display = 'none';
    document.getElementById('connectDeviceButton').style.display = '';
    this.toggleDeviceInfo(255, false);
  }

  async onDeviceWaiting(deviceName) {
    console.log(`Waiting for ${deviceName}...`);
  }

  async onDeviceSelected(deviceName) {
  }

  addIconsToDropdown() {
    const deviceTypeOptions = document.getElementById('deviceTypeOptions');
    const keys = Object.keys(this.editor.devices);
    Promise.all(keys.map(key => {
      const device = this.editor.devices[key];
      return this._views.render('device-dropdown-option.html', {
        key,
        icon: device.icon,
        label: device.label,
      });
    })).then(fragments => {
      deviceTypeOptions.innerHTML = '';
      fragments.forEach(frag => deviceTypeOptions.appendChild(frag));
    });
  }

  async updateSelectedDevice(device, notify = false) {
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
      if (this.editor.detectMobile()) {
        this.editor.rebuildHamburgerMenu();
      }
      console.log(`Set LED count to ${ledCount} for ${this.editor.vortexPort.name}`);
    } else {
      console.log(`Device name ${this.editor.vortexPort.name} not recognized`);
    }
  }

  showDeviceInfo(name, version) {
    const deviceInfoText = document.getElementById('deviceInfoText');
    deviceInfoText.innerHTML = `
      <strong>${name}</strong> <span id="versionText">v${version}</span>
    `;
  }

  toggleDeviceInfo(fadeTime, show) {
    const deviceInfoText = document.getElementById('deviceInfoText');
    deviceInfoText.style.transition = `opacity ${fadeTime}ms`;
    deviceInfoText.style.display = show ? 'block' : 'none';
    requestAnimationFrame(() => {
      deviceInfoText.style.opacity = show ? '1' : '0';
    });
  }
}
