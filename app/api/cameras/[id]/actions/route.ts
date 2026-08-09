import { env } from "cloudflare:workers";
import {
  getCommunityAction,
  isCommunityActionType,
  removeCommunityAction,
  setCommunityAction,
} from "../../../../../db/community-actions";
import { recordRateLimitBlock } from "../../../../lib/abuse-alerts";
import { resolveOptionalContributor } from "../../../../lib/auth-session";
import { requireVerifiedContributor } from "../../../../lib/write-gate";
import { csrfVerified, sameOrigin } from "../../../../lib/csrf";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../../../lib/rate-limit";

/**
 * Community actions toggle (ADR 0021 §3.2, kanban t_a9f23581 FASE 2):
 *
 *   PUT    /api/cameras/[id]/actions  upsert/switch -> { action, switchedFrom? }
 *   DELETE /api/cameras/[id]/actions  remove        -> { action: null }
 *   GET    /api/cameras/[id]/actions  personal state -> { action: 'like'|null }
 *
 * The ADR §3.2 specifies PUT for the upsert (the task card says POST but the
 * normative source is the ADR — implemented as PUT, documented in the PR).
 *
 * All three are `Cache-Control: no-store` (personal data). The write gate
 * (requireVerifiedContributor) applies to PUT and DELETE; GET is open to
 * anonymous callers (returns `{action:null}`).
 */

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function parseId(request: Request): number | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const idParam = parts[parts.length - 2] ?? "";
  if (!/^\d+$/.test(idParam) || Number(idParam) < 1) return null;
  return Number(idParam);
}

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
  const limitOptions = limitsFor("action", env);
  const limit = await checkRateLimit(env, "action", key, limitOptions);
  if (!limit.allowed) {
    console.warn("PUT/DELETE /api/cameras/[id]/actions rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras/[id]/actions",
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
    gate = await requireVerifiedContributor(request);
  } catch (error) {
    console.error("PUT/DELETE /api/cameras/[id]/actions session lookup failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
  if (!gate.ok) return gate.response;
  if (!csrfVerified(request, gate.session.csrfToken)) {
    return Response.json({ error: "Invalid CSRF token. Refresh the page and try again." }, { status: 403, headers: NO_STORE_HEADERS });
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

  let payload: unknown;
  try {
    payload = await readJsonBody(request, env);
  } catch (error) {
    if (error instanceof BodyReadError) {
      return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE_HEADERS });
    }
    return Response.json({ error: "Unable to parse request body." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const action = (payload as Record<string, unknown>)?.action;
  if (typeof action !== "string" || !isCommunityActionType(action)) {
    return Response.json({ error: "Invalid action type. Use one of: like, confirm, gone, problem, privacy." }, { status: 422, headers: NO_STORE_HEADERS });
  }

  try {
    const now = new Date().toISOString();
    const result = await setCommunityAction({ cameraId: id, contributorId, actionType: action, now, env });
    switch (result.kind) {
      case "ok":
        return Response.json({ action: result.actionType, counts: result.counts }, { headers: NO_STORE_HEADERS });
      case "switched":
        return Response.json({ action: result.actionType, switchedFrom: result.switchedFrom, counts: result.counts }, { headers: NO_STORE_HEADERS });
      case "duplicate":
        return Response.json({ error: "This action is already set." }, { status: 409, headers: NO_STORE_HEADERS });
      case "self_action":
        return Response.json({ error: "You cannot like or confirm your own report." }, { status: 403, headers: NO_STORE_HEADERS });
      case "camera_not_found":
        return Response.json({ error: "Camera not found." }, { status: 404, headers: NO_STORE_HEADERS });
      case "invalid_action":
        return Response.json({ error: "Invalid action type. Use one of: like, confirm, gone, problem, privacy." }, { status: 422, headers: NO_STORE_HEADERS });
      case "daily_quota_exceeded":
      case "per_record_cap_exceeded":
        return Response.json({ error: "Too many actions. Try again later." }, {
          status: 429,
          headers: { ...NO_STORE_HEADERS, "Retry-After": String(result.retryAfterSeconds) },
        });
    }
  } catch (error) {
    console.error("PUT /api/cameras/[id]/actions failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

export async function DELETE(request: Request) {
  const guarded = await guardMutation(request);
  if (guarded instanceof Response) return guarded;
  const { id, contributorId } = guarded;

  try {
    const result = await removeCommunityAction({ cameraId: id, contributorId });
    if (result.kind === "not_found") {
      return Response.json({ error: "No action found." }, { status: 404, headers: NO_STORE_HEADERS });
    }
    return Response.json({ action: null }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("DELETE /api/cameras/[id]/actions failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  // Metered (audit 2026-08-09, P2): the personal-state read used to run
  // completely unmetered — an anonymous caller could enumerate every camera
  // id through /api/cameras/[id]/actions with no bucket in the way. Uses the
  // `read` bucket (60/min per caller), not the mutation-tight `action`
  // bucket: the endpoint fires once per record page / popup open
  // (CommunityActions), so 10/min would throttle legitimate map browsing
  // while 60/min still bounds enumeration. Runs BEFORE the session
  // resolution so the anonymous path is bounded too.
  const key = callerKey(request, env);
  const limitOptions = limitsFor("read", env);
  const limit = await checkRateLimit(env, "read", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/cameras/[id]/actions rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras/[id]/actions",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { ...NO_STORE_HEADERS, "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const id = parseId(request);
  if (id === null) {
    return Response.json({ error: "Camera not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ action: null }, { headers: NO_STORE_HEADERS });
    }
    const action = await getCommunityAction(id, resolved.contributor.id);
    return Response.json({ action: action?.actionType ?? null }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("GET /api/cameras/[id]/actions failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
