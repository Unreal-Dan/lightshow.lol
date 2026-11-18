/* Tutorial.js
 *
 * Guided tour of the editor panels. Each step brings its panel into view,
 * rings the control to use and shows a small card with what to do. Steps
 * move on by themselves once the user does the thing (picks a device,
 * clicks a mode, ...), and Next/Back always work too.
 */

const RING_PAD = 6;
const CARD_GAP = 14;
const AUTO_ADVANCE_MS = 700;

// the tours offered in the picker, in order
const TOURS = {
  make: {
    icon: 'fa-solid fa-wand-magic-sparkles',
    title: 'Make a mode',
    desc: 'Design a mode from scratch. No device needed.',
  },
  device: {
    icon: 'fa-brands fa-usb',
    title: 'Edit your device\'s modes',
    desc: 'Connect a device, load its modes, edit them and save them back.',
  },
  chromalink: {
    icon: 'fa-solid fa-link',
    title: 'Chromalink a Duo',
    desc: 'Use a Chromadeck and the Chromalink to edit a Duo\'s modes.',
  },
};

export default class Tutorial {
  constructor(editor) {
    this.editor = editor;
    this.index = -1;
    this.active = false;
    this.flags = {};
    this._raf = null;
    this._advanceTimer = null;
    this._renderedKey = '';

    this._onClick = this._onClick.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onGestureDown = this._onGestureDown.bind(this);
    this._onGestureUp = this._onGestureUp.bind(this);
    this._onEvent = this._onEvent.bind(this);
    this._onKey = this._onKey.bind(this);
    this._tick = this._tick.bind(this);
  }

  // ── state helpers ──

  get isConnected() {
    const pull = document.getElementById('pullFromDeviceButton');
    return !!pull && !pull.disabled;
  }

  get hasDevice() {
    const d = this.editor.devicePanel.selectedDevice;
    return !!d && d !== 'None';
  }

  get numModes() {
    try { return this.editor.vortex.numModes(); } catch { return 0; }
  }

  _ledCount() {
    try { return (this.editor.ledSelectPanel.getSelectedLeds() || []).length; } catch { return 0; }
  }

  _mainLed() {
    try { return this.editor.ledSelectPanel.getMainSelectedLed(); } catch { return null; }
  }

  // the "this mode was made for a different device" prompt
  get convertOpen() {
    const m = document.getElementById('modal_conversion');
    return !!m && getComputedStyle(m).display !== 'none';
  }

  get pickerOpen() {
    const p = this.editor.colorPickerPanel;
    return !!p && p.isVisible && !this.isMobile;
  }

  get isMobile() {
    return this.editor.detectMobile();
  }

  // ── steps ──
  //
  // A step: { title, text, panel, target, require, requireHint, done,
  // clicks, events, optional }. title/text/target may be functions so they
  // can change while the step is open (e.g. once a device connects).

  get usb() {
    return this.isMobile ? 'pair it over Bluetooth' : 'plug it in over USB';
  }

  // every tour opens by explaining the panels that frame the editor
  introSteps(intro) {
    const ed = this.editor;
    return [
      { title: () => TOURS[this.tourKey].title, text: () => intro },
      {
        title: 'The preview and Animation panel',
        panel: () => ed.animationPanel,
        target: () => '#animationPanel',
        text: () => 'The lights in the middle of the screen are a live preview of the selected mode. '
          + 'The <b>Animation</b> panel only changes how that preview is drawn: speed, trail length, dot size, '
          + 'and the shape it traces (circle, heart, box...). None of it is saved to your device.',
      },
      {
        title: 'Arrange your workspace',
        panel: () => ed.layoutPanel,
        target: () => '#layoutPanel',
        text: () => 'The <b>Layout</b> panel picks how the editor panels are arranged: floating, docked to the '
          + 'sides or stacked. You can also drag any panel by its header to move or dock it, then save your '
          + 'arrangement as a custom layout.',
      },
      {
        title: 'Help & About',
        panel: () => ed.aboutPanel,
        target: () => '#aboutPanel',
        text: () => '<b>Wiki</b> opens the full guide, <b>Community</b> opens the site where people share modes, '
          + 'and <b>Welcome</b> brings back the welcome panel and these tours. '
          + 'You can also right-click any panel and choose <b>Help</b> to read about just that panel.',
      },
    ];
  }

