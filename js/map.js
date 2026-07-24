/**
 * map.js
 * ----------------------------------------------------------------------
 * Owns the MapLibre GL JS map instance and every visual layer drawn on
 * it. We intentionally do NOT try to imitate Google Maps styling — the
 * base raster layer is a muted, open CARTO "Positron" layer used only
 * for geographic context (rivers, town blocks outside campus). Everything
 * that matters — roads, paths, buildings, gardens, water, parking — is
 * our own original vector layer, styled with the Neermahal palette and
 * driven entirely by the GeoJSON/JSON in /data.
 *
 * Engine notes (migrated from Leaflet → MapLibre GL JS):
 *   - Line/polygon categories (roads, pathways, waterbodies, parking,
 *     boundary) are GeoJSON sources + style layers, toggled via
 *     setLayoutProperty('visibility', ...) instead of Leaflet layer
 *     groups being added/removed from the map.
 *   - Point categories (buildings, landmarks, emergency) stay as real
 *     DOM markers (maplibregl.Marker) so Font Awesome glyphs, GSAP
 *     entrance/bounce animation and click handling all work exactly as
 *     before — just swap the icon library and the marker class.
 *   - Turf.js replaces the hand-rolled bounds/centroid/length math.
 *   - GSAP drives marker entrance/bounce and an animated "line draw-in"
 *     for routes (built from turf.lineSliceAlong on every tick).
 *
 * Other modules talk to this one through the exact same surface as
 * before, so ui.js / filters.js / routing.js / search.js needed no
 * rewrite of their own logic:
 *   - CampusMap.init(data)              → builds the map + layers
 *   - CampusMap.getLayerGroups()        → used by filters.js (now each
 *                                          entry exposes .show()/.hide())
 *   - CampusMap.focusOn(lngLat, zoom)   → used by search.js / ui.js
 *   - CampusMap.getMap()                → raw MapLibre GL instance
 *   - CampusMap.setBaseTheme(mode)      → swaps basemap tiles for dark
 *   - document events: 'campus:buildingSelected', 'campus:markerSelected'
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const turf = global.turf;

  const CAMPUS_CENTER = [23.7612, 91.2660]; // [lat, lng] — Suryamaninagar campus
  const DEFAULT_ZOOM = 16;

  let map = null;
  let data = null;
  const layerGroups = {}; // category -> { show(), hide() } — see makeMarkerGroup/makeStyleLayerGroup
  let markersById = {}; // "building-101" -> maplibregl.Marker, for programmatic focus

  /** Category → { color, faIcon } used for markers, chips and the legend.
   *  Centralizing this means filters.js, search.js and the legend all
   *  render in sync with a single source of truth. */
  const CATEGORY_STYLE = {
    academic:        { label: 'Academic Buildings',   color: '#1B7A72', faIcon: 'fa-graduation-cap' },
    library:         { label: 'Library',              color: '#2E6BB0', faIcon: 'fa-book' },
    hostel:          { label: 'Hostels',               color: '#8A4FA6', faIcon: 'fa-bed' },
    food:            { label: 'Food & Canteen',        color: '#C9772E', faIcon: 'fa-mug-hot' },
    sports:          { label: 'Sports Complex',        color: '#2F8F5B', faIcon: 'fa-futbol' },
    medical:         { label: 'Medical Centre',        color: '#C4453B', faIcon: 'fa-kit-medical' },
    administration:  { label: 'Administration',        color: '#10233A', faIcon: 'fa-briefcase' },
    landmarks:       { label: 'Landmarks',             color: '#C99A3D', faIcon: 'fa-star' },
    parking:         { label: 'Parking',               color: '#4B5259', faIcon: 'fa-square-parking' },
    waterbodies:     { label: 'Water Bodies',          color: '#2E6BB0', faIcon: 'fa-water' },
    emergency:       { label: 'Emergency',             color: '#C4453B', faIcon: 'fa-triangle-exclamation' },
    roads:           { label: 'Roads',                 color: '#B8B2A0', faIcon: null },
    pathways:        { label: 'Walking Paths',         color: '#C99A3D', faIcon: null }
  };

  const LANDMARK_ICONS = {
    gate: 'fa-door-open', tree: 'fa-tree', busstop: 'fa-bus', garden: 'fa-seedling',
    temple: 'fa-place-of-worship', bank: 'fa-building-columns', atm: 'fa-credit-card',
    cyclestand: 'fa-bicycle'
  };

  const BASEMAP = {
    light: 'https://{a-d}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    dark: 'https://{a-d}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
  };

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** Guards against malformed/missing coordinates in /data (e.g. an
   *  empty `coordinates: []`). This lets one bad entry be skipped (with
   *  a console warning) instead of one typo in /data crashing the whole
   *  map init and taking down the entire app over a single bad point. */
  function isValidLngLat(coords) {
    return Array.isArray(coords) && coords.length === 2 &&
      Number.isFinite(coords[0]) && Number.isFinite(coords[1]);
  }

  /** Builds the marker DOM for a point: an outer plain wrapper (MapLibre
   *  writes its own positioning `transform` directly onto whatever
   *  element you hand its Marker, so that element can't also carry a
   *  CSS transform of its own) around an inner ".campus-marker" diamond
   *  that owns the rotate/scale styling and the Font Awesome glyph.
   *  Returns { wrapper, inner } — `wrapper` goes into maplibregl.Marker,
   *  `inner` is what CSS/GSAP animate. */
  function makeMarkerEl(color, faIcon) {
    const wrapper = document.createElement('div');
    wrapper.className = 'marker-wrapper';
    const inner = document.createElement('div');
    inner.className = 'campus-marker';
    inner.style.background = color;
    if (faIcon) inner.innerHTML = `<i class="fa-solid ${faIcon}" aria-hidden="true"></i>`;
    wrapper.appendChild(inner);
    return { wrapper, inner };
  }

  /** Draws a small isometric 3D building block (top + two shaded side
   *  faces, plus a soft ground shadow) and caches it as a data URL per
   *  color/floor-height combo. Used instead of a flat pin for building
   *  markers, so buildings read as little 3D blocks — like the hand-
   *  drawn pictograms on the reference guide map — while the map itself
   *  stays perfectly flat underneath. */
  const buildingIconCache = {};
  function shadeColor(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
    const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
    return `rgb(${r},${g},${b})`;
  }
  function buildingIconURL(color, floors) {
    const bucket = floors >= 5 ? 'tall' : floors >= 3 ? 'mid' : 'low';
    const key = `${color}|${bucket}`;
    if (buildingIconCache[key]) return buildingIconCache[key];

    const w = 34, h = 40;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const blockH = bucket === 'tall' ? 20 : bucket === 'mid' ? 15 : 11;
    const baseY = h - 8;
    const topW = 18, topD = 8; // top-face footprint (width, isometric depth)
    const cx = w / 2;

    // Ground shadow
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 3, 12, 3.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16,35,58,0.22)';
    ctx.fill();

    const left = cx - topW / 2, right = cx + topW / 2;
    const topY = baseY - blockH;

    // Front face
    ctx.fillStyle = shadeColor(color, -25);
    ctx.fillRect(left, topY + topD / 2, topW, blockH);
    // Right/side face (parallelogram)
    ctx.beginPath();
    ctx.moveTo(right, topY + topD / 2);
    ctx.lineTo(right + topD, topY);
    ctx.lineTo(right + topD, topY + blockH - topD / 2);
    ctx.lineTo(right, topY + blockH + topD / 2);
    ctx.closePath();
    ctx.fillStyle = shadeColor(color, -50);
    ctx.fill();
    // Top face (parallelogram)
    ctx.beginPath();
    ctx.moveTo(left, topY + topD / 2);
    ctx.lineTo(left + topD, topY);
    ctx.lineTo(right + topD, topY);
    ctx.lineTo(right, topY + topD / 2);
    ctx.closePath();
    ctx.fillStyle = shadeColor(color, 35);
    ctx.fill();
    // Crisp edges
    ctx.strokeStyle = 'rgba(16,35,58,0.35)';
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.strokeRect(left, topY + topD / 2, topW, blockH);

    const url = canvas.toDataURL('image/png');
    buildingIconCache[key] = url;
    return url;
  }

  /** Same wrapper/inner contract as makeMarkerEl, but the inner element
   *  is a plain image of the isometric block above instead of the CSS
   *  pin diamond — buildings get a 3D look, the flat map underneath
   *  doesn't have to tilt for it to read that way. */
  function makeBuildingMarkerEl(color, floors) {
    const wrapper = document.createElement('div');
    wrapper.className = 'marker-wrapper';
    const inner = document.createElement('div');
    inner.className = 'campus-marker campus-marker--building';
    inner.style.backgroundImage = `url(${buildingIconURL(color, Number(floors) || 2)})`;
    wrapper.appendChild(inner);
    return { wrapper, inner };
  }

  function bounceMarker(el, baseRotate = 45) {
    if (!global.gsap) return;
    gsap.fromTo(el,
      { y: 0, rotate: baseRotate },
      { y: -14, rotate: baseRotate, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1, onComplete: () => gsap.set(el, { clearProps: 'transform' }) }
    );
  }

  /** Staggered "drop in" for a freshly-added group of markers, so the
   *  campus feels assembled rather than dumped on screen at once. */
  function animateMarkersIn(elements) {
    if (!global.gsap || !elements.length) return;
    gsap.fromTo(elements,
      { opacity: 0, scale: 0.3, y: -10 },
      { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(1.9)', stagger: 0.015, onComplete: () => gsap.set(elements, { clearProps: 'transform,opacity' }) }
    );
  }

  /** Renders a compact popup for any feature, with an optional primary
   *  CTA (e.g. "View details", hands off to ui.js for the full drawer)
   *  and an optional "Directions" button that routes the person here. */
  function popupHTML(title, subtitle, ctaLabel, directionsCoord) {
    return `<div class="map-popup">
      <h4>${CampusHelpers.escapeHTML(title)}</h4>
      ${subtitle ? `<p>${CampusHelpers.escapeHTML(subtitle)}</p>` : ''}
      <div class="map-popup__actions">
        ${ctaLabel ? `<button class="btn btn-primary popup-cta">${ctaLabel}</button>` : ''}
        ${directionsCoord ? `<button class="btn btn-ghost popup-directions">Directions</button>` : ''}
      </div>
    </div>`;
  }

  /** Wires the optional "Directions" button in a popup (see popupHTML)
   *  to the same route-panel flow the building drawer's Directions
   *  button uses, so ui.js has one code path for "route me here". */
  function bindPopupActions(popup, { onCta, directionsCoord, directionsLabel } = {}) {
    popup.on('open', () => {
      const node = popup.getElement();
      if (onCta) node.querySelector('.popup-cta')?.addEventListener('click', () => { onCta(); popup.remove(); });
      if (directionsCoord) {
        node.querySelector('.popup-directions')?.addEventListener('click', () => {
          dispatch('campus:routeToRequested', { coord: directionsCoord, label: directionsLabel });
          popup.remove();
        });
      }
    });
  }

  /** Wraps a set of point markers as one filterable "layer group" so
   *  filters.js can call .show()/.hide() exactly like it used to call
   *  map.addLayer()/map.removeLayer() on a Leaflet LayerGroup. */
  function makeMarkerGroup(markers) {
    let visible = true;
    return {
      markers,
      show() { if (visible) return; visible = true; markers.forEach((m) => m.addTo(map)); },
      hide() { if (!visible) return; visible = false; markers.forEach((m) => m.remove()); }
    };
  }

  /** Same idea for GeoJSON-backed style layers (roads, pathways, water,
   *  parking, boundary): toggling paint/layout visibility instead of
   *  detaching a Leaflet layer group. */
  function makeStyleLayerGroup(layerIds) {
    let visible = true;
    return {
      layerIds,
      show() { if (visible) return; visible = true; layerIds.forEach((id) => map.setLayoutProperty(id, 'visibility', 'visible')); },
      hide() { if (!visible) return; visible = false; layerIds.forEach((id) => map.setLayoutProperty(id, 'visibility', 'none')); }
    };
  }

  function addSource(id, geojson) {
    map.addSource(id, { type: 'geojson', data: geojson });
  }

  function addBuildingsLayer() {
    const markers = [];
    const byCategory = {};
    data.buildings.forEach((b) => {
      if (!isValidLngLat(b.coordinates)) {
        console.warn('Skipping building with invalid coordinates:', b.name || b.id);
        return;
      }
      const style = CATEGORY_STYLE[b.category] || CATEGORY_STYLE.academic;
      const { wrapper, inner } = makeBuildingMarkerEl(style.color, b.floors);
      const popup = new maplibregl.Popup({ offset: 26, closeButton: false, maxWidth: '260px' })
        .setHTML(popupHTML(b.name, `${b.buildingNumber} · ${style.label}`, 'View details'));
      bindPopupActions(popup, { onCta: () => dispatch('campus:buildingSelected', { building: b }) });

      const marker = new maplibregl.Marker({ element: wrapper, anchor: 'bottom' })
        .setLngLat(b.coordinates)
        .setPopup(popup)
        .addTo(map);

      inner.setAttribute('tabindex', '0');
      inner.setAttribute('role', 'button');
      inner.setAttribute('aria-label', b.name);
      inner.addEventListener('click', () => bounceMarker(inner, 0));
      inner.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') dispatch('campus:buildingSelected', { building: b });
      });

      marker.buildingId = b.id;
      markersById[`building-${b.id}`] = marker;
      markers.push(marker);
      (byCategory[b.category] = byCategory[b.category] || []).push(marker);
    });
    // Buildings span several categories (academic/library/hostel/food/...);
    // group per-category so filter chips still control each independently.
    Object.entries(byCategory).forEach(([cat, list]) => { layerGroups[cat] = makeMarkerGroup(list); });
    animateMarkersIn(markers.map((m) => m.getElement().firstElementChild));
  }

  function addLandmarksLayer() {
    const markers = [];
    data.geo.landmarks.features.forEach((f) => {
      if (!isValidLngLat(f.geometry?.coordinates)) {
        console.warn('Skipping landmark with invalid coordinates:', f.properties?.name);
        return;
      }
      const faIcon = LANDMARK_ICONS[f.properties.type] || 'fa-star';
      const { wrapper, inner } = makeMarkerEl(CATEGORY_STYLE.landmarks.color, faIcon);
      const popup = new maplibregl.Popup({ offset: 20, closeButton: false, maxWidth: '260px' })
        .setHTML(popupHTML(f.properties.name, f.properties.description, null, f.geometry.coordinates));
      bindPopupActions(popup, { directionsCoord: f.geometry.coordinates, directionsLabel: f.properties.name });

      const marker = new maplibregl.Marker({ element: wrapper, anchor: 'bottom' })
        .setLngLat(f.geometry.coordinates)
        .setPopup(popup)
        .addTo(map);
      inner.addEventListener('click', () => bounceMarker(inner));

      markersById[`landmark-${f.properties.name}`] = marker;
      markers.push(marker);
    });
    layerGroups.landmarks = makeMarkerGroup(markers);
    animateMarkersIn(markers.map((m) => m.getElement().firstElementChild));
  }

  function addEmergencyLayer() {
    const markers = [];
    data.geo.emergency.features.forEach((f) => {
      if (!isValidLngLat(f.geometry?.coordinates)) {
        console.warn('Skipping emergency point with invalid coordinates:', f.properties?.name);
        return;
      }
      const { wrapper, inner } = makeMarkerEl(CATEGORY_STYLE.emergency.color, CATEGORY_STYLE.emergency.faIcon);
      const subtitle = f.properties.contact ? `Contact: ${f.properties.contact}` : '';
      const popup = new maplibregl.Popup({ offset: 20, closeButton: false, maxWidth: '260px' })
        .setHTML(popupHTML(f.properties.name, subtitle, null, f.geometry.coordinates));
      bindPopupActions(popup, { directionsCoord: f.geometry.coordinates, directionsLabel: f.properties.name });

      const marker = new maplibregl.Marker({ element: wrapper, anchor: 'bottom' })
        .setLngLat(f.geometry.coordinates)
        .setPopup(popup)
        .addTo(map);
      inner.addEventListener('click', () => bounceMarker(inner));
      markers.push(marker);
    });
    layerGroups.emergency = makeMarkerGroup(markers);
    animateMarkersIn(markers.map((m) => m.getElement().firstElementChild));
  }

  function addParkingLayer() {
    addSource('parking-src', data.geo.parking);
    map.addLayer({ id: 'parking-fill', type: 'fill', source: 'parking-src', paint: { 'fill-color': CATEGORY_STYLE.parking.color, 'fill-opacity': 0.25 } });
    map.addLayer({ id: 'parking-line', type: 'line', source: 'parking-src', paint: { 'line-color': CATEGORY_STYLE.parking.color, 'line-width': 1, 'line-dasharray': [4, 3] } });

    data.geo.parking.features.forEach((f) => {
      const centroid = turf ? turf.centroid(f).geometry.coordinates : CampusHelpers.polygonCentroid(f.geometry);
      if (!centroid) return;
      const popup = new maplibregl.Popup({ offset: 8, closeButton: false, maxWidth: '260px' })
        .setLngLat(centroid)
        .setHTML(popupHTML(f.properties.name, `Capacity: ${f.properties.capacity || 'N/A'}`, null, centroid));
      bindPopupActions(popup, { directionsCoord: centroid, directionsLabel: f.properties.name });
      map.on('click', 'parking-fill', (e) => {
        if (!turf || !turf.booleanPointInPolygon(turf.point([e.lngLat.lng, e.lngLat.lat]), f)) return;
        popup.addTo(map);
      });
    });
    map.on('mouseenter', 'parking-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'parking-fill', () => { map.getCanvas().style.cursor = ''; });

    layerGroups.parking = makeStyleLayerGroup(['parking-fill', 'parking-line']);
  }

  function addWaterbodiesLayer() {
    addSource('waterbodies-src', data.geo.waterbodies);
    map.addLayer({ id: 'waterbodies-fill', type: 'fill', source: 'waterbodies-src', paint: { 'fill-color': '#6FB4D8', 'fill-opacity': 0.45 } });
    map.addLayer({ id: 'waterbodies-line', type: 'line', source: 'waterbodies-src', paint: { 'line-color': '#2E6BB0', 'line-width': 1 } });
    layerGroups.waterbodies = makeStyleLayerGroup(['waterbodies-fill', 'waterbodies-line']);
  }

  function addRoadsLayer() {
    addSource('roads-src', data.geo.roads);
    map.addLayer({
      id: 'roads-line',
      type: 'line',
      source: 'roads-src',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': CATEGORY_STYLE.roads.color,
        'line-width': ['case', ['==', ['get', 'roadType'], 'main'], 6, 4],
        'line-opacity': 0.9
      }
    });
    layerGroups.roads = makeStyleLayerGroup(['roads-line']);
  }

  /** Live-recolor all road segments (e.g. from a legend color picker). */
  function setRoadColor(color) {
    CATEGORY_STYLE.roads.color = color;
    if (map.getLayer('roads-line')) map.setPaintProperty('roads-line', 'line-color', color);
  }

  function addPathwaysLayer() {
    addSource('pathways-src', data.geo.pathways);
    map.addLayer({
      id: 'pathways-line',
      type: 'line',
      source: 'pathways-src',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#C99A3D', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [1, 3] }
    });
    layerGroups.pathways = makeStyleLayerGroup(['pathways-line']);
  }

  /** Campus outer boundary — a dotted, non-interactive outline drawn from
   *  data/boundary.geojson. Editing that file (any number of points, any
   *  shape) is the only thing needed to change the boundary; this function
   *  just redraws whatever is in it. Not registered as a filterable layer
   *  since it's a fixed reference line, not a category of places. */
  function addBoundaryLayer() {
    const fc = data.geo.boundary;
    if (!fc || !fc.features || !fc.features.length) return;
    addSource('boundary-src', fc);
    map.addLayer({
      id: 'boundary-line',
      type: 'line',
      source: 'boundary-src',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#10233A', 'line-width': 2, 'line-opacity': 0.55, 'line-dasharray': [2, 5] }
    });
  }

  /** Combines the boundary polygon with every building/landmark coordinate
   *  into one bounding box (via Turf), so the initial view — and how far
   *  the map is allowed to pan — always includes everything in /data,
   *  instead of a hardcoded center/zoom that newly added buildings can
   *  fall outside of. */
  function computeContentBounds() {
    const points = [];
    const boundaryFC = data.geo.boundary;
    if (boundaryFC && boundaryFC.features) {
      boundaryFC.features.forEach((f) => {
        const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : [];
        rings.forEach((ring) => ring.forEach((pt) => points.push(pt)));
      });
    }
    (data.buildings || []).forEach((b) => { if (isValidLngLat(b.coordinates)) points.push(b.coordinates); });
    (data.geo.landmarks?.features || []).forEach((f) => {
      if (isValidLngLat(f.geometry?.coordinates)) points.push(f.geometry.coordinates);
    });
    if (!points.length) return [[CAMPUS_CENTER[1] - 0.01, CAMPUS_CENTER[0] - 0.01], [CAMPUS_CENTER[1] + 0.01, CAMPUS_CENTER[0] + 0.01]];
    if (turf) {
      const fc = turf.featureCollection(points.map((p) => turf.point(p)));
      const [minX, minY, maxX, maxY] = turf.bbox(fc);
      return [[minX, minY], [maxX, maxY]];
    }
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
  }

  /** Pads a [[minLng,minLat],[maxLng,maxLat]] box by a fraction of its
   *  own size — a stand-in for Leaflet's bounds.pad(). */
  function padBounds(bounds, fraction) {
    const [[minX, minY], [maxX, maxY]] = bounds;
    const padX = (maxX - minX) * fraction || 0.01;
    const padY = (maxY - minY) * fraction || 0.01;
    return [[minX - padX, minY - padY], [maxX + padX, maxY + padY]];
  }

  let routeTween = null;
  /** Draws (or clears, if coords is null) the active route as a line
   *  that animates its way in with GSAP, using turf.lineSliceAlong to
   *  compute how much of the path should be visible on every tick —
   *  plus start/end flag dots, same as the old Leaflet version. */
  function drawRoute(coordsLngLat, options = {}) {
    if (routeTween) { routeTween.kill(); routeTween = null; }
    clearRoute();
    if (!coordsLngLat || coordsLngLat.length < 2) return;

    const color = options.color || '#1B7A72';
    const fullLine = turf ? turf.lineString(coordsLngLat) : { type: 'Feature', geometry: { type: 'LineString', coordinates: coordsLngLat } };
    const fullLength = turf ? turf.length(fullLine, { units: 'kilometers' }) : 0;

    addSource('route-src', { type: 'FeatureCollection', features: [] });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-src',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': 5, 'line-opacity': 0.95, 'line-dasharray': [1, 3] }
    });
    addSource('route-flags-src', {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { role: 'start' }, geometry: { type: 'Point', coordinates: coordsLngLat[0] } },
        { type: 'Feature', properties: { role: 'end' }, geometry: { type: 'Point', coordinates: coordsLngLat[coordsLngLat.length - 1] } }
      ]
    });
    map.addLayer({
      id: 'route-flags',
      type: 'circle',
      source: 'route-flags-src',
      paint: {
        'circle-radius': 7,
        'circle-color': ['match', ['get', 'role'], 'start', color, 'end', '#C4453B', color],
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2
      }
    });

    const setProgress = (t) => {
      const src = map.getSource('route-src');
      if (!src) return;
      const partial = (!turf || t >= 1)
        ? fullLine
        : turf.lineSliceAlong(fullLine, 0, Math.max(fullLength * t, 0.0001), { units: 'kilometers' });
      src.setData({ type: 'FeatureCollection', features: [partial] });
    };

    if (global.gsap) {
      const progress = { t: 0 };
      routeTween = gsap.to(progress, { t: 1, duration: 0.9, ease: 'power1.inOut', onUpdate: () => setProgress(progress.t) });
    } else {
      setProgress(1);
    }

    const bounds = coordsLngLat.reduce(
      (b, c) => [[Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])], [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])]],
      [[coordsLngLat[0][0], coordsLngLat[0][1]], [coordsLngLat[0][0], coordsLngLat[0][1]]]
    );
    map.fitBounds(bounds, { padding: 80, duration: 700 });
  }

  function clearRoute() {
    ['route-line', 'route-flags'].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
    ['route-src', 'route-flags-src'].forEach((id) => { if (map.getSource(id)) map.removeSource(id); });
  }

  function focusOn(lngLat, zoom = 18) {
    map.flyTo({ center: lngLat, zoom, duration: 900 });
  }

  function focusMarker(key) {
    const marker = markersById[key];
    if (!marker) return;
    const lngLat = marker.getLngLat();
    map.flyTo({ center: lngLat, zoom: 18, duration: 900 });
    setTimeout(() => marker.togglePopup(), 500);
  }

  /** Swaps the basemap raster tiles between the light and dark CARTO
   *  layers. Replaces the old CSS invert-filter trick: MapLibre GL
   *  renders our own vector layers on the same WebGL canvas as the
   *  basemap, so there's no separate "tile pane" left to filter — a
   *  matching dark tileset is the correct fix instead. */
  function setBaseTheme(mode) {
    if (!map || !map.getSource('basemap-src')) return;
    map.getSource('basemap-src').setTiles([mode === 'dark' ? BASEMAP.dark : BASEMAP.light]);
  }

  function init(loadedData) {
    data = loadedData;

    map = new maplibregl.Map({
      container: 'map-canvas',
      style: {
        version: 8,
        sources: {},
        layers: [],
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
      },
      center: [CAMPUS_CENTER[1], CAMPUS_CENTER[0]],
      zoom: DEFAULT_ZOOM,
      minZoom: 14,
      maxZoom: 20,
      minPitch: 0,
      maxPitch: 0, // hard lock: the map itself never tilts, only rotates
      pitchWithRotate: false, // right-drag/two-finger changes bearing, never pitch
      dragRotate: true, // rotating the flat map IS allowed
      touchZoomRotate: true,
      attributionControl: { compact: true }
    });

    const ready = new Promise((resolve) => {
      map.on('load', () => {
        // Muted, open basemap used only for surrounding geographic context.
        map.addSource('basemap-src', {
          type: 'raster',
          tiles: [document.documentElement.getAttribute('data-theme') === 'dark' ? BASEMAP.dark : BASEMAP.light],
          tileSize: 256,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        });
        map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap-src' });

        addBoundaryLayer();
        addRoadsLayer();
        addPathwaysLayer();
        addWaterbodiesLayer();
        addParkingLayer();
        addBuildingsLayer();
        addLandmarksLayer();
        addEmergencyLayer();

        // Decorative "illustrated guide map" layer: grass ground, textured
        // lake + reeds, procedurally scattered trees, extruded 3D building
        // blocks and bridge glyphs — all derived at runtime from the data
        // already loaded above, no dataset edits needed. Safe to skip if
        // scenery.js wasn't loaded for some reason.
        if (global.CampusScenery) {
          try { global.CampusScenery.init(map, data); }
          catch (err) { console.warn('CampusScenery failed to initialize:', err); }
        }

        // Fit the initial view — and cap how far the map can be panned — to
        // whatever is actually in /data (boundary + buildings + landmarks)
        // instead of a hardcoded center/zoom. Recomputed from the live data
        // on every load, so the map always grows to fit whatever's in /data.
        const contentBounds = computeContentBounds();
        map.fitBounds(padBounds(contentBounds, 0.12), { animate: false });
        map.setMaxBounds(padBounds(contentBounds, 0.35));

        dispatch('campus:mapReady', {});
        resolve(map);
      });
    });

    map.on('moveend', () => dispatch('campus:mapMoved', { center: map.getCenter(), zoom: map.getZoom() }));

    return ready;
  }

  global.CampusMap = {
    init,
    getMap: () => map,
    getLayerGroups: () => layerGroups,
    getCategoryStyle: () => CATEGORY_STYLE,
    focusOn,
    focusMarker,
    drawRoute,
    setRoadColor,
    setBaseTheme,
    computeContentBounds,
    resetNorth: () => map.easeTo({ bearing: 0, duration: 450 }),
    getBearing: () => map.getBearing(),
    onRotate: (cb) => map.on('rotate', () => cb(map.getBearing())),
    CAMPUS_CENTER
  };
})(window);
