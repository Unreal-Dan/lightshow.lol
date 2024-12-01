/* Panel.js */
export default class Panel {
  static panels = []; // Static list to track all panels

  constructor(id, content, title = 'Panel') {
    this.panel = document.createElement('div');
    this.panel.id = id;
    this.panel.className = 'draggable-panel';

    // Create header with title and collapse button
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <span class="panel-title">${title}</span>
      <button class="collapse-btn">▼</button>
    `;

    // Create content container
    this.contentContainer = document.createElement('div');
    this.contentContainer.className = 'panel-content';
    this.contentContainer.innerHTML = content;

    // Append header and content to the panel
    this.panel.appendChild(header);
    this.panel.appendChild(this.contentContainer);

    this.isCollapsed = false; // Track collapse state
    this.originalPosition = { left: 0, top: 0 }; // Store the initial position
    this.snapMargin = 40; // Configurable snap distance

    this.initDraggable();
    this.initCollapse(header.querySelector('.collapse-btn'));

    // Add this panel to the global list
    Panel.panels.push(this);
  }

  appendTo(parent) {
    parent.appendChild(this.panel);

    // Set the initial position
    const rect = this.panel.getBoundingClientRect();
    this.originalPosition.left = rect.left;
    this.originalPosition.top = rect.top;
  }

  initCollapse(collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      this.isCollapsed = !this.isCollapsed;

      if (this.isCollapsed) {
        this.contentContainer.style.display = 'none';
        collapseBtn.textContent = '▲'; // Change icon to expand
        this.panel.style.height = '30px'; // Adjust height for collapsed bar
        this.panel.style.cursor = 'move'; // Indicate it's draggable
      } else {
        this.contentContainer.style.display = 'block';
        collapseBtn.textContent = '▼'; // Change icon to collapse
        this.panel.style.height = ''; // Reset height
        this.panel.style.cursor = ''; // Reset cursor
      }
    });
  }

  initDraggable() {
    let isDragging = false;
    let offsetX, offsetY;

    const onMouseDown = (e) => {
      if (e.target === this.panel || e.target.closest('.panel-header')) {
        isDragging = true;
        offsetX = e.clientX - this.panel.offsetLeft;
        offsetY = e.clientY - this.panel.offsetTop;

        this.panel.style.position = 'absolute';
        this.panel.style.zIndex = 1000; // Bring the panel to the top
      }
    };

    const onMouseMove = (e) => {
      if (isDragging) {
        const newLeft = e.clientX - offsetX;
        const newTop = e.clientY - offsetY;

        // Normal dragging behavior
        this.panel.style.left = `${newLeft}px`;
        this.panel.style.top = `${newTop}px`;
      }
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;

        const rect = this.panel.getBoundingClientRect();
        const snapPoints = [
          ...this.getScreenSnapPoints(),
          ...this.getOtherPanelSnapPoints(),
          { x: this.originalPosition.left, y: this.originalPosition.top }, // Original position
        ];

        const { snappedX, snappedY } = this.findClosestSnap(rect, snapPoints);

        // Apply snapping if within range
        if (snappedX !== null) {
          this.panel.style.left = `${snappedX}px`;
        }
        if (snappedY !== null) {
          this.panel.style.top = `${snappedY}px`;
        }
      }
    };

    this.panel.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  findClosestSnap(rect, snapPoints) {
    let closestX = null;
    let closestY = null;
    let closestXDistance = this.snapMargin;
    let closestYDistance = this.snapMargin;

    snapPoints.forEach((point) => {
      const xDistance = Math.abs(rect.left - point.x);
      const yDistance = Math.abs(rect.top - point.y);

      if (xDistance < closestXDistance) {
        closestX = point.x;
        closestXDistance = xDistance;
      }
      if (yDistance < closestYDistance) {
        closestY = point.y;
        closestYDistance = yDistance;
      }
    });

    return { snappedX: closestX, snappedY: closestY };
  }

  getScreenSnapPoints() {
    const rect = this.panel.getBoundingClientRect();
    return [
      { x: 0, y: 0 }, // Top-left corner
      { x: window.innerWidth / 2 - rect.width / 2, y: 0 }, // Center-top
      { x: window.innerWidth - rect.width, y: 0 }, // Top-right corner
      { x: 0, y: window.innerHeight / 2 - rect.height / 2 }, // Center-left
      { x: window.innerWidth / 2 - rect.width / 2, y: window.innerHeight / 2 - rect.height / 2 }, // Center
      { x: window.innerWidth - rect.width, y: window.innerHeight / 2 - rect.height / 2 }, // Center-right
      { x: 0, y: window.innerHeight - rect.height }, // Bottom-left corner
      { x: window.innerWidth / 2 - rect.width / 2, y: window.innerHeight - rect.height }, // Bottom-center
      { x: window.innerWidth - rect.width, y: window.innerHeight - rect.height }, // Bottom-right corner
    ];
  }

  getOtherPanelSnapPoints() {
    const rect = this.panel.getBoundingClientRect();
    const snapPoints = [];

    Panel.panels.forEach((otherPanel) => {
      if (otherPanel === this) return; // Skip self

      const otherRect = otherPanel.panel.getBoundingClientRect();

      // Add snap points for each edge of the other panel
      snapPoints.push(
        { x: otherRect.left, y: otherRect.top }, // Top-left
        { x: otherRect.right, y: otherRect.top }, // Top-right
        { x: otherRect.left, y: otherRect.bottom }, // Bottom-left
        { x: otherRect.right, y: otherRect.bottom } // Bottom-right
      );
    });

    return snapPoints;
  }
}