  pickDeviceStep() {
    const ed = this.editor;
    return {
      title: 'Pick your device',
      panel: () => ed.devicePanel,
      target: () => '#deviceTypeContainer',
      text: () => 'Choose which device to design for from this list. The preview switches to that device\'s '
        + 'LEDs. No device needs to be plugged in for this.',
      require: () => this.hasDevice,
      requireHint: 'Pick a device to continue',
      done: () => this.hasDevice,
    };
  }

  connectStep({ title = 'Connect your device', device = null, text } = {}) {
    const ed = this.editor;
    const ok = () => this.isConnected && (!device || ed.vortexPort.name === device);
    return {
      title,
      panel: () => ed.devicePanel,
      target: () => '#connectDeviceButton',
      text: () => (ok()
        ? `Your <b>${ed.vortexPort.name || ed.devicePanel.selectedDevice}</b> is connected.`
        : text || `Turn your device on, click the connect button and ${this.usb}. `
          + 'Your browser will ask which device to use.'),
      require: ok,
      requireHint: `Connect ${device ? `a ${device}` : 'a device'} to continue`,
      done: ok,
    };
  }

  pullStep(what = 'device') {
    const ed = this.editor;
    return {
      title: 'Load the modes',
      panel: () => ed.modesPanel,
      target: () => '#pullFromDeviceButton',
      text: () => `Click <b>Load Modes from Device</b> to bring the modes on your ${what} into the Modes List, `
        + 'so you can edit them here.',
      clicks: '#pullFromDeviceButton',
      done: () => this.flags.clicked,
    };
  }

  editSteps() {
    const ed = this.editor;
    return [
      {
        title: 'Select a mode',
        panel: () => ed.modesPanel,
        target: () => '#modesListContainer',
        text: () => 'Click a mode in the list to edit it. The selected mode plays in the preview, '
          + 'and every change from here on applies to it.',
        clicks: '#modesListContainer .mode-entry',
        done: () => this.flags.clicked,
      },
      // ── LED selection, one hands-on step per technique ──
      ...this.ledSteps(),
      {
        title: 'Change the colors',
        panel: () => ed.colorsetPanel,
        // follow the color picker when it opens so the card sits beside it
        target: () => (this.pickerOpen ? '#colorPickerPanel' : '#colorsetPanel'),
        wikiPanel: () => (this.pickerOpen ? ed.colorPickerPanel : ed.colorsetPanel),
        // don't leave the picker floating over the next steps
        require: () => !this.pickerOpen,
        requireHint: 'Close the color picker to continue',
        text: () => (this.pickerOpen
          ? 'Drag in the square and the hue bar or ring, or type a value, to change this color. '
            + 'Every <span class="tutorial-led yellow"></span><b>selected</b> LED gets the change as you go. '
            + 'Colors you pick are kept under <b>Recent</b> so you can reuse them. Close the picker (<b>×</b>) when you\'re happy to continue.'
          : 'This is the colorset: the colors the pattern cycles through. It shows the '
          + '<span class="tutorial-led green"></span><b>source</b> LED\'s colors, and a change goes to every '
          + '<span class="tutorial-led yellow"></span><b>selected</b> LED too, giving them a copy of the source\'s colors. '
          + 'Click a color to change it, click <b>+</b> to add one, or click the <b>down arrow</b> under the colors to open the random generator. '
          + 'Click <b>Next</b> when you like it.'),
      },
      {
        title: 'Pick a pattern',
        panel: () => ed.patternPanel,
        target: () => '#patternDropdownContainer',
        text: () => 'The pattern decides how the colors blink, strobe and blend. Pick one from the list and watch the preview; '
          + 'it goes to the <span class="tutorial-led green"></span><b>source</b> and every '
          + '<span class="tutorial-led yellow"></span><b>selected</b> LED. '
          + 'The built-in patterns are usually all you need; fine-tuning their timing under the arrow is an optional, advanced extra.',
        events: ['patternChange'],
        done: () => this.flags.event,
      },
      {
        title: 'Try a community mode',
        optional: true,
        panel: () => ed.communityBrowserPanel,
        // follow the "made for a different device" prompt when it opens
        target: () => (this.convertOpen ? '#modal_conversion .modal-content' : '#communityBrowserPanel'),
        text: () => (this.convertOpen
          ? 'This mode was made for a different device, so choose how to load it:'
            + '<ul><li><b>Switch</b> changes your selected device to the one it was made for, so you see it exactly as made.</li>'
            + '<li><b>Convert</b> keeps your selected device and adapts the mode to run on it.</li></ul>'
          : 'Want ideas? Click any mode here to load it into the selected mode. Modes made for '
            + 'any device work: one made on a different device is converted to run on your selected device. '
            + 'The device filter buttons narrow the list if you only want modes from one. '
            + 'Right-click one to add it as a new mode instead. This step is optional, click <b>Next</b> to skip.'),
        clicks: '#communityBrowserPanel .vcb-entry',
        require: () => !this.convertOpen,
        requireHint: 'Choose Switch or Convert to continue',
        // wait for the prompt to be answered before moving on
        done: () => this.flags.clicked && !this.convertOpen,
      },
    ];
  }

