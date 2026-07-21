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

      const map = await CampusMap.init(data);
      CampusRouting.buildGraph(data.geo.pathways, data.geo.roads);

      CampusSearch.init(data);

      CampusFilters.init({
        chipContainer: document.getElementById('filter-chips'),
        legendContainer: document.getElementById('legend-list'),
        layerGroups: CampusMap.getLayerGroups(),
        categoryStyle: CampusMap.getCategoryStyle(),
        map
      });

      CampusUI.init(map);
    } catch (err) {
      console.error('Failed to start Tripura University campus map:', err);
      document.getElementById('loading-label').textContent =
        'Something went wrong loading the campus map. Check your connection and try again.';
      const retry = document.getElementById('loading-retry');
      if (retry) {
        retry.style.display = 'inline-flex';
        retry.addEventListener('click', () => location.reload(), { once: true });
      }
      return;
    }

    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 500);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
