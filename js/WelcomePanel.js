/* WelcomePanel.js */
import Panel from './Panel.js';
import SimpleViews from './SimpleViews.js';

export default class WelcomePanel extends Panel {
  constructor(editor) {
    super(editor, 'welcomePanel', '', 'Welcome', { showCloseButton: true });
    this._views = new SimpleViews({ basePath: 'js/views/' });
    this.welcomeToken = 'showNewWelcome';
    this.editor = editor;
  }

  async initialize() {
    const frag = await this._views.render('welcome-panel.html');
    this.contentContainer.innerHTML = '';
    this.contentContainer.appendChild(frag);

    const doNotShowCheckbox = this.panel.querySelector('#doNotShowAgain');
    doNotShowCheckbox.addEventListener('change', (event) => {
      localStorage.setItem(this.welcomeToken, !event.target.checked);
    });

    const showWelcome = localStorage.getItem(this.welcomeToken) !== 'false';
    if (!showWelcome) {
      this.hide();
    }
    if (this.editor.detectMobile()) {
      const checkboxContainer = this.panel.querySelector('.checkbox-container');
      checkboxContainer.style.display = 'none';
    }
  }

  applyMobileLayout() {
    const tabContainer = document.querySelector('.mobile-panel-content');
    if (!tabContainer) return;

    // Append the panel to the mobile panel container
    tabContainer.appendChild(this.panel);

    // Remove unnecessary borders and set transparent background
    this.panel.style.border = 'none';
    this.panel.style.backgroundColor = 'transparent';

    // Get the height available for the panel
    const viewportHeight = window.innerHeight;
    const tabContainerRect = tabContainer.getBoundingClientRect();
    const availableHeight = viewportHeight - tabContainerRect.top;

    // Set the panel height to fit the remaining space
    this.panel.style.height = `${availableHeight}px`;

    // Ensure the content container takes up the remaining space inside the panel
    this.contentContainer.style.flex = '1';
    this.contentContainer.style.display = 'flex';
    this.contentContainer.style.flexDirection = 'column';
    this.contentContainer.style.overflowY = 'auto';

    // Ensure the panel is visible
    this.show();
  }
}
