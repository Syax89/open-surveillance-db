import { env } from "cloudflare:workers";
import type { D1PreparedStatement } from "cloudflare:workers";
import { getD1 } from "./cameras";
import { getUserById } from "./users";
import {
  buildGuardedEventStatement,
  type ModerationD1,
  type ModerationEntity,
  type ModerationEvent,
} from "./moderation";
import { appealAppellantLimits } from "../app/lib/rate-limit";

/**
 * One statement result from `d1.batch(...)`: a RETURNING statement populates
 * `results`, everything else only `meta` (P1-2 atomic write path).
 */
type D1BatchResult = {
  success: boolean;
  results: Record<string, unknown>[];
  meta: { changes: number; lastRowId: number };
};

/**
 * Contributor appeals (docs/workstreams/DATA_TRUST.md "Corrections, removals,
 * and appeals" + ADR 0014). A contributor who disagrees with a recorded
 * moderation decision files an appeal against the decision event; an
 * independent senior moderator (never the original reviewer) reviews it.
 *
 * Statuses: `pending` → `upheld` | `dismissed` | `escalated`.
 *
 *   - upheld: the decision is reversed — the entity returns to the
 *     moderation queue (`pending`) for a fresh decision by a different
 *     reviewer. An upheld appeal never publishes anything by itself.
 *   - dismissed: the original decision stands.
 *   - escalated: routed to the administrator for resolution; only an
 *     administrator (or admin-role user) may decide an escalated appeal.
 *
 * Every transition writes an append-only `moderation_events` row linked via
 * `appeal_id`, so the appeal trail is part of the immutable audit log.
 */

export const appealStatuses = ["pending", "upheld", "dismissed", "escalated"] as const;
export type AppealStatus = (typeof appealStatuses)[number];

export const appealDecisions = ["uphold", "dismiss", "escalate"] as const;
export type AppealDecision = (typeof appealDecisions)[number];

export type ModerationAppeal = {
  id: number;
  entity: ModerationEntity;
  entityId: number;
  decisionEventId: number;
  appellantId: number;
  reason: string;
  status: AppealStatus;
  decidedBy: number | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  // Joined display fields (listAppeals).
  appellantName: string | null;
  decisionAction: string | null;
  decisionReasonCode: string | null;
  deciderName: string | null;
};

export type FileAppealResult =
  | { kind: "ok"; appeal: ModerationAppeal; event: ModerationEvent }
  | { kind: "decision_not_found" }
  | { kind: "decision_not_final" }
  | { kind: "appellant_not_found" }
  | { kind: "duplicate_pending" }
  | { kind: "appeal_limit_exceeded" };

export type DecideAppealResult =
  | { kind: "ok"; appeal: ModerationAppeal; event: ModerationEvent }
  | { kind: "not_found" }
  | { kind: "not_pending" }
  // The decider is the appellant (reviewers.user_id = appellant_id).
  | { kind: "self_review" }
  // Uphold only: the record no longer carries the status the contested
  // decision produced (it changed since), so there is nothing to reverse.
  | { kind: "decision_superseded" }
  | { kind: "reviewer_not_found" }
  | { kind: "reviewer_inactive" }
  | { kind: "forbidden" }
  | { kind: "original_reviewer" }
  | { kind: "escalation_requires_note" };

/** Minimal decider identity; the caller derives it server-side. */
export type AppealDecider = {
  id: number;
  displayName: string;
  role: string;
  active: number;
};

const appealColumns = [
  "a.id",
  "a.entity",
  "a.entity_id AS entityId",
  "a.decision_event_id AS decisionEventId",
  "a.appellant_id AS appellantId",
  "a.reason",
  "a.status",
  "a.decided_by AS decidedBy",
  "a.decision_note AS decisionNote",
  "a.created_at AS createdAt",
  "a.decided_at AS decidedAt",
  "u.display_name AS appellantName",
  "de.action AS decisionAction",
  "de.reason_code AS decisionReasonCode",
  "r.display_name AS deciderName",
].join(", ");

const appealJoin =
  "FROM moderation_appeals a LEFT JOIN users u ON u.id = a.appellant_id LEFT JOIN moderation_events de ON de.id = a.decision_event_id LEFT JOIN reviewers r ON r.id = a.decided_by";

function buildLoadAppealStatement(d1: ModerationD1, id: number): D1PreparedStatement {
  return d1.prepare(`SELECT ${appealColumns} ${appealJoin} WHERE a.id = ?`).bind(id);
}

