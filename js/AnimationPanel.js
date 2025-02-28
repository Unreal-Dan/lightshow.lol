import Panel from './Panel.js';

export default class AnimationPanel extends Panel {
  constructor(editor) {
    const controls = [
      {
        id: 'tickRate',
        type: 'range',
        min: 1,
        max: 30,
        default: 3,
        label: 'Speed',
        update: value => editor.lightshow.tickRate = value,
      },
      {
        id: 'trailSize',
        type: 'range',
        min: 1,
        max: 300,
        default: 100,
        label: 'Trail',
        update: value => editor.lightshow.trailSize = value,
      },
      {
        id: 'dotSize',
        type: 'range',
        min: 5,
        max: 50,
        default: 25,
        label: 'Size',
        update: value => editor.lightshow.dotSize = value,
      },
      {
        id: 'blurFac',
        type: 'range',
        min: 1,
        max: 10,
        default: 5,
        label: 'Blur',
        update: value => editor.lightshow.blurFac = value,
      },
      {
        id: 'circleRadius',
        type: 'range',
        min: 0,
        max: 600,
        default: 400,
        label: 'Radius',
        update: value => editor.lightshow.circleRadius = value,
      },
      {
        id: 'spread',
        type: 'range',
        min: 0,
        max: 100,
        default: 55,
        label: 'Spread',
        update: value => editor.lightshow.spread = parseInt(value),
      },
    ];

    const content = `
      <div class="animation-buttons-container">
        <button class="animation-button" id="renderCircleButton" title="Circle">
          <i class="fa fa-circle"></i>
        </button>
        <button class="animation-button" id="renderInfinityButton" title="Infinity">
          <i class="fa fa-infinity"></i>
        </button>
        <button class="animation-button" id="renderHeartButton" title="Heart">
          <i class="fa fa-heart"></i>
        </button>
        <button class="animation-button" id="renderBoxButton" title="Box">
          <i class="fa fa-square"></i>
        </button>
        <button class="animation-button" id="renderCursorButton" title="Cursor">
          <i class="fa-solid fa-arrow-pointer"></i>
        </button>
      </div>
      <!-- TODO: make this dropdown visible? -->
      <div id="animationPresetsContainer" style="display:none;">
        <label for="animationPresets">Presets:</label>
        <select id="animationPresets">
          <option value="default">Default</option>
          <option value="orbit">Orbit</option>
          <option value="handle">Handle</option>
          <option value="gloves">Gloves</option>
          <option value="chromadeck">Chromadeck</option>
          <option value="spark">Spark</option>
          <option value="duo">Duo</option>
        </select>
      </div>
      <div id="animationControls">
        ${AnimationPanel.generateControlsContent(controls)}
      </div>
    `;

    super('animationPanel', content, 'Animation');

    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.controls = controls;
    this.isVisible = true;
  }

  static generateControlsContent(controls) {
    return controls.map(control => `
      <div id="${control.id}_div">
        <input 
          type="${control.type}" 
          id="${control.id}" 
          min="${control.min}" 
          max="${control.max}" 
          value="${control.default}" 
          style="width: 80%;">
        <label for="${control.id}">${control.label}</label>
      </div>
    `).join('');
  }

  applyPreset(presetName) {
    const preset = presetName.toLowerCase();
    console.log("Applying preset: " + preset);
    const presets = {
      default: { tickRate: 3, trailSize: 100, dotSize: 25, blurFac: 5, circleRadius: 400, spread: 20 },
      none: { tickRate: 3, trailSize: 100, dotSize: 25, blurFac: 5, circleRadius: 400, spread: 20 },
      orbit: { tickRate: 10, trailSize: 100, dotSize: 8, blurFac: 2, circleRadius: 60, spread: 15 },
      handle: { tickRate: 10, trailSize: 200, dotSize: 20, blurFac: 3, circleRadius: 250, spread: 80 },
      gloves: { tickRate: 10, trailSize: 150, dotSize: 20, blurFac: 3, circleRadius: 100, spread: 40 },
      chromadeck: { tickRate: 10, trailSize: 100, dotSize: 10, blurFac: 3, circleRadius: 60, spread: 20 },
      spark: { tickRate: 10, trailSize: 180, dotSize: 16, blurFac: 3, circleRadius: 80, spread: 60 },
      duo: { tickRate: 10, trailSize: 200, dotSize: 20, blurFac: 3, circleRadius: 250, spread: 80 },
    };

    if (presets[preset]) {
      Object.entries(presets[preset]).forEach(([id, value]) => {
        const control = this.controls.find(c => c.id === id);
        if (control) {
          const element = this.panel.querySelector(`#${id}`);
          element.value = value;
          control.update(value);
        }
      });
    }
  }

