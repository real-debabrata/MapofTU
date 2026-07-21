/**
 * filters.js
 * ----------------------------------------------------------------------
 * Renders the sidebar's filter chips and legend from the same
 * CATEGORY_STYLE map.js uses for markers, so labels/colors never drift
 * out of sync. Each chip toggles a map.js layer group (markers or
 * MapLibre style layers, both exposing .show()/.hide()) on/off.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const FILTER_GROUPS = [
    { title: 'Academics & Services', keys: ['academic', 'library', 'administration'] },
    { title: 'Living & Dining', keys: ['hostel', 'food'] },
    { title: 'Campus Life', keys: ['sports', 'landmarks', 'waterbodies'] },
    { title: 'Getting Around', keys: ['parking', 'roads', 'pathways'] },
    { title: 'Safety', keys: ['medical', 'emergency'] }
  ];

  let activeState = {};

  function chipHTML(key, style) {
    const picker = key === 'roads'
      ? `<input type="color" class="road-color-picker" value="${style.color}" title="Change road color" aria-label="Change road color">`
      : '';
    return `<button class="filter-chip" data-key="${key}" aria-pressed="true" style="--chip-color:${style.color}">
      <span class="dot" style="background:${style.color}"></span>${style.label}
    </button>${picker}`;
  }

  function render(container, categoryStyle) {
    let html = '';
    FILTER_GROUPS.forEach((group) => {
      html += `<div class="filter-section"><div class="filter-section__title">${group.title}</div><div class="filter-chip-grid">`;
      group.keys.forEach((key) => {
        const style = categoryStyle[key];
        if (!style) return;
        activeState[key] = true;
        html += chipHTML(key, style);
      });
      html += `</div></div>`;
    });
    container.innerHTML = html;
  }

  function renderLegend(container, categoryStyle) {
    const html = Object.entries(categoryStyle)
      .filter(([key]) => key !== 'roads' && key !== 'pathways')
      .map(([key, style]) => `<div class="legend-row"><span class="legend-swatch" style="background:${style.color}"></span>${style.label}</div>`)
      .join('');
    container.innerHTML = html;
  }

  function bindEvents(container, layerGroups, map) {
    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      const key = chip.dataset.key;
      const nowActive = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(nowActive));
      activeState[key] = nowActive;
      const group = layerGroups[key];
      if (!group) return;
      if (nowActive) group.show();
      else group.hide();
    });
    container.addEventListener('input', (e) => {
      if (e.target.classList.contains('road-color-picker')) {
        global.CampusMap?.setRoadColor(e.target.value);
      }
    });
  }

  function init({ chipContainer, legendContainer, layerGroups, categoryStyle, map }) {
    render(chipContainer, categoryStyle);
    renderLegend(legendContainer, categoryStyle);
    bindEvents(chipContainer, layerGroups, map);
  }

  function getActiveState() { return { ...activeState }; }

  /** Turns every filter category back on — used by the sidebar's
   *  "Reset filters" button so people don't have to hunt down and
   *  re-click each chip they'd turned off individually. */
  function resetAll(container, layerGroups, map) {
    container.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', 'true');
      const key = chip.dataset.key;
      activeState[key] = true;
      const group = layerGroups[key];
      if (group) group.show();
    });
  }

  global.CampusFilters = { init, getActiveState, resetAll };
})(window);
