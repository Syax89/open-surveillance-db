# Frontend design system — single binding document

Last reviewed: 2026-08-08
Author: Simone Rondina (project owner)
Version: v3 (replaces v2 of 2026-08-02)
Status: **binding** — single source of truth for frontend UI/UX.

This document is the **normative reference** of the design system: it defines
the tokens, typography, layout, components, states and rules that the
implementation **must** respect. It is not a vision: it is the contract.

- Complements: `docs/SITEMAP.md` (IA),
  `docs/design/README.md` (current map/popup/hero patterns and performance
  contracts, verified on the code).
- State legend: ✅ implemented and verified · 🔒 binding (to implement /
  to align) · ⚠ partial (see note)

---

## 1. Design principles

1. **The home is a hub, not a tool.** `/` orientates: mission, map teaser,
   four tool cards, principles. It no longer hosts the interactive tools
   (F1–F4 completed: the tools are their own routes).
2. **One route, one job.** Each tool has its own route, its own `h1`, its
   own header. Explicit navigation, never by scroll.
3. **State in the URL, not in memory.** Filters, search and sorting live in
   the query params: shareable, bookmarkable, SSR-renderable (F4 ✅).
4. **One design system.** Header, footer, palette, typography, spacing and
   base components are shared everywhere.
5. **Two-way navigation.** From every tool you can return to the home and
   to the other tools. No dead ends.

The project documents public surveillance infrastructure: the design must
convey **clarity, trust, sobriety** — never alarmism nor a "police"
aesthetic. Moral reference: civic-tech open data (OpenStreetMap,
Wikidata), not security dashboards. No flashy effects, no decorative
animation, no aggressive gradients.

---

## 2. Page architecture

### 2.1 Route map (real state — all routes exist)

| Route | Page | Nav | State |
|-------|------|:---:|-------|
| `/` | Home hub (Hero + MapTeaser + ToolCards + principles) | PublicNav | ✅ |
| `/mappa` | Integrated interactive map (sidebar + map, sr-only h1) | PublicNav | ✅ |
| `/directory` | Text directory (search + filters + grid) | PublicNav | ✅ |
| `/segnala` | Guided report form (`?lat=&lng=` deep link) | PublicNav | ✅ |
| `/correggi` | Correction form (`?record=ID` prefill) | PublicNav | ✅ |
| `/records/[id]` | Record detail (card + verification widget) | contextual (`nav-record-actions`) | ✅ |
| `/records/[id]/edit` | Contribution edit (private) | contextual | ✅ |
| `/guide` | Usage guide | PublicNav | ✅ |
| `/manifesto` | Manifesto | PublicNav | ✅ |
| `/regole` | Rules | PublicNav | ✅ |
| `/fonti` | Imported-source attribution (Phase C) | footer | ✅ |
| `/api-docs` | Public API documentation | footer | ✅ |
| `/moderazione` | Compatible URL → publication details in `/guide` | — | ✅ |
| `/privacy` `/termini` `/licenze` | Legal pages | PublicNav | ✅ |
| `/faq` `/contatti` `/accessibility` | Info | PublicNav | ✅ |
| `/moderation` | Moderator dashboard (private, `requireRole`) | contextual (`nav-actions`) | ✅ |
| `/account` `/login` `/register` | Auth/account | contextual | ✅ |
| 404 (`not-found.tsx`) / 500 (`error.tsx`) | Custom error pages | **reduced: 1 link** (exception §2.3) | ✅ |

### 2.2 Tool pages (route group `app/(tools)/`)

The four tool pages share the `ToolLayout` (PublicNav + `main#main-content`).

**Page heading (✅ implemented in F4 — gap P1 G1 closed):** the classes
`.tool-heading` and `.tool-section` are defined in globals.css (h1 800,
clamp(34px,4.5vw,52px), padding 48/96px; `/mappa` stays full-width without a
visible header via `.tool-section.map-tool`). Rules:

```
.tool-section { width:min(1180px, calc(100% - 48px)); margin:0 auto; padding:48px 0 96px; }
.tool-heading { margin:0 0 34px; }
.tool-heading h1 {
  margin:0; max-width:640px;
  font-size:clamp(34px, 4.5vw, 52px); line-height:1.04;
  letter-spacing:-.06em; font-weight:800;
}
.tool-heading .eyebrow { margin-bottom:14px; }
.tool-heading p:not(.eyebrow) { margin:18px 0 0; max-width:600px; color:#5e707a; font-size:16px; line-height:1.55; }
```

Documented exception: `/mappa` has NO visible header (t_11e38eab) — the h1
stays `sr-only` for the document hierarchy and `aria-labelledby` of the
section. The page starts directly with the map.

**One page heading per tool page (F5, P1-5):** `/directory`, `/segnala`
and `/correggi` render `.tool-heading` (eyebrow + h1 + intro) as the ONLY
header; the embedded section components (`PublicDirectory`, `ReportForm`,
`CorrectionForm`) receive `showHeading={false}` and do NOT repeat the
eyebrow+h2+intro block. The sections keep their non-duplicated functional
content: the "Use the map instead" link (directory), the "Before
submitting" report rule (segnala) and "Urgent concern" (correggi). Heading
hierarchy: tool h1 → section h2 (e.g. place-search) → card h3.

**Directory catalog mode (t_127492f1; redesign t_f13fcb1c):** the tool page
uses `PublicDirectory variant="catalog"` with the browse-record
"editorial index" layout (winning proposal, documented in
`docs/design/README.md`):

1. `.directory-tool-heading` = `.tool-heading` with the "Use the map
   instead" link aligned right (modifier: the flex layout applies ONLY to
   /directory; /segnala and /correggi stay unchanged).
2. `FiltersBar variant="bare"` — the same control grid (search + type +
   freshness + sort + reset, historical ids `record-*`) WITHOUT the counter,
   in a clean TWO-row grid: search full width, then type/freshness/
   sort/reset + the "Search near a place" toggle (`extraControls`,
   FiltersBar) in the second row — one search cluster per page.
3. `.place-search` as a collapsible CONTAINED CARD panel
   (`.place-search-closed` = `display:none` until the trigger opens it —
   never the `hidden` attribute, forbidden by the pages-render contract;
   the input is finally styled like the other inputs — V1 audit). Only one
   visible search input at a time; place search is a *mode*, not a
   sister feature (principle already established by /mappa with
   `hideSearch`).
4. `.directory-results` — VISIBLE results header: h2 "Directory results"
   (key `resultsRegion`, no more sr-only h2) + count (`role=status`, id
   `record-search-count`) + CSV/GeoJSON export as secondary buttons
   (`.export-button`, still `<a role=link>` for the contracts).
5. `.filter-chips` — active-filter chips (type/freshness/q), one-shot
   removal, target ≥44px (Google Maps/CKAN pattern).
6. `.alpha-index` — A–Z alphabetical index (Wikipedia AllPages pattern):
   only the letters present in the filtered set; click → first-occurrence
   page + focus on the results header; `aria-current` on the letters of the
   current page. Visible only with alphabetical sort.
7. `.directory-tool .record-list` in a SINGLE column of **visible cards**
   (fix t_d089a17e: `title | meta line | actions` on 3 columns inside a
   `#fffef9`/`--line` border/radius container with a 3px status bar — the
   meta line is RecordCard's `<dl>` rendered as a horizontal row of dt/dd
   pairs: labels NOT repeated in a 3+1 grid, V7 audit; the
   `record-list-card` class stays byte-identical for the a11y suites and
   the rendered-html `<dt>Record ID</dt>` contract).
