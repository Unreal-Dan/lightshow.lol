import Panel from './Panel.js';
import Notification from './Notification.js';
import Modal from  './Modal.js';

export default class DevicePanel extends Panel {
  constructor(editor) {
    const isMobile = editor.detectMobile();
    const iconClass = isMobile ? 'fa-bluetooth-b' : 'fa-usb';
    const buttonTitle = isMobile ? 'Connect a device over Bluetooth' : 'Connect a device over USB';

    const content = `
      <div id="deviceConnectionSection">
        <div id="deviceTypeContainer" class="custom-dropdown" title="Pick which device is simulated">
          <div id="deviceTypeSelected" class="custom-dropdown-select">Select Device</div>
          <div id="deviceTypeOptions" class="custom-dropdown-options">
            <!-- Device options populated dynamically -->
          </div>
        </div>
        <button id="connectDeviceButton" class="device-control-btn" title="${buttonTitle}">
          <i class="fa-brands ${iconClass}"></i>
        </button>
      </div>
      <div id="deviceInfoPanel" style="display:none;">
        <div id="deviceInfoPanelHeader">
          <div class="device-info">
            <p id="deviceInfoText">No device connected</p>
          </div>
          <button id="disconnectDeviceButton" class="device-control-btn disconnect-btn" title="Disconnect Device">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div id="deviceInfoPanelContent">
          <div id="brightnessControl">
            <input type="range" id="brightnessSlider" min="0" max="255" step="1" value="255" />
            <i class="fa-solid fa-sun" id="brightnessIcon"></i>
          </div>
          <!-- TODO: finish the duo mode button -->
        </div>
      </div>
    `;
            // <div id="duoSwitchContainer" style="display:none;">
            //   <label id="duoSwitchLabel">Duo Hub</label>
            //   <button id="switchDuoModeButton" class="duo-mode-btn" title="Switch to Duo Mode" >
            //     <img src="public/images/duo-logo-square-512.png" style="width: 100%; height: auto;">
            //   </button>
            // </div>
    super(editor, 'devicePanel', content, editor.detectMobile() ? 'Device' : 'Device Controls');
    this.editor = editor;
    this.selectedDevice = 'None';
    this.multiLedWarningModal = new Modal('multiLedWarning');
  }

