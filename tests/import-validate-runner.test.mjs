// OPERATIONS-5 regression (P2 audit 2026-10-22) — the IMPORT RUNNER's row
// validator must enforce the SAME dome direction invariant as the adapter
// validator, and its (0,0) diagnostic must describe what the code actually
// does.
//
// Two contracts live in the pipeline and they are deliberately DIFFERENT:
//   - scripts/import/adapters/lib.mjs:validateStagedRow(row, { allowOrigin })
//     — the adapter / dry-run / preview-map front half (it owns the
//     per-descriptor origin escape hatch and the DOME_KIND invariant);
//   - scripts/import/validate.mjs:validateStagedRow(row) — the RUNNER's
//     defensive gate (single argument, no options, fail-closed).
// This suite exercises ONLY the runner's validator (plus one end-to-end run
// through runImport), never the adapter one: no consolidation.
//
// The bug: the runner validated the direction RANGE for every kind, but not
// the schema invariant "domes are never directional" (DOME_KIND → direction
// IS NULL). A staged dome row carrying direction 0 or 359 — the two values a
// source most often means as "no direction" / "wraps to 0" — passed the
// runner, was counted as inserted and landed in D1 as a directional dome.
// The adapter already rejects it, so the pipeline only caught it when the
// adapter was the one staging the rows; an adapter (or a replayed staged
// payload) that emitted it slipped through the runner's own gate.
//
// The (0,0) diagnostic also promised an escape hatch ("rejected unless the
// descriptor whitelists origin") that the runner never implemented — the
// runner has no allowOrigin parameter and always rejects the origin. The
// message must say so.
//
// Fixtures are fictitious (example.invalid, made-up titles). No CLI run, no
// network, no D1/Cloudflare call: the end-to-end case uses the in-memory
// SQLite D1 adapter with the real migration SQL, like tests/import-pipeline.

import assert from "node:assert/strict";
import { test } from "node:test";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations } from "./helpers/db-runtime-harness.mjs";
import { CANONICAL_KINDS, DOME_KIND } from "../scripts/import/kinds.mjs";
import { validateStagedRow } from "../scripts/import/validate.mjs";
import { runImport } from "../scripts/import/runner.mjs";

/** A minimal canonical staged row that passes the runner gate. */
const GOOD = {
  title: "Fixture camera",
  kind: "Bullet",
  latitude: 45.477615,
  longitude: 9.181736,
  direction: null,
  external_id: "fixture:1",
};

const NON_DOME_KINDS = CANONICAL_KINDS.filter((kind) => kind !== DOME_KIND);

// ---------------------------------------------------------------------------
// Dome invariant — the SAME null/undefined rule as adapters/lib.mjs
// ---------------------------------------------------------------------------

test("runner validateStagedRow: a DOME with any direction is rejected (0 and 359 included)", () => {
  for (const direction of [0, 359, 90, 180]) {
    const result = validateStagedRow({ ...GOOD, kind: DOME_KIND, direction });
    assert.equal(result.ok, false, `dome with direction ${direction} must be invalid`);
    assert.ok(
      result.errors.some((error) => /dome/i.test(error)),
      `the error must name the dome invariant, got ${JSON.stringify(result.errors)}`,
    );
  }
});

test("runner validateStagedRow: a DOME with direction null/undefined stays valid (the invariant is about a SET direction)", () => {
  assert.equal(validateStagedRow({ ...GOOD, kind: DOME_KIND, direction: null }).ok, true);
  assert.equal(validateStagedRow({ ...GOOD, kind: DOME_KIND, direction: undefined }).ok, true);
  const withoutDirection = { ...GOOD, kind: DOME_KIND };
  delete withoutDirection.direction;
  assert.equal(validateStagedRow(withoutDirection).ok, true, "an omitted direction key is the same as undefined");
});

