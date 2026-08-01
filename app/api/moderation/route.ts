import { env } from "cloudflare:workers";
import {
  listPendingModerationItems,
  moderateCamera,
  moderateCorrection,
  type CameraModerationAction,
  type CorrectionModerationAction,
  type CorrectionModerationOptions,
  type MetadataPublicationChoices,
  type ModerationContext,
  type ModerationEntity,
  type ModerationReasonCode,
  type ModerationResult,
  moderationReasonCodes,
} from "../../../db/moderation";
import {
  moderatePhoto,
  type PhotoModerationAction,
  type PhotoModerationResult,
} from "../../../db/photos";
import { recordRateLimitBlock } from "../../lib/abuse-alerts";
import { requireRole } from "../../lib/authz";
import { isRecord } from "../../lib/guards";
import { PayloadTooLargeError, readJsonBody, urlTooLong } from "../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../lib/rate-limit";
import { getReviewerByUserId } from "../../../db/users";

// Mirror of the db layer allowlist (db/moderation.ts correctionOutcomes). Kept
// inline so the route validates without importing a runtime value the test
// harness does not mock.
const correctionOutcomeValues = [
  "kept",
  "corrected",
  "marked-stale",
  "removed",
  "escalated",
] as const;
type CorrectionOutcomeValue = (typeof correctionOutcomeValues)[number];

const queueSensitivities = ["standard", "sensitive", "urgent"] as const;
type QueueSensitivity = (typeof queueSensitivities)[number];

function isQueueSensitivity(value: unknown): value is QueueSensitivity {
  return typeof value === "string" && (queueSensitivities as readonly string[]).includes(value);
}

type ParsedModerationRequest =
  | {
      entity: "camera";
      id: number;
      action: CameraModerationAction;
      reasonCode: ModerationReasonCode;
      note: string | null;
      metadataPublication?: MetadataPublicationChoices;
      context: ModerationContext;
    }
  | {
      entity: "correction";
      id: number;
      action: CorrectionModerationAction;
      reasonCode: ModerationReasonCode;
      note: string | null;
      options?: CorrectionModerationOptions;
      context: ModerationContext;
    }
  | {
      entity: "photo";
      id: number;
      action: PhotoModerationAction;
      reasonCode: ModerationReasonCode;
      note: string | null;
      redactionConfirmed: boolean;
      context: ModerationContext;
    }
  | null;

