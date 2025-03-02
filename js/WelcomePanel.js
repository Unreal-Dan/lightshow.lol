/* WelcomePanel.js */
import Panel from './Panel.js';

export default class WelcomePanel extends Panel {
  constructor(editor) {
    let content = `
      <h1>Welcome to lightshow.lol</h1>
      <p>Hello! If you found this website then you're likely a flow artist or glover. If you have no idea what that means, then welcome to your first lightshow!
      This website is an ongoing development designed for both enjoyment and as a tool to control Vortex Lightshow Devices.</p>

      <h2>New Updates</h2>
      <p>Lots of new updates are being deployed lately, explore the new UI and keep an eye out for new features. See the 
      <a href="https://github.com/Unreal-Dan/lightshow.lol" target="_blank">Github</a> to share suggestions or report any bugs.</p>

      <h2>The Wiki</h2>
      <p>If you're new or just want to dive deeper, check out the Vortex Engine Wiki for guides, tips, and instructions:</p>
      <a href="https://stoneorbits.github.io/VortexEngine/lightshow_lol.html" target="_blank" class="wiki-button">
        <span>Learn More</span>
        <span class="arrow">→</span>
      </a>
      <div class="checkbox-container">
        <label><input type="checkbox" id="doNotShowAgain"> Do not show this again</label>
      </div>
    `;


    if (editor.detectMobile()) {
      content = `
      <div style="margin: 0 auto;">
        <h1 style="color:orange;text-align:center;">⚠ <b style="color:red;">Warning</b> ⚠<br></h1>
        <h3 style="color:yellow;text-align:center;">The Mobile Layout is under construction!</h3>
      </div>
      ` + content;
    }

    super(editor, 'welcomePanel', content, 'Welcome', { showCloseButton: true });
    this.welcomeToken = 'showNewWelcome';
    this.editor = editor;
  }

  initialize() {
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
