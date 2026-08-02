import { env } from "cloudflare:workers";
import { getD1 } from "./cameras";
import { getUserById } from "./users";
import {
  recordModerationEvent,
  reopenQueueForItem,
  type ModerationD1,
  type ModerationEntity,
  type ModerationEvent,
} from "./moderation";
import { appealAppellantLimits } from "../app/lib/rate-limit";

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

async function loadAppeal(d1: ModerationD1, id: number): Promise<ModerationAppeal | null> {
  return d1
    .prepare(`SELECT ${appealColumns} ${appealJoin} WHERE a.id = ?`)
    .bind(id)
    .first<ModerationAppeal>();
}

/**
 * File an appeal against a recorded moderation decision. The decision must
 * exist and must be a final decision (it changed the entity status): intent
 * events (recusals, escalations, second-review steps) cannot be appealed.
 *
 * Standing and abuse control (DATA_TRUST.md "Corrections, removals, and
 * appeals"): any contributor may appeal a decision, but an appeal must state
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
  if (!decision) return { kind: "decision_not_found" };
  if (
    decision.entity !== input.entity ||
    decision.entityId !== input.entityId ||
    decision.previousStatus === decision.newStatus
  ) {
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
  const created = await d1
    .prepare(
      "INSERT INTO moderation_appeals (entity, entity_id, decision_event_id, appellant_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?) RETURNING id",
    )
    .bind(input.entity, input.entityId, input.decisionEventId, input.appellantId, input.reason, now)
    .first<{ id: number }>();
  if (!created) throw new Error("Appeal could not be recorded");

  const event = await recordModerationEvent(d1, {
    entity: input.entity,
    entityId: input.entityId,
    previousStatus: decision.previousStatus,
    newStatus: decision.newStatus,
    action: "appeal-filed",
    reasonCode: "other",
    note: `Appeal #${created.id}: ${input.reason}`,
    appealId: created.id,
  });

  const appeal = await loadAppeal(d1, created.id);
  if (!appeal) throw new Error("Appeal could not be loaded");
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
      "SELECT id, entity, entity_id AS entityId, decision_event_id AS decisionEventId, status FROM moderation_appeals WHERE id = ?",
    )
    .bind(input.id)
    .first<{ id: number; entity: ModerationEntity; entityId: number; decisionEventId: number; status: AppealStatus }>();
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

  const now = new Date().toISOString();
  const status: AppealStatus =
    input.decision === "uphold" ? "upheld" : input.decision === "dismiss" ? "dismissed" : "escalated";

  const updated = await d1
    .prepare(
      "UPDATE moderation_appeals SET status = ?, decided_by = ?, decision_note = ?, decided_at = ? WHERE id = ? RETURNING id",
    )
    .bind(status, input.reviewer.id, input.note, now, input.id)
    .first<{ id: number }>();
  if (!updated) return { kind: "not_found" };

  let previousStatus = decision.previousStatus;
  let newStatus = decision.newStatus;
  if (input.decision === "uphold") {
    // Reverse the decision: the entity returns to the moderation queue for a
    // fresh decision by a different reviewer. Never publish directly.
    if (appeal.entity === "camera") {
      await d1
        .prepare("UPDATE cameras SET status = 'pending', updated = ? WHERE id = ?")
        .bind(now, appeal.entityId)
        .run();
    } else {
      await d1
        .prepare("UPDATE correction_requests SET status = 'pending' WHERE id = ?")
        .bind(appeal.entityId)
        .run();
    }
    await reopenQueueForItem(appeal.entity, appeal.entityId);
    previousStatus = decision.newStatus;
    newStatus = "pending";
  }

  const event = await recordModerationEvent(d1, {
    entity: appeal.entity,
    entityId: appeal.entityId,
    previousStatus,
    newStatus,
    action: `appeal-${input.decision}`,
    reasonCode: "other",
    note: input.note,
    reviewer: input.reviewer,
    appealId: input.id,
  });

  const appealView = await loadAppeal(d1, input.id);
  if (!appealView) throw new Error("Appeal could not be loaded");
  return { kind: "ok", appeal: appealView, event };
}
