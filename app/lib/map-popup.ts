/**
 * Marker popup HTML builder (t_702c10af, refactor t_b9666d09, redesign
 * t_b7728ad0).
 *
 * The map popup is assembled client-side as an HTML string and bound with
 * Leaflet's bindPopup. Every record field is HTML-escaped — the popup must
 * stay inert — and the status label comes from the public safe helper
 * (publicStatusLabel), never from a raw value. Extracted from MapPanel so
 * the map workspace stays a thin orchestrator (~150-line contract,
 * component-smoke.test.mjs) and the popup shape has one owner.
 *
 * Layout (redesign t_b7728ad0, CEO 2026-08-05): compact and scannable —
 * a header block (title, kind, status dot), a dense two-column facts grid
 * (record id, location, field of view), optional address/description, the
 * community action toolbar mount (Utile + Conferma visible, the rest behind
 * an accessible disclosure — see CommunityActions), a footer with the
 * single detail action (the "Report an issue" link was REMOVED: the
 * disclosure's Problema/Privacy actions cover it, so the footer no longer
 * competes with them), and the discreet provenance metadata line (FASE C).
 */
import { escapeHtml } from "./map-viewport";
import { publicStatusLabel } from "./public-status";
import { formatDirection } from "./compass";
import { formatPublicDate } from "./format-date";
import type { Locale } from "./i18n";
import type { MapCamera } from "../components/SurveillanceMap";

/** Localized strings the popup renders (a subset of the map dictionary). */
export type PopupLabels = {
  recordId: string;
  location: string;
  popupDetail: string;
  unknown: string;
  /** Label for the field-of-view direction row (t_f8b775ec). */
  fovDirection: string;
  /** Label for the provenance "Added" date (FASE C, t_4dbce318). */
  popupAdded: string;
  /** Label for the community-report source (FASE C). */
  popupCommunityReport: string;
  /** Label for the source row (map bundle `source`). */
  source: string;
};

/** Status label helper compatible with publicStatusLabel's signature. */
export type StatusLabels = Parameters<typeof publicStatusLabel>[0];

// ---------------------------------------------------------------------------
// Balloon geometry (M01, design review 2026-10-22 P1) — ONE sizing path.
//
// The popup width used to come from `window.innerWidth` (260px phones /
// 300px desktop) with a fixed `autoPanPadding: [60, 48]`. On a 320px phone
// the MAP is only 286px wide, so 286 - 2*60 = 166px could never hold the
// balloon: the popup rendered clipped (outer ~291px, close button outside
// the viewport) and the impossible autopan pushed the selected marker out
// of the desired view. Sizing is now derived from the ACTUAL map surface,
// with Leaflet's own non-content chrome accounted for:
//
//   outer balloon width = content width + POPUP_CHROME_X
//   fits when           outer + 2 * autoPanPadding.x <= map width
//
// Heights follow the same rule (content height budget + padding + tip).
// ---------------------------------------------------------------------------

/**
 * Horizontal Leaflet chrome that is NOT popup content: the default
 * `.leaflet-popup-content` margins (24px right + 20px left) plus the 1px
 * `.leaflet-popup-content-wrapper` padding on each side. The mobile rule
 * tightens the margins to 14/14 (chrome 30), so 46 is the conservative
 * budget — the balloon fits whichever media query applies.
 */
export const POPUP_CHROME_X = 46;
/** The balloon tip (the 12px tail below the box). Vertical only. */
export const POPUP_TIP_Y = 12;
/** Accepted balloon widths (unchanged where they actually fit). */
const CONTENT_MAX = 300;
const CONTENT_MAX_NARROW = 260;
/** Below this MAP width (not viewport) the narrow balloon is preferred. */
const NARROW_SURFACE = 520;
/** The community toolbar needs this much content width (accepted floor). */
const CONTENT_MIN = 220;
/** Absolute floor: a narrower surface than this cannot happen in the app. */
const CONTENT_FLOOR = 120;
/** Autopan breathing room: generous on desktop, reduced to what fits. */
const PADDING_X_MAX = 60;
const PADDING_Y_MAX = 48;
const PADDING_MIN = 10;
/** Vertical budget as a share of the map height (the rest shows the map). */
const HEIGHT_SHARE = 0.6;
/** Fallback height budget when the surface is not measurable (SSR). */
const HEIGHT_FALLBACK = 360;
/**
 * Right/bottom lanes a narrow map must keep free for its own chrome: the
 * right control column (44px target + 10px margin + gap) and the bottom help
 * overlay. They are RESERVED, never overlapped.
 */
