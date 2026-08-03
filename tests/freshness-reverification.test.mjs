// H1 freshness + re-verification contract (docs/FUTURE_ROADMAP.md Horizon 1,
// docs/workstreams/DATA_TRUST.md "Review and expiry clocks").
//
// Covers, against the REAL database layer (see helpers/freshness-d1.mjs):
//   1. the pure freshness logic (review clocks, phases, public currency);
//   2. the public read boundary — a verified record past its review window is
//      never presented as current, even before the sweep runs;
//   3. the scheduled-expiry sweep (verified -> needs_review -> stale) with
//      moderation events;
//   4. re-verification: reverify restarts the clocks and republishes the
//      record, from both needs_review and stale;
//   5. static guarantees on the source of the public query and the sweep.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { freshRuntime } from "./helpers/freshness-d1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const REASON = {
  verified: "verified-public-infrastructure",
  stale: "inaccurate-or-outdated",
  sensitive: "privacy-or-safety-concern",
};

const APPROVE_OPTIONS = { publishManufacturer: false, publishObservedOn: false };

async function approveFirstPending(moderation) {
  const queue = await moderation.listPendingModerationItems();
  const report = queue.cameraReports[0];
  assert.ok(report, "a pending report must exist");
  const decision = await moderation.moderateCamera(
    report.id,
    "approve",
    REASON.verified,
    null,
    APPROVE_OPTIONS,
  );
  assert.ok(decision, "approval must succeed");
  return decision;
}

// --- 1. Pure freshness logic -------------------------------------------------

test("review clocks: default 12 months, month-end clamping, leap years", async () => {
  const { freshness } = await freshRuntime();
  const { computeReviewDueAt, staleAfter, DEFAULT_REVIEW_INTERVAL_MONTHS, STALE_GRACE_DAYS } = freshness;

  assert.equal(DEFAULT_REVIEW_INTERVAL_MONTHS, 12);
  assert.equal(STALE_GRACE_DAYS, 90);

  const january = "2026-01-15T10:00:00.000Z";
  assert.equal(
    computeReviewDueAt(january, 12),
    "2027-01-15T10:00:00.000Z",
    "12 months later, same day",
  );
  assert.equal(
    computeReviewDueAt("2026-01-31T00:00:00.000Z", 1),
    "2026-02-28T00:00:00.000Z",
    "month-end clamps to the last day of the shorter month",
  );
  assert.equal(
    computeReviewDueAt("2028-01-31T00:00:00.000Z", 1),
    "2028-02-29T00:00:00.000Z",
    "leap years are honoured",
  );
  assert.equal(staleAfter("2026-01-15T10:00:00.000Z"), "2026-04-15T10:00:00.000Z");
  assert.throws(() => computeReviewDueAt("2026-01-15T00:00:00.000Z", 0), /Invalid review interval/);
  assert.throws(() => computeReviewDueAt("2026-01-15T00:00:00.000Z", 2.5), /Invalid review interval/);
  assert.throws(() => computeReviewDueAt("not-a-date", 1), /Invalid ISO date/);
});

test("freshness phases: current, review_due, stale, not_applicable", async () => {
  const { freshness } = await freshRuntime();
  const { evaluateFreshness } = freshness;
  const now = "2026-07-31T00:00:00.000Z";
  const inWindow = "2026-12-31T00:00:00.000Z";
  const pastDue = "2026-01-01T00:00:00.000Z";

  assert.equal(evaluateFreshness({ status: "verified", reviewDueAt: inWindow }, now), "current");
  // Past the review date but inside the 90-day grace period: review_due.
  assert.equal(evaluateFreshness({ status: "verified", reviewDueAt: "2026-06-01T00:00:00.000Z" }, now), "review_due");
  // Beyond the grace period: stale.
  assert.equal(evaluateFreshness({ status: "verified", reviewDueAt: "2026-04-01T00:00:00.000Z" }, now), "stale");
  assert.equal(evaluateFreshness({ status: "needs_review", reviewDueAt: "2026-04-01T00:00:00.000Z" }, now), "stale");
  assert.equal(evaluateFreshness({ status: "demo", reviewDueAt: null }, now), "current");
  assert.equal(evaluateFreshness({ status: "stale", reviewDueAt: pastDue }, now), "stale");
  // Legacy verified record without a schedule is not provably stale.
  assert.equal(evaluateFreshness({ status: "verified", reviewDueAt: null }, now), "current");
  assert.equal(evaluateFreshness({ status: "pending", reviewDueAt: null }, now), "not_applicable");
  assert.equal(evaluateFreshness({ status: "rejected", reviewDueAt: null }, now), "not_applicable");
  assert.equal(evaluateFreshness({ status: "removed", reviewDueAt: null }, now), "not_applicable");
});

test("isPubliclyCurrent: only demo and in-window verified records", async () => {
  const { freshness } = await freshRuntime();
  const { isPubliclyCurrent } = freshness;
  const now = "2026-07-31T00:00:00.000Z";

  assert.equal(isPubliclyCurrent({ status: "demo", reviewDueAt: null }, now), true);
  assert.equal(isPubliclyCurrent({ status: "verified", reviewDueAt: "2026-12-31T00:00:00.000Z" }, now), true);
  assert.equal(isPubliclyCurrent({ status: "verified", reviewDueAt: null }, now), true);
  assert.equal(isPubliclyCurrent({ status: "verified", reviewDueAt: "2026-01-01T00:00:00.000Z" }, now), false);
  assert.equal(isPubliclyCurrent({ status: "needs_review", reviewDueAt: "2026-12-31T00:00:00.000Z" }, now), false);
  assert.equal(isPubliclyCurrent({ status: "stale", reviewDueAt: "2026-01-01T00:00:00.000Z" }, now), false);
  assert.equal(isPubliclyCurrent({ status: "pending", reviewDueAt: null }, now), false);
  assert.equal(isPubliclyCurrent({ status: "removed", reviewDueAt: null }, now), false);
});

// --- 2. Public read boundary -------------------------------------------------

test("approval restarts the freshness clocks and publishes the record", async () => {
  const { cameras, moderation } = await freshRuntime();
  await cameras.createPendingCamera({
    title: "Bus stop camera",
    kind: "Traffic monitoring",
    manufacturer: null,
    observedOn: null,
    address: "Via Roma 1",
    notes: "visible from the street",
    latitude: 41.9,
    longitude: 12.49,
  });

  const decision = await approveFirstPending(moderation);
  const item = decision.item;
  assert.equal(item.status, "verified");
  assert.ok(item.lastVerifiedAt, "approval must record last_verified_at");
  assert.ok(item.reviewDueAt, "approval must schedule the next review");
  assert.equal(item.reviewIntervalMonths, 12);

  const now = new Date(item.lastVerifiedAt).getTime();
  const due = new Date(item.reviewDueAt).getTime();
  assert.ok(due > now + 300 * 24 * 3600 * 1000, "review due must be ~12 months ahead");

  const publicList = await cameras.listPublicCameras();
  assert.ok(
    publicList.some((record) => record.id === item.id),
    "a fresh verified record must be publicly current",
  );
});

test("a verified record past its review window is never presented as current", async () => {
  const { cameras, moderation } = await freshRuntime();
  await cameras.createPendingCamera({
    title: "Scheduled review overdue",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "Piazza Dante",
    notes: "",
    latitude: 41.89,
    longitude: 12.5,
  });
  const decision = await approveFirstPending(moderation);
  const item = decision.item;
  assert.equal(item.status, "verified");

  // Time travel: as of one day after the scheduled review, the record must
  // drop out of the public list even though the sweep has not run yet.
  const overdue = new Date(new Date(item.reviewDueAt).getTime() + 24 * 3600 * 1000).toISOString();
  const publicList = await cameras.listPublicCameras(overdue);
  assert.ok(
    !publicList.some((record) => record.id === item.id),
    "a verified record past its review date must not be published as current",
  );
});

test("demo records remain publicly current without a schedule (development environment)", async () => {
  // ADR 0008 demo gate (t_d7a4b99b): `demo` records are public ONLY in the
  // local development environment (ENVIRONMENT=development); outside it the
  // gate excludes them from every public surface. This suite pins the
  // prototype behaviour, so the harness env is flipped to development for
  // the duration of the test.
  globalThis.__OSDB_FRESHNESS_ENV__ = "development";
  try {
    const { cameras, d1 } = await freshRuntime();
    // H3: demo records are never seeded at runtime — the fresh DB starts
    // empty (migrations only). The reserved 'demo' status is simulated with
    // a direct database edit, mirroring a legacy record.
    await cameras.createPendingCamera({
      title: "Legacy demo record",
      kind: "Fixed dome",
      manufacturer: null,
      observedOn: null,
      address: "Via Roma 9",
      notes: "",
      latitude: 41.9,
      longitude: 12.5,
    });
    const inserted = await d1.prepare("SELECT id FROM cameras WHERE title = 'Legacy demo record'").first();
    await d1.prepare("UPDATE cameras SET status = 'demo' WHERE id = ?").bind(inserted.id).run();
    const publicList = await cameras.listPublicCameras();
    assert.equal(publicList.length, 1);
    assert.ok(publicList.every((record) => record.status === "demo"));
  } finally {
    delete globalThis.__OSDB_FRESHNESS_ENV__;
  }
});