async function loadAppeal(d1: ModerationD1, id: number): Promise<ModerationAppeal | null> {
  return buildLoadAppealStatement(d1, id).first<ModerationAppeal>();
}

/**
 * Statement builder for the "appeal-filed" audit event (P1-2 atomic write
 * path). The appeal id is unknown until the appeal INSERT in the same batch,
 * so both the note and `appeal_id` derive from `last_insert_rowid()` — inside
 * one batch/transaction the appeal row's id is the last insert before this
 * event, so the expression is stable (verified at runtime in the atomic-writes
 * suite).
 */
function buildAppealFiledEventStatement(
  d1: ModerationD1,
  event: {
    entity: ModerationEntity;
    entityId: number;
    previousStatus: string;
    newStatus: string;
    action: string;
    reasonCode: string;
  },
  reason: string,
): D1PreparedStatement {
  const createdAt = new Date().toISOString();
  return d1
    .prepare(
      `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, appeal_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ('Appeal #' || last_insert_rowid() || ': ' || ?), ?, NULL, NULL, 0, 0, NULL, last_insert_rowid(), ?)
       RETURNING id, entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, reason_code AS reasonCode, note, actor, reviewer_id AS reviewerId, actor_role AS actorRole, recused, escalated, second_reviewer_id AS secondReviewerId, appeal_id AS appealId, created_at AS createdAt`,
    )
    .bind(
      event.entity,
      event.entityId,
      event.previousStatus,
      event.newStatus,
      event.action,
      event.reasonCode,
      reason,
      "Local moderator",
      createdAt,
    );
}

/**
 * Standing (security audit): the appellant's contributor account
 * (users.contributor_id) must own the appealed entity — the camera's
 * submitter or the correction's reporter. An entity with no attribution
 * (anonymous / imported submission) cannot be checked for standing and stays
 * appealable by any contributor by design, but such a non-owner never
 * receives the contested decision's details back (see redactForNonOwner).
 */
async function appealStanding(
  d1: ModerationD1,
  entity: ModerationEntity,
  entityId: number,
  appellantId: number,
): Promise<"owner" | "unattributed" | "none"> {
  const table = entity === "camera" ? "cameras" : entity === "correction" ? "correction_requests" : null;
  if (!table) return "none";
  const row = await d1
    .prepare(
      `SELECT e.contributor_id AS ownerId, (SELECT contributor_id FROM users WHERE id = ?) AS appellantContributorId FROM ${table} e WHERE e.id = ?`,
    )
    .bind(appellantId, entityId)
    .first<{ ownerId: number | null; appellantContributorId: number | null }>();
  if (!row) return "none";
  if (row.ownerId === null) return "unattributed";
  return row.appellantContributorId !== null && row.appellantContributorId === row.ownerId ? "owner" : "none";
}

/** Strip the contested decision's details from what a non-owner gets back. */
function redactForNonOwner(appeal: ModerationAppeal, event: ModerationEvent): { appeal: ModerationAppeal; event: ModerationEvent } {
  return {
    appeal: { ...appeal, decisionAction: null, decisionReasonCode: null, deciderName: null },
    event: { ...event, previousStatus: "", newStatus: "", note: null },
  };
}

/**
 * File an appeal against a recorded moderation decision. The decision must
 * exist and must be a final decision (it changed the entity status): intent
 * events (recusals, escalations, second-review steps) cannot be appealed.
 *
 * A missing decision, a decision that does not belong to the named entity,
 * and an appellant without standing all answer the SAME `decision_not_found`
 * (no oracle on other people's moderation decisions).
 *
 * Standing and abuse control (DATA_TRUST.md "Corrections, removals, and
 * appeals"): only the owner of an attributed submission may appeal, and an appeal must state
 * why the appellant is affected (their submission or direct knowledge of the
 * record — the route enforces a minimum reason length, moderation evaluates
 * relevance). Anonymous submissions have no attribution, so appeals on them
 * cannot be checked for standing and remain allowed by design. A
 * per-appellant threshold (APPEAL_APPELLANT_RATE_LIMIT_*, default 5 per 24h)
 * bounds sustained filing; only appeals that land on the queue count.
 */