const LANE_RESERVED = 60;

/** Resolved balloon geometry for the CURRENT map surface. */
export type PopupGeometry = {
  /** Leaflet `maxWidth` (content box, before chrome). */
  maxWidth: number;
  /** Leaflet `minWidth` — never larger than `maxWidth`. */
  minWidth: number;
  /** Leaflet `autoPanPadding` [x, y] in px, always satisfiable by the map. */
  autoPanPadding: [number, number];
  /**
   * Leaflet `autoPanPaddingBottomRight` [x, y]: on narrow maps the balloon
   * also stays clear of the right control lane and the bottom help overlay,
   * so an open popup is never painted under the zoom/scale controls.
   */
  autoPanPaddingBottomRight: [number, number];
  /** Vertical budget for the balloon (written to CSS as --osm-popup-max-height). */
  maxHeight: number;
};

/**
 * Derive the balloon geometry from the REAL map box (`map.getSize()`), so
 * the balloon and its autopan padding always fit the surface the user sees.
 * Unmeasured surfaces (0x0 before layout, SSR) fall back to the accepted
 * desktop geometry — never 0/NaN.
 */
export function popupGeometryFor(size: { x: number; y: number } | null | undefined): PopupGeometry {
  const width = Math.round(size?.x ?? 0);
  const height = Math.round(size?.y ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { maxWidth: CONTENT_MAX, minWidth: CONTENT_MIN, autoPanPadding: [PADDING_X_MAX, PADDING_Y_MAX], autoPanPaddingBottomRight: [PADDING_X_MAX, PADDING_Y_MAX], maxHeight: HEIGHT_FALLBACK };
  }
  const narrow = width <= NARROW_SURFACE;
  const preferred = narrow ? CONTENT_MAX_NARROW : CONTENT_MAX;
  // Give the accepted padding when the preferred balloon still fits; shrink
  // the padding (never below the minimum) and then the balloon on tiny maps.
  const padX = Math.max(PADDING_MIN, Math.min(PADDING_X_MAX, Math.floor((width - POPUP_CHROME_X - preferred) / 2)));
  const padY = Math.min(PADDING_Y_MAX, Math.max(PADDING_MIN, Math.round(height * 0.08)));
  // No z-index can lift a balloon above Leaflet's control corners (they are
  // siblings of the whole map pane), so a narrow map RESERVES the right and
  // bottom chrome lanes instead and shrinks the balloon to what is left.
  const right = narrow ? Math.max(padX, Math.min(LANE_RESERVED, width - padX - POPUP_CHROME_X - CONTENT_FLOOR)) : padX;
  const bottom = narrow ? Math.max(padY, LANE_RESERVED) : padY;
  const maxWidth = Math.max(CONTENT_FLOOR, Math.min(preferred, width - padX - right - POPUP_CHROME_X));
  const maxHeight = Math.max(160, Math.min(Math.round(height * HEIGHT_SHARE), height - padY - bottom - POPUP_TIP_Y));
  return { maxWidth, minWidth: Math.min(CONTENT_MIN, maxWidth), autoPanPadding: [padX, padY], autoPanPaddingBottomRight: [right, bottom], maxHeight };
}

/**
 * Resolved import provenance for one record (FASE C, t_4dbce318): the
 * readable entity + licence from the batch, never the raw slug. The map
 * workspace resolves it via app/lib/import-sources (shared with the
 * record page); null = community report / demo seed.
 */
export type PopupProvenance = {
  sourceName: string;
  license: string;
  licenseUrl: string | null;
};

/** Optional provenance context for the popup bottom line. */
export type PopupProvenanceOptions = {
  provenance: PopupProvenance | null;
  locale: Locale;
};

/**
 * Build the popup HTML for one camera marker: header (title, kind, status
 * dot + label), the dense facts grid (record id, coordinates, field of
 * view), optional address/description, the community action toolbar mount,
 * the footer detail link, and — when `options` is given — the small
 * provenance line at the bottom (FASE C).
 */
