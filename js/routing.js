/**
 * routing.js
 * ----------------------------------------------------------------------
 * A from-scratch, dependency-free route finder. Every LineString in
 * data/pathways.geojson and data/roads.geojson becomes a set of graph
 * edges (each consecutive coordinate pair = one edge, weighted by
 * real-world distance), merged into ONE graph so Dijkstra can freely
 * mix footpaths and roads in a single route.
 *
 * Two independently-digitized networks almost never share an exact
 * vertex where they actually run alongside or cross each other, so on
 * top of vertex-to-vertex stitching this also projects each node onto
 * the nearest point ALONG any opposite-network segment (not just its
 * endpoints) and splices in a junction there. Without this, a genuine
 * real-world shortcut between the two networks is invisible to
 * Dijkstra whenever it doesn't happen to land on a digitized vertex —
 * which is most of the time — and the router is forced the long way
 * around one network instead of cutting across to the other.
 *
 * Building/GPS entrances are snapped the same way: onto the nearest
 * point along any path/road segment, not just the nearest vertex, so a
 * route starts/ends at the true closest point on the network.
 *
 * This keeps route-finding 100% client-side and GitHub-Pages friendly —
 * no routing server, no external API key.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const { haversineMeters, nodeKey } = CampusHelpers;

  let graph = null; // Map<nodeKey, { coord, edges: Map<nodeKey, distance>, types: Set }>

  function ensureNode(coord, type, journal) {
    const key = nodeKey(coord);
    if (!graph.has(key)) {
      graph.set(key, { coord, edges: new Map(), types: new Set() });
      if (journal) journal.addedNodes.push(key);
    }
    if (type) graph.get(key).types.add(type);
    return key;
  }

  function addEdge(a, b, type, journal) {
    const ka = ensureNode(a, type, journal);
    const kb = ensureNode(b, type, journal);
    if (ka === kb) return ka;
    const already = graph.get(ka).edges.has(kb);
    const d = haversineMeters(a, b);
    graph.get(ka).edges.set(kb, d);
    graph.get(kb).edges.set(ka, d);
    if (journal && !already) journal.addedEdges.push([ka, kb]);
    return ka;
  }

  function removeEdge(ka, kb, journal) {
    const hadWeight = graph.has(ka) ? graph.get(ka).edges.get(kb) : undefined;
    if (graph.has(ka)) graph.get(ka).edges.delete(kb);
    if (graph.has(kb)) graph.get(kb).edges.delete(ka);
    if (journal && hadWeight !== undefined) journal.removedEdges.push([ka, kb, hadWeight]);
  }

  /** Dead-end (a.k.a. dangling) nodes are path/road endpoints that were
   *  meant to meet another feature but, because pathways and roads are
   *  digitized independently, land a few metres short of it. Left
   *  alone, this splits the graph into unreachable islands. This pass
   *  bridges any dead end to the nearest node within STITCH_TOLERANCE_M. */
  const STITCH_TOLERANCE_M = 20;

  function stitchDeadEnds(toleranceMeters) {
    const keys = [...graph.keys()];
    const deadEnds = keys.filter((k) => graph.get(k).edges.size <= 1);

    deadEnds.forEach((k) => {
      const node = graph.get(k);
      let bestKey = null;
      let bestDist = Infinity;
      keys.forEach((other) => {
        if (other === k || node.edges.has(other)) return;
        const d = haversineMeters(node.coord, graph.get(other).coord);
        if (d < bestDist) { bestDist = d; bestKey = other; }
      });
      if (bestKey !== null && bestDist <= toleranceMeters) {
        addEdge(node.coord, graph.get(bestKey).coord);
      }
    });
  }

  /** Vertex-to-vertex bridge between the two networks, for the case
   *  where a road/path endpoint lands close to the other network's
   *  endpoint. Restricted to cross-type pairs (road<->path only) so it
   *  never invents shortcuts across a path's own bends. */
  const CROSS_TYPE_BRIDGE_TOLERANCE_M = 50;

  function bridgeCrossType(toleranceMeters) {
    const keys = [...graph.keys()];
    const otherType = { path: 'road', road: 'path' };

    keys.forEach((k) => {
      const node = graph.get(k);
      ['path', 'road'].forEach((type) => {
        if (!node.types.has(type) || node.types.has(otherType[type])) return;
        let bestKey = null;
        let bestDist = Infinity;
        keys.forEach((candidate) => {
          if (candidate === k || node.edges.has(candidate)) return;
          const candidateNode = graph.get(candidate);
          if (!candidateNode.types.has(otherType[type])) return;
          const d = haversineMeters(node.coord, candidateNode.coord);
          if (d < bestDist) { bestDist = d; bestKey = candidate; }
        });
        if (bestKey !== null && bestDist <= toleranceMeters) {
          addEdge(node.coord, graph.get(bestKey).coord);
        }
      });
    });
  }

  // -- Point-to-segment projection -----------------------------------
  // Local equirectangular projection (accurate to a few cm at campus
  // scale) so we can find the closest point ALONG a segment, not just
  // its two endpoints.
  function toLocalXY(coord, origin) {
    const R = 6371000;
    const rad = Math.PI / 180;
    return [
      (coord[0] - origin[0]) * rad * R * Math.cos(origin[1] * rad),
      (coord[1] - origin[1]) * rad * R
    ];
  }
  function fromLocalXY(xy, origin) {
    const R = 6371000;
    const deg = 180 / Math.PI;
    return [
      origin[0] + (xy[0] / (R * Math.cos(origin[1] * Math.PI / 180))) * deg,
      origin[1] + (xy[1] / R) * deg
    ];
  }
  function closestPointOnSegment(p, a, b) {
    const A = [0, 0];
    const B = toLocalXY(b, a);
    const P = toLocalXY(p, a);
    const abx = B[0] - A[0], aby = B[1] - A[1];
    const len2 = abx * abx + aby * aby;
    let t = len2 === 0 ? 0 : ((P[0] - A[0]) * abx + (P[1] - A[1]) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const foot = [A[0] + abx * t, A[1] + aby * t];
    const coord = fromLocalXY(foot, a);
    return { coord, t, distance: haversineMeters(p, coord) };
  }

  /** Every undirected edge currently in the graph, as {aKey, bKey}. */
  function collectSegments() {
    const segments = [];
    const seen = new Set();
    graph.forEach((node, aKey) => {
      node.edges.forEach((weight, bKey) => {
        const id = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
        if (seen.has(id)) return;
        seen.add(id);
        segments.push({ aKey, bKey });
      });
    });
    return segments;
  }

  /** Splice `fromKey` into segment (aKey-bKey) at the given point.
   *  Reuses an endpoint instead of creating a near-duplicate node when
   *  the point lands within ~1% of the segment's length from it. */
  function spliceIntoSegment(seg, coord, t, fromKey, journal) {
    const aNode = graph.get(seg.aKey);
    const bNode = graph.get(seg.bKey);
    const fromCoord = graph.get(fromKey).coord;
    if (t <= 0.01) { addEdge(fromCoord, aNode.coord, undefined, journal); return; }
    if (t >= 0.99) { addEdge(fromCoord, bNode.coord, undefined, journal); return; }

    const combinedTypes = new Set([...aNode.types, ...bNode.types]);
    removeEdge(seg.aKey, seg.bKey, journal);
    const jKey = ensureNode(coord, undefined, journal);
    combinedTypes.forEach((t2) => graph.get(jKey).types.add(t2));
    addEdge(aNode.coord, coord, undefined, journal);
    addEdge(coord, bNode.coord, undefined, journal);
    addEdge(fromCoord, coord, undefined, journal);
  }

  /** For every node that only touches ONE network, look for a nearer
   *  connection along any segment of the OTHER network (not just at
   *  its endpoints) and splice one in if found within tolerance. This
   *  is what lets a road cut across the middle of a footpath (or vice
   *  versa) the way a real crosswalk or curb cut does, instead of only
   *  ever bridging where the two networks happen to share a digitized
   *  vertex. */
  const PROJECTION_BRIDGE_TOLERANCE_M = 40;

  function bridgeViaProjection(toleranceMeters) {
    let segments = collectSegments();
    const otherType = { path: 'road', road: 'path' };
    const keys = [...graph.keys()];

    keys.forEach((k) => {
      const node = graph.get(k);
      ['path', 'road'].forEach((type) => {
        if (!node.types.has(type) || node.types.has(otherType[type])) return;
        let best = null;
        segments.forEach((seg) => {
          if (seg.aKey === k || seg.bKey === k) return;
          if (node.edges.has(seg.aKey) || node.edges.has(seg.bKey)) return;
          const aNode = graph.get(seg.aKey), bNode = graph.get(seg.bKey);
          if (!aNode.types.has(otherType[type]) && !bNode.types.has(otherType[type])) return;
          const proj = closestPointOnSegment(node.coord, aNode.coord, bNode.coord);
          if (!best || proj.distance < best.distance) best = { ...proj, seg };
        });
        if (best && best.distance > 1 && best.distance <= toleranceMeters) {
          spliceIntoSegment(best.seg, best.coord, best.t, k);
          segments = collectSegments();
        }
      });
    });
  }

  /** Build the routing graph from both networks. Call once after data
   *  loads. Accessible/step-free routing simply prefers features not
   *  tagged "stairs" — none in the sample data, but the hook is here
   *  for future extension. */
  function buildGraph(pathwaysGeoJSON, roadsGeoJSON) {
    graph = new Map();
    const addFeatures = (fc, type) => {
      if (!fc || !fc.features) return;
      fc.features.forEach((f) => {
        const coords = f.geometry.coordinates;
        for (let i = 0; i < coords.length - 1; i++) {
          addEdge(coords[i], coords[i + 1], type);
        }
      });
    };
    addFeatures(pathwaysGeoJSON, 'path');
    addFeatures(roadsGeoJSON, 'road');
    stitchDeadEnds(STITCH_TOLERANCE_M);
    bridgeCrossType(CROSS_TYPE_BRIDGE_TOLERANCE_M);
    bridgeViaProjection(PROJECTION_BRIDGE_TOLERANCE_M);
  }

  /** Join an arbitrary [lng, lat] (a building entrance, a GPS fix) into
   *  the graph at the closest point along ANY existing path/road
   *  segment — not just the closest already-digitized vertex — falling
   *  back to the closest node if no segment is close enough. Records
   *  every change into `journal` so findRoute can revert it afterwards
   *  and keep the graph itself unchanged between queries. */
  function snapToGraph(coord, journal) {
    let bestNodeKey = null;
    let bestNodeDist = Infinity;
    graph.forEach((node, key) => {
      const d = haversineMeters(coord, node.coord);
      if (d < bestNodeDist) { bestNodeDist = d; bestNodeKey = key; }
    });

    let bestSeg = null;
    collectSegments().forEach((seg) => {
      const a = graph.get(seg.aKey).coord, b = graph.get(seg.bKey).coord;
      const proj = closestPointOnSegment(coord, a, b);
      if (!bestSeg || proj.distance < bestSeg.distance) bestSeg = { ...proj, seg };
    });

    const entranceKey = ensureNode(coord, undefined, journal);
    if (bestSeg && bestSeg.distance + 0.5 < bestNodeDist) {
      spliceIntoSegment(bestSeg.seg, bestSeg.coord, bestSeg.t, entranceKey, journal);
    } else if (bestNodeKey !== null && bestNodeKey !== entranceKey) {
      addEdge(coord, graph.get(bestNodeKey).coord, undefined, journal);
    }
    return entranceKey;
  }

  /** Undo every change `journal` recorded, restoring the shared graph
   *  to exactly the state it was in before a findRoute() call. */
  function revertJournal(journal) {
    journal.addedEdges.slice().reverse().forEach(([a, b]) => removeEdge(a, b));
    journal.removedEdges.slice().reverse().forEach(([a, b, d]) => {
      if (graph.has(a)) graph.get(a).edges.set(b, d);
      if (graph.has(b)) graph.get(b).edges.set(a, d);
    });
    journal.addedNodes.forEach((k) => graph.delete(k));
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
   *  { coords: [[lat,lng]...], distanceMeters, walkMinutes } or null.
   *  Snapping the start/end into the graph is ephemeral: it's reverted
   *  after every call so repeated queries never bloat the shared graph
   *  or drift its topology. */
  function findRoute(startCoord, endCoord) {
    if (!graph || graph.size === 0) return null;

    const journal = { addedNodes: [], addedEdges: [], removedEdges: [] };
    const startKey = snapToGraph(startCoord, journal);
    const endKey = snapToGraph(endCoord, journal);

    const result = dijkstra(startKey, endKey);
    if (!result) { revertJournal(journal); return null; }

    const coordsLngLat = result.path.map((k) => graph.get(k).coord);
    const distanceMeters = result.distance;
    revertJournal(journal);

    return {
      coordsLngLat,
      coordsLatLng: coordsLngLat.map(([lng, lat]) => [lat, lng]),
      distanceMeters,
      walkMinutes: CampusHelpers.estimateWalkMinutes(distanceMeters)
    };
  }

  global.CampusRouting = { buildGraph, findRoute };
})(window);
