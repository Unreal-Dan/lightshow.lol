import Panel from './Panel.js';

export default class CommunityBrowserPanel extends Panel {
  constructor(editor) {
    const initialHTML = `
      <div id="community-browser-container">
        <div id="vcb-filter-container">
          <!-- This is where filter buttons will appear -->
        </div>
        <div id="vcb-modes-container">
          <!-- This is where mode items will appear -->
        </div>
        <div style="display: flex; gap: 10px;">
          <button id="vcb-prev-btn">Prev</button>
          <span id="vcb-page-label">Page 1 / ?</span>
          <button id="vcb-next-btn">Next</button>
        </div>
      </div>
    `;
    super('communityBrowserPanel', initialHTML, 'Community Modes');
    this.editor = editor;
    this.lightshow = editor.lightshow;
    this.vortexPort = editor.vortexPort;

    this.currentPage = 1;
    this.pageSize = 10;
    this.modesCache = {};
    this.totalPages = 1;
    this.activeFilters = new Set(); // Stores active device filters

    this.pageLabel = this.contentContainer.querySelector('#vcb-page-label');
    this.modesContainer = this.contentContainer.querySelector('#vcb-modes-container');
    this.filterContainer = this.contentContainer.querySelector('#vcb-filter-container');

    // Create filter button container
    // Loop through devices and create filter buttons dynamically
    Object.entries(this.editor.devices).forEach(([deviceName, deviceData]) => {
      if (deviceName === 'None') return; // Skip 'None' device

      const button = document.createElement('button');
      button.className = 'vcb-filter-btn active';
      button.dataset.device = deviceName;
      button.innerHTML = `<img src="/${deviceData.icon}" alt="${deviceName}" class="filter-icon" />`;
      button.title = `Filter by ${deviceData.label}`;

      button.addEventListener('click', () => {
        if (this.activeFilters.has(deviceName)) {
          this.activeFilters.delete(deviceName);
          button.classList.remove('active');
        } else {
          this.activeFilters.add(deviceName);
          button.classList.add('active');
        }
        this.applyFilters();
      });
      this.activeFilters.add(deviceName);
      this.filterContainer.appendChild(button);
    });

    const prevBtn = this.contentContainer.querySelector('#vcb-prev-btn');
    const nextBtn = this.contentContainer.querySelector('#vcb-next-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.loadPage(this.currentPage);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.currentPage < this.totalPages) {
          this.currentPage++;
          this.loadPage(this.currentPage);
        }
      });
    }
  }

  initialize() {
    this.loadPage(this.currentPage);
  }

  async loadPage(pageNumber) {
    this.currentPage = pageNumber; // Ensure the current page updates

    try {
      if (!this.modesCache[pageNumber]) {
        let response;
        if (this.editor.isLocalServer) {
          // Keep local server behavior unchanged
          response = await fetch(`public/data/modeData${pageNumber > 1 ? '2' : ''}.json?v=${new Date().getTime()}`);
        } else {
          response = await fetch(`https://vortex.community/modes/json?page=${pageNumber}&pageSize=${this.pageSize}&v=${new Date().getTime()}`, {
            method: 'GET',
            credentials: 'include'
          });
        }

        const data = await response.json();
        this.modesCache[pageNumber] = data;
        this.totalPages = data.pages; // Use total pages from response
      }

      // Apply filters before rendering the page
      this.applyFilters();

    } catch (err) {
      console.error('Error fetching modes:', err);
      this.modesContainer.innerHTML = '<p style="color:red;">Failed to load modes.</p>';
    }
  }

  applyFilters() {
    const pageData = this.modesCache[this.currentPage];
    if (!pageData) return;

    // Apply filters to the cached data for the current page
    const filteredModes = pageData.data.filter(mode => this.activeFilters.has(mode.deviceType));

    this.renderPage({ data: filteredModes, pages: this.totalPages });
  }

  importMode(mode) {
    const patternSets = mode.patternSets;
    const ledPatternOrder = mode.ledPatternOrder;
    const patternSetMap = {};
    patternSets.forEach(ps => {
      patternSetMap[ps._id] = ps.data;
    });
    const ledCounts = {
      'Gloves': 10,
      'Orbit': 28,
      'Handle': 3,
      'Duo': 2,
      'Chromadeck': 20,
      'Spark': 6
    };
    const num_leds = ledCounts[mode.deviceType] || 1;
    const single_pats = ledPatternOrder.map(orderIndex => patternSetMap[patternSets[orderIndex]._id]);
    const vortexMode = {
      flags: mode.flags,
      num_leds: num_leds,
      single_pats: single_pats
    };
    this.editor.modesPanel.importModeFromData(vortexMode, true);
  }

  renderPage(pageData) {
    if (!pageData || !pageData.data) {
      this.modesContainer.innerHTML = '<p>No modes found.</p>';
      return;
    }

    if (typeof pageData.pages === 'number') {
      this.totalPages = pageData.pages;
    }

    this.modesContainer.innerHTML = '';

    pageData.data.forEach((mode) => {
      const row = document.createElement('div');
      row.classList.add('community-mode-entry');

      // Device Icon
      const deviceIcon = document.createElement('img');
      deviceIcon.src = `/public/images/${mode.deviceType.toLowerCase()}-logo-square-512.png`; // Assumes icons are stored in assets/icons
      deviceIcon.alt = mode.deviceType;
      deviceIcon.style.width = '24px';
      deviceIcon.style.height = '24px';
      row.appendChild(deviceIcon);

      // Mode name
      const modeNameDiv = document.createElement('div');
      modeNameDiv.classList.add('community-mode-name');
      modeNameDiv.textContent = mode.name || 'Unnamed Mode';
      row.appendChild(modeNameDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.classList.add('community-mode-actions');

      const openBtn = document.createElement('button');
      openBtn.classList.add('community-mode-btn');
      openBtn.innerHTML = '<i class="fa-solid fa-share"></i>';
      openBtn.addEventListener('click', () => {
        this.importMode(mode);
      });
      actionsDiv.appendChild(openBtn);

      row.appendChild(actionsDiv);
      this.modesContainer.appendChild(row);
    });

    this.pageLabel.textContent = `Page ${this.currentPage} / ${this.totalPages}`;
  }
}