  // A run of short steps that each make the user try one way of selecting
  // LEDs. Every step needs its action done before Next unlocks. A mode with
  // a multi-LED pattern can't have single LEDs picked, so it gets one
  // explanation step instead.
  ledSteps() {
    const ed = this.editor;
    const multi = () => {
      try { return ed.ledSelectPanel.isCurModeMultiLed(); } catch { return false; }
    };
    const single = () => !multi();
    const g = () => this.flags.gesture; // last press-and-release in the panel
    const green = '<span class="tutorial-led green"></span>';
    const yellow = '<span class="tutorial-led yellow"></span>';
    const base = {
      panel: () => ed.ledSelectPanel,
      target: () => '#ledSelectPanel',
      wikiPanel: () => ed.ledSelectPanel,
    };
    const step = (o) => ({ ...base, when: single, ...o, require: o.done });
    return [
      {
        ...base,
        title: 'Choose LEDs',
        when: single,
        text: () => 'Every LED can have its own colors and pattern. Here you pick which LEDs to edit; '
          + 'the next steps change their colors and pattern.'
          + `<ul><li>${green}<b>Source</b>: the Colorset and Pattern panels show this LED\'s colors and pattern.</li>`
          + `<li>${yellow}<b>Selected</b>: LEDs that get the same changes as the source.</li></ul>`
          + 'Next, try each way of selecting.',
      },
      step({
        title: 'Deselect everything',
        text: () => '<b>Click empty space</b> around the device, anywhere that isn\'t an LED, to deselect every LED. '
          + 'The <b>None</b> button does the same.',
        requireHint: 'Deselect all LEDs to continue',
        done: () => this._ledCount() === 0,
      }),
      step({
        title: 'Select one LED',
        text: () => `<b>Click any LED.</b> It turns ${green}<b>green</b>: it\'s now the source, and the only LED you\'re editing.`,
        requireHint: () => (this._ledCount() > 1 ? 'Click just one LED' : 'Click an LED to continue'),
        done: () => !!g() && this._ledCount() === 1,
      }),
      step({
        title: 'Drag a box',
        text: () => '<b>Press and drag</b> across the device to draw a box. Every LED inside it is selected: '
          + `the first one becomes the ${green}source and the rest turn ${yellow}<b>yellow</b>.`,
        requireHint: 'Drag a box over two or more LEDs',
        done: () => !!g() && g().drag && this._ledCount() >= 2,
      }),
      step({
        title: 'Add LEDs with Shift',
        text: () => 'Hold <b>Shift</b> and click an LED that isn\'t selected to add it without losing the others. '
          + 'Shift + drag adds a whole box.',
        requireHint: 'Shift + click an unselected LED',
        done: () => !!g() && g().shift && this._ledCount() > g().before,
      }),
      step({
        title: 'Remove LEDs with Ctrl',
        text: () => 'Hold <b>Ctrl</b> and click a selected LED to remove it from the selection. '
          + 'Ctrl + drag removes a whole box.',
        requireHint: () => (this._ledCount() === 0 ? 'Keep at least one LED selected' : 'Ctrl + click a selected LED'),
        done: () => !!g() && g().ctrl && this._ledCount() < g().before && this._ledCount() > 0,
      }),
      step({
        title: 'Choose the source',
        text: () => `Click a ${yellow}<b>yellow</b> LED that\'s already selected. It becomes the ${green}source, `
          + 'so the Colorset and Pattern panels show its colors and pattern, and the rest stay selected. '
          + 'You can also use <b>All</b>, <b>Invert</b>, <b>Evens</b> and <b>Odds</b> at any time.',
        requireHint: () => (this._ledCount() < 2 ? 'Shift + click to select two or more LEDs first' : 'Click a yellow LED'),
        done: () => !!g() && !g().drag && this._ledCount() >= 2 && this._ledCount() === g().before
          && this._mainLed() !== g().main,
      }),
      {
        ...base,
        title: 'Choose LEDs',
        when: multi,
        text: () => 'This mode uses a <b>multi-LED</b> pattern, which plays across all of the LEDs together, so every LED '
          + `shows as the ${green}source and single LEDs can't be picked. Click <b>Next</b>; you'll change the colors `
          + 'and pattern for the whole device. Pick a single-LED pattern in the Pattern step to choose LEDs one by one.',
      },
    ];
  }