export function popupHtmlFor(
  camera: MapCamera,
  statuses: StatusLabels,
  labels: PopupLabels,
  options?: PopupProvenanceOptions,
): string {
  const coords = `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}`;
  const address = camera.address ? `<p class="osm-popup-address">${escapeHtml(camera.address)}</p>` : "";
  const description = camera.description ? `<p class="osm-popup-description">${escapeHtml(camera.description)}</p>` : "";
  // Field-of-view direction (t_f8b775ec): rendered as TEXT — the popup is
  // the accessible equivalent of the decorative map cone. Only directional
  // cameras with a stored bearing show it (domes are NULL by invariant).
  const directionRow =
    typeof camera.direction === "number" && Number.isFinite(camera.direction)
      ? `<div class="osm-popup-fact"><dt>${labels.fovDirection}</dt><dd>${formatDirection(camera.direction)}</dd></div>`
      : "";
  // Import provenance line (FASE C, t_4dbce318): discreet secondary text
  // at the very bottom — it must never steal space from the community
  // action widget. Imported records show the readable entity + licence
  // (linked); community reports show the localized label without a
  // licence; the offline demo seed falls back to its raw source value.
  // The block carries machine-readable data attributes (data-source /
  // data-license / data-license-url / data-import-date) — the stable data
  // contract the popup redesign (t_b7728ad0) consumes without refactor;
  // the visible text stays localized, never hardcoded.
  const provenanceBlock = options
    ? (() => {
        const isImported = options.provenance !== null;
        const sourceText = isImported
          ? `${labels.source}: ${escapeHtml(options.provenance!.sourceName)}${options.provenance!.licenseUrl ? ` · <a href="${escapeHtml(options.provenance!.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(options.provenance!.license)}</a>` : ` · ${escapeHtml(options.provenance!.license)}`}`
          : `${labels.source}: ${escapeHtml(camera.source === "Community report" ? labels.popupCommunityReport : (camera.source ?? labels.popupCommunityReport))}`;
        const added = camera.createdAt
          ? `${labels.popupAdded}: ${escapeHtml(formatPublicDate(camera.createdAt, options.locale))}`
          : "";
        const dataAttrs = isImported
          ? ` data-source="${escapeHtml(options.provenance!.sourceName)}" data-license="${escapeHtml(options.provenance!.license)}"${options.provenance!.licenseUrl ? ` data-license-url="${escapeHtml(options.provenance!.licenseUrl)}"` : ""}${camera.createdAt ? ` data-import-date="${escapeHtml(camera.createdAt)}"` : ""}`
          : ` data-source="${escapeHtml(camera.source === "Community report" ? labels.popupCommunityReport : (camera.source ?? labels.popupCommunityReport))}"`;
        return `<p class="osm-popup-provenance"${dataAttrs}>${sourceText}${added ? ` · ${added}` : ""}</p>`;
      })()
    : "";
  return [
    `<div class="osm-popup">`,
    // Header: title, kind, status — one compact block (t_b7728ad0).
    `<header class="osm-popup-header">`,
    `<h3>${escapeHtml(camera.title)}</h3>`,
    `<p class="osm-popup-kind">${escapeHtml(camera.kind)}</p>`,
    `<p class="osm-popup-status"><span class="status-dot ${camera.status}" aria-hidden="true"></span> ${publicStatusLabel(statuses, camera.status, labels.unknown)}</p>`,
    `</header>`,
    // Dense facts grid: id, location, direction (t_b7728ad0).
    `<dl class="osm-popup-facts">`,
    `<div class="osm-popup-fact"><dt>${labels.recordId}</dt><dd>${camera.id}</dd></div>`,
    `<div class="osm-popup-fact"><dt>${labels.location}</dt><dd>${coords}</dd></div>`,
    directionRow,
    `</dl>`,
    address,
    description,
    // Community action widget mount (ADR 0021 §3, FASE 3 UI): SurveillanceMap
    // renders the compact CommunityActions React root into this node on
    // 'popupopen'. The data-record-id attribute is the only contract — the
    // counts travel via the shared cameras payload, never through HTML.
    `<div class="osm-popup-community" data-record-id="${camera.id}"></div>`,
    // Footer: the single detail action (t_b7728ad0). The former "Report an
    // issue" link was removed — the disclosure's Problema/Privacy actions
    // are the record-level report surface; the detail page keeps the
    // correction form, so the popup footer no longer competes with it.
    `<p class="osm-popup-footer">`,
    `<a href="/records/${camera.id}">${labels.popupDetail} <span aria-hidden="true">→</span></a>`,
    `</p>`,
    provenanceBlock,
    `</div>`,
  ].join("");
}
