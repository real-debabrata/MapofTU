# Tripura University Interactive Campus Map

This interactive WebGIS navigation platform is designed specifically for Tripura University. It displays campus infrastructure, academic buildings, research laboratories, administrative services, and emergency pathways. 

The application is lightweight and utilizes pure vanilla client-side technologies, meaning it is optimized for high-performance mobile devices and runs out-of-the-box on GitHub Pages with zero compilation steps or servers.

---

## Technical Architecture Overview

- **Engine Foundation**: [Leaflet.js](https://leafletjs.com/) mapping engine with OpenStreetMap vector maps.
- **Data Engine**: JSON dictionaries (buildings, rooms, categories) and GeoJSON spatial datasets.
- **Topological Solver**: Client-side Dijkstra routing network. Runs instantly to calculate campus walking times, distances, and wheelchair-accessible routes.
- **UI & Presentation**: CSS layouts using CSS custom variables for instant dark and light mode rendering, responsive sidebar layouts, and glassmorphism styling.

---

## Directory Organization

```text
project/
│
├── index.html                  # Master Interface Frame
├── css/
│   └── style.css               # Core Stylesheet & Dark Mode Integration
├── js/
│   ├── app.js                  # Application lifecycle and event handlers
│   ├── map.js                  # GIS Canvas Initialization and Marker renderer
│   ├── search.js               # Fuzzy matching text search engine
│   ├── routing.js              # Dijkstra topological pathfinder
│   ├── filters.js              # Custom category overlay manager
│   ├── ui.js                   # Drawers, layout shifts, dynamic templates
│   └── dataLoader.js           # Dynamic asset loader and fallback schemas
└── README.md                   # System Operations Documentation
