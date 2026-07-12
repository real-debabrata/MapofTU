/**
 * Tripura University Interactive Campus Map - Filter Coordination Module
 */
(function() {
    'use strict';

    const FilterManager = {
        activeCategories: new Set(['academic', 'administration', 'hostels', 'amenities', 'sports', 'parking', 'emergency']),
        buildings: [],

        init(buildings) {
            this.buildings = buildings;
            this.setupListeners();
        },

        setupListeners() {
            document.querySelectorAll('.layer-filter').forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const category = e.target.value;
                    if (e.target.checked) {
                        this.activeCategories.add(category);
                    } else {
                        this.activeCategories.delete(category);
                    }
                    this.applyFilters();
                });
            });
        },

        applyFilters() {
            const filteredBuildings = this.buildings.filter(building => 
                this.activeCategories.has(building.category)
            );
            window.CampusMap.MapEngine.renderBuildings(filteredBuildings);
        }
    };

    window.CampusMap = window.CampusMap || {};
    window.CampusMap.FilterManager = FilterManager;
})();