import { DATA_LICENSE_ID, DATA_LICENSE_NOTICE } from "./data-license";

/**
 * directory-export — client-side serialisation of the /directory filtered set
 * (issue #409: export CSV/GeoJSON must respect the active filters).
 *
 * The export is generated IN THE BROWSER from the exact records the user is
 * looking at (`filteredRecords` in DirectoryTool — every filter dimension
 * applied: q, type, freshness, state, origin and the sort order). This is
 * the only way the download can honour the client-side dimensions (q search,
 * state, origin, sort) that GET /api/cameras cannot express (the API only
 * filters kind + freshness in SQL, and those alone were the pre-#409
 * behaviour: exporting "Milano" + "confirmed" still downloaded the whole
 * database).
 *
 * Parity contract: the CSV and GeoJSON shapes below MIRROR the server
 * exports in app/api/cameras/route.ts byte-for-byte (same header, same
 * cell-escaping, same feature properties, same ODbL attribution), so a
 * client-generated download is indistinguishable from the API one — and the
 * API route keeps its own copies for the server-side fallback (used when the
 * directory walk failed, see DirectoryTool exportFallbackHref).
 *
 * The module is deliberately PURE (no DOM) so the serialisers and the
 * filename builder are unit-testable in the dom-harness; only
 * downloadTextFile touches the DOM.
 */

/** Minimal structural row the serialisers need (client Camera and server
 * PublicCameraRecord both satisfy it). */
export type ExportCameraRow = {
  id: number;
  title: string;
  kind: string;
  manufacturer?: string | null;
  observedOn?: string | null;
  status: string;
  source: string;
  updated: string;
  description: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  direction?: number | null;
};

/** The filter dimensions that shape the export filename (structural subset
 * of CameraFilters — kept local so this module stays importable anywhere). */
export type ExportFilterState = {
  type: string;
  freshness: string;
  state: string;
  origin: string;
};

/**
 * Filter-aware export filename (issue #409 AC3): `osdb-<kind>-<state>-
 * <origin>-<freshness>.<format>` with only the ACTIVE filters, or
 * `osdb-public.<format>` when no filter is set. Slugs are safe for any
 * filesystem (lowercase alphanumerics + dashes), so a kind like
 * "Traffic camera" becomes `traffic-camera`.
 */
export function exportFileName(filters: ExportFilterState, format: "csv" | "geojson"): string {
  const parts: string[] = [];
  if (filters.type && filters.type !== "all") parts.push(slug(filters.type));
  if (filters.state !== "all") parts.push(filters.state);
  if (filters.origin !== "all") parts.push(filters.origin);
  if (filters.freshness !== "all") parts.push(filters.freshness);
  const stem = parts.length > 0 ? `osdb-${parts.join("-")}` : "osdb-public";
  return `${stem}.${format}`;
}

/** Lowercase alphanumeric slug (spaces and punctuation become dashes). */
function slug(value: string): string {
  const out = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "filter";
}

/**
 * CSV serialisation — mirrors app/api/cameras/route.ts toCsv(): identical
 * header row, identical per-cell escaping (double quotes, spreadsheet
 * formula neutralisation for cells starting with = + - @) and the same ODbL
 * attribution footer, so existing spreadsheet consumers keep working.
 */
export function camerasToCsv(records: ExportCameraRow[]): string {
  const header = ["id", "title", "kind", "manufacturer", "observed_on", "status", "source", "updated", "description", "address", "latitude", "longitude", "direction"];
  const rows = records.map((record) =>
    [
      record.id,
      record.title,
      record.kind,
      record.manufacturer ?? null,
      record.observedOn ?? null,
      record.status,
      record.source,
      record.updated,
      record.description,
      record.address ?? null,
      record.latitude,
      record.longitude,
      record.direction ?? null,
    ]
      .map(csvCell)
      .join(","),
  );
  return `${header.join(",")}\n${rows.join("\n")}\n# ${DATA_LICENSE_NOTICE}\n`;
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

/**
 * GeoJSON serialisation — mirrors app/api/cameras/route.ts: RFC 7946
 * FeatureCollection with the ODbL license/attribution as foreign members and
 * the same feature property set (id, title, kind, manufacturer, observedOn,
 * status, source, updated, description, direction). No address field, exactly
 * like the server export.
 */
export function camerasToGeoJson(records: ExportCameraRow[]): {
  type: "FeatureCollection";
  license: string;
  attribution: string;
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: {
      id: number;
      title: string;
      kind: string;
      manufacturer: string | null;
      observedOn: string | null;
      status: string;
      source: string;
      updated: string;
      description: string;
      direction: number | null;
    };
  }>;
} {
  return {
    type: "FeatureCollection",
    license: DATA_LICENSE_ID,
    attribution: DATA_LICENSE_NOTICE,
    features: records.map((record) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [record.longitude, record.latitude] },
      properties: {
        id: record.id,
        title: record.title,
        kind: record.kind,
        manufacturer: record.manufacturer ?? null,
        observedOn: record.observedOn ?? null,
        status: record.status,
        source: record.source,
        updated: record.updated,
        description: record.description,
        direction: record.direction ?? null,
      },
    })),
  };
}

/**
 * Trigger a text-file download in the browser (Blob URL + programmatic
 * anchor click). The only DOM-touching function in this module; everything
 * above is pure and unit-testable without jsdom.
 */
export function downloadTextFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
