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
import { isRecord } from "../../lib/guards";

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

  const entity = value.entity as ModerationEntity;
  const id = value.id;
  const action = value.action;
  const reasonCode = value.reasonCode;
  const note = value.note;
  const actorId = value.actorId;
  const cameraId = value.cameraId;
  const outcome = value.outcome;
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
  return null;
}

/** Map the discriminated moderation result to an HTTP response with a stable body. */
function moderationResponse(
  entity: ModerationEntity,
  result: ModerationResult<unknown>,
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
  }
}

export async function GET() {
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
  try {
    const payload = parseModerationRequest(await request.json());
    if (!payload) {
      return Response.json(
        {
          error:
            "Provide a valid entity, positive integer id, permitted action, reasonCode, actorId, and optional note of at most 500 characters.",
        },
        { status: 400 },
      );
    }

    const result =
      payload.entity === "camera"
        ? await moderateCamera(
            payload.id,
            payload.action,
            payload.reasonCode,
            payload.note,
            payload.metadataPublication,
            payload.context,
          )
        : await moderateCorrection(
            payload.id,
            payload.action,
            payload.reasonCode,
            payload.note,
            payload.options,
            payload.context,
          );
    return moderationResponse(payload.entity, result);
  } catch (error) {
    console.error("PATCH /api/moderation failed", error);
    return Response.json(
      { error: "Unable to update moderation item" },
      { status: 500 },
    );
  }
}
