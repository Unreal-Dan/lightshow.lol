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
    this.isVisible = true; // Track visibility state
    this.originalPosition = { left: 0, top: 0 }; // Store the initial position
    this.snapMargin = 40; // Configurable snap distance

    this.panel.style.height = ''; // Full height

    this.initDraggable();
    this.initCollapse(header.querySelector('.collapse-btn'));

    // Add this panel to the global list
    Panel.panels.push(this);
  }

  appendTo(parent) {
    parent.appendChild(this.panel);

    const rect = this.panel.getBoundingClientRect();
    this.panel.style.left = `${rect.left}px`;
    this.panel.style.top = `${rect.top}px`;
  }

  initCollapse(collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      this.toggleCollapse();
    });
  }

  show() {
    if (!this.isVisible) {
      this.isVisible = true;
      this.panel.style.display = '';
    }
  }

  hide() {
    if (this.isVisible) {
      this.isVisible = false;
      this.panel.style.display = 'none';
    }
  }

  getSnappedPanels() {
    const rect = this.panel.getBoundingClientRect();

    return Panel.panels.filter((otherPanel) => {
      if (otherPanel === this) return false; // Skip self

      const otherRect = otherPanel.panel.getBoundingClientRect();
      return (
        Math.abs(otherRect.top - rect.bottom) <= this.snapMargin &&
        otherRect.left >= rect.left &&
        otherRect.right <= rect.right
      );
    });
  }

  toggleCollapse() {
    const previousHeight = this.panel.offsetHeight;

    // Identify snapped panels first
    const snappedPanels = this.getSnappedPanels();

    let newHeight = 44; // Default height after collapse (32 + 10 padding + 2 border)
    if (!this.isCollapsed) {
      // Collapse the panel: Set height to 32px and hide content
      this.contentContainer.style.display = 'none';
      this.panel.style.height = '32px';
    } else {
      // Expand the panel: Restore content and height
      this.contentContainer.style.display = 'flex';
      this.panel.style.height = ''; // Reset height to auto
      newHeight = this.panel.offsetHeight;
    }

    const heightChange = newHeight - previousHeight;

    // Reposition all previously snapped panels
    snappedPanels.forEach((otherPanel) => {
      const newTop = parseFloat(otherPanel.panel.style.top || otherPanel.panel.getBoundingClientRect().top) + heightChange;
      otherPanel.panel.style.top = `${newTop}px`;

      // Recursively adjust panels below this one
      otherPanel.moveSnappedPanels(heightChange);
    });

    // Toggle the collapse state
    this.isCollapsed = !this.isCollapsed;
  }

  moveSnappedPanels(heightChange) {
    const rect = this.panel.getBoundingClientRect();

    Panel.panels.forEach((otherPanel) => {
      if (otherPanel === this) return; // Skip self

      const otherRect = otherPanel.panel.getBoundingClientRect();

      const isSnappedBelow =
        Math.abs(otherRect.top - rect.bottom) <= this.snapMargin &&
        otherRect.left >= rect.left &&
        otherRect.right <= rect.right;

      if (isSnappedBelow) {
        // Adjust the position of the panel below
        const newTop = parseFloat(otherPanel.panel.style.top || otherRect.top) + heightChange;
        otherPanel.panel.style.top = `${newTop}px`;

        // Update the snapping recursively
        otherPanel.moveSnappedPanels(heightChange);
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

        this.panel.style.zIndex = 1000; // Bring the panel to the top
        this.panel.style.position = 'absolute';
        const rect = this.panel.getBoundingClientRect();
        this.panel.style.left = `${rect.left}px`;
        this.panel.style.top = `${rect.top}px`;
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
    console.log(`Panel rect: left=${rect.left}, top=${rect.top}, width=${rect.width}, height=${rect.height}`);
    console.log(`Snap points:`, snapPoints);

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

    console.log(`Closest snap: x=${closestX}, y=${closestY}`);
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
      console.log(`Other panel rect: left=${otherRect.left}, top=${otherRect.top}, right=${otherRect.right}, bottom=${otherRect.bottom}`);

      snapPoints.push(
        { x: otherRect.left, y: otherRect.top }, // Top-left
        { x: otherRect.right, y: otherRect.top }, // Top-right
        { x: otherRect.left, y: otherRect.bottom }, // Bottom-left
        { x: otherRect.right, y: otherRect.bottom } // Bottom-right
      );
    });

    console.log(`Generated snap points:`, snapPoints);
    return snapPoints;
  }
}

