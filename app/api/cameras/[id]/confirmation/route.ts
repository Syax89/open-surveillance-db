import { env } from "cloudflare:workers";
import {
  getConfirmation,
  removeConfirmation,
  setConfirmation,
} from "../../../../../db/confirmations";
import { recordRateLimitBlock } from "../../../../lib/abuse-alerts";
import { resolveOptionalContributor } from "../../../../lib/auth-session";
import { requireVerifiedContributor } from "../../../../lib/write-gate";
import { checkConfirmIpBurst, confirmIpBurstLimits } from "../../../../lib/confirm-ip-burst";
import { csrfVerified, sameOrigin } from "../../../../lib/csrf";
import { urlTooLong } from "../../../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../../../lib/rate-limit";

/**
 * Community verifications toggle (ADR 0018 §2, C1):
 *
 *   PUT    /api/cameras/[id]/confirmation  toggle ON  -> { confirmed: true, count }
 *   DELETE /api/cameras/[id]/confirmation  toggle OFF -> { confirmed: false, count }
 *   GET    /api/cameras/[id]/confirmation  personal state -> { confirmed }
 *
 * All three are `Cache-Control: no-store` (personal data; the public
 * aggregate `confirmationCount` lives on the record payload with the bounded
 * edge cache). The toggle guards run in a fixed order, and the anti-gaming
 * state quota (daily cap, per-record cap, level gate) lives inside
 * db/confirmations.ts so no route can bypass it; this route adds the per-caller
 * confirm rate-limit bucket and the IP-hash burst bucket (never the raw IP).
 */

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

/**
 * Strict id parse from the URL path (same grammar as /api/cameras/[id]):
 * `^\d+$` plus >= 1. Anything else returns null -> 404. The segment before
 * `confirmation` is the id.
 */
function parseId(request: Request): number | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const idParam = parts[parts.length - 2] ?? "";
  if (!/^\d+$/.test(idParam) || Number(idParam) < 1) return null;
  return Number(idParam);
}

/**
 * Shared PUT/DELETE guards in the fixed order (ADR 0018 §2.6):
 * urlTooLong -> sameOrigin -> confirm rate-limit bucket -> session (401) ->
 * CSRF (403) -> IP-hash burst bucket -> strict id parse (404).
 */
async function guardMutation(
  request: Request,
): Promise<{ id: number; contributorId: number } | Response> {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const key = callerKey(request, env);
  const limitOptions = limitsFor("confirm", env);
  const limit = await checkRateLimit(env, "confirm", key, limitOptions);
  if (!limit.allowed) {
    console.warn("PUT/DELETE /api/cameras/[id]/confirmation rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras/[id]/confirmation",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { ...NO_STORE_HEADERS, "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  let gate;
  try {
    // Write gate (multi-method auth Fase E1): the toggle requires a VERIFIED
    // contributor — anonymous (401) and unverified (403) share one single
    // response body (anti-enumeration, no-store). Raising the bar here is
    // part of the anti-gaming layer: an unverified account cannot mass-confirm
    // records, so a freshly registered (unverified) contributor cannot
    // influence public verification counts. (Decision point flagged in the
    // E1 PR: the email-verified requirement stacks on top of the existing
    // level gate — ≥1 verified contribution — in db/confirmations.ts.)
    gate = await requireVerifiedContributor(request);
  } catch (error) {
    console.error("PUT/DELETE /api/cameras/[id]/confirmation session lookup failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
  if (!gate.ok) return gate.response;
  if (!csrfVerified(request, gate.session.csrfToken)) {
    return Response.json({ error: "Invalid CSRF token. Refresh the page and try again." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  // IP-hash burst bucket (layer 4 anti-gaming, never-the-raw-IP pattern):
  // keyed by the SHA-256 of the caller key — never the raw IP. The surge
  // alert below carries only the callerHash.
  const burst = await checkConfirmIpBurst(env, key);
  if (!burst.allowed) {
    recordRateLimitBlock(env, {
      route: "/api/cameras/[id]/confirmation",
      key,
      windowSeconds: confirmIpBurstLimits(env).windowSeconds,
    });
    return Response.json({ error: "Too many verifications. Try again later." }, {
      status: 429,
      headers: { ...NO_STORE_HEADERS, "Retry-After": String(burst.retryAfterSeconds) },
    });
  }

  const id = parseId(request);
  if (id === null) {
    return Response.json({ error: "Camera not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }
  return { id, contributorId: gate.contributor.id };
}

export async function PUT(request: Request) {
  const guarded = await guardMutation(request);
  if (guarded instanceof Response) return guarded;
  const { id, contributorId } = guarded;

  try {
    const result = await setConfirmation({
      cameraId: id,
      contributorId,
      now: new Date().toISOString(),
      env,
    });
    switch (result.kind) {
      case "ok":
        return Response.json({ confirmed: true, count: result.count }, { headers: NO_STORE_HEADERS });
      case "camera_not_public":
        return Response.json({ error: "Camera not found." }, { status: 404, headers: NO_STORE_HEADERS });
      case "level_gate":
        return Response.json({ error: "Verifications require at least one verified contribution." }, { status: 403, headers: NO_STORE_HEADERS });
      case "self_verify":
        return Response.json({ error: "You cannot verify your own report." }, { status: 403, headers: NO_STORE_HEADERS });
      case "duplicate":
        return Response.json({ error: "This record is already verified by you." }, { status: 409, headers: NO_STORE_HEADERS });
      case "daily_quota_exceeded":
      case "per_record_cap_exceeded":
        return Response.json({ error: "Too many verifications. Try again later." }, {
          status: 429,
          headers: { ...NO_STORE_HEADERS, "Retry-After": String(result.retryAfterSeconds) },
        });
    }
  } catch (error) {
    console.error("PUT /api/cameras/[id]/confirmation failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

export async function DELETE(request: Request) {
  const guarded = await guardMutation(request);
  if (guarded instanceof Response) return guarded;
  const { id, contributorId } = guarded;

  try {
    const result = await removeConfirmation({ cameraId: id, contributorId });
    if (result.kind === "not_found") {
      return Response.json({ error: "No verification found." }, { status: 404, headers: NO_STORE_HEADERS });
    }
    return Response.json({ confirmed: false, count: result.count }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("DELETE /api/cameras/[id]/confirmation failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  const id = parseId(request);
  if (id === null) {
    return Response.json({ error: "Camera not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const key = callerKey(request, env);
  const limitOptions = limitsFor("confirm", env);
  const limit = await checkRateLimit(env, "confirm", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/cameras/[id]/confirmation rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras/[id]/confirmation",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { ...NO_STORE_HEADERS, "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  try {
    // Personal state: anonymous is fine (false). A live session resolves the
    // caller's own confirmation row; the DB failure is the only 503 path.
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ confirmed: false }, { headers: NO_STORE_HEADERS });
    }
    const confirmation = await getConfirmation(id, resolved.contributor.id);
    return Response.json({ confirmed: confirmation !== null }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("GET /api/cameras/[id]/confirmation failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
