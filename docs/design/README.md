# Frontend design — current system reference

This folder is the entry point for the **current** frontend design. The
normative, binding specification is
[`docs/FRONTEND_DESIGN.md`](../FRONTEND_DESIGN.md) (tokens, typography,
layout, components, accessibility, responsive rules). This page summarises
the patterns that define the live interface today — verified against
`app/globals.css` and the components on `main`.

Historical design proposals and closed audits (multi-model redesigns,
before/after reports) are **not** part of the repository: they are archived
off-repo (operator archive) and recoverable from git history. The documents
below describe only the current state, so a new contributor sees the system
as it is, not as it evolved.

## Principles

- The home page is an **orientation hub**, not a tool: each tool has its own
  route, its own `h1` and its own header (`/mappa`, `/directory`, `/segnala`,
  `/correggi`).
- One route, one job. Filter/search/sort state lives in the **URL** (shareable,
  bookmarkable, SSR-renderable).
- Civic-tech sobriety: clear, calm, no surveillance-dashboard aesthetics, no
  decorative animation, no aggressive gradients.
- Status is never communicated by colour alone: always a status dot **plus** a
  text label (WCAG 1.4.1).

## Tokens

All colour values live in `:root` of `app/globals.css` as modern `rgb(r g b)`
custom properties — no literal hex in source. Core tokens:

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `rgb(16 35 50)` | primary text |
| `--paper` | `rgb(245 243 236)` | page background |
| `--line` | `rgb(216 221 214)` | borders, separators |
| `--card-bg` | `rgb(255 254 249)` | card surface (over `--paper`) |
| `--navy` | `rgb(9 35 58)` | hero, dark surfaces |
| `--mint` | `rgb(203 247 218)` | primary action background |
| `--action` | `rgb(10 112 93)` | links and primary actions |
| `--focus` | `rgb(11 112 92)` | focus ring |
| `--status-verified` | `rgb(66 169 121)` | live/active status |
| `--status-community` | `rgb(211 150 62)` | community status |
| `--status-review` | `rgb(216 113 94)` | review/removal status |
| `--status-demo` | `rgb(97 119 172)` | demo/illustrative status |

The full token list (typography scale `--text-*`, spacing `--space-*`, radii
`--radius-*`, containers `--container-*`, status/danger/notice families) is
defined in `app/globals.css` and documented in
[`docs/FRONTEND_DESIGN.md`](../FRONTEND_DESIGN.md) §3.

## Coherent boxes (cards, list rows, sidebars)

The accepted card pattern (replaces flat transparent rows):

- **White card background** (`--card-bg`) on the paper page background, with a
  **box-shadow** and a **visibly darker border** — a 1px `--line` border alone
  is too faint against the page.
- A **3px left rail** coloured by the record status, using the `--status-*`
  tokens.
- A **~14% tint of the status colour over white** as the card background
  treatment; keep the status dot + text label alongside (never colour-only)
  and darken light text on the tint to hold ≥ 4.5:1 contrast.
- The same logic applies to the map sidebar records and the home hub cards.

## Headings

Display headings are compact with a tight but collision-free leading:

- Hero `h1`: `--text-hero`, weight 800, `letter-spacing:-.075em`,
  `line-height:1.06` with `text-wrap:balance` and `overflow-wrap:anywhere`
  (Italian headlines wrap to more lines than English; the balance + anywhere
  pair is the safety net).
- Record detail `h1`: `--text-display`, weight 700, `line-height:1.06`, same
  balance/anywhere pair.
- Tool heading `h1`: `clamp(34px, 4.5vw, 52px)`, weight 800,
  `line-height:1.08`.

## Map (`/mappa`)

- Tiles are served **only** through the same-origin proxy
  `/api/tiles/{z}/{x}/{y}.png` (never a direct hotlink — CSP and OSMF policy),
  with a configurable provider (`TILE_PROVIDER_URL`, see
  [`docs/OSM_INTEGRATION.md`](../OSM_INTEGRATION.md)).
- **Viewport-first rendering:** the map requests only the current viewport
  (bounded `bbox` query, 5-minute client cache), never a serial full-dataset
  walk. Before the first bounds arrive the layer stays empty.
- **Native grid aggregation:** at high density (zoom < 14 or more than 250
  visible records) markers are bucketed into 48px screen cells — one badge per
  cell with a count; badge click zooms in +2 toward the centroid. Individual
  markers (with popups) render only when the visible set is small or zoom ≥ 14.
  A deep-linked record (`?focus=ID`) always renders as an individual marker
  above the grid.