  initialize() {
    const panelElement = document.getElementById('animationPanel');

    // Attach event listeners to controls
    this.controls.forEach(control => {
      const element = this.panel.querySelector(`#${control.id}`);
      element.addEventListener('input', event => {
        control.update(event.target.value);
      });
    });

    // Attach event listener to preset dropdown
    const presetDropdown = this.panel.querySelector('#animationPresets');
    presetDropdown.addEventListener('change', (event) => {
      this.applyPreset(event.target.value);
    });

    document.addEventListener('deviceChange', this.handleDeviceEvent.bind(this));

    // Attach event listeners to shape buttons
    this.attachShapeButtonListeners();

    // hide the spread slider
    this.toggleSpreadSlider(false);

    // animation panel starts collapsed, don't move panels below when collapsing it
    this.toggleCollapse(false);
  }

  applyMobileLayout() {
    const tabContainer = document.querySelector('.mobile-panel-content');
    if (!tabContainer) return;

    // Append the panel to the mobile panel container
    tabContainer.appendChild(this.panel);

    // Remove unnecessary borders and set transparent background
    this.panel.style.border = 'none';
    this.panel.style.backgroundColor = 'transparent';

    // Calculate the available height for the panel
    const viewportHeight = window.innerHeight;
    const tabContainerRect = tabContainer.getBoundingClientRect();
    const availableHeight = viewportHeight - tabContainerRect.top;

    // Set the panel height to fit the remaining space
    this.panel.style.height = `${availableHeight}px`;

    // Adjust the height of the content area
    const buttonsContainer = this.panel.querySelector('.animation-buttons-container');
    const buttonsHeight = buttonsContainer ? buttonsContainer.offsetHeight : 0;

    const controls = this.panel.querySelector('#animationControls');
    const controlsHeight = availableHeight - buttonsHeight - 20; // Adjust for padding/margins
    controls.style.flex = '1';
    controls.style.height = `${controlsHeight}px`;
    controls.style.overflowY = 'auto'; // Scrollable if necessary
    controls.style.paddingBottom = '10px'; // Fix bottom spacing issue
  }

  showSpreadSlider() {
    const spreadDiv = document.getElementById('spread_div');
    if (spreadDiv.style.display === 'none') {
      this.toggleSpreadSlider();
    }
  }

  hideSpreadSlider() {
    const spreadDiv = document.getElementById('spread_div');
    if (spreadDiv.style.display !== 'none') {
      this.toggleSpreadSlider();
    }
  }

  toggleSpreadSlider(propagate = true) {
    const animationPanel = document.getElementById('animationPanel');
    const spreadDiv = document.getElementById('spread_div');

    // Step 1: Capture the previous height and identify snapped panels
    const previousHeight = animationPanel.offsetHeight;
    const snappedPanels = this.getSnappedPanels(); // Identify panels based on the current height

    // Step 2: Toggle the visibility
    const isHidden = (spreadDiv.style.display === 'none');

    // Update the toggle button icon
    if (isHidden) {
      spreadDiv.style.display = 'block';
    } else {
      spreadDiv.style.display = 'none';
    }

    // need to re-apply the spread value now
    const element = this.panel.querySelector('#spread');
    const control = this.controls.find(c => c.id === 'spread');
    control.update(element.value);

    if (propagate) {
      // Step 3: Calculate the new height
      const heightChange = animationPanel.offsetHeight - previousHeight;
      // Step 4: Move snapped panels after the height change
      snappedPanels.forEach((otherPanel) => {
        otherPanel.moveSnappedPanels(heightChange);
        const currentTop = parseFloat(otherPanel.panel.style.top || otherPanel.panel.getBoundingClientRect().top);
        otherPanel.panel.style.top = `${currentTop + heightChange}px`;
      });
    }
  }

  attachShapeButtonListeners() {
    const shapes = [
      { id: 'renderCircleButton', shape: 'circle', label: 'Circle' },
      { id: 'renderInfinityButton', shape: 'figure8', label: 'Infinity' },
      { id: 'renderHeartButton', shape: 'heart', label: 'Heart' },
      { id: 'renderBoxButton', shape: 'box', label: 'Box' },
      { id: 'renderCursorButton', shape: 'cursor', label: 'Cursor' },
    ];

    shapes.forEach(({ id, shape, label }) => {
      const button = this.panel.querySelector(`#${id}`);
      button.addEventListener('click', () => {
        this.lightshow.setShape(shape);
        this.lightshow.angle = 0; // Reset angle
      });
    });
  }

  async onDeviceConnect(deviceName) {
    // display the spread slider
    this.showSpreadSlider();
    this.applyPreset(deviceName);
  }

  async onDeviceDisconnect(deviceName) {
    // nothing yet
  }

  async onDeviceSelected(deviceName) {
    // nothing yet
    if (deviceName === 'None') {
      this.hideSpreadSlider();
    } else {
      this.showSpreadSlider();
    }
    this.applyPreset(deviceName);
  }
}