  pushStep(what = 'device') {
    const ed = this.editor;
    return {
      title: `Save to your ${what}`,
      panel: () => ed.modesPanel,
      target: () => '#pushToDeviceButton',
      text: () => `Click <b>Save Modes to Device</b> to send the whole Modes List to your ${what}. `
        + 'This replaces the modes that were on it.',
      clicks: '#pushToDeviceButton',
      done: () => this.flags.clicked,
    };
  }

  buildSteps(key) {
    const ed = this.editor;
    if (key === 'make') {
      return [
        ...this.introSteps('Learn the editor by making a mode from scratch. You don\'t need a device for this one. '
          + 'Each step moves on once you do it, or use <b>Next</b> to skip ahead.'),
        this.pickDeviceStep(),
        {
          title: 'Create a mode',
          panel: () => ed.modesPanel,
          target: () => '#addModeButton',
          text: () => 'Click <b>+</b> to add a new mode. Each mode is one light show your device can switch between.'
            + (this.numModes > 0 ? ' Already have modes? Just click <b>Next</b>.' : ''),
          clicks: '#addModeButton',
          done: () => this.flags.clicked,
        },
        ...this.editSteps(),
        {
          title: 'You made a mode',
          text: () => 'That\'s the whole loop: select a mode, choose LEDs, then set colors and a pattern. '
            + 'When you have your device handy, take the <b>Edit your device\'s modes</b> tour to save modes onto it.',
        },
      ];
    }
    if (key === 'device') {
      return [
        ...this.introSteps('Connect your device, load the modes on it, change them and save them back. '
          + 'Have your device and its cable ready. Each step moves on once you do it.'),
        this.connectStep(),
        this.pullStep(),
        ...this.editSteps(),
        this.pushStep(),
        {
          title: 'You\'re all set',
          text: () => 'Your device now has your edited modes. Keep tweaking and save again any time. '
            + 'Check <b>Device Updates</b> now and then for new firmware.',
        },
      ];
    }
    // chromalink
    return [
      ...this.introSteps('A Duo can\'t be plugged into a computer, but with a <b>Chromadeck</b> and the '
        + '<b>Chromalink</b> dock you can edit its modes here. Have both ready. Each step moves on once you do it.'),
      this.connectStep({
        title: 'Connect the Chromadeck',
        device: 'Chromadeck',
        text: `Turn on your Chromadeck, click the connect button and ${this.usb}.`,
      }),
      {
        title: 'Dock the Duo',
        panel: () => ed.chromalinkPanel,
        target: () => '#chromalinkPanel',
        text: () => 'Plug the <b>Chromalink</b> into the Chromadeck and seat the Duo in the dock. '
          + 'The Chromadeck talks to the Duo for you through the Chromalink. Click <b>Next</b> once it\'s in.',
      },
      {
        title: 'Link the Duo',
        panel: () => ed.chromalinkPanel,
        target: () => '#chromalinkConnect',
        text: () => (ed.chromalinkPanel.isConnected
          ? 'The Duo is linked. The panel shows its firmware version and how many modes it has.'
          : 'Click <b>Connect</b>. The editor switches to the Duo and shows its version and mode count. '
            + 'If it says an update is available, <b>Update</b> flashes the latest Duo firmware.'),
        require: () => ed.chromalinkPanel.isConnected,
        requireHint: 'Link the Duo to continue',
        done: () => ed.chromalinkPanel.isConnected,
      },
      this.pullStep('Duo'),
      ...this.editSteps(),
      this.pushStep('Duo'),
      {
        title: 'You\'re all set',
        text: () => 'Your Duo now has your edited modes. Click <b>Disconnect</b> in the Chromalink panel '
          + 'to go back to editing the Chromadeck\'s own modes, then dock the next Duo.',
      },
    ];
  }

