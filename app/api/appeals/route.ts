import { env } from "cloudflare:workers";
import {
  fileAppeal,
  listAppeals,
  type AppealStatus,
  appealStatuses,
} from "../../../db/appeals";
import { requireRole } from "../../lib/authz";
import { getUserByContributorId, roleAtLeast } from "../../../db/users";
import { malformedSessionCookieGuard, resolveOptionalContributor } from "../../lib/auth-session";
import { csrfVerified, sameOrigin } from "../../lib/csrf";
import { isRecord } from "../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../lib/input-limits";
import { recordRateLimitBlock } from "../../lib/abuse-alerts";
import {
  appealAppellantLimits,
  callerKey,
  checkRateLimit,
  limitsFor,
} from "../../lib/rate-limit";

const appealReasonMaxLength = 1500;
// Standing floor (P3 appeal-ownership audit): an appeal must state why the
// appellant is affected (their submission, or direct knowledge of the
// record). Short placeholders ("No", "Contesting") carry no relevance for
// the senior moderator to evaluate, so they are rejected at the boundary.
// DATA_TRUST.md "Corrections, removals, and appeals".
const appealReasonMinLength = 20;

function parseEntity(value: unknown): "camera" | "correction" | null {
  return value === "camera" || value === "correction" ? value : null;
}

function parseAppealRequest(value: unknown): {
  entity: "camera" | "correction";
  entityId: number;
  decisionEventId: number;
  reason: string;
} | null {
  if (!isRecord(value)) return null;
  const entity = parseEntity(value.entity);
  const entityId = value.entityId;
  const decisionEventId = value.decisionEventId;
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (!entity) return null;
  if (typeof entityId !== "number" || !Number.isInteger(entityId) || entityId < 1) return null;
  if (
    typeof decisionEventId !== "number" ||
    !Number.isInteger(decisionEventId) ||
    decisionEventId < 1
  ) {
    return null;
  }
  if (
    !reason ||
    reason.length < appealReasonMinLength ||
    reason.length > appealReasonMaxLength
  ) {
    return null;
  }
  return { entity, entityId, decisionEventId, reason };
}

