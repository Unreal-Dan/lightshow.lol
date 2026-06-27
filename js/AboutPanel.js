import Panel from './Panel.js';

const COMMUNITY_URL = 'https://vortex.community';
const GITHUB_URL = 'https://github.com/StoneOrbits/VortexEngine';
const WIKI_URL = 'https://stoneorbits.github.io/VortexEngine/lightshow-lol/';

export default class AboutPanel extends Panel {
  constructor(editor) {
    const content = `
      <div class="about-pills">
        <button id="communityButton" class="pill-btn">
          <i class="fas fa-globe"></i> Community
        </button>
        <button id="githubLinkButton" class="pill-btn">
          <i class="fab fa-github"></i> GitHub
        </button>
        <button id="whatsNewButton" class="pill-btn">
          <i class="fas fa-star"></i> Welcome
        </button>
      </div>
    `;
    super(editor, 'aboutPanel', content, 'Help & About');
    this.editor = editor;
    this.wikiUrl = WIKI_URL;
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;
  }

  async initialize() {
    this.addClickListener('communityButton', this.gotoCommunity);
    this.addClickListener('githubLinkButton', this.gotoGithub);
    this.addClickListener('whatsNewButton', this.showWhatsNew);
  }

  destroy() {
    this.removeClickListener('communityButton', this.gotoCommunity);
    this.removeClickListener('githubLinkButton', this.gotoGithub);
    this.removeClickListener('whatsNewButton', this.showWhatsNew);
  }

  showWhatsNew() {
    if (this.editor && this.editor.welcomePanel) {
      this.editor.welcomePanel.show();
    }
  }

  gotoCommunity() {
    window.open(COMMUNITY_URL, '_blank');
  }

  gotoGithub() {
    window.open(GITHUB_URL, '_blank');
  }
}

