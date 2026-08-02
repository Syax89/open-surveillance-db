import { env } from "cloudflare:workers";
import { classifyDuplicateMatch, textSimilarity, type MatchStrength } from "../app/lib/duplicate-detection";
import { PUBLIC_CAMERA_STATUSES } from "../app/lib/public-status";
import { confirmationCountsFor } from "./confirmations";

export type CameraRecord = {
  id: number;
  title: string;
  kind: string;
  manufacturer: string | null;
  observedOn: string | null;
  publishManufacturer: number;
  publishObservedOn: number;
  address: string | null;
  notes: string;
  latitude: number;
  longitude: number;
  status: string;
  source: string;
  updated: string;
  description: string;
  // Freshness state: last_verified_at is the machine-readable ISO date of the
  // last successful verification; review_due_at is the scheduled recheck date
  // (last_verified_at + review_interval_months). A verified record is only
  // published as current while it is inside this review window.
  lastVerifiedAt: string | null;
  reviewDueAt: string | null;
  reviewIntervalMonths: number;
  createdAt: string;
};

/** Public read boundary: the private `notes` field must never leave this type. */
export type PublicCameraRecord = Omit<CameraRecord, "notes"> & {
  /**
   * Decayed community-verification count (ADR 0018 §2.3). Aggregate only —
   * never attribution to any profile. Set by getPublicCameraById and the
   * paginated list (one GROUP BY IN query, no N+1); the full-list / nearby /
   * bbox surfaces keep their historical shape and do not populate it.
   */
  confirmationCount: number;
};

/**
 * Zone-level coordinate precision for the public boundary (decision 2026-07-31,
 * ADR 0008; TERMS_OF_USE.md § 8.4): published coordinates are rounded to
 * ~4 decimal places (~10 m). The exact location is stored in the database and
 * remains visible only to moderators (db/moderation.ts reads the raw columns).
 * Every public read path (directory list, by-id lookup, exports, search) must
 * pass through this rounding so the ~10 m promise holds on every surface.
 */
export function roundPublicCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * The schema (tables, metadata columns, indexes) is applied exclusively by
 * the Drizzle migrations in `drizzle/` (wrangler d1 migrations apply).
 * This function performs no runtime bootstrap and seeds no demo data.
 */
export async function getD1() {
  if (!env.DB) throw new Error("Database binding unavailable");
  return env.DB;
}

export const freshnessWindows = ["7d", "30d", "90d", "all"] as const;
export type FreshnessWindow = (typeof freshnessWindows)[number];
export type PublicCameraFilters = { kind?: string; freshness?: FreshnessWindow };

