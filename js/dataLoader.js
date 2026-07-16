/**
 * dataLoader.js
 * ----------------------------------------------------------------------
 * Every dataset the app needs lives in /data as plain JSON or GeoJSON.
 * Nothing is ever hardcoded in JS — swap a file in /data and the whole
 * app updates. This module fetches everything once, caches it in
 * memory, and exposes a single `CampusData.loadAll()` promise.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const DATA_PATHS = {
    buildings: 'data/buildings.json',
    rooms: 'data/rooms.json',
    departments: 'data/departments.json',
    roads: 'data/roads.geojson',
    pathways: 'data/pathways.geojson',
    landmarks: 'data/landmarks.geojson',
    parking: 'data/parking.geojson',
    waterbodies: 'data/waterbodies.geojson',
    emergency: 'data/emergency.geojson',
    boundary: 'data/boundary.geojson'
  };

  let cache = null;
  let loadingPromise = null;

  async function fetchJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
    }
    return res.json();
  }

  /** Loads every data file in parallel and normalizes shapes so the
   *  rest of the app can rely on: buildings[], rooms[], departments[],
   *  and geo.<name> = FeatureCollection. */
  function loadAll() {
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      const entries = Object.entries(DATA_PATHS);
      const results = await Promise.all(
        entries.map(([key, path]) =>
          fetchJSON(path).catch((err) => {
            console.error(err);
            // Degrade gracefully: an empty collection/array rather than
            // a hard crash, so one bad file doesn't take down the app.
            return path.endsWith('.geojson')
              ? { type: 'FeatureCollection', features: [] }
              : [];
          })
        )
      );

      const raw = Object.fromEntries(entries.map(([key], i) => [key, results[i]]));

      cache = {
        buildings: raw.buildings.buildings || [],
        rooms: raw.rooms.rooms || [],
        departments: raw.departments.departments || [],
        geo: {
          roads: raw.roads,
          pathways: raw.pathways,
          landmarks: raw.landmarks,
          parking: raw.parking,
          waterbodies: raw.waterbodies,
          emergency: raw.emergency,
          boundary: raw.boundary
        }
      };
      return cache;
    })();

    return loadingPromise;
  }

  function getCache() {
    return cache;
  }

  /** Convenience lookups used throughout the UI layer. */
  function getBuildingById(id) {
    return cache?.buildings.find((b) => b.id === Number(id));
  }
  function getRoomsForBuilding(buildingId, floor) {
    return cache?.rooms.filter(
      (r) => r.building === Number(buildingId) && (floor === undefined || r.floor === floor)
    ) || [];
  }
  function getDepartmentsForBuilding(buildingId) {
    return cache?.departments.filter((d) => d.buildingId === Number(buildingId)) || [];
  }

  global.CampusData = {
    loadAll,
    getCache,
    getBuildingById,
    getRoomsForBuilding,
    getDepartmentsForBuilding
  };
})(window);
