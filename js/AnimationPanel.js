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
        update: value => lightshow.tickRate = value,
      },
      {
        id: 'trailSize',
        type: 'range',
        min: 1,
        max: 300,
        default: 100,
        label: 'Trail',
        update: value => lightshow.trailSize = value,
      },
      {
        id: 'dotSize',
        type: 'range',
        min: 5,
        max: 50,
        default: 25,
        label: 'Size',
        update: value => lightshow.dotSize = value,
      },
      {
        id: 'blurFac',
        type: 'range',
        min: 1,
        max: 10,
        default: 5,
        label: 'Blur',
        update: value => lightshow.blurFac = value,
      },
      {
        id: 'circleRadius',
        type: 'range',
        min: 0,
        max: 600,
        default: 400,
        label: 'Radius',
        update: value => lightshow.circleRadius = value,
      },
      {
        id: 'spread',
        type: 'range',
        min: 0,
        max: 100,
        default: 15,
        label: 'Spread',
        update: value => lightshow.spread = parseInt(value),
      },
    ];

    const content = `
      <h2>Animation Controls</h2>
      <div id="animationControls">
        ${AnimationPanel.generateControlsContent(controls)}
      </div>
      <div class="pull-tab" id="animationPullTab"><span>&#9664;</span></div>
    `;

    super('animationPanel', content);

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

  initialize() {
    const pullTab = document.getElementById('animationPullTab');
    const panelElement = document.getElementById('animationPanel');

    // Attach event listeners to controls
    this.controls.forEach(control => {
      const element = this.panel.querySelector(`#${control.id}`);
      element.addEventListener('input', event => {
        control.update(event.target.value);
      });
    });

    // Toggle visibility on pull tab click
    pullTab.addEventListener('click', () => {
      if (this.isVisible) {
        // Hide panel
        panelElement.classList.add('hidden');
        pullTab.innerHTML = '<span>&#9654;</span>';
      } else {
        // Show panel
        panelElement.classList.remove('hidden');
        pullTab.innerHTML = '<span>&#9664;</span>';
      }
      this.isVisible = !this.isVisible;
    });
  }
}

