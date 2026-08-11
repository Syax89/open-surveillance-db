/**
 * Automated retention sweep (ADR 0004 §3, RETENTION_SCHEDULE.md).
 *
 * Runs as a Cloudflare Worker scheduled handler (see worker/index.ts and the
 * `triggers.crons` binding in wrangler.jsonc) on a daily cadence and enforces
 * the retention schedule that the legal documents define:
 *
 *   R1  pending reports               → hard delete after 90 days (created_at)
 *   R2  rejected reports              → hard delete after 30 days (decision date)
 *   R4  resolved correction requests  → archived in the audit log, then
 *                                       deleted after 2 years (RESOLUTION date)
 *   R7  sessions                      → delete expired / revoked rows
 *   R12 demo records                  → hard-deleted on every sweep outside
 *                                       ENVIRONMENT=development (the demo
 *                                       seed is a LOCAL fixture; there is
 *                                       no time window — the schedule says
 *                                       "purged before public launch")
 *   R15 auth rows                     → expired email-verification tokens
 *                                       (24h TTL) and lapsed WebAuthn
 *                                       challenge rows (10-min TTL) purged
 *                                       on expiry — the cron enforces the
 *                                       sweep the 0027/0028 migrations
 *                                       promised (review round 2 P3-1)
 *   R16 login_attempts                → stale failed-login counters
 *                                       (window_start older than 30 days)
 *                                       purged with a BOUNDED sweep; an
 *                                       active lock (locked_until in the
 *                                       future) is never touched (audit
 *                                       finding 5 / review round P3-10)
 *   R17 registrations_ip_log          → per-IP registration-cap rows older
 *                                       than 30 days purged (QA F5,
 *                                       t_894e0cc3 — the 24h cap COUNT only
 *                                       reads the window; unsalted SHA-256
 *                                       caller keys must not accumulate)
 *   R18 email_send_log                → mail-budget rows older than 24 hours
 *                                       purged (QA F5, t_894e0cc3 — the
 *                                       1-per-5-min budget needs only its
 *                                       window; a 24h floor keeps the sweep
 *                                       conservative)
 *   R21 api_keys                      → dead keys purged 90 days after
 *                                       revoked_at / expires_at (EPIC
 *                                       api-keys, D9 — reads the liveness
 *                                       index, one bounded DELETE)
 *   R5  moderation_events             → 2-YEAR ARCHIVAL PATH (QA#3 F6,
 *                                       t_97e552bf): rows older than
 *                                       MODERATION_EVENT_ARCHIVE_DAYS are
 *                                       copied to `moderation_events_archive`
 *                                       ANONYMIZED (note, actor, reviewer
 *                                       ids → NULL; the decision structure
 *                                       survives), marked `archived_at` and
 *                                       purged from the live table, one
 *                                       atomic batch per chunk. Migration
 *                                       0034 re-created the append-only
 *                                       triggers to admit exactly this
 *                                       transition.
 *
 * Deliberately NOT purged here:
 *   - Record STATUS TRANSITIONS. ADR 0021 § 2.2 (community-driven pivot):
 *     no state transition happens on a timer — `active`/`hidden`/`removed`
 *     are driven only by community actions or admin-legal emergencies. The
 *     old freshness sweep (verified → needs_review → stale) and the 6-month
 *     unverified removal (former R3) are RETIRED and are NOT run here; the
 *     community thresholds (confirm/gone/problem/privacy) are the only
 *     transition engine (db/community-actions.ts).
 *   - (none — R5 now has an archival path; the archive table itself is
 *    append-only by convention and has no retention of its own.)
 *
 * Design notes:
 *  - The windows are FIXED legal values (RETENTION_SCHEDULE.md, ADR 0008):
 *    there is deliberately NO env knob to override them — an env override
 *    could silently extend a legally defined retention window.
 *  - `cameras.updated` holds a human note, not a timestamp — so the R2
 *    "rejection decision date" is anchored on the moderation event
 *    (action='reject'), with `created_at` as fallback for legacy rows.
 *    The R4 "resolution date" is `correction_requests.resolved_at` (set by
 *    moderateCorrection on the approve/reject transition, backfilled by
 *    migration 0018), with `created_at` as documented fallback for legacy
 *    rows; R4 also ARCHIVES the request (an append-only audit event) in the
 *    same batch as the delete, per RETENTION_SCHEDULE.md R4 art. 5(2).
 *  - R1/R2 hard-deletes skip records with an OPEN APPEAL (moderation_appeals
 *    status pending/escalated — MODERATION_SLA §4/S5) or an ACTIVE LEGAL HOLD
 *    (audit event action='legal-hold' with no later 'legal-hold-release' —
 *    RETENTION_SCHEDULE.md §2). The hold convention is documented at
 *    HOLD_EXCLUSION_SQL below.
 *  - Destructive D1 work is done in `d1.batch(...)` transactions so a record
 *    and its queue items are removed atomically.
 *  - Every per-record loop is isolated: a single record/chunk that fails is
 *    counted in `summary.failures` and skipped, so one bad row can never
 *    abort the whole sweep and block it forever (re-failing every day).
 *  - `now` is injectable for deterministic tests;
 *    injectable so tests can assert object deletion without a binding.
 */