8. `.directory-pagination` — "Previous / Showing X–Y of Z · Page N of M /
   Next" pagination, `?page=` state in the URL (6th dimension of
   useCameraFilters, reset to 1 on every filter change; /mappa parses but
   never writes page → unchanged URLs). One single results flow: an active
   place search replaces the list (`.place-banner` with area + count +
   clear, Distance fact) and hides index/chips/pagination.

The home stays on `variant="hub"` (byte-identical output: records-heading +
place-search block + inline FiltersBar + count + 2-column grid).

### 2.3 Header exceptions

- **Error pages (404/500):** header reduced to **1 link** (`nav-action`
  "Back to home") + LocaleToggle. The footer stays reachable. Exception to
  the "3-action PublicNav" rule — deliberate (a dead end should not look
  like a broken page, but must not offer misleading navigation either).
- **Record detail, auth, moderation:** contextual header
  (`nav-record-actions` / `nav-actions`) — actions relevant to the context
  (back to record, profile, logout), not the public set.

---

## 3. Design token layer (binding)

### 3.1 Colours

Palette in `:root` (globals.css) ✅ — canonical values written in modern
`rgb(r g b)` (tokenisation t_be89b99c: zero literal hex in the source). The
block below lists the core tokens with the hex equivalent for reading:

```
/* Core (✅ in :root) */
--ink: rgb(16 35 50)        /* #102332 — main text */
--muted: rgb(92 108 117)    /* #5c6c75 — secondary text */
--paper: rgb(245 243 236)   /* #f5f3ec — page background */
--line: rgb(216 221 214)    /* #d8ddd6 — borders, separators */
--navy: rgb(9 35 58)        /* #09233a — hero, dark backgrounds */
--mint: rgb(203 247 218)    /* #cbf7da — primary action bg */
--card-bg: rgb(255 254 249) /* #fffef9 — card surface */
--focus: rgb(11 112 92)     /* #0b705c — focus ring */
--action: rgb(10 112 93)    /* #0a705d — links/primary actions */

/* Semantic status (✅ in :root; dot + text label, never colour alone) */
--status-verified: rgb(66 169 121)   /* green */
--status-community: rgb(211 150 62)  /* amber */
--status-review: rgb(216 113 94)     /* review red */
--status-demo: rgb(97 119 172)       /* slate */
--status-pending: rgb(138 151 155)   /* neutral grey-blue */
```

**Rule:** no colour hardcoding where a token exists; the canonical values
live ONLY in `:root` of `app/globals.css` (ink scale `--ink-2…--ink-5`,
`--text-*`, `--space-*`, `--radius-*`, `--container-*`, `--status-*`,
`--danger-*`, `--notice-*`, `--hero-*`, `--visual-*`, `--map-*`,
`--field-*`). The "coherent box" pattern (white card + shadow + visible
border + 3px status rail + ~14% tint of the status colour) is described in
`docs/design/README.md`.

**WCAG contrast check (table corrected vs v1):**

| Token | On background | Real ratio | Use | AA? |
|-------|-----------|-------------|-----|:---:|
| `--ink` | `--paper` | 14.5:1 | body text | ✓ AAA |
| `--muted` #5c6c75 | `--paper` | **4.85:1** | secondary text | ✅ (F4) |
| `--focus` #0b705c | `--paper` | 4.8:1 | focus ring | ✓ |
| `#405462` (nav-links) | `--paper` | 7.2:1 | nav links | ✓ AAA |
| `#0b705c` (link/action) | `--paper` | 4.8:1 | action links | ✓ |
| `#fffef9` (card bg) | `--paper` | 1.02:1 | surface | n/a |
| `--coral` | `--paper` | 3.1:1 | status dot only | ⚠ always with label |
| `--amber` | `--paper` | 1.9:1 | status dot only | ⚠ always with label |

**Contrasts under AA on small text (✅ closed in F4 — gap P2):** the 5 greys
below threshold were replaced with `#5c6c75` (≈4.8:1 on paper) for 11–12px
text and `#64737a` (≈4.8:1 on white) for text on white backgrounds.

| Pair (pre-F4) | Ratio | Use | Applied (F4) |
|----------------|:---:|-----|---------|
| `#6f7e84` on paper | 3.79 | `.loading-note` 12px | `#5c6c75` |
| `#6f7e84` on `#fffef9` | 4.16 | `.map-list-count` 11px | `#5c6c75` |
| `#6f7e84` on `#fff` | 4.21 | `.geocode-option-type` 11px | `#64737a` |
| `#6b7a80` on paper | 4.01 | `.footer-legal` 11px | `#5c6c75` |
| `#8a979b` on `#fff` | 3.01 | `.geocode-attribution` 10px | `#64737a` |
| `#60727f` (`--muted`) on paper | 4.49 | secondary text | `#5c6c75` |

**Critical access rule (D7):** status dots **never convey information on
their own** — always paired with a localised text label
(`publicStatusLabel`). Colour is redundant, not exclusive (WCAG 1.4.1).

### 3.2 Typography (type scale — corrected vs v1)

- **Family:** Arial, Helvetica, sans-serif (on `body`). No variable fonts
  or webfonts: sobriety and performance.
- **Body:** **16px / 1.5 / 400** (v1 said 15px/1.6 — wrong; the real
  rendering is 16/1.5). ✅ explicit in CSS since F4 (`body { font-size:16px;
  line-height:1.5; }`), no longer a preflight default.

| Role | Selector | Size | Line-height | Weight | Tracking | State |
|-------|-----------|------|-------------|--------|----------|:---:|
| Hero h1 | `.hero h1` | clamp(48px, 6vw, 82px) | 1.06 | **800** | -.075em | ✅ (F4 + t_c18b48f0) |
| Record h1 | `.record-detail h1`, `.moderation-page>h1` | clamp(42px, 6vw, 70px) | 1.06 | **700** | -.07em | ✅ (F4 + t_c18b48f0) |
| Tool h1 | `.tool-heading h1` | clamp(34px, 4.5vw, 52px) | 1.08 | **800** | -.06em | ✅ (F4, G1 + t_c18b48f0) |
| Auth h1 | `.auth-card h1` | clamp(34px, 5vw, 54px) | 1.04 | 800 | -.06em | ✅ (F4) |

All display h1s (`hero`, `record-detail`, `tool-heading`, `auth-card`,
`moderation-page`) carry `text-wrap:balance` + `overflow-wrap:anywhere`
(IT layout fix t_c18b48f0: anti-collision leading on multi-line IT titles).
| Section h2 | `.section-heading h2`, `.records-heading h2` | clamp(34px, 4vw, 53px) | 1 | **800** | -.065em | ✅ (F4) |
| Moderation h2 | `.moderation-section h2` | clamp(28px, 3vw, 42px) | 1 | 800 | -.06em | ✅ (F4) |
| Legal h2 | `.legal-section h2` | clamp(23px, 3vw, 32px) | 1.08 | **700** | -.05em | ✅ (F4) |
| Card h3 | `.camera-card h3`, `.record-list-card h3` | 22px | 1.08 | **700** | -.04em | ✅ (F4) |
| Card title | `.tool-card-title` | 18px | 1.1 | 800 | -.03em | ✅ |
| Popup h3 | `.osm-popup h3` | 15px | 1.2 | 800 | -.02em | ✅ |
| List item title | `.map-record-title` | 14px | 1.3 | 800 | -.02em | ✅ |
| Eyebrow | `.eyebrow` | 11px | 1.4 | 800 | .14em up | ✅ |
| Card-topline | `.card-topline` | 11px | 1.4 | 800 | .09em up | ✅ |
| Detail dt | `.record-detail-facts dt` | 10px | 1.4 | 800 | .1em up | ✅ |

