/**
 * Tripura University Interactive Campus Map - Core App Entrypoint
 */
document.addEventListener('DOMContentLoaded', async () => {
    'use strict';

    // Verify all core namespaces exist
    const { DataLoader, MapEngine, SearchEngine, RoutingEngine, FilterManager, UIController } = window.CampusMap;

    if (!DataLoader || !MapEngine || !SearchEngine || !RoutingEngine || !FilterManager || !UIController) {
        console.error("Critical loading fault: Modules did not resolve in global namespace sequence.");
        return;
    }

    // 1. Initialize Map Canvas
    MapEngine.init();

    // 2. Fetch Datasets
    const buildings = await DataLoader.loadBuildings();
    const rooms = await DataLoader.loadRooms();
    const roads = await DataLoader.loadRoads();

    // 3. Populate Interactive Engine Instances
    SearchEngine.init(buildings, rooms);
    MapEngine.renderBuildings(buildings);
    MapEngine.renderRoads(roads);
    FilterManager.init(buildings);
    UIController.init();

    // 4. Bind Search Input Interactivity
    const searchInput = document.getElementById('main-search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const suggestionsBox = document.getElementById('search-suggestions');

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val.length > 0) {
            clearSearchBtn.classList.remove('hidden');
            const hits = SearchEngine.search(val);
            renderSuggestions(hits);
        } else {
            clearSearchBtn.classList.add('hidden');
            suggestionsBox.classList.add('hidden');
        }
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
        suggestionsBox.classList.add('hidden');
    });

    function renderSuggestions(hits) {
        if (hits.length === 0) {
            suggestionsBox.innerHTML = `<div class="suggestion-item">No matches located</div>`;
            suggestionsBox.classList.remove('hidden');
            return;
        }

        suggestionsBox.innerHTML = hits.map(hit => `
            <div class="suggestion-item" data-id="${hit.raw.id}" data-type="${hit.type}">
                <span>🔍</span>
                <div>
                    <strong>${hit.title}</strong><br>
                    <small>${hit.subtitle}</small>
                </div>
            </div>
        `).join('');

        suggestionsBox.classList.remove('hidden');

        // Suggestion selection
        suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                const type = item.dataset.type;

                if (type === 'building') {
                    const match = buildings.find(b => b.id === id);
                    if (match) {
                        MapEngine.focusOnCoordinates(match.coordinates);
                        UIController.openBuildingDetails(match);
                    }
                } else if (type === 'room') {
                    const matchRoom = rooms.find(r => r.id === id);
                    const matchBuilding = buildings.find(b => b.id === matchRoom.buildingId);
                    if (matchBuilding) {
                        MapEngine.focusOnCoordinates(matchBuilding.coordinates);
                        UIController.openBuildingDetails(matchBuilding);
                        UIController.selectFloor(matchRoom.floor);
                    }
                }
                suggestionsBox.classList.add('hidden');
            });
        });
    }

    // 5. Connect Dynamic Route Calculation Panel
    const routeButton = document.getElementById('find-route-btn');
    routeButton.addEventListener('click', () => {
        const fromVal = document.getElementById('route-from-input').value;
        const toVal = document.getElementById('route-to-input').value;
        const accessibleOnly = document.getElementById('accessible-route-toggle').checked;

        const startMatches = SearchEngine.search(fromVal);
        const endMatches = SearchEngine.search(toVal);

        if (startMatches.length === 0 || endMatches.length === 0) {
            UIController.dispatchToast("Invalid route points. Please refine details.");
            return;
        }

        const startCoords = startMatches[0].type === 'building' ? startMatches[0].raw.coordinates : startMatches[0].buildingContext.coordinates;
        const endCoords = endMatches[0].type === 'building' ? endMatches[0].raw.coordinates : endMatches[0].buildingContext.coordinates;

        const result = RoutingEngine.calculateRoute(startCoords, endCoords, accessibleOnly);

        if (!result) {
            UIController.dispatchToast("No suitable connection path matches current criteria.");
            return;
        }

        RoutingEngine.drawRouteOnMap(MapEngine.map, result.coordinates);
        
        // Show route metrics and instructions
        document.getElementById('route-eta').textContent = `${result.duration} min`;
        document.getElementById('route-distance').textContent = `${result.distance} m`;
        
        const directionsList = document.getElementById('route-directions-list');
        directionsList.innerHTML = result.steps.map(step => `
            <li>${step.instruction} <small>(${step.distance}m)</small></li>
        `).join('');

        document.getElementById('route-result-card').classList.remove('hidden');
    });

    document.getElementById('clear-route-btn').addEventListener('click', () => {
        RoutingEngine.clearRouteFromMap(MapEngine.map);
        document.getElementById('route-result-card').classList.add('hidden');
        document.getElementById('route-from-input').value = '';
        document.getElementById('route-to-input').value = '';
    });

    // 6. Support deep-linking to campus buildings
    const handleDeepLink = () => {
        const hash = window.location.hash;
        if (hash.startsWith('#building-')) {
            const bId = parseInt(hash.replace('#building-', ''));
            const match = buildings.find(b => b.id === bId);
            if (match) {
                MapEngine.focusOnCoordinates(match.coordinates);
                UIController.openBuildingDetails(match);
            }
        }
    };

    window.addEventListener('hashchange', handleDeepLink);
    handleDeepLink(); // Run on startup
});