  // ── lifecycle ──

  // open the tour picker
  start() {
    if (this.active) this.stop();
    this.active = true;
    this._build();
    document.addEventListener('click', this._onClick, true);
    document.addEventListener('pointerdown', this._onPointerDown, true);
    document.addEventListener('pointerdown', this._onGestureDown, true);
    document.addEventListener('pointerup', this._onGestureUp, true);
    document.addEventListener('ledsChange', this._onEvent);
    document.addEventListener('patternChange', this._onEvent);
    document.addEventListener('keydown', this._onKey);
    this.showPicker();
    this._raf = requestAnimationFrame(this._tick);
  }

  showPicker() {
    this._restorePanel();
    clearTimeout(this._advanceTimer);
    this._advanceTimer = null;
    this.tourKey = null;
    this.steps = null;
    this.index = -1;
    this._renderedKey = '';
    this.card.classList.add('picking');
    this.card.querySelector('.tutorial-wiki').style.display = 'none';
    this.card.querySelector('.tutorial-count').textContent = 'Guided tours';
    this.card.querySelector('.tutorial-title').textContent = 'Which tour do you want?';
    this.card.querySelector('.tutorial-text').innerHTML = Object.entries(TOURS).map(([key, t]) => `
      <button class="tutorial-choice" data-tour="${key}">
        <i class="${t.icon}"></i>
        <span><b>${t.title}</b><small>${t.desc}</small></span>
      </button>`).join('');
    for (const btn of this.card.querySelectorAll('.tutorial-choice')) {
      btn.addEventListener('click', () => this.startTour(btn.dataset.tour));
    }
  }

