export default class Modal {
  constructor() {
    this.createModal();
  }

  createModal() {
    const html = `
        <div id="modal" class="modal">
            <div class="modal-content">
                <span class="modal-title" style="font-size: 20px; font-weight: bold;"></span>
                <span class="close">&times;</span>
                <input type="text" id="modalInput" placeholder="Enter or copy the text here">
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    this.modal = document.getElementById("modal");
    this.modalInput = document.getElementById("modalInput");
    this.modalTitle = this.modal.querySelector('.modal-title'); // Store the title element for later use
    this.setupEventListeners();
  }

  setupEventListeners() {
    const closeButton = this.modal.querySelector('.close');
    //const cancelButton = this.modal.querySelector('#modalCancel');

    closeButton.onclick = () => this.hide();
    //cancelButton.onclick = () => this.hide();

    window.onclick = (event) => {
      if (event.target == this.modal) {
        this.hide();
      }
    };
  }

  show(config) {
    this.modalInput.value = config.defaultValue || '';
    this.modalInput.placeholder = config.placeholder || 'Enter text';

    this.modalTitle.textContent = config.title || ''; // Use the stored title element

    this.modal.style.display = 'block';
  }

  hide() {
    this.modal.style.display = 'none';
  }

  // Additional methods for specific actions like 'save' can be added here
}
