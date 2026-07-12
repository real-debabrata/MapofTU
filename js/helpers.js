/**
 * helpers.js
 * ----------------------------------------------------------------------
 * Small, dependency-free utility functions shared by every other module.
 * Exposed on a single global namespace (`CampusHelpers`) so this project
 * can stay script-tag based with no bundler, per the project brief.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  /** Debounce: delay calling `fn` until `wait` ms of silence. Used by
   *  the search box so we don't re-filter on every keystroke. */
  function debounce(fn, wait) {
    let t = null;
    return function debounced(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /** Haversine distance in meters between two [lng, lat] points. */
  function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Round a coordinate to a fixed precision so nearby points snap to
   *  the same graph node (used when building the routing graph). */
  function nodeKey(coord, precision = 6) {
    return `${coord[0].toFixed(precision)},${coord[1].toFixed(precision)}`;
  }

  /** Cheap fuzzy match: returns a score >0 if `needle` plausibly matches
   *  `haystack`, higher is better, or 0 for no match. Combines substring
   *  matching with a lightweight subsequence check so typos and partial
   *  words still surface useful results without a heavy NLP dependency. */
  function fuzzyScore(needle, haystack) {
    if (!needle) return 1;
    const n = needle.toLowerCase().trim();
    const h = haystack.toLowerCase();
    if (!n) return 1;
    if (h === n) return 100;
    if (h.startsWith(n)) return 90;
    if (h.includes(n)) return 70;

    // Subsequence check: every character of n appears in order in h.
    let hi = 0;
    let matched = 0;
    for (let ni = 0; ni < n.length; ni++) {
      const ch = n[ni];
      const found = h.indexOf(ch, hi);
      if (found === -1) continue;
      hi = found + 1;
      matched++;
    }
    const ratio = matched / n.length;
    return ratio > 0.6 ? Math.round(ratio * 40) : 0;
  }

  /** Format meters as a friendly distance string. */
  function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  }

  /** Estimate walking time (average 1.35 m/s ~ 4.8 km/h) as minutes. */
  function estimateWalkMinutes(meters) {
    const seconds = meters / 1.35;
    return Math.max(1, Math.round(seconds / 60));
  }

  /** Safe localStorage get/set with JSON, since some browsers throw in
   *  private-browsing mode. */
  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* ignore quota / privacy-mode errors */
      }
    }
  };

  /** Basic HTML-escaping for any user-influenced string we render, per
   *  the "sanitize inputs" security requirement. */
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }

  /** Read the ?query params of the current URL (used for deep links). */
  function getQueryParams() {
    return Object.fromEntries(new URLSearchParams(window.location.search));
  }

  /** Build a shareable deep link for a given entity, e.g. ?building=104 */
  function buildDeepLink(params) {
    const url = new URL(window.location.href);
    url.search = '';
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  }

  global.CampusHelpers = {
    debounce,
    haversineMeters,
    nodeKey,
    fuzzyScore,
    formatDistance,
    estimateWalkMinutes,
    storage,
    escapeHTML,
    getQueryParams,
    buildDeepLink
  };
})(window);