test("runner validateStagedRow: every NON-dome canonical kind still accepts 0 and 359", () => {
  assert.equal(NON_DOME_KINDS.length, CANONICAL_KINDS.length - 1, "the vocabulary has one dome kind");
  for (const kind of NON_DOME_KINDS) {
    for (const direction of [0, 359]) {
      assert.equal(
        validateStagedRow({ ...GOOD, kind, direction }).ok,
        true,
        `${kind} with direction ${direction} must stay valid (the invariant is dome-only)`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Pre-existing checks retained (the fix is additive, never a relaxation)
// ---------------------------------------------------------------------------

test("runner validateStagedRow: direction range / integer / string checks are unchanged", () => {
  const bullet = { ...GOOD, kind: "Bullet" };
  assert.equal(validateStagedRow({ ...bullet, direction: 400 }).ok, false);
  assert.equal(validateStagedRow({ ...bullet, direction: -5 }).ok, false);
  assert.equal(validateStagedRow({ ...bullet, direction: 360 }).ok, false, "the range is 0-359");
  assert.equal(validateStagedRow({ ...bullet, direction: 12.5 }).ok, false, "fractions are rejected");
  assert.equal(validateStagedRow({ ...bullet, direction: "120" }).ok, false, "strings are rejected, never coerced");
  assert.equal(validateStagedRow({ ...bullet, direction: null }).ok, true);
  assert.equal(validateStagedRow({ ...bullet, direction: undefined }).ok, true);
});

test("runner validateStagedRow: title, kind, external_id and coordinate gates are unchanged", () => {
  assert.equal(validateStagedRow(GOOD).ok, true);
  assert.equal(validateStagedRow({ ...GOOD, title: "" }).ok, false);
  assert.equal(validateStagedRow({ ...GOOD, title: "x".repeat(91) }).ok, false);
  assert.equal(validateStagedRow({ ...GOOD, kind: "Cupola" }).ok, false, "non-canonical kinds are rejected");
  assert.equal(validateStagedRow({ ...GOOD, external_id: null }).ok, false);
  assert.equal(validateStagedRow({ ...GOOD, latitude: 91 }).ok, false);
  assert.equal(validateStagedRow({ ...GOOD, longitude: 181 }).ok, false);
  assert.equal(validateStagedRow({ ...GOOD, latitude: Number.NaN }).ok, false);
});

test("runner validateStagedRow: (0,0) is rejected UNCONDITIONALLY — an extra allowOrigin argument cannot open the gate", () => {
  const origin = { ...GOOD, latitude: 0, longitude: 0 };
  const plain = validateStagedRow(origin);
  assert.equal(plain.ok, false, "the runner always rejects the origin");
  const message = plain.errors.find((error) => /\(0,0\)/.test(error)) ?? "";
  assert.match(message, /\(0,0\)/, "the diagnostic names the rejected value");
  assert.doesNotMatch(message, /whitelist|allowOrigin|unless/i, "the diagnostic must not promise an escape hatch the runner does not have");

  // The runner contract is single-argument: an options bag is not read.
  const withOption = validateStagedRow(origin, { allowOrigin: true });
  assert.equal(withOption.ok, false, "the runner has no allowOrigin escape hatch — the origin stays a hard rejection");
});

// ---------------------------------------------------------------------------
// End-to-end through the runner: invalid dome rows are counted, never stored
// ---------------------------------------------------------------------------

const FIXTURE_DESCRIPTOR = {
  slug: "fixture",
  source_name: "Fixture Open Data (test)",
  format: "geojson",
  license: "ODbL 1.0",
  license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
  source_url: "https://example.invalid/fixture",
  attribution_text: "© Fixture",
  external_id_prefix: "fix:",
};

test("runImport: staged dome rows with direction 0/359 are counted invalid and never inserted; valid rows are unaffected", async () => {
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);

  // Rows a (buggy) adapter could stage: already canonical, so ONLY the
  // runner's own gate stands between them and D1.
  const staged = [
    { title: "Valid bullet fixture", kind: "Bullet", latitude: 45.1, longitude: 9.1, direction: 120, external_id: "ok-bullet" },
    { title: "Valid ptz fixture", kind: "PTZ", latitude: 45.2, longitude: 9.2, direction: 0, external_id: "ok-ptz" },
    { title: "Dome fixture north", kind: DOME_KIND, latitude: 45.3, longitude: 9.3, direction: 0, external_id: "bad-dome-0" },
    { title: "Dome fixture wrap", kind: DOME_KIND, latitude: 45.4, longitude: 9.4, direction: 359, external_id: "bad-dome-359" },
  ];
  const adapter = {
    getDescriptor: async () => FIXTURE_DESCRIPTOR,
    // No network: the payload is inert, the staged rows are the fixture.
    fetchPayload: async () => ({ payload: "staged-fixture" }),
    parsePayload: async () => staged,
  };

  const summary = await runImport(db, { slug: "fixture", adapter, options: { apply: true } });

  assert.equal(summary.counts.total, 4, "every staged row is counted");
  assert.equal(summary.counts.invalid, 2, "both directional domes are invalid");
  assert.equal(summary.counts.inserted, 2, "the two valid rows are unaffected");
  assert.equal(summary.invariantTotal, summary.counts.total, "total = inserted + skipped + merged + review + invalid");
  assert.deepEqual(
    summary.report.errors.map((entry) => entry.externalId).sort(),
    ["bad-dome-0", "bad-dome-359"],
    "each rejected row is reported by external id",
  );

  const stored = (
    await db.prepare("SELECT external_id, kind, direction FROM cameras ORDER BY external_id").all()
  ).results;
  assert.deepEqual(
    stored.map((row) => row.external_id),
    ["ok-bullet", "ok-ptz"],
    "the invalid dome rows never reach the database",
  );
  assert.equal(stored[1].direction, 0, "a NON-dome row keeps its direction 0");
  assert.equal(
    (
      await db.prepare("SELECT COUNT(*) AS n FROM cameras WHERE kind = ?").bind(DOME_KIND).all()
    ).results[0].n,
    0,
    "no directional dome is stored",
  );
});
