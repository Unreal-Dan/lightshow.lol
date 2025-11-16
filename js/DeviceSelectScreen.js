/* DeviceSelectScreen.js */
export default class DeviceSelectScreen {
  constructor(editor) {
    this.editor = editor;

    this.container = document.createElement('div');
    this.container.id = 'deviceSelectScreen';

    const title = document.createElement('div');
    title.id = 'deviceSelectScreenTitle';
    title.innerText = 'Select Device';
    this.container.appendChild(title);

    const deviceList = document.createElement('div');
    deviceList.id = 'deviceSelectList';

    const entries = Object.entries(this.editor.devices)
      .filter(([key]) => key !== 'None');

    entries.forEach(([key, dev]) => {
      const item = document.createElement('div');
      item.className = 'deviceSelectItem';

      const img = document.createElement('img');
      img.src = dev.iconBig;

      const label = document.createElement('div');
      label.className = 'deviceSelectItemLabel';
      label.innerText = dev.label;

      item.appendChild(img);
      item.appendChild(label);

      item.addEventListener('click', () => {
        this.editor.devicePanel.updateSelectedDevice(key);
        this.hide();
      });

      deviceList.appendChild(item);
    });

    const duoDeck = document.createElement('div');
    duoDeck.className = 'deviceSelectItem deviceSelectItemWide';

    const duoImg = document.createElement('img');
    duoImg.src = this.editor.devices['Duo'].iconBig;

    const deckImg = document.createElement('img');
    deckImg.src = this.editor.devices['Chromadeck'].iconBig;

    const duoLabel = document.createElement('div');
    duoLabel.className = 'deviceSelectItemLabel';
    duoLabel.innerText = 'Duo + Chromadeck';

    const row = document.createElement('div');
    row.className = 'deviceSelectWideRow';
    row.appendChild(duoImg);
    row.appendChild(deckImg);

    duoDeck.appendChild(row);
    duoDeck.appendChild(duoLabel);

    duoDeck.addEventListener('click', () => {
      this.editor.devicePanel.updateSelectedDevice('duo');
      this.editor.devicePanel.updateSelectedDevice('chromadeck');
      this.hide();
    });

    deviceList.appendChild(duoDeck);

    this.container.appendChild(deviceList);
  }

  show() {
    document.body.appendChild(this.container);
  }

  hide() {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

