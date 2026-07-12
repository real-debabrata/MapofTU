/**
 * Tripura University Interactive Campus Map - Intelligent Search Module
 */
(function() {
    'use strict';

    const SearchEngine = {
        buildings: [],
        rooms: [],
        searchHistory: [],

        init(buildingsData, roomsData) {
            this.buildings = buildingsData;
            this.rooms = roomsData;
            this.loadHistoryFromStorage();
        },

        search(query) {
            if (!query) return [];
            const sanitizedQuery = query.toLowerCase().trim();
            const results = [];

            // Match buildings
            this.buildings.forEach(building => {
                let score = 0;
                if (building.name.toLowerCase().includes(sanitizedQuery)) score += 50;
                if (building.buildingNumber.toLowerCase().includes(sanitizedQuery)) score += 100;
                
                // Match departments in building
                building.departments.forEach(dept => {
                    if (dept.toLowerCase().includes(sanitizedQuery)) score += 30;
                });

                if (score > 0) {
                    results.push({
                        type: 'building',
                        score: score,
                        title: building.name,
                        subtitle: `${building.buildingNumber} | Departments: ${building.departments.join(', ')}`,
                        raw: building
                    });
                }
            });

            // Match rooms
            this.rooms.forEach(room => {
                let score = 0;
                if (room.room.toLowerCase() === sanitizedQuery) score += 90;
                else if (room.room.toLowerCase().includes(sanitizedQuery)) score += 40;
                if (room.name.toLowerCase().includes(sanitizedQuery)) score += 30;

                if (score > 0) {
                    const parentBuilding = this.buildings.find(b => b.id === room.buildingId);
                    results.push({
                        type: 'room',
                        score: score,
                        title: `Room ${room.room}: ${room.name}`,
                        subtitle: parentBuilding ? `${parentBuilding.name} - Floor ${room.floor}` : `Floor ${room.floor}`,
                        raw: room,
                        buildingContext: parentBuilding
                    });
                }
            });

            return results.sort((a, b) => b.score - a.score);
        },

        saveToHistory(queryString) {
            if (!queryString) return;
            const clean = queryString.trim();
            this.searchHistory = this.searchHistory.filter(item => item !== clean);
            this.searchHistory.unshift(clean);
            if (this.searchHistory.length > 5) this.searchHistory.pop();
            localStorage.setItem('tu_gis_search_history', JSON.stringify(this.searchHistory));
        },

        loadHistoryFromStorage() {
            try {
                this.searchHistory = JSON.parse(localStorage.getItem('tu_gis_search_history')) || [];
            } catch(e) {
                this.searchHistory = [];
            }
        },

        clearHistory() {
            this.searchHistory = [];
            localStorage.removeItem('tu_gis_search_history');
        }
    };

    window.CampusMap = window.CampusMap || {};
    window.CampusMap.SearchEngine = SearchEngine;
})();