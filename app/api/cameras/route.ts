import { env } from "cloudflare:workers";
import { createPendingCamera, findNearbyPublicCameras, freshnessWindows, listPublicCameras, type FreshnessWindow, type PublicCameraFilters } from "../../../db/cameras";
import { resolveOptionalContributor } from "../../lib/auth-session";
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
import {
  BodyReadError,
  readJsonBody,
  urlTooLong,
} from "../../lib/input-limits";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isValidCalendarDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function cleanObservedOn(value: unknown) {
  const date = cleanText(value, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && isValidCalendarDate(date) ? date : "";
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function toCsv(records: Awaited<ReturnType<typeof listPublicCameras>>) {
  const header = ["id", "title", "kind", "manufacturer", "observed_on", "status", "source", "updated", "description", "address", "latitude", "longitude"];
  const rows = records.map((record) => [record.id, record.title, record.kind, record.manufacturer, record.observedOn, record.status, record.source, record.updated, record.description, record.address, record.latitude, record.longitude].map(csvCell).join(","));
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
  const key = callerKey(request);
  const limitOptions = limitsFor(kind, env);
  const limit = checkRateLimit(kind, key, limitOptions);
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
    const filters: PublicCameraFilters = {};
    if (kindFilter) filters.kind = kindFilter;
    if (freshness && freshness !== "all") filters.freshness = freshness as FreshnessWindow;
    const records = await listPublicCameras(filters);
    if (format === "geojson") {
      // Top-level licence metadata (RFC 7946 foreign members): ODbL 1.0
      // attribution required when the database is shared (TERMS § 7.1).
      // Exports are complete snapshots for download: a bounded 1 h edge/browser
      // cache is acceptable (the dataset changes through moderation, not live
      // feeds), and revalidation happens after the window. Deliberately NOT
      // `immutable` — the export URL's content does change when moderators act.
      return Response.json({ type: "FeatureCollection", license: DATA_LICENSE_ID, attribution: DATA_LICENSE_NOTICE, features: records.map((record) => ({ type: "Feature", geometry: { type: "Point", coordinates: [record.longitude, record.latitude] }, properties: { id: record.id, title: record.title, kind: record.kind, manufacturer: record.manufacturer, observedOn: record.observedOn, status: record.status, source: record.source, updated: record.updated, description: record.description } })) }, { headers: { "Content-Disposition": "attachment; filename=opensurveillancedb-cameras.geojson", "Cache-Control": "public, max-age=3600" } });
    }
    if (format === "csv") {
      return new Response(toCsv(records), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=opensurveillancedb-cameras.csv", "Cache-Control": "public, max-age=3600" } });
    }
    // JSON list: moderation-derived data that changes as decisions land —
    // never cache it at the edge or in browsers (audit t_2ee58c08, gap #2),
    // matching the no-store policy already set by /api/cameras/search.
    return Response.json({ records }, { headers: { "Cache-Control": "no-store" } });
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

  const key = callerKey(request);
  const limitOptions = submissionLimits(env);
  const limit = checkRateLimit("submit", key, limitOptions);
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
    // Optional contributor attribution (ADR 0013): anonymous submissions
    // remain possible, but a request carrying a live session must pass the
    // same-origin + CSRF checks before its report is attributed. A missing
    // or dead session simply means the report is anonymous.
    const auth = await resolveOptionalContributor(request);
    if (auth && (!sameOrigin(request) || !csrfVerified(request, auth.session.csrfToken))) {
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
    const record = await createPendingCamera({ title, kind, address, notes, manufacturer: manufacturer || null, observedOn: observedOn || null, latitude, longitude, contributorId: auth?.contributor.id ?? null });
    // Link photo evidence after the report row exists. Linking is best-effort:
    // a photo that fails the pending/unlinked guard is simply left orphaned
    // (it will never be public without moderation). Photos attributed to a
    // contributor (uploaded while signed in) can only be linked by that same
    // contributor — the ownership guard lives in linkPhotosToCamera.
    let linkedPhotoCount = 0;
    try {
      linkedPhotoCount = await linkPhotosToCamera(record.id, photoIds, auth?.contributor.id ?? null);
    } catch (error) {
      console.error("POST /api/cameras photo linking failed", error);
    }
    // Non-blocking pre-submit duplicate detection: warn the submitter about
    // nearby reviewed records without leaking any non-public data. A failure
    // here must never fail the report itself.
    let possibleDuplicates: Awaited<ReturnType<typeof findNearbyPublicCameras>> = [];
    try {
      possibleDuplicates = await findNearbyPublicCameras(latitude, longitude, 75, { title, address, kind });
    } catch (error) {
      console.error("POST /api/cameras duplicate check failed", error);
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