  startTour(key) {
    this.tourKey = key;
    this.steps = this.buildSteps(key);
    this.card.classList.remove('picking');
    this.go(0);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this._advanceTimer);
    cancelAnimationFrame(this._raf);
    document.removeEventListener('click', this._onClick, true);
    document.removeEventListener('pointerdown', this._onPointerDown, true);
    document.removeEventListener('pointerdown', this._onGestureDown, true);
    document.removeEventListener('pointerup', this._onGestureUp, true);
    document.removeEventListener('ledsChange', this._onEvent);
    document.removeEventListener('patternChange', this._onEvent);
    document.removeEventListener('keydown', this._onKey);
    this._restorePanel();
    this.ring?.remove();
    this.card?.remove();
    this.ring = this.card = null;
  }

  go(index, dir = 1) {
    clearTimeout(this._advanceTimer);
    this._advanceTimer = null;
    // skip steps that don't apply right now (e.g. LED picking on a multi-LED mode)
    while (index >= 0 && index < this.steps.length && this.steps[index].when && !this.steps[index].when()) {
      index += dir;
    }
    if (index < 0) index = 0;
    if (index >= this.steps.length) {
      this.stop();
      return;
    }
    this.index = index;
    this.flags = {};
    const step = this.steps[index];
    if (step.onEnter) step.onEnter();
    // a step that is already satisfied when it opens shouldn't skip itself
    this.wasDone = !!(step.done && step.done());
    this._revealPanel(step.panel && step.panel());
    this._renderedKey = '';
    this._render();
    // the panel may animate open; place things once it has settled
    setTimeout(() => this._scrollTargetIntoView(), 250);
  }

  next() { this.go(this.index + 1); }
  // Back from a tour's first step returns to the picker
  back() {
    if (this.index <= 0) this.showPicker();
    else this.go(this.index - 1, -1);
  }

  // ── events ──

  _onClick(e) {
    const step = this.steps?.[this.index];
    if (!step || !step.clicks) return;
    if (this.card && this.card.contains(e.target)) return;
    if (e.target.closest && e.target.closest(step.clicks)) this.flags.clicked = true;
  }

  // pointerdown (not click) so a box-drag that ends outside the panel counts
  _onPointerDown(e) {
    const step = this.steps?.[this.index];
    if (!step || !step.touches) return;
    if (e.target.closest && e.target.closest(step.touches)) this.flags.touched = true;
  }

  // remember how each press in the LED panel went (drag? shift? ctrl?) and
  // what the selection was before it, so steps can check the result
  _onGestureDown(e) {
    if (!this.steps || !e.target.closest || !e.target.closest('#ledSelectPanel')) return;
    this._press = { x: e.clientX, y: e.clientY, before: this._ledCount(), main: this._mainLed() };
  }

  _onGestureUp(e) {
    const p = this._press;
    this._press = null;
    if (!p || !this.steps) return;
    this.flags.gesture = {
      drag: Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4,
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      before: p.before,
      main: p.main,
    };
  }

  _onEvent(e) {
    const step = this.steps?.[this.index];
    if (step && step.events && step.events.includes(e.type)) this.flags.event = true;
  }

  _onKey(e) {
    if (e.key === 'Escape') this.stop();
  }

  _tick() {
    if (!this.active) return;
    if (!this.steps) {
      // picker: centered, nothing ringed
      this._position();
      this._raf = requestAnimationFrame(this._tick);
      return;
    }
    const step = this.steps[this.index];
    this._render();
    this._position();
    // move on once the step's action happens (only if it wasn't already done)
    if (step.done && !step.manual && !this._advanceTimer) {
      const done = step.done();
      if (done && !this.wasDone) {
        this._advanceTimer = setTimeout(() => this.next(), AUTO_ADVANCE_MS);
      } else if (!done) {
        this.wasDone = false;
      }
    }
    this._raf = requestAnimationFrame(this._tick);
  }

  // ── panels ──

  // put back a panel the previous step expanded, unless it's needed again
  _restorePanel(keep = null) {
    const dm = this.editor.dockManager;
    if (this._keptOpen && dm && this._keptOpen !== keep) {
      dm.setKeepOpen(this._keptOpen.panel.id, false);
      this._keptOpen = null;
    }
    const p = this._expanded;
    this._expanded = null;
    if (!p || p === keep) {
      if (p) this._expanded = p;
      return;
    }
    // instantly: animating this shut while the next panel animates open made
    // a floating stack briefly overflow, and the dock's auto-collapse then
    // shut the panel we were trying to show
    if (!this.isMobile && !p.isCollapsed) p.setCollapsed(true, true);
  }

  _revealPanel(panel) {
    this._restorePanel(panel);
    if (!panel) return;
    const ed = this.editor;
    if (this.isMobile) {
      ed.setActiveTab(panel.panel.id);
      return;
    }
    const dm = ed.dockManager;
    // never let overflow handling collapse the panel this step is about
    if (dm) {
      dm.setKeepOpen(panel.panel.id, true);
      this._keptOpen = panel;
    }
    if (!panel.isVisible) panel.show();
    if (panel.isCollapsed) {
      panel.setCollapsed(false);
      this._expanded = panel; // collapse it again when the step ends
    }
    if (dm && dm.panels.get(panel.panel.id)?.floating) {
      dm._bringFloatingToFront(panel.panel);
    }
  }

  // the wiki page for the panel this step explains (steps can override with
  // `wikiPanel`, or opt out with `wikiPanel: () => null`)
  _wiki() {
    const step = this.steps?.[this.index];
    if (!step) return null;
    const panel = step.wikiPanel ? step.wikiPanel() : step.panel && step.panel();
    if (!panel || !panel.wikiUrl) return null;
    const title = panel.panel.title;
    return { url: panel.wikiUrl, title, label: panel.wikiLabel || `The ${title} panel on the wiki` };
  }

  _targetEl() {
    const step = this.steps?.[this.index];
    if (!step || !step.target) return null;
    const el = document.querySelector(step.target());
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? el : null;
  }

  _scrollTargetIntoView() {
    const el = this._targetEl();
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ── DOM ──

  _build() {
    this.ring = document.createElement('div');
    this.ring.className = 'tutorial-ring';
    this.card = document.createElement('div');
    this.card.className = 'tutorial-card';
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-live', 'polite');
    this.card.innerHTML = `
      <div class="tutorial-top">
        <span class="tutorial-count"></span>
        <button class="tutorial-wiki"><i class="fa-solid fa-book-open"></i>Read more</button>
        <button class="tutorial-close" title="End tour (Esc)" aria-label="End tour">×</button>
      </div>
      <div class="tutorial-title"></div>
      <div class="tutorial-text"></div>
      <div class="tutorial-dots"></div>
      <div class="tutorial-nav">
        <button class="tutorial-back">Back</button>
        <span class="tutorial-hint"></span>
        <button class="tutorial-next">Next</button>
      </div>`;
    this.card.querySelector('.tutorial-close').addEventListener('click', () => this.stop());
    this.card.querySelector('.tutorial-wiki').addEventListener('click', () => {
      const w = this._wiki();
      if (w) this.editor.showHelpPopup(w.url, `${w.title} — Wiki`);
    });
    this.card.querySelector('.tutorial-back').addEventListener('click', () => this.back());
    this.card.querySelector('.tutorial-next').addEventListener('click', () => this.next());
    document.body.append(this.ring, this.card);
  }

  _render() {
    const step = this.steps[this.index];
    const val = (v) => (typeof v === 'function' ? v() : v);
    const title = val(step.title);
    const text = val(step.text);
    const blocked = step.require ? !step.require() : false;
    const done = step.done ? step.done() : false;
    const wiki = this._wiki();
    const hint = typeof step.requireHint === 'function' ? step.requireHint() : step.requireHint;
    const key = [this.index, title, text, blocked, done, wiki && wiki.url, hint].join('|');
    if (key === this._renderedKey) return;
    this._renderedKey = key;

    const last = this.index === this.steps.length - 1;
    const c = this.card;
    c.querySelector('.tutorial-count').textContent = `Step ${this.index + 1} of ${this.steps.length}`
      + (step.optional ? ' · optional' : '');
    c.querySelector('.tutorial-title').textContent = title;
    c.querySelector('.tutorial-text').innerHTML = text;
    const wikiBtn = c.querySelector('.tutorial-wiki');
    wikiBtn.style.display = wiki ? '' : 'none';
    if (wiki) {
      wikiBtn.title = wiki.label;
      wikiBtn.setAttribute('aria-label', wiki.label);
    }
    c.querySelector('.tutorial-dots').innerHTML = this.steps
      .map((_, i) => `<i class="${i < this.index ? 'past' : i === this.index ? 'now' : ''}"></i>`).join('');
    c.querySelector('.tutorial-back').textContent = this.index === 0 ? 'All tours' : 'Back';
    const nextBtn = c.querySelector('.tutorial-next');
    nextBtn.textContent = this.index === 0 ? 'Start' : last ? 'Finish' : 'Next';
    nextBtn.disabled = blocked;
    c.querySelector('.tutorial-hint').innerHTML = blocked
      ? (typeof step.requireHint === 'function' ? step.requireHint() : step.requireHint) || ''
      : done && step.done ? '<i class="fa-solid fa-check"></i> Done' : '';
  }

  _position() {
    const card = this.card;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = this._targetEl();
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;

    if (!el) {
      this.ring.style.display = 'none';
      card.style.left = `${Math.round((vw - cw) / 2)}px`;
      card.style.top = `${Math.round((vh - ch) / 2)}px`;
      return;
    }

    const r = el.getBoundingClientRect();
    // clamp the ring to the viewport so a tall panel still reads as ringed
    // (1px in from the screen edge, so a panel touching the edge still lines up)
    const top = Math.max(1, r.top - RING_PAD);
    const left = Math.max(1, r.left - RING_PAD);
    const bottom = Math.min(vh - 1, r.bottom + RING_PAD);
    const right = Math.min(vw - 1, r.right + RING_PAD);
    Object.assign(this.ring.style, {
      display: 'block',
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(0, right - left)}px`,
      height: `${Math.max(0, bottom - top)}px`,
    });

    if (this.isMobile) {
      // panels fill the bottom of the screen on mobile; keep the card above them
      card.style.left = `${Math.round((vw - cw) / 2)}px`;
      card.style.top = '8px';
      return;
    }

    // try right, left, below, above the target; take the first that fits
    const spots = [
      { x: right + CARD_GAP, y: top, fits: right + CARD_GAP + cw <= vw - 8 },
      { x: left - CARD_GAP - cw, y: top, fits: left - CARD_GAP - cw >= 8 },
      { x: left, y: bottom + CARD_GAP, fits: bottom + CARD_GAP + ch <= vh - 8 },
      { x: left, y: top - CARD_GAP - ch, fits: top - CARD_GAP - ch >= 8 },
    ];
    const spot = spots.find((s) => s.fits) || { x: vw - cw - 16, y: vh - ch - 16 };
    const x = Math.min(Math.max(8, spot.x), vw - cw - 8);
    const y = Math.min(Math.max(8, spot.y), vh - ch - 8);
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
  }
}