test("pending and needs_review records are never public", async () => {
  const { cameras, moderation } = await freshRuntime();
  await cameras.createPendingCamera({
    title: "Pending report",
    kind: "Traffic monitoring",
    manufacturer: null,
    observedOn: null,
    address: "Via Milano 2",
    notes: "",
    latitude: 41.9,
    longitude: 12.5,
  });
  let publicList = await cameras.listPublicCameras();
  assert.ok(!publicList.some((record) => record.title === "Pending report"));

  const decision = await approveFirstPending(moderation);
  const item = decision.item;
  await moderation.moderateCamera(item.id, "mark-stale", REASON.stale, "sensor drift");
  publicList = await cameras.listPublicCameras();
  assert.ok(!publicList.some((record) => record.id === item.id), "needs_review must be withdrawn");
});

// --- 3. Scheduled-expiry sweep ----------------------------------------------

test("sweep: verified past its review window moves to needs_review with an event", async () => {
  const { cameras, moderation } = await freshRuntime();
  await cameras.createPendingCamera({
    title: "Expiring camera",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "Corso Europa",
    notes: "",
    latitude: 41.88,
    longitude: 12.48,
  });
  const decision = await approveFirstPending(moderation);
  const item = decision.item;

  const afterDue = new Date(new Date(item.reviewDueAt).getTime() + 24 * 3600 * 1000).toISOString();
  const result = await moderation.runFreshnessSweep(afterDue);
  assert.deepEqual(result, { scheduledExpiry: 1, becameStale: 0 });

  const queue = await moderation.listPendingModerationItems();
  assert.ok(queue.reviewCameras.some((record) => record.id === item.id), "expired record must enter the review queue");
  assert.ok(!queue.publishedCameras.some((record) => record.id === item.id), "expired record must leave the published list");
  const event = queue.recentEvents.find((entry) => entry.entityId === item.id && entry.action === "scheduled-expiry");
  assert.equal(event?.action, "scheduled-expiry");
  assert.equal(event?.previousStatus, "verified");
  assert.equal(event?.newStatus, "needs_review");

  // And it must not be public under the same clock.
  const publicList = await cameras.listPublicCameras(afterDue);
  assert.ok(!publicList.some((record) => record.id === item.id));
});

test("sweep: needs_review not re-confirmed within the grace period becomes stale", async () => {
  const { cameras, moderation } = await freshRuntime();
  await cameras.createPendingCamera({
    title: "Never re-confirmed",
    kind: "Traffic monitoring",
    manufacturer: null,
    observedOn: null,
    address: "Via Verdi",
    notes: "",
    latitude: 41.87,
    longitude: 12.47,
  });
  const decision = await approveFirstPending(moderation);
  const item = decision.item;
  await moderation.moderateCamera(item.id, "mark-stale", REASON.stale, "unconfirmed");

  // First sweep: one day after the review date -> needs_review.
  const afterDue = new Date(new Date(item.reviewDueAt).getTime() + 24 * 3600 * 1000).toISOString();
  await moderation.runFreshnessSweep(afterDue);

  // Second sweep: well beyond the 90-day grace period -> stale.
  const pastGrace = new Date(new Date(item.reviewDueAt).getTime() + 95 * 24 * 3600 * 1000).toISOString();
  const result = await moderation.runFreshnessSweep(pastGrace);
  assert.deepEqual(result, { scheduledExpiry: 0, becameStale: 1 });

  const queue = await moderation.listPendingModerationItems();
  assert.ok(queue.staleCameras.some((record) => record.id === item.id), "unconfirmed record must be labelled stale");
  assert.ok(!queue.reviewCameras.some((record) => record.id === item.id));
  const event = queue.recentEvents.find((entry) => entry.entityId === item.id && entry.action === "expiry-not-reconfirmed");
  assert.equal(event?.previousStatus, "needs_review");
  assert.equal(event?.newStatus, "stale");
});

