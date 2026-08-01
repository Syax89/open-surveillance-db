import { env } from "cloudflare:workers";
import { getCameraEditView } from "../../../../../db/camera-edits";
import { recordRateLimitBlock } from "../../../../lib/abuse-alerts";
import { resolveOptionalContributor } from "../../../../lib/auth-session";
import { urlTooLong } from "../../../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../../../lib/rate-limit";

/**
 * GET /api/cameras/[id]/edit — owner view of a contribution for the edit
 * page (ADR 0018 §4, C6).
 *
 * The public GET /api/cameras/[id] is attribution-free and fails closed on
 * pending records, so /records/[id]/edit cannot pre-fill its form from it.
 * This route is the owner-only read: 200 { record, editRequest } for the
 * owner (any status, notes included, plus the open edit-request so the page
 * can show "request in progress" before any submit), 403 for a non-owner on
 * a published record, 404 fail-closed for anything else (missing id, or a
 * pending / removed / rejected record the caller does not own — the
 * no-existence-oracle rule, indistinguishable from a missing id).
 *
 * Guard order: urlTooLong -> read rate-limit bucket -> session (401) ->
 * strict id parse (404). Personal data: Cache-Control: no-store, and the
 * route is never edge-cached.
 */
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

/** Strict id parse from the URL path (same grammar as the confirmation route). */
function parseId(request: Request): number | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const idParam = parts[parts.length - 2] ?? "";
  if (!/^\d+$/.test(idParam) || Number(idParam) < 1) return null;
  return Number(idParam);
}

export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  const key = callerKey(request);
  const limitOptions = limitsFor("read", env);
  const limit = checkRateLimit("read", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/cameras/[id]/edit rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras/[id]/edit",
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
    console.error("GET /api/cameras/[id]/edit session lookup failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
  if (!resolved) {
    return Response.json({ error: "Not authenticated." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const id = parseId(request);
  if (id === null) {
    return Response.json({ error: "Camera not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  try {
    const view = await getCameraEditView(id, resolved.contributor.id);
    switch (view.kind) {
      case "ok":
        return Response.json(
          { record: view.record, editRequest: view.editRequest },
          { headers: NO_STORE_HEADERS },
        );
      case "not_owner":
        return Response.json({ error: "You can only edit your own reports." }, { status: 403, headers: NO_STORE_HEADERS });
      case "not_found":
        return Response.json({ error: "Camera not found." }, { status: 404, headers: NO_STORE_HEADERS });
    }
  } catch (error) {
    console.error("GET /api/cameras/[id]/edit failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
