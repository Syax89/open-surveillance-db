import { env } from "cloudflare:workers";
import {
  fileAppeal,
  listAppeals,
  type AppealStatus,
  appealStatuses,
} from "../../../db/appeals";
import { requireRole } from "../../lib/authz";
import { isRecord } from "../../lib/guards";
import { PayloadTooLargeError, readJsonBody, urlTooLong } from "../../lib/input-limits";
import { recordRateLimitBlock } from "../../lib/abuse-alerts";
import { callerKey, checkRateLimit, limitsFor } from "../../lib/rate-limit";

const appealReasonMaxLength = 1500;

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
  if (!reason || reason.length > appealReasonMaxLength) return null;
  return { entity, entityId, decisionEventId, reason };
}

function appealLimit(request: Request) {
  const key = callerKey(request);
  const limitOptions = limitsFor("appeal", env);
  const limit = checkRateLimit("appeal", key, limitOptions);
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
 * authenticated user with at least the `contributor` role; the appeal is
 * attributed to their user account and every step writes an append-only
 * audit event.
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  const auth = await requireRole(request, "contributor");
  if (!auth.ok) return auth.response;

  const blocked = appealLimit(request);
  if (blocked) return blocked;

  try {
    const payload = parseAppealRequest(await readJsonBody(request, env));
    if (!payload) {
      return Response.json(
        {
          error: `Provide a valid entity, positive integer entityId, the decisionEventId being contested, and a reason of at most ${appealReasonMaxLength} characters.`,
        },
        { status: 400 },
      );
    }

    const result = await fileAppeal({
      entity: payload.entity,
      entityId: payload.entityId,
      decisionEventId: payload.decisionEventId,
      appellantId: auth.user.id,
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
    }
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      console.warn("POST /api/appeals payload rejected: body over the configured byte cap");
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

  const blocked = appealLimit(request);
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