export async function fileAppeal(input: {
  entity: ModerationEntity;
  entityId: number;
  decisionEventId: number;
  appellantId: number;
  reason: string;
}): Promise<FileAppealResult> {
  const d1 = await getD1();

  const decision = await d1
    .prepare(
      "SELECT id, entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action FROM moderation_events WHERE id = ?",
    )
    .bind(input.decisionEventId)
    .first<{ id: number; entity: string; entityId: number; previousStatus: string; newStatus: string; action: string }>();
  if (!decision || decision.entity !== input.entity || decision.entityId !== input.entityId) {
    return { kind: "decision_not_found" };
  }
  const standing = await appealStanding(d1, input.entity, input.entityId, input.appellantId);
  if (standing === "none") return { kind: "decision_not_found" };
  if (decision.previousStatus === decision.newStatus) {
    return { kind: "decision_not_final" };
  }

  const appellant = await getUserById(input.appellantId);
  if (!appellant) return { kind: "appellant_not_found" };

  const existing = await d1
    .prepare(
      "SELECT id FROM moderation_appeals WHERE decision_event_id = ? AND status = 'pending'",
    )
    .bind(input.decisionEventId)
    .first<{ id: number }>();
  if (existing) return { kind: "duplicate_pending" };

  // Per-appellant threshold (P3 appeal-ownership audit): count appeals this
  // contributor actually filed inside the window. D1-backed, so it holds
  // across worker isolates and resets with the data, unlike the in-memory
  // per-IP HTTP bucket. The ISO timestamps are generated by this codebase
  // (`new Date().toISOString()`), so lexicographic comparison is exact.
  const limit = appealAppellantLimits(env);
  const windowStart = new Date(Date.now() - limit.windowSeconds * 1000).toISOString();
  const recentCount = await d1
    .prepare("SELECT COUNT(*) AS count FROM moderation_appeals WHERE appellant_id = ? AND created_at >= ?")
    .bind(input.appellantId, windowStart)
    .first<{ count: number }>();
  if ((recentCount?.count ?? 0) >= limit.maxRequests) {
    return { kind: "appeal_limit_exceeded" };
  }

  const now = new Date().toISOString();
  // ONE batch: the appeal INSERT + the audit event. The two WRITES are atomic
  // (a crash cannot file an appeal without its event, or record an event for
  // an appeal that never landed); the readback is a separate read afterwards.
  // QA F2 (t_894e0cc3): the partial UNIQUE index
  // moderation_appeals_pending_decision_unique (migration 0033) makes the
  // pending-duplicate check atomic at the SQL level — two concurrent POSTs on
  // the same decision cannot both pass the SELECT above. The second INSERT
  // violates the index, the batch rolls back (event included) and the
  // constraint error is mapped to duplicate_pending, exactly like the
  // sequential path.
  let results: D1BatchResult[];
  try {
    results = (await d1.batch([
      d1
        .prepare(
          "INSERT INTO moderation_appeals (entity, entity_id, decision_event_id, appellant_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?) RETURNING id",
        )
        .bind(input.entity, input.entityId, input.decisionEventId, input.appellantId, input.reason, now),
      buildAppealFiledEventStatement(
        d1,
        {
          entity: input.entity,
          entityId: input.entityId,
          previousStatus: decision.previousStatus,
          newStatus: decision.newStatus,
          action: "appeal-filed",
          reasonCode: "other",
        },
        input.reason,
      ),
    ])) as D1BatchResult[];
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      // The concurrent POST filed first: this one is the duplicate.
      return { kind: "duplicate_pending" };
    }
    throw error;
  }

  const created = results[0].results?.[0] as { id: number } | undefined;
  if (!created) throw new Error("Appeal could not be recorded");
  const event = results[1].results?.[0] as ModerationEvent;

  const appeal = await loadAppeal(d1, created.id);
  if (!appeal) throw new Error("Appeal could not be loaded");
  if (standing !== "owner") return { kind: "ok", ...redactForNonOwner(appeal, event) };
  return { kind: "ok", appeal, event };
}

/** List appeals newest first with the joined display fields (moderator view). */
export async function listAppeals(): Promise<ModerationAppeal[]> {
  const d1 = await getD1();
  const result = await d1
    .prepare(`SELECT ${appealColumns} ${appealJoin} ORDER BY a.created_at DESC, a.id DESC LIMIT 100`)
    .all<ModerationAppeal>();
  return result.results;
}

/**
 * Decide a pending appeal. Rules (DATA_TRUST.md):
 *   - the decider must be a reviewer with a senior role (`senior_moderator`
 *     or `administrator`), or an admin-role user;
 *   - the decider must NOT be the reviewer who made the original decision;
 *   - an escalated appeal may only be decided by an administrator;
 *   - `escalate` requires a note explaining why.
 *
 * On `uphold`, the entity returns to the moderation queue (`pending`) and a
 * fresh open queue item is created for a different reviewer to re-decide.
 * The appeal decision itself never changes public visibility.
 */
