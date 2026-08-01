# OpenStreetMap integration

This document is the map-tile strategy for OpenSurveillanceDB and the audit
record for the OSMF tile usage policy (project status item "A production
map-tile strategy compliant with provider terms").

- Current status: **compliant strategy implemented** (same-origin tile proxy).
- Last reviewed: 2026-08-01 (policy snapshot: OSMF Tile Usage Policy,
  https://operations.osmfoundation.org/policies/tiles/).

## 1. Audit: how the app used tiles before this change

| Check (policy requirement) | Before | After |
| --- | --- | --- |
| Correct tile URL (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, no subdomains) | ❌ used deprecated `{s}.tile.openstreetmap.org` | ✅ canonical URL (default upstream of the proxy) |
| Visible licence attribution linked to the copyright notice | ✅ | ✅ (kept, now with "Fix the map" link) |
| Stable, contactable User-Agent identifying the app | ❌ browser default UA, no app identity | ✅ `OpenSurveillanceDB/0.1 (+https://github.com/Syax89/open-surveillance-db; contact: privacy@opensurveillancedb.org)` on every upstream request |
| Referer present and accurate end-to-end | ⚠️ browser-only, dependent on site Referrer-Policy | ✅ requests are same-origin; the proxy forwards the Referer verbatim (never stripped, policy §3.4) |
| Server-side caching (≥ 7-day TTL or upstream cache headers) | ❌ browser cache only | ✅ Cloudflare Cache API + `Cache-Control: public, max-age=604800` fallback |
| No bulk download / prefetch / offline features | ✅ none present | ✅ unchanged (validated, zoom-capped endpoint) |
| No `Cache-Control: no-cache` / `Pragma: no-cache` on tiles | ✅ | ✅ (errors only carry `no-store`) |
| HTTPS only | ✅ | ✅ |
| Tile URL switchable without a software update (policy "should") | ❌ hard-coded in the client bundle | ✅ `TILE_PROVIDER_URL` environment variable |
| "Report a map issue" link (policy "should") | ❌ | ✅ `https://www.openstreetmap.org/fixthemap` in the map attribution |

## 2. The OSMF tile usage policy in one page

The OSMF community tile server (`tile.openstreetmap.org`) is free for light
use but is **not** a general-purpose CDN: it is funded by donations, has no
SLA, and "heavy or inappropriate use harms others' ability to edit and view
the map". Access may be blocked without notice.

Requirements that apply to us:

- Use exactly `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (the old
  `{s}.tile.openstreetmap.org` subdomains are deprecated).
- Keep visible licence attribution (`© OpenStreetMap contributors`, linked to
  the copyright page).
- Send a valid HTTP User-Agent that clearly identifies the application, or a
  valid Referer from web pages — and when proxying, **never strip or blank the
  Referer** (§3.4).
- Cache tiles locally per HTTP caching headers, or at least 7 days if the
  cache cannot read them (§3.2). Never send `Cache-Control: no-cache` on
  tiles by default.
- No bulk downloading, prefetching, offline packs, or automated scans of wide
  areas at high zoom (§4).
- Recommended: let the provider be switched without a software update, add a
  "Fix the map" link, publish a contact address.
- Caching proxies (§5) are permitted if they set a clear, contactable
  User-Agent and honour the caching rules.

The policy also warns that services that are commercial **or seek donations**
should not rely on the community server long-term: access may be withdrawn at
any point.

## 3. Current architecture: same-origin tile proxy

```
Browser (Leaflet)
   │  /api/tiles/{z}/{x}/{y}.png   (same origin, always HTTPS)
   ▼
Next.js route handler (Cloudflare Worker)
   │  cache lookup (Cache API: caches.default)
   │  miss → upstream GET https://<TILE_PROVIDER_URL>/{z}/{x}/{y}.png
   │         headers: User-Agent: OpenSurveillanceDB/0.1 (+repo; contact: …)
   │                  Referer: <client Referer, forwarded verbatim>
   │                  Accept: image/avif,image/webp,image/png,…
   │  response: cache headers honoured, or Cache-Control: public, max-age=604800
   ▼
Tile response (image/png) with X-Tile-Cache: hit|miss
```

Why a proxy instead of direct browser → tile server:

- **Identification**: browsers cannot be told to send a custom User-Agent.
  With a proxy, every upstream request carries a stable, contactable app
  identity (policy §3.1/§3.4/§5), so operators can reach us if our usage ever
  becomes a problem — the single most important compliance property.
- **Caching**: repeat views are served from the Cloudflare edge cache instead
  of re-hitting the community server, keeping load proportional to unique
  tile views (policy §3.2).
- **Switchable provider**: the client never knows the provider; ops changes
  `TILE_PROVIDER_URL` (and optionally `TILE_PROVIDER_KEY`) and the whole app
  follows — no rebuild, no release (policy "should" list).
- **Abuse surface**: the endpoint validates zoom/x/y strictly, so it cannot
  be used to scrape arbitrary paths or drive bulk downloads (§4). If it is
  ever abused, one Cloudflare rate-limit rule protects the upstream.

The proxy keeps the map degradation contract: if the worker or the upstream
is unreachable, `SurveillanceMap` flips to the visible text alternative with
a link to the accessible directory (see `app/components/SurveillanceMap.tsx`
and the map-fallback tests).

### Environment knobs

| Variable | Default | Purpose |
| --- | --- | --- |
| `TILE_PROVIDER_URL` | `https://tile.openstreetmap.org` | Upstream base URL (no trailing slash). Trailing `/` is tolerated. |
| `TILE_PROVIDER_KEY` | unset | API key appended as `?key=…` for providers that require one (MapTiler, Stadia Maps, …). Never commit it; set it as a Worker secret/var. |

Behaviour notes:

- Zoom is capped at `MAX_ZOOM = 19` (matches the Leaflet `maxZoom` option);
  x/y are bounded per slippy-map limits (`0 … 2^z − 1`). Invalid coordinates
  return `400` without any upstream request.
- A trailing `.png` on the y segment is accepted (`/api/tiles/13/4250/2900.png`).
- Upstream `Cache-Control`/`Expires` are honoured as-is; if absent, the
  response gets `Cache-Control: public, max-age=604800` (7 days, policy
  minimum). Tiles are also stored in `caches.default`.
- Upstream 404s pass through as 404; upstream failures return `502` with
  `Cache-Control: no-store`. Errors are never cached.
- No `Referrer-Policy` is set by the app, so same-origin tile requests always
  carry the Referer (policy: do not block it). Do not add a restrictive
  `Referrer-Policy` header to the site.

## 4. Provider strategy: community vs commercial vs self-hosted

The proxy makes the provider a deployment decision, not a code decision. The
tiers below are ordered by operational commitment.

### Tier 1 — Community tile server (`tile.openstreetmap.org`) — current default

- **When it fits**: development, pilots, low-traffic public launch where the
  audience is a civic community, not a commercial product.
- **Constraints**: no SLA, best-effort availability, no bulk/offline use,
  identification requirements (met by our proxy), and the donation/commercial
  withdrawal risk (§7 of the policy).
- **Ops notes**: keep the proxy's User-Agent and contact current; watch the
  published usage data and tile-access summaries for anomalies; be ready to
  move tiers if traffic grows.

### Tier 2 — Commercial provider (OSM-based raster or vector tiles)

- **When to switch**: public launch with meaningful expected traffic; when an
  SLA / guaranteed uptime matters; when the project seeks donations or any
  commercial involvement (the policy explicitly warns these cases); when the
  provider offers features we need (vector tiles, better performance,
  per-region coverage).
- **Candidates** (community-maintained lists): the raster providers list on
  the OSM wiki, and https://switch2osm.org/providers/ (e.g. MapTiler, Stadia
  Maps, Thunderforest, Geoapify, Mapbox).
- **Switching cost today**: set `TILE_PROVIDER_URL` to the provider's base
  URL, set `TILE_PROVIDER_KEY` if needed, and update the attribution string
  in `SurveillanceMap.tsx` to the provider's required credit. Providers whose
  auth model is not a `?key=` query parameter (header- or path-based keys)
  need a small change to `app/api/tiles/[z]/[x]/[y]/route.ts` — track this in
  the provider decision before committing.
- **Attribution note**: every commercial provider requires its own attribution
  text; the current `© OpenStreetMap contributors` credit must be extended,
  not replaced.

### Tier 3 — Self-hosted tiles

- **When to switch**: offline / prefetch features are a product requirement
  (prohibited on the community server, §4); full control over data, privacy,
  and availability; heavy sustained traffic where per-request fees dominate;
  or a policy/sovereignty requirement to not depend on third parties.
- **Stack guidance**: the community-maintained switch2osm tutorials cover the
  classic raster stack (osm2pgsql + renderd/mod_tile, or
  tileserver-gl). For a modern, lighter footprint consider vector tiles
  (e.g. Shortbread schema) served from object storage; vector tiles are also
  more suitable when offline packaging is in scope.
- **Ops cost**: server(s), rendering pipeline, storage, monitoring, backups.
  This is a real operational commitment and should be a conscious decision
  with the maintainers, not an accident.

### Decision triggers (summary)

| Signal | Action |
| --- | --- |
| Traffic consistently > light interactive use; community server reports or usage data show our footprint | Move to Tier 2 |
| Project starts taking donations or any commercial involvement | Plan Tier 2 before that happens (policy §7) |
| Offline map / bulk export feature enters the roadmap | Tier 3 (or a provider that permits offline) |
| SLA / uptime guarantee needed for the map | Tier 2 |

## 5. Operational requirements (checklist)

- [x] Map shows `© OpenStreetMap contributors` linked to
  `https://www.openstreetmap.org/copyright` (in `SurveillanceMap.tsx`).
- [x] Map shows the "Fix the map" link (`https://www.openstreetmap.org/fixthemap`).
- [x] Upstream requests carry the identifying User-Agent
  `OpenSurveillanceDB/0.1 (+https://github.com/Syax89/open-surveillance-db;
  contact: privacy@opensurveillancedb.org)`.
- [x] Client Referer is forwarded upstream, never stripped or blanked.
- [x] Server-side caching via Cloudflare Cache API; ≥ 7-day
  `Cache-Control` fallback; upstream cache headers honoured.
- [x] No bulk download / prefetch / offline features; zoom- and
  coordinate-validated endpoint.
- [x] Provider switchable via `TILE_PROVIDER_URL` / `TILE_PROVIDER_KEY`
  without a software update.
- [x] Public contact address published on legal/contact pages (policy
  "should"): `privacy@opensurveillancedb.org` decided and mailbox active
  (TERMS_OF_USE.md); map/about wiring tracked in FRONTEND_PLAN.md.
- [ ] Add Cloudflare rate limiting for `/api/tiles/*` before public launch
  as an abuse control (protects both our origin and the upstream).

## 6. Testing

- `tests/tile-proxy.test.mjs` exercises the route handler with real `Request`
  objects against a stubbed `fetch` and an injected `caches.default`:
  coordinate validation, canonical URL, User-Agent, Referer forwarding,
  cache fallback TTL, upstream header honouring, cache hit/miss behaviour,
  error paths (502/404), and provider/key switching.
- `tests/publication-boundaries.test.mjs` statically guards the compliance
  contract: the client bundle must not hotlink a tile server, the map must
  use the same-origin proxy, attribution and fixthemap links stay present,
  and the proxy must cap zoom and bound coordinates.
- Manual smoke (after `npm run dev`): open the homepage, confirm tiles render,
  then inspect the network tab — tile requests go to `/api/tiles/…` (same
  origin, `X-Tile-Cache` header), never to `tile.openstreetmap.org`. To
  verify the upstream side, `curl -sI` the proxy URL and confirm
  `Cache-Control` (≥ 7 days unless the provider sends its own) and the
  `image/png` content type.

## 7. Data boundary

OpenSurveillanceDB maintains its own reviewed records and provenance and
never writes user reports into OpenStreetMap automatically. Map tiles are a
visual base layer only. Any future import/export relationship with OSM needs
a documented community discussion, tag mapping, licence analysis, and a
reversible workflow (see OPEN_SOURCE.md for the ODbL implications).
