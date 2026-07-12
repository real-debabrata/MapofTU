/**
 * app.js
 * ----------------------------------------------------------------------
 * The only script that runs on page load. Keeps startup order explicit
 * and readable: load data → build map → build routing graph → wire up
 * search/filters/UI → hide the loading splash.
 * ----------------------------------------------------------------------
 */
(function () {
  'use strict';

  async function boot() {
    const splash = document.getElementById('app-loading');
    try {
      const data = await CampusData.loadAll();

      const map = CampusMap.init(data);
      CampusRouting.buildGraph(data.geo.pathways);

      CampusSearch.init(data);

      CampusFilters.init({
        chipContainer: document.getElementById('filter-chips'),
        legendContainer: document.getElementById('legend-list'),
        layerGroups: CampusMap.getLayerGroups(),
        categoryStyle: CampusMap.getCategoryStyle(),
        map
      });

      CampusUI.init(map);

      registerServiceWorker();
    } catch (err) {
      console.error('Failed to start Tripura University campus map:', err);
      document.getElementById('loading-label').textContent =
        'Something went wrong loading the campus data. Please refresh.';
      return;
    }

    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 500);
  }

  /** Registers the service worker for offline caching (PWA requirement).
   *  Silently no-ops on file:// or unsupported browsers. */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {
        /* offline caching is a progressive enhancement, not required */
      });
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
