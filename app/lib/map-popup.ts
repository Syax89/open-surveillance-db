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
