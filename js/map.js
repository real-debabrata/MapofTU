/**
 * Tripura University Interactive Campus Map - Leaflet Map Orchestrator
 */
(function() {
    'use strict';

    const MapEngine = {
        map: null,
        buildingLayers: {},
        roadLayer: null,
        activeMarkers: [],
        baseTiles: {},

        init() {
            // Focus center coordinates for Tripura University campus
            const TU_LAT_LNG = [23.7590, 91.2610];
            
            // Map Setup with strict movement constraints to prevent getting lost
            this.map = L.map('leaflet-map-canvas', {
                center: TU_LAT_LNG,
                zoom: 17,
                minZoom: 15,
                maxZoom: 19,
                zoomControl: false,
                maxBounds: L.latLngBounds([23.7500, 91.2500], [23.7700, 91.2720])
            });

            L.control.zoom({ position: 'bottomright' }).addTo(this.map);

            this.initTileLayers();
            this.applyThemeStyle('light');
        },

        initTileLayers() {
            // Open-source modern vector representations
            this.baseTiles.light = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap, © CartoDB'
            });

            this.baseTiles.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap, © CartoDB'
            });
        },

        applyThemeStyle(theme) {
            if (theme === 'dark') {
                this.map.removeLayer(this.baseTiles.light);
                this.baseTiles.dark.addTo(this.map);
            } else {
                this.map.removeLayer(this.baseTiles.dark);
                this.baseTiles.light.addTo(this.map);
            }
        },

        renderBuildings(buildings) {
            // Remove any old layers
            Object.values(this.buildingLayers).forEach(layer => this.map.removeLayer(layer));
            this.buildingLayers = {};

            buildings.forEach(building => {
                const colorHex = this.getCategoryColorHex(building.category);
                
                // SVG Marker for precision styling
                const customIcon = L.divIcon({
                    html: `<div class="custom-leaflet-marker" style="background-color: ${colorHex}; width: 32px; height: 32px;">
                            <span class="marker-building-icon">🏢</span>
                           </div>`,
                    className: 'leaflet-custom-div-icon',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                });

                const marker = L.marker(building.coordinates, { icon: customIcon })
                    .bindTooltip(`<strong>${building.name}</strong><br><small>${building.buildingNumber}</small>`, {
                        permanent: false,
                        direction: 'top'
                    });

                marker.on('click', () => {
                    window.dispatchEvent(new CustomEvent('campus-building-select', { detail: building }));
                });

                this.buildingLayers[building.id] = marker;
                marker.addTo(this.map);
            });
        },

        renderRoads(geoJsonData) {
            if (this.roadLayer) this.map.removeLayer(this.roadLayer);

            this.roadLayer = L.geoJSON(geoJsonData, {
                style: function(feature) {
                    if (feature.properties.type === 'primary') {
                        return { color: '#0c2340', weight: 4, opacity: 0.8, dashArray: '2, 6' };
                    }
                    return { color: '#94a3b8', weight: 2, opacity: 0.6 };
                }
            }).addTo(this.map);
        },

        getCategoryColorHex(category) {
            const rootStyle = getComputedStyle(document.documentElement);
            switch(category) {
                case 'academic': return rootStyle.getPropertyValue('--color-academic').trim() || '#3b82f6';
                case 'administration': return rootStyle.getPropertyValue('--color-admin').trim() || '#8b5cf6';
                case 'hostels': return rootStyle.getPropertyValue('--color-hostels').trim() || '#f59e0b';
                case 'amenities': return rootStyle.getPropertyValue('--color-amenity').trim() || '#ec4899';
                case 'sports': return rootStyle.getPropertyValue('--color-sports').trim() || '#10b981';
                case 'emergency': return rootStyle.getPropertyValue('--color-emergency').trim() || '#ef4444';
                default: return '#64748b';
            }
        },

        focusOnCoordinates(coords, zoomLevel = 18) {
            this.map.setView(coords, zoomLevel, { animate: true, duration: 1 });
        }
    };

    window.CampusMap = window.CampusMap || {};
    window.CampusMap.MapEngine = MapEngine;
})();