import { env } from "cloudflare:workers";
import type { D1PreparedStatement } from "cloudflare:workers";
import { getD1 } from "./cameras";
import { ACTION_WEIGHT_BY_LEVEL, verifiedContributionCount } from "./confirmations";
import { deriveLevel } from "../app/lib/trust-levels";
import { getCommunitySettingsCached } from "./community-settings";

/**
 * Community actions (ADR 0021 §3 — kanban t_a9f23581 FASE 2 API).
 *
 * ADR 0021 replaces single-toggle verifications with a five-type action
 * surface stored in `camera_community_actions` (migration 0036). This module
 * owns the write path (upsert/delete), the personal state read, the
 * aggregated public counts, and the transaccional threshold evaluation that
 * drives the automatic status transitions (ADR 0021 §2, §4, §6).
 *
 * Six anti-gaming layers (replicating and extending the confirmation alias):
 *   1. UNIQUE(camera_id, contributor_id) + ON CONFLICT DO NOTHING RETURNING;
 *   2. self-action gate (like/confirm on own record → 403);
 *   3. daily per-account quota as D1 state (COUNT inside the write path);
 *   4. per-record cap (max actions/day from distinct accounts);
 *   5. IP-hash burst bucket lives in the route layer (RateLimit);
 *   6. level gate implicit via weight = level-derived snapshot.
 *
 * The quota knobs live in community_settings (ADR 0021 §5.1) and are read
 * with a 60 s in-process cache (getCommunitySettingsCached). The daily
 * window for all limits is 24 h.
 */

type D1BatchResult = {
  success: boolean;
  results: Record<string, unknown>[];
  meta: { changes: number; lastRowId: number };
};

export const COMMUNITY_ACTION_TYPES = ["like", "confirm", "gone", "problem", "privacy"] as const;
export type CommunityActionType = (typeof COMMUNITY_ACTION_TYPES)[number];

export function isCommunityActionType(value: string): value is CommunityActionType {
  return (COMMUNITY_ACTION_TYPES as readonly string[]).includes(value);
}

export type SetCommunityActionResult =
  | { kind: "ok"; actionType: CommunityActionType; counts: CommunityActionCounts }
  | { kind: "switched"; actionType: CommunityActionType; switchedFrom: CommunityActionType; counts: CommunityActionCounts }
  | { kind: "duplicate" }
  | { kind: "self_action" }
  | { kind: "camera_not_found" }
  | { kind: "invalid_action" }
  | { kind: "daily_quota_exceeded"; retryAfterSeconds: number }
  | { kind: "per_record_cap_exceeded"; retryAfterSeconds: number };

export type RemoveCommunityActionResult =
  | { kind: "ok" }
  | { kind: "not_found" };

export type CommunityActionCounts = {
  like: number;
  confirm: number;
  gone: number;
  problem: number;
  privacy: number;
};

export type CommunityActionRecord = {
  id: number;
  cameraId: number;
  contributorId: number;
  actionType: CommunityActionType;
  weight: number;
  createdAt: string;
  updatedAt: string;
};

function windowRetryAfterSeconds(windowStartMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((windowStartMs + 24 * 60 * 60 * 1000 - nowMs) / 1000));
}

function settingsNumber(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(settings[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Sum-weighted + distinct contributor counts grouped by action_type for a
 * single camera. Used internally by evaluateCommunityThresholds.
 */
async function cameraActionStats(cameraId: number): Promise<Map<string, { sum: number; distinctCount: number }>> {
  const d1 = await getD1();
  const rows = await d1
    .prepare(
      `SELECT action_type AS actionType, COALESCE(SUM(weight), 0) AS sum, COUNT(DISTINCT contributor_id) AS distinctCount
       FROM camera_community_actions
       WHERE camera_id = ?
       GROUP BY action_type`,
    )
    .bind(cameraId)
    .all<{ actionType: string; sum: number; distinctCount: number }>();
  const map = new Map<string, { sum: number; distinctCount: number }>();
  for (const row of rows.results) {
    map.set(row.actionType, { sum: row.sum, distinctCount: row.distinctCount });
  }
  return map;
}

/**
 * Transaccional threshold evaluation (ADR 0021 §2, §4, §6).
 *
 * Called AFTER a successful action upsert (insert or switch). Evaluates
 * exactly ONE transition per invocation: status is read at the start and the
 * UPDATE is conditional (`WHERE status = <current>`), so a concurrent
 * evaluation sees the already-changed status and its conditional UPDATE
 * produces 0 changes.
 *
 * Order of evaluation (ADR §2 transition matrix, §4 thresholds):
 *
 *   active:
 *     1. privacy >= thresholds.privacy (non-weighted, min-distinct 1) → hidden(reason=privacy)
 *     2. gone.sum >= thresholds.gone AND gone.distinctCount >= goneMinDistinct → removed
 *     3. problem.sum >= thresholds.problem AND problem.distinctCount >= problemMinDistinct → hidden(reason=problem)
 *
 *   hidden:
 *     1. gone → removed (same threshold as active)
 *     2. confirm.sum >= restoreFromHidden AND confirm.distinctCount >= restoreMinDistinctFromHidden → active (restore)
 *        Privacy cooldown: if last hidden event reason === 'privacy', restore requires
 *        now - hiddenAt >= cooldown.privacyHiddenDays days.
 *
 *   removed:
 *     1. confirm.sum >= restoreFromRemoved AND confirm.distinctCount >= restoreMinDistinctFromRemoved → active (restore)
 *
 * Atomicity: a single `d1.batch` containing the conditional UPDATE + guarded
 * INSERTs for public lifecycle events + moderation_events + consumption
 * DELETE. Each INSERT/DELETE is guarded by `WHERE EXISTS (SELECT 1 FROM
 * cameras WHERE id=? AND status='<new>')` so events only land when the
 * transition actually happened.
 */
export async function evaluateCommunityThresholds(input: {
  cameraId: number;
  contributorId: number;
  now: string;
  env?: unknown;
}): Promise<void> {
  const d1 = await getD1();
  const nowMs = Date.parse(input.now);
  const settings = await getCommunitySettingsCached();

  const thresholds = {
    gone: settingsNumber(settings, "thresholds.gone", 3),
    goneMinDistinct: settingsNumber(settings, "thresholds.goneMinDistinct", 3),
    problem: settingsNumber(settings, "thresholds.problem", 3),
    problemMinDistinct: settingsNumber(settings, "thresholds.problemMinDistinct", 2),
    privacy: settingsNumber(settings, "thresholds.privacy", 1),
    restoreFromHidden: settingsNumber(settings, "thresholds.restoreFromHidden", 5),
    restoreMinDistinctFromHidden: settingsNumber(settings, "thresholds.restoreMinDistinctFromHidden", 3),
    restoreFromRemoved: settingsNumber(settings, "thresholds.restoreFromRemoved", 3),
    restoreMinDistinctFromRemoved: settingsNumber(settings, "thresholds.restoreMinDistinctFromRemoved", 2),
    cooldownPrivacyHiddenDays: settingsNumber(settings, "cooldown.privacyHiddenDays", 7),
  };

  const camera = await d1
    .prepare("SELECT status FROM cameras WHERE id = ?")
    .bind(input.cameraId)
    .first<{ status: string }>();
  if (!camera) return;

  const currentStatus = camera.status;
  const stats = await cameraActionStats(input.cameraId);

  const getStats = (type: string) => stats.get(type) ?? { sum: 0, distinctCount: 0 };

  // Determine the candidate transition, if any.
  let newStatus: string | null = null;
  let reason: string | null = null;
  let triggerType: string | null = null;
  let eventType: string | null = null;

  if (currentStatus === "active") {
    // 1. privacy: non-weighted count threshold
    const privacy = getStats("privacy");
    if (privacy.distinctCount >= thresholds.privacy) {
      newStatus = "hidden";
      reason = "privacy";
      triggerType = "privacy";
      eventType = "hidden";
    }
    // 2. gone → removed
    if (!newStatus) {
      const gone = getStats("gone");
      if (gone.sum >= thresholds.gone && gone.distinctCount >= thresholds.goneMinDistinct) {
        newStatus = "removed";
        triggerType = "gone";
        eventType = "removed";
      }
    }
    // 3. problem → hidden
    if (!newStatus) {
      const problem = getStats("problem");
      if (problem.sum >= thresholds.problem && problem.distinctCount >= thresholds.problemMinDistinct) {
        newStatus = "hidden";
        reason = "problem";
        triggerType = "problem";
        eventType = "hidden";
      }
    }
  } else if (currentStatus === "hidden") {
    // 1. gone → removed
    const gone = getStats("gone");
    if (gone.sum >= thresholds.gone && gone.distinctCount >= thresholds.goneMinDistinct) {
      newStatus = "removed";
      triggerType = "gone";
      eventType = "removed";
    }
    // 2. confirm → restore
    if (!newStatus) {
      const confirm = getStats("confirm");
      if (confirm.sum >= thresholds.restoreFromHidden && confirm.distinctCount >= thresholds.restoreMinDistinctFromHidden) {
        // Privacy cooldown check
        const lastHidden = await d1
          .prepare(
            "SELECT detail, created_at AS createdAt FROM camera_lifecycle_events WHERE camera_id = ? AND event_type = 'hidden' ORDER BY created_at DESC, id DESC LIMIT 1",
          )
          .bind(input.cameraId)
          .first<{ detail: string | null; createdAt: string }>();
        if (lastHidden) {
          let detailObj: Record<string, unknown> = {};
          try { detailObj = lastHidden.detail ? JSON.parse(lastHidden.detail) : {}; } catch { /* keep empty */ }
          if (detailObj.reason === "privacy") {
            const hiddenMs = Date.parse(lastHidden.createdAt);
            const cooldownMs = thresholds.cooldownPrivacyHiddenDays * 24 * 60 * 60 * 1000;
            if (nowMs - hiddenMs < cooldownMs) {
              // Cooldown not yet expired — restore blocked
              return;
            }
          }
        }
        newStatus = "active";
        triggerType = "confirm";
        eventType = "restored";
      }
    }
  } else if (currentStatus === "removed") {
    // 1. confirm → restore
    const confirm = getStats("confirm");
    if (confirm.sum >= thresholds.restoreFromRemoved && confirm.distinctCount >= thresholds.restoreMinDistinctFromRemoved) {
      newStatus = "active";
      triggerType = "confirm";
      eventType = "restored";
    }
  }

  if (!newStatus || !triggerType) return;

  const trigger = getStats(triggerType);
  const detailJson = JSON.stringify(
    reason
      ? { reason, counts: { sum: trigger.sum, distinct: trigger.distinctCount } }
      : { counts: { sum: trigger.sum, distinct: trigger.distinctCount } },
  );

  const actor = `community:${input.contributorId}`;
  const actionCode = `community-${triggerType}-${newStatus}`;

  // Atomic compare-and-swap: the ONLY statement that decides the winner.
  // The conditional UPDATE changes exactly one row for the first evaluator;
  // a concurrent evaluator that read the same `currentStatus` finds 0 changes
  // and returns without recording anything (test 12 races two evaluators and
  // asserts exactly one transition + one event). The moderation.ts guarded-
  // INSERT pattern is fine for serialised manual moderation; community actions
  // are genuinely concurrent, so the winner must be decided HERE, not by an
  // EXISTS guard that a losing evaluator would still see as true after the
  // winner's commit.
  const updateResult = (await d1
    .prepare("UPDATE cameras SET status = ?, updated = ? WHERE id = ? AND status = ?")
    .bind(newStatus, input.now, input.cameraId, currentStatus)
    .run()) as { meta: { changes: number } };
  if (updateResult.meta.changes === 0) {
    // A concurrent evaluation already performed this transition (or the
    // status changed under us): record nothing, consume nothing.
    return;
  }

  // We won the transition: status is now `newStatus` (committed by the CAS
  // above), so the event writes below can never double-fire. One batch keeps
  // them atomic against partial failures.
  const batchStatements: D1PreparedStatement[] = [];

  // 2. Public lifecycle event
  batchStatements.push(
    d1
      .prepare("INSERT INTO camera_lifecycle_events (camera_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)")
      .bind(input.cameraId, eventType, detailJson, input.now),
  );

  // 3. moderation_events INSERT (internal audit)
  batchStatements.push(
    d1
      .prepare(
        `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, created_at)
         VALUES ('camera', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, NULL, ?)`,
      )
      .bind(
        input.cameraId,
        currentStatus,
        newStatus,
        actionCode,
        actionCode,
        JSON.stringify({ triggerType, counts: { sum: trigger.sum, distinct: trigger.distinctCount } }),
        actor,
        input.now,
      ),
  );

  // 4. Consumption DELETE: remove trigger action rows
  batchStatements.push(
    d1
      .prepare("DELETE FROM camera_community_actions WHERE camera_id = ? AND action_type = ?")
      .bind(input.cameraId, triggerType),
  );

  // 5. Action-consumed public event
  batchStatements.push(
    d1
      .prepare("INSERT INTO camera_lifecycle_events (camera_id, event_type, detail, created_at) VALUES (?, 'action-consumed', ?, ?)")
      .bind(input.cameraId, JSON.stringify({ actionType: triggerType, count: trigger.distinctCount }), input.now),
  );

  await d1.batch(batchStatements);
}

/**
 * Upsert a community action for a (camera, contributor) pair.
 *
 * ADR 0021 §3.2: the UNIQUE(camera_id, contributor_id) constraint makes each
 * pair a toggle — one active action at a time. A second PUT with a different
 * actionType switches; the same actionType answers `duplicate` (409).
 *
 * Self-action gate §3.3: like/confirm on own record → 403.
 * gone/problem/privacy on own record ARE permitted.
 *
 * Weight snapshot §3.4: the contributor's trust-level weight at action time
 * (L0 0.25 … L4 5), read once and stored — never rewritten.
 *
 * Quotas §11.4: daily per-account cap (20 normal / 40 trusted) and per-record
 * cap (5) enforced atomically as D1 COUNTs inside the INSERT ... SELECT ...
 * WHERE. The cap check and the write are one SQL statement (no TOCTOU).
 *
 * confirm upsert → refreshes `cameras.last_verified_at = now` (§3.5).
 *
 * After a successful upsert (insert or switch), `evaluateCommunityThresholds`
 * runs to check if the new action has pushed totals over transition thresholds.
 */
export async function setCommunityAction(input: {
  cameraId: number;
  contributorId: number;
  actionType: string;
  now: string;
  env?: unknown;
}): Promise<SetCommunityActionResult> {
  if (!isCommunityActionType(input.actionType)) {
    return { kind: "invalid_action" };
  }
  const actionType = input.actionType;

  const d1 = await getD1();
  const effectiveEnv = input.env ?? env;
  const nowMs = Date.parse(input.now);

  // 1. Camera lookup: must exist and not be demo
  const camera = await d1
    .prepare("SELECT id, contributor_id AS contributorId, status FROM cameras WHERE id = ?")
    .bind(input.cameraId)
    .first<{ id: number; contributorId: number | null; status: string }>();
  if (!camera || camera.status === "demo") return { kind: "camera_not_found" };

  // 2. Self-action gate: like/confirm on own record
  if (camera.contributorId === input.contributorId && (actionType === "like" || actionType === "confirm")) {
    return { kind: "self_action" };
  }

  // 3. Weight snapshot via verified contribution count + trust level
  const activeCount = await verifiedContributionCount(input.contributorId);
  const weight = ACTION_WEIGHT_BY_LEVEL[deriveLevel(activeCount)] ?? 0.25;

  // 4. Quota knobs from cached community settings
  const settings = await getCommunitySettingsCached();
  const maxPerDay = settingsNumber(settings, "quotas.actionsPerDay", 20);
  const maxPerDayTrusted = settingsNumber(settings, "quotas.actionsPerDayTrusted", 40);
  const dailyLimit = activeCount >= 1 ? maxPerDayTrusted : maxPerDay;
  const perRecordCap = settingsNumber(settings, "quotas.perRecordPerDay", 5);

  const windowStartMs = nowMs - 24 * 60 * 60 * 1000;
  const windowStart = new Date(windowStartMs).toISOString();

  // 5. Atomic quota enforcement + upsert in ONE batch (pattern setConfirmation)
  const batch = (await d1.batch([
    // (A) INSERT with quota enforcement
    d1
      .prepare(
        `INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE (SELECT COUNT(*) FROM camera_community_actions WHERE contributor_id = ? AND created_at >= ?) < ?
           AND (SELECT COUNT(DISTINCT contributor_id) FROM camera_community_actions WHERE camera_id = ? AND action_type = ? AND created_at >= ?) < ?
         ON CONFLICT (camera_id, contributor_id) DO NOTHING
         RETURNING id`,
      )
      .bind(
        input.cameraId,
        input.contributorId,
        actionType,
        weight,
        input.now,
        input.now,
        input.contributorId,
        windowStart,
        dailyLimit,
        input.cameraId,
        actionType,
        windowStart,
        perRecordCap,
      ),
    // (B) Probe: existing row (for duplicate / switch detection)
    d1
      .prepare("SELECT action_type AS actionType FROM camera_community_actions WHERE camera_id = ? AND contributor_id = ?")
      .bind(input.cameraId, input.contributorId),
    // (C) Daily quota count (for classification when INSERT fails)
    d1
      .prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE contributor_id = ? AND created_at >= ?")
      .bind(input.contributorId, windowStart),
    // (D) Per-record cap count
    d1
      .prepare("SELECT COUNT(DISTINCT contributor_id) AS n FROM camera_community_actions WHERE camera_id = ? AND action_type = ? AND created_at >= ?")
      .bind(input.cameraId, actionType, windowStart),
  ])) as D1BatchResult[];

  const inserted = (batch[0].results?.[0] as { id?: number } | undefined)?.id;

  if (inserted !== undefined) {
    // 6. confirm → refresh last_verified_at (ADR §3.5)
    if (actionType === "confirm") {
      await d1
        .prepare("UPDATE cameras SET last_verified_at = ?, updated = ? WHERE id = ?")
        .bind(input.now, input.now, input.cameraId)
        .run();
    }

    // 7. Evaluate community thresholds after a successful insert
    try {
      await evaluateCommunityThresholds({ cameraId: input.cameraId, contributorId: input.contributorId, now: input.now, env: effectiveEnv });
    } catch (error) {
      console.error("evaluateCommunityThresholds failed", error);
      // Fail-open: the action is already committed. A threshold
      // evaluation failure must never undo or block the action itself.
    }

    const counts = await communityActionCountsFor([input.cameraId]).then((map) => map.get(input.cameraId) ?? zeroCounts());
    // Public aggregate event (ADR §7.2): the timeline shows the action
    // landing, with the resulting count — never the actor.
    await appendActionLifecycleEvent({ cameraId: input.cameraId, actionType, counts, now: input.now });
    return { kind: "ok", actionType, counts };
  }

  // INSERT produced no row → classify rejection reason (same batch snapshot)
  const existing = batch[1].results?.[0] as { actionType?: string } | undefined;
  if (existing) {
    if (existing.actionType === actionType) return { kind: "duplicate" };
    // Switch: different actionType — UPDATE the row.
    //
    // The per-record cap MUST be enforced here too. The INSERT above (A) is the
    // only statement that carried the quota predicates, so a caller who already
    // owns a row on this camera used to bypass `perRecordCap` entirely by
    // switching action type (like → confirm → gone → …), each switch an
    // unguarded UPDATE. The cap is per (camera, action_type), and the caller is
    // NOT yet counted in the destination bucket, so the same predicate the
    // INSERT uses applies unchanged — enforced atomically inside the UPDATE,
    // with RETURNING to detect the refusal.
    //
    // The daily quota is deliberately NOT re-checked: the row already exists
    // and was counted when it was inserted, so a switch consumes no new daily
    // allowance.
    const oldType = existing.actionType;
    const switched = await d1
      .prepare(
        `UPDATE camera_community_actions SET action_type = ?, weight = ?, updated_at = ?
         WHERE camera_id = ? AND contributor_id = ?
           AND (SELECT COUNT(DISTINCT contributor_id) FROM camera_community_actions WHERE camera_id = ? AND action_type = ? AND created_at >= ?) < ?
         RETURNING id`,
      )
      .bind(
        actionType,
        weight,
        input.now,
        input.cameraId,
        input.contributorId,
        input.cameraId,
        actionType,
        windowStart,
        perRecordCap,
      )
      .all<{ id: number }>();
    if ((switched.results?.length ?? 0) === 0) {
      return { kind: "per_record_cap_exceeded", retryAfterSeconds: windowRetryAfterSeconds(windowStartMs, nowMs) };
    }

    // Log action-changed in moderation_events (internal, not public)
    try {
      const actor = `community:${input.contributorId}`;
      await d1
        .prepare(
          `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, created_at)
           VALUES ('camera', ?, '', '', 'action-changed', 'action-changed', ?, ?, NULL, NULL, 0, 0, NULL, ?)`,
        )
        .bind(
          input.cameraId,
          JSON.stringify({ fromAction: oldType, toAction: actionType, contributorId: input.contributorId }),
          actor,
          input.now,
        )
        .run();
    } catch (error) {
      console.error("action-changed moderation event failed", error);
    }

    // confirm switch → refresh last_verified_at
    if (actionType === "confirm") {
      await d1
        .prepare("UPDATE cameras SET last_verified_at = ?, updated = ? WHERE id = ?")
        .bind(input.now, input.now, input.cameraId)
        .run();
    }

    // Evaluate thresholds after switch
    try {
      await evaluateCommunityThresholds({ cameraId: input.cameraId, contributorId: input.contributorId, now: input.now, env: effectiveEnv });
    } catch (error) {
      console.error("evaluateCommunityThresholds failed after switch", error);
    }

    const counts = await communityActionCountsFor([input.cameraId]).then((map) => map.get(input.cameraId) ?? zeroCounts());
    // Public aggregate event for the NEW action (ADR §7.2): the timeline
    // shows the switch landing, with the resulting count — never the actor.
    await appendActionLifecycleEvent({ cameraId: input.cameraId, actionType, counts, now: input.now });
    return { kind: "switched", actionType, switchedFrom: oldType as CommunityActionType, counts };
  }

  // Neither inserted nor existing → quota exceeded (same batch snapshot)
  const daily = batch[2].results?.[0] as { n?: number } | undefined;
  if (Number(daily?.n ?? 0) >= dailyLimit) {
    return { kind: "daily_quota_exceeded", retryAfterSeconds: windowRetryAfterSeconds(windowStartMs, nowMs) };
  }
  const perRecord = batch[3].results?.[0] as { n?: number } | undefined;
  if (Number(perRecord?.n ?? 0) >= perRecordCap) {
    return { kind: "per_record_cap_exceeded", retryAfterSeconds: windowRetryAfterSeconds(windowStartMs, nowMs) };
  }
  // Unreachable in a consistent snapshot
  return { kind: "daily_quota_exceeded", retryAfterSeconds: windowRetryAfterSeconds(windowStartMs, nowMs) };
}

/**
 * Delete the caller's action on a camera. No threshold evaluation: reversals
 * are only by consensus (ADR §2.2/§6.2), never by subtracting an action.
 */
export async function removeCommunityAction(input: {
  cameraId: number;
  contributorId: number;
}): Promise<RemoveCommunityActionResult> {
  const d1 = await getD1();
  const deleted = await d1
    .prepare("DELETE FROM camera_community_actions WHERE camera_id = ? AND contributor_id = ? RETURNING id")
    .bind(input.cameraId, input.contributorId)
    .first<{ id: number }>();
  if (!deleted) return { kind: "not_found" };
  return { kind: "ok" };
}

/**
 * The caller's own action on a camera (personal state, GET endpoint).
 * Returns the actionType string or null.
 */
export async function getCommunityAction(
  cameraId: number,
  contributorId: number,
): Promise<{ actionType: CommunityActionType } | null> {
  const d1 = await getD1();
  return d1
    .prepare(
      "SELECT action_type AS actionType FROM camera_community_actions WHERE camera_id = ? AND contributor_id = ?",
    )
    .bind(cameraId, contributorId)
    .first<{ actionType: CommunityActionType }>();
}

function zeroCounts(): CommunityActionCounts {
  return { like: 0, confirm: 0, gone: 0, problem: 0, privacy: 0 };
}

/**
 * Append the public aggregate lifecycle event for an action upsert
 * (ADR 0021 §7.2, FASE 3 UI): `liked` / `confirmed` / `gone-flagged` with
 * the distinct-contributor count in the detail — counts only, never
 * attribution. problem/privacy actions deliberately emit NO event here:
 * the ADR's semantic list has no problem/privacy flag type; they surface
 * publicly only when the threshold triggers the `hidden` transition (with
 * the reason in its detail). Fail-open logging: the action is already
 * committed; a lost aggregate event must never roll it back.
 */
async function appendActionLifecycleEvent(input: {
  cameraId: number;
  actionType: string;
  counts: CommunityActionCounts;
  now: string;
}): Promise<void> {
  const eventType =
    input.actionType === "like" ? "liked"
    : input.actionType === "confirm" ? "confirmed"
    : input.actionType === "gone" ? "gone-flagged"
    : null;
  if (eventType === null) return;
  const count = input.counts[input.actionType as keyof CommunityActionCounts] ?? 0;
  const detail = JSON.stringify({ count });
  try {
    const d1 = await getD1();
    await d1
      .prepare("INSERT INTO camera_lifecycle_events (camera_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)")
      .bind(input.cameraId, eventType, detail, input.now)
      .run();
  } catch (error) {
    console.error("appendActionLifecycleEvent failed", error);
  }
}

/**
 * Sum of like weights per camera for the useful sort (ADR §10.1).
 * Returns a Map of camera_id → SUM(weight) for action_type='like'.
 * Separate from communityActionCountsFor because the public payload
 * must never expose weights; this function is ONLY for internal sorting.
 */
export async function likeWeightSumsFor(cameraIds: number[]): Promise<Map<number, number>> {
  if (cameraIds.length === 0) return new Map();
  const d1 = await getD1();
  // Chunks are independent (disjoint id sets, read-only GROUP BY) → issued in
  // parallel instead of one serialized await per chunk.
  const results = new Map<number, number>();
  const chunks: number[][] = [];
  for (let offset = 0; offset < cameraIds.length; offset += 100) {
    chunks.push(cameraIds.slice(offset, offset + 100));
  }
  const chunkRows = await Promise.all(
    chunks.map((chunk) => {
      const placeholders = chunk.map(() => "?").join(", ");
      return d1
        .prepare(
          `SELECT camera_id AS cameraId, COALESCE(SUM(weight), 0) AS sum
         FROM camera_community_actions
         WHERE camera_id IN (${placeholders}) AND action_type = 'like'
         GROUP BY camera_id`,
        )
        .bind(...chunk)
        .all<{ cameraId: number; sum: number }>();
    }),
  );
  for (const rows of chunkRows) {
    for (const row of rows.results) results.set(row.cameraId, row.sum);
  }
  return results;
}

/**
 * Aggregated action counts for a set of cameras in ONE GROUP BY query
 * (no N+1, pattern confirmationCountsFor). Returns a Map of camera_id →
 * { like, confirm, gone, problem, privacy } with COUNT(DISTINCT contributor_id)
 * per action type (ADR §10.2: counts, never weights).
 */
export async function communityActionCountsFor(cameraIds: number[]): Promise<Map<number, CommunityActionCounts>> {
  if (cameraIds.length === 0) return new Map();
  const d1 = await getD1();
  const results = new Map<number, CommunityActionCounts>();
  // D1 caps bound parameters at 100; chunk the IDs. Chunks are independent
  // (disjoint id sets, read-only GROUP BY) → issued in parallel.
  const chunks: number[][] = [];
  for (let offset = 0; offset < cameraIds.length; offset += 100) {
    chunks.push(cameraIds.slice(offset, offset + 100));
  }
  const chunkRows = await Promise.all(
    chunks.map((chunk) => {
      const placeholders = chunk.map(() => "?").join(", ");
      return d1
        .prepare(
          `SELECT camera_id AS cameraId, action_type AS actionType, COUNT(DISTINCT contributor_id) AS count
         FROM camera_community_actions
         WHERE camera_id IN (${placeholders})
         GROUP BY camera_id, action_type`,
        )
        .bind(...chunk)
        .all<{ cameraId: number; actionType: string; count: number }>();
    }),
  );
  for (const rows of chunkRows) {
    for (const row of rows.results) {
      let entry = results.get(row.cameraId);
      if (!entry) {
        entry = zeroCounts();
        results.set(row.cameraId, entry);
      }
      if (row.actionType in entry) {
        (entry as Record<string, number>)[row.actionType] = row.count;
      }
    }
  }
  return results;
}
