/* Panel.js */
export default class Panel {
  constructor(id, content) {
    this.panel = document.createElement('div');
    this.panel.id = id;
    this.panel.innerHTML = content;
  }

  appendTo(parent) {
    parent.appendChild(this.panel);
  }
}

