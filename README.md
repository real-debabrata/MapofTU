# Tripura University — Interactive Campus Map

An open-source, backend-free, GitHub Pages–ready campus navigation platform
for Tripura University. Built with plain HTML5, CSS3 and vanilla ES6+
JavaScript, [Leaflet.js](https://leafletjs.com/) and open GeoJSON data — no
React, no build step, no server.

> **Design language — "Neermahal":** a palette and type system named after
> Tripura's own lake palace, built specifically for this campus rather than
> reused from a generic template. See [Design system](#design-system) below.

> **Data-entry tool:** adding buildings/rooms by hand-editing JSON is
> error-prone, so `/JsonGeneration` is a small in-browser form that builds a
> schema-correct `buildings.json`/`rooms.json` entry for you and lets you
> copy or download the result. Live at
> **[tumap.nx.kg/JsonGeneration](https://www.tumap.nx.kg/JsonGeneration)**.
> See [Editing the data](#editing-the-data-no-code-required) below for how
> the generated JSON plugs into `/data`.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Deploying to GitHub Pages](#deploying-to-github-pages)
3. [Project architecture](#project-architecture)
4. [Editing the data (no code required)](#editing-the-data-no-code-required)
   - [Add a new building](#add-a-new-building)
   - [Add rooms to a building](#add-rooms-to-a-building)
   - [Update roads & pathways](#update-roads--pathways)
   - [Replace images](#replace-images)
5. [How search & routing work](#how-search--routing-work)
6. [Map gestures: pan, zoom, rotate & tilt](#map-gestures-pan-zoom-rotate--tilt)
7. [Design system](#design-system)
8. [Accessibility](#accessibility)
9. [Performance notes](#performance-notes)
10. [Security notes](#security-notes)
11. [Recent fixes (site outage / offline reliability)](#recent-fixes-site-outage--offline-reliability)
12. [Roadmap / future extensions](#roadmap--future-extensions)
13. [Contributing](#contributing)
14. [License](#license)

---

## Quick start

Because the app loads data with `fetch()`, opening `index.html` directly as a
`file://` URL will be blocked by the browser's CORS policy. Run any static
file server from the project root instead:

```bash
# Option A — Python (already installed on most systems)
python3 -m http.server 8080

# Option B — Node (no install needed, via npx)
npx serve .

# Option C — VS Code
# Install the "Live Server" extension, right-click index.html → "Open with Live Server"
```

Then visit `http://localhost:8080` (or whatever port your tool prints).

No `npm install`, no bundler, no build step — every file is served as-is.

---

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository (the repository root should
   contain `index.html`).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Pick your branch (e.g. `main`) and the `/ (root)` folder, then **Save**.
5. GitHub will publish the site at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

That's it — there is no backend, database, or environment variable to
configure. The same static files work identically on GitHub Pages, Netlify,
Vercel's static hosting, or any plain web server.

---

## Project architecture

```
project/
├── index.html            # App shell: markup for every UI region
├── manifest.json         # PWA manifest (installable app)
├── service-worker.js     # Offline cache for the app shell + data + Leaflet
├── vendor/
│   └── leaflet/          # Leaflet 1.9.4, vendored locally (not a CDN — see
│                          # "Recent fixes" below for why)
├── css/
│   ├── style.css         # Design tokens + all component styles
│   ├── dark.css          # Dark theme token overrides only
│   └── responsive.css    # Breakpoints (desktop/tablet/mobile)
├── js/
│   ├── helpers.js        # Pure utility functions (debounce, geo math, fuzzy search…)
│   ├── dataLoader.js     # Fetches & caches every JSON/GeoJSON file
│   ├── map.js            # Leaflet setup, layers, markers, popups, legend styling
│   ├── routing.js        # Builds a walking-path graph + Dijkstra route finder
│   ├── search.js         # Unified fuzzy search index + autocomplete UI
│   ├── filters.js        # Category filter chips + legend rendering
│   ├── ui.js             # Drawer, sidebar, toasts, route panel, context menu, theme
│   └── app.js            # Boot sequence — the only script that runs on load
├── assets/
│   ├── icons/            # Favicon / app icon
│   ├── images/           # Building illustrations (SVG placeholders)
│   ├── logos/            # Reserved for university branding
│   └── illustrations/    # Reserved for onboarding / empty-state art
└── data/
    ├── buildings.json    # Every building's metadata
    ├── rooms.json        # Every room/lab/office, linked to a building + floor
    ├── departments.json  # Department directory, linked to a building
    ├── roads.geojson     # Vehicle roads (visual context only)
    ├── pathways.geojson  # Walking paths — this is the routing graph
    ├── landmarks.geojson # Gates, gardens, trees, temple, bank, ATM, bus stop…
    ├── parking.geojson   # Parking area polygons
    ├── waterbodies.geojson
    └── emergency.geojson # Security booths, medical point, assembly point
```

**How the modules talk to each other:** rather than a framework, the app
uses plain `CustomEvent`s on `document` (e.g. `campus:buildingSelected`,
`campus:searchSelected`). `map.js` fires them when someone clicks a marker;
`ui.js` listens and opens the drawer. This keeps every module independently
testable and replaceable — you could swap `map.js` for a MapLibre GL version
without touching `ui.js` at all.

Every module attaches itself to `window` as a small namespace
(`CampusHelpers`, `CampusData`, `CampusMap`, `CampusRouting`, `CampusSearch`,
`CampusFilters`, `CampusUI`) so there's exactly one global per concern and no
naming collisions.

---

## Editing the data (no code required)

Nothing is hardcoded. Every building, room, road, and icon on the map comes
from the files in `/data`. To change what's on the map, edit those files and
refresh the page — no JavaScript changes needed.

> Prefer a form over hand-editing JSON? Use the
> **[JSON Generator](https://www.tumap.nx.kg/JsonGeneration)**
> (`/JsonGeneration` in this repo) — fill in a building or room, and copy the
> correctly-shaped JSON it produces straight into `buildings.json`/`rooms.json`.

### Add a new building

Open `data/buildings.json` and append an object to the `buildings` array:

```json
{
  "id": 115,
  "name": "Department of Journalism",
  "buildingNumber": "B-15",
  "category": "academic",
  "coordinates": [91.2675, 23.7599],
  "floors": 2,
  "departments": ["Department of Journalism & Mass Communication"],
  "image": "assets/images/building-arts.svg",
  "description": "A short, useful description of the building.",
  "hours": "9:00 AM – 5:00 PM (Mon–Sat)",
  "accessibility": "Ramp available",
  "emergencyContact": "+91-381-2374899",
  "website": "",
  "liftAvailability": false,
  "wheelchairAccess": true,
  "washrooms": ["Ground Floor"],
  "staircases": ["Main Staircase"],
  "emergencyExit": "Front Exit",
  "noticeBoard": "Ground Floor Lobby",
  "helpDesk": "Not available"
}
```

Notes:
- `id` must be a unique number — `rooms.json` links to it via `building`.
- `coordinates` is `[longitude, latitude]` (GeoJSON order, **not** `[lat, lng]`).
  Right-click anywhere on the live map and choose **Copy coordinates** to grab
  a real value in the correct order.
- `category` must be one of: `academic`, `library`, `hostel`, `food`,
  `sports`, `medical`, `administration` — these drive both the marker color
  and the filter chip it appears under (see `CATEGORY_STYLE` in `map.js`).
- To make the new building routable, add a short pathway segment connecting
  it to the walking-path network — see [Update roads & pathways](#update-roads--pathways).

### Add rooms to a building

Open `data/rooms.json` and append to the `rooms` array:

```json
{
  "id": 5901,
  "building": 115,
  "floor": 1,
  "room": "F-101",
  "name": "Editing Lab",
  "type": "Laboratory",
  "capacity": 24,
  "department": "Department of Journalism & Mass Communication",
  "facilities": ["Editing Workstations", "Green Screen"],
  "nearby": []
}
```

- `building` must match a building `id` from `buildings.json`.
- `floor` is zero-indexed: `0` = Ground Floor, `1` = First Floor, etc. The
  floor switcher in the drawer generates its pills automatically from each
  building's `floors` count, so just make sure your `floor` values stay
  within `0` … `floors - 1`.
- The floor-plan graphic in the drawer is generated automatically from
  whichever rooms share that `building` + `floor` — there's nothing else to
  update.

### Update roads & pathways

- `data/roads.geojson` is for **vehicle roads** — it's drawn for visual
  context only and does not affect routing.
- `data/pathways.geojson` **is** the walking-route graph. Every consecutive
  pair of coordinates in a `LineString` becomes a graph edge that the route
  finder can travel along. To connect a new building:
  1. Find (or add) a vertex on the nearest existing pathway.
  2. Add a new two-point `LineString` feature from that vertex to your
     building's entrance coordinate, e.g.:
     ```json
     { "type": "Feature",
       "properties": { "name": "Path to Journalism Dept", "pathType": "footpath", "category": "pathways" },
       "geometry": { "type": "LineString", "coordinates": [[91.2670,23.7613],[91.2675,23.7599]] } }
     ```
  3. Save and refresh — `routing.js` rebuilds the graph from this file on
     every page load, so no other code changes are needed.

### Replace images

Building photos referenced by the `image` field in `buildings.json` are
currently original SVG placeholder illustrations in `assets/images/`. To use
a real photo:

1. Add your photo to `assets/images/` (JPEG/PNG/WebP all work).
2. Update the matching building's `"image"` path in `buildings.json`.
3. Keep an aspect ratio close to 16:9 — the drawer's hero banner crops to
   fill its frame (`background-size: cover`).

---

## How search & routing work

- **Search** (`search.js`) builds one flat index from buildings, rooms,
  departments and landmarks at load time, then ranks matches with a small
  built-in fuzzy scorer (`helpers.js`) — exact matches and prefixes rank
  highest, then substrings, then a subsequence-based fuzzy match so minor
  typos still surface results. Recent selections are saved to
  `localStorage` and shown when the search box is focused empty.
- **Routing** (`routing.js`) treats every line segment in
  `pathways.geojson` as a graph edge weighted by real-world distance
  (haversine formula), then runs Dijkstra's algorithm between the two
  nearest graph nodes to the chosen start/end points. Because it's plain
  client-side graph search over a small campus network, it needs no
  routing server or API key — and it will scale to a much larger campus
  without any architecture changes.

---

## Map gestures: pan, zoom, rotate & tilt

| Gesture | Effect |
|---|---|
| One finger drag / mouse drag | Pan the map |
| Pinch (two fingers) | Zoom, exactly as Leaflet normally handles it |
| **Twist two fingers around each other, anywhere on the map** | **Rotate the map to face any heading** — not just North, any angle in between, live as you twist |
| **Drag two fingers up/down together, anywhere on the map** | **Tilt into/out of the 3D perspective view**, continuously from flat to fully tilted |
| Drag the compass dial (bottom-right) | Same rotate, with one finger/mouse, for people who prefer a fixed control |
| Tap the compass dial | Snap back to North-up and recenter on campus |
| Double-tap the compass dial | Toggle a slow continuous auto-rotate (tap again to stop) |
| Tilt button (the cube icon) | Toggle 3D tilt on/off in one tap |

The two-finger gesture lives in `initTwoFingerRotateAndTilt()` in `js/ui.js`
and talks to `CampusMap.setRotation()` / `CampusMap.setTilt()` in `js/map.js`
— the same functions the compass dial and tilt button already used, so all
four input methods (touch-twist, touch-drag, compass, button) always agree
on the current heading/tilt and stay in sync with each other and with the
compass needle's own rotation.

Because rotate/tilt are implemented as a CSS transform on the map container
(Leaflet itself only understands a flat, unrotated map), Leaflet's own
one-finger pan is disabled while the view is rotated or tilted, to stop
dragging from drifting in the wrong direction — it re-enables automatically
the moment the view is back to flat/North-up. Pinch-to-zoom is unaffected at
any rotation/tilt, since zoom never touches the CSS transform.

---

Rather than default to a generic "AI dashboard" look, the interface takes
its palette and structure from Tripura's own visual vocabulary:

| Token | Value | Inspiration |
|---|---|---|
| `--navy-ink` | `#10233A` | Primary chrome, evening sky over Rudrasagar Lake |
| `--teal-monsoon` | `#1B7A72` | Primary accent — monsoon-season foliage |
| `--gold-neermahal` | `#C99A3D` | Secondary accent — Neermahal Palace domes |
| `--cream-paper` | `#F7F4EC` | Light-mode background |

- **Typography:** [Fraunces](https://fonts.google.com/specimen/Fraunces) for
  headings (a display serif with real character), [Inter](https://fonts.google.com/specimen/Inter)
  for UI/body text (built for dense, legible interfaces), and
  [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) for
  coordinates, room numbers and other data.
- **Signature motif:** the diamond-tick rule (`.motif-rule`) references
  Tripura handloom (*pachra*) border patterns, used sparingly as a divider —
  not scattered everywhere.
- **Markers:** a custom rotated rounded-square pin (not a Google/Apple
  teardrop) so the map has its own identity at a glance.
- **Dark mode:** implemented as token overrides only (`css/dark.css`) plus a
  CSS `filter` on the Leaflet tile pane, so there is exactly one place to
  adjust color, ever. Auto-detects `prefers-color-scheme` by default and
  remembers a manual choice in `localStorage`.

---

## Accessibility

- All interactive controls are real `<button>`/`<input>` elements — no
  clickable `<div>`s — and have `aria-label`s where there's no visible text.
- Full keyboard support: search results navigate with arrow keys, `Enter`
  selects, `Escape` closes; a skip-link jumps straight to the map for screen
  reader / keyboard users.
- Visible focus rings (`:focus-visible`) are never suppressed.
- `prefers-reduced-motion` disables/shortens all animations automatically.
- Color is never the only signal — filter chips and legend entries carry
  text labels alongside their color swatch.

---

## Performance notes

- No bundler, no framework runtime — the entire JS payload is a few small,
  cacheable files loaded as plain `<script>` tags.
- Leaflet lazy-renders only the markers in view; layer groups let you hide
  whole categories (e.g. turn off "Roads") to lighten the DOM further.
- Search input is debounced (120 ms) so filtering large datasets never
  blocks typing.
- `service-worker.js` precaches the app shell and all `/data` files so
  repeat visits (and offline use) skip the network entirely.
- SVG icons and illustrations throughout — infinitely scalable, tiny file
  size, no image requests for markers.

---

## Security notes

- All user-influenced strings (search input reflected in the UI, room
  names, descriptions) are passed through `escapeHTML()` in `helpers.js`
  before being inserted into the DOM, to prevent HTML/script injection from
  a compromised or mistyped data file.
- No inline `on*` attributes or `javascript:` URLs — event handlers are
  attached with `addEventListener` in dedicated modules.
- Strict module separation: each `.js` file owns exactly one concern and
  exposes one small `window.CampusX` namespace, keeping the code auditable.

---

## Recent fixes (site outage / offline reliability)

The live site (`tumap.nx.kg`) was showing **"Something went wrong loading
the campus data. Please refresh."** on some visits — worst on slow/patchy
mobile connections. That message comes from a catch-all in `js/app.js`
(intentionally vague to the visitor, but it hides *any* startup error).
Investigating turned up a few real problems, now fixed:

1. **Leaflet was loaded from `unpkg.com` with a Subresource Integrity
   hash.** On a slow, filtered, or carrier-proxy'd connection (common on
   mobile data), a script can arrive corrupted or get blocked entirely —
   and a strict SRI hash makes the *browser* refuse to run it, with no
   error visible to the visitor. The whole app depends on the global `L`
   object Leaflet defines, so this alone was enough to take the entire
   map down while looking like a generic "data" failure.
   **Fix:** Leaflet 1.9.4 is now vendored directly in `vendor/leaflet/`
   and served from the same origin — no external CDN, no SRI risk, and
   it now works over restricted/proxy-heavy networks too.
2. **`service-worker.js` existed but was never registered.** The file
   implements a full offline cache for the app shell + `/data`, matching
   `manifest.json`'s PWA setup, but nothing in `index.html` ever called
   `navigator.serviceWorker.register(...)` — so it was dead code and the
   site had no actual offline/flaky-network resilience despite looking
   like a PWA. **Fix:** registered on load in `index.html`; the precache
   list now also includes the vendored Leaflet files, and precaching
   uses `Promise.allSettled` per file instead of `cache.addAll` (which
   is all-or-nothing — one slow file used to abort caching everything).
3. **`CNAME` was set to `www.tumap.nx.kg`**, while the site is actually
   being accessed at the bare apex `tumap.nx.kg` (as in the screenshot
   used to diagnose this). GitHub Pages serves strictly by the domain
   listed in `CNAME`; a mismatch here is a classic cause of an
   inconsistent, partially-working custom domain. **Fix:** `CNAME` now
   reads `tumap.nx.kg` to match. If you'd rather the canonical host be
   `www.tumap.nx.kg`, change `CNAME` back and make sure your DNS records
   for the apex actually redirect to the `www` host.
4. **No retry path.** Even with the above fixed, any future startup error
   left people stuck on static text with no way forward but manually
   reloading. **Fix:** the loading screen now shows a **Retry** button
   on failure, and the message itself is a little more actionable.

---

## Roadmap / future extensions

The architecture was deliberately kept modular so these can be added later
without a rewrite:

- Indoor navigation & multi-floor 3D buildings (WebGL / MapLibre GL)
- Real-time shuttle tracking (swap in a live GeoJSON/WebSocket feed for
  `dataLoader.js` to poll)
- Timetable integration, live event locations, and a Lost & Found board
- Campus emergency alert broadcasts
- Student feedback markers / event heatmaps
- AR navigation and an AI campus assistant
- An in-browser admin map editor (draw buildings/paths, export GeoJSON)
- Multi-language support (English, Bengali, Kokborok, Hindi) — the code has
  no hardcoded UI copy file yet, but every string lives in `ui.js`/`index.html`
  templates, making an i18n pass straightforward
- Optional Firebase auth for staff-only editing tools
- QR-based attendance and QR deep-links (the deep-link URL scheme —
  `?building=104` — already exists in `ui.js` and is QR-ready today)
- A true step-free/accessible routing graph (the "Accessible" toggle in the
  route panel is wired up and ready for a second graph once wheelchair-
  specific path data is collected)
- Building occupancy indicators and offline map sync refinements

---

## Contributing

1. Fork the repository and create a feature branch.
2. Keep the "no backend, no build step" constraint — if a feature needs a
   server, document it as an optional enhancement rather than a requirement.
3. Run the app locally (see [Quick start](#quick-start)) and test in both
   light and dark mode, and at a mobile viewport width.
4. Open a pull request describing what changed and, if you touched
   `/data`, which files.

Bug reports and small data corrections (wrong coordinates, outdated
department names, etc.) are just as welcome as code — everything you'd need
to fix is in plain JSON.

---

## License

Released under the **MIT License**. You are free to use, modify, and
redistribute this project, including for other universities' campuses,
provided the copyright notice is retained. No Google Maps assets, styles,
or proprietary map data are used anywhere in this project — the base map
tiles are from the open [OpenStreetMap](https://www.openstreetmap.org/copyright)
/ [CARTO](https://carto.com/attributions) project, and every campus layer
(roads, buildings, paths, icons) is original artwork built for this
repository.

```
MIT License

Copyright (c) 2026 Tripura University Campus Map Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```
