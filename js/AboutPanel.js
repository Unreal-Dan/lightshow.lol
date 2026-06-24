import Panel from './Panel.js';
import SimpleViews from './SimpleViews.js';

export default class AboutPanel extends Panel {
  constructor(editor) {
    super(editor, 'aboutPanel', '', 'Help & About');
    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
    this._views = new SimpleViews({ basePath: 'js/views/' });
  }

  async initialize() {
    const frag = await this._views.render('about-panel.html');
    this.contentContainer.innerHTML = '';
    this.contentContainer.appendChild(frag);
    this.addClickListener('patternHelpButton', this.showHelp);
    this.addClickListener('githubLinkButton', this.gotoGithub);
  }

  destroy() {
    this.removeClickListener('patternHelpButton', this.showHelp);
    this.removeClickListener('githubLinkButton', this.gotoGithub);
  }

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
