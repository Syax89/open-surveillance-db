// OSDB-QA retention contract tests (kanban t_ff40be8d, audit t_0de37378;
// re-pinned to the community model 2026-08-05, ADR 0021 / t_499df642).
//
// Pins the retention contract AS IT EXISTS TODAY, in three layers:
//   1. POLICY DOCS — the legal retention schedule (ADR 0021 decision +
//      docs/legal/RETENTION_SCHEDULE.md) is machine-checkable so the
//      documented values cannot drift unnoticed (community model: no
//      time-based record retention; `active`/`hidden`/`removed` states;
//      photo states 90/30 days; 30d session TTL).
//   2. IMPLEMENTED RUNTIME CONTRACT — ADR 0021 § 2.2: no state transition on
//      a timer. The pre-pivot 12-month review clock and the freshness sweep
//      (runFreshnessSweep) are REMOVED from the code; the retention cron
//      deletes data whose retention elapsed, it never pushes records through
//      lifecycle states. The sessions table (expires_at NOT NULL + index) and
//      the read-time expiry rejection in db/auth.ts are the pieces that remain
//      unchanged.
//   3. AUTOMATED PURGE CONTRACT (implemented in PR #87) — the worker
//      exposes a `scheduled` handler, wrangler.jsonc declares the daily
//      cron trigger, and db/retention.ts runs the R12-R18 sweep. These
//      positive assertions pin the automation that replaced the old
//      KNOWN GAP (worker was fetch-only, no triggers, no retention.ts).
//      Runtime behaviour of the sweep itself is covered by
//      tests/retention.test.mjs; this file pins the wiring contract.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Policy documents
// ---------------------------------------------------------------------------

test("ADR 0021 retires the timer-driven freshness cycle; ADR 0008's precision/contact decisions stand", async () => {
  const adr21 = await readSource("docs/decisions/0021-community-driven-pivot.md");
  const adr8 = await readSource("docs/decisions/0008-data-licence-precision-retention-contact.md");

  // ADR 0021 § 2.2: no state transition happens on a timer — the old
  // verified → needs_review → stale freshness sweep is retired.
  assert.match(
    adr21,
    /No transition happens on a timer\./,
    "ADR 0021 must pin the no-timer-transitions rule (§ 2.2)",
  );
  assert.match(
    adr21,
    /freshness sweep[\s\S]*?is retired/,
    "ADR 0021 must retire the verified → needs_review → stale freshness sweep",
  );
  assert.match(
    adr21,
    /nothing changes status[\s\S]*?without community \(or admin-legal\) action/,
    "ADR 0021 must pin that status changes require community/admin-legal action, never a timer",
  );
  // ADR 0008 decisions that remain live: ~4-decimal publication precision.
  assert.match(
    adr8,
    /~4 decimal places by default/,
    "ADR 0008 must still pin ~4-decimal publication precision",
  );
});

test("RETENTION_SCHEDULE.md pins R1/R2/R3/R7 values matching the community-model contract", async () => {
  const schedule = await readSource("docs/legal/RETENTION_SCHEDULE.md");

  // R1 — active records have no time-based retention (ADR 0021 § 9.3); no transition on a timer.
  assert.match(
    schedule,
    /R1 \| `active` record[\s\S]*?\*\*No time-based retention\*\*/,
    "R1 must pin no time-based retention for active records",
  );
  assert.match(
    schedule,
    /no transition on a timer \(\§ 2\.2\)/,
    "R1 must pin that no transition happens on a timer",
  );
  // R2 — hidden records: reversible, no automatic deletion on a timer.
  assert.match(
    schedule,
    /R2 \| `hidden` record[\s\S]*?\*\*No automatic deletion on a timer\*\*/,
    "R2 must pin no automatic timer deletion for hidden records",
  );
  // R3 — removed records: reversible, no automatic deletion on a timer.
  assert.match(
    schedule,
    /R3 \| `removed` record[\s\S]*?\*\*No automatic deletion on a timer\*\*/,
    "R3 must pin no automatic timer deletion for removed records",
  );
  // R7 — sessions expire 30 days after issue (matches AUTH_SESSION_TTL_DAYS default).
  assert.match(
    schedule,
    /sessions \*\*30 days\*\* after issue or immediately on logout\/revocation/,
    "R7 must pin the 30-day session lifetime (ADR 0013)",
  );
});

// ---------------------------------------------------------------------------
// 2. Implemented runtime contract
// ---------------------------------------------------------------------------