**✅ closed in F4 (P1 G3):** the scale weights (800/700) are applied per
selector in globals.css (one line each). The visual "sharp weight contrast
(800 vs 400)" hierarchy is part of the design system.

### 3.3 Spacing (4px scale — ✅ implemented in F3, t_27bfa729)

The `--space-1..24` tokens are in `:root` (globals.css) since F3. The
codebase still uses ~60 ad-hoc literal values, but the scale below is the
canonical source; the CSS refactor must map the remaining paddings/margins
onto the scale.

```
--space-1: 4px    --space-2: 8px    --space-3: 12px   --space-4: 16px
--space-5: 20px   --space-6: 24px   --space-8: 32px   --space-10: 40px
--space-12: 48px  --space-16: 64px  --space-20: 80px  --space-24: 96px
```

Usage conventions:
- card internal padding: `--space-4`/`--space-6` (16/24px);
- gaps between cards and grids: `--space-4` (16px);
- vertical sections: `--space-12`/`--space-16` (48/64px);
- small spacings (label↔field, dot↔text): `--space-1`/`--space-2` (4/8px);
- touch target: padding ≥ `--space-3` on 44px-tall elements.

### 3.4 Radius (scale — ✅ implemented in F3, t_27bfa729; outliers consolidated in F5, t_97442785)

`--radius-*` tokens in `:root` since F3, consolidated from the existing
values. The out-of-scale outliers (7/9/10/14/18px) were migrated to the
closest token in F5 (P1-5/2-6, `globals.css` — sole exception: the
`border-radius:0` reset of the workspace inside the map-card, intentional):

```
--radius-xs: 4px    /* notice, offline-state, legal-note */
--radius-sm: 6px    /* form inputs (report/correction), map-hint */
--radius-md: 8px    /* skip-link, locale-toggle, search input, duplicate-alert, geocode-option (from 7px) */
--radius-lg: 12px   /* tool-card, button, nav-action, record-list-card, empty-state (from 9/10px) */
--radius-xl: 16px   /* record-detail, live-map-workspace, map-card, map-teaser (from 14/18px) */
--radius-2xl: 22px  /* hero */
--radius-full: 999px/* pill: section-note, filter-chip */
--radius-round: 50% /* status-dot, brand-mark */
```

Binding consolidation (done in F5): out-of-scale values (7, 9, 10, 14,
18px) migrate to the closest token (7→`--radius-md`, 9/10→`--radius-lg`,
14→`--radius-xl`, 18→`--radius-xl` depending on context).

### 3.5 Shadows (scale — 🔒 binding, to implement)

| Token | Value | Use |
|-------|--------|-----|
| `--shadow-float` | `0 2px 12px rgba(30,48,40,.12)` | `.map-hint` |
| `--shadow-menu` | `0 12px 24px rgba(30,45,45,.15)` | mobile menu `.nav-links` |
| `--shadow-popover` | `0 14px 30px rgba(25,46,52,.16)` | `.geocode-dropdown` |
| `--shadow-card` | `0 20px 45px rgba(25,46,52,.08)` | `.map-card`, `.record-detail`, `.live-map-workspace` |
| `--shadow-dialog` | `0 18px 50px rgba(14,42,53,.28)` | `.confirm-dialog` |

Principle: low, diffuse shadows, never hard. Only 5 levels; no text
shadows, no glow.

### 3.6 Containers, grid and breakpoints

**Container widths (✅ implemented):**
- Standard: `min(1180px, calc(100% - 48px))` — section pages, tool-section
- Readable: `min(760px, calc(100% - 48px))` — record-detail, legal, FAQ
- Wide: `min(1320px, calc(100% - 48px))` — nav-shell, hero
- **Map: `min(1440px, calc(100% - 32px))`** (`.map-layout`) — added in v2
  (not documented in v1)
- Mobile ≤700px: `min(100% - 32px, 1180px)`

**Breakpoints (✅ implemented — v1 documented only 700/980/1320):**

```
480px  — compact header (reduced brand, tight gaps) + nav wrap safety,
        coordinate-fields and report-metadata-fields at 1 column
700px  — tablet: 1-column grids, 1-column footer
768px  — header: mobile menu (hamburger + dropdown, t_94b3726d); map:
        sidebar becomes a panel above the map (max-height 38vh)
980px  — desktop: 2/3-column grids, 2-column hero
1320px — wide: container max (nav-shell, hero)
```

### 3.6 Token layer implemented (F3, t_27bfa729)

Implemented in `app/globals.css` (`:root`). The tokens mirror EXACTLY the
pre-existing values — no rendering change (verified: pixel-identical
before/after screenshots on all public routes, Lighthouse a11y >= 0.95 on
every route).

**Spacing** — 4px scale (already in §3.4): `--space-1..24`
(`--space-1:4px`, `--space-2:8px`, `--space-3:12px`, `--space-4:16px`,
`--space-5:20px`, `--space-6:24px`, `--space-8:32px`, `--space-10:40px`,
`--space-12:48px`, `--space-16:64px`, `--space-20:80px`, `--space-24:96px`).

**Radius** — consolidated from the existing values:

```
--radius-xs:4px   (notice, offline-state)
--radius-sm:6px   (form inputs, legal-note, map-hint)
--radius-md:8px   (coordinate-entry, metadata-publication, map-record)
--radius-lg:12px  (tool-card, report/correction-form, faq-item, confirm-dialog)
--radius-xl:16px  (record-detail)
--radius-2xl:22px (hero)
--radius-full:999px (filter-chip pill, section-note)
--radius-round:50% (dot, brand-mark, marker, faq summary ::before)
```

The existing out-of-scale values (7px, 9px, 10px, 14px, 18px, 99px) were
consolidated onto the tokens in F5 (t_97442785) — no out-of-scale literal
remains in `globals.css` (sole exception: the map-card's `border-radius:0`
reset).

**Type scale** — existing values (F2 §3.3) as tokens:

```
--text-2xs:10px   --text-xs:11px   --text-sm:12px   --text-md:13px
--text-base:14px  --text-lg:15px   --text-xl:16px   --text-2xl:17px
--text-3xl:18px   --text-4xl:20px  --text-5xl:22px
--text-hero:clamp(48px, 6vw, 82px)     --text-display:clamp(42px,6vw,70px)
--text-section:clamp(34px,4vw,53px)    --text-legal:clamp(23px,3vw,32px)
--text-moderation:clamp(28px,3vw,42px) --text-teaser:clamp(30px,3.6vw,48px)
--text-auth:clamp(34px,5vw,54px)
```

The 19px (brand) and 21px (hero-stats dt) values remain literal
(out-of-scale).

**Container widths** (§3.4) as tokens:

```
--container-standard:min(1180px, calc(100% - 48px))
--container-readable:min(760px, calc(100% - 48px))
--container-wide:min(1320px, calc(100% - 48px))
```

