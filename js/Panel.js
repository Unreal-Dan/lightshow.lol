/* Panel.js */
export default class Panel {
  static panels = []; // Static list to track all panels
  static topZIndex = 3; // Initialize the top Z-Index to the default panel Z-Index

  constructor(id, content, title = 'Panel', options = {}) {
    this.panel = document.createElement('div');
    this.panel.id = id;
    this.panel.className = 'draggable-panel';
    this.panel.title = title;

    const { showCloseButton = false } = options;

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `<span class="panel-title">${title}</span>`;

    if (showCloseButton) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'close-btn';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', () => this.hide());
      header.appendChild(closeBtn);
    } else {
      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'collapse-btn';
      collapseBtn.textContent = '▼';
      collapseBtn.addEventListener('click', () => this.toggleCollapse());
      header.appendChild(collapseBtn);
    }

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

    document.addEventListener('deviceChange', async (deviceChangeEvent) => {
      await this.handleDeviceEvent(deviceChangeEvent);
    });

    // Add this panel to the global list
    Panel.panels.push(this);
  }

  bringToFront() {
    // Increment the static top Z-Index
    Panel.topZIndex += 1;
    // Set this panel's z-index to the new top Z-Index
    this.panel.style.zIndex = Panel.topZIndex;
  }

  async handleDeviceEvent(deviceChangeEvent) {
    // Access the custom data from `event.detail`
    const { deviceEvent, deviceName, deviceVersion } = deviceChangeEvent.detail;
    if (deviceEvent === 'waiting') {
      await this.onDeviceWaiting(deviceName);
    } else if (deviceEvent === 'connect') {
      await this.onDeviceConnect(deviceName, deviceVersion);
    } else if (deviceEvent === 'disconnect') {
      await this.onDeviceDisconnect(deviceName);
    } else if (deviceEvent === 'select') {
      await this.onDeviceSelected(deviceName);
    }
  }

  async onDeviceWaiting(deviceName) {
    // override this
  }

  async onDeviceConnect(deviceName) {
    // override this
  }

  async onDeviceDisconnect(deviceName) {
    // override this
  }

  async onDeviceSelected(devicename) {
    // override this
  }

  appendTo(parent) {
    parent.appendChild(this.panel);

    const rect = this.panel.getBoundingClientRect();
    this.panel.style.left = `${rect.left}px`;
    this.panel.style.top = `${rect.top}px`;
  }


  show() {
    const tabContainer = document.querySelector('.mobile-panel-content');

    if (!this.isVisible) {
      this.isVisible = true;

      if (tabContainer) {
        // For mobile: Add 'active' class and display the panel in the content area
        const activePanels = tabContainer.querySelectorAll('.active');
        activePanels.forEach(activePanel => activePanel.classList.remove('active'));

        this.panel.classList.add('active');
        this.panel.style.display = ''; // Ensure it's visible
      } else {
        // For desktop: Just ensure visibility
        this.panel.style.display = '';
      }
    }

    if (this.isCollapsed && !document.querySelector('.mobile-panel-container')) {
      this.toggleCollapse();
    }
  }

  hide() {
    if (this.isVisible) {
      this.isVisible = false;

      if (!document.querySelector('.mobile-panel-container')) {
        // For desktop: Directly hide the panel
        this.panel.style.display = 'none';
      } else {
        // For mobile: Just remove 'active' class
        this.panel.classList.remove('active');
      }
    }
  }

  getSnappedPanels() {
    const rect = this.panel.getBoundingClientRect();

    return Panel.panels.filter((otherPanel) => {
      if (otherPanel === this) return false; // Skip self

      const otherRect = otherPanel.panel.getBoundingClientRect();

      // Check if the other panel is below this panel
      const isBelow = otherRect.top - rect.bottom <= this.snapRadius && otherRect.top > rect.bottom;

      // Check if the horizontal ranges overlap
      const isOverlappingHorizontally =
        otherRect.left < rect.right + this.snapRadius &&
        otherRect.right > rect.left - this.snapRadius;

      return isBelow && isOverlappingHorizontally;
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
        const currentTop = parseFloat(otherPanel.panel.style.top || otherPanel.panel.getBoundingClientRect().top);
        otherPanel.panel.style.top = `${currentTop + heightChange}px`;
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

  initDraggable() {
    let isDragging = false;
    let offsetX, offsetY;

    const onMouseDown = (e) => {
      // Skip dragging in mobile layout
      if (this.panel.classList.contains('mobile-panel')) {
        return;
      }
      this.bringToFront();
      if (e.target === this.panel || e.target.closest('.panel-header')) {
        isDragging = true;
        offsetX = e.clientX - this.panel.offsetLeft;
        offsetY = e.clientY - this.panel.offsetTop;
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
        const headerHeight = this.panel.querySelector('.panel-header').offsetHeight;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let newLeft = rect.left;
        let newTop = rect.top;

        // Ensure the panel does not go off the left or right edge
        if (rect.right < 0) {
          newLeft = 0;
        } else if (rect.left > screenWidth) {
          newLeft = screenWidth - rect.width;
        }

        // Ensure the panel's header does not go above the top or beyond the bottom
        if (rect.top < 0) {
          newTop = 0; // Snap to top
        } else if (rect.top + headerHeight > screenHeight) {
          newTop = screenHeight - (headerHeight * 2); // Keep header visible
        }

        // Apply the corrected position
        this.panel.style.left = `${newLeft}px`;
        this.panel.style.top = `${newTop}px`;
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

  updateLayout(isMobile) {
    if (isMobile) {
      this.applyMobileLayout();
    } else {
      this.applyDesktopLayout();
    }
  }

  setActiveForMobile(isActive) {
    if (isActive) {
      this.show();
    } else {
      this.hide();
    }
  }


  applyMobileLayout() {
    const tabContainer = document.querySelector('.mobile-panel-content');
    if (tabContainer) {
      tabContainer.appendChild(this.panel);
    }

    this.panel.style.border = 'none';
    this.panel.style.backgroundColor = 'transparent';

    // Ensure the panel is shown in mobile layout
    this.show();
  }

  applyDesktopLayout() {
    const originalParent = document.body;
    if (originalParent) {
      originalParent.appendChild(this.panel); // Move panel back to the body
    }
    this.panel.style.display = ''; // Ensure it displays properly
  }

  addClickListener(buttonId, callback) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.addEventListener('click', callback.bind(this));
    } else {
      console.error(`Button with ID ${buttonId} not found.`);
    }
  }

  removeClickListener(buttonId, callback) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.removeEventListener('click', callback.bind(this));
    } else {
      console.error(`Button with ID ${buttonId} not found for removal.`);
    }
  }
}

