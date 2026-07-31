import { env } from "cloudflare:workers";
import {
  listPendingModerationItems,
  moderateCamera,
  moderateCorrection,
  type CameraModerationAction,
  type CorrectionModerationAction,
  type CorrectionModerationOptions,
  type MetadataPublicationChoices,
  type ModerationEntity,
  type ModerationReasonCode,
  moderationReasonCodes,
} from "../../../db/moderation";
import { recordRateLimitBlock } from "../../lib/abuse-alerts";
import { isRecord } from "../../lib/guards";
import { PayloadTooLargeError, readJsonBody, urlTooLong } from "../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../lib/rate-limit";

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

function parseModerationRequest(value: unknown):
  | {
      entity: "camera";
      id: number;
      action: CameraModerationAction;
      reasonCode: ModerationReasonCode;
      note: string | null;
      metadataPublication?: MetadataPublicationChoices;
    }
  | {
      entity: "correction";
      id: number;
      action: CorrectionModerationAction;
      reasonCode: ModerationReasonCode;
      note: string | null;
      options?: CorrectionModerationOptions;
    }
  | null {
  if (!isRecord(value)) return null;

  const entity = value.entity as ModerationEntity;
  const id = value.id;
  const action = value.action;
  const reasonCode = value.reasonCode;
  const note = value.note;
  const cameraId = value.cameraId;
  const outcome = value.outcome;
  const publishManufacturer = value.publishManufacturer;
  const publishObservedOn = value.publishObservedOn;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) return null;
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

  const parsedReasonCode = reasonCode as ModerationReasonCode;
  const parsedNote = typeof note === "string" && note.trim() ? note.trim() : null;
  if (entity === "camera") {
    if (cameraId !== undefined || outcome !== undefined) return null;
    if (
      action === "approve" ||
      action === "reject" ||
      action === "hide" ||
      action === "mark-stale" ||
      action === "reverify"
    ) {
      if (action !== "approve" && (publishManufacturer !== undefined || publishObservedOn !== undefined)) {
        return null;
      }
      return {
        entity,
        id,
        action,
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
      };
    }
    return null;
  }
  if (entity === "correction") {
    if (publishManufacturer !== undefined || publishObservedOn !== undefined) return null;
    if (action !== "approve" && action !== "reject" && action !== "associate") return null;
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
      action,
      reasonCode: parsedReasonCode,
      note: parsedNote,
      ...(Object.keys(options).length > 0 ? { options } : {}),
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

export async function GET(request: Request) {
  // Input limits: reject absurdly long URLs before any parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

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
  // Input limits: reject absurdly long URLs before any parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

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

    const item =
      payload.entity === "camera"
        ? await moderateCamera(
            payload.id,
            payload.action,
            payload.reasonCode,
            payload.note,
            payload.metadataPublication,
          )
        : payload.options
          ? await moderateCorrection(
              payload.id,
              payload.action,
              payload.reasonCode,
              payload.note,
              payload.options,
            )
          : await moderateCorrection(payload.id, payload.action, payload.reasonCode, payload.note);
    if (!item) {
      return Response.json({ error: "Item not found or action is not valid for its current status." }, { status: 404 });
    }

    return Response.json({ entity: payload.entity, item: item.item, event: item.event });
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