export async function decideAppeal(input: {
  id: number;
  decision: AppealDecision;
  reviewer: AppealDecider;
  note: string | null;
}): Promise<DecideAppealResult> {
  const d1 = await getD1();

  const appeal = await d1
    .prepare(
      "SELECT id, entity, entity_id AS entityId, decision_event_id AS decisionEventId, appellant_id AS appellantId, status FROM moderation_appeals WHERE id = ?",
    )
    .bind(input.id)
    .first<{ id: number; entity: ModerationEntity; entityId: number; decisionEventId: number; appellantId: number; status: AppealStatus }>();
  if (!appeal) return { kind: "not_found" };

  if (input.reviewer.active !== 1) return { kind: "reviewer_inactive" };
  const isAdminRole = input.reviewer.role === "administrator";
  const isSeniorRole = input.reviewer.role === "senior_moderator";
  if (!isAdminRole && !isSeniorRole) return { kind: "forbidden" };
  if (appeal.status === "escalated" && !isAdminRole) return { kind: "forbidden" };
  if (appeal.status !== "pending" && appeal.status !== "escalated") return { kind: "not_pending" };
  if (input.decision === "escalate" && !input.note) return { kind: "escalation_requires_note" };

  // Independence rule: the original decision's reviewer must not decide the appeal.
  const decision = await d1
    .prepare(
      "SELECT previous_status AS previousStatus, new_status AS newStatus, reviewer_id AS reviewerId FROM moderation_events WHERE id = ?",
    )
    .bind(appeal.decisionEventId)
    .first<{ previousStatus: string; newStatus: string; reviewerId: number | null }>();
  if (!decision) return { kind: "not_found" };
  if (decision.reviewerId !== null && decision.reviewerId === input.reviewer.id) {
    return { kind: "original_reviewer" };
  }

  // Self-review: the decider's identity (reviewers.user_id) must not be the
  // appellant — nobody decides their own appeal.
  const deciderUser = await d1
    .prepare("SELECT user_id AS userId FROM reviewers WHERE id = ?")
    .bind(input.reviewer.id)
    .first<{ userId: number | null }>();
  if (deciderUser?.userId != null && deciderUser.userId === appeal.appellantId) {
    return { kind: "self_review" };
  }

  const now = new Date().toISOString();
  const status: AppealStatus =
    input.decision === "uphold" ? "upheld" : input.decision === "dismiss" ? "dismissed" : "escalated";

  const entityTable = appeal.entity === "camera" ? "cameras" : "correction_requests";
  // Every dependent statement of the batch is guarded on THIS decision having
  // landed: the appeal row carries this status, this decider and this exact
  // decided_at. A concurrent decider that won the race leaves the guard false,
  // so nothing else in our batch writes (no entity change, no queue row, no
  // audit event).
  const appealDecidedHere =
    "SELECT 1 FROM moderation_appeals WHERE id = ? AND status = ? AND decided_by = ? AND decided_at = ?";
  const appealDecidedHereBinds = [input.id, status, input.reviewer.id, now] as const;
  const eventGuard = { sql: "AND decided_by = ? AND decided_at = ?", binds: [input.reviewer.id, now] };

  const appealUpdate = d1
    .prepare(
      // QA F3 (t_894e0cc3): the UPDATE must carry the SAME state guard as the
      // SELECT above — WHERE id = ? AND status IN ('pending','escalated'). The
      // pre-read guard alone is not atomic: two concurrent PATCHes both read
      // 'pending', both pass every check, and last-write-wins would flip a
      // decision already taken (double decision event, queue reopened twice).
      // Guarding the UPDATE closes the race at the SQL level; changes=0 maps
      // to not_pending below, exactly like db/moderation.ts moderateCamera.
      // An uphold additionally requires the record to still carry the status
      // the contested decision produced: if it changed since (another
      // decision, a community transition), there is nothing to reverse.
      `UPDATE moderation_appeals SET status = ?, decided_by = ?, decision_note = ?, decided_at = ? WHERE id = ? AND status IN ('pending', 'escalated')${
        input.decision === "uphold" ? ` AND EXISTS (SELECT 1 FROM ${entityTable} WHERE id = ? AND status = ?)` : ""
      } RETURNING id`,
    )
    .bind(
      status,
      input.reviewer.id,
      input.note,
      now,
      input.id,
      ...(input.decision === "uphold" ? [appeal.entityId, decision.newStatus] : []),
    );

  if (input.decision === "uphold") {
    // ONE batch: appeal UPDATE, entity back to pending, reopen queue, the
    // appeal-uphold event, appeal readback. The reopen uses ON CONFLICT DO
    // NOTHING against the partial unique index (entity, entity_id) WHERE
    // state != 'closed' — same outcome as the old SELECT-first getOrCreate.
    const results = (await d1.batch([
      appealUpdate,
      appeal.entity === "camera"
        ? d1
            .prepare(`UPDATE cameras SET status = 'pending', updated = ? WHERE id = ? AND status = ? AND EXISTS (${appealDecidedHere})`)
            .bind(now, appeal.entityId, decision.newStatus, ...appealDecidedHereBinds)
        : d1
            .prepare(`UPDATE correction_requests SET status = 'pending' WHERE id = ? AND status = ? AND EXISTS (${appealDecidedHere})`)
            .bind(appeal.entityId, decision.newStatus, ...appealDecidedHereBinds),
      d1
        .prepare(
          `INSERT INTO moderation_queue (entity, entity_id, state, assignee_id, sensitivity, requires_second_review, second_reviewer_id, escalation_reason, created_at, updated_at)
           SELECT ?, ?, 'queued', NULL, 'standard', 0, NULL, NULL, ?, ?
           WHERE EXISTS (${appealDecidedHere})
           ON CONFLICT(entity, entity_id) WHERE state != 'closed' DO NOTHING`,
        )
        .bind(appeal.entity, appeal.entityId, now, now, ...appealDecidedHereBinds),
      buildGuardedEventStatement(
        d1,
        {
          entity: appeal.entity,
          entityId: appeal.entityId,
          previousStatus: decision.newStatus,
          newStatus: "pending",
          action: `appeal-${input.decision}`,
          reasonCode: "other",
          note: input.note,
          reviewer: input.reviewer,
          appealId: input.id,
        },
        "moderation_appeals",
        input.id,
        status,
        eventGuard,
      ),
      buildLoadAppealStatement(d1, input.id),
    ])) as D1BatchResult[];

    const updated = results[0].results?.[0] as { id: number } | undefined;
    if (!updated) {
      // The SELECT above found a pending/escalated appeal, but the guarded
      // UPDATE touched 0 rows: either another decider won the race (the
      // appeal is no longer decidable → not_pending, QA F3) or the record
      // moved away from the contested decision's status (→ superseded).
      const current = await d1
        .prepare("SELECT status FROM moderation_appeals WHERE id = ?")
        .bind(input.id)
        .first<{ status: AppealStatus }>();
      if (current && (current.status === "pending" || current.status === "escalated")) {
        return { kind: "decision_superseded" };
      }
      return { kind: "not_pending" };
    }
    const event = results[3].results?.[0] as ModerationEvent;
    const appealView = results[4].results?.[0] as ModerationAppeal | undefined;
    const appealResult = appealView ?? (await loadAppeal(d1, input.id));
    if (!appealResult) throw new Error("Appeal could not be loaded");
    return { kind: "ok", appeal: appealResult, event };
  }

  // dismiss / escalate: ONE batch — appeal UPDATE, decision event (guarded
  // on this decision having landed), readback.
  const results = (await d1.batch([
    appealUpdate,
    buildGuardedEventStatement(
      d1,
      {
        entity: appeal.entity,
        entityId: appeal.entityId,
        previousStatus: decision.previousStatus,
        newStatus: decision.newStatus,
        action: `appeal-${input.decision}`,
        reasonCode: "other",
        note: input.note,
        reviewer: input.reviewer,
        appealId: input.id,
      },
      "moderation_appeals",
      input.id,
      status,
      eventGuard,
    ),
    buildLoadAppealStatement(d1, input.id),
  ])) as D1BatchResult[];

  const updated = results[0].results?.[0] as { id: number } | undefined;
  if (!updated) {
    // Guarded UPDATE touched 0 rows: another decider won the race (QA F3).
    return { kind: "not_pending" };
  }
  const event = results[1].results?.[0] as ModerationEvent;
  const appealView = results[2].results?.[0] as ModerationAppeal | undefined;
  const appealResult = appealView ?? (await loadAppeal(d1, input.id));
  if (!appealResult) throw new Error("Appeal could not be loaded");
  return { kind: "ok", appeal: appealResult, event };
}