test("the moderation queue applies the lazy sweep before listing", async () => {
  const { cameras, moderation, d1 } = await freshRuntime();
  await cameras.createPendingCamera({
    title: "Lazy sweep target",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "Viale Libia",
    notes: "",
    latitude: 41.9,
    longitude: 12.5,
  });
  const decision = await approveFirstPending(moderation);
  const item = decision.item;

  // Backdate the review date directly (simulates a record that aged while the
  // service was not reading the queue), then read the queue: the lazy sweep
  // must move the expired record into review without any explicit call.
  const pastDue = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  await d1.prepare("UPDATE cameras SET review_due_at = ? WHERE id = ?").bind(pastDue, item.id).run();

  const queue = await moderation.listPendingModerationItems();
  assert.ok(queue.reviewCameras.some((record) => record.id === item.id), "lazy sweep must move the expired record into review");
  assert.ok(!queue.publishedCameras.some((record) => record.id === item.id));
});

// --- 4. Re-verification ------------------------------------------------------

test("reverify from needs_review restarts the clocks and republishes", async () => {
  const { cameras, moderation } = await freshRuntime();
  await cameras.createPendingCamera({
    title: "Re-verifiable camera",
    kind: "Traffic monitoring",
    manufacturer: null,
    observedOn: null,
    address: "Via Nazionale",
    notes: "",
    latitude: 41.9,
    longitude: 12.5,
  });
  const approved = await approveFirstPending(moderation);
  const item = approved.item;
  await moderation.moderateCamera(item.id, "mark-stale", REASON.stale, "drift");

  // Sweep the record into the past so it is genuinely due for re-verification.
  const afterDue = new Date(new Date(item.reviewDueAt).getTime() + 24 * 3600 * 1000).toISOString();
  await moderation.runFreshnessSweep(afterDue);

  const reverified = await moderation.moderateCamera(item.id, "reverify", REASON.verified, null);
  assert.ok(reverified, "reverify must succeed from needs_review");
  assert.equal(reverified.item.status, "verified");
  assert.ok(new Date(reverified.item.lastVerifiedAt) >= new Date(item.lastVerifiedAt), "last_verified_at must not go backwards");
  assert.ok(new Date(reverified.item.reviewDueAt) >= new Date(item.reviewDueAt), "review due must be rescheduled from the re-verification time");

  const publicList = await cameras.listPublicCameras();
  assert.ok(publicList.some((record) => record.id === item.id), "re-verified record must be public again");
});

test("reverify from stale reconfirms the record and republishes it", async () => {
  const { cameras, moderation } = await freshRuntime();
  await cameras.createPendingCamera({
    title: "Stale but reconfirmed",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "Piazza del Popolo",
    notes: "",
    latitude: 41.91,
    longitude: 12.48,
  });
  const approved = await approveFirstPending(moderation);
  const item = approved.item;
  await moderation.moderateCamera(item.id, "mark-stale", REASON.stale, "no response");

  const pastGrace = new Date(new Date(item.reviewDueAt).getTime() + 95 * 24 * 3600 * 1000).toISOString();
  await moderation.runFreshnessSweep(pastGrace);

  const queue = await moderation.listPendingModerationItems();
  assert.ok(queue.staleCameras.some((record) => record.id === item.id), "record must be stale first");

  const reverified = await moderation.moderateCamera(item.id, "reverify", REASON.verified, "confirmed on site");
  assert.ok(reverified, "reverify must succeed from stale");
  assert.equal(reverified.item.status, "verified");

  const publicList = await cameras.listPublicCameras();
  assert.ok(publicList.some((record) => record.id === item.id), "reconfirmed record must be public again");
  const after = await moderation.listPendingModerationItems();
  assert.ok(!after.staleCameras.some((record) => record.id === item.id), "reconfirmed record must leave the stale list");
});

