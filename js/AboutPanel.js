/* AboutPanel.js */
import Panel from './Panel.js'

export default class AboutPanel extends Panel {
  constructor(lightshow, vortexPort) {
    const content = `
            <label>Made with Vortex Engine&nbsp;&nbsp;</label>
            <a href="https://github.com/StoneOrbits/VortexEngine" target="_blank" aria-label="View on GitHub">
                <i class="fab fa-github"></i>
            </a>
        `;
    super('aboutPanel', content);
    this.lightshow = lightshow
    this.vortexPort = vortexPort;
  }

  initialize() {
    // ...
  }
}
