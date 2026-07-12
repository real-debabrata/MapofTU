/**
 * ui.js
 * ----------------------------------------------------------------------
 * Everything that isn't the map itself or data loading: theme switching,
 * the sidebar, the building/room information drawer (with its floor
 * switcher and generated floor-plan SVG), the route-planner panel,
 * toasts, the map context menu, bookmarks, and deep-link handling.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const THEME_KEY = 'campus.theme'; // 'light' | 'dark' | 'auto'
  const BOOKMARKS_KEY = 'campus.bookmarks';

  let dom = {};
  let state = {
    activeBuilding: null,
    activeFloor: 0,
    routeStart: null, // { coord, label }
    routeEnd: null
  };

  /* ============================= THEME ============================= */
  function applyTheme(mode) {
    const resolved = mode === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
    document.documentElement.setAttribute('data-theme', resolved);
    dom.themeToggle.innerHTML = mode === 'dark' ? iconMoon() : mode === 'light' ? iconSun() : iconAuto();
    dom.themeToggle.setAttribute('aria-label', `Theme: ${mode}. Click to change.`);
  }

  function initTheme() {
    const saved = CampusHelpers.storage.get(THEME_KEY, 'auto');
    applyTheme(saved);
    dom.themeToggle.addEventListener('click', () => {
      const current = CampusHelpers.storage.get(THEME_KEY, 'auto');
      const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
      CampusHelpers.storage.set(THEME_KEY, next);
      applyTheme(next);
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (CampusHelpers.storage.get(THEME_KEY, 'auto') === 'auto') applyTheme('auto');
    });
  }

  function iconSun() { return icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'); }
  function iconMoon() { return icon('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>'); }
  function iconAuto() { return icon('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>'); }
  function icon(path) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }

  /* ============================ TOASTS =============================== */
  function showToast(message, type = 'default', timeout = 3200) {
    const toast = document.createElement('div');
    toast.className = `toast ${type !== 'default' ? `toast--${type}` : ''}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    dom.toastStack.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 200);
    }, timeout);
  }

  /* ========================= SIDEBAR / FILTERS ========================= */
  function initSidebar() {
    dom.sidebarToggle.addEventListener('click', () => dom.sidebar.classList.toggle('open'));
  }

  /* ============================ BOOKMARKS ============================= */
  function getBookmarks() { return CampusHelpers.storage.get(BOOKMARKS_KEY, []); }
  function isBookmarked(id) { return getBookmarks().includes(id); }
  function toggleBookmark(id) {
    const list = getBookmarks();
    const idx = list.indexOf(id);
    if (idx === -1) { list.push(id); showToast('Building bookmarked', 'success'); }
    else { list.splice(idx, 1); showToast('Bookmark removed'); }
    CampusHelpers.storage.set(BOOKMARKS_KEY, list);
    return idx === -1;
  }

  /* ============================= DRAWER =============================== */
  function floorLabel(i, total) {
    if (i === 0) return 'Ground';
    const ord = ['1st', '2nd', '3rd'];
    return ord[i - 1] || `${i}th`;
  }

  /** Generates a simple, original schematic floor-plan SVG (not a real
   *  architectural drawing) purely to give the floor switcher a visual
   *  anchor. Room count/positions are derived from the actual room data
   *  so it stays accurate as rooms.json changes. */
  function renderFloorPlanSVG(rooms) {
    const cols = Math.min(4, rooms.length) || 1;
    const rows = Math.ceil(rooms.length / cols) || 1;
    const cellW = 640 / cols;
    const cellH = 140;
    const pad = 6;
    let cells = '';
    rooms.forEach((r, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW + pad;
      const y = row * cellH + pad;
      const w = cellW - pad * 2;
      const h = cellH - pad * 2;
      cells += `<g class="fade-in">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="var(--cream-paper-2, #fff)" stroke="var(--teal-monsoon,#1B7A72)" stroke-width="1.5" opacity="0.9"/>
        <text x="${x + 10}" y="${y + 22}" font-size="12" font-family="monospace" fill="var(--teal-monsoon-d,#145F59)" font-weight="700">${CampusHelpers.escapeHTML(r.room)}</text>
        <text x="${x + 10}" y="${y + 40}" font-size="10.5" fill="var(--charcoal-soft,#4B5259)">${CampusHelpers.escapeHTML(r.type)}</text>
      </g>`;
    });
    const totalH = rows * cellH + pad * 2;
    return `<svg viewBox="0 0 660 ${totalH}" xmlns="http://www.w3.org/2000/svg">${cells || '<text x="20" y="30" font-size="13" fill="#888">No rooms recorded for this floor yet.</text>'}</svg>`;
  }

  function renderRoomList(rooms) {
    if (!rooms.length) return '<p class="desc-block">No rooms recorded for this floor.</p>';
    return `<div class="room-list">${rooms.map((r) => `
      <div class="room-card" data-room-id="${r.id}" tabindex="0" role="button">
        <div class="room-card__num">${CampusHelpers.escapeHTML(r.room)}</div>
        <div class="room-card__text">
          <div class="room-card__name">${CampusHelpers.escapeHTML(r.name)}</div>
          <div class="room-card__meta">${CampusHelpers.escapeHTML(r.type)} · Capacity ${r.capacity}</div>
        </div>
      </div>`).join('')}</div>`;
  }

  function renderFloorTab(building) {
    const floors = Array.from({ length: building.floors }, (_, i) => i);
    const pills = floors.map((i) => `<button class="floor-pill ${i === state.activeFloor ? 'active' : ''}" data-floor="${i}">${floorLabel(i)}</button>`).join('');
    const rooms = CampusData.getRoomsForBuilding(building.id, state.activeFloor);
    return `
      <div class="floor-switcher">
        <span class="floor-switcher__label">Floor</span>
        <div class="floor-pills">${pills}</div>
      </div>
      <div class="floor-plan-frame">${renderFloorPlanSVG(rooms)}</div>
      ${renderRoomList(rooms)}
    `;
  }

  function renderOverviewTab(building) {
    const tiles = [
      ['Building No.', building.buildingNumber],
      ['Floors', building.floors],
      ['Hours', building.hours],
      ['Lift', building.liftAvailability ? 'Available' : 'Not available'],
      ['Wheelchair Access', building.wheelchairAccess ? 'Yes' : 'Limited'],
      ['Emergency Contact', building.emergencyContact]
    ];
    return `
      <div class="info-grid">${tiles.map(([label, value]) => `
        <div class="info-tile"><div class="info-tile__label">${label}</div><div class="info-tile__value">${CampusHelpers.escapeHTML(String(value ?? '—'))}</div></div>`).join('')}
      </div>
      <p class="desc-block">${CampusHelpers.escapeHTML(building.description)}</p>
    `;
  }

  function renderAccessTab(building) {
    const list = (label, items) => `<div class="info-tile" style="margin-bottom:10px"><div class="info-tile__label">${label}</div><div class="info-tile__value" style="font-weight:400;font-size:12.5px;line-height:1.5">${(items && items.length) ? items.map(CampusHelpers.escapeHTML).join('<br>') : '—'}</div></div>`;
    return `
      ${list('Washroom Locations', building.washrooms)}
      ${list('Staircases', building.staircases)}
      ${list('Emergency Exit', [building.emergencyExit])}
      ${list('Notice Board', [building.noticeBoard])}
      ${list('Student Help Desk', [building.helpDesk])}
    `;
  }

  function renderTabContent(building, tab) {
    if (tab === 'floors') return renderFloorTab(building);
    if (tab === 'access') return renderAccessTab(building);
    return renderOverviewTab(building);
  }

  function openBuildingDrawer(building) {
    state.activeBuilding = building;
    state.activeFloor = 0;
    const bookmarked = isBookmarked(building.id);

    dom.drawer.querySelector('.drawer__eyebrow').textContent = CampusData.getBuildingById(building.id)?.category?.toUpperCase() || 'BUILDING';
    dom.drawer.querySelector('.drawer__title').textContent = building.name;
    const hero = dom.drawer.querySelector('.drawer__hero');
    hero.style.backgroundImage = building.image
      ? `linear-gradient(to top, rgba(16,35,58,0.55), rgba(16,35,58,0.05)), url('${building.image}')`
      : '';
    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
    dom.drawerBody.innerHTML = `
      <div class="tab-row" role="tablist">
        <button class="active" data-tab="overview" role="tab">Overview</button>
        <button data-tab="floors" role="tab">Floors & Rooms</button>
        <button data-tab="access" role="tab">Access & Safety</button>
      </div>
      <div id="drawer-tab-content">${renderTabContent(building, 'overview')}</div>
      <div class="drawer__actions">
        <button class="btn btn-primary" id="btn-directions"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-8-8 18-2-8-8-2Z"/></svg>Directions</button>
        <button class="btn btn-ghost" id="btn-bookmark">${bookmarked ? '★ Bookmarked' : '☆ Bookmark'}</button>
        <button class="btn btn-ghost" id="btn-share">Share</button>
        <button class="btn btn-ghost" id="btn-copy-coords">Copy Coordinates</button>
      </div>
    `;
    dom.drawer.classList.add('open');
    document.getElementById('drawer-tab-content').setAttribute('tabindex', '-1');

    // Tabs
    dom.drawerBody.querySelectorAll('.tab-row button').forEach((btn) => {
      btn.addEventListener('click', () => {
        dom.drawerBody.querySelectorAll('.tab-row button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('drawer-tab-content').innerHTML = renderTabContent(building, btn.dataset.tab);
        bindFloorPills(building);
        bindRoomCards();
      });
    });
    bindFloorPills(building);
    bindRoomCards();

    document.getElementById('btn-directions').addEventListener('click', () => {
      setRouteEnd({ coord: building.coordinates, label: building.name });
      openRoutePanel();
    });
    document.getElementById('btn-bookmark').addEventListener('click', (e) => {
      const nowBookmarked = toggleBookmark(building.id);
      e.target.textContent = nowBookmarked ? '★ Bookmarked' : '☆ Bookmark';
    });
    document.getElementById('btn-share').addEventListener('click', () => {
      const link = CampusHelpers.buildDeepLink({ building: building.id });
      navigator.clipboard?.writeText(link).then(() => showToast('Link copied to clipboard', 'success'))
        .catch(() => showToast('Could not copy link', 'error'));
    });
    document.getElementById('btn-copy-coords').addEventListener('click', () => {
      const [lng, lat] = building.coordinates;
      navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`).then(() => showToast('Coordinates copied', 'success'));
    });

    CampusMap.focusOn(building.coordinates, 18);
  }

  function bindFloorPills(building) {
    dom.drawerBody.querySelectorAll('.floor-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.activeFloor = Number(pill.dataset.floor);
        document.getElementById('drawer-tab-content').innerHTML = renderFloorTab(building);
        bindFloorPills(building);
        bindRoomCards();
      });
    });
  }

  function bindRoomCards() {
    dom.drawerBody.querySelectorAll('.room-card').forEach((card) => {
      card.addEventListener('click', () => {
        const room = CampusData.getCache().rooms.find((r) => r.id === Number(card.dataset.roomId));
        if (room) showToast(`${room.name} · ${room.type} · Capacity ${room.capacity}`);
      });
    });
  }

  function closeDrawer() { dom.drawer.classList.remove('open'); }

  /* ========================== ROUTE PANEL ============================= */
  function setRouteStart(entry) {
    state.routeStart = entry;
    dom.routeStartInput.value = entry?.label || '';
  }
  function setRouteEnd(entry) {
    state.routeEnd = entry;
    dom.routeEndInput.value = entry?.label || '';
  }

  function openRoutePanel() { dom.routePanel.classList.add('open'); }
  function closeRoutePanel() { dom.routePanel.classList.remove('open'); CampusMap.drawRoute(null); }

  function computeRoute() {
    if (!state.routeStart || !state.routeEnd) {
      showToast('Choose a starting point and a destination', 'error');
      return;
    }
    const result = CampusRouting.findRoute(state.routeStart.coord, state.routeEnd.coord);
    if (!result) {
      showToast('No walking path found between these points', 'error');
      return;
    }
    CampusMap.drawRoute(result.coordsLatLng);
    dom.routeSummary.innerHTML = `
      <span>Distance: <strong>${CampusHelpers.formatDistance(result.distanceMeters)}</strong></span>
      <span>Walk time: <strong>~${result.walkMinutes} min</strong></span>
    `;
    dom.routeSummary.style.display = 'flex';
  }

  function initRoutePanel() {
    dom.routeStartInput.addEventListener('input', CampusHelpers.debounce(() => {
      const q = dom.routeStartInput.value.trim();
      state.routeStart = q ? { coord: state.routeStart?.coord, label: q } : null;
    }, 150));
    dom.routeEndInput.addEventListener('input', CampusHelpers.debounce(() => {
      const q = dom.routeEndInput.value.trim();
      state.routeEnd = q ? { coord: state.routeEnd?.coord, label: q } : null;
    }, 150));

    dom.routeSwap.addEventListener('click', () => {
      const tmp = state.routeStart;
      setRouteStart(state.routeEnd);
      setRouteEnd(tmp);
    });
    dom.routeFindBtn.addEventListener('click', computeRoute);
    dom.routeCloseBtn.addEventListener('click', closeRoutePanel);

    dom.routeModeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        dom.routeModeButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (btn.dataset.mode === 'accessible') {
          showToast('Accessible routing prefers ramp/lift buildings — full step-free graph coming soon', 'default');
        }
      });
    });
  }

  /* ========================= CONTEXT MENU ============================== */
  let contextCoord = null;
  function initContextMenu(map) {
    map.on('contextmenu', (e) => {
      contextCoord = [e.latlng.lng, e.latlng.lat];
      const point = map.latLngToContainerPoint(e.latlng);
      dom.contextMenu.style.left = `${point.x}px`;
      dom.contextMenu.style.top = `${point.y}px`;
      dom.contextMenu.classList.add('open');
    });
    map.on('click', () => dom.contextMenu.classList.remove('open'));

    dom.contextMenu.querySelector('[data-action="directions-from"]').addEventListener('click', () => {
      setRouteStart({ coord: contextCoord, label: `${contextCoord[1].toFixed(5)}, ${contextCoord[0].toFixed(5)}` });
      openRoutePanel();
      dom.contextMenu.classList.remove('open');
    });
    dom.contextMenu.querySelector('[data-action="copy-coords"]').addEventListener('click', () => {
      navigator.clipboard?.writeText(`${contextCoord[1].toFixed(6)}, ${contextCoord[0].toFixed(6)}`).then(() => showToast('Coordinates copied', 'success'));
      dom.contextMenu.classList.remove('open');
    });
    dom.contextMenu.querySelector('[data-action="share-location"]').addEventListener('click', () => {
      const link = CampusHelpers.buildDeepLink({ lat: contextCoord[1].toFixed(6), lng: contextCoord[0].toFixed(6) });
      navigator.clipboard?.writeText(link).then(() => showToast('Location link copied', 'success'));
      dom.contextMenu.classList.remove('open');
    });
  }

  /* ============================ FAB / LOCATE =========================== */
  function initFAB(map) {
    dom.fab.addEventListener('click', () => {
      if (!navigator.geolocation) { showToast('Geolocation is not supported on this device', 'error'); return; }
      showToast('Locating you…');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coord = [pos.coords.longitude, pos.coords.latitude];
          L.circleMarker([coord[1], coord[0]], { radius: 8, color: '#fff', weight: 2, fillColor: '#2E6BB0', fillOpacity: 1 }).addTo(map);
          CampusMap.focusOn(coord, 18);
          setRouteStart({ coord, label: 'My Location' });
          showToast('Location found', 'success');
        },
        () => showToast('Could not access your location', 'error')
      );
    });
  }

  /* =========================== MAP CONTROLS ============================ */
  function initMapControls(map) {
    dom.zoomIn.addEventListener('click', () => map.zoomIn());
    dom.zoomOut.addEventListener('click', () => map.zoomOut());
    dom.compass.addEventListener('click', () => CampusMap.focusOn([CampusMap.CAMPUS_CENTER[1], CampusMap.CAMPUS_CENTER[0]], 16));

    map.on('moveend', () => {
      const center = map.getCenter();
      const d = CampusHelpers.haversineMeters([center.lng, center.lat], [CampusMap.CAMPUS_CENTER[1], CampusMap.CAMPUS_CENTER[0]]);
      dom.recenterBtn.classList.toggle('visible', d > 900);
    });
    dom.recenterBtn.addEventListener('click', () => CampusMap.focusOn([CampusMap.CAMPUS_CENTER[1], CampusMap.CAMPUS_CENTER[0]], 16));
  }

  /* ============================ WIRING =============================== */
  function cacheDom() {
    dom = {
      themeToggle: document.getElementById('theme-toggle'),
      toastStack: document.getElementById('toast-stack'),
      sidebar: document.getElementById('sidebar'),
      sidebarToggle: document.getElementById('sidebar-toggle'),
      drawer: document.getElementById('info-drawer'),
      drawerBody: document.getElementById('drawer-body'),
      drawerClose: document.getElementById('drawer-close'),
      routePanel: document.getElementById('route-panel'),
      routeStartInput: document.getElementById('route-start'),
      routeEndInput: document.getElementById('route-end'),
      routeSwap: document.getElementById('route-swap'),
      routeFindBtn: document.getElementById('route-find'),
      routeCloseBtn: document.getElementById('route-close'),
      routeSummary: document.getElementById('route-summary'),
      routeModeButtons: [...document.querySelectorAll('.route-mode-toggle button')],
      contextMenu: document.getElementById('context-menu'),
      fab: document.getElementById('fab-locate'),
      zoomIn: document.getElementById('zoom-in'),
      zoomOut: document.getElementById('zoom-out'),
      compass: document.getElementById('compass'),
      recenterBtn: document.getElementById('recenter-btn'),
      routeToggle: document.getElementById('route-toggle')
    };
  }

  function init(map) {
    cacheDom();
    initTheme();
    initSidebar();
    initRoutePanel();
    initContextMenu(map);
    initFAB(map);
    initMapControls(map);

    dom.drawerClose.addEventListener('click', closeDrawer);
    dom.routeToggle.addEventListener('click', () => dom.routePanel.classList.toggle('open'));

    document.addEventListener('campus:buildingSelected', (e) => openBuildingDrawer(e.detail.building));

    document.addEventListener('campus:searchSelected', (e) => {
      const entry = e.detail.entry;
      if (!entry.coord) { showToast('Location not available for this result'); return; }
      if (entry.kind === 'building') {
        openBuildingDrawer(entry.ref);
      } else if (entry.kind === 'room') {
        CampusMap.focusOn(entry.coord, 18);
        if (entry.ref.building) openBuildingDrawer(entry.ref.building);
      } else if (entry.kind === 'department' && entry.ref.building) {
        openBuildingDrawer(entry.ref.building);
      } else {
        CampusMap.focusOn(entry.coord, 18);
      }
    });

    // Deep link support: ?building=104 opens that building on load.
    const params = CampusHelpers.getQueryParams();
    if (params.building) {
      const b = CampusData.getBuildingById(params.building);
      if (b) setTimeout(() => openBuildingDrawer(b), 600);
    } else if (params.lat && params.lng) {
      setTimeout(() => CampusMap.focusOn([Number(params.lng), Number(params.lat)], 18), 600);
    }
  }

  global.CampusUI = { init, showToast };
})(window);