async function appealLimit(request: Request) {
  const key = callerKey(request, env);
  const limitOptions = limitsFor("appeal", env);
  const limit = await checkRateLimit(env, "appeal", key, limitOptions);
  if (!limit.allowed) {
    console.warn("/api/appeals rate limited");
    recordRateLimitBlock(env, {
      route: "/api/appeals",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }
  return null;
}

/**
 * POST /api/appeals — a contributor contests a recorded moderation decision
 * (DATA_TRUST.md "Corrections, removals, and appeals"). The caller must be an
 * authenticated contributor with a live session (ADR 0013); the appeal is
 * attributed to their `users` identity (ADR 0014) and every step writes an
 * append-only audit event.
 *
 * Auth model (CEO decision 2026-08-02, audit finding 3.1): the worker edge
 * no longer gates POST /api/appeals with moderation credentials — the filing
 * route authenticates with the contributor session instead. The moderator
 * surfaces (GET list, PATCH decide) remain behind the edge moderation gate.
 * Identity headers are stripped at the edge on every path, so this route
 * resolves the caller from the `osdb_session` cookie only.
 *
 * Standing and abuse control: the reason must state why the appellant is
 * affected (their submission or direct knowledge of the record); anonymous
 * submissions have no attribution, so any contributor may appeal a decision
 * on one. The per-IP bucket bounds bursts; fileAppeal enforces a
 * per-appellant threshold on the queue (429 when exceeded).
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  // Session auth (ADR 0013): the contributor must hold a live session. The
  // cookie is HttpOnly + SameSite=Strict, and the state-changing request
  // must also pass the same-origin + double-submit CSRF checks, matching
  // every other authenticated write route (cameras, corrections).
  // QA F1 (t_894e0cc3): session resolution must NEVER escape the handler.
  // A malformed cookie (parseCookies already degrades it to absent, see
  // csrf.ts) or any transient resolution error makes the caller anonymous:
  // resolveOptionalContributor is therefore wrapped so an unexpected throw
  // answers 401 (anonymous) instead of a framework 500, and the per-IP
  // bucket below still bounds abuse. Follow-up (t_b6f04976): a PRESENT-but-
  // undecodable session cookie is a client bug — the guard answers a clean
  // 400 (clear cookies) instead of a silent 401.
  const malformed = malformedSessionCookieGuard(request);
  if (malformed) return malformed;

  let session = null;
  try {
    session = await resolveOptionalContributor(request);
  } catch (error) {
    console.warn("POST /api/appeals could not resolve the session; treating as anonymous", error);
  }
  if (!session) {
    return Response.json(
      { error: "Authentication required. Log in to file an appeal." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!sameOrigin(request) || !csrfVerified(request, session.session.csrfToken)) {
    return Response.json(
      { error: "Cross-site request rejected. Refresh the page and try again." },
      { status: 403 },
    );
  }

  // Role gate (ADR 0014): the contributor session resolves a `contributors`
  // row; the appeal is attributed to the matching `users` identity via the
  // EXPLICIT `users.contributor_id` link provisioned by ops (audit
  // t_5ca60ab2, P2). Email equality is never used to bridge the two stores —
  // it is spoofable: registering a contributor with an email matching any
  // users row (e.g. a moderator's) would otherwise inherit that identity's
  // role. No linked users row (or an inactive one) means no role identity →
  // 401; a role below contributor → 403.
  const user = await getUserByContributorId(session.contributor.id);
  if (!user || user.active !== 1) {
    return Response.json(
      { error: "Authentication required. Log in to file an appeal." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!roleAtLeast(user.role, "contributor")) {
    return Response.json(
      { error: "Your role does not permit this action." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const blocked = await appealLimit(request);
  if (blocked) return blocked;

  try {
    const payload = parseAppealRequest(await readJsonBody(request, env));
    if (!payload) {
      return Response.json(
        {
          error: `Provide a valid entity, positive integer entityId, the decisionEventId being contested, and a reason of ${appealReasonMinLength}-${appealReasonMaxLength} characters explaining why you are affected (your submission or direct knowledge of the record).`,
        },
        { status: 400 },
      );
    }

    const result = await fileAppeal({
      entity: payload.entity,
      entityId: payload.entityId,
      decisionEventId: payload.decisionEventId,
      appellantId: user.id,
      reason: payload.reason,
    });

    switch (result.kind) {
      case "ok":
        return Response.json({ appeal: result.appeal, event: result.event }, { status: 201 });
      case "decision_not_found":
        return Response.json({ error: "The moderation decision does not exist." }, { status: 404 });
      case "decision_not_final":
        return Response.json(
          { error: "Only a final moderation decision that changed the record can be appealed." },
          { status: 400 },
        );
      case "appellant_not_found":
        return Response.json({ error: "The contributor account does not exist." }, { status: 404 });
      case "duplicate_pending":
        return Response.json(
          { error: "This decision already has a pending appeal." },
          { status: 409 },
        );
      case "appeal_limit_exceeded": {
        const limit = appealAppellantLimits(env);
        return Response.json(
          {
            error: `Too many appeals from this account in the last ${limit.windowSeconds} seconds. Please try again later.`,
          },
          {
            status: 429,
            headers: { "Retry-After": String(limit.windowSeconds) },
          },
        );
      }
    }
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/appeals payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/appeals failed", error);
    return Response.json({ error: "Unable to record the appeal" }, { status: 500 });
  }
}

/**
 * GET /api/appeals — moderator view of filed appeals (appellant display name,
 * contested decision, status). The appeal trail itself is written to the
 * append-only audit log; this endpoint only reads it.
 */
export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  const auth = await requireRole(request, "moderator");
  if (!auth.ok) return auth.response;

  const blocked = await appealLimit(request);
  if (blocked) return blocked;

  try {
    const appeals = await listAppeals();
    return Response.json({ appeals });
  } catch (error) {
    console.error("GET /api/appeals failed", error);
    return Response.json({ error: "Appeals unavailable" }, { status: 503 });
  }
}

export type { AppealStatus };
export { appealStatuses };
