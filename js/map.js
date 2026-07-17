/**
 * map.js
 * ----------------------------------------------------------------------
 * Owns the Leaflet map instance and every visual layer drawn on it.
 * We intentionally do NOT try to imitate Google Maps styling — the base
 * tile layer is a muted, open CARTO "Positron" layer used only for
 * geographic context (rivers, town blocks outside campus). Everything
 * that matters — roads, paths, buildings, gardens, water, parking — is
 * our own original vector layer, styled with the Neermahal palette and
 * driven entirely by the GeoJSON/JSON in /data.
 *
 * Other modules talk to this one through:
 *   - CampusMap.init(data)              → builds the map + layers
 *   - CampusMap.getLayerGroups()        → used by filters.js
 *   - CampusMap.focusOn(lngLat, zoom)   → used by search.js / ui.js
 *   - CampusMap.getMap()                → raw Leaflet instance
 *   - document events: 'campus:buildingSelected', 'campus:markerSelected'
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const CAMPUS_CENTER = [23.7612, 91.2660]; // [lat, lng] — Suryamaninagar campus
  const DEFAULT_ZOOM = 16;

  let map = null;
  let data = null;
  const layerGroups = {}; // category -> L.LayerGroup
  let markersById = {}; // "building-101" -> L.Marker, for programmatic focus

  /** Category → { color, svgIcon } used for markers, chips and the legend.
   *  Centralizing this means filters.js, search.js and the legend all
   *  render in sync with a single source of truth. */
  const CATEGORY_STYLE = {
    academic:        { label: 'Academic Buildings',   color: '#1B7A72', icon: iconCap() },
    library:         { label: 'Library',              color: '#2E6BB0', icon: iconBook() },
    hostel:          { label: 'Hostels',               color: '#8A4FA6', icon: iconBed() },
    food:            { label: 'Food & Canteen',        color: '#C9772E', icon: iconCup() },
    sports:          { label: 'Sports Complex',        color: '#2F8F5B', icon: iconBall() },
    medical:         { label: 'Medical Centre',        color: '#C4453B', icon: iconCross() },
    administration:  { label: 'Administration',        color: '#10233A', icon: iconBriefcase() },
    landmarks:       { label: 'Landmarks',             color: '#C99A3D', icon: iconStar() },
    parking:         { label: 'Parking',               color: '#4B5259', icon: iconP() },
    waterbodies:     { label: 'Water Bodies',          color: '#2E6BB0', icon: iconWave() },
    emergency:       { label: 'Emergency',             color: '#C4453B', icon: iconAlert() },
    roads:           { label: 'Roads',                 color: '#B8B2A0', icon: null },
    pathways:        { label: 'Walking Paths',         color: '#C99A3D', icon: null }
  };

  // ---- Tiny inline SVG icon library (no external icon font needed) -----
  function svgWrap(path) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }
  function iconCap() { return svgWrap('<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>'); }
  function iconBook() { return svgWrap('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'); }
  function iconBed() { return svgWrap('<path d="M2 10v9"/><path d="M2 14h20"/><path d="M22 10v9"/><path d="M4 10V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4"/><path d="M12 10V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'); }
  function iconCup() { return svgWrap('<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z"/><path d="M6 1v3M10 1v3M14 1v3"/>'); }
  function iconBall() { return svgWrap('<circle cx="12" cy="12" r="10"/><path d="M12 2a15 15 0 0 0 0 20M2 12h20"/>'); }
  function iconCross() { return svgWrap('<path d="M12 2v20M2 12h20"/>'); }
  function iconBriefcase() { return svgWrap('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'); }
  function iconStar() { return svgWrap('<path d="m12 2 3.1 6.9 7.4.9-5.5 5.2 1.5 7.3L12 18.8l-6.5 3.5 1.5-7.3-5.5-5.2 7.4-.9Z"/>'); }
  function iconP() { return svgWrap('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 16V8h4a3 3 0 0 1 0 6H9"/>'); }
  function iconWave() { return svgWrap('<path d="M2 6c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0"/><path d="M2 12c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0"/><path d="M2 18c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0"/>'); }
  function iconAlert() { return svgWrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>'); }
  function iconGate() { return svgWrap('<path d="M4 22V6l8-3 8 3v16"/><path d="M4 11h16M9 22V11M15 22V11"/>'); }
  function iconTree() { return svgWrap('<path d="M12 22V13"/><path d="M12 13a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z"/><path d="M12 13a5 5 0 1 1 5-5 5 5 0 0 1-5 5Z"/>'); }
  function iconBus() { return svgWrap('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M3 12h18M7 21v-2M17 21v-2"/>'); }
  function iconBank() { return svgWrap('<path d="M3 21h18M4 10h16M12 3l8 5H4Z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>'); }
  function iconAtm() { return svgWrap('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M7 10h2v4H7zM11 8h2v6h-2zM15 11h2v3h-2z"/>'); }
  function iconCycle() { return svgWrap('<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-3-9-3 4h6"/>'); }
  function iconTemple() { return svgWrap('<path d="M12 2l4 4H8Z"/><path d="M4 22V10h16v12"/><path d="M9 22v-6h6v6"/>'); }
  function iconGarden() { return svgWrap('<path d="M12 22V15"/><circle cx="12" cy="9" r="6"/>'); }

  const LANDMARK_ICONS = {
    gate: iconGate(), tree: iconTree(), busstop: iconBus(), garden: iconGarden(),
    temple: iconTemple(), bank: iconBank(), atm: iconAtm(), cyclestand: iconCycle()
  };

  /** Build a Leaflet divIcon that matches our "campus-marker" CSS class
   *  (a rotated rounded square, so it reads as a modern map pin without
   *  reusing any Google/Apple pin silhouette). */
  function makeDivIcon(color, svg) {
    return L.divIcon({
      className: '',
      html: `<div class="campus-marker" style="background:${color}">${svg || ''}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 30],
      popupAnchor: [0, -28]
    });
  }

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** Guards against malformed/missing coordinates in /data (e.g. an
   *  empty `coordinates: []`). Leaflet throws a hard "Invalid LatLng
   *  object" exception on bad input, which — unhandled — used to crash
   *  the whole map init and take down the entire app over a single bad
   *  point. This lets one bad entry be skipped (with a console warning)
   *  instead of one typo in /data breaking the site for everyone. */
  function isValidLngLat(coords) {
    return Array.isArray(coords) && coords.length === 2 &&
      Number.isFinite(coords[0]) && Number.isFinite(coords[1]);
  }

  /** Renders a compact popup for any feature, with a "View details"
   *  button that hands off to ui.js for the full drawer experience. */
  function popupHTML(title, subtitle, ctaLabel) {
    return `<div class="map-popup">
      <h4>${CampusHelpers.escapeHTML(title)}</h4>
      ${subtitle ? `<p>${CampusHelpers.escapeHTML(subtitle)}</p>` : ''}
      ${ctaLabel ? `<button class="btn btn-primary popup-cta">${ctaLabel}</button>` : ''}
    </div>`;
  }

  function addBuildingsLayer() {
    const groups = {};
    data.buildings.forEach((b) => {
      if (!isValidLngLat(b.coordinates)) {
        console.warn('Skipping building with invalid coordinates:', b.name || b.id);
        return;
      }
      const style = CATEGORY_STYLE[b.category] || CATEGORY_STYLE.academic;
      const marker = L.marker([b.coordinates[1], b.coordinates[0]], {
        icon: makeDivIcon(style.color, style.icon),
        keyboard: true,
        alt: b.name
      });
      marker.bindPopup(popupHTML(b.name, `${b.buildingNumber} · ${style.label}`, 'View details'));
      marker.on('popupopen', (e) => {
        e.popup._contentNode?.querySelector('.popup-cta')?.addEventListener('click', () => {
          dispatch('campus:buildingSelected', { building: b });
          marker.closePopup();
        });
      });
      marker.on('click', () => bounceMarker(marker));
      marker.on('keypress', (e) => {
        if (e.originalEvent.key === 'Enter') dispatch('campus:buildingSelected', { building: b });
      });
      marker.buildingId = b.id;
      markersById[`building-${b.id}`] = marker;

      const group = groups[b.category] || (groups[b.category] = L.layerGroup());
      group.addLayer(marker);
    });
    Object.entries(groups).forEach(([cat, group]) => {
      layerGroups[cat] = group;
      group.addTo(map);
    });
  }

  function bounceMarker(marker) {
    const el = marker.getElement()?.querySelector('.campus-marker');
    if (!el) return;
    el.classList.remove('bounce');
    // eslint-disable-next-line no-unused-expressions
    void el.offsetWidth; // restart animation
    el.classList.add('bounce');
  }

  function addLandmarksLayer() {
    const group = L.layerGroup();
    data.geo.landmarks.features.forEach((f) => {
      if (!isValidLngLat(f.geometry?.coordinates)) {
        console.warn('Skipping landmark with invalid coordinates:', f.properties?.name);
        return;
      }
      const [lng, lat] = f.geometry.coordinates;
      const svg = LANDMARK_ICONS[f.properties.type] || iconStar();
      const marker = L.marker([lat, lng], { icon: makeDivIcon(CATEGORY_STYLE.landmarks.color, svg), alt: f.properties.name });
      marker.bindPopup(popupHTML(f.properties.name, f.properties.description));
      marker.on('click', () => bounceMarker(marker));
      group.addLayer(marker);
      markersById[`landmark-${f.properties.name}`] = marker;
    });
    layerGroups.landmarks = group;
    group.addTo(map);
  }

  function addEmergencyLayer() {
    const group = L.layerGroup();
    data.geo.emergency.features.forEach((f) => {
      if (!isValidLngLat(f.geometry?.coordinates)) {
        console.warn('Skipping emergency point with invalid coordinates:', f.properties?.name);
        return;
      }
      const [lng, lat] = f.geometry.coordinates;
      const marker = L.marker([lat, lng], { icon: makeDivIcon(CATEGORY_STYLE.emergency.color, iconAlert()), alt: f.properties.name });
      const subtitle = f.properties.contact ? `Contact: ${f.properties.contact}` : '';
      marker.bindPopup(popupHTML(f.properties.name, subtitle));
      group.addLayer(marker);
    });
    layerGroups.emergency = group;
    group.addTo(map);
  }

  function addParkingLayer() {
    const group = L.layerGroup();
    data.geo.parking.features.forEach((f) => {
      const layer = L.geoJSON(f, {
        style: { color: CATEGORY_STYLE.parking.color, weight: 1, fillOpacity: 0.25, dashArray: '4 3' }
      });
      layer.bindPopup(popupHTML(f.properties.name, `Capacity: ${f.properties.capacity || 'N/A'}`));
      group.addLayer(layer);
    });
    layerGroups.parking = group;
    group.addTo(map);
  }

  function addWaterbodiesLayer() {
    const group = L.layerGroup();
    data.geo.waterbodies.features.forEach((f) => {
      const layer = L.geoJSON(f, { style: { color: '#2E6BB0', weight: 1, fillColor: '#6FB4D8', fillOpacity: 0.45 } });
      layer.bindPopup(popupHTML(f.properties.name, f.properties.description));
      group.addLayer(layer);
    });
    layerGroups.waterbodies = group;
    group.addTo(map);
  }

  function addRoadsLayer() {
    const group = L.layerGroup();
    data.geo.roads.features.forEach((f) => {
      const isMain = f.properties.roadType === 'main';
      const layer = L.geoJSON(f, {
        style: { color: '#B8B2A0', weight: isMain ? 6 : 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }
      });
      group.addLayer(layer);
    });
    layerGroups.roads = group;
    group.addTo(map);
  }

  function addPathwaysLayer() {
    const group = L.layerGroup();
    data.geo.pathways.features.forEach((f) => {
      const layer = L.geoJSON(f, {
        style: { color: '#C99A3D', weight: 3, opacity: 0.55, dashArray: '1 8', lineCap: 'round', lineJoin: 'round' }
      });
      group.addLayer(layer);
    });
    layerGroups.pathways = group;
    group.addTo(map);
  }

  /** Campus outer boundary — a dotted, non-interactive outline drawn from
   *  data/boundary.geojson. Editing that file (any number of points, any
   *  shape) is the only thing needed to change the boundary; this function
   *  just redraws whatever is in it. Not registered as a filterable layer
   *  since it's a fixed reference line, not a category of places. */
  function addBoundaryLayer() {
    const fc = data.geo.boundary;
    if (!fc || !fc.features || !fc.features.length) return null;
    const group = L.layerGroup();
    fc.features.forEach((f) => {
      const layer = L.geoJSON(f, {
        interactive: false,
        style: {
          color: '#10233A',
          weight: 2,
          opacity: 0.55,
          fill: false,
          dashArray: '2 10',
          lineCap: 'round',
          lineJoin: 'round'
        }
      });
      group.addLayer(layer);
    });
    layerGroups.boundary = group;
    group.addTo(map);
    return group;
  }

  /** Combines the boundary polygon with every building/landmark coordinate
   *  into one LatLngBounds. Used so the initial view — and how far the
   *  map is allowed to pan — always includes everything in /data, instead
   *  of a hardcoded center/zoom that newly added buildings can fall
   *  outside of. */
  function computeContentBounds() {
    const points = [];
    const boundaryFC = data.geo.boundary;
    if (boundaryFC && boundaryFC.features) {
      boundaryFC.features.forEach((f) => {
        const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : [];
        rings.forEach((ring) => ring.forEach(([lng, lat]) => points.push([lat, lng])));
      });
    }
    (data.buildings || []).forEach((b) => points.push([b.coordinates[1], b.coordinates[0]]));
    (data.geo.landmarks?.features || []).forEach((f) => {
      const [lng, lat] = f.geometry.coordinates;
      points.push([lat, lng]);
    });
    if (!points.length) return L.latLngBounds([CAMPUS_CENTER]);
    return L.latLngBounds(points);
  }

  let routeLayer = null;
  /** Draws (or clears, if coords is null) the active route as an
   *  animated dashed polyline plus start/end flags. */
  function drawRoute(coordsLatLng, options = {}) {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    if (!coordsLatLng || !coordsLatLng.length) return;

    routeLayer = L.layerGroup();
    const line = L.polyline(coordsLatLng, {
      color: options.color || '#1B7A72',
      weight: 5,
      opacity: 0.95,
      dashArray: '1 10',
      lineCap: 'round',
      className: 'route-line-animated'
    });
    routeLayer.addLayer(line);

    const start = coordsLatLng[0];
    const end = coordsLatLng[coordsLatLng.length - 1];
    routeLayer.addLayer(L.circleMarker(start, { radius: 7, color: '#fff', weight: 2, fillColor: '#1B7A72', fillOpacity: 1 }));
    routeLayer.addLayer(L.circleMarker(end, { radius: 7, color: '#fff', weight: 2, fillColor: '#C4453B', fillOpacity: 1 }));

    routeLayer.addTo(map);
    map.fitBounds(L.latLngBounds(coordsLatLng), { padding: [80, 80] });
  }

  function focusOn(lngLat, zoom = 18) {
    map.flyTo([lngLat[1], lngLat[0]], zoom, { duration: 0.9 });
  }

  function focusMarker(key) {
    const marker = markersById[key];
    if (!marker) return;
    map.flyTo(marker.getLatLng(), 18, { duration: 0.9 });
    setTimeout(() => marker.openPopup(), 500);
  }

  function init(loadedData) {
    data = loadedData;

    map = L.map('map-canvas', {
      center: CAMPUS_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false, // custom zoom-stack UI instead
      attributionControl: true,
      minZoom: 14,
      maxZoom: 20,
      maxBoundsViscosity: 0.6
    });

    // Muted, open basemap used only for surrounding geographic context.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    addBoundaryLayer();
    addRoadsLayer();
    addPathwaysLayer();
    addWaterbodiesLayer();
    addParkingLayer();
    addBuildingsLayer();
    addLandmarksLayer();
    addEmergencyLayer();

    // Fit the initial view — and cap how far the map can be panned — to
    // whatever is actually in /data (boundary + buildings + landmarks)
    // instead of a hardcoded center/zoom. This is what stops a newly
    // added building from ending up outside the visible/pannable map:
    // these bounds are recalculated from the live data on every load, so
    // the map always grows to fit everything you've added to /data.
    const contentBounds = computeContentBounds();
    map.fitBounds(contentBounds.pad(0.12));
    map.setMaxBounds(contentBounds.pad(0.35));

    map.on('moveend', () => dispatch('campus:mapMoved', { center: map.getCenter(), zoom: map.getZoom() }));

    return map;
  }

  global.CampusMap = {
    init,
    getMap: () => map,
    getLayerGroups: () => layerGroups,
    getCategoryStyle: () => CATEGORY_STYLE,
    focusOn,
    focusMarker,
    drawRoute,
    computeContentBounds,
    CAMPUS_CENTER
  };
})(window);
