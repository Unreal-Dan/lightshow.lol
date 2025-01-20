import Panel from './Panel.js';

export default class CommunityBrowserPanel extends Panel {
  constructor(editor) {
    const initialHTML = `
      <div style="display: flex; flex-direction: column; align-items: center;">
        <div id="vcb-filter-container" style="margin-bottom: 10px; display: flex; gap: 10px;">
          <button class="vcb-filter-btn active" data-device="Orbit">
            <img src="/public/images/orbit-logo-square-512.png" alt="Orbit" class="filter-icon" />
          </button>
          <button class="vcb-filter-btn active" data-device="Gloves">
            <img src="/public/images/gloves-logo-square-512.png" alt="Gloves" class="filter-icon" />
          </button>
          <button class="vcb-filter-btn active" data-device="Handle">
            <img src="/public/images/handle-logo-square-512.png" alt="Handle" class="filter-icon" />
          </button>
          <button class="vcb-filter-btn active" data-device="Duo">
            <img src="/public/images/duo-logo-square-512.png" alt="Duo" class="filter-icon" />
          </button>
          <button class="vcb-filter-btn active" data-device="Chromadeck">
            <img src="/public/images/chromadeck-logo-square-512.png" alt="Chromadeck" class="filter-icon" />
          </button>
          <button class="vcb-filter-btn active" data-device="Spark">
            <img src="/public/images/spark-logo-square-512.png" alt="Spark" class="filter-icon" />
          </button>
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
    this.pageSize = 15;
    this.modesCache = {};
    this.totalPages = 1;
    this.activeFilters = new Set(); // Stores active device filters

    this.pageLabel = this.contentContainer.querySelector('#vcb-page-label');
    this.modesContainer = this.contentContainer.querySelector('#vcb-modes-container');

    // Add event listeners to filter buttons
    const filterButtons = this.contentContainer.querySelectorAll('.vcb-filter-btn');
    filterButtons.forEach(button => {
      this.activeFilters.add(button.dataset.device);
      button.addEventListener('click', () => {
        const deviceType = button.dataset.device;
        if (this.activeFilters.has(deviceType)) {
          this.activeFilters.delete(deviceType);
          button.classList.remove('active');
        } else {
          this.activeFilters.add(deviceType);
          button.classList.add('active');
        }
        this.applyFilters();
      });
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
    this.applyFilters();
  }

  async loadPage(pageNumber) {
    if (this.modesCache[pageNumber]) {
      this.renderPage(this.modesCache[pageNumber]);
      return;
    }

    try {
      let response;
      if (this.editor.isLocalServer) {
        response = await fetch('public/data/modeData.json');
      } else {
        response = await fetch(`https://vortex.community/modes/json?page=${pageNumber}&pageSize=${this.pageSize}`, {
          method: 'GET',
          credentials: 'include'
        });
      }
      const data = await response.json();

      this.modesCache[pageNumber] = data;
      this.renderPage(data);

    } catch (err) {
      console.error('Error fetching modes:', err);
      this.modesContainer.innerHTML = '<p style="color:red;">Failed to load modes.</p>';
    }
  }

  applyFilters() {
    const allModes = this.modesCache[this.currentPage]?.data || [];
    const filteredModes = allModes.filter(mode => {
      return this.activeFilters.has(mode.deviceType);
    });
    this.renderPage({ data: filteredModes, pages: this.totalPages });
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
        console.log('Request to open mode:', mode);
        this.editor.modesPanel.importModeFromData(mode.data, false);
      });
      actionsDiv.appendChild(openBtn);

      row.appendChild(actionsDiv);
      this.modesContainer.appendChild(row);
    });

    this.pageLabel.textContent = `Page ${this.currentPage} / ${this.totalPages}`;
  }
}