function parseModerationRequest(value: unknown): ParsedModerationRequest {
  if (!isRecord(value)) return null;

  // Whitelist of lifecycle actions, kept next to the parser that enforces it.
  const cameraActions: CameraModerationAction[] = [
    "approve",
    "reject",
    "hide",
    "mark-stale",
    "reverify",
    "escalate",
  ];
  const correctionActions: CorrectionModerationAction[] = ["approve", "reject", "associate", "escalate"];
  const photoActions: PhotoModerationAction[] = ["approve", "reject"];

  const entity = value.entity as ModerationEntity;
  const id = value.id;
  const action = value.action;
  const reasonCode = value.reasonCode;
  const note = value.note;
  const actorId = value.actorId;
  const cameraId = value.cameraId;
  const outcome = value.outcome;
  const redactionConfirmed = value.redactionConfirmed;
  const publishManufacturer = value.publishManufacturer;
  const publishObservedOn = value.publishObservedOn;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) return null;
  if (typeof actorId !== "number" || !Number.isInteger(actorId) || actorId < 1) return null;
  if (
    typeof reasonCode !== "string" ||
    !moderationReasonCodes.includes(reasonCode as ModerationReasonCode)
  ) {
    return null;
  }
  if (note !== undefined && (typeof note !== "string" || note.length > 500)) return null;
  if (
    (publishManufacturer !== undefined && typeof publishManufacturer !== "boolean") ||
    (publishObservedOn !== undefined && typeof publishObservedOn !== "boolean")
  ) {
    return null;
  }
  if (value.sensitivity !== undefined && !isQueueSensitivity(value.sensitivity)) return null;
  if (value.assigneeId !== undefined) {
    if (
      typeof value.assigneeId !== "number" ||
      !Number.isInteger(value.assigneeId) ||
      value.assigneeId < 1
    ) {
      return null;
    }
  }
  if (value.recused !== undefined && typeof value.recused !== "boolean") return null;
  if (value.requiresSecondReview !== undefined && typeof value.requiresSecondReview !== "boolean") {
    return null;
  }
  if (redactionConfirmed !== undefined && typeof redactionConfirmed !== "boolean") return null;

  const parsedReasonCode = reasonCode as ModerationReasonCode;
  const parsedNote = typeof note === "string" && note.trim() ? note.trim() : null;
  const context = {
    actorId,
    ...(value.sensitivity !== undefined ? { sensitivity: value.sensitivity as QueueSensitivity } : {}),
    ...(value.assigneeId !== undefined ? { assigneeId: value.assigneeId as number } : {}),
    ...(value.recused !== undefined ? { recused: value.recused as boolean } : {}),
    ...(value.requiresSecondReview !== undefined
      ? { requiresSecondReview: value.requiresSecondReview as boolean }
      : {}),
  };

  if (entity === "camera") {
    if (cameraId !== undefined || outcome !== undefined) return null;
    if (cameraActions.includes(action as CameraModerationAction)) {
      if (
        action !== "approve" &&
        (publishManufacturer !== undefined || publishObservedOn !== undefined)
      ) {
        return null;
      }
      return {
        entity,
        id,
        action: action as CameraModerationAction,
        reasonCode: parsedReasonCode,
        note: parsedNote,
        ...(action === "approve"
          ? {
              metadataPublication: {
                publishManufacturer: publishManufacturer ?? false,
                publishObservedOn: publishObservedOn ?? false,
              },
            }
          : {}),
        context,
      };
    }
    return null;
  }
  if (entity === "correction") {
    if (publishManufacturer !== undefined || publishObservedOn !== undefined) return null;
    if (!correctionActions.includes(action as CorrectionModerationAction)) return null;
    if (
      cameraId !== undefined &&
      (typeof cameraId !== "number" || !Number.isInteger(cameraId) || cameraId < 1)
    ) {
      return null;
    }
    if (
      outcome !== undefined &&
      (typeof outcome !== "string" ||
        !correctionOutcomeValues.includes(outcome as CorrectionOutcomeValue))
    ) {
      return null;
    }
    if (outcome !== undefined && action !== "approve") return null;
    if (action === "associate" && cameraId === undefined) return null;

    const options: CorrectionModerationOptions = {};
    if (cameraId !== undefined) options.cameraId = cameraId;
    if (outcome !== undefined) options.outcome = outcome as CorrectionOutcomeValue;
    return {
      entity,
      id,
      action: action as CorrectionModerationAction,
      reasonCode: parsedReasonCode,
      note: parsedNote,
      ...(Object.keys(options).length > 0 ? { options } : {}),
      context,
    };
  }
  if (entity === "photo") {
    if (publishManufacturer !== undefined || publishObservedOn !== undefined) return null;
    if (cameraId !== undefined || outcome !== undefined) return null;
    if (!photoActions.includes(action as PhotoModerationAction)) return null;
    // Approval is impossible without explicit redaction confirmation.
    if (action === "approve" && redactionConfirmed !== true) return null;
    return {
      entity,
      id,
      action: action as PhotoModerationAction,
      reasonCode: parsedReasonCode,
      note: parsedNote,
      redactionConfirmed: redactionConfirmed ?? false,
      context,
    };
  }
  return null;
}

/**
 * Rate limit the moderation API. This is a second layer on top of the
 * fail-closed worker-edge auth gate (worker/index.ts): even an
 * authenticated reviewer gets a bounded moderate bucket, and the alert
 * signal is emitted with a hashed caller identity only.
 */