  initialize() {
    this.connectButtonHandler = async () => {
      if (!this.editor.vortexPort.serialPort) {
        await this.connectDevice();
      }
    };
    document.getElementById('connectDeviceButton').addEventListener('click', this.connectButtonHandler);
    this.addIconsToDropdown();

    document.getElementById('deviceTypeOptions').addEventListener('click', async (event) => {
      if (event.target.classList.contains('custom-dropdown-option')) {
        const selectedValue = event.target.getAttribute('data-value');

        // when switching devices to duo
        if (selectedValue === 'Duo' && this.editor.modesPanel.hasMultiLedPatterns()) {
          const confirmed = await this.confirmSwitchToDuo();
          if (!confirmed) {
            return;
          }
          console.log("Switching modes...");
          this.editor.modesPanel.convertModesToSingle();
        }

        await this.updateSelectedDevice(selectedValue, true);
        Notification.success(`Selected Device: '${selectedValue}'`);
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
    brightnessSlider.addEventListener('input', this.onBrightnessSliderInput.bind(this));
    brightnessSlider.addEventListener('change', this.onBrightnessSliderChange.bind(this));

    // transmit toggle button
    const transmitToggle = document.getElementById('transmitToggle');
    if (transmitToggle) {
      transmitToggle.addEventListener('change', () => {
        const enabled = transmitToggle.checked;
        this.editor.setTransmitVL(enabled);
      });
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

  // when the slider is slid around
  async onBrightnessSliderInput(event) {
    const brightness = event.target.value;
    const vortexPort = this.editor.vortexPort;
    if (vortexPort && vortexPort.setBrightness) {
      if (vortexPort.isTransmitting === null) {
        const vortexLib = this.editor.vortexLib;
        const vortex = this.editor.lightshow.vortex;
        // demo the color on the device
        const rgbcol = new vortexLib.RGBColor(brightness, brightness, 0);
        await vortexPort.demoColor(vortexLib, vortex, rgbcol);
      }
    }
  }

  // when the slider is finally released
  async onBrightnessSliderChange(event) {
    // if it's a duo we don't update the brightness till the final 'change'
    const brightness = event.target.value;
    const vortexLib = this.editor.vortexLib;
    const vortex = this.editor.lightshow.vortex;
    await this.editor.vortexPort.setBrightness(vortexLib, vortex, brightness);
    // wait a second before setting the mode again
    await this.editor.sleep(300);
    // then go back to demoing the mode
    await this.editor.demoModeOnDevice();
  }

  // call to disconnect the device
  async disconnectDevice() {
    if (!this.editor.vortexPort.serialPort && !this.editor.vortexPort.useBLE) {
      Notification.failure("No device connected");
      return;
    }
    await this.editor.vortexPort.disconnect();
  }

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
    this.deviceChangeNotification(deviceEvent, deviceName, deviceVersion);
  }

  deviceChangeNotification(deviceEvent, deviceName, deviceVersion) {
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
    connectDeviceButton.disabled = false;
    //connectDeviceButton.classList.add('disconnect'); // Optional: Add a CSS class for styling

    // event listener for disconnect
    document.getElementById('disconnectDeviceButton').addEventListener('click', async () => {
      console.log("Disconnecting...");
      await this.disconnectDevice();
      const deviceInfoPanel = document.getElementById('deviceInfoPanel');
      if (deviceInfoPanel) deviceInfoPanel.style.display = 'none';
    });

    // Lock the dropdown to prevent further changes
    document.getElementById('deviceTypeSelected').classList.add('locked');

    // Update selected device
    await this.updateSelectedDevice(deviceName);
    this.lockDeviceSelection(true);

    // brightness added and versions rolled to 1.5.x at same time
    // TODO: removeme this 1.3.0 check is for dev testing
    if (this.editor.isVersionGreaterOrEqual(deviceVersion, '1.5.0') || deviceVersion === '1.3.0') {
      const vortexLib = this.editor.vortexLib;
      const vortex = this.editor.lightshow.vortex;
      const deviceBrightness = await this.editor.vortexPort.getBrightness(vortexLib, vortex);
      // Unlock and show brightness control
      this.toggleDeviceInfo(deviceBrightness);
    }

    // start reading and demo on device
    // not sure if this is actually necessary
    this.editor.vortexPort.startReading();
    await this.editor.demoModeOnDevice();

    // show device information on mobile
    if (this.editor.detectMobile()) {
      this.physicalDeviceType = deviceName;
      const switchContainer = document.getElementById('duoSwitchContainer');
      const switchButton = document.getElementById('switchDuoModeButton');
      if (deviceName === 'Chromadeck') {
        switchContainer.style.display = 'flex';
        switchButton.addEventListener('click', async () => {
          if (this.selectedDevice === 'Duo') {
            await this.updateSelectedDevice('Chromadeck', true);
            Notification.success(`Switched back to Chromadeck Mode`);
          } else {
            if (this.editor.modesPanel.hasMultiLedPatterns()) {
              const confirmed = await this.confirmSwitchToDuo();
              if (!confirmed) {
                return;
              }
              this.editor.modesPanel.convertModesToSingle();
            }
            await this.updateSelectedDevice('Duo', true);
            Notification.success(`Switched to Duo Mode`);
          }
        });
      } else {
        switchContainer.style.display = 'none';
      }
      document.getElementById('connectDeviceButton').disabled = true;
      document.getElementById('disconnectDeviceButton').addEventListener('click', async () => {
        await this.disconnectDevice();
        deviceInfoPanel.style.display = 'none';
      });
    }

    document.getElementById('deviceInfoText').innerText = `${deviceName} (v${deviceVersion})`;
    const deviceInfoPanel = document.getElementById('deviceInfoPanel');
    if (deviceInfoPanel) {
      deviceInfoPanel.style.display = 'flex';
    }

    const transmitToggle = document.getElementById('transmitToggle');
    if (transmitToggle) {
      const isDuo = (deviceName === 'Duo');
      const isMultiLed = this.editor.vortex.engine().modes().curMode()?.isMultiLed?.() ?? true;
      transmitToggle.disabled = isMultiLed;
    }

    console.log("Device connected: " + deviceName);
    Notification.success("Successfully Connected " + deviceName);
  }

  toggleDeviceInfo(brightness = 255, propagate = true) {
    const devicePanel = document.getElementById('devicePanel');
    const deviceInfoPanel = document.getElementById('deviceInfoPanel');
    const brightnessSlider = document.getElementById('brightnessSlider');

    const previousHeight = devicePanel.offsetHeight;
    const snappedPanels = this.getSnappedPanels();

    if (deviceInfoPanel.style.display === '' || deviceInfoPanel.style.display === 'none') {
      deviceInfoPanel.style.display = 'flex';
    } else {
      deviceInfoPanel.style.display = 'none';
    }

    if (propagate) {
      const heightChange = devicePanel.offsetHeight - previousHeight;
      snappedPanels.forEach((otherPanel) => {
        otherPanel.moveSnappedPanels(heightChange);
        const currentTop = parseFloat(otherPanel.panel.style.top || otherPanel.panel.getBoundingClientRect().top);
        otherPanel.panel.style.top = `${currentTop + heightChange}px`;
      });
    }

    brightnessSlider.value = brightness;
  }

  async onDeviceDisconnect() {
    Notification.success("Device Disconnected!");

    const connectDeviceButton = document.getElementById('connectDeviceButton');

    // Change button back to "Connect Device"
    //connectDeviceButton.innerHTML = `<i class="fa-brands fa-usb"></i>`;
    connectDeviceButton.title = "Connect Device";
    connectDeviceButton.disabled = false;

    //connectDeviceButton.classList.remove('disconnect'); // Optional: Remove the disconnect styling

    this.editor.vortexPort.resetState();

    // lock and device info
    const deviceInfoPanel = document.getElementById('deviceInfoPanel');
    if (deviceInfoPanel && deviceInfoPanel.style.display !== 'none') {
      this.toggleDeviceInfo();
    }

    // Unlock the dropdown to allow device selection
    document.getElementById('deviceTypeSelected').classList.remove('locked');

    if (this.editor.detectMobile()) {
      document.getElementById('deviceInfoText').innerText = 'No device connected';
      document.getElementById('connectDeviceButton').disabled = false;
    }

    // unlock device selection
    this.lockDeviceSelection(false);
  }

  async onDeviceWaiting(deviceName) {
    console.log(`Waiting for ${deviceName}...`);
  }

  async onDeviceSelected(deviceName) {
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

    // Update and show the LED Select Panel
    await this.editor.ledSelectPanel.updateSelectedDevice(device);

    // dispatch the device change event with the device name and version
    if (notify) {
      this.deviceChangeNotification('select', this.selectedDevice, this.editor.vortexPort.version);
    }
  }

  lockDeviceSelection(locked) {
    const deviceTypeSelected = document.getElementById('deviceTypeSelected');
    if (locked) {
      deviceTypeSelected.classList.add('locked');
    } else {
      deviceTypeSelected.classList.remove('locked');
    }
  }

  isSelectionLocked() {
    const deviceTypeSelected = document.getElementById('deviceTypeSelected');
    if (!deviceTypeSelected) {
      return false;
    }
    // Prevent dropdown from opening if it's locked
    return deviceTypeSelected.classList.contains('locked');
  }
}

