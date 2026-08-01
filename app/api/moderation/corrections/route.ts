import { env } from "cloudflare:workers";
import { listCorrectionHistoryForCamera } from "../../../../db/moderation";
import { recordRateLimitBlock } from "../../../lib/abuse-alerts";
import { requireRole } from "../../../lib/authz";
import { urlTooLong } from "../../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../../lib/rate-limit";

/**
 * GET /api/moderation/corrections?cameraId=N — private correction-request
 * history for one record (docs/FUTURE_ROADMAP.md Horizon 1, t_69891619).
 *
 * This path lives under /api/moderation/* and is therefore gated at the
 * worker edge by the same fail-closed Basic-auth / bearer gate as the rest
 * of the moderation API (worker/index.ts). The route adds the coarse
 * moderator role check and the shared `moderate` rate bucket, mirroring
 * PATCH /api/moderation.
 *
 * The payload is the moderator-only view of a record's correction trail:
 * every request linked to the record (pending and resolved) with its
 * decision events, contact detail and reviewer attribution. It is NEVER
 * served by a public route — the public record page keeps exposing only the
 * filtered `listPublicCameraRevisions` projection (AC-5 in
 * tests/correction-record-outcome.test.mjs).
 *
 * Validation: `cameraId` is a required positive integer. A missing/invalid
 * id answers 400; an id with no matching record answers 404 (so a typo is
 * distinguishable from an empty history). Response is never cached.
 */
export async function GET(request: Request) {
  // Input limits: reject absurdly long URLs before any query parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  // Role gate: correction history is moderator+ only (ADR 0014), same as
  // the moderation queue.
  const auth = await requireRole(request, "moderator");
  if (!auth.ok) return auth.response;

  const blocked = moderationLimit(request);
  if (blocked) return blocked;

  const cameraId = Number(new URL(request.url).searchParams.get("cameraId"));
  if (!Number.isInteger(cameraId) || cameraId < 1) {
    return Response.json(
      { error: "Provide a positive integer cameraId of the record to inspect." },
      { status: 400 },
    );
  }

  try {
    const history = await listCorrectionHistoryForCamera(cameraId);
    if (history.camera === null) {
      return Response.json({ error: "Record not found." }, { status: 404 });
    }
    return Response.json(history, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /api/moderation/corrections failed", error);
    return Response.json(
      { error: "Correction history unavailable" },
      { status: 503 },
    );
  }
}

/**
 * Same bounded `moderate` bucket as the moderation API: even an
 * authenticated reviewer gets a bounded read rate, and the alert signal is
 * emitted with a hashed caller identity only.
 */
function moderationLimit(request: Request) {
  const key = callerKey(request);
  const limitOptions = limitsFor("moderate", env);
  const limit = checkRateLimit("moderate", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/moderation/corrections rate limited");
    recordRateLimitBlock(env, {
      route: "/api/moderation/corrections",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  return null;
}
