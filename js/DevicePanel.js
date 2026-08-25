import Panel from './Panel.js';
import Notification from './Notification.js';
import Modal from  './Modal.js';
import { wikiUrl } from './wiki-url.js';

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
            <div id="brightnessLabelWrapper">
              <label for="brightnessSlider" id="brightnessLabel">Brightness Control</label>
            </div>
            <div id="brightnessSliderWrapper">
              <input type="range" id="brightnessSlider" min="0" max="255" step="1" value="255" />
              <i class="fa-solid fa-sun" id="brightnessIcon"></i>
            </div>
          </div>
          <div id="profileSelectContainer" style="display:none;">
            <label id="profileLabel">Chromadeck Profile</label>
            <div id="profileSelectWrapper">
              <div id="profileDropdown" class="custom-dropdown" title="Switch which profile the Chromadeck loads">
                <div id="profileSelected" class="custom-dropdown-select">Select Profile</div>
                <div id="profileOptions" class="custom-dropdown-options">
                  <!-- Profile options populated dynamically -->
                </div>
              </div>
              <input type="color" id="profileColorInput" class="profile-color-input" value="#ffffff" title="Edit the profile color" style="display:none;" />
            </div>
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
    this.wikiUrl = wikiUrl('/lightshow-lol/control-panels/device-controls');
    this.selectedDevice = 'None';
    this.multiLedWarningModal = new Modal('multiLedWarning');
    // the number of profiles matches half the number of leds on the chromadeck
    this.numProfiles = 10;
    this.currentProfile = 0;
    // profile colors pulled from the device (chromadeck only)
    this.profileColors = [];
    this.switchingProfiles = false;
    this.pendingColorDemo = null;
    this.savingProfileColor = false;
  }

  initialize() {
    // event listener for connect
    document.getElementById('connectDeviceButton').addEventListener('click', async () => {
      if (!this.editor.vortexPort.serialPort) {
        await this.connectDevice();
      }
    });

    // event listener for disconnect
    document.getElementById('disconnectDeviceButton').addEventListener('click', async () => {
      if (this.selectedDevice === 'Duo') {
        await this.editor.chromalinkPanel.disconnect();
        return;
      }
      await this.disconnectDevice();
      const deviceInfoPanel = document.getElementById('deviceInfoPanel');
      if (deviceInfoPanel) deviceInfoPanel.style.display = 'none';
    });


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

    // Custom drag handler to bypass Firefox's broken range drag coordinate calculation
    let dragActive = false;

    // range-input thumbs can't reach the very edges of the element box (they
    // stop ~half a thumb-width short), so map over the thumb's real travel
    // (box width minus thumb width). this keeps the far end at a true 255 so
    // the device reaches full brightness and re-clicking can't creep it higher.
    const THUMB_WIDTH = 16; // default range-input thumb width (px)

    const setSliderValue = (clientX) => {
      const rect = brightnessSlider.getBoundingClientRect();
      const track = Math.max(1, rect.width - THUMB_WIDTH);
      let val = Math.round(((clientX - rect.left - THUMB_WIDTH / 2) / track) * 255);
      val = Math.max(0, Math.min(255, val));
      brightnessSlider.value = val;
      return val;
    };

    const onDragEnd = () => {
      if (!dragActive) return;
      dragActive = false;
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      this.onBrightnessSliderChange({ target: brightnessSlider });
    };

    const onDragMove = (e) => {
      if (!dragActive) return;
      e.preventDefault();
      setSliderValue(e.clientX);
      this.onBrightnessSliderInput({ target: brightnessSlider });
    };

    brightnessSlider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      setSliderValue(e.clientX);
      this.onBrightnessSliderInput({ target: brightnessSlider });
      dragActive = true;
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
    });

    // Handle non-mouse changes (keyboard, accessibility)
    brightnessSlider.addEventListener('input', () => {
      if (dragActive) return;
      this.onBrightnessSliderInput({ target: brightnessSlider });
    });

    brightnessSlider.addEventListener('change', () => {
      if (dragActive) return;
      this.onBrightnessSliderChange({ target: brightnessSlider });
    });

    // profile selector (chromadeck only)
    const chromadeck = this.editor.devices?.['Chromadeck'];
    if (chromadeck?.ledCount) {
      this.numProfiles = Math.floor(chromadeck.ledCount / 2);
    }
    const profileOptions = document.getElementById('profileOptions');
    for (let i = 0; i < this.numProfiles; ++i) {
      const option = document.createElement('div');
      option.className = 'custom-dropdown-option profile-option';
      option.dataset.value = i;
      option.title = `Switch to Profile ${i + 1}`;
      option.innerHTML = `<span class="profile-option-label">Profile ${i + 1}</span><span class="profile-color-swatch"></span>`;
      profileOptions.appendChild(option);
    }
    document.getElementById('profileSelected').addEventListener('click', (event) => {
      if (event.currentTarget.classList.contains('locked')) return;
      profileOptions.classList.toggle('show');
    });
    profileOptions.addEventListener('click', async (event) => {
      const opt = event.target.closest('.profile-option');
      if (!opt || this.switchingProfiles) return;
      profileOptions.classList.remove('show');
      await this.switchProfile(parseInt(opt.dataset.value, 10));
    });

    // profile color editor (chromadeck only), demos the color on the device
    // while picking then saves it to the device when the picker is closed
    const profileColorInput = document.getElementById('profileColorInput');
    let lastColorDemoAt = 0;
    profileColorInput.addEventListener('input', () => {
      // only demo while actively picking, throttled so we don't flood the port
      const now = Date.now();
      if (now - lastColorDemoAt < 90) return;
      lastColorDemoAt = now;
      const { red, green, blue } = DevicePanel.hexToRgb(profileColorInput.value);
      this.startColorDemo(new this.editor.vortexLib.RGBColor(red, green, blue));
    });
    profileColorInput.addEventListener('change', async () => {
      await this.saveProfileColor();
    });
    this.setProfileVisible(false);

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
    let brightness = Number(event.target.value);
    // 0 is treated as "not set"/default on the device, so pin the floor at 1
    if (brightness < 1) {
      brightness = 1;
      if (event.target) event.target.value = brightness;
    }
    const percent = Math.round((brightness / 255) * 100);
    console.log(`[Brightness] set to ${brightness}/255 (${percent}%)`);
    const vortexLib = this.editor.vortexLib;
    const vortex = this.editor.lightshow.vortex;
    // use the chromalink to set the duo if we're connected to that
    const useChromalink = (this.selectedDevice === 'Duo');
    await this.editor.vortexPort.setBrightness(vortexLib, vortex, brightness, useChromalink);
    // then go back to demoing the mode
    await this.editor.demoModeOnDevice();
  }

  // call to disconnect the device
  async disconnectDevice() {
    if (!this.editor.vortexPort.serialPort && !this.editor.vortexPort.useBLE) {
      Notification.failure("No device connected test");
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
    // Change button to disabled
    const connectDeviceButton = document.getElementById('connectDeviceButton');
    connectDeviceButton.disabled = true;

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
      const deviceInfoPanel = document.getElementById('deviceInfoPanel');
      // only toggle-show if the panel is currently hidden; if disconnect didn't
      // clean up (eg. the ESPLoader ripped the port away without firing the
      // browser's serial disconnect event), toggling would shrink the panel and
      // move the modes list up, leaving it stuck behind the device controls
      if (deviceInfoPanel && (deviceInfoPanel.style.display === '' || deviceInfoPanel.style.display === 'none')) {
        this.toggleDeviceInfo(deviceBrightness);
      } else {
        // still update the slider even if no toggle needed
        const brightnessSlider = document.getElementById('brightnessSlider');
        if (brightnessSlider) brightnessSlider.value = deviceBrightness;
      }
    }

    // start reading and demo on device
    // not sure if this is actually necessary
    this.editor.vortexPort.startReading();
    await this.editor.demoModeOnDevice();

    // show device information on mobile
    if (this.editor.detectMobile()) {
      //const switchContainer = document.getElementById('duoSwitchContainer');
      //const switchButton = document.getElementById('switchDuoModeButton');
      //if (deviceName === 'Chromadeck') {
      //  switchContainer.style.display = 'flex';
      //  switchButton.addEventListener('click', async () => {
      //    if (this.selectedDevice === 'Duo') {
      //      await this.updateSelectedDevice('Chromadeck', true);
      //      Notification.success(`Switched back to Chromadeck Mode`);
      //    } else {
      //      if (this.editor.modesPanel.hasMultiLedPatterns()) {
      //        const confirmed = await this.confirmSwitchToDuo();
      //        if (!confirmed) {
      //          return;
      //        }
      //        this.editor.modesPanel.convertModesToSingle();
      //      }
      //      await this.updateSelectedDevice('Duo', true);
      //      Notification.success(`Switched to Duo Mode`);
      //    }
      //  });
      //} else {
      //  switchContainer.style.display = 'none';
      //}
    }

    document.getElementById('deviceInfoText').innerText = `${deviceName} (v${deviceVersion})`;
    const deviceInfoPanel = document.getElementById('deviceInfoPanel');
    if (deviceInfoPanel) {
      deviceInfoPanel.style.display = 'flex';
    }

    // show the profile selector for chromadeck firmware that
    // supports the profile switch command
    this.setProfileVisible(deviceName === 'Chromadeck' && this.editor.vortexPort.useNewProfileSwitch);

    // fetch the current profile from the device and sync the selector
    if (deviceName === 'Chromadeck' && this.editor.vortexPort.useNewGetProfile) {
      try {
        const profile = await this.editor.vortexPort.getProfile(this.editor.vortexLib);
        if (profile >= 0) {
          this.currentProfile = profile;
        }
      } catch {}
    }

    // pull the profile colors from the device and show the color editor
    // for chromadeck firmware that supports the profile color commands
    this.setProfileColorsVisible(deviceName === 'Chromadeck' && this.editor.vortexPort.useNewProfileColors);
    if (deviceName === 'Chromadeck' && this.editor.vortexPort.useNewProfileColors) {
      try {
        const colors = await this.editor.vortexPort.getProfileColors(this.editor.vortexLib);
        if (colors && colors.length) {
          this.profileColors = colors;
        }
      } catch {}
      this.applyProfileColorUI();
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
      this.propagateHeightChange(previousHeight, snappedPanels);
    }

    brightnessSlider.value = brightness;
  }

  // moves any snapped panels (eg. the modes list) when this panel grows or shrinks
  propagateHeightChange(previousHeight, snappedPanels) {
    const heightChange = this.panel.offsetHeight - previousHeight;
    if (heightChange === 0) return;
    snappedPanels.forEach((otherPanel) => {
      otherPanel.moveSnappedPanels(heightChange);
      const currentTop = parseFloat(otherPanel.panel.style.top || otherPanel.panel.getBoundingClientRect().top);
      otherPanel.panel.style.top = `${currentTop + heightChange}px`;
    });
  }

  async onDeviceDisconnect() {
    Notification.success("Device Disconnected!");

    const connectDeviceButton = document.getElementById('connectDeviceButton');

    // Change button back to "Connect Device"
    //connectDeviceButton.innerHTML = `<i class="fa-brands fa-usb"></i>`;
    connectDeviceButton.title = "Connect Device";
    connectDeviceButton.disabled = false;

    this.editor.vortexPort.resetState();

    // lock and device info
    const deviceInfoPanel = document.getElementById('deviceInfoPanel');
    if (deviceInfoPanel && deviceInfoPanel.style.display !== 'none') {
      this.toggleDeviceInfo();
    }

    // Unlock the dropdown to allow device selection
    document.getElementById('deviceTypeSelected').classList.remove('locked');

    document.getElementById('deviceInfoText').innerText = 'No device connected';
    document.getElementById('connectDeviceButton').disabled = false;

    // unlock device selection
    this.lockDeviceSelection(false);

    // hide the profile selector
    this.setProfileVisible(false);
    // reset and hide the profile color editor
    this.setProfileColorsVisible(false);
  }

  async onDeviceSelected(deviceName) {
    // if a non-chromadeck device is selected hide the profile selector
    if (deviceName === 'Chromadeck' && this.editor.vortexPort.isActive()) {
      // returning to the chromadeck from the duo needs to restore the selector
      this.setProfileVisible(this.editor.vortexPort.useNewProfileSwitch);
    } else if (deviceName !== 'Chromadeck') {
      this.setProfileVisible(false);
    }
  }

  setProfileVisible(visible) {
    const container = document.getElementById('profileSelectContainer');
    if (!container) return;
    const isVisible = container.style.display !== 'none';
    if (isVisible === visible) return;

    const previousHeight = this.panel.offsetHeight;
    const snappedPanels = this.getSnappedPanels();
    container.style.display = visible ? 'flex' : 'none';
    this.propagateHeightChange(previousHeight, snappedPanels);
  }

  async switchProfile(profile) {
    try {
      this.switchingProfiles = true;
      const success = await this.editor.vortexPort.switchProfile(this.editor.vortexLib, profile);
      if (success) {
        this.currentProfile = profile;
        this.setProfileLabel(profile);
        this.syncProfileColorInput();
        Notification.success(`Switched Chromadeck to Profile ${profile + 1}`);
      }
    } catch (error) {
      Notification.failure('Failed to switch profile: ' + error.message);
    } finally {
      this.switchingProfiles = false;
    }
  }

  setProfileColorsVisible(visible) {
    if (!visible) {
      this.profileColors = [];
    }
    ['profileColorInput'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? '' : 'none';
    });
  }

  // paints the profile swatches with their device colors and syncs the editor
  applyProfileColorUI() {
    for (let i = 0; i < this.numProfiles; ++i) {
      this.paintProfileOption(i);
    }
    this.setProfileLabel(this.currentProfile);
    this.syncProfileColorInput();
  }

  paintProfileOption(profile) {
    const swatch = document.querySelector(`#profileOptions .profile-option[data-value="${profile}"] .profile-color-swatch`);
    if (!swatch) return;
    const col = this.profileColors[profile];
    swatch.style.background = col ? `rgb(${col.red}, ${col.green}, ${col.blue})` : '';
  }

  // updates the collapsed dropdown selection text for the current profile
  setProfileLabel(profile) {
    const selected = document.getElementById('profileSelected');
    if (!selected || profile < 0 || profile >= this.numProfiles) return;
    selected.textContent = `Profile ${profile + 1}`;
  }

  // sets the editor input to the selected profile's saved color
  syncProfileColorInput() {
    const profileColorInput = document.getElementById('profileColorInput');
    if (!profileColorInput) return;
    const col = this.profileColors[this.currentProfile];
    if (col) {
      profileColorInput.value = DevicePanel.rgbToHex(col);
    }
  }

  // demos the picked color on the device while the picker is open, keeping
  // track of the in-flight demo so saving can wait for the port to be free
  startColorDemo(color) {
    const vortexPort = this.editor.vortexPort;
    if (!vortexPort.isActive() || vortexPort.isTransmitting) return;
    const demo = vortexPort.demoColor(this.editor.vortexLib, this.editor.vortex, color).catch(() => {});
    this.pendingColorDemo = demo;
  }

  async waitForColorDemo() {
    if (!this.pendingColorDemo) return;
    await Promise.race([
      this.pendingColorDemo,
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
    this.pendingColorDemo = null;
  }

  async saveProfileColor() {
    const profileColorInput = document.getElementById('profileColorInput');
    if (!profileColorInput || this.savingProfileColor) return;
    const profile = this.currentProfile;
    const { red, green, blue } = DevicePanel.hexToRgb(profileColorInput.value);
    try {
      this.savingProfileColor = true;
      // wait for any in-flight color demo to finish before sending
      await this.waitForColorDemo();
      const success = await this.editor.vortexPort.setProfileColor(this.editor.vortexLib, profile, { red, green, blue });
      if (success) {
        this.profileColors[profile] = { red, green, blue };
        this.paintProfileOption(profile);
        Notification.success(`Saved Color for Profile ${profile + 1}`);
      } else {
        Notification.failure(`Failed to Save Color for Profile ${profile + 1}`);
      }
    } catch (error) {
      console.error('Error saving profile color:', error);
    } finally {
      this.savingProfileColor = false;
      // go back to demoing the current mode
      await this.editor.demoModeOnDevice();
    }
  }

  static rgbToHex(col) {
    return `#${[col.red, col.green, col.blue].map(v => Number(v).toString(16).padStart(2, '0')).join('')}`;
  }

  static hexToRgb(hex) {
    const bigint = parseInt(String(hex).replace('#', ''), 16);
    return { red: (bigint >> 16) & 255, green: (bigint >> 8) & 255, blue: bigint & 255 };
  }

  async onDeviceWaiting(deviceName) {
    console.log(`Waiting for ${deviceName}...`);
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

