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
//   3. KNOWN GAP (not implemented, tracked for ada/linus) — the worker
//      exposes only a fetch handler, wrangler.jsonc has no cron triggers,
//      and db/retention.ts does not exist. R1/R2 hard-deletes and
//      expired-session cleanup are therefore NOT automated yet. These
//      assertions pin the CURRENT state: when the purge job lands, this
//      contract test must be updated in the same change.

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
// 3. Known functional gap (documented, NOT implemented — tracked for ada)
// ---------------------------------------------------------------------------

test("KNOWN GAP: worker has no scheduled handler and no cron triggers — purge is not automated", async () => {
  const worker = await readSource("worker/index.ts");
  const wrangler = await readSource("wrangler.jsonc");

  // Current state: the worker is a pure request handler. There is no
  // `scheduled` entry, so R1/R2 hard-deletes, R3 stale removal and
  // expired-session cleanup are NOT run on a timer today.
  //
  // WHEN THE PURGE JOB LANDS (tracked: ada/linus): update this test in the
  // same change — replace the negative assertions with contract assertions
  // on the new scheduled handler and its cron binding.
  assert.doesNotMatch(
    worker,
    /\bscheduled\b/,
    "KNOWN GAP: worker/index.ts must expose only fetch today; when the scheduled purge handler is added, update this contract test",
  );
  assert.doesNotMatch(
    wrangler,
    /"cron"\s*:/,
    "KNOWN GAP: wrangler.jsonc must have no cron triggers today; when the cron binding is added, update this contract test",
  );
  assert.doesNotMatch(
    wrangler,
    /"triggers"\s*:/,
    "KNOWN GAP: wrangler.jsonc must have no triggers block today; when the cron binding is added, update this contract test",
  );

  // db/retention.ts is the file ADR 0004 reserves for the automated purge
  // ("to be implemented by ada (`db/retention.ts` + tests)"). It does not
  // exist yet — assert absence explicitly so its creation is a visible
  // contract change, not a silent one.
  await assert.rejects(
    access(path.join(root, "db/retention.ts")),
    (error) => error.code === "ENOENT",
    "KNOWN GAP: db/retention.ts must not exist yet (ADR 0004 assigns it to ada); when implemented, update this contract test",
  );
});
