/**
 * service-worker.js
 * ----------------------------------------------------------------------
 * A deliberately small offline cache: precache the app shell + data on
 * install, then serve from cache first and fall back to network. This
 * is enough to make the map installable and usable with no connection
 * once a person has visited it, without any server-side involvement —
 * it works as-is on GitHub Pages.
 * ----------------------------------------------------------------------
 */
const CACHE_NAME = 'tu-campus-map-v2'; // bumped: vendored Leaflet + fixes below
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './css/dark.css',
  './css/responsive.css',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './js/helpers.js',
  './js/dataLoader.js',
  './js/map.js',
  './js/routing.js',
  './js/search.js',
  './js/filters.js',
  './js/ui.js',
  './js/app.js',
  './data/buildings.json',
  './data/rooms.json',
  './data/departments.json',
  './data/roads.geojson',
  './data/pathways.geojson',
  './data/landmarks.geojson',
  './data/parking.geojson',
  './data/waterbodies.geojson',
  './data/emergency.geojson',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(
        // cache.addAll() is all-or-nothing: one slow/failed request on a
        // patchy connection would silently abort precaching every other
        // file too. Adding each file independently means a single miss
        // doesn't cost the whole offline cache.
        PRECACHE_URLS.map((url) => cache.add(url).catch((err) => {
          console.warn('Precache failed for', url, err);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET requests; let map tiles / fonts / CDN
  // scripts go straight to the network as usual.
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
