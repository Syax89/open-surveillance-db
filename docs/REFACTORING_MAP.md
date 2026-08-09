# SurveillanceMap.tsx — refactoring analysis

## Current state (verified 2026-08-09)

- **929 lines**, **10 `useEffect`** (was 951 / 16)
- `useLatest()` applied and live — it replaced six hand-written
  `useRef(value)` + `useEffect(() => { ref.current = value }, [value])` pairs.
  That is the only extraction currently in the codebase.

## What was attempted and reverted

A first pass extracted four more hooks (`useLeafletMap`, `useGeolocation`,
`useMarkerLayer`, `useFOVLayer`). **They were removed again**, because they were
written from the shape of the original effects rather than from the real APIs
they had to call. Concretely, the extracted code:

- mounted the popup widget into `.osm-popup-actions-mount` — that selector does
  not exist. The real mount node is `.osm-popup-community`, emitted by
  `app/lib/map-popup.ts` with a `data-record-id` attribute.
- styled field-of-view geometry with `.osm-fov-circle` / `.osm-fov-wedge` —
  neither exists in `globals.css`. The real classes are `.fov-cone` plus the
  record status (`.fov-cone.verified`, …), and the colour comes from CSS, never
  from JS.
- built the marker class as `status-${camera.status}`, dropping the
  `isPublicStatus()` whitelist that exists as defence in depth so a non-public
  status can never style a marker.
- looked the map container up with `document.getElementById("surveillance-map")`
  — there is no such id; the component owns a React ref on `.live-map`.
- left `npx tsc --noEmit` **red** (`use-marker-layer.ts`: `originalEvent` does
  not exist on `LeafletEvent`), against a green baseline.

None of the four was imported anywhere, so the running app was unaffected — they
were dead code carrying a type regression. Lesson: an extraction must be written
against the selectors, helper signatures and guards actually present in the
file, and it is only finished when it is *imported* and the suite is green.

## Where the complexity actually is

Two effects hold most of it:

| Lines | Effect | Responsibilities |
|---|---|---|
| ~211 | marker population | desired-set computation, badge/marker reconcile, popup restore intent, widget remount |
| ~179 | map creation | lazy Leaflet import, tile layer, 3 layer groups, custom geolocate control, 5 event handlers, cleanup |

Both are heavily commented with the reasoning behind specific behaviours
(popup lifecycle, restore-vs-filter classification, grid aggregation). Those
comments encode contracts that are enforced by tests — read them before moving
any of that logic.

## Preconditions for a real extraction

The component is functional; this is optimisation, not a bug fix. Before
touching the two big effects:

1. `npm test` green as a baseline (2261 pass at the time of writing) and
   `npx tsc --noEmit` exit 0.
2. Coverage for the behaviours the comments describe: one popup per marker
   click, zero popups on pan/zoom, open popup survives a rebuild, grid badge
   click zooms instead of opening the picker, `?focus=` deep link opens once.
3. Extract one effect at a time, import it immediately, and re-run types +
   suite before the next one. An unimported hook proves nothing.

## Cheaper wins that do not require this refactor

- The reconcile already diffs instead of calling `clearLayers()`; do not
  regress that for readability.
- Marker/FOV work is already viewport- and zoom-gated. Any change here must be
  benchmarked against the real dataset (40k records), not a fixture.