function moderationLimit(request: Request) {
  const key = callerKey(request);
  const limitOptions = limitsFor("moderate", env);
  const limit = checkRateLimit("moderate", key, limitOptions);
  if (!limit.allowed) {
    console.warn("/api/moderation rate limited");
    recordRateLimitBlock(env, {
      route: "/api/moderation",
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

/** Map the discriminated moderation result to an HTTP response with a stable body. */
function moderationResponse(
  entity: ModerationEntity | "photo",
  result: ModerationResult<unknown> | PhotoModerationResult,
): Response {
  switch (result.kind) {
    case "ok":
    case "recused":
      return Response.json({ entity, ...result });
    case "second_review_pending":
      return Response.json({ entity, ...result }, { status: 202 });
    case "not_found":
      return Response.json(
        { error: "Item not found or action is not valid for its current status." },
        { status: 404 },
      );
    case "camera_not_found":
      return Response.json(
        { error: "Camera not found. The correction cannot be linked to a non-existent record." },
        { status: 404 },
      );
    case "forbidden":
      return Response.json(
        { error: "Your role does not permit this action on this item." },
        { status: 403 },
      );
    case "actor_not_found":
      return Response.json({ error: "Reviewer not found." }, { status: 404 });
    case "actor_inactive":
      return Response.json({ error: "Reviewer is inactive." }, { status: 403 });
    case "second_review_same_reviewer":
      return Response.json(
        { error: "A second reviewer different from the first is required." },
        { status: 409 },
      );
    case "escalation_requires_note":
      return Response.json(
        { error: "Escalation requires a note explaining the reason." },
        { status: 400 },
      );
    case "redaction_required":
      return Response.json(
        { error: "Approving a photo requires confirming that the subject was redacted." },
        { status: 400 },
      );
  }
}

export async function GET(request: Request) {
  // Input limits: reject absurdly long URLs before any query parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  // Role gate: the moderation queue is moderator+ only (ADR 0014). The worker
  // edge gate already authenticates; this route enforces the coarse role.
  const auth = await requireRole(request, "moderator");
  if (!auth.ok) return auth.response;

  const blocked = moderationLimit(request);
  if (blocked) return blocked;

  try {
    return Response.json(await listPendingModerationItems());
  } catch (error) {
    console.error("GET /api/moderation failed", error);
    return Response.json(
      { error: "Moderation queue unavailable" },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  // Input limits: reject absurdly long URLs before any query parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  // Role gate: decisions are moderator+ only. The acting reviewer is derived
  // server-side from the authenticated user's linked reviewer profile instead
  // of trusting a client-supplied actor id (ADR 0013 closes the ADR 0009
  // trade-off). An admin-role user may act as any reviewer (stepping in for
  // the demo actor selector); a moderator acts as their own reviewer only.
  const auth = await requireRole(request, "moderator");
  if (!auth.ok) return auth.response;

  const blocked = moderationLimit(request);
  if (blocked) return blocked;

  try {
    const payload = parseModerationRequest(await readJsonBody(request, env));
    if (!payload) {
      return Response.json(
        {
          error:
            "Provide a valid entity, positive integer id, permitted action, reasonCode, and optional note of at most 500 characters.",
        },
        { status: 400 },
      );
    }

    let actorId = payload.context.actorId;
    if (auth.user.role !== "admin") {
      const reviewer = await getReviewerByUserId(auth.user.id);
      if (!reviewer) {
        return Response.json(
          { error: "Your account has no reviewer profile to act with." },
          { status: 403 },
        );
      }
      actorId = reviewer.id;
    }
    const context = { ...payload.context, actorId };

    let result: ModerationResult<unknown> | PhotoModerationResult;
    if (payload.entity === "camera") {
      result = await moderateCamera(
        payload.id,
        payload.action,
        payload.reasonCode,
        payload.note,
        payload.metadataPublication,
        context,
      );
    } else if (payload.entity === "correction") {
      result = await moderateCorrection(
        payload.id,
        payload.action,
        payload.reasonCode,
        payload.note,
        payload.options,
        context,
      );
    } else {
      result = await moderatePhoto(
        payload.id,
        payload.action,
        payload.redactionConfirmed,
        payload.reasonCode,
        payload.note,
        context.actorId,
      );
    }
    return moderationResponse(payload.entity, result);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      console.warn("PATCH /api/moderation payload rejected: body over the configured byte cap");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("PATCH /api/moderation failed", error);
    return Response.json(
      { error: "Unable to update moderation item" },
      { status: 500 },
    );
  }
}