// Domain decision (F0, FRONTEND_PLAN § 3.2.6): the public freshness windows
// answer "when was this last verified on the ground?", so they are anchored
// on `last_verified_at`, not on `updated` (which also moves on non-verifying
// moderation edits such as a title fix). The moderation write path already
// sets last_verified_at on approve/reverify, and migration 0019 backfills it
// for legacy verified rows from their recovered verification timestamp.
function freshnessCutoff(freshness: Exclude<FreshnessWindow, "all">): string {
  const days = Number.parseInt(freshness, 10);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
export function publicCameraPredicate(nowIso: string): { sql: string; parameters: string[] } {
  // The shared public-read predicate, derived from PUBLIC_CAMERA_STATUSES
  // (app/lib/public-status.ts) — never hand-written into a query:
  //
  //   status IN (?, ?) AND (status = 'demo' OR review_due_at IS NULL OR review_due_at >= ?)
  //
  // The IN whitelist is generated from the single constant, and the freshness
  // carve-out keeps `demo` illustrative records public without a schedule while
  // every other public status must still be current at read time. Every public
  // query (directory list, by-id lookup, facets, bbox) shares this predicate so
  // a status change takes effect on every surface at once.
  const placeholders = PUBLIC_CAMERA_STATUSES.map(() => "?").join(", ");
  return {
    sql: `status IN (${placeholders}) AND (status = 'demo' OR review_due_at IS NULL OR review_due_at >= ?)`,
    parameters: [...PUBLIC_CAMERA_STATUSES, nowIso],
  };
}

export async function listPublicCameras(
  nowIsoOrFilters?: string | PublicCameraFilters,
): Promise<PublicCameraRecord[]> {
  const d1 = await getD1();
  // The first argument is either a review-window boundary (ISO string, as used
  // by the freshness-reverification suite) or a filter object (directory UI /
  // public API route). A string selects the boundary at a specific instant;
  // filter objects always evaluate the boundary "now".
  const filters =
    typeof nowIsoOrFilters === "string" ? undefined : nowIsoOrFilters;
  const nowIso =
    typeof nowIsoOrFilters === "string"
      ? nowIsoOrFilters
      : new Date().toISOString();
  const parameters: string[] = [];
  // Public visibility boundary: derived from PUBLIC_CAMERA_STATUSES — only
  // `demo` records and `verified` records still inside their review window
  // (or without a schedule, i.e. not provably stale) are presented as
  // current. This mirrors isPubliclyCurrent() in db/freshness.ts.
  const { sql: publicPredicate, parameters: predicateParameters } = publicCameraPredicate(nowIso);
  parameters.push(...predicateParameters);
  let query = `SELECT id, title, kind, CASE WHEN publish_manufacturer = 1 THEN manufacturer ELSE NULL END AS manufacturer, CASE WHEN publish_observed_on = 1 THEN observed_on ELSE NULL END AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt FROM cameras WHERE ${publicPredicate}`;
  if (filters?.kind) {
    query += " AND kind = ?";
    parameters.push(filters.kind);
  }
  if (filters?.freshness && filters.freshness !== "all") {
    query += " AND last_verified_at >= ?";
    parameters.push(freshnessCutoff(filters.freshness));
    // No GLOB anti-label filter here: migration 0019 normalised every
    // non-ISO `updated` value to a real timestamp, and the freshness window
    // itself is anchored on `last_verified_at` (domain decision, § 3.2.6), so
    // the comparison is always meaningful and the composite
    // (status, last_verified_at) index is usable — a GLOB would defeat the
    // index seek.
  }
  query += " ORDER BY id DESC";
  const result = await d1.prepare(query).bind(...parameters).all<PublicCameraRecord>();
  return result.results.map((record) => ({ ...record, latitude: roundPublicCoordinate(record.latitude), longitude: roundPublicCoordinate(record.longitude) }));
}

/** Default and hard-max page size for the public JSON list (audit t_2ee58c08, gap #1). */
export const PUBLIC_CAMERAS_PAGE_DEFAULT_LIMIT = 500;
export const PUBLIC_CAMERAS_PAGE_MAX_LIMIT = 500;

export type PublicCameraListPage = {
  records: PublicCameraRecord[];
  /** Total number of records matching the filters, independent of the page. */
  total: number;
  /** Offset of the next page, or null when the current page is the last one. */
  nextOffset: number | null;
};

/**
 * Paginated variant of listPublicCameras for the default JSON directory.
 *
 * The default JSON payload must stay bounded as the dataset grows, while the
 * CSV/GeoJSON exports remain complete snapshots (they keep calling
 * listPublicCameras). The page shares the same public predicate, the same
 * publish-flag CASEs and the same ~10 m coordinate rounding as the full
 * list, and ORDER BY id DESC keeps offsets stable between requests. `limit`
 * is clamped to [1, PUBLIC_CAMERAS_PAGE_MAX_LIMIT] and `offset` to >= 0 at
 * the db boundary, so a caller can never request an unbounded page.
 */
export async function listPublicCamerasPage(
  nowIsoOrFilters?: string | PublicCameraFilters,
  options: { limit: number; offset: number } = { limit: PUBLIC_CAMERAS_PAGE_DEFAULT_LIMIT, offset: 0 },
): Promise<PublicCameraListPage> {
  const d1 = await getD1();
  // Same dual first argument as listPublicCameras: an ISO boundary string
  // (freshness-reverification suite) or a filter object (directory route).
  const filters = typeof nowIsoOrFilters === "string" ? undefined : nowIsoOrFilters;
  const nowIso = typeof nowIsoOrFilters === "string" ? nowIsoOrFilters : new Date().toISOString();
  // Defensive clamp: the route already validates, but the db boundary never
  // trusts its caller with an unbounded page size.
  const limit = Math.min(Math.max(Math.trunc(options.limit) || PUBLIC_CAMERAS_PAGE_DEFAULT_LIMIT, 1), PUBLIC_CAMERAS_PAGE_MAX_LIMIT);
  const offset = Math.max(Math.trunc(options.offset) || 0, 0);
  const parameters: string[] = [];
  const { sql: publicPredicate, parameters: predicateParameters } = publicCameraPredicate(nowIso);
  parameters.push(...predicateParameters);
  let query = `FROM cameras WHERE ${publicPredicate}`;
  if (filters?.kind) {
    query += " AND kind = ?";
    parameters.push(filters.kind);
  }
  if (filters?.freshness && filters.freshness !== "all") {
    query += " AND last_verified_at >= ?";
    parameters.push(freshnessCutoff(filters.freshness));
    // Same normalisation + last_verified_at anchor note as listPublicCameras:
    // migration 0019 made every `updated` value ISO, the freshness window is
    // anchored on last_verified_at, so no GLOB is needed and the composite
    // index stays usable.
  }
  const countResult = await d1.prepare(`SELECT COUNT(*) AS total ${query}`).bind(...parameters).first<{ total: number }>();
  const total = countResult?.total ?? 0;
  const result = await d1
    .prepare(`SELECT id, title, kind, CASE WHEN publish_manufacturer = 1 THEN manufacturer ELSE NULL END AS manufacturer, CASE WHEN publish_observed_on = 1 THEN observed_on ELSE NULL END AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt ${query} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .bind(...parameters, limit, offset)
    .all<PublicCameraRecord>();
  const records = result.results.map((record) => ({ ...record, latitude: roundPublicCoordinate(record.latitude), longitude: roundPublicCoordinate(record.longitude), confirmationCount: 0 }));
  // Community-verification counts (ADR 0018 §2.3): one GROUP BY IN query for
  // the whole page — never an N+1 per record. The counts are decayed (only
  // confirmations at/after last_verified_at count).
  if (records.length > 0) {
    const counts = await confirmationCountsFor(records.map((record) => record.id));
    for (const record of records) record.confirmationCount = counts.get(record.id) ?? 0;
  }
  const nextOffset = offset + records.length < total ? offset + records.length : null;
  return { records, total, nextOffset };
}
export type NearbyPublicCameraRecord = PublicCameraRecord & { distanceMeters: number };
function distanceInMeters(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) { const earthRadiusMeters = 6_371_000; const toRadians = (degrees: number) => degrees * Math.PI / 180; const latitudeDelta = toRadians(toLatitude - fromLatitude); const longitudeDelta = toRadians(toLongitude - fromLongitude); const latitudeStart = toRadians(fromLatitude); const latitudeEnd = toRadians(toLatitude); const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeStart) * Math.cos(latitudeEnd) * Math.sin(longitudeDelta / 2) ** 2; return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)); }
/**
 * Bounding-box pre-filter for the proximity searches.
 *
 * `findNearbyPublicCameras` and `searchPublicCamerasNear` used to load the
 * whole public dataset (`listPublicCameras()`, no LIMIT, no geographic
 * filter) and run haversine in JS over every record — O(N) per request.
 * This variant narrows the candidate set to an approximate lat/lon box
 * around the query point (~1° latitude ≈ 111 km), so the exact haversine
 * pass runs only over the box. D1 has no spatial index: the box is a
 * selective filter, not a true index, but it drops the candidate set from
 * O(N) to O(box) (audit gap t_2ee58c08).
 *
 * The returned records carry the exact same public shape as
 * `listPublicCameras` (same public predicate, same publish-flag CASEs,
 * same coordinate rounding) so both callers keep their existing contracts.
 */
export async function listPublicCamerasNear(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  nowIso: string = new Date().toISOString(),
  options?: { rawCoordinates?: boolean },
): Promise<PublicCameraRecord[]> {
  const d1 = await getD1();
  const { sql: publicPredicate, parameters: predicateParameters } = publicCameraPredicate(nowIso);
  // ~1° of latitude ≈ 111,320 m; longitude degrees shrink with cos(latitude).
  // Clamp cos to a small floor so a polar query degrades to a wider (still
  // correct) box instead of dividing by zero. The box may extend past the
  // ±180° antimeridian; BETWEEN then covers the intersection with the stored
  // range, which is the correct conservative pre-filter.
  //
  // The box is widened by a fixed padding because the public boundary rounds
  // coordinates to ~4 decimals (~10 m, ADR 0008): a record whose RAW
  // coordinates sit just outside the radius can round to a point inside it,
  // and the old full-scan path (which measured distance on the rounded
  // values) would have returned it. Padding the box by more than the maximum
  // rounding displacement (~8 m diagonal) guarantees the exact haversine
  // pass below still sees every record the old path would have seen — the
  // box only ever removes records that are provably outside the radius.
  const ROUNDING_PADDING_METERS = 15;
  const latitudeDelta = (radiusMeters + ROUNDING_PADDING_METERS) / 111_320;
  const longitudeDelta = (radiusMeters + ROUNDING_PADDING_METERS) / (111_320 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));
  const parameters = [
    ...predicateParameters,
    latitude - latitudeDelta,
    latitude + latitudeDelta,
    longitude - longitudeDelta,
    longitude + longitudeDelta,
  ];
  const query = `SELECT id, title, kind, CASE WHEN publish_manufacturer = 1 THEN manufacturer ELSE NULL END AS manufacturer, CASE WHEN publish_observed_on = 1 THEN observed_on ELSE NULL END AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt FROM cameras WHERE ${publicPredicate} AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY id DESC`;
  const result = await d1.prepare(query).bind(...parameters).all<PublicCameraRecord>();
  // Internal raw read for the duplicate check only (INTERNAL ONLY, same rule
  // as listPublicCameras' rounding boundary): the pre-submit duplicate
  // check measures distance on the exact stored position, then re-rounds at
  // response projection. Public callers always take the rounded projection.
  if (options?.rawCoordinates) return result.results;
  return result.results.map((record) => ({ ...record, latitude: roundPublicCoordinate(record.latitude), longitude: roundPublicCoordinate(record.longitude) }));
}
export type DuplicateCandidateRecord = NearbyPublicCameraRecord & { similarity: number; matchStrength: MatchStrength };
export async function findNearbyPublicCameras(latitude: number, longitude: number, radiusMeters: number, duplicateInput?: { title?: string; address?: string; kind?: string }): Promise<DuplicateCandidateRecord[]> { const records = await listPublicCamerasNear(latitude, longitude, radiusMeters, undefined, { rawCoordinates: true }); const submittedText = [duplicateInput?.title, duplicateInput?.address, duplicateInput?.kind].filter(Boolean).join(" "); const hasTextSignal = submittedText.trim().length > 0; return records.map((record) => { const distanceMeters = distanceInMeters(latitude, longitude, record.latitude, record.longitude); const similarity = hasTextSignal ? textSimilarity(submittedText, [record.title, record.address ?? "", record.kind].join(" ")) : 0; return { ...record, distanceMeters, similarity, matchStrength: classifyDuplicateMatch(distanceMeters, similarity, hasTextSignal) }; }).filter((record) => record.distanceMeters <= radiusMeters).sort((first, second) => first.distanceMeters - second.distanceMeters || second.similarity - first.similarity).slice(0, 8).map((record) => ({ ...record, latitude: roundPublicCoordinate(record.latitude), longitude: roundPublicCoordinate(record.longitude) })); }
/**
 * Area search for the locality/address/coordinate route (GET /api/cameras/search).
 *
 * Deliberately separate from `findNearbyPublicCameras`: that helper serves the
 * pre-submit duplicate warning (bounded radius, internal similarity signals,
 * and a fixed 8-result cap). A directory search must instead return every
 * reviewed public record near the resolved place — without duplicate-detection
 * internals — so the client can show a truthful result count and never present
 * a capped list as the complete picture.
 */
export async function searchPublicCamerasNear(latitude: number, longitude: number, radiusMeters: number): Promise<NearbyPublicCameraRecord[]> {
  const records = await listPublicCamerasNear(latitude, longitude, radiusMeters);
  return records.map((record) => ({ ...record, distanceMeters: distanceInMeters(latitude, longitude, record.latitude, record.longitude) }))
    .filter((record) => record.distanceMeters <= radiusMeters)
    .sort((first, second) => first.distanceMeters - second.distanceMeters);
}
export async function createPendingCamera(input: { title: string; kind: string; manufacturer: string | null; observedOn: string | null; address: string; notes: string; latitude: number; longitude: number; contributorId?: number | null }): Promise<CameraRecord> { const d1 = await getD1(); const now = new Date().toISOString(); const result = await d1.prepare("INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, status, source, updated, description, contributor_id, created_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 'pending', 'Community report', ?, '', ?, ?) RETURNING id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, contributor_id AS contributorId, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt").bind(input.title, input.kind, input.manufacturer, input.observedOn, input.address || null, input.notes, input.latitude, input.longitude, now, input.contributorId ?? null, now).first<CameraRecord & { contributorId: number | null }>(); if (!result) throw new Error("Report could not be stored"); return result; }
export async function getPublicCameraById(id: number, nowIso: string = new Date().toISOString()): Promise<PublicCameraRecord | null> {
  const d1 = await getD1();
  // Same shared public predicate as listPublicCameras: only records whose
  // status is in PUBLIC_CAMERA_STATUSES and still current may resolve.
  const { sql: publicPredicate, parameters } = publicCameraPredicate(nowIso);
  const result = await d1
    .prepare(
      `SELECT id, title, kind, CASE WHEN publish_manufacturer = 1 THEN manufacturer ELSE NULL END AS manufacturer, CASE WHEN publish_observed_on = 1 THEN observed_on ELSE NULL END AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt FROM cameras WHERE id = ? AND ${publicPredicate}`,
    )
    .bind(id, ...parameters)
    .first<PublicCameraRecord>();
  if (!result) return null;
  // Decayed community-verification count (ADR 0018 §2.3), aggregate only.
  const confirmationCount = await confirmationCountsFor([id]).then((map) => map.get(id) ?? 0);
  return { ...result, latitude: roundPublicCoordinate(result.latitude), longitude: roundPublicCoordinate(result.longitude), confirmationCount };
}

export type PublicCameraFacets = {
  kinds: { kind: string; count: number }[];
  freshness: { "7d": number; "30d": number; "90d": number; all: number };
};

/**
 * Facets for the directory/map filters (FRONTEND_PLAN § 3.2.2): the distinct
 * public `kind` values with their counts and the freshness-window counts.
 *
 * The facets describe the FULL public dataset (shared predicate, no kind or
 * freshness filter applied): the filter UI must keep offering every kind even
 * while one is active, so the counts are computed on the same boundary the
 * list itself uses, never on a filtered subset. The freshness windows use the
 * same last_verified_at anchor as the list filter (domain decision § 3.2.6);
 * `all` is the total public count. Both aggregate queries are served by the
 * composite indexes declared in schema.ts (status, kind) and
 * (status, last_verified_at DESC) and created by migration 0019.
 */
export async function getPublicCameraFacets(nowIso: string = new Date().toISOString()): Promise<PublicCameraFacets> {
  const d1 = await getD1();
  const { sql: publicPredicate, parameters: predicateParameters } = publicCameraPredicate(nowIso);
  const kinds = await d1
    .prepare(`SELECT kind, COUNT(*) AS count FROM cameras WHERE ${publicPredicate} GROUP BY kind ORDER BY count DESC, kind ASC`)
    .bind(...predicateParameters)
    .all<{ kind: string; count: number }>();
  const freshness = await d1
    .prepare(
      `SELECT COUNT(*) AS allCount, SUM(CASE WHEN last_verified_at >= ? THEN 1 ELSE 0 END) AS d7, SUM(CASE WHEN last_verified_at >= ? THEN 1 ELSE 0 END) AS d30, SUM(CASE WHEN last_verified_at >= ? THEN 1 ELSE 0 END) AS d90 FROM cameras WHERE ${publicPredicate}`,
    )
    .bind(freshnessCutoff("7d"), freshnessCutoff("30d"), freshnessCutoff("90d"), ...predicateParameters)
    .first<{ allCount: number; d7: number; d30: number; d90: number }>();
  return {
    kinds: kinds.results,
    freshness: {
      "7d": freshness?.d7 ?? 0,
      "30d": freshness?.d30 ?? 0,
      "90d": freshness?.d90 ?? 0,
      all: freshness?.allCount ?? 0,
    },
  };
}

/**
 * Bounding-box variant of the public list for the map marker layer
 * (FRONTEND_PLAN § 3.3: the map needs all points in the visible box, not a
 * page). Same shared predicate, publish-flag CASEs and ~10 m rounding as
 * every other public surface. `bbox` is [west, south, east, north] in
 * decimal degrees; the coordinates composite index serves the BETWEEN.
 */
export async function listPublicCamerasInBbox(
  bbox: { west: number; south: number; east: number; north: number },
  nowIso: string = new Date().toISOString(),
): Promise<PublicCameraRecord[]> {
  const d1 = await getD1();
  const { sql: publicPredicate, parameters: predicateParameters } = publicCameraPredicate(nowIso);
  const parameters = [...predicateParameters, bbox.south, bbox.north, bbox.west, bbox.east];
  const query = `SELECT id, title, kind, CASE WHEN publish_manufacturer = 1 THEN manufacturer ELSE NULL END AS manufacturer, CASE WHEN publish_observed_on = 1 THEN observed_on ELSE NULL END AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt FROM cameras WHERE ${publicPredicate} AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY id DESC`;
  const result = await d1.prepare(query).bind(...parameters).all<PublicCameraRecord>();
  return result.results.map((record) => ({ ...record, latitude: roundPublicCoordinate(record.latitude), longitude: roundPublicCoordinate(record.longitude) }));
}

/** Default and hard-max page size for search/nearby (FRONTEND_PLAN § 3.2.3). */
export const SEARCH_PAGE_DEFAULT_LIMIT = 25;
export const SEARCH_PAGE_MAX_LIMIT = 100;
export const NEARBY_PAGE_DEFAULT_LIMIT = 50;
export const NEARBY_PAGE_MAX_LIMIT = 100;

/**
 * Paginated variant of searchPublicCamerasNear for GET /api/cameras/search:
 * same exact distance ordering, same shape as the list pagination
 * ({ records, total, nextOffset }) so the frontend reuses one pagination
 * contract (FRONTEND_PLAN § 3.2.3).
 */
export async function searchPublicCamerasNearPage(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  options: { limit: number; offset: number } = { limit: SEARCH_PAGE_DEFAULT_LIMIT, offset: 0 },
): Promise<{ records: NearbyPublicCameraRecord[]; total: number; nextOffset: number | null }> {
  const limit = Math.min(Math.max(Math.trunc(options.limit) || SEARCH_PAGE_DEFAULT_LIMIT, 1), SEARCH_PAGE_MAX_LIMIT);
  const offset = Math.max(Math.trunc(options.offset) || 0, 0);
  const records = await searchPublicCamerasNear(latitude, longitude, radiusMeters);
  const total = records.length;
  const page = records.slice(offset, offset + limit);
  const nextOffset = offset + page.length < total ? offset + page.length : null;
  return { records: page, total, nextOffset };
}

/**
 * Paginated variant of searchPublicCamerasNear for GET /api/cameras/nearby
 * (FRONTEND_PLAN § 3.2.3): same distance ordering, same pagination shape,
 * larger default page (50).
 */
export async function findNearbyPublicCamerasPage(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  options: { limit: number; offset: number } = { limit: NEARBY_PAGE_DEFAULT_LIMIT, offset: 0 },
): Promise<{ records: NearbyPublicCameraRecord[]; total: number; nextOffset: number | null }> {
  const limit = Math.min(Math.max(Math.trunc(options.limit) || NEARBY_PAGE_DEFAULT_LIMIT, 1), NEARBY_PAGE_MAX_LIMIT);
  const offset = Math.max(Math.trunc(options.offset) || 0, 0);
  const records = await searchPublicCamerasNear(latitude, longitude, radiusMeters);
  const total = records.length;
  const page = records.slice(offset, offset + limit);
  const nextOffset = offset + page.length < total ? offset + page.length : null;
  return { records: page, total, nextOffset };
}
