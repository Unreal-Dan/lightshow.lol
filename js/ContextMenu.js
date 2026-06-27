/* ContextMenu.js */
export default class ContextMenu {
  static instance = null;

  constructor() {
    if (ContextMenu.instance) {
      return ContextMenu.instance;
    }
    this.element = null;
    ContextMenu.lastMouseX = 0;
    ContextMenu.lastMouseY = 0;
    this.setupGlobalListeners();
    ContextMenu.instance = this;
  }

  static getInstance() {
    if (!ContextMenu.instance) {
      new ContextMenu();
    }
    return ContextMenu.instance;
  }

  show(x, y, items) {
    this.hide();

    this.element = document.createElement('div');
    this.element.className = 'context-menu';

    items.forEach(item => {
      if (item.separator) {
        const divider = document.createElement('div');
        divider.className = 'context-menu-separator';
        this.element.appendChild(divider);
        return;
      }
      const menuItem = document.createElement('div');
      menuItem.className = 'context-menu-item';
      if (item.danger) {
        menuItem.classList.add('danger');
      }
      if (item.disabled) {
        menuItem.classList.add('disabled');
      }
      menuItem.textContent = item.label;
      if (!item.disabled && item.action) {
        menuItem.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hide();
          item.action();
        });
      }
      this.element.appendChild(menuItem);
    });

    document.body.appendChild(this.element);

    const rect = this.element.getBoundingClientRect();
    let left = x;
    let top = y;
    if (rect.right > window.innerWidth) {
      left = window.innerWidth - rect.width - 5;
    }
    if (rect.bottom > window.innerHeight) {
      top = window.innerHeight - rect.height - 5;
    }
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  hide() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }

  setupGlobalListeners() {
    document.addEventListener('mousemove', (e) => {
      ContextMenu.lastMouseX = e.clientX;
      ContextMenu.lastMouseY = e.clientY;
    });
    document.addEventListener('click', () => this.hide(), true);
    document.addEventListener('contextmenu', () => this.hide(), true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
  }
}
