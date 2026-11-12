import { env } from "cloudflare:workers";
import {
  listPendingModerationItems,
  moderateCamera,
  moderateCameraEdit,
  moderateCorrection,
  type CameraEditModerationAction,
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
import { moderatorWriteGuard, requireRole } from "../../lib/authz";
import { cameraPurgeTags, purgeCacheTags } from "../../lib/cache-purge";
import { isRecord } from "../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../lib/input-limits";
import { limitsFor } from "../../lib/rate-limit";
import { rateLimitResponse } from "../../lib/rate-limit-response";
import { getReviewerByUserId } from "../../../db/users";
import type { ModerationQueueCursors, PublishedCamerasCursor } from "../../../db/moderation";

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
      entity: "camera_edit";
      id: number;
      action: CameraEditModerationAction;
      reasonCode: ModerationReasonCode;
      note: string | null;
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
  // Community edit requests: the reviewer may only apply or discard the
  // contributor's diff (ADR 0018 §4). No other camera/correction action is
  // valid on a camera_edit entity.
  const cameraEditActions: CameraEditModerationAction[] = ["approve", "reject"];

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
  // `sensitivity` / `requiresSecondReview` are an UPGRADE request only: the
  // db layer derives the two-person-review floor from the item itself
  // (db/moderation.ts deriveQueueSensitivity) and never lets the deciding
  // moderator lower it.
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
  if (entity === "camera_edit") {
    // Edit-request decisions carry no camera/outcome/publication metadata:
    // the diff lives in the request row; the reviewer only applies or
    // discards it. Any extra field is rejected.
    if (
      cameraId !== undefined ||
      outcome !== undefined ||
      publishManufacturer !== undefined ||
      publishObservedOn !== undefined
    ) {
      return null;
    }
    if (!cameraEditActions.includes(action as CameraEditModerationAction)) return null;
    return {
      entity,
      id,
      action: action as CameraEditModerationAction,
      reasonCode: parsedReasonCode,
      note: parsedNote,
      context,
    };
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

/**
 * Rate limit the moderation API. This is a second layer on top of the
 * fail-closed worker-edge auth gate (worker/index.ts): even an
 * authenticated reviewer gets a bounded moderate bucket, and the alert
 * signal is emitted with a hashed caller identity only.
 */
async function moderationLimit(request: Request) {
  return rateLimitResponse(request, {
    bucket: "moderate",
    route: "/api/moderation",
    env,
    limits: limitsFor("moderate", env),
    log: "/api/moderation rate limited",
  });
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
    case "self_review":
      return Response.json(
        {
          error: "You cannot decide an item you submitted or a record you own. Recuse or escalate instead.",
          code: "self_review",
        },
        { status: 403 },
      );
  }
}

/**
 * Published keyset cursor validation. `createdAt` is an OPAQUE stored key:
 * never Date-parsed, trimmed or re-serialised here — only shape (non-empty,
 * <=100 chars, no C0/C1 control chars) is checked; SQL binding makes it safe.
 * `id` must be a canonical positive integer safe for JS.
 */
const PUBLISHED_CURSOR_MAX_CREATED_AT_CHARS = 100;
const PUBLISHED_CURSOR_ID_PATTERN = /^[1-9][0-9]*$/;
const PUBLISHED_CURSOR_CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

type ParsedPublishedCursor =
  | { ok: true; cursor: PublishedCamerasCursor | undefined }
  | { ok: false };

/** One `<prefix>_after_created_at` + `<prefix>_after_id` keyset pair. */
function parseCursorPair(params: URLSearchParams, prefix: string): ParsedPublishedCursor {
  const createdAtValues = params.getAll(`${prefix}_after_created_at`);
  const idValues = params.getAll(`${prefix}_after_id`);
  if (createdAtValues.length === 0 && idValues.length === 0) return { ok: true, cursor: undefined };
  // Require exactly one of each: incomplete or duplicated pairs are rejected.
  if (createdAtValues.length !== 1 || idValues.length !== 1) return { ok: false };
  const createdAt = createdAtValues[0];
  if (
    createdAt.length === 0 ||
    createdAt.length > PUBLISHED_CURSOR_MAX_CREATED_AT_CHARS ||
    PUBLISHED_CURSOR_CONTROL_CHARS.test(createdAt)
  ) {
    return { ok: false };
  }
  const rawId = idValues[0];
  if (!PUBLISHED_CURSOR_ID_PATTERN.test(rawId)) return { ok: false };
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) return { ok: false };
  return { ok: true, cursor: { createdAt, id } };
}