test("a stale record can be removed; illegal transitions stay rejected", async () => {
  const { cameras, moderation } = await freshRuntime();
  await cameras.createPendingCamera({
    title: "Stale removal",
    kind: "Traffic monitoring",
    manufacturer: null,
    observedOn: null,
    address: "Via Po",
    notes: "",
    latitude: 41.9,
    longitude: 12.5,
  });
  const approved = await approveFirstPending(moderation);
  const item = approved.item;
  await moderation.moderateCamera(item.id, "mark-stale", REASON.stale, null);
  const pastGrace = new Date(new Date(item.reviewDueAt).getTime() + 95 * 24 * 3600 * 1000).toISOString();
  await moderation.runFreshnessSweep(pastGrace);

  // Illegal transitions from stale must not apply.
  const badApprove = await moderation.moderateCamera(item.id, "approve", REASON.verified, null);
  assert.equal(badApprove.kind, "not_found", "approve is not a valid transition from stale");
  const badMarkStale = await moderation.moderateCamera(item.id, "mark-stale", REASON.stale, null);
  assert.equal(badMarkStale.kind, "not_found", "mark-stale is not a valid transition from stale");

  const removed = await moderation.moderateCamera(item.id, "hide", REASON.sensitive, "removal decision");
  assert.ok(removed, "hide must succeed from stale");
  assert.equal(removed.item.status, "removed");
  const publicList = await cameras.listPublicCameras();
  assert.ok(!publicList.some((record) => record.id === item.id), "removed record must not be public");
});

// --- 5. Static guarantees ----------------------------------------------------

test("the public camera query enforces the freshness window at read time", async () => {
  const cameras = await readSource("db/cameras.ts");
  const functionStart = cameras.indexOf("export async function listPublicCameras");
  const functionEnd = cameras.indexOf("export async function createPendingCamera", functionStart);
  const publicQuery = cameras.slice(functionStart, functionEnd);
  const predicateStart = cameras.indexOf("export function publicCameraPredicate");
  const predicateEnd = cameras.indexOf("export async function listPublicCameras", predicateStart);
  const predicate = cameras.slice(predicateStart, predicateEnd);

  assert.ok(predicateStart >= 0, "the shared public predicate must exist");
  assert.match(
    publicQuery,
    /publicCameraPredicate\(/,
    "the public query must derive its status whitelist from the shared predicate",
  );
  assert.match(
    predicate,
    /status\s+IN\s*\(\s*\$\{placeholders\}\)/,
    "the predicate must generate the status whitelist from PUBLIC_CAMERA_STATUSES",
  );
  assert.match(
    predicate,
    /PUBLIC_CAMERA_STATUSES/,
    "the predicate must be derived from the shared public-status constant",
  );
  assert.match(
    predicate,
    /review_due_at\s+IS\s+NULL\s+OR\s+review_due_at\s*>=\s*\?/i,
    "the predicate must keep verified records only inside their review window",
  );
  assert.match(
    publicQuery,
    /last_verified_at\s+AS\s+lastVerifiedAt/,
    "the public query must expose the last verified date for labelling",
  );
  assert.match(
    publicQuery,
    /return\s+result\.results\.map\(/,
    "the public query must return its filtered result set (rounded at the public boundary)",
  );
  assert.match(
    publicQuery,
    /roundPublicCoordinate\(record\.latitude\)[\s\S]*roundPublicCoordinate\(record\.longitude\)/,
    "the public query must round both coordinates to the ~4-decimal zone precision",
  );
});

test("approval and re-verification both write the freshness clocks", async () => {
  const moderation = await readSource("db/moderation.ts");
  assert.match(
    moderation,
    /last_verified_at\s*=\s*\?,[\s\S]*review_due_at\s*=\s*\?,[\s\S]*review_interval_months\s*=\s*\?/,
    "moderation updates must write the freshness clocks",
  );
  assert.match(
    moderation,
    /computeReviewDueAt\(nowIso,\s*DEFAULT_REVIEW_INTERVAL_MONTHS\)/,
    "the next review date must be derived from the verification clock",
  );
});

test("the scheduled-expiry sweep transitions and events are explicit", async () => {
  const moderation = await readSource("db/moderation.ts");
  assert.match(moderation, /export async function runFreshnessSweep/, "the sweep must be an explicit exported function");
  assert.match(moderation, /action:\s*"scheduled-expiry"/, "verified -> needs_review must record a scheduled-expiry event");
  assert.match(moderation, /action:\s*"expiry-not-reconfirmed"/, "needs_review -> stale must record an expiry event");
  assert.match(moderation, /STALE_GRACE_DAYS/, "the stale grace period must drive the second sweep step");
  assert.match(moderation, /previousStatus\s*===\s*"stale"[\s\S]*newStatus:\s*"verified"/, "stale records must be re-verifiable");
});

test("freshness constants follow DATA_TRUST clocks (12 months / 90 days)", async () => {
  const freshness = await readSource("db/freshness.ts");
  assert.match(freshness, /DEFAULT_REVIEW_INTERVAL_MONTHS\s*=\s*12/);
  assert.match(freshness, /STALE_GRACE_DAYS\s*=\s*90/);
});
