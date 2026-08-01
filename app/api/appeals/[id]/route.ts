import { env } from "cloudflare:workers";
import { decideAppeal, type AppealDecision, appealDecisions } from "../../../../db/appeals";
import { requireRole } from "../../../lib/authz";
import { isRecord } from "../../../lib/guards";
import { PayloadTooLargeError, readJsonBody, urlTooLong } from "../../../lib/input-limits";
import { recordRateLimitBlock } from "../../../lib/abuse-alerts";
import { callerKey, checkRateLimit, limitsFor } from "../../../lib/rate-limit";
import { getReviewerByUserId } from "../../../../db/users";

function parseAppealId(url: URL): number | null {
  const segments = url.pathname.split("/").filter(Boolean);
  const raw = segments[segments.length - 1];
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDecisionRequest(value: unknown): {
  decision: AppealDecision;
  note: string | null;
} | null {
  if (!isRecord(value)) return null;
  const decision = value.decision;
  const note = value.note;
  if (
    typeof decision !== "string" ||
    !appealDecisions.includes(decision as AppealDecision)
  ) {
    return null;
  }
  if (note !== undefined && (typeof note !== "string" || note.length > 500)) return null;
  return {
    decision: decision as AppealDecision,
    note: typeof note === "string" && note.trim() ? note.trim() : null,
  };
}

/**
 * PATCH /api/appeals/:id — an independent senior moderator (or the
 * administrator) decides a pending appeal. DATA_TRUST.md requires the decider
 * to be a reviewer who did NOT make the original decision; an escalated
 * appeal may only be resolved by the administrator. The acting reviewer is
 * derived server-side from the authenticated user's linked reviewer profile.
 */
export async function PATCH(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  const auth = await requireRole(request, "moderator");
  if (!auth.ok) return auth.response;

  // The decider acts with the moderation bucket (second layer over the
  // edge gate): only authenticated moderators reach this point, and the
  // per-caller limit bounds a compromised or over-zealous account without
  // ever affecting public read traffic.
  const key = callerKey(request);
  const limitOptions = limitsFor("moderate", env);
  const limit = checkRateLimit("moderate", key, limitOptions);
  if (!limit.allowed) {
    console.warn("PATCH /api/appeals/[id] rate limited");
    recordRateLimitBlock(env, {
      route: "/api/appeals/[id]",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const appealId = parseAppealId(new URL(request.url));
  if (appealId === null) {
    return Response.json({ error: "Provide a positive integer appeal id." }, { status: 400 });
  }

  try {
    const payload = parseDecisionRequest(await readJsonBody(request, env));
    if (!payload) {
      return Response.json(
        {
          error:
            "Provide a valid decision (uphold, dismiss, or escalate) and an optional note of at most 500 characters.",
        },
        { status: 400 },
      );
    }

    // The acting reviewer is server-derived: a moderator acts as their own
    // linked reviewer; an admin-role user must still be linked to a reviewer
    // profile to decide (their own, unless a senior reviewer is required).
    const reviewer = await getReviewerByUserId(auth.user.id);
    if (!reviewer) {
      return Response.json(
        { error: "Your account has no reviewer profile to act with." },
        { status: 403 },
      );
    }

    const result = await decideAppeal({
      id: appealId,
      decision: payload.decision,
      reviewer: {
        id: reviewer.id,
        displayName: reviewer.displayName,
        role: reviewer.role,
        active: reviewer.active,
      },
      note: payload.note,
    });

    switch (result.kind) {
      case "ok":
        return Response.json({ appeal: result.appeal, event: result.event });
      case "not_found":
        return Response.json({ error: "Appeal not found." }, { status: 404 });
      case "not_pending":
        return Response.json(
          { error: "Only pending (or escalated) appeals can be decided." },
          { status: 409 },
        );
      case "reviewer_not_found":
      case "reviewer_inactive":
        return Response.json({ error: "Reviewer is not available to decide." }, { status: 403 });
      case "forbidden":
        return Response.json(
          { error: "Only a senior moderator or the administrator may decide an appeal." },
          { status: 403 },
        );
      case "original_reviewer":
        return Response.json(
          { error: "The reviewer who made the original decision cannot decide the appeal." },
          { status: 409 },
        );
      case "escalation_requires_note":
        return Response.json(
          { error: "Escalation requires a note explaining the reason." },
          { status: 400 },
        );
    }
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      console.warn("PATCH /api/appeals payload rejected: body over the configured byte cap");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("PATCH /api/appeals failed", error);
    return Response.json({ error: "Unable to record the appeal decision" }, { status: 500 });
  }
}
