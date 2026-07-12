/**
 * search.js
 * ----------------------------------------------------------------------
 * Builds one flat, searchable index out of buildings, rooms, departments
 * and landmarks, then powers the floating search box: fuzzy ranking,
 * instant suggestions, keyboard navigation, and a small "recent
 * searches" history persisted in localStorage.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const HISTORY_KEY = 'campus.search.history';
  const MAX_HISTORY = 6;

  let index = []; // [{ id, kind, title, meta, coord, ref }]
  let els = {};
  let activeIndex = -1;
  let currentResults = [];

  function buildIndex(data) {
    index = [];

    data.buildings.forEach((b) => {
      index.push({
        id: `building-${b.id}`,
        kind: 'building',
        title: b.name,
        meta: `${b.buildingNumber} · Building`,
        coord: b.coordinates,
        ref: b
      });
    });

    data.rooms.forEach((r) => {
      const building = CampusData.getBuildingById(r.building);
      index.push({
        id: `room-${r.id}`,
        kind: 'room',
        title: `${r.name} (${r.room})`,
        meta: `${r.type} · ${building ? building.name : 'Unknown building'}`,
        coord: building ? building.coordinates : null,
        ref: { room: r, building }
      });
    });

    data.departments.forEach((d) => {
      const building = CampusData.getBuildingById(d.buildingId);
      index.push({
        id: `dept-${d.id}`,
        kind: 'department',
        title: d.name,
        meta: `Department · ${building ? building.name : ''}`,
        coord: building ? building.coordinates : null,
        ref: { department: d, building }
      });
    });

    data.geo.landmarks.features.forEach((f, i) => {
      index.push({
        id: `landmark-${i}`,
        kind: 'landmark',
        title: f.properties.name,
        meta: `Landmark · ${f.properties.type}`,
        coord: f.geometry.coordinates,
        ref: f
      });
    });
  }

  const KIND_LABELS = {
    building: 'Buildings',
    room: 'Rooms & Labs',
    department: 'Departments',
    landmark: 'Landmarks'
  };

  function rank(query) {
    if (!query) return [];
    const scored = index
      .map((entry) => ({ entry, score: Math.max(CampusHelpers.fuzzyScore(query, entry.title), CampusHelpers.fuzzyScore(query, entry.meta) * 0.6) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 24)
      .map((s) => s.entry);
    return scored;
  }

  function groupByKind(results) {
    const groups = {};
    results.forEach((r) => {
      (groups[r.kind] = groups[r.kind] || []).push(r);
    });
    return groups;
  }

  function iconFor(kind) {
    const paths = {
      building: '<path d="M3 21V7l9-4 9 4v14"/><path d="M9 21v-6h6v6"/>',
      room: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16"/>',
      department: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
      landmark: '<path d="m12 2 3.1 6.9 7.4.9-5.5 5.2 1.5 7.3L12 18.8l-6.5 3.5 1.5-7.3-5.5-5.2 7.4-.9Z"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">${paths[kind] || paths.building}</svg>`;
  }

  function renderSuggestions(results, historyMode) {
    currentResults = results;
    activeIndex = -1;
    if (!results.length) {
      els.suggestions.innerHTML = `<div class="suggestion-empty">${historyMode ? 'No recent searches yet.' : 'No matches. Try a building, room, or department name.'}</div>`;
      els.suggestions.classList.add('open');
      return;
    }
    const groups = groupByKind(results);
    let html = '';
    Object.entries(groups).forEach(([kind, items]) => {
      html += `<div class="suggestion-group-label">${historyMode ? 'Recent' : KIND_LABELS[kind]}</div>`;
      items.forEach((item) => {
        const globalIdx = currentResults.indexOf(item);
        html += `<div class="suggestion-item" data-idx="${globalIdx}" role="option">
          <div class="suggestion-icon">${iconFor(item.kind)}</div>
          <div class="suggestion-text">
            <span class="suggestion-title">${CampusHelpers.escapeHTML(item.title)}</span>
            <span class="suggestion-meta">${CampusHelpers.escapeHTML(item.meta)}</span>
          </div>
        </div>`;
      });
    });
    els.suggestions.innerHTML = html;
    els.suggestions.classList.add('open');
  }

  function highlightActive() {
    els.suggestions.querySelectorAll('.suggestion-item').forEach((el, i) => {
      el.classList.toggle('active', Number(el.dataset.idx) === activeIndex);
    });
    const activeEl = els.suggestions.querySelector('.suggestion-item.active');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }

  function pushHistory(entry) {
    const history = CampusHelpers.storage.get(HISTORY_KEY, []);
    const filtered = history.filter((h) => h.id !== entry.id);
    filtered.unshift({ id: entry.id, kind: entry.kind, title: entry.title, meta: entry.meta, coord: entry.coord });
    CampusHelpers.storage.set(HISTORY_KEY, filtered.slice(0, MAX_HISTORY));
  }

  function selectEntry(entry) {
    if (!entry) return;
    pushHistory(entry);
    els.input.value = entry.title;
    els.suggestions.classList.remove('open');
    document.dispatchEvent(new CustomEvent('campus:searchSelected', { detail: { entry } }));
  }

  function showHistoryOrEmpty() {
    const history = CampusHelpers.storage.get(HISTORY_KEY, []);
    renderSuggestions(history, true);
  }

  function onInput() {
    const q = els.input.value.trim();
    els.clearBtn.classList.toggle('visible', q.length > 0);
    if (!q) { showHistoryOrEmpty(); return; }
    renderSuggestions(rank(q), false);
  }

  function onKeydown(e) {
    const max = currentResults.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(max, activeIndex + 1);
      highlightActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      highlightActive();
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && currentResults[activeIndex]) {
        selectEntry(currentResults[activeIndex]);
      } else if (currentResults.length) {
        selectEntry(currentResults[0]);
      }
    } else if (e.key === 'Escape') {
      els.suggestions.classList.remove('open');
      els.input.blur();
    }
  }

  function init(data) {
    buildIndex(data);

    els = {
      input: document.getElementById('search-input'),
      suggestions: document.getElementById('search-suggestions'),
      clearBtn: document.getElementById('search-clear')
    };

    els.input.addEventListener('input', CampusHelpers.debounce(onInput, 120));
    els.input.addEventListener('focus', () => {
      if (!els.input.value.trim()) showHistoryOrEmpty();
      else onInput();
    });
    els.input.addEventListener('keydown', onKeydown);

    els.suggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;
      selectEntry(currentResults[Number(item.dataset.idx)]);
    });

    els.clearBtn.addEventListener('click', () => {
      els.input.value = '';
      els.clearBtn.classList.remove('visible');
      els.suggestions.classList.remove('open');
      els.input.focus();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-float')) els.suggestions.classList.remove('open');
    });
  }

  global.CampusSearch = { init, rank };
})(window);
