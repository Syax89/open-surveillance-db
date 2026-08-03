import { env } from "cloudflare:workers";
import { applyCameraEdit, parseEditableEditFields } from "../../../../db/camera-edits";
import { getPublicCameraById } from "../../../../db/cameras";
import { recordRateLimitBlock } from "../../../lib/abuse-alerts";
import { resolveOptionalContributor } from "../../../lib/auth-session";
import { CACHE_TAGS } from "../../../lib/cache-purge";
import { csrfVerified, sameOrigin } from "../../../lib/csrf";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../../lib/rate-limit";

/**
 * GET /api/cameras/[id] — one public record (FRONTEND_PLAN § 3.2.1).
 *
 * The /records/[id] page used to resolve its record by walking the whole
 * client-side list; with server-side pagination that pattern breaks, so the
 * page fetches this endpoint instead. The lookup shares the exact public
 * predicate and ~10 m coordinate rounding of the directory list, and fails
 * closed with 404 for anything that is not publicly current — a pending,
 * stale, rejected or removed record is indistinguishable from a missing id
 * (no existence leak, same rule as the photo route).
 *
 * The id is parsed from the URL path (works identically under Next.js App
 * Router and the plain-Node route harness, which invokes handlers with a
 * bare Request).
 */
export async function GET(request: Request) {
  const idParam = new URL(request.url).pathname.split("/").pop() ?? "";
  // Strict decimal check (follow-up F0, t_ae600b90): `Number("1e3")` and
  // `Number("0x10")` are both finite integers, so a plain Number() cast
  // would accept scientific/hex syntax. The public ids are plain decimal
  // strings — ^\d+$ is the exact grammar (the query stays parameterised
  // either way; this is a tighter contract, not a security boundary). The
  // positivity check is kept alongside: ids are 1-based, and "0" passes
  // ^\d+$ but must still answer 404.
  if (!/^\d+$/.test(idParam) || Number(idParam) < 1) {
    return Response.json({ error: "Camera not found." }, { status: 404 });
  }
  const id = Number(idParam);

  // Public read route: metered per caller in the read-family bucket, same as
  // the directory list and the photo bytes. Malformed ids above answered 404
  // without touching the database and are not counted.
  const key = callerKey(request);
  const limitOptions = limitsFor("read", env);
  const limit = await checkRateLimit(env, "read", key, limitOptions);
  if (!limit.allowed) {
    console.warn(`GET /api/cameras/[id] rate limited for caller ${key}`);
    recordRateLimitBlock(env, {
      route: "/api/cameras/[id]",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  try {
    const record = await getPublicCameraById(id);
    if (!record) {
      // Fail closed, indistinguishable from "does not exist".
      return Response.json({ error: "Camera not found." }, { status: 404 });
    }
    return Response.json({ record }, {
      // Same bounded edge cache as the list: the record changes through
      // moderation decisions, never live feeds, and revalidation converges
      // after any decision within the window. The Cache-Tag lets the
      // moderation write path purge this exact representation immediately
      // (see app/lib/cache-purge.ts).
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "Cache-Tag": CACHE_TAGS.record(id) },
    });
  } catch (error) {
    console.error("GET /api/cameras/[id] failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

/**
 * Strict id parse from the URL path (same grammar as the confirmation route):
 * `^\d+$` plus >= 1. Anything else returns null -> 404.
 */
function parseId(request: Request): number | null {
  const idParam = new URL(request.url).pathname.split("/").pop() ?? "";
  if (!/^\d+$/.test(idParam) || Number(idParam) < 1) return null;
  return Number(idParam);
}

/**
 * PATCH /api/cameras/[id] — community contribution editing (ADR 0018 §4, C3).
 *
 * Two-track behaviour, decided in db/camera-edits.ts (applyCameraEdit):
 *
 *   - `pending` records: direct owner-only UPDATE. The ownership check is
 *     server-side (`cameras.contributor_id === session.contributor.id`);
 *     anonymous records and non-owners answer 404 fail-closed
 *     (no-existence-oracle). 200 owner view (notes included), no-store.
 *     A no-op edit answers 200 with `changed: false` and writes no event
 *     (anti-farming). `expectedUpdated` is an optional optimistic-concurrency
 *     precondition: a stale value answers 409, never a silent overwrite.
 *   - `verified` / `needs_review` / `stale` records: the PATCH never mutates
 *     `cameras`. It inserts a `camera_edit_requests` diff row + a
 *     `moderation_queue` row (entity `camera_edit`) and answers
 *     202 { editRequest: { id, cameraId, status: 'pending', createdAt } }.
 *     A moderator applies or discards the diff later (moderation endpoints).
 *     One open edit-request per camera (partial unique) — a second concurrent
 *     PATCH answers 409.
 *   - `removed` / `rejected`: 409 blocked.
 *
 * The body is validated against the editable whitelist BEFORE any write:
 * non-editable fields (status, contributor_id, source, publish_*, freshness
 * clock, coordinates) answer 400 per-field with no partial effects. Guards
 * run in the fixed order (same as the confirmation toggle): urlTooLong ->
 * sameOrigin -> edit rate-limit bucket (5/min) -> session (401) -> CSRF (403)
 * -> strict id parse (404). A moderator/admin who is not the owner gets 403
 * on published records — they act only through the moderation endpoints.
 */
export async function PATCH(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const key = callerKey(request);
  const limitOptions = limitsFor("edit", env);
  const limit = await checkRateLimit(env, "edit", key, limitOptions);
  if (!limit.allowed) {
    console.warn("PATCH /api/cameras/[id] rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras/[id]",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { ...NO_STORE_HEADERS, "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  let resolved;
  try {
    resolved = await resolveOptionalContributor(request);
  } catch (error) {
    console.error("PATCH /api/cameras/[id] session lookup failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
  if (!resolved) {
    return Response.json({ error: "Not authenticated." }, { status: 401, headers: NO_STORE_HEADERS });
  }
  if (!csrfVerified(request, resolved.session.csrfToken)) {
    return Response.json({ error: "Invalid CSRF token. Refresh the page and try again." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const id = parseId(request);
  if (id === null) {
    return Response.json({ error: "Camera not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  let payload;
  try {
    payload = await readJsonBody(request, env);
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("PATCH /api/cameras/[id] payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE_HEADERS });
    }
    return Response.json({ error: "Unable to read request body" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const parsed = parseEditableEditFields(payload);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const result = await applyCameraEdit({
      cameraId: id,
      contributorId: resolved.contributor.id,
      fields: parsed.payload.fields,
      expectedUpdated: parsed.payload.expectedUpdated,
      now: new Date().toISOString(),
    });
    switch (result.kind) {
      case "direct_applied":
        return Response.json({ record: result.record, changed: true }, { headers: NO_STORE_HEADERS });
      case "no_changes":
        return Response.json({ error: "No changes were made.", changed: false }, { status: 200, headers: NO_STORE_HEADERS });
      case "camera_not_found":
      case "not_found":
        return Response.json({ error: "Camera not found." }, { status: 404, headers: NO_STORE_HEADERS });
      case "not_owner":
        return Response.json({ error: "You can only edit your own reports." }, { status: 403, headers: NO_STORE_HEADERS });
      case "status_blocked":
        return Response.json({ error: "Records in this state cannot be edited." }, { status: 409, headers: NO_STORE_HEADERS });
      case "race":
        return Response.json(
          { error: "This record changed since you loaded it. Refresh and try again." },
          { status: 409, headers: NO_STORE_HEADERS },
        );
      case "edit_request_exists":
        return Response.json(
          { error: "An edit request is already pending for this record." },
          { status: 409, headers: NO_STORE_HEADERS },
        );
      case "edit_request_created":
        return Response.json(
          { editRequest: result.editRequest },
          { status: 202, headers: NO_STORE_HEADERS },
        );
    }
  } catch (error) {
    console.error("PATCH /api/cameras/[id] failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