import { env } from "cloudflare:workers";
import { getD1 } from "./cameras";
import { sweepExpiredWebAuthnChallenges } from "./passkeys";

// ---------------------------------------------------------------------------
// Policy constants (RETENTION_SCHEDULE.md / ADR 0004)
// ---------------------------------------------------------------------------

/** R1: non-verified `pending` reports expire after 90 days from submission. */
export const PENDING_RETENTION_DAYS = 90;
/** R2: `rejected` reports expire after 30 days from the rejection decision. */
export const REJECTED_RETENTION_DAYS = 30;
/** R4: resolved correction/takedown requests are kept 2 years. */
export const CORRECTION_RETENTION_DAYS = 730;
/** R16: a failed-login counter row is dead after 30 days of inactivity. */
export const LOGIN_ATTEMPT_RETENTION_DAYS = 30;
/** QA F5: per-IP registration log rows are dead after 30 days (specular to R16). */
export const REGISTRATION_IP_RETENTION_DAYS = 30;
/** QA F5: email send-log rows are dead after 24 hours (the 1-per-5-min mail budget needs only its window; a 24h floor keeps the sweep conservative). */
export const EMAIL_SEND_LOG_RETENTION_DAYS = 1;
/**
 * R21 (EPIC api-keys, D9): an API key row is dead after it is soft-revoked
 * (`revoked_at`) or hard-expired (`expires_at`), and the metadata row is
 * purged 90 days after it died. The key is the contributor's own data
 * (art. 17) and the gate rejects dead rows forever (no un-revoke, no
 * renewal) — a dead hash can never authenticate again, so the row is pure
 * garbage collection once the window elapses.
 */
export const API_KEY_RETENTION_DAYS = 90;
/**
 * R5 (QA#3 F6): moderation decisions are archived after 2 years — the same
 * legal window as R4 correction requests (CORRECTION_RETENTION_DAYS, the
 * RETENTION_SCHEDULE "2 years" default). The sweep copies the row to
 * `moderation_events_archive` (anonymized) and deletes it from the live
 * table; the archive itself is append-only.
 */
export const MODERATION_EVENT_ARCHIVE_DAYS = 730;

/**
 * R16 sweep bounds: each round selects and deletes at most D1_MAX_BOUND_PARAMS
 * keys, and the loop runs at most this many rounds, so one daily run touches
 * at most 100 × 100 = 10 000 rows and no single statement is unbounded. Rows
 * left behind (a pathological flood between rounds) are picked up by the next
 * daily run.
 */
export const LOGIN_ATTEMPT_SWEEP_MAX_ROUNDS = 100;

/**
 * Cloudflare D1 caps bound parameters at 100 per query. Any `WHERE ... IN (?)`
 * built from user-collected ids must be chunked to this size (see the R16
 * login-attempt deletion below).
 */
