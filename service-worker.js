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
const CACHE_NAME = 'tu-campus-map-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './css/dark.css',
  './css/responsive.css',
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
      .then((cache) => cache.addAll(PRECACHE_URLS))
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
