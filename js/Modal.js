export default class Modal {
  constructor() {
    this.createModal();
    this.currentInputListener = null; // Store the current input listener
  }

  createModal() {
    // Modal HTML structure
    const html = `
      <div id="modal" class="modal">
        <div class="modal-content">
          <span class="modal-title" style="font-size: 20px; font-weight: bold;"></span>
          <span class="close">&times;</span>
          <input type="text" id="modalInput">
          <div class="modal-buttons"></div>
        </div>
      </div>
    `;

    // Insert the modal into the document
    document.body.insertAdjacentHTML('beforeend', html);

    // Cache DOM elements
    this.modal = document.getElementById("modal");
    this.modalInput = document.getElementById("modalInput");
    this.modalTitle = this.modal.querySelector('.modal-title');
    this.modalButtons = this.modal.querySelector('.modal-buttons');

    // Setup event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Close button listener
    const closeButton = this.modal.querySelector('.close');
    closeButton.onclick = () => this.hide();

    // Hide modal when clicking outside of it
    window.onclick = (event) => {
      if (event.target === this.modal) {
        this.hide();
      }
    };
  }

  show(config) {
    // Remove the previous input event listener if it exists
    if (this.currentInputListener) {
      this.modalInput.removeEventListener('input', this.currentInputListener);
    }

    // Set the new input event listener if provided
    if (config.onInput) {
      this.currentInputListener = config.onInput;
      this.modalInput.addEventListener('input', this.currentInputListener);
    } else {
      this.currentInputListener = null;
    }

    // Update modal content
    this.modalInput.value = config.defaultValue || '';
    this.modalInput.placeholder = config.placeholder || 'Enter text';
    this.modalTitle.textContent = config.title || '';
    this.modal.style.display = 'block';

    // Populate buttons if provided
    if (config.buttons) {
      this.populateButtons(config.buttons);
    } else {
      this.clearButtons();
    }
  }

  hide() {
    // Hide the modal
    this.modal.style.display = 'none';

    // Clear buttons and remove the input event listener
    this.clearButtons();
    if (this.currentInputListener) {
      this.modalInput.removeEventListener('input', this.currentInputListener);
      this.currentInputListener = null;
    }
  }

  selectAndCopyText() {
    this.modalInput.select();
    document.execCommand('copy');
  }

  clearButtons() {
    this.modalButtons.innerHTML = ''; // Clear all buttons
  }

  createButton(buttonConfig) {
    const button = document.createElement('button');
    button.textContent = buttonConfig.label;
    button.addEventListener('click', buttonConfig.onClick);
    return button;
  }

  populateButtons(buttonConfigs) {
    this.modalButtons.innerHTML = ''; // Clear existing buttons
    buttonConfigs.forEach(config => {
      const button = this.createButton(config);
      this.modalButtons.appendChild(button);
    });
  }
}

