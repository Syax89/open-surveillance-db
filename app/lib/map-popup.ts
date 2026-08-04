/**
 * Marker popup HTML builder (t_702c10af, refactor t_b9666d09).
 *
 * The map popup is assembled client-side as an HTML string and bound with
 * Leaflet's bindPopup. Every record field is HTML-escaped — the popup must
 * stay inert — and the status label comes from the public safe helper
 * (publicStatusLabel), never from a raw value. Extracted from MapPanel so
 * the map workspace stays a thin orchestrator (~150-line contract,
 * component-smoke.test.mjs) and the popup shape has one owner.
 */
import { escapeHtml } from "./map-viewport";
import { publicStatusLabel } from "./public-status";
import { formatDirection } from "./compass";
import type { MapCamera } from "../components/SurveillanceMap";

/** Localized strings the popup renders (a subset of the map dictionary). */
export type PopupLabels = {
  recordId: string;
  location: string;
  popupDetail: string;
  reportIssue: string;
  unknown: string;
  /** Label for the field-of-view direction row (t_f8b775ec). */
  fovDirection: string;
};

/** Status label helper compatible with publicStatusLabel's signature. */
export type StatusLabels = Parameters<typeof publicStatusLabel>[0];

/**
 * Build the popup HTML for one camera marker: title, kind, status dot +
 * label, record id, coordinates, optional address/description, and the
 * correction + detail links. `issueHref` is the base route the "Report an
 * issue" action links to (defaults to /correggi in MapPanel).
 */
export function popupHtmlFor(
  camera: MapCamera,
  statuses: StatusLabels,
  labels: PopupLabels,
  issueHref: string,
): string {
  const coords = `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}`;
  const address = camera.address ? `<p class="osm-popup-address">${escapeHtml(camera.address)}</p>` : "";
  const description = camera.description ? `<p class="osm-popup-description">${escapeHtml(camera.description)}</p>` : "";
  // Field-of-view direction (t_f8b775ec): rendered as TEXT — the popup is
  // the accessible equivalent of the decorative map cone. Only directional
  // cameras with a stored bearing show it (domes are NULL by invariant).
  const directionRow =
    typeof camera.direction === "number" && Number.isFinite(camera.direction)
      ? `<div><dt>${labels.fovDirection}</dt><dd>${formatDirection(camera.direction)}</dd></div>`
      : "";
  return [
    `<div class="osm-popup">`,
    `<h3>${escapeHtml(camera.title)}</h3>`,
    `<p class="osm-popup-kind">${escapeHtml(camera.kind)}</p>`,
    `<p class="osm-popup-status"><span class="status-dot ${camera.status}" aria-hidden="true"></span> ${publicStatusLabel(statuses, camera.status, labels.unknown)}</p>`,
    `<dl>`,
    `<div><dt>${labels.recordId}</dt><dd>${camera.id}</dd></div>`,
    `<div><dt>${labels.location}</dt><dd>${coords}</dd></div>`,
    directionRow,
    `</dl>`,
    address,
    description,
    `<p class="osm-popup-actions">`,
    `<a href="/records/${camera.id}">${labels.popupDetail} <span aria-hidden="true">→</span></a>`,
    `<a href="${issueHref}?record=${camera.id}">${labels.reportIssue} <span aria-hidden="true">→</span></a>`,
    `</p>`,
    `</div>`,
  ].join("");
}
