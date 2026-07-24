/**
 * scenery.js
 * ----------------------------------------------------------------------
 * Adds the "illustrated guide map" layer of detail on top of the core
 * MapLibre layers built in map.js: a grass ground fill, procedurally
 * scattered trees, a textured lake with reeds, and small bridge glyphs
 * wherever a road/path crosses water. (3D building blocks are handled
 * separately in map.js as isometric icon markers — see
 * makeBuildingMarkerEl — since the map itself stays flat and only
 * rotates, never tilts, so a real fill-extrusion layer wouldn't read
 * as 3D here.)
 *
 * Everything here is DERIVED at runtime from the existing /data files —
 * no dataset edits required. Canvas-drawn textures are registered with
 * map.addImage() and used as fill-pattern / icon-image sources.
 *
 * Public surface: CampusScenery.init(map, data) — called once from
 * map.js right after the core layers are built.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const turf = global.turf;

  /* ---------------------------------------------------------------- *
   * Canvas texture / icon generation
   * ---------------------------------------------------------------- */

  function makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    return c;
  }

  /** Tileable grass swatch: base green + short randomized blade strokes. */
  function grassPattern() {
    const size = 64;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#B9D6A0';
    ctx.fillRect(0, 0, size, size);
    const rng = mulberry32(7);
    for (let i = 0; i < 90; i++) {
      const x = rng() * size, y = rng() * size;
      const h = 3 + rng() * 5;
      ctx.strokeStyle = rng() > 0.5 ? 'rgba(94,142,72,0.55)' : 'rgba(163,196,132,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 3, y - h);
      ctx.stroke();
    }
    return c;
  }

  /** Tileable water swatch: blue base + soft ripple curves. */
  function waterPattern() {
    const size = 64;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#8FC3E0');
    grad.addColorStop(1, '#5FA0CB');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.4;
    for (let y = 8; y < size; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(size / 4, y - 5, size / 2, y);
      ctx.quadraticCurveTo(size * 3 / 4, y + 5, size, y);
      ctx.stroke();
    }
    return c;
  }

  /** Small top-down tree icon: canopy blob(s) + a hint of trunk shadow. */
  function treeIcon(tone) {
    const size = 28;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const palettes = {
      deep: ['#2F6B3A', '#3E8449'],
      mid: ['#3E8449', '#57A05E'],
      light: ['#57A05E', '#79BC77']
    };
    const [dark, light] = palettes[tone] || palettes.mid;
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2 + 2, 6, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16,35,58,0.18)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2 - 2, 9, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size / 2 - 3, size / 2 - 5, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = light;
    ctx.fill();
    return c;
  }

  /** Small reed/lily glyph used along the shoreline. */
  function reedIcon() {
    const size = 20;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#3E8449';
    ctx.lineWidth = 1.4;
    [[6, 0], [10, -3], [14, 1]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(size / 2, size - 2);
      ctx.quadraticCurveTo(size / 2 + dx * 0.4, size / 2, size / 2 + dx - 6 + dy, 4);
      ctx.stroke();
    });
    return c;
  }

  /** Little isometric-looking bridge glyph (deck + rails). */
  function bridgeIcon() {
    const size = 26;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#D8CBA8';
    ctx.fillRect(3, 11, 20, 5);
    ctx.strokeStyle = '#8A7A52';
    ctx.lineWidth = 1;
    for (let x = 4; x <= 22; x += 4) {
      ctx.beginPath(); ctx.moveTo(x, 11); ctx.lineTo(x, 16); ctx.stroke();
    }
    ctx.strokeStyle = '#5A4E33';
    ctx.beginPath(); ctx.moveTo(2, 11); ctx.lineTo(24, 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 16); ctx.lineTo(24, 16); ctx.stroke();
    return c;
  }

  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function registerImages(map) {
    const images = {
      'grass-pattern': grassPattern(),
      'water-pattern': waterPattern(),
      'tree-deep': treeIcon('deep'),
      'tree-mid': treeIcon('mid'),
      'tree-light': treeIcon('light'),
      'reed-icon': reedIcon(),
      'bridge-icon': bridgeIcon()
    };
    Object.entries(images).forEach(([id, canvas]) => {
      if (!map.hasImage(id)) map.addImage(id, canvas, { pixelRatio: 2 });
    });
  }

  /* ---------------------------------------------------------------- *
   * Ground (grass) layer — fills the campus boundary polygon
   * ---------------------------------------------------------------- */
  function addGround(map, boundaryFC) {
    if (!boundaryFC || !boundaryFC.features.length) return;
    map.addSource('ground-src', { type: 'geojson', data: boundaryFC });
    map.addLayer({
      id: 'ground-fill',
      type: 'fill',
      source: 'ground-src',
      paint: { 'fill-pattern': 'grass-pattern', 'fill-opacity': 0.9 }
    }, 'boundary-line');
  }

  /* ---------------------------------------------------------------- *
   * Water: textured fill + soft sandy shoreline halo + reeds
   * ---------------------------------------------------------------- */
  function upgradeWater(map, waterFC) {
    if (!waterFC || !waterFC.features.length || !map.getLayer('waterbodies-fill')) return;

    // Sandy halo: a thick line traced along each polygon's outline gives
    // a soft buffered "shore" without needing turf.buffer per feature.
    map.addLayer({
      id: 'waterbodies-shore',
      type: 'line',
      source: 'waterbodies-src',
      paint: { 'line-color': '#E9DFC0', 'line-width': 10, 'line-blur': 2, 'line-opacity': 0.7 }
    }, 'waterbodies-fill');

    map.setPaintProperty('waterbodies-fill', 'fill-pattern', 'water-pattern');
    map.setPaintProperty('waterbodies-fill', 'fill-opacity', 0.92);
    map.setPaintProperty('waterbodies-line', 'line-color', '#3E7CA6');

    // Reeds sampled along each polygon's perimeter.
    const reedPoints = [];
    waterFC.features.forEach((f) => {
      const line = turf.polygonToLine(f);
      const len = turf.length(line, { units: 'kilometers' });
      const step = Math.max(len / 14, 0.006);
      for (let d = 0; d < len; d += step) {
        reedPoints.push(turf.along(line, d, { units: 'kilometers' }));
      }
    });
    map.addSource('reeds-src', { type: 'geojson', data: turf.featureCollection(reedPoints) });
    map.addLayer({
      id: 'reeds-symbol',
      type: 'symbol',
      source: 'reeds-src',
      layout: { 'icon-image': 'reed-icon', 'icon-size': 0.8, 'icon-allow-overlap': true }
    });
  }

  /* ---------------------------------------------------------------- *
   * Procedurally scattered trees inside the boundary
   * ---------------------------------------------------------------- */
  function scatterTrees(map, boundaryFC, buildings, roadsFC, pathwaysFC, waterFC) {
    if (!boundaryFC || !boundaryFC.features.length) return;
    const boundaryPoly = boundaryFC.features[0];
    const bbox = turf.bbox(boundaryPoly);

    const lineFeatures = []
      .concat(roadsFC ? roadsFC.features : [])
      .concat(pathwaysFC ? pathwaysFC.features : []);
    const waterFeatures = waterFC ? waterFC.features : [];
    const buildingPts = (buildings || [])
      .filter((b) => Array.isArray(b.coordinates) && b.coordinates.length === 2)
      .map((b) => turf.point(b.coordinates));

    const candidates = turf.randomPoint(420, { bbox }).features;
    const inside = turf.pointsWithinPolygon(turf.featureCollection(candidates), boundaryPoly).features;

    const kept = [];
    const rng = mulberry32(42);
    inside.forEach((pt) => {
      const tooCloseToBuilding = buildingPts.some((bp) => turf.distance(pt, bp, { units: 'meters' }) < 16);
      if (tooCloseToBuilding) return;
      const tooCloseToLine = lineFeatures.some((line) => {
        try { return turf.pointToLineDistance(pt, line, { units: 'meters' }) < 7; } catch (e) { return false; }
      });
      if (tooCloseToLine) return;
      const inWater = waterFeatures.some((w) => turf.booleanPointInPolygon(pt, w));
      if (inWater) return;
      // Thin the crowd a little so it reads as scattered tree cover
      // rather than a solid carpet.
      if (rng() > 0.55) return;
      kept.push(pt);
    });

    const tones = ['tree-deep', 'tree-mid', 'tree-light'];
    kept.forEach((pt, i) => { pt.properties = { icon: tones[i % tones.length] }; });

    map.addSource('trees-src', { type: 'geojson', data: turf.featureCollection(kept) });
    map.addLayer({
      id: 'trees-symbol',
      type: 'symbol',
      source: 'trees-src',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.35, 18, 0.9],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    }, 'parking-fill');
  }

  /* ---------------------------------------------------------------- *
   * Bridges: wherever a road/path crosses a waterbody edge
   * ---------------------------------------------------------------- */
  function addBridges(map, roadsFC, pathwaysFC, waterFC) {
    if (!waterFC || !waterFC.features.length) return;
    const lines = [].concat(roadsFC ? roadsFC.features : []).concat(pathwaysFC ? pathwaysFC.features : []);
    const bridgePoints = [];

    waterFC.features.forEach((water) => {
      const waterOutline = turf.polygonToLine(water);
      lines.forEach((line) => {
        const hits = turf.lineIntersect(line, waterOutline);
        if (hits.features.length >= 2) {
          // Midpoint between the entry/exit crossing = the bridge deck.
          const [a, b] = hits.features;
          const mid = turf.midpoint(a, b);
          bridgePoints.push(mid);
        } else if (hits.features.length === 1) {
          bridgePoints.push(hits.features[0]);
        }
      });
    });

    // Fallback for datasets where no road/path geometry actually crosses a
    // waterbody (true here for the sample data): drop one decorative bridge
    // glyph at the point on the shoreline nearest the closest road/path, so
    // the feature still reads on the map instead of silently rendering
    // nothing. Real crossings (once roads/pathways are edited to cross
    // water) take priority and this fallback is skipped.
    if (!bridgePoints.length) {
      waterFC.features.forEach((water) => {
        const outline = turf.polygonToLine(water);
        let best = null, bestDist = Infinity;
        lines.forEach((line) => {
          const coords = turf.getCoords(line);
          (coords || []).forEach((c) => {
            const onShore = turf.nearestPointOnLine(outline, turf.point(c));
            if (onShore.properties.dist < bestDist) { bestDist = onShore.properties.dist; best = onShore; }
          });
        });
        if (best) bridgePoints.push(best);
      });
    }

    if (!bridgePoints.length) return;
    map.addSource('bridges-src', { type: 'geojson', data: turf.featureCollection(bridgePoints) });
    map.addLayer({
      id: 'bridges-symbol',
      type: 'symbol',
      source: 'bridges-src',
      layout: { 'icon-image': 'bridge-icon', 'icon-size': 1, 'icon-allow-overlap': true, 'icon-rotate': 0 }
    });
  }

  /* ---------------------------------------------------------------- *
   * Public API
   * ---------------------------------------------------------------- */
  function init(map, data) {
    if (!turf) { console.warn('CampusScenery: turf.js not found, skipping decorative layers'); return; }
    registerImages(map);
    addGround(map, data.geo.boundary);
    upgradeWater(map, data.geo.waterbodies);
    scatterTrees(map, data.geo.boundary, data.buildings, data.geo.roads, data.geo.pathways, data.geo.waterbodies);
    addBridges(map, data.geo.roads, data.geo.pathways, data.geo.waterbodies);
  }

  global.CampusScenery = { init };
})(window);
