export default class Modal {
  constructor(id) {
    if (!document.getElementById("modal_" + id)) {
      this.createModal(id);  // Ensure modal is created only once and not multiple times
    }
    this.currentInputListener = null;
  }

  createModal(id) {
    const html = `
      <div id="modal_${id}" class="modal">
        <div class="modal-content">
          <span class="close">&times;</span>
          <span class="modal-title" style="font-size: 20px; font-weight: bold;"></span>
          <div class="modal-blurb"></div>
          <input type="text" id="modalInput_${id}">
          <div class="modal-buttons"></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    this.modalId = id;
    this.cacheElements(id);
    this.setupEventListeners();
  }

  cacheElements(id) {
    this.lightshowCanvas = document.getElementById("lightshowCanvas");
    this.modal = document.getElementById("modal_" + id);
    this.modalInput = document.getElementById("modalInput_" + id);
    this.modalTitle = this.modal.querySelector('.modal-title');
    this.modalButtons = this.modal.querySelector('.modal-buttons');
  }

  setupEventListeners() {
    const closeButton = this.modal.querySelector('.close');
    closeButton.onclick = () => this.hide();

    window.onclick = (event) => {
      if (event.target === this.lightshowCanvas || event.target === this.modal) {
        this.hide();
      }
    };
  }

  show(config) {
    if (!this.modal || !this.modalInput) {
      this.cacheElements(this.modalId);
    }

    if (this.currentInputListener) {
      this.modalInput.removeEventListener('input', this.currentInputListener);
    }

    if (config.onInput) {
      this.currentInputListener = config.onInput;
      this.modalInput.addEventListener('input', this.currentInputListener);
    } else {
      this.currentInputListener = null;
    }

    if (config.defaultValue || config.placeholder) {
      this.modalInput.value = config.defaultValue || '';
      this.modalInput.placeholder = config.placeholder || 'Enter text';
      this.modalInput.style.display = 'block';
    } else {
      this.modalInput.style.display = 'none';
    }

    const blurbElement = this.modal.querySelector('.modal-blurb');
    blurbElement.innerHTML = config.blurb || '';

    this.modalTitle.innerHTML = config.title || '';
    this.modal.style.display = 'block';

    if (config.buttons) {
      this.populateButtons(config.buttons);
    } else {
      this.clearButtons();
    }
  }

  hide() {
    this.modal.style.display = 'none';
    this.clearButtons();
    if (this.currentInputListener) {
      this.modalInput.removeEventListener('input', this.currentInputListener);
      this.currentInputListener = null;
    }
  }

  selectText() {
    this.modalInput.select();
  }

  selectAndCopyText() {
    this.modalInput.select();
    document.execCommand('copy');
  }

  clearButtons() {
    this.modalButtons.innerHTML = '';
  }

  createButton(buttonConfig) {
    const button = document.createElement('button');
    button.textContent = buttonConfig.label;
    button.addEventListener('click', buttonConfig.onClick);
    return button;
  }

  populateButtons(buttonConfigs) {
    this.modalButtons.innerHTML = '';
    buttonConfigs.forEach(config => {
      const button = this.createButton(config);
      this.modalButtons.appendChild(button);
    });
  }
}