test("ADR 0021 § 2.2 is implemented: no timer-driven review clock or freshness sweep in the code", async () => {
  const freshness = await readSource("db/freshness.ts");
  const moderation = await readSource("db/moderation.ts");
  const retention = await readSource("db/retention.ts");

  // The retirement is implemented, not just documented: the pre-pivot
  // 12-month review clock constant and the scheduled-expiry sweep are gone
  // from the code, and the retention cron no longer transitions records
  // (it deletes data whose retention elapsed, nothing else).
  assert.doesNotMatch(
    freshness,
    /DEFAULT_REVIEW_INTERVAL_MONTHS\s*=\s*12/,
    "the pre-pivot 12-month review clock must be removed from db/freshness.ts",
  );
  assert.doesNotMatch(
    moderation,
    /export async function runFreshnessSweep/,
    "runFreshnessSweep must no longer be exported from the moderation boundary",
  );
  assert.doesNotMatch(
    retention,
    /runFreshnessSweep/,
    "the retention cron must no longer invoke the freshness sweep",
  );
  assert.doesNotMatch(
    retention,
    /status\s+IN\s*\(\s*'needs_review',\s*'stale'\s*\)|unverifiedRemoved|UNVERIFIED_REMOVAL_MONTHS/,
    "the 6-month unverified removal (former R3) must be gone from the retention cron",
  );
});

test("sessions schema pins expires_at NOT NULL with an index, and auth rejects expired at read time", async () => {
  const schema = await readSource("db/schema.ts");
  const auth = await readSource("db/auth.ts");

  assert.match(
    schema,
    /expiresAt:\s*text\("expires_at"\)\.notNull\(\)/,
    "sessions.expires_at must be NOT NULL so every session has a hard expiry",
  );
  assert.match(
    schema,
    /index\("sessions_expires_idx"\)\.on\(table\.expiresAt\)/,
    "an index on expires_at must exist so a future cleanup job can scan expired sessions",
  );
  assert.match(
    auth,
    /if\s*\(\s*row\.expiresAt\s*<=\s*now\s*\)\s*return\s+null/,
    "the session lookup must reject expired sessions at read time (defence in depth, auth-d1)",
  );
});

// ---------------------------------------------------------------------------
// 3. Automated purge contract (PR #87 — replaced the KNOWN GAP)
// ---------------------------------------------------------------------------

test("the worker exposes a scheduled handler wired to the retention sweep", async () => {
  const worker = await readSource("worker/index.ts");
  const retention = await readSource("db/retention.ts");

  assert.match(
    worker,
    /async scheduled\(/,
    "the worker must expose a scheduled handler so the cron trigger runs the sweep",
  );
  assert.match(
    worker,
    /runRetentionSweep/,
    "the scheduled handler must invoke the retention sweep",
  );
  assert.match(
    worker,
    /DEFAULT_RETENTION_POLICY/,
    "the scheduled handler must use the fixed legal policy (no env override for retention windows)",
  );
  assert.match(
    worker,
    /waitUntil\(/,
    "the sweep must run inside waitUntil so it never blocks the request path",
  );
  assert.match(
    retention,
    /export async function runRetentionSweep/,
    "db/retention.ts must export the sweep entry point",
  );
});

test("wrangler.jsonc declares the daily cron trigger and the PHOTOS bucket binding", async () => {
  const wrangler = await readSource("wrangler.jsonc");

  assert.match(
    wrangler,
    /"crons":\s*\["0 3 \* \* \*"\]/,
    "the retention sweep must run daily at 03:00 UTC",
  );
  assert.match(
    wrangler,
    /"r2_buckets"/,
    "the worker must bind the PHOTOS R2 bucket so evidence objects are purged",
  );
  assert.match(
    wrangler,
    /"binding":\s*"PHOTOS"/,
    "the PHOTOS binding name must match worker/index.ts Env.PHOTOS",
  );
});

test("R15: the retention sweep purges expired email tokens and lapsed WebAuthn challenges (P3-1)", async () => {
  const retention = await readSource("db/retention.ts");

  assert.match(
    retention,
    /DELETE FROM email_verification_tokens WHERE expires_at < \?/,
    "expired email-verification tokens must be swept by the retention cron (R15)",
  );
  assert.match(
    retention,
    /sweepExpiredWebAuthnChallenges/,
    "the WebAuthn challenge sweep must be centralized in the retention sweep",
  );
  assert.match(
    retention,
    /summary\.emailTokensPurged/,
    "the sweep must report the purged token count in the summary",
  );
  assert.match(
    retention,
    /summary\.challengesPurged/,
    "the sweep must report the purged challenge count in the summary",
  );
});

test("R16: RETENTION_SCHEDULE.md pins the 30-day login_attempts window matching the code contract (audit finding 5 / P3-10)", async () => {
  const schedule = await readSource("docs/legal/RETENTION_SCHEDULE.md");
  const retention = await readSource("db/retention.ts");

  assert.match(
    schedule,
    /R16 \| Failed-login counters[\s\S]*?\*\*30 days\*\*/,
    "R16 must pin 30 days for failed-login counter rows (RETENTION_SCHEDULE.md)",
  );
  assert.match(
    retention,
    /LOGIN_ATTEMPT_RETENTION_DAYS\s*=\s*30/,
    "the code must use the 30-day constant for login_attempts",
  );
  assert.match(
    retention,
    /locked_until IS NULL OR locked_until < \?/,
    "the sweep must never delete a row under an ACTIVE lock",
  );
  assert.match(
    retention,
    /summary\.loginAttemptsPurged/,
    "the sweep must report the purged login_attempts count in the summary",
  );
});
