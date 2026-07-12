/**
 * Tripura University Interactive Campus Map - UI Presentation Orchestrator
 */
(function() {
    'use strict';

    const UIController = {
        activeBuilding: null,
        activeFloor: 0,

        init() {
            this.setupEventListeners();
            this.detectSystemTheme();
        },

        setupEventListeners() {
            // Sidebar Drawer Controls
            document.getElementById('open-sidebar-btn').addEventListener('click', () => {
                document.getElementById('sidebar-drawer').classList.add('open');
            });
            document.getElementById('close-sidebar-btn').addEventListener('click', () => {
                document.getElementById('sidebar-drawer').classList.remove('open');
            });

            // Tabs System
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                    
                    btn.classList.add('active');
                    document.getElementById(btn.dataset.tab).classList.add('active');
                });
            });

            // Theme Toggle Action
            document.getElementById('theme-switch-btn').addEventListener('click', () => {
                const root = document.getElementById('app-container');
                const isDark = root.classList.contains('system-theme-dark');
                this.applyTheme(isDark ? 'light' : 'dark');
            });

            // Close Info Drawer Action
            document.getElementById('close-drawer-btn').addEventListener('click', () => {
                document.getElementById('info-drawer').classList.add('closed');
            });

            // Dynamic Custom Event Catchers
            window.addEventListener('campus-building-select', (e) => {
                this.openBuildingDetails(e.detail);
            });
        },

        detectSystemTheme() {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.applyTheme(prefersDark ? 'dark' : 'light');
        },

        applyTheme(theme) {
            const root = document.getElementById('app-container');
            const sunIcon = document.querySelector('.sun-icon');
            const moonIcon = document.querySelector('.moon-icon');

            if (theme === 'dark') {
                root.classList.remove('system-theme-auto', 'system-theme-light');
                root.classList.add('system-theme-dark');
                sunIcon.classList.remove('hidden');
                moonIcon.classList.add('hidden');
            } else {
                root.classList.remove('system-theme-auto', 'system-theme-dark');
                root.classList.add('system-theme-light');
                sunIcon.classList.add('hidden');
                moonIcon.classList.remove('hidden');
            }

            if (window.CampusMap.MapEngine) {
                window.CampusMap.MapEngine.applyThemeStyle(theme);
            }
        },

        openBuildingDetails(building) {
            this.activeBuilding = building;
            this.activeFloor = 0; // Default floor upon selection

            const detailsPanel = document.getElementById('drawer-main-content');
            
            // Generate clean floor list
            let floorButtonsMarkup = '';
            for (let f = 0; f < building.floors; f++) {
                floorButtonsMarkup += `<button class="floor-pill ${f === 0 ? 'active' : ''}" onclick="window.CampusMap.UIController.selectFloor(${f})">
                    ${f === 0 ? 'Ground Floor' : `Floor ${f}`}
                </button>`;
            }

            detailsPanel.innerHTML = `
                <div class="drawer-layout-grid">
                    <div class="drawer-image-wrapper">
                        <img src="${building.image}" alt="${building.name}" class="building-hero-img">
                    </div>
                    <div class="drawer-core-info">
                        <div class="header-cluster">
                            <h2>${building.name}</h2>
                            <span class="building-code-badge">${building.buildingNumber}</span>
                        </div>
                        <p class="building-desc">${building.description}</p>
                        
                        <div class="quick-facts-row">
                            <div class="fact-card">
                                <strong>Hours:</strong> <span>${building.openingHours}</span>
                            </div>
                            <div class="fact-card">
                                <strong>Accessibility:</strong> <span>${building.accessibility}</span>
                            </div>
                        </div>

                        <!-- Floor System Interface Selector -->
                        <div class="floor-picker-container">
                            <h4>Interactive Floors</h4>
                            <div class="floor-pills-row">${floorButtonsMarkup}</div>
                        </div>

                        <!-- Dynamic Room Container List -->
                        <div id="drawer-rooms-list" class="rooms-container">
                            ${this.getRoomsMarkup(building.id, 0)}
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('info-drawer').classList.remove('closed');
        },

        selectFloor(floorIndex) {
            this.activeFloor = floorIndex;
            
            // CSS Active Class Updates
            document.querySelectorAll('.floor-pill').forEach((pill, idx) => {
                if (idx === floorIndex) pill.classList.add('active');
                else pill.classList.remove('active');
            });

            const roomsContainer = document.getElementById('drawer-rooms-list');
            if (roomsContainer && this.activeBuilding) {
                roomsContainer.innerHTML = this.getRoomsMarkup(this.activeBuilding.id, floorIndex);
            }
        },

        getRoomsMarkup(buildingId, floorId) {
            const rooms = window.CampusMap.DataLoader.fallbackRooms.filter(
                r => r.buildingId === buildingId && r.floor === floorId
            );

            if (rooms.length === 0) {
                return `<p class="no-rooms-msg">No structured room indexes defined for this floor.</p>`;
            }

            return `
                <h4>Floor Resource Index</h4>
                <div class="room-grid">
                    ${rooms.map(room => `
                        <div class="room-card">
                            <div class="room-card-header">
                                <span class="room-number">No. ${room.room}</span>
                                <span class="room-type-tag">${room.type}</span>
                            </div>
                            <h5>${room.name}</h5>
                            <span class="room-capacity">Capacity: ${room.capacity} seats</span>
                        </div>
                    `).join('')}
                </div>
            `;
        },

        dispatchToast(message) {
            const container = document.getElementById('toast-wrapper');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            container.appendChild(toast);

            setTimeout(() => {
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 400);
            }, 3000);
        }
    };

    window.CampusMap = window.CampusMap || {};
    window.CampusMap.UIController = UIController;
})();