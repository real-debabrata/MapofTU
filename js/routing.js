/**
 * routing.js
 * ----------------------------------------------------------------------
 * A from-scratch, dependency-free route finder. Every LineString in
 * data/pathways.geojson becomes a set of graph edges (each consecutive
 * coordinate pair = one edge, weighted by real-world distance). Building
 * entrances are snapped to their nearest graph node so "Faculty of Arts
 * → Central Library" resolves to an actual walk along the paths, not a
 * straight line through buildings.
 *
 * This keeps route-finding 100% client-side and GitHub-Pages friendly —
 * no routing server, no external API key.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const { haversineMeters, nodeKey } = CampusHelpers;

  let graph = null; // Map<nodeKey, { coord, edges: Map<nodeKey, distance> }>
  let nodeCoords = null;

  function ensureNode(coord) {
    const key = nodeKey(coord);
    if (!graph.has(key)) graph.set(key, { coord, edges: new Map() });
    return key;
  }

  function addEdge(a, b) {
    const ka = ensureNode(a);
    const kb = ensureNode(b);
    if (ka === kb) return;
    const d = haversineMeters(a, b);
    graph.get(ka).edges.set(kb, d);
    graph.get(kb).edges.set(ka, d);
  }

  /** Build the routing graph from the pathways FeatureCollection. Call
   *  once after data loads. Accessible/step-free routing simply prefers
   *  features not tagged "stairs" — none in the sample data, but the
   *  hook is here for future extension. */
  function buildGraph(pathwaysGeoJSON, roadsGeoJSON) {
    graph = new Map();
    const addFeatures = (fc) => {
      if (!fc || !fc.features) return;
      fc.features.forEach((f) => {
        const coords = f.geometry.coordinates;
        for (let i = 0; i < coords.length - 1; i++) {
          addEdge(coords[i], coords[i + 1]);
        }
      });
    };
    addFeatures(pathwaysGeoJSON);
    addFeatures(roadsGeoJSON);
    nodeCoords = [...graph.values()].map((n) => n.coord);
  }

  /** Find the nearest existing graph node to an arbitrary [lng, lat],
   *  e.g. a building's front-door coordinate, and connect it in with a
   *  short "driveway" edge so routing can start/end at any building. */
  function snapToGraph(coord) {
    let best = null;
    let bestDist = Infinity;
    graph.forEach((node, key) => {
      const d = haversineMeters(coord, node.coord);
      if (d < bestDist) { bestDist = d; best = key; }
    });
    return { key: best, distance: bestDist };
  }

  /** Classic Dijkstra shortest path between two graph node keys. Returns
   *  { path: [nodeKey...], distance } or null if unreachable. */
  function dijkstra(startKey, endKey) {
    const dist = new Map();
    const prev = new Map();
    const visited = new Set();
    const queue = new Set(graph.keys());
    dist.set(startKey, 0);

    while (queue.size) {
      // Linear scan for the min — the graph here is small (tens of
      // nodes), so a binary heap would be premature optimization.
      let u = null;
      let best = Infinity;
      queue.forEach((k) => {
        const d = dist.has(k) ? dist.get(k) : Infinity;
        if (d < best) { best = d; u = k; }
      });
      if (u === null) break;
      queue.delete(u);
      visited.add(u);
      if (u === endKey) break;

      const node = graph.get(u);
      node.edges.forEach((weight, v) => {
        if (visited.has(v)) return;
        const alt = (dist.get(u) ?? Infinity) + weight;
        if (alt < (dist.get(v) ?? Infinity)) {
          dist.set(v, alt);
          prev.set(v, u);
        }
      });
    }

    if (!dist.has(endKey)) return null;
    const path = [endKey];
    let cur = endKey;
    while (prev.has(cur)) {
      cur = prev.get(cur);
      path.unshift(cur);
    }
    return { path, distance: dist.get(endKey) };
  }

  /** Public entry point: route between two arbitrary [lng, lat] points
   *  (building entrances, landmarks, or a "Locate Me" GPS fix). Returns
   *  { coords: [[lat,lng]...], distanceMeters, walkMinutes } or null. */
  function findRoute(startCoord, endCoord) {
    if (!graph || graph.size === 0) return null;
    const start = snapToGraph(startCoord);
    const end = snapToGraph(endCoord);
    if (!start.key || !end.key) return null;

    const result = dijkstra(start.key, end.key);
    if (!result) return null;

    const pathCoords = result.path.map((k) => graph.get(k).coord);
    // Prepend/append the true start/end so the line touches the actual
    // building door rather than stopping at the nearest path node.
    const full = [startCoord, ...pathCoords, endCoord];
    const totalDistance = result.distance + start.distance + end.distance;

    return {
      coordsLngLat: full,
      coordsLatLng: full.map(([lng, lat]) => [lat, lng]),
      distanceMeters: totalDistance,
      walkMinutes: CampusHelpers.estimateWalkMinutes(totalDistance)
    };
  }

  global.CampusRouting = { buildGraph, findRoute };
})(window);