- **Field of view (FOV):** directional cameras render a ~60° wedge of ~35 m
  radius at the stored bearing; domes (`Fixed dome`) render a 360° circle.
  Geometry is drawn only above zoom 16, only for records in the viewport, and
  is decorative (`aria-hidden`, `pointer-events:none`); the popup and record
  page carry the textual equivalent ("Field of view: NE 45°").
- **Interactions (stable contracts):**
  - marker click → exactly one popup, opened once, `stopPropagation` (never
    the picker);
  - click on **empty map space** → the coordinate-picker shortcut (coordinates
    + `/segnala?lat=&lng=` link) — one popup per click;
  - pan/zoom → no popups; a rebuild restores only the popup that was open and
    only for viewport-driven removals (never for filter/grid-driven ones);
  - popup options carry `keepInView:true` + `autoPanPadding:[48,48]` so the
    balloon never clips at the map edge; the popup element gets
    `role="dialog"` + `aria-label` and markers are keyboard-operable
    (Enter/Space opens the popup).
- **Layout:** desktop workspace height
  `clamp(620px, calc(100svh - 300px), 1500px)` (min 620px); mobile is
  **map-first** — the map is the first row, filters compact, the
  "points in the current view" list is below the map and collapsed by default
  (disclosure toggle, 44×44). Touch targets are ≥ 44px (WCAG 2.5.8); heights
  use `svh` + safe-area insets.

## Marker popup

Popup built client-side as an HTML string (`app/lib/map-popup.ts`, every field
HTML-escaped) and bound with `bindPopup`:

1. **Header:** title, kind, status (dot + localized label).
2. **Facts:** dense two-column grid — record ID, coordinates (4 decimals),
   field of view when present; optional address and description.
3. **Community toolbar** (compact `CommunityActions` React root mounted on
   `popupopen`): `Useful` and `Confirm` with live counts, then an
   "Update/report" disclosure exposing `No longer there`, `Problem` and
   `Privacy` (privacy requires an explicit confirmation before sending). No
   PUT fires before confirmation.
4. **Footer:** the single detail action ("Open record") plus a quiet
   provenance line — `Source: <entity> · <licence> · Added: <date>` for
   imported records, localized label for community reports.

Width is set through the **Leaflet option**, not CSS: `popupMaxWidth()` returns
260 for `innerWidth ≤ 520` else 300. Inside the mobile media query the popup
hides decorative SVG icons, tightens type and gaps, and keeps labels on one
line — never shrinking the 44px action buttons.

## Record page and tools

- Record detail: coherent-box card, facts list (`formatLocation` shows address
  **and** coordinates), the same community widget in full variant, a small
  interactive Leaflet mini-map (`RecordMiniMap`, position + FOV cone, tiles
  through the proxy), a public event timeline, and an owner-only edit link to
  `/records/[id]/edit`.
- `/directory`: catalog mode — FiltersBar `bare`, visible results header with
  count + CSV/GeoJSON exports, collapsible place search, A–Z index, rows in
  the coherent-box family, `?page=` pagination.
- `/segnala` and `/correggi`: guided forms with map/coordinate location
  selection (interactive mini-map with FOV cone), reverse-geocode address
  prefill, and the duplicate gate.

## Accessibility and i18n

- WCAG 2.2 AA target; axe-core on every SSR route in CI plus a Lighthouse
  gate (≥ 0.95) on real Chromium for layout-dependent rules
  ([`docs/ACCESSIBILITY_STATEMENT.md`](../ACCESSIBILITY_STATEMENT.md)).
- EN/IT interface with structural parity enforced at compile time
  (`Translation<typeof en>`, ADR 0007); Italian text is ~30% longer, so every
  copy change is re-checked at 1280/768/390px.

## Related documents

- [`docs/FRONTEND_DESIGN.md`](../FRONTEND_DESIGN.md) — normative design system
  (tokens, components, states, responsive, dos & don'ts).
- [`docs/SITEMAP.md`](../SITEMAP.md) — information architecture and routes.
- [`docs/ACCESSIBILITY_STATEMENT.md`](../ACCESSIBILITY_STATEMENT.md) — WCAG
  conformance and known limitations.
- [`docs/OSM_INTEGRATION.md`](../OSM_INTEGRATION.md) — tile proxy, geocoder,
  OSMF policy.
