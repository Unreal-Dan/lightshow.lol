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
    this.snapMargin = 5; // snap to this distance
    this.snapRadius = 15; // snap within this distance

    this.panel.style.height = ''; // Full height

    this.initDraggable();
    this.initCollapse(header.querySelector('.collapse-btn'));

    // watch for size changes and move other panels nearby
    //this.observeSizeChanges();

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
        Math.abs(otherRect.top - rect.bottom) <= this.snapRadius &&
        otherRect.left >= rect.left &&
        otherRect.right <= rect.right
      );
    });
  }

  toggleCollapse(propagate = true) {
    const previousHeight = this.panel.offsetHeight;

    // Step 1: Identify snapped panels BEFORE resizing
    const snappedPanels = this.getSnappedPanels();

    // Step 2: Perform resizing
    let newHeight = 44; // Default height after collapse
    if (!this.isCollapsed) {
      this.contentContainer.style.display = 'none';
      this.panel.style.height = '32px';
    } else {
      this.contentContainer.style.display = 'flex';
      this.panel.style.height = ''; // Auto height
      newHeight = this.panel.offsetHeight;
    }

    if (propagate) {
      const heightChange = newHeight - previousHeight;
      // Step 3: Move snapped panels AFTER resizing
      snappedPanels.forEach((otherPanel) => {
        // Propagate movement recursively
        otherPanel.moveSnappedPanels(heightChange);
        otherPanel.panel.style.top = `${
          parseFloat(otherPanel.panel.style.top || otherPanel.panel.getBoundingClientRect().top) + heightChange
        }px`;
      });
    }

    // Step 4: Toggle the collapse state
    this.isCollapsed = !this.isCollapsed;
  }

  moveSnappedPanels(heightChange) {
    const rect = this.panel.getBoundingClientRect();
    const snappedPanels = this.getSnappedPanels();

    for (const otherPanel of snappedPanels) {
      if (otherPanel === this) continue; // Skip self

      const otherRect = otherPanel.panel.getBoundingClientRect();

      // Identify panels snapped below this one
      const isSnappedBelow =
        Math.abs(otherRect.top - rect.bottom) <= this.snapMargin &&
        otherRect.left >= rect.left &&
        otherRect.right <= rect.right;

      if (isSnappedBelow) {
        // Calculate the new position for the snapped panel
        const currentTop = parseFloat(otherPanel.panel.style.top || otherRect.top);
        const newTop = currentTop + heightChange;

        // Recursively move panels snapped to this one
        otherPanel.moveSnappedPanels(heightChange);

        otherPanel.panel.style.top = `${newTop}px`;

        // Return immediately after finding a snapped panel
        return;
      }
    }
  }


  observeSizeChanges() {
    const observer = new ResizeObserver(() => {
      this.notifySnappedPanels();
    });
    observer.observe(this.panel);
  }

  clampPosition(panel) {
    const rect = panel.getBoundingClientRect();
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    const left = Math.max(0, Math.min(rect.left, screenWidth - rect.width));
    const top = Math.max(0, Math.min(rect.top, screenHeight - rect.height));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  notifySnappedPanels(heightChange = null) {
    const rect = this.panel.getBoundingClientRect();
    const newHeight = rect.height;

    if (heightChange === null) {
      if (this.previousHeight === undefined) {
        this.previousHeight = newHeight;
        return;
      }

      // Calculate height change
      heightChange = newHeight - this.previousHeight;
      this.previousHeight = newHeight;
    }

    if (heightChange !== 0) {
      // Identify snapped panels BEFORE moving
      const snappedPanels = this.getSnappedPanels();

      // Move snapped panels AFTER resizing
      snappedPanels.forEach((otherPanel) => {
        otherPanel.moveSnappedPanels(heightChange);
      });
    }
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
    let closestXDistance = this.snapRadius;
    let closestYDistance = this.snapRadius;

    snapPoints.forEach((point) => {
      const xDistance = Math.abs(rect.left - point.x);
      const yDistance = Math.abs(rect.top - point.y);

      // Snap only within the snapRadius
      if (xDistance < closestXDistance && xDistance <= this.snapRadius) {
        closestX = point.x;
        closestXDistance = xDistance;
      }
      if (yDistance < closestYDistance && yDistance <= this.snapRadius) {
        closestY = point.y;
        closestYDistance = yDistance;
      }
    });

    // Return snapped positions (only for the axis within range)
    return { snappedX: closestXDistance <= this.snapRadius ? closestX : null, snappedY: closestYDistance <= this.snapRadius ? closestY : null };
  }

  getScreenSnapPoints() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    return [
      // Corners
      { x: 0, y: 0 }, // Top-left
      { x: width, y: 0 }, // Top-right
      { x: 0, y: height }, // Bottom-left
      { x: width, y: height }, // Bottom-right

      // Centerlines
      { x: width / 2, y: 0 }, // Center-top
      { x: width / 2, y: height / 2 }, // Absolute center
      { x: width / 2, y: height }, // Center-bottom
      { x: 0, y: height / 2 }, // Center-left
      { x: width, y: height / 2 }, // Center-right

      // Edges (top, bottom, left, right)
      { x: 0, y: 0 }, // Top-left corner
      { x: width / 2, y: 0 }, // Middle of the top edge
      { x: width, y: 0 }, // Top-right corner
      { x: 0, y: height }, // Bottom-left corner
      { x: width / 2, y: height }, // Middle of the bottom edge
      { x: width, y: height }, // Bottom-right corner
    ];
  }

  getOtherPanelSnapPoints() {
    const snapPoints = [];

    Panel.panels.forEach((otherPanel) => {
      if (otherPanel === this) return; // Skip self

      const otherRect = otherPanel.panel.getBoundingClientRect();

      // Panel edges
      const left = otherRect.left;
      const right = otherRect.right;
      const top = otherRect.top;
      const bottom = otherRect.bottom;

      // Panel centerlines
      const centerX = left + (right - left) / 2;
      const centerY = top + (bottom - top) / 2;

      // Snap points (edges + centerlines)
      snapPoints.push(
        { x: left, y: top }, // Top-left
        { x: right, y: top }, // Top-right
        { x: left, y: bottom }, // Bottom-left
        { x: right, y: bottom }, // Bottom-right
        { x: centerX, y: top }, // Top-center
        { x: centerX, y: bottom }, // Bottom-center
        { x: left, y: centerY }, // Center-left
        { x: right, y: centerY } // Center-right
      );

      // Offset snap points by snapMargin
      snapPoints.push(
        { x: left - this.snapMargin, y: top - this.snapMargin },
        { x: right + this.snapMargin, y: top - this.snapMargin },
        { x: left - this.snapMargin, y: bottom + this.snapMargin },
        { x: right + this.snapMargin, y: bottom + this.snapMargin }
      );
    });

    return snapPoints;
  }

}

