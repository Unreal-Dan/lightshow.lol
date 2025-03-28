export default class Modal {
  // Track the currently open modal
  static activeModal = null;

  constructor(id) {
    if (!document.getElementById("modal_" + id)) {
      // Ensure modal is created only once and not multiple times
      this.createModal(id);
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
    this.modalTitle = this.modal ? this.modal.querySelector('.modal-title') : null;
    this.modalButtons = this.modal ? this.modal.querySelector('.modal-buttons') : null;
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


  setupEventListeners() {
    const closeButton = this.modal.querySelector('.close');
    closeButton.onclick = () => this.hide();
  }

  static windowClickListener(event) {
    if (Modal.activeModal && event.target === Modal.activeModal.modal) {
      Modal.activeModal.hide();
    }
  }

  show(config) {
    if (!this.modal || !this.modalInput) {
      this.cacheElements(this.modalId);
      if (!this.modal || !this.modalInput) {
        return;
      }
    }

    if (Modal.activeModal && Modal.activeModal !== this) {
      Modal.activeModal.hide();
    }

    Modal.activeModal = this; // Set this as the active modal

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

    window.addEventListener('click', Modal.windowClickListener);
  }

  hide() {
    if (this.modal) {
      this.modal.style.display = 'none';
      this.clearButtons();
      if (this.currentInputListener) {
        this.modalInput.removeEventListener('input', this.currentInputListener);
        this.currentInputListener = null;
      }
    }

    if (Modal.activeModal === this) {
      Modal.activeModal = null;
      window.removeEventListener('click', Modal.windowClickListener);
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
    const button = document.createElement('div');
    if (buttonConfig.customHtml) {
      button.innerHTML = buttonConfig.customHtml; // Use custom HTML if provided
    } else {
      button.textContent = buttonConfig.label;
    }
    button.firstChild.addEventListener('click', buttonConfig.onClick); // Attach the event to the first child
    return button;
  }

  populateButtons(buttonConfigs) {
    this.clearButtons(); // Clear previous buttons

    buttonConfigs.forEach(config => {
      let button;

      if (config.customHtml) {
        // Use the provided HTML if it exists
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = config.customHtml.trim();
        button = tempContainer.firstChild;
      } else {
        // Otherwise, create a default <button> element
        button = document.createElement('button');
        button.textContent = config.label || 'Button'; // Default label fallback
        button.className = `modal-button ${config.class || ''}`;
      }

      // Ensure onClick works
      if (config.onClick) {
        button.addEventListener('click', config.onClick);
      }

      this.modalButtons.appendChild(button);
    });
  }
}
