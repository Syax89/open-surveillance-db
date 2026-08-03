// OSDB-QA retention contract tests (kanban t_ff40be8d, audit t_0de37378).
//
// Pins the retention contract AS IT EXISTS TODAY, in three layers:
//   1. POLICY DOCS — the legal retention schedule (ADR 0008 decision +
//      docs/legal/RETENTION_SCHEDULE.md) is machine-checkable so the
//      documented values cannot drift unnoticed (12-month renewal cycle,
//      90d pending, 30d rejected, 30d session TTL).
//   2. IMPLEMENTED RUNTIME CONTRACT — the 12-month review clock
//      (DEFAULT_REVIEW_INTERVAL_MONTHS), the freshness sweep
//      (runFreshnessSweep in db/moderation.ts), the sessions table
//      (expires_at NOT NULL + index) and the read-time expiry rejection
//      in db/auth.ts. These are the pieces that DO exist and are tested
//      at runtime elsewhere (freshness-reverification, auth-d1).
//   3. AUTOMATED PURGE CONTRACT (implemented in PR #87) — the worker
//      exposes a `scheduled` handler, wrangler.jsonc declares the daily
//      cron trigger, and db/retention.ts runs the R1-R7 sweep. These
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

test("ADR 0008 documents the 12-month renewal cycle and ~4-decimal precision", async () => {
  const adr = await readSource("docs/decisions/0008-data-licence-precision-retention-contact.md");

  assert.match(
    adr,
    /Retention:\s*12 months for verified records/,
    "ADR 0008 must pin the 12-month retention decision (CEO, 2026-07-31)",
  );
  assert.match(
    adr,
    /re-verified at least every 12 months/,
    "ADR 0008 must require re-verification at least every 12 months",
  );
  assert.match(
    adr,
    /~4 decimal places by default/,
    "ADR 0008 must pin ~4-decimal publication precision",
  );
  assert.match(
    adr,
    /moves to `needs_review` and is removed after 6 months\s+unverified/,
    "ADR 0008 must pin the 6-month unverified removal path after needs_review",
  );
});

test("RETENTION_SCHEDULE.md pins R1/R2/R3/R7 values matching the code contract", async () => {
  const schedule = await readSource("docs/legal/RETENTION_SCHEDULE.md");

  // R1 — pending reports hard-deleted after 90 days.
  assert.match(schedule, /R1 \| `pending` report[\s\S]*?\*\*90 days\*\*/, "R1 must pin 90 days for pending reports");
  // R2 — rejected reports hard-deleted after 30 days.
  assert.match(schedule, /R2 \| `rejected` report[\s\S]*?\*\*30 days\*\*/, "R2 must pin 30 days for rejected reports");
  // R3 — verified records on a 12-month renewal cycle, 6-month unverified removal.
  assert.match(
    schedule,
    /R3 \| `verified` record[\s\S]*?\*\*12 months with renewal\*\*/,
    "R3 must pin the 12-month renewal cycle for verified records",
  );
  assert.match(
    schedule,
    /after 6 months unverified → `removed`/,
    "R3 must pin the 6-month unverified removal path",
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

test("the 12-month review clock is the implemented default (DEFAULT_REVIEW_INTERVAL_MONTHS)", async () => {
  const freshness = await readSource("db/freshness.ts");
  const moderation = await readSource("db/moderation.ts");

  assert.match(
    freshness,
    /DEFAULT_REVIEW_INTERVAL_MONTHS\s*=\s*12/,
    "the review clock default must stay 12 months (ADR 0008 R3)",
  );
  // The sweep is exported from the moderation boundary and drives the
  // verified -> needs_review -> stale transitions (runtime-tested in
  // freshness-reverification.test.mjs).
  assert.match(
    moderation,
    /export async function runFreshnessSweep/,
    "runFreshnessSweep must remain the exported freshness sweep entry point",
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