**Palette** — completed with the missing tokens of §3.2: `--focus`
(#0b705c), `--status-verified` (#42a979), `--status-community`
(#d3963e), `--status-review` (#d8715e); the `.verified` /
`.community-report` / `.needs-review` classes and the focus rings use the
tokens.

---

## 4. Layout grid

The layout is based on **CSS Grid**, mobile-first, with per-region patterns
(✅ implemented — verified in the CSS):

| Region | Desktop grid | Mobile grid (≤700px) |
|---------|-----------------|-------------------------|
| Hero | `1.02fr .98fr` | 1 column (≤980px) |
| Map workspace (`.map-split`) | `340px 1fr`, height `calc(100vh - 300px)` min 540px | 1 column, sidebar above the map (≤768px) |
| Map sidebar | 340px column, internal scroll `.map-list-scroll` | panel max-height 38vh |
| Tool cards | `1fr 1fr` (2 columns) | 1 column |
| Record list | `repeat(2, minmax(0,1fr))` | 1 column |
| Directory controls | `1fr minmax(175px,.34fr) minmax(190px,.38fr)` | 1fr 1fr (≤980) → 1fr (≤700) |
| Report/correction | `.8fr 1.1fr` | 1 column |
| Principles | `.85fr 1.15fr`; inner grid `repeat(3,1fr)` | 1 column |
| Record facts | `repeat(2,1fr)` | 1 column |
| Footer | `auto 1fr auto` | 1 column |
| Auth form | card max-width 560px | same |

Rules:
- Never horizontal scroll at 320px; all grids collapse to 1 column.
- Grid cards use `gap:16px` (`--space-4`).
- The map workspace is **a single card** (`.map-card`): FiltersBar as the
  top border, split below, export footer at the end.

---

## 5. Formatting (borders, radius, shadows)

- **Borders:** `1px solid var(--line)` for cards and separators; `#cdd6ce`
  for inputs; `#d6dbd3` for form cards; `#e6b8ad` for danger/error zones.
- **Accent borders (banner/alert):** semantic 3px left border —
  green `#43a979` (notice/legal-note), amber `#c99127` (duplicate-alert),
  `#c99a3a` (offline-state), `#c99127` (warning).
- **Radius:** the §3.4 scale — never out-of-scale values in new components.
- **Shadows:** the §3.5 scale — never shadows for inline components (text,
  dots, labels).

---

## 6. Components (design system)

### 6.1 Component registry (42 files in `app/components/`)

Legend: **[spec]** = dedicated section below · **[patt.]** = shared pattern
(§6.3) · **→** = page of use.

**Core / layout**
| Component | Where | Notes | Doc state |
|------------|------|------|:---:|
| `PublicNav` | all public pages | shared 3-action header | **[spec] 6.2.1** |
| `PublicNavLinks` | all public pages | single nav set, `aria-current="page"` | [spec] 6.2.1 |
| `SiteHeader` | page root shell | nav-shell brand + children + LocaleToggle | [patt.] |
| `SiteFooter` | root layout | global footer grouped by task; expandable legal notes | [patt.] |
| `HomeNav` | `/` | client island of the mobile menu (SSR-pure home) | [patt.] |
| `ToolLayout` | route group `(tools)` | shared tool layout: PublicNav + main | [patt.] |
| `ErrorPage` | 404/500 | shared error shell | **[spec] 6.2.5** |
| `LegacyAnchorRedirect` | root layout | legacy anchor client-side redirect (`router.replace`) | [patt.] |

**Home hub**
| `Hero` | `/` | dark hero, directory search, 2 CTAs, stat | [patt.] |
| `MapTeaser` | `/` | **static** teaser (no Leaflet) — not `SurveillanceMap` | [patt.] |
| `ToolCards` | `/` | 4 tool cards 2×2 | [patt.] |

**Map (`/mappa`)**
| `MappaTool` | `/mappa` | page body: sr-only h1 + map-layout + map-card | [spec] 6.2.6 |
| `SurveillanceMap` | `/mappa` | lazy Leaflet map + fallback | [patt.] |
| `MapPanel` | `/mappa` | workspace orchestrator: map + sidebar + popup + export | [patt.] |
| `MapRecordList` | `/mappa` | **viewport-sync sidebar list** | **[spec] 6.2.4** |
| `GeocodeSearch` | `/mappa` | **geocode combobox with dropdown** | **[spec] 6.2.3** |
| `lib/map-popup.ts` | `/mappa` | **marker popup HTML builder** (bindPopup) | **[spec] 6.2.2** |

**Directory and tools**
| `DirectoryTool` | `/directory` | tool-heading (with map link) + PublicDirectory catalog | [spec] 2.2 |
| `DirectoryCatalog` | `/directory` | **catalog layout**: bare FiltersBar + place panel + results header + chips + A–Z index + rows + `?page=` pagination | **[spec] 2.2** |
| `SegnalaTool` | `/segnala` | tool-heading + ReportForm | [spec] 2.2 |
| `CorreggiTool` | `/correggi` | tool-heading + CorrectionForm | [spec] 2.2 |
| `PublicDirectory` | `/directory`, home | catalog (delegates to DirectoryCatalog) / hub (home section) | [patt.] |
| `ReportForm` | `/segnala` | guided form + coordinates | [patt.] |
| `CorrectionForm` | `/correggi` | correction form + duplicate alert | [patt.] |
| `FiltersBar` | `/mappa`, `/directory`, home | shared D4 filters, `inline`/`panel`/`bare` variants | **[spec] 6.3.3** |
| `RecordCard` | directory, search, moderation | shared record card | [patt.] |
| `EmptyState` | directory, map, moderation | truthful empty state (h2\|h3 heading) | [patt.] |

**Record, community, auth**
| `RecordPageBody` (`app/records/[id]/RecordPageBody.tsx`) | `/records/[id]` | client detail body (loading/offline/error) | [patt.] |
| `CommunityActions` | `/records/[id]`, map popup | community-actions widget (full/compact variants: useful/confirm + gone/problem/privacy disclosure with privacy confirmation) | **[spec] 6.2.2** |
| `LevelBadge` | `/account` | level badge (label + dot; progress TEXT only, never a bar) | [patt.] |
| `ConfirmDialog` | `/account` | accessible destructive alertdialog (replaces `window.confirm`) | [patt.] |
| `ModerationDashboard` | `/moderation` | private dashboard (residual, legal emergency — ADR 0021 §8) | [patt.] |

> Note: `VerificationWidget`/`StarConfirmButton` (pre-ADR 0021 components)
> are no longer mounted on any surface — the current widget is
> `CommunityActions`; the files remain only as historical reference.

**Moderation (`moderation/`, 7 components + hook)**
| `QueueSection`, `CameraQueueItem`, `CorrectionQueueItem`, `EditQueueItem`, `DecisionForm`, `HistorySection`, `CorrectionHistorySection`, `useModerationQueue` | `/moderation` | per-section queue, decisions, history | [patt.] — `pending` dot 🔒 (§6.3.2) |

**Info pages**
| `InfoPage` | manifesto, guide, faq, contatti, accessibility | free-form SSR wrapper | [patt.] |
| `LegalPage` | privacy, termini, licenze | structured SSR wrapper (tables, notes) | [patt.] |
| `LocaleToggle` | header | EN/IT toggle (in `LocaleProvider`) | [patt.] |

### 6.2 Main component specifications

#### 6.2.1 Shared header — `PublicNav` (+ `PublicNavLinks`) ✅

The single header of ALL public pages (t_a72a3106).

- **Anatomy:** brand (29px navy/mint circle mark + 19px/800/-.04em name) ·
  nav-links (3 primary links + **auth entry point**) · LocaleToggle ·
  menu button (mobile).
- **Link set (fixed order):** Map `/mappa`, Directory `/directory`,
  **Report CTA** `/segnala` (`.nav-action`). Guide, Rules and Manifesto
  stay in the footer. Current page: `aria-current="page"`.
- **Auth entry point (`AuthNavLinks`, t_65b778c5, mobile fix t_94b3726d):**
  "Log in" `/login` + "Create account" `/register` (anonymous) or account
  link `/account` (authenticated, always with aria-label) — LAST item of
  `.nav-links`, with `aria-current` on the current auth route. State from
  `GET /api/auth/me`; initial/error state = nothing (no SSR leak,
  fail-closed).
- **Style:** 14px/700 links `#405462`, hover `#16715e`; CTA with border
  `#b7c2bd`, radius `--radius-lg` (9px→binding), padding 11px 15px.
- **Mobile (<768px):** `.menu-button` visible; `.nav-links` absolute panel
  with `--shadow-menu`, `aria-expanded` on the toggle, `.is-open`.
  Auth links travel IN the dropdown (separated by a hairline), so the top
  bar (brand + menu + LocaleToggle) never wraps at 320/390px
  (live CEO feedback). Rules scoped with `:has(.menu-button)` so the
  contextual headers (login/register/account/error) do not collapse.
- **≤480px:** compact header — brand 13px/mark 24px, margins 12px, gap 6px
  (fits 320px); `flex-wrap:wrap` remains only as a safety net.
- **Desktop (≥768px):** `.nav-links` fills the shell (flex:1) and the auth
  cluster is pushed right (`margin-left:auto`) next to the LocaleToggle.
- **Accessibility:** `nav` landmark with localised `aria-label`; skip-link;
  `:focus-visible` outline 3px `var(--focus)` offset 3px.
- **Brand variants:** home uses `brandHref="#top"` + `brandAs="anchor"`;
  every other page links to `/`.

**Rule:** single, stable set. Do not reintroduce per-page sets. Functional
pages (auth, record, moderation) use the contextual header; error pages the
reduced header (§2.3).

#### 6.2.2 Marker popup — `lib/map-popup.ts` + `.osm-popup*` ✅

Popup built client-side as an HTML string and bound with `bindPopup`
(t_702c10af, refactor t_b9666d09, redesign t_b7728ad0). Current anatomy:

1. **Header:** h3 title (15px/800) · `.osm-popup-kind` (12px `#60737d`) ·
   `.osm-popup-status` (12px/700, dot + label from `publicStatusLabel`).
2. **Facts:** dense 2-column `<dl>` (record id, 4-decimal coordinates,
   textual field of view if directional) · optional address · optional
   description.
3. **Community toolbar:** `div.osm-popup-community` node (data-record-id)
   where the workspace mounts the compact `CommunityActions` widget on
   `popupopen` (separate React root, unmounted on `popupclose`):
   `Useful`/`Confirm` with counts + "Update/report" disclosure trigger
   (gone/problem/privacy; privacy requires explicit confirmation before the
   PUT).
4. **Footer:** ONE CTA `/records/[id]` (the `/correggi` link was removed
   from the popup — the disclosure's Problem/Privacy actions are the
   record-level reporting surface).
5. **Provenance:** `.osm-popup-provenance` at the bottom (small text): for
   imported records `Source: <authority> · <licence> · Added: <date>`, for
   reports the localised label (Phase C, t_4dbce318).

**Security:** every field is HTML-escaped (`escapeHtml`) — the popup stays
inert; the status label comes ONLY from the public helper, never from raw
data.

**Accessibility:** `aria-hidden` dot + text label (WCAG 1.4.1); the popup
receives `role="dialog"` + `aria-label` (record title) on `popupopen`;
markers are focusable and open with Enter/Space (keydown handler); options
`keepInView:true` + `autoPanPadding:[48,48]` on bindPopup and picker; width
via the Leaflet option (`popupMaxWidth()`: 260 for ≤520px viewports,
otherwise 300 — never via CSS).

- **Marker:** `.osm-camera-marker` 25px green circle (`#1a7c60`) with an
  inner mint dot; `.demo` = slate `#6177ac`; `.selected` = 6px outline
  `rgba(24,97,79,.22)`.

#### 6.2.3 Geocode dropdown — `GeocodeSearch` ✅

ARIA combobox under the map sidebar search (t_b9666d09, remount-proof
debounce t_b1e192e1).

- **Anatomy:** `.map-list-search` (position:relative) → input
  `role="combobox"` + `.geocode-dropdown` (absolute, `top:100%`, z-index 30,
  `left/right:16px`, `--shadow-popover`, radius `--radius-lg`, bg `#fff`) →
  `<ul role="listbox">` (max-height 264px, scroll) → 10px Nominatim
  attribution footer.
- **ARIA:** `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant` on the active option; empty/error state announced
  with `role="status"`.
- **Interaction:** 300ms debounce, max 5 suggestions (same-origin proxy
  `/api/geocode`, never raw Nominatim payloads — data minimisation);
  ArrowUp/Down move the highlight, Enter selects, Escape closes, outside
  click closes; the selection pans the map (zoom ≥15) and resets the local
  filter.
- **Option:** `.geocode-option` 13px, `.is-active`/hover bg `#eef3ea`;
  `.geocode-option-name` 700 `#174e58`; `.geocode-option-type` 11px 🔒
  contrast (→ `#64737a`).
- **States:** `.geocode-status` (idle/empty/error) 13px `#60737d`.

#### 6.2.4 Viewport sidebar — `MapRecordList` ✅

List of the records **inside the current map viewport** (t_702c10af),
with a truthful in-list empty note (t_b9666d09).

- **Anatomy:** `.map-list-header` (13px h2 `#174e58` + `.map-list-count`
  11px `role="status"` "N of M in view") → `.map-list-scroll` (flex:1,
  `overflow-y:auto`, `overscroll-behavior:contain`) → `.map-record-list`
  (`<ul>`) → item `.map-record` (full-width button).
- **Item `.map-record`:** 14px/800 title `#174e58`, 12px meta `#60737d`;
  hover bg `#eef3ea`; 3px `var(--focus)` outline offset 1px; **selected**
  border-left 3px `#1a7c60` + bg `#e4efe6`.
- **Viewport sync:** map pan updates the list (points in view only); an
  sr-only `.sr-only` helper announces the sync to AT.
- **Empty note (D5, map-always-visible):** the map **never disappears**;
  with 0 results the truthful `.map-list-empty-note` (14px/800 title +
  13px body + "Clear filters" `onReset` action) lives INSIDE the list.
- **Mobile (≤768px):** sidebar = panel above the map, max-height 38vh,
  list scroll max-height 30vh, bottom border (not a bottom-sheet — v2
  corrects v1).

#### 6.2.5 Error pages 404/500 — `ErrorPage` ✅

Shell shared by `not-found.tsx` (404) and `error.tsx` (500) (t_7eed4601).

- **Anatomy:** `main#main-content.record-page` → reduced `SiteHeader`
  (1 `nav-action` link "Back to home" + LocaleToggle) → `article.record-detail`
  (card `--shadow-card`, radius `--radius-xl`) → localised copy → home CTA
  (`.button`) + (500) retry button `onRetry={reset}`.
- **Document title (F5, P3-3 — WCAG 2.4.2):** every error page has its own
  `<title>`, not the home title inherited from the root layout:
  "Page not found — OpenSurveillanceDB" (404, `generateMetadata` in
  `not-found.tsx`, SSR) and "Something went wrong — OpenSurveillanceDB"
  (500, `document.title` in `ErrorPage` — `error.tsx` is a client boundary
  and cannot export metadata). Keys `errors.notFoundMetaTitle` /
  `errors.serverErrorMetaTitle`.
- **Privacy by design:** the page **never reports** the requested path or
  the error message (ADR 0002, fail-closed like the moderation gate).
- **i18n:** deliberately a client component (error boundary) — copy from
  `useMessages().errors`, locale cookie honoured, toggle works.
- **Header/footer reachable:** a dead end does not look broken.

#### 6.2.6 Map workspace — `MappaTool` + `MapPanel` ✅

- **Structure:** `tool-section.map-tool` → sr-only h1 → `.map-layout`
  (1440px) → `.map-card` (single card: `FiltersBar variant="panel"` as the
  top border, `MapPanel` below). The prototype banner and the `.data-actions`
  footer were removed (CEO feedback 2026-08-02): the page starts directly
  with the card; the GeoJSON/CSV download row lives on /directory.
- **MapPanel:** `map-split` 340px sidebar + full-height map
  (`calc(100vh - 300px)`, min 540px); map always rendered
  (map-always-visible t_b9666d09); `?focus=ID` deep link pans to the
  record (t_b9666d09); `issueHref="/correggi"`,
  `directoryHref="/directory"`.
- **Filters:** `FiltersBar panel` with `hideSearch` (the search lives in
  the sidebar as `GeocodeSearch`, same `?q=` state).

### 6.3 Shared patterns

#### 6.3.1 Buttons `.button` ✅

| Variant | Style | Hover | Disabled |
|----------|-------|-------|----------|
| `.button-primary` | bg `--mint`, text `#0e2a35` | bg `#b4edc7` | 🔒 opacity .55 + `cursor:wait` on submit |
| `.button-quiet` | text `#e7f4ee`, border `rgba(222,245,234,.42)` | (default) | — |
| `.detail-outline` | text `#1c4858`, border `#b7c2bd` | (default) | — |
| `.button-danger` | bg `#8a3b2c`, white text | bg `#a04432` | opacity .55 + `cursor:progress` |

Base: padding 13px 18px (≈47px tall ✅ WCAG 2.5.8), radius
`--radius-lg`, 14px/800 font, 3px `var(--focus)` outline offset 3px,
`transition transform .2s, background .2s`; hover `translateY(-2px)`.
`.text-button`: inline link 13px/800 `#0a705d` with arrow.

#### 6.3.2 Status dot `.status-dot` ⚠ (G2/P2 binding)

Defined: `.verified` `#42a979`, `.community-report` `#d3963e`,
`.needs-review` `#d8715e`. **Missing (🔒 binding, one line each):**

```
.status-dot.demo { background:#6177ac; }    /* consistent with .osm-camera-marker.demo */
.status-dot.pending { background:#8a979b; } /* moderation: in queue */
```

Every dot is `aria-hidden` (or has a text label next to it) — never colour
alone.

#### 6.3.3 Shared filters — `FiltersBar` ✅

Same component on `/mappa` and `/directory` (D4, identical URL state):

| Filter | Control | Query param |
|--------|-----------|-------------|
| Text search | `<input type="search">` (hidden on /mappa — lives in the sidebar) | `?q=` |
| Camera type | `<select>` | `?type=` |
| Freshness | `<select>` (all/7d/30d/90d) | `?freshness=` |
| Sort | `<select>` (alpha/position) | `?sort=` |
| Results page (directory only, t_f13fcb1c) | "Prev/Next" pagination | `?page=` |
| Reset | `<button>` | removes the params |

**Variants (t_127492f1; t_f13fcb1c):** `inline` (home: control row +
counter), `panel` (/mappa: top border of the map-card, `hideSearch`),
`bare` (/directory catalog: the same control grid WITHOUT the counter — the
counter lives in the `.directory-results` rendered by `PublicDirectory`
catalog, next to export; the place toggle arrives via `extraControls`,
rendered at the end of the grid next to Reset). The variants share ids
(`record-search`, `record-kind-filter`, `record-freshness-filter`,
`record-sort`, `record-search-count`), labels and URL state — only the
counter rendering changes.

Immediate feedback (`role="status"` counter, no "apply" button), reset
always visible, truthful empty state, low-risk filters only
(type/freshness/sort — never status, manufacturer, sensitive data).

#### 6.3.4 Record card — `RecordCard` ✅

`.record-list-card`: min-height 270px, grid `auto 1fr auto`, gap 22px,
padding 24px, `--line` border, radius `--radius-lg`, bg `#fffef9`;
`.card-topline` + h3 + facts dl (3 columns) + actions. At ≤700px: dl 2
columns; actions stacked.

**Contextual rows (t_127492f1, fix t_d089a17e):** in `.directory-tool
.record-list` the same `RecordCard` stays a flat 3-column row
`title | facts | actions` (17px title), but every row is now a **visible
card** — bg `#fffef9`, 1px `--line` border, radius `--radius-lg`,
padding `16px 20px` — with a **status bar** on the left (3px) in the
`--status-*` token colour and a soft tint (9% of the token on
`#fffef9`). The style comes from the list context; the article class stays
byte-identical (`class="record-list-card"`, counted by the a11y suites).
Colour is never the only signal: the `status-dot` + text label remain in
the topline (WCAG 1.4.1), and the two lighter text colours of the card are
darkened on the tinted surface to keep ≥4.5:1 (see the globals.css
comment). Home and moderation remain cards; the home shares the same status
bar (scope `.records-section`). The /mappa sidebar rows
(`.map-record`) use the same logic: white card, 3px token rail + 8% tint,
with status-dot + label in the row (selection moved from the left border
to a background wash so it does not compete with the rail).

#### 6.3.5 Forms ✅

`ReportForm`/`CorrectionForm`/auth: visible 12px/800 label `#435963`, inputs
full-width `#cdd6ce` border radius `--radius-sm` padding 11–13px, focus
border `#3e9477` + 3px `var(--focus)` outline offset 2px; errors
`role="alert"` associated with the field; submit with loading state
(disabled + "Sending…" text); checkboxes ≥15px with `.check-label` label.

#### 6.3.6 Empty state — `EmptyState` ✅

`.empty-state`: dashed `#b9c7bf` border, bg `#eef4ea`, radius
`--radius-lg`, 20px h2/h3, 14px `#52656d` body, action (reset / link).
Always truthful: "no published records found" — never "does not exist".

#### 6.3.7 Other patterns ✅

- `.notice` (green, 3px left border), `.offline-state` (amber),
  `.duplicate-alert` (amber).
- `.auth-error` / `.auth-danger-zone` (red `#8a3b2c`).
- `.faq-item`: native `<details>` disclosure, 17px/800 summary, "+"/"–"
  marker in a `#e3eee4` circle, focus outline offset -3px.
- `.filter-chip`: `--radius-full` pill, 13px/700, `.active` bg `#0b705c`
  white text; 🔒 36px height < 44px (WCAG 2.5.8 24px ok; binding: ≥44px
  for the main targets).
- `.confirm-button`: ≥44×44px, `aria-pressed`, disabled opacity .55.
- `.level-badge`: label + green dot; **progress as text only** (never a bar).
- `.loading-note`: 12px (🔒 contrast §3.1).

---

## 7. Component states (hover / focus / disabled)

### 7.1 Focus (global baseline) ✅

```
:where(a, button, input, select, textarea):focus-visible {
  outline:3px solid var(--focus); outline-offset:3px;   /* 🔒 var(--focus) */
}
```

Documented overrides: offset 2px on form inputs, tool-card, confirm-button,
filter-chip, locale-toggle (with `z-index:1` so it is not covered);
offset 1px on `.map-record`; offset **-3px** on `.faq-item summary`
(stays inside the card). `.sr-only a:focus` becomes a visible fixed badge.

### 7.2 State matrix

| Component | Hover | Focus | Disabled / active |
|------------|-------|-------|-------------------|
| `.button-primary` | bg `#b4edc7`, `translateY(-2px)` | 3px outline | disabled: opacity .55 |
| `.button-danger` | bg `#a04432` | 3px outline | opacity .55, `cursor:progress` |
| `.nav-links a` | colour `#16715e` | 3px outline | `aria-current="page"` (active) |
| `.tool-card` | `translateY(-2px)`, border `#9db8aa` | outline offset 2px | — |
| `.map-record` | bg `#eef3ea` | outline offset 1px | `.selected`: 3px left border `#1a7c60`, bg `#e4efe6` |
| `.geocode-option` | bg `#eef3ea` | — (input keeps focus, `aria-activedescendant`) | `.is-active` bg `#eef3ea` |
| `.filter-chip` | border `#3e9477`, colour `#0b705c` | outline offset 2px | `.active`: bg `#0b705c`, white text |
| `.confirm-button` | bg `#f1f7f1`, border `#3e9477` | outline offset 2px | `[aria-pressed=true]`: bg `#eef4ea`, border `#43a979`; disabled opacity .55 `not-allowed` |
| `.faq summary` | pointer cursor | outline offset -3px | `[open]`: "–" marker |
| `.locale-toggle button` | (none) | outline offset 2px + z-index | `.is-active`: bg `#174e58`, white text |
| `.button` (submit) | default | 3px outline | disabled + "Sending…" (text), `cursor:wait` (moderation) |
| `.menu-button` (mobile) | — | 3px outline | `aria-expanded` true → `.nav-links.is-open` |

Rules: no `:hover` without an equivalent `:focus-visible`; no
`cursor:pointer` on non-interactive elements; disabled never by opacity
alone (paired with `aria-disabled` or native `disabled`).

---

## 8. Accessibility (WCAG 2.2 AA)

Baseline ✅ preserved: skip-link (focus-reveal), visible focus, landmarks
(`nav` with aria-label, `main#main-content`, `footer` contentinfo), one h1
per page, `prefers-reduced-motion`, sr-only, map alternative (region
aria-label + sr-only description + directory link + textual fallback),
non-colour status, native controls without custom tabindex.

To strengthen / verify:
- **Focus management:** `/directory` → `/mappa?focus=ID` must move the
  focus to the record (not to the top) — §6.2.6 already pans; verify focus.
- **Page-change announcement:** every tool page has the h1 as the announce
  point (on /mappa it is sr-only but present).
- **Filters:** a filter change announces the counter via `role="status"`.
- **Touch target:** `.button` ~47px ✅; 🔒 `.locale-toggle` ~25px and
  `.filter-chip` 36px < 44px — binding: ≥44px (WCAG 2.5.8 24px is the
  minimum, the product target is 44px); native controls (select) stay ok.
- **Dark hero contrast:** `#c9d7de`/`#f6f9f6` on `--navy` — verified
  ≥4.5:1 body, ≥3:1 large text ✅.
- **200% zoom at 320px:** 1-column grids, no horizontal scroll ✅.
- **Secondary contrasts:** 🔒 §3.1 (6 pairs to align).

Testing: keep `a11y-interactive.test.mjs`, `navigation-pages.test.mjs`,
`pages-render.test.mjs`; manual per route: keyboard-only, NVDA +
VoiceOver, 200% zoom at 320px, per-state contrast.

---

## 9. Responsive

### 9.1 Behaviour per breakpoint (corrected in v2)

| Component | Mobile (<768px) | Tablet (768–980px) | Desktop (≥980px) |
|------------|-----------------|--------------------|-------------------|
| Nav header | hamburger menu (≤768, auth in the dropdown) | inline, wrap | inline |
| Hero | 1 column, reduced padding | 1 column | 2 columns |
| **Map** | **sidebar panel above the map** (≤768px, 38vh) | sidebar + map | 340px sidebar + map |
| Directory controls | 1 column (≤700) | 2 columns (≤980) | 3 columns |
| Directory catalog (t_127492f1) | controls 1 col; rows 1 col; meta stacked (≤700) | controls 2 col; rows 1 col | flat full-width rows |
| Record grid | 1 column | 1 column | 2 columns |
| Form | 1 column | 2 columns | 2 columns |
| Footer | 1 column (≤700) | 2 columns (≤980) | 3 columns |
| Record facts | 1 column | 2 columns | 2 columns |

v2 note: v1 prescribed a "collapsible bottom-sheet" for the mobile map; the
implementation (and the final design choice) is a **panel above the map**
(max-height 38vh, internal scroll, 768px breakpoint) — simpler and it does
not obscure the map by user choice. The bottom-sheet is NO LONGER the
reference pattern.

### 9.2 Principles

Mobile-first; no horizontal scroll at 320px; touch targets ≥44px on the
main controls; the map is never a persistent full-screen that obscures the
results; coordinate forms at 1 column (≤480px).

---

## 10. EN/IT bilingualism

- **Per-domain bundles** (✅ all exist): `auth, common, community,
  contact, correction, directory, errors, faq, footer, guide, home,
  manifesto, map, moderation, moderazione, record, report, rules, status,
  types` — type-checked parity (`Translation<typeof en>`).
- **SSR locale:** `opensurveillancedb-locale` cookie, no EN→IT flash
  (ADR 0015); `<html lang>` from the root layout; `generateMetadata()`
  localises title/description/OG.
- **Language-neutral URLs:** neutral route slugs; deep links via
  `GET /api/locale?lang=it&next=/mappa`.
- **Layout breaks:** IT is ~15-20% longer — `overflow-wrap:anywhere` on
  the `dd`s of cards and facts; 3-action nav + auth collapsing into the
  mobile menu at ≤768px (t_94b3726d; v1 said "up to 5 links" — wrong: the
  set is 6, t_a72a3106); eyebrow uppercase with .14em tracking verified on
  IT labels.

---

## 11. Dos & don'ts

### Do

1. Use the tokens (§3) — never hardcode colour/radius/spacing in new components.
2. One `h1` per page; if the page starts with a visual tool, the h1 is
   `sr-only` (documented) but present.
3. Status dot **always** with a text label; never colour as the only channel.
4. Truthful empty state + action (reset / link to `/segnala`).
5. Filter state in the URL (`?q=`, `?type=`, `?freshness=`, `?sort=`).
6. Counters and result changes in `aria-live`/`role="status"`; errors in
   `role="alert"` associated with the field.
7. Loading as text + `aria-live` (no decorative spinners, no animated
   skeletons).
8. Native controls (`<button>`, `<input>`, `<select>`, `<a>`); no custom
   tabindex; DOM order = tab order.
9. Visible focus with `:focus-visible` and `var(--focus)`.
10. Reuse the shared patterns (§6.3): `FiltersBar`, `RecordCard`,
    `EmptyState`, buttons, status dots. Do not duplicate.
11. Shared `PublicNav` header on all public pages; never per-page nav sets.
12. The map **never disappears** with 0-result filters: truthful note in
    the sidebar with "Clear filters" (t_b9666d09).
13. Mobile map: panel above the map (≤768px), not a bottom-sheet.
14. Contrast ≥4.5:1 for normal text; secondary greys from the §3.1 table.
15. Error pages: no path/error leak; reduced header + reachable footer.
16. i18n: separate per-domain bundles, type-checked parity; language-neutral
    route slugs.
17. CSS comments explaining the *why* (codebase convention — every block
    cites the task and the decision).

### Don't

1. No "police" aesthetic, alarmism, aggressive gradients or flashy
   effects — the project documents surveillance, it does not sell it.
2. No state conveyed by colour alone (WCAG 1.4.1).
3. No "no camera exists" wording in empty states — only
   "no published records found".
4. No CSS classes without definitions. ✅ F4: `.tool-heading`,
   `.tool-section`, `.status-dot.demo`, `.status-dot.pending` defined;
   `.map-tool` defined as the full-width /mappa exception; no-ops
   removed (`.filters-inline`, legacy compact banner).
5. No `window.confirm` — use `ConfirmDialog`.
6. No duplicated search on `/mappa` (FiltersBar `hideSearch` +
   sidebar `GeocodeSearch`).
7. Do not break the map when filters return 0 results.
8. No animated skeleton/spinner for loading.
9. No bottom-sheet for the mobile map (superseded pattern).
10. Do not hardcode `#0b705c` (24 occurrences): use `var(--focus)`.
11. Do not ignore `prefers-reduced-motion`.
12. No contextual headers on public pages (only auth/record/
    moderation/error).
13. Do not drop below AA on the secondary greys (§3.1 table).
14. Do not break legacy redirects: the `/#map`, `/#records` anchors stay
    handled by `LegacyAnchorRedirect` (client-side, deliberate: a fragment
    never reaches the server — do not revert to a server-side 302).
15. No decorative icons without a label/aria-hidden — icons are sober and
    functional.

---

## 12. Design decisions summary

| # | Decision | State |
|---|-----------|:---:|
| D1 | The home is a hub, not a tool | ✅ |
| D2 | 4 separate tool routes: `/mappa`, `/directory`, `/segnala`, `/correggi` | ✅ |
| D3 | Filter state in query params | ✅ |
| D4 | Map and directory share the same filters (`FiltersBar`) | ✅ |
| D5 | Truthful empty state + action; map never hidden | ✅ (in-sidebar empty map) |
| D6 | Palette and typography consolidated, not changed | ✅ |
| D7 | Status dot always with a text label | ✅ |
| D8 | Legacy anchor redirect **client-side** (`LegacyAnchorRedirect`) — not 302 (a fragment never reaches the server) | ✅ (v2 corrects v1) |
| D9 | Incremental refactor in phases (F1–F4 completed) | ✅ |
| D10 | Touch targets ≥44px, 200% zoom at 320px | ⚠ partial (locale-toggle, filter-chip) |
| D11 | Single 3-action `PublicNav` header on all public pages | ✅ |
| D12 | Mobile map: panel above the map (≤768px), not a bottom-sheet | ✅ (v2 corrects v1) |
| D13 | Map container `min(1440px, calc(100% - 32px))`; 480/768 breakpoints | ✅ |
| D14 | Custom 404/500 error pages with reduced header (6-link exception) | ✅ |
| D15 | Explicit token layer: 4px spacing, radius, shadow, type scale | ⚠ radius ✅ (F5, outliers consolidated); spacing/type ✅ (F3); shadow 🔒 |
| D16 | 800/700 type weights applied per selector (F4) | ✅ |
| D17 | Explicit 16px/1.5 body in CSS (F4) | ✅ |
| D18 | Secondary contrasts ≥4.5:1 (6 pairs aligned in F4) | ✅ |
| D19 | `.tool-heading`/`.tool-section` defined (800 tool h1, clamp 34–52px) | ✅ |
| D20 | `.status-dot.demo` / `.status-dot.pending` defined | ✅ |

---

## Appendix A: Components → routes (updated)

| Component | Route |
|------------|-------|
| `Hero`, `MapTeaser`, `ToolCards` | `/` |
| `MappaTool`, `MapPanel`, `SurveillanceMap`, `MapRecordList`, `GeocodeSearch`, `FiltersBar (panel)`, `lib/map-popup.ts` | `/mappa` |
| `DirectoryTool`, `PublicDirectory`, `FiltersBar (inline)`, `RecordCard`, `EmptyState` | `/directory` |
| `SegnalaTool`, `ReportForm` | `/segnala` |
| `CorreggiTool`, `CorrectionForm` | `/correggi` |
| `RecordPageBody`, `VerificationWidget`, `StarConfirmButton` | `/records/[id]`, `/records/[id]/edit` |
| `ModerationDashboard` + `moderation/*` (8) + `useModerationQueue` | `/moderation` |
| `InfoPage` | manifesto, guide, regole, faq, contatti, accessibility |
| `LegalPage` | privacy, termini, licenze |
| auth (in page) | login, register, account (+ `LevelBadge`, `ConfirmDialog`) |
| `PublicNav`, `PublicNavLinks`, `ToolLayout`, `SiteFooter`, `LocaleProvider` | all |
| `ErrorPage` | 404/500 |
| `LegacyAnchorRedirect` | root layout |

## Appendix B: i18n bundles (real state)

All exist: `auth, common, community, contact, correction, directory,
errors, faq, footer, guide, home, manifesto, map, moderation, moderazione,
record, report, rules, status, types` (+ `index` aggregator). EN/IT parity
type-checked. No new bundle required (v1 listed them as "new" — they have
been created).

## Appendix C: Audit conformance state (F4 closure)

State at 2026-08-02: the code-side gaps of the F1 audit are closed in F4.
Only D15 (the `--space-*`/radius/shadow scale) and the debts tracked below
remain binding.

| Audit gap | Doc section | F4 state | Priority |
|-----------|-------------|----------|:---:|
| G1 `.tool-heading`/`.tool-section` never defined | §2.2 (D19) | ✅ defined in globals.css | P1 |
| G2 `.status-dot.demo` invisible | §6.3.2 (D20) | ✅ defined (`--status-demo`) | P1 |
| G3 800/700 weights not applied | §3.2 (D16) | ✅ one line per selector | P1 |
| G4 16px/1.5 body not explicit | §3.2 (D17) | ✅ explicit rule | P1 |
| G5 `--focus`/`--status-*` tokens missing, 5 dead | §3.1 | ✅ in `:root`, de-hardcoded (dead tokens: debt) | P1 |
| P2 5 greys under AA + `--muted` 4.49 | §3.1 (D18) | ✅ 6 values replaced (≥4.5:1) | P2 |
| P2 `.status-dot.pending` | §6.3.2 | ✅ defined (`--status-pending`) | P2 |
| P2 client-side redirect | §12 D8 | ✅ doc aligned (no code) | — |
| P2 mobile map panel | §9.1 D12 | ✅ doc aligned | — |
| P3 480/768 breakpoints, 1440 container | §3.6 | ✅ doc aligned | — |
| P3 6 no-op classes | §11 don't #4 | ✅ removed or defined | P3 |
| P3 directory empty state without `/segnala` link | §6.3.6 | ✅ reset action + link (`submitObservation`) | P3 |
| P3 error pages | §2.3 D14 | ✅ doc aligned | — |
| P3 locale-toggle/filter-chip touch target | §8 | ✅ ≥44px | P3 |
| 29 undocumented components | §6.1 | ✅ doc aligned (this doc) | — |

**Residual debt (out of F4 scope):** D15 token layer — `--space-*`/`--radius-*`
✅ implemented in F3 (t_27bfa729, PR #214), only `--shadow-*` remains 🔒; 4
dead tokens; `.place-empty-actions` class undefined (same inline rendering);
h1/h2+intro duplication on /directory (⚠ audit §2).
