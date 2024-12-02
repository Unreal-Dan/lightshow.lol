import Panel from './Panel.js';

export default class AboutPanel extends Panel {
  constructor(editor) {
    const content = `
      <div class="about-panel-content">
        <label class="about-label">Made with Vortex Engine</label>
        <div class="action-buttons">
          <button id="githubLinkButton" class="icon-button" aria-label="View on Github">
            <i class="fab fa-github" title="View on Github"></i>
          </button>
          <button id="patternHelpButton" class="icon-button" aria-label="Help">
            <i class="fas fa-question-circle" title="Help"></i>
          </button>
        </div>
      </div>
    `;
    super('aboutPanel', content, 'General Controls');
    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
  }

  initialize() {
    //this.addClickListener('patternHelpButton', this.showHelp);
    //this.addClickListener('githubLinkButton', this.gotoGithub);
  }

  //addClickListener(buttonId, callback) {
  //  const button = document.getElementById(buttonId);
  //  if (button) {
  //    button.addEventListener('click', callback.bind(this));
  //  } else {
  //    console.error(`Button with ID ${buttonId} not found.`);
  //  }
  //}

  gotoGithub() {
    try {
      window.open("https://github.com/StoneOrbits/VortexEngine", '_blank').focus();
    } catch (error) {
      console.error("Could not open GitHub link:", error);
    }
  }

  showHelp() {
    try {
      window.open("https://stoneorbits.github.io/VortexEngine/lightshow_lol.html", '_blank').focus();
    } catch (error) {
      console.error("Could not open help link:", error);
    }
  }
}

