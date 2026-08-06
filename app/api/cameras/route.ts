import { env } from "cloudflare:workers";
import { createCamera, DOME_KIND, findNearbyPublicCameras, freshnessWindows, getPublicCameraFacets, listPublicCameras, listPublicCamerasInBbox, listPublicCamerasInBboxPage, listPublicCamerasPage, PUBLIC_CAMERAS_BBOX_DEFAULT_LIMIT, PUBLIC_CAMERAS_BBOX_MAX_LIMIT, PUBLIC_CAMERAS_PAGE_DEFAULT_LIMIT, PUBLIC_CAMERAS_PAGE_MAX_LIMIT, PUBLIC_CAMERA_SORT_OPTIONS, type FreshnessWindow, type PublicCameraFacets, type PublicCameraFilters } from "../../../db/cameras";
import { requiresDuplicateConfirmation } from "../../lib/duplicate-detection";
import { requireVerifiedContributor } from "../../lib/write-gate";
import { csrfVerified, sameOrigin } from "../../lib/csrf";
import { DATA_LICENSE_ID, DATA_LICENSE_NOTICE } from "../../lib/data-license";
import { linkPhotosToCamera } from "../../../db/photos";
import { isRecord } from "../../lib/guards";
import {
  callerKey,
  checkRateLimit,
  limitsFor,
  submissionLimits,
  submissionsDisabled,
  type RouteKind,
} from "../../lib/rate-limit";
import { recordRateLimitBlock } from "../../lib/abuse-alerts";
import { CACHE_TAGS } from "../../lib/cache-purge";
import {
  BodyReadError,
  MAX_PAGE_OFFSET,
  readJsonBody,
  urlTooLong,
} from "../../lib/input-limits";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// Pagination for the default JSON list (audit t_2ee58c08, gap #1): `limit`
// and `offset` are optional non-negative integers. A blank value falls back
// to `fallback`; anything else that is not a plain decimal integer is
// rejected (null), and an over-max limit is clamped to `max` — a client
// asking for 100000 records gets the maximum page, not an error.
function readPageNumber(value: string | null, fallback: number, max?: number): number | null {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed)) return null;
  return max === undefined ? parsed : Math.min(parsed, max);
}

function isValidCalendarDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function cleanObservedOn(value: unknown) {
  const date = cleanText(value, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && isValidCalendarDate(date) ? date : "";
}

/**
 * Field-of-view direction input (kanban t_1b08fe12): a compass bearing in
 * degrees 0-359 (clockwise from north), or null/absent for
 * non-directional / unknown. Only a plain integer number is accepted —
 * strings ("45"), floats (45.5) and booleans are rejected. The caller maps
 * "invalid" to 422. 0 is a VALID bearing (north) and must never be treated
 * as falsy.
 */
function readDirection(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 359) return "invalid";
  return value;
}

/**
 * The dome rule (t_1b08fe12 decision, documented in db/cameras.ts DOME_KIND):
 * a camera whose kind is a dome has no directional field of view, so any
 * supplied direction is IGNORED (normalised to null) rather than rejected —
 * the map renders domes circular. The invariant is re-applied at every write
 * boundary (POST here, applyCameraEdit / moderateCameraEdit for edits).
 */
