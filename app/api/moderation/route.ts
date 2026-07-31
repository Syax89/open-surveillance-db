import {
  listPendingModerationItems,
  moderateCamera,
  moderateCorrection,
  type CameraModerationAction,
  type CorrectionModerationAction,
  type MetadataPublicationChoices,
  type ModerationEntity,
  type ModerationReasonCode,
  moderationReasonCodes,
} from "../../../db/moderation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
    }
  | null {
  if (!isRecord(value)) return null;

  const entity = value.entity as ModerationEntity;
  const id = value.id;
  const action = value.action;
  const reasonCode = value.reasonCode;
  const note = value.note;
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
  if (
    entity === "camera" &&
    (action === "approve" ||
      action === "reject" ||
      action === "hide" ||
      action === "mark-stale" ||
      action === "reverify")
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
  if (entity === "correction" && (action === "approve" || action === "reject")) {
    if (publishManufacturer !== undefined || publishObservedOn !== undefined) return null;
    return { entity, id, action, reasonCode: parsedReasonCode, note: parsedNote };
  }
  return null;
}

export async function GET() {
  try {
    return Response.json(await listPendingModerationItems());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Moderation queue unavailable" },
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
        : await moderateCorrection(payload.id, payload.action, payload.reasonCode, payload.note);
    if (!item) {
      return Response.json({ error: "Item not found or action is not valid for its current status." }, { status: 404 });
    }

    return Response.json({ entity: payload.entity, item: item.item, event: item.event });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to update moderation item" },
      { status: 500 },
    );
  }
}