export const D1_MAX_BOUND_PARAMS = 100;

export type RetentionPolicy = {
  pendingDays: number;
  rejectedDays: number;
  correctionDays: number;
  /** R16: failed-login counters (login_attempts) expire after this many days of inactivity. */
  loginAttemptDays: number;
  /** QA F5: per-IP registration log rows (registrations_ip_log) expire after this many days. */
  registrationsIpDays: number;
  /** QA F5: email send-log rows (email_send_log) expire after this many days. */
  emailSendLogDays: number;
  /** R21: API keys (api_keys) are purged 90 days after revoked_at / expires_at (EPIC api-keys, D9). */
  apiKeyDays: number;
  /** R5 (QA#3 F6): moderation decisions are archived after this many days. */
  moderationEventArchiveDays: number;
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  pendingDays: PENDING_RETENTION_DAYS,
  rejectedDays: REJECTED_RETENTION_DAYS,
  correctionDays: CORRECTION_RETENTION_DAYS,
  loginAttemptDays: LOGIN_ATTEMPT_RETENTION_DAYS,
  registrationsIpDays: REGISTRATION_IP_RETENTION_DAYS,
  emailSendLogDays: EMAIL_SEND_LOG_RETENTION_DAYS,
  apiKeyDays: API_KEY_RETENTION_DAYS,
  moderationEventArchiveDays: MODERATION_EVENT_ARCHIVE_DAYS,
};

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type RetentionSummary = {
  now: string;
  policy: RetentionPolicy;
  /** R1: pending reports hard-deleted with their evidence. */
  pendingPurged: number;
  /** R2: rejected reports hard-deleted with their evidence. */
  rejectedPurged: number;
  /** R4: resolved correction requests older than 2 years. */
  correctionsPurged: number;
  /** R7: expired/revoked session rows removed. */
  sessionsPurged: number;
  /** R15: expired email-verification token rows removed (24h TTL, cron sweep). */
  emailTokensPurged: number;
  /** R15: expired WebAuthn challenge rows removed (10-min TTL, centralized in the cron). */
  challengesPurged: number;
  /** R16: stale failed-login counter rows removed (30-day window, bounded sweep). */
  loginAttemptsPurged: number;
  /** QA F5: per-IP registration log rows older than the cap window removed (30 days). */
  registrationIpLogPurged: number;
  /** QA F5: email send-log rows older than the mail budget window removed (24 hours). */
  /**
   * R12: `demo` records hard-deleted (with their evidence) on every sweep
   * outside ENVIRONMENT=development — the demo seed is a LOCAL fixture and
   * the schedule says "purged before public launch" (no time window).
   */
  demoRecordsPurged: number;
  emailSendLogPurged: number;
  /** R21: dead API-key rows purged 90 days after revoked_at / expires_at (EPIC api-keys, D9). */
  apiKeysPurged: number;
  /** R5 (QA#3 F6): moderation decisions archived to `moderation_events_archive` (anonymized). */
  moderationEventsArchived: number;
  /** R5: archived moderation rows purged from the live append-only table. */
  moderationEventsPurged: number;
  /** Rows/chunks whose D1 step threw; the sweep skipped them and continued. */
  failures: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(nowIso: string, days: number): string {
  return new Date(Date.parse(nowIso) - days * 86_400_000).toISOString();
}

type D1 = Awaited<ReturnType<typeof getD1>>;

/**
 * SQL fragment appended to the R1/R2 camera SELECTs (whose FROM alias is `c`):
 * skip records with an open appeal or an active legal hold, so a hard delete
 * can never destroy data that the law still protects.
 *
 *  - Open appeal: a `moderation_appeals` row for the camera still `pending`
 *    or `escalated` (not finally decided). MODERATION_SLA §4/S5: an appeal can
 *    be filed up to 30 days after the decision and decided up to 14 days
 *    later, so an appeal can still be open when the R2 sweep fires at
 *    decision+30 days; purging then would destroy the record and its evidence
 *    irreversibly before the appeal is decided.
 *  - Active legal hold: an audit event `action='legal-hold'` for the camera
 *    with no later `action='legal-hold-release'` event. RETENTION_SCHEDULE.md
 *    §2: "Any pending litigation, complaint, or supervisory-authority inquiry
 *    suspends the relevant deletions until the matter is closed. The hold, its
 *    scope and its end date are recorded in the audit log." The audit trail is
 *    the only hold registry in the schema; a hold is raised (and later
 *    released) by ops writing those events on the append-only log.
 */
const HOLD_EXCLUSION_SQL = `
  AND NOT EXISTS (
    SELECT 1 FROM moderation_appeals a
    WHERE a.entity = 'camera' AND a.entity_id = c.id
      AND a.status IN ('pending', 'escalated')
  )
  AND NOT EXISTS (
    SELECT 1 FROM moderation_events lh
    WHERE lh.entity = 'camera' AND lh.entity_id = c.id
      AND lh.action = 'legal-hold'
      AND NOT EXISTS (
        SELECT 1 FROM moderation_events lhr
        WHERE lhr.entity = 'camera' AND lhr.entity_id = c.id
          AND lhr.action = 'legal-hold-release'
          AND lhr.created_at >= lh.created_at
      )
  )`;

/**
 * Hard-delete a camera record and its open queue items, in one atomic batch.
 * Returns whether the record was removed (the caller counts it).
 */
async function purgeCameraRecord(
  d1: D1,
  cameraId: number,
  nowIso: string,
): Promise<void> {
  await d1.batch([
    d1.prepare("UPDATE moderation_queue SET state = 'closed', updated_at = ? WHERE entity = 'camera' AND entity_id = ? AND state != 'closed'").bind(nowIso, cameraId),
    d1.prepare("DELETE FROM cameras WHERE id = ?").bind(cameraId),
  ]);
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

/**
 * Run the full retention sweep. `now` defaults to the current instant and is
 * injectable for deterministic tests.
 */
export async function runRetentionSweep(
  now: string = new Date().toISOString(),
  options: { policy?: RetentionPolicy } = {},
): Promise<RetentionSummary> {
  const d1 = await getD1();
  const policy = options.policy ?? DEFAULT_RETENTION_POLICY;

  const summary: RetentionSummary = {
    now,
    policy,
    pendingPurged: 0,
    rejectedPurged: 0,
    correctionsPurged: 0,
    sessionsPurged: 0,
    emailTokensPurged: 0,
    challengesPurged: 0,
    loginAttemptsPurged: 0,
    registrationIpLogPurged: 0,
    demoRecordsPurged: 0,
    emailSendLogPurged: 0,
    apiKeysPurged: 0,
    moderationEventsArchived: 0,
    moderationEventsPurged: 0,
    failures: 0,
  };

  // --- R12 (ADR 0008 demo gate, audit CTO #7 / t_d7a4b99b): `demo` records
  // are prototype-only and must be purged before public launch
  // (RETENTION_SCHEDULE.md R12: "Fictional, clearly labelled content; not
  // personal data"). scripts/demo-cameras.sql is the ONLY place demo data is
  // created and migration 0017 removed the demo identities but NOT the demo
  // cameras, so a DB that was ever seeded (or promoted from dev) still holds
  // the illustrative rows. The fail-closed gate demoRecordsPublic()
  // (db/cameras.ts) hides them from every public surface, but hiding is not
  // deleting — the sweep hard-deletes each `demo` record WITH its evidence
  // (R6) and closes its queue items, reusing purgeCameraRecord so the
  // destructive work stays one atomic d1.batch (same law of R1/R2).
  // The env guard mirrors demoRecordsPublic() EXACTLY: only the exact value
  // "development" keeps the illustrative rows; unset or any other value
  // behaves as production (fail-closed, worker-configuration.d.ts). There is
  // deliberately NO time window and NO hold/appeal exemption: the schedule
  // says "purged before public launch" and demo rows are fictional content,
  // not real data under legal protection.
  if (env.ENVIRONMENT !== "development") {
    const demos = await d1
      .prepare("SELECT id FROM cameras WHERE status = 'demo'")
      .all<{ id: number }>();
    for (const { id } of demos.results) {
      try {
        await purgeCameraRecord(d1, id, now);
        summary.demoRecordsPurged += 1;
      } catch (error) {
        summary.failures += 1;
        console.error(`Retention: R12 demo purge failed for camera ${id}`, error);
      }
    }
  }

  // --- R1: pending reports not verified within 90 days → hard delete + evidence.
  // Records under an open appeal or an active legal hold are exempt
  // (HOLD_EXCLUSION_SQL): a hard delete is irreversible, so the law-first rule
  // is to skip and retry on a later run.
  const pendingCutoff = daysAgo(now, policy.pendingDays);
  const pending = await d1
    .prepare(
      `SELECT c.id FROM cameras c
       WHERE c.status = 'pending' AND c.created_at < ?${HOLD_EXCLUSION_SQL}`,
    )
    .bind(pendingCutoff)
    .all<{ id: number }>();
  for (const { id } of pending.results) {
    try {
      await purgeCameraRecord(d1, id, now);
      summary.pendingPurged += 1;
    } catch (error) {
      summary.failures += 1;
      console.error(`Retention: R1 purge failed for camera ${id}`, error);
    }
  }

  // --- R2: rejected reports expire 30 days after the rejection decision.
  // The decision date is the latest moderation event with action='reject';
  // legacy rows without an event fall back to created_at. Records under an
  // open appeal (filed up to decision+30d, decided up to +14d later per
  // MODERATION_SLA S5) or an active legal hold are exempt: the purge must not
  // destroy record + evidence while the appeal/hold is still open.
  const rejectedCutoff = daysAgo(now, policy.rejectedDays);
  const rejected = await d1
    .prepare(
      `SELECT c.id
      FROM cameras c
      LEFT JOIN (
        SELECT entity_id, MAX(created_at) AS decided_at
        FROM moderation_events
        WHERE entity = 'camera' AND action = 'reject'
        GROUP BY entity_id
      ) e ON e.entity_id = c.id
      WHERE c.status = 'rejected'
        AND COALESCE(e.decided_at, c.created_at) < ?${HOLD_EXCLUSION_SQL}`,
    )
    .bind(rejectedCutoff)
    .all<{ id: number }>();
  for (const { id } of rejected.results) {
    try {
      await purgeCameraRecord(d1, id, now);
      summary.rejectedPurged += 1;
    } catch (error) {
      summary.failures += 1;
      console.error(`Retention: R2 purge failed for camera ${id}`, error);
    }
  }

  // --- R4: resolved correction requests are archived, then deleted, 2 years
  // after the RESOLUTION date (RETENTION_SCHEDULE.md R4: "2 years, Resolution
  // date" + "archive the entry in the internal audit log, then delete").
  // The anchor is resolved_at (set by moderateCorrection on the approve/reject
  // transition, backfilled by migration 0018 from the decision event); rows
  // without it fall back to created_at, the documented derogation for legacy
  // requests resolved before the column existed (same fallback pattern as the
  // R2/R6 legacy rows). A created_at anchor would purge BEFORE the legal floor
  // — created_at always precedes the resolution date. Only terminal states are
  // swept ('reviewed', 'rejected'): escalated requests stay 'pending' (not yet
  // resolved) and open requests are never touched.
  const correctionCutoff = daysAgo(now, policy.correctionDays);
  const corrections = await d1
    .prepare(
      `SELECT id, status, resolved_at AS resolvedAt
       FROM correction_requests
       WHERE status IN ('reviewed', 'rejected')
         AND COALESCE(resolved_at, created_at) < ?`,
    )
    .bind(correctionCutoff)
    .all<{ id: number; status: string; resolvedAt: string | null }>();
  for (const correction of corrections.results) {
    try {
      // Archive step (art. 5(2)): write an append-only audit event in the SAME
      // batch as the delete, so the purge cannot leave a gap in the trail.
      // The decision event (approve/reject) carries the resolution itself;
      // this event records the purge and its trigger, keeping the 2-year
      // accountability trail complete after the row is gone.
      await d1.batch([
        d1
          .prepare(
            "INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, appeal_id, created_at) VALUES ('correction', ?, ?, 'archived', 'archive', 'other', ?, 'Retention sweep', NULL, NULL, 0, 0, NULL, NULL, ?)",
          )
          .bind(
            correction.id,
            correction.status,
            `Correction request ${correction.id} purged under R4 (2-year retention from resolution date ${correction.resolvedAt ?? "unknown (legacy row)"}); archived before delete per RETENTION_SCHEDULE.md R4.`,
            now,
          ),
        d1.prepare("DELETE FROM correction_requests WHERE id = ?").bind(correction.id),
      ]);
      summary.correctionsPurged += 1;
    } catch (error) {
      summary.failures += 1;
      console.error(`Retention: R4 archive+delete failed for correction ${correction.id}`, error);
    }
  }

  // --- R7: dead session rows (expired or revoked) are pure garbage collection.
  const sessions = await d1
    .prepare("DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL")
    .bind(now)
    .run() as { meta: { changes: number } };
  summary.sessionsPurged = sessions.meta.changes;

  // --- R15 (ADR 0020): expired auth-method rows are garbage collection too.
  // The 0027/0028 migrations promised an expiry sweep served by the
  // `expires_at` index; the cron is where that promise is enforced
  // (review round 2 P3-1). Email-verification tokens die 24h after issue
  // (R15: "deleted on use or expiry"); WebAuthn challenges after 10 minutes.
  // Both tables are TTL-bounded and small, so a single bounded DELETE is
  // enough — no chunking needed (the R7 session sweep follows the same
  // pattern). Failures are deliberately NOT counted here: a broken sweep
  // run is logged by the worker's scheduled handler and retried next run;
  // the rows are inert (lookups reject expired rows at read time), so a
  // failed sweep never breaks the request path.
  const emailTokens = (await d1
    .prepare("DELETE FROM email_verification_tokens WHERE expires_at < ?")
    .bind(now)
    .run()) as { meta: { changes: number } };
  summary.emailTokensPurged = emailTokens.meta.changes;

  // The WebAuthn challenge sweep already lives in db/passkeys.ts (exported,
  // TTL-bounded, `now`-injectable) and runs opportunistically on each begin
  // ceremony; the cron call below centralizes it so challenges are swept
  // even when no ceremony ever starts (the 10-minute TTL keeps the table
  // small, but the guarantee must not depend on traffic).
  summary.challengesPurged = await sweepExpiredWebAuthnChallenges(now);

  // --- R16 (audit finding 5 / review round P3-10): stale failed-login counters
  // are dead rows after LOGIN_ATTEMPT_RETENTION_DAYS of inactivity. The anchor
  // is `window_start`: recordFailedLogin (db/auth.ts) re-anchors it on every
  // new failure window and on every lock trip, and clearLoginAttempts deletes
  // the row on a successful login — so a row whose window_start is older than
  // the window is an abandoned counter (enumeration attempts against emails
  // that never log in, or counters never cleared). Rows are hash-only by
  // design (SHA-256 email key, migration 0016) but still grow the table
  // unboundedly, which is the audit finding.
  // The sweep is BOUNDED: each round selects at most D1_MAX_BOUND_PARAMS keys
  // (which is also the D1 bound-parameter cap, so the DELETE always fits one
  // statement) and deletes them, keeping memory O(batch) with no unbounded
  // statement; the loop is capped at LOGIN_ATTEMPT_SWEEP_MAX_ROUNDS so a
  // pathological flood of new rows cannot make one cron run spin forever
  // (rows left behind are picked up by the next daily run).
  // NEVER touch a row whose `locked_until` is still in the future: deleting
  // an ACTIVE lock would hand the attacker a fresh counter and silently
  // disable the lockout — the sweep must not weaken security, whatever the
  // lockout cap is set to.
  const loginAttemptCutoff = daysAgo(now, policy.loginAttemptDays);
  let loginAttemptsPurged = 0;
  for (let round = 0; round < LOGIN_ATTEMPT_SWEEP_MAX_ROUNDS; round += 1) {
    const stale = await d1
      .prepare(
        `SELECT email_key AS emailKey
         FROM login_attempts
         WHERE window_start < ? AND (locked_until IS NULL OR locked_until < ?)
         LIMIT ${D1_MAX_BOUND_PARAMS}`,
      )
      .bind(loginAttemptCutoff, now)
      .all<{ emailKey: string }>();
    if (stale.results.length === 0) break;
    const keys = stale.results.map((row) => row.emailKey);
    try {
      const placeholders = keys.map(() => "?").join(", ");
      await d1
        .prepare(`DELETE FROM login_attempts WHERE email_key IN (${placeholders})`)
        .bind(...keys)
        .run();
      loginAttemptsPurged += keys.length;
    } catch (error) {
      summary.failures += 1;
      console.error(
        `Retention: R16 chunk delete failed for ${keys.length} login_attempts rows`,
        error,
      );
      break; // stop the loop; the surviving rows are retried by the next run
    }
  }
  summary.loginAttemptsPurged = loginAttemptsPurged;

  // --- QA F5: registrations_ip_log (per-IP registration cap state) and
  // email_send_log (mail budget state) are dead rows after their window.
  // The cap COUNT and the mail budget admission only read rows inside their
  // window (24h / 5 min); older rows are inert yet accumulate forever, and
  // the registration log additionally stores unsalted SHA-256 caller keys
  // that the project's data-minimisation policy should not keep indefinitely.
  // REGISTRATION_IP_RETENTION_DAYS (30) is specular to R16; the mail log is
  // purged after EMAIL_SEND_LOG_RETENTION_DAYS (1) — the 5-minute budget
  // needs only its window, a 24h floor keeps the sweep conservative. Both
  // tables are TTL-bounded and small, so a single bounded DELETE per table
  // is enough (same pattern as the R7/R15 sweeps); a broken sweep is logged
  // by the scheduled handler and retried next run.
  const registrationIpLogCutoff = daysAgo(now, policy.registrationsIpDays);
  const registrationIpPurged = (await d1
    .prepare("DELETE FROM registrations_ip_log WHERE created_at < ?")
    .bind(registrationIpLogCutoff)
    .run()) as { meta: { changes: number } };
  summary.registrationIpLogPurged = registrationIpPurged.meta.changes;

  const emailSendLogCutoff = daysAgo(now, policy.emailSendLogDays);
  const emailSendLogPurged = (await d1
    .prepare("DELETE FROM email_send_log WHERE sent_at < ?")
    .bind(emailSendLogCutoff)
    .run()) as { meta: { changes: number } };
  summary.emailSendLogPurged = emailSendLogPurged.meta.changes;

  // --- R21 (EPIC api-keys, D9): dead API-key rows are garbage collection
  // after 90 days. A key dies at soft-revoke (`revoked_at` — permanent,
  // there is no un-revoke, and the gate rejects the row forever) or at hard
  // expiry (`expires_at`, NULL = never) — whichever came first. The row is
  // metadata-only (SHA-256 hash, display prefix, scopes), but it is still
  // the contributor's own data (art. 17) and, once dead, the liveness index
  // can never serve it again. The predicate reads `api_keys_liveness_idx`
  // (revoked_at, expires_at) as ONE bounded DELETE — the table is capped
  // per contributor at mint (D5) and shrinks with account erasure, so
  // (unlike login_attempts) it cannot be flooded; a broken sweep is logged
  // by the scheduled handler and retried next run (R17 pattern).
  const apiKeyCutoff = daysAgo(now, policy.apiKeyDays);
  const apiKeysPurged = (await d1
    .prepare(
      `DELETE FROM api_keys
       WHERE (revoked_at IS NOT NULL AND revoked_at < ?)
          OR (expires_at IS NOT NULL AND expires_at < ?)`,
    )
    .bind(apiKeyCutoff, apiKeyCutoff)
    .run()) as { meta: { changes: number } };
  summary.apiKeysPurged = apiKeysPurged.meta.changes;

  // --- R5 (QA#3 F6): moderation decisions older than the 2-year window are
  // ARCHIVED then purged. The live table is append-only by design (migration
  // 0008 triggers), so this sweep is the ONLY writer that may mutate it, and
  // only through the archival transition migration 0034 admits:
  //   1. copy the row to `moderation_events_archive`, ANONYMIZED — `note`
  //      (free-text, may hold personal data), `actor` and the reviewer ids
  //      are copied as NULL, so the archive keeps WHAT was decided (entity,
  //      action, statuses, reason code, role, timestamps, appeal link)
  //      without the WHO or the notes (RETENTION_SCHEDULE R5, art. 5(1)(e));
  //   2. mark the live row `archived_at = now` (the trigger permits exactly
  //      the NULL → timestamp transition);
  //   3. delete the archived row (the trigger permits deleting only rows
  //      with archived_at set).
  // Steps 1-3 run in ONE d1.batch per chunk, so a row is either fully
  // archived (present in the archive, gone from the live table) or fully
  // untouched — a failure rolls back the whole chunk and the next daily run
  // retries it. The sweep is BOUNDED like R16: at most D1_MAX_BOUND_PARAMS
  // rows per round (also the D1 bound-parameter cap) and
  // LOGIN_ATTEMPT_SWEEP_MAX_ROUNDS rounds, so a pathological backlog drains
  // across days instead of pinning one cron run forever.
  const moderationEventCutoff = daysAgo(now, policy.moderationEventArchiveDays);
  let moderationEventsArchived = 0;
  let moderationEventsPurged = 0;
  for (let round = 0; round < LOGIN_ATTEMPT_SWEEP_MAX_ROUNDS; round += 1) {
    const staleEvents = await d1
      .prepare(
        "SELECT id FROM moderation_events WHERE created_at < ? AND archived_at IS NULL LIMIT ?",
      )
      .bind(moderationEventCutoff, D1_MAX_BOUND_PARAMS)
      .all<{ id: number }>();
    if (staleEvents.results.length === 0) break;
    const ids = staleEvents.results.map((row) => row.id);
    const placeholders = ids.map(() => "?").join(", ");
    try {
      await d1.batch([
        // 1. Anonymized copy (note/actor/reviewer ids → NULL; the archive's
        //    own archived_at is the sweep timestamp).
        d1
          .prepare(
            `INSERT INTO moderation_events_archive
               (id, entity, entity_id, previous_status, new_status, action, reason_code,
                note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id,
                appeal_id, created_at, archived_at)
             SELECT id, entity, entity_id, previous_status, new_status, action, reason_code,
                NULL, NULL, NULL, actor_role, recused, escalated, NULL,
                appeal_id, created_at, ?
             FROM moderation_events WHERE id IN (${placeholders})`,
          )
          .bind(now, ...ids),
        // 2. Mark archived (the ONLY UPDATE the 0034 trigger permits).
        d1
          .prepare(`UPDATE moderation_events SET archived_at = ? WHERE id IN (${placeholders})`)
          .bind(now, ...ids),
        // 3. Purge the archived row (the ONLY DELETE the 0034 trigger permits).
        d1.prepare(`DELETE FROM moderation_events WHERE id IN (${placeholders})`).bind(...ids),
      ]);
      moderationEventsArchived += ids.length;
      moderationEventsPurged += ids.length;
    } catch (error) {
      summary.failures += 1;
      console.error(
        `Retention: R5 archive+purge failed for ${ids.length} moderation_events rows`,
        error,
      );
      break; // stop the loop; the surviving rows are retried by the next run
    }
  }
  summary.moderationEventsArchived = moderationEventsArchived;
  summary.moderationEventsPurged = moderationEventsPurged;

  return summary;
}