function normalizeDomeDirection(kind: string, direction: number | null): number | null {
  return kind === DOME_KIND ? null : direction;
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function toCsv(records: Awaited<ReturnType<typeof listPublicCameras>>) {
  // `direction` is appended LAST so the historical column positions stay
  // stable for existing consumers (t_1b08fe12); blank cell = non-directional.
  const header = ["id", "title", "kind", "manufacturer", "observed_on", "status", "source", "updated", "description", "address", "latitude", "longitude", "direction"];
  const rows = records.map((record) => [record.id, record.title, record.kind, record.manufacturer, record.observedOn, record.status, record.source, record.updated, record.description, record.address, record.latitude, record.longitude, record.direction].map(csvCell).join(","));
  // ODbL 1.0 attribution (TERMS_OF_USE § 7.1): the licence requires the
  // notice when the database is shared, so every export carries it. The
  // footer comment keeps the header line parseable by spreadsheet tools.
  return `${header.join(",")}\n${rows.join("\n")}\n# ${DATA_LICENSE_NOTICE}\n`;
}

export async function GET(request: Request) {
  // Input limits: reject absurdly long URLs before any parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  // Rate limits: plain reads share a generous bucket, bulk exports (CSV and
  // GeoJSON) get a stricter one so anomalous export traffic is throttled.
  const format = new URL(request.url).searchParams.get("format");
  const kind: RouteKind = format === "csv" || format === "geojson" ? "export" : "read";
  const key = callerKey(request, env);
  const limitOptions = limitsFor(kind, env);
  const limit = await checkRateLimit(env, kind, key, limitOptions);
  if (!limit.allowed) {
    console.warn(`GET /api/cameras rate limited (${kind} bucket)`);
    recordRateLimitBlock(env, {
      route: "/api/cameras",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  try {
    const params = new URL(request.url).searchParams;
    const kindFilter = cleanText(params.get("kind"), 60);
    const freshness = params.get("freshness");
    if (freshness !== null && !freshnessWindows.includes(freshness as FreshnessWindow)) {
      return Response.json({ error: `Unknown freshness window. Use one of: ${freshnessWindows.join(", ")}.` }, { status: 400 });
    }
    const sort = params.get("sort");
    if (sort !== null && !PUBLIC_CAMERA_SORT_OPTIONS.includes(sort as "useful" | "recent" | "confirmations")) {
      return Response.json({ error: `Unknown sort option. Use one of: ${PUBLIC_CAMERA_SORT_OPTIONS.join(", ")}.` }, { status: 400 });
    }
    const filters: PublicCameraFilters = {};
    if (kindFilter) filters.kind = kindFilter;
    if (freshness && freshness !== "all") filters.freshness = freshness as FreshnessWindow;
    if (sort) filters.sort = sort as "useful" | "recent" | "confirmations";

    // Map marker layer (FRONTEND_PLAN § 3.3): `bbox=west,south,east,north`
    // returns every public point inside the box as GeoJSON. Bounded 5-minute
    // edge cache (same policy as the JSON list): moderation decisions change
    // the marker set, so the map must never serve a stale point for long.
    //
    // P0 map UX regression (kanban t_bb310428): the JSON LIST also accepts
    // bbox now — the interactive map fetches ONLY the current viewport
    // instead of walking all 7,374 records serially. Same strict geometry
    // validation, same 5-minute cache; the payload is the regular
    // { records, total, nextOffset } shape (kind/freshness filters apply).
    // CSV exports never accept a bbox (they are complete snapshots).
    const bboxParam = params.get("bbox");
    if (bboxParam !== null) {
      if (format !== null && format !== "geojson" && format !== "json") {
        return Response.json({ error: "The bbox parameter requires format=geojson or the default JSON list (no format)." }, { status: 400 });
      }
      // Strict decimal segments (follow-up F0, t_ae600b90): `Number("")` is 0,
      // so a trailing comma like "12.4,41.8,12.6," would silently parse the
      // empty segment as 0. A regex per segment rejects empty values and
      // non-decimal syntax ("1e3", "0x10") before any arithmetic.
      const segments = bboxParam.split(",").map((part) => part.trim());
      if (
        segments.length !== 4 ||
        segments.some((part) => !/^-?\d+(\.\d+)?$/.test(part))
      ) {
        return Response.json({ error: "bbox must be four numbers: west,south,east,north." }, { status: 400 });
      }
      const [west, south, east, north] = segments.map((part) => Number(part));
      if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
        return Response.json({ error: "bbox must be a valid geographic rectangle: west<east and south<north within world bounds." }, { status: 400 });
      }
      if (format === "geojson") {
        const records = await listPublicCamerasInBbox({ west, south, east, north });
        return Response.json({ type: "FeatureCollection", license: DATA_LICENSE_ID, attribution: DATA_LICENSE_NOTICE, features: records.map((record) => ({ type: "Feature", geometry: { type: "Point", coordinates: [record.longitude, record.latitude] }, properties: { id: record.id, title: record.title, kind: record.kind, manufacturer: record.manufacturer, observedOn: record.observedOn, status: record.status, source: record.source, updated: record.updated, description: record.description, direction: record.direction } })) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "Cache-Tag": CACHE_TAGS.bbox } });
      }
      // JSON bbox contract (t_bb310428): the map viewport page. limit/offset
      // page through the bbox subset (bounded by PUBLIC_CAMERAS_BBOX_MAX_LIMIT
      // at the db boundary); `total` is the count of matching records INSIDE
      // the box, so total/nextOffset stay equivalent for the caller.
      const bboxLimit = readPageNumber(params.get("limit"), PUBLIC_CAMERAS_BBOX_DEFAULT_LIMIT, PUBLIC_CAMERAS_BBOX_MAX_LIMIT);
      const bboxOffset = readPageNumber(params.get("offset"), 0);
      if (bboxLimit === null || bboxOffset === null || bboxLimit < 1 || bboxOffset > MAX_PAGE_OFFSET) {
        return Response.json({ error: `limit must be an integer between 1 and ${PUBLIC_CAMERAS_BBOX_MAX_LIMIT} and offset a non-negative integer up to ${MAX_PAGE_OFFSET}.` }, { status: 400 });
      }
      const page = await listPublicCamerasInBboxPage({ west, south, east, north }, filters, { limit: bboxLimit, offset: bboxOffset });
      return Response.json(
        { records: page.records, total: page.total, nextOffset: page.nextOffset },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "Cache-Tag": CACHE_TAGS.list } },
      );
    }

    if (format === "geojson") {
      // Exports are complete snapshots (rate-limited in the "export" bucket):
      // they fetch the FULL public list, never a page.
      const records = await listPublicCameras(filters);
      // Top-level licence metadata (RFC 7946 foreign members): ODbL 1.0
      // attribution required when the database is shared (TERMS § 7.1).
      // Exports are complete snapshots for download: a bounded 1 h edge/browser
      // cache is acceptable (the dataset changes through moderation, not live
      // feeds), and revalidation happens after the window. Deliberately NOT
      // `immutable` — the export URL's content does change when moderators act.
      return Response.json({ type: "FeatureCollection", license: DATA_LICENSE_ID, attribution: DATA_LICENSE_NOTICE, features: records.map((record) => ({ type: "Feature", geometry: { type: "Point", coordinates: [record.longitude, record.latitude] }, properties: { id: record.id, title: record.title, kind: record.kind, manufacturer: record.manufacturer, observedOn: record.observedOn, status: record.status, source: record.source, updated: record.updated, description: record.description, direction: record.direction } })) }, { headers: { "Content-Disposition": "attachment; filename=opensurveillancedb-cameras.geojson", "Cache-Control": "public, s-maxage=3600", "Cache-Tag": CACHE_TAGS.export } });
    }
    if (format === "csv") {
      const records = await listPublicCameras(filters);
      return new Response(toCsv(records), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=opensurveillancedb-cameras.csv", "Cache-Control": "public, s-maxage=3600", "Cache-Tag": CACHE_TAGS.export } });
    }
    // Pagination applies to the default JSON list only — CSV/GeoJSON exports
    // stay complete snapshots (rate-limited in the "export" bucket). limit is
    // optional (default PUBLIC_CAMERAS_PAGE_DEFAULT_LIMIT, clamped to the
    // max); offset is optional and starts at 0. Invalid values answer 400.
    const limit = readPageNumber(params.get("limit"), PUBLIC_CAMERAS_PAGE_DEFAULT_LIMIT, PUBLIC_CAMERAS_PAGE_MAX_LIMIT);
    const offset = readPageNumber(params.get("offset"), 0);
    // An offset beyond MAX_PAGE_OFFSET is rejected (not clamped) so a
    // hostile ?offset=9007199254740991 cannot force an astronomical SQL
    // OFFSET on the D1 (review P2-4). The check runs before any db work.
    if (limit === null || offset === null || limit < 1 || offset > MAX_PAGE_OFFSET) {
      return Response.json({ error: `limit must be an integer between 1 and ${PUBLIC_CAMERAS_PAGE_MAX_LIMIT} and offset a non-negative integer up to ${MAX_PAGE_OFFSET}.` }, { status: 400 });
    }
    // Facets are OPT-IN (QA#5 F2, t_ab0d4c75): the client never consumed
    // them (it derives kind options client-side via cameraKindsOf), yet they
    // cost 2 full-set aggregate queries on EVERY list read (GROUP BY kind +
    // SUM over freshness windows) — even for ?limit=1 (the home hero count).
    // The filter UI that needs them requests them explicitly with
    // `?facets=1`; the default JSON payload stays lean. Nothing else in the
    // response shape changes (records/total/nextOffset are unchanged).
    let facets: PublicCameraFacets | undefined;
    if (params.get("facets") === "1") {
      facets = await getPublicCameraFacets();
    }
    const page = await listPublicCamerasPage(filters, { limit, offset });
    // JSON list + optional facets (FRONTEND_PLAN § 3.2.2). The dataset
    // changes through moderation decisions, never live feeds: a bounded
    // 5-minute edge/browser cache with stale-while-revalidate keeps the
    // directory responsive while still converging after any moderation
    // action. search/nearby stay no-store (user input / duplicate warnings).
    return Response.json(
      facets ? { records: page.records, total: page.total, nextOffset: page.nextOffset, facets } : { records: page.records, total: page.total, nextOffset: page.nextOffset },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "Cache-Tag": CACHE_TAGS.list } },
    );
  } catch (error) {
    console.error("GET /api/cameras failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (submissionsDisabled(env)) {
    console.warn("POST /api/cameras rejected: submissions disabled via POST_SUBMISSIONS_DISABLED");
    return Response.json({ error: "Submissions are temporarily disabled." }, { status: 503 });
  }

  const key = callerKey(request, env);
  const limitOptions = submissionLimits(env);
  const limit = await checkRateLimit(env, "submit", key, limitOptions);
  if (!limit.allowed) {
    console.warn("POST /api/cameras rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many submissions. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  try {
    // Write gate (multi-method auth Fase E1): every report now requires a
    // VERIFIED contributor. Anonymous (401) and unverified (403) share one
    // single response body (anti-enumeration); a session created before
    // email verification is read-only and cannot write. Attribution is no
    // longer optional: every stored report carries the verified contributor.
    const gate = await requireVerifiedContributor(request);
    if (!gate.ok) return gate.response;
    if (!sameOrigin(request) || !csrfVerified(request, gate.session.csrfToken)) {
      return Response.json(
        { error: "Cross-site request rejected. Refresh the page and try again." },
        { status: 403 },
      );
    }

    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) return Response.json({ error: "A title, type, valid position and (when provided) a valid observation date are required." }, { status: 400 });
    const title = cleanText(payload.title, 90);
    const kind = cleanText(payload.kind, 60);
    const address = cleanText(payload.address, 180);
    const notes = cleanText(payload.notes, 1000);
    const manufacturer = cleanText(payload.manufacturer, 80);
    const observedOn = cleanObservedOn(payload.observedOn);
    // Field-of-view direction (t_1b08fe12): integer bearing 0-359 or null.
    // Out-of-range / non-integer values answer 422 — distinct from the 400
    // generic shape errors so a client can render the field error inline.
    const direction = readDirection(payload.direction);
    if (direction === "invalid") {
      return Response.json({ error: 'Field "direction" must be an integer between 0 and 359, or null.' }, { status: 422 });
    }
    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    // Optional photo evidence: uploaded photos (POST /api/photos) may be
    // attached to the report at submission time. They stay private: the
    // photos themselves must be individually moderated before they can be
    // served, regardless of what happens to this report.
    const photoIds = Array.isArray(payload.photoIds)
      ? payload.photoIds.filter(
          (id): id is number => typeof id === "number" && Number.isInteger(id) && id >= 1,
        ).slice(0, 5)
      : [];
    if (
      Array.isArray(payload.photoIds) &&
      payload.photoIds.some((id) => typeof id !== "number" || !Number.isInteger(id) || id < 1)
    ) {
      return Response.json({ error: "photoIds must be an array of positive integers." }, { status: 400 });
    }
    if (!title || !kind || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (payload.observedOn !== undefined && payload.observedOn !== null && !observedOn)) return Response.json({ error: "A title, type, valid position and (when provided) a valid observation date are required." }, { status: 400 });
    // Horizon 1 duplicate gate (ADR 0019): detect likely duplicates BEFORE the
    // record is stored. The check runs on reviewed public records only (the
    // same public boundary as every read route — it can never reveal pending
    // reports). A failure of the check itself must never block a legitimate
    // report: the catch below fails OPEN exactly like the previous
    // post-insert warning did, so a broken duplicate check degrades to the
    // old non-blocking behaviour instead of silencing submissions.
    let possibleDuplicates: Awaited<ReturnType<typeof findNearbyPublicCameras>> = [];
    try {
      possibleDuplicates = await findNearbyPublicCameras(latitude, longitude, 75, { title, address, kind });
    } catch (error) {
      console.error("POST /api/cameras duplicate check failed", error);
    }
    // A high-strength candidate (essentially the same spot, or <= 75 m with
    // matching text) forces an explicit acknowledgement. Without it the
    // report is rejected with 409 and NOT stored — no record row, no photo
    // linking — so a contributor who skips the UI confirmation can never
    // silently file a near-duplicate. The flag is strictly boolean true:
    // anything else ("true", 1) fails closed. This is a confirmation gate,
    // not a hard block: a human can always proceed after acknowledging.
    if (requiresDuplicateConfirmation(possibleDuplicates) && payload.duplicateConfirmed !== true) {
      return Response.json(
        {
          error: "A very similar public record already exists nearby. Confirm that this is a distinct camera before submitting (duplicateConfirmed: true), or use the correction form for the existing record.",
          possibleDuplicates,
        },
        { status: 409 },
      );
    }
    // ADR 0021 §1 (FASE 3 UI): immediate publication — the verified
    // contributor's report is inserted directly as `active` and becomes
    // public right away (list, map, GeoJSON, record page), with the opening
    // `published` lifecycle event. The legacy pending insert survives only
    // for legal-emergency flows (createPendingCamera, moderation queue).
    const record = await createCamera({ title, kind, address, notes, manufacturer: manufacturer || null, observedOn: observedOn || null, latitude, longitude, direction: normalizeDomeDirection(kind, direction), contributorId: gate.contributor.id });
    // Link photo evidence after the report row exists. Linking is best-effort:
    // a photo that fails the pending/unlinked guard is simply left orphaned
    // (it will never be public without moderation). Photos attributed to a
    // contributor (uploaded while signed in) can only be linked by that same
    // contributor — the ownership guard lives in linkPhotosToCamera.
    let linkedPhotoCount = 0;
    try {
      linkedPhotoCount = await linkPhotosToCamera(record.id, photoIds, gate.contributor.id);
    } catch (error) {
      console.error("POST /api/cameras photo linking failed", error);
    }
    return Response.json({ record, possibleDuplicates, linkedPhotos: linkedPhotoCount }, { status: 201 });
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/cameras payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/cameras failed", error);
    return Response.json({ error: "Unable to save report" }, { status: 500 });
  }
}