function parsePublishedCursor(request: Request): ParsedPublishedCursor {
  return parseCursorPair(new URL(request.url).searchParams, "published");
}

// Mirror of db/moderation.ts moderationPagedQueues (inline for the same
// reason as correctionOutcomeValues: the harness mocks the db module). Each
// queue takes its own `<queue>_after_*` pair, validated like the published one.
const pagedQueueNames = ["pending", "review", "stale", "corrections", "edits"] as const;

function parseQueueCursors(
  request: Request,
): { ok: true; cursors: ModerationQueueCursors } | { ok: false } {
  const params = new URL(request.url).searchParams;
  const cursors: ModerationQueueCursors = {};
  for (const queue of pagedQueueNames) {
    const parsed = parseCursorPair(params, queue);
    if (!parsed.ok) return { ok: false };
    if (parsed.cursor) cursors[queue] = parsed.cursor;
  }
  return { ok: true, cursors };
}

/**
 * Demo actor selector (QA#3 F5): ONLY when BOTH the explicit
 * MODERATION_DEMO_ACTOR_SELECTOR key AND ENVIRONMENT=development are set may
 * an admin step in as another reviewer. Off everywhere else.
 */
function demoActorSelector(role: string): boolean {
  return env.MODERATION_DEMO_ACTOR_SELECTOR === "true" && env.ENVIRONMENT === "development" && role === "admin";
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

  // Validate the published cursor BETWEEN the role gate and the rate limit, so
  // a malformed pair answers 400 without a queue query or spending the bucket.
  const parsedCursor = parsePublishedCursor(request);
  if (!parsedCursor.ok) {
    return Response.json(
      { error: "Provide a valid published pagination cursor." },
      { status: 400 },
    );
  }

  const parsedQueueCursors = parseQueueCursors(request);
  if (!parsedQueueCursors.ok) {
    return Response.json(
      { error: "Provide a valid queue pagination cursor." },
      { status: 400 },
    );
  }

  const blocked = await moderationLimit(request);
  if (blocked) return blocked;

  try {
    // The queue cursors are only forwarded when present, so a first-page
    // request keeps calling the db boundary with the published cursor alone.
    const queueCursors = parsedQueueCursors.cursors;
    const queue = Object.keys(queueCursors).length > 0
      ? await listPendingModerationItems(parsedCursor.cursor, queueCursors)
      : await listPendingModerationItems(parsedCursor.cursor);
    // Who the decisions will be recorded as (owner 2026-11: the dashboard
    // must not ask — the actor is always the logged-in moderator's own
    // reviewer profile; only the dev demo selector may pick another one).
    const reviewer = await getReviewerByUserId(auth.user.id);
    const actingReviewer = reviewer && reviewer.active === 1
      ? { id: reviewer.id, displayName: reviewer.displayName, role: reviewer.role }
      : null;
    return Response.json({ ...queue, actingReviewer, actorSelectable: demoActorSelector(auth.user.role) });
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
  // of trusting a client-supplied actor id (ADR 0014 §3 closes the ADR 0009
  // trade-off). Only the demo actor selector — admin-role callers on a
  // development build (`ENVIRONMENT = "development"`) — may still pick another
  // reviewer. Everywhere else the client actorId is IGNORED: an admin acts as
  // their own reviewer like any moderator, so the append-only audit trail
  // cannot be forged by impersonation (audit finding t_6b61fc3f).
  const auth = await requireRole(request, "moderator");
  if (!auth.ok) return auth.response;

  // Write-origin guard (before any rate-limit, body parse, reviewer lookup or
  // write). The moderator may be authenticated two ways at the edge: Basic/
  // bearer (explicit credentials: same-origin check only) or their own
  // osdb_session cookie (ambient authority the browser attaches by itself:
  // the per-session X-CSRF-Token must also match, like every contributor
  // write). The worker signals which one via `x-osdb-auth-source`.
  const writeDenied = await moderatorWriteGuard(request);
  if (writeDenied) return writeDenied;

  const blocked = await moderationLimit(request);
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

    let actorId: number;
    if (demoActorSelector(auth.user.role)) {
      // Demo actor selector (QA#3 F5): ONLY when BOTH the explicit
      // MODERATION_DEMO_ACTOR_SELECTOR key AND ENVIRONMENT=development are
      // set may an admin step in as any reviewer. Two keys so a production
      // deploy with ENVIRONMENT accidentally left at development still
      // cannot let an admin write moderation events as another reviewer,
      // corrupting the append-only audit trail. Unset/absent = OFF
      // everywhere; in production the actor is always server-derived.
      actorId = payload.context.actorId;
    } else {
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

    let result: ModerationResult<unknown>;
    if (payload.entity === "camera") {
      result = await moderateCamera(
        payload.id,
        payload.action,
        payload.reasonCode,
        payload.note,
        payload.metadataPublication,
        context,
      );
    } else if (payload.entity === "camera_edit") {
      result = await moderateCameraEdit(
        payload.id,
        payload.action,
        payload.reasonCode,
        payload.note,
        context,
      );
    } else {
      result = await moderateCorrection(
        payload.id,
        payload.action,
        payload.reasonCode,
        payload.note,
        payload.options,
        context,
      );
    }

    // Edge-cache invalidation (follow-up F0, t_ae600b90): a camera decision
    // changes the public set or the record itself, and the list/bbox/export
    // responses are cached with `s-maxage=300, stale-while-revalidate=600`
    // (the record detail is per-id, the collections are shared). Purge the
    // affected tags through the Cloudflare Cache Purge API so a takedown
    // (e.g. privacy/safety removal) stops being served immediately instead
    // of lingering for the revalidation window. Fail-open by design: when
    // CACHE_PURGE_TOKEN/ZONE_ID are absent (local prototype, tests) this is
    // a documented no-op, and an API failure never fails the decision.
    if (result.kind === "ok") {
      if (payload.entity === "camera") {
        await purgeCacheTags(cameraPurgeTags(payload.id), env);
      } else if (payload.entity === "camera_edit") {
        // An approved community edit changes the public record: purge the
        // target camera's tags (the diff only applies on approve). The
        // rejected path never touches `cameras`.
        const cameraId = (result as { item?: { cameraId?: number | null } }).item?.cameraId;
        if (cameraId !== null && cameraId !== undefined) {
          await purgeCacheTags(cameraPurgeTags(cameraId), env);
        }
      } else if (payload.entity === "correction") {
        // A correction decision can change the linked camera (approve with
        // outcome corrected/removed/marked-stale) — purge that record too.
        const cameraId = (result as { item?: { cameraId?: number | null } }).item?.cameraId;
        if (cameraId !== null && cameraId !== undefined) {
          await purgeCacheTags(cameraPurgeTags(cameraId), env);
        }
      }
    }

    return moderationResponse(payload.entity, result);
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("PATCH /api/moderation payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("PATCH /api/moderation failed", error);
    return Response.json(
      { error: "Unable to update moderation item" },
      { status: 500 },
    );
  }
}
