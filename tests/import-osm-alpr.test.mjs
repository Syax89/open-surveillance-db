// OSM ALPR imports (DeFlock-equivalent selection) — US + CA adapters.
//
// Scope of this suite (offline, no network, no real data):
//   - descriptor + licence/attribution wiring for both countries;
//   - the ALPR gate: node/way objects, positive safe integer OSM ids, exact
//     `man_made=surveillance`, exact case-sensitive `surveillance:type=ALPR`,
//     and an EXPLICIT `surveillance=public|outdoor` scope (never inferred);
//   - the tag allowlist: no free text, photo/URL or contributor metadata ever
//     becomes a staged row; operator kept only for public entities;
//   - canonical kind + stable `external_id = osm:<type>/<id>`;
//   - the REAL runner load/parse path through `--source=<file>` (the runner
//     hands the adapter the file as a JSON string), dry-run + apply on a
//     disposable in-memory D1, and idempotency (re-run aborts, --force no-ops).

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations, cleanupDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { runImport } from "../scripts/import/runner.mjs";
import { isLicenceImportable } from "../scripts/import/licence-gate.mjs";
import {
  ALPR_KIND,
  createOsmAlprAdapter,
  elementsFromPayload,
  gateAlprElement,
  normalizeOsmId,
} from "../scripts/import/adapters/osm-alpr-factory.mjs";
import * as usa from "../scripts/import/adapters/osm-alpr-usa-2026.mjs";
import * as canada from "../scripts/import/adapters/osm-alpr-canada-2026.mjs";

after(async () => cleanupDbRuntime());

const ADAPTERS = [
  { name: "usa", mod: usa, slug: "osm-alpr-usa-2026", geofabrik: "https://download.geofabrik.de/north-america/us.html", maxRecords: 250000 },
  { name: "canada", mod: canada, slug: "osm-alpr-canada-2026", geofabrik: "https://download.geofabrik.de/north-america/canada.html", maxRecords: 25000 },
];

/** Canonical staged-row field set (adapter contract, runner-owned fields excluded). */
const CANONICAL_ROW_KEYS = [
  "address", "description", "direction", "external_id", "kind",
  "latitude", "longitude", "notes", "title",
];

function alprNode(id, overrides = {}, tags = {}) {
  return {
    type: "node",
    id,
    lat: overrides.lat ?? 40.0,
    lon: overrides.lon ?? -75.0,
    tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "public", ...tags },
  };
}

// ------------------------------------------------------------------ descriptors

test("osm-alpr: descriptors state OSM/ODbL provenance for both countries", async () => {
  for (const { mod, slug, geofabrik, maxRecords } of ADAPTERS) {
    const descriptor = await mod.getDescriptor();
    assert.equal(descriptor.slug, slug);
    assert.equal(mod.slug, slug);
    assert.equal(descriptor.license, "ODbL 1.0 (OSM)");
    assert.equal(isLicenceImportable(descriptor.license), true, "ODbL stays importable (whitelist untouched)");
    assert.equal(descriptor.license_url, "https://opendatacommons.org/licenses/odbl/1-0/");
    assert.match(descriptor.attribution_text, /© OpenStreetMap contributors/);
    assert.match(descriptor.attribution_text, /https:\/\/www\.openstreetmap\.org\/copyright/);
    assert.equal(descriptor.source_url, geofabrik);
    assert.equal(descriptor.external_id_prefix, "osm:");
    assert.equal(descriptor.max_records, maxRecords);
    assert.equal(descriptor.enrich, false);
    // OSM owns the data: the selection is DeFlock-compatible, the source is not DeFlock.
    assert.match(descriptor.source_name, /OpenStreetMap ALPR/);
    assert.match(descriptor.source_name, /DeFlock-equivalent selection/);
    assert.doesNotMatch(descriptor.source_name, /©\s*DeFlock|DeFlock data|DeFlock contributors/i);
    // Repo-relative extract path (never a developer home / absolute path).
    assert.match(descriptor.local_source_path, /^\.import-data\/osm-alpr-[a-z]+-2026\.elements\.json$/);
    assert.match(descriptor.notes, /Geofabrik/);
    assert.match(descriptor.notes, /ODbL 1\.0/);
  }
});

test("osm-alpr: the extract is resolved inside the repo, and its absence is a local-file error", async () => {
  for (const { mod, slug } of ADAPTERS) {
    const expected = `${slug}.elements.json`;
    let failure = null;
    try {
      const fetched = await mod.fetchPayload(); // no extract on the test machine → local error
      assert.ok(Array.isArray(fetched.elements));
      assert.match(fetched.checksum, /^[0-9a-f]{64}$/);
    } catch (err) {
      failure = err;
    }
    if (failure) {
      // Fail closed, and say exactly which repo-relative file is missing —
      // never a network/Overpass/HTTP error.
      assert.match(failure.message, /local OSM source file missing or unreadable/);
      assert.ok(failure.message.includes("/.import-data/"), failure.message);
      assert.ok(failure.message.includes(expected), failure.message);
      assert.doesNotMatch(failure.message, /https?:|overpass|HTTP \d/i);
    }
  }
});

// --------------------------------------------------------------- id + geometry

test("osm-alpr: OSM ids must be positive safe integers (stringified digits accepted)", () => {
  assert.equal(normalizeOsmId(123), 123);
  assert.equal(normalizeOsmId("123"), 123);
  assert.equal(normalizeOsmId(0), null);
  assert.equal(normalizeOsmId(-1), null);
  assert.equal(normalizeOsmId(1.5), null);
  assert.equal(normalizeOsmId(Number.MAX_SAFE_INTEGER + 2), null);
  assert.equal(normalizeOsmId("12a"), null);
  assert.equal(normalizeOsmId(""), null);
  assert.equal(normalizeOsmId(null), null);
  assert.equal(normalizeOsmId(undefined), null);
  assert.equal(normalizeOsmId(Number.NaN), null);
});

test("osm-alpr: the gate accepts node + way and requires man_made/type/scope together", () => {
  const node = gateAlprElement(alprNode(1));
  assert.equal(node.ok, true);
  assert.deepEqual(node.element, {
    type: "node",
    id: 1,
    lat: 40.0,
    lon: -75.0,
    tags: { man_made: "surveillance", surveillance: "public", "surveillance:type": "ALPR" },
  });

  const way = gateAlprElement({
    type: "way",
    id: 2,
    center: { lat: 41.5, lon: -72.5 },
    tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "outdoor" },
  });
  assert.equal(way.ok, true);
  assert.deepEqual(way.element.center, { lat: 41.5, lon: -72.5 });

  const cases = [
    [null, "malformed element"],
    ["node", "malformed element"],
    [{ type: "relation", id: 3, tags: {} }, "unsupported element type"],
    [{ type: "node", id: 0, tags: {} }, "invalid OSM id"],
    [{ type: "node", id: 4 }, "missing tags"],
    [{ type: "node", id: 5, tags: { man_made: "camera", "surveillance:type": "ALPR", surveillance: "public" } }, "man_made!=surveillance"],
    [{ type: "node", id: 6, tags: { man_made: "surveillance", "surveillance:type": "alpr", surveillance: "public" } }, "surveillance:type!=ALPR"],
    [{ type: "node", id: 7, tags: { man_made: "surveillance", "surveillance:type": "ALPR" } }, "missing surveillance scope"],
    [{ type: "node", id: 8, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "private" } }, "surveillance scope not public/outdoor"],
  ];
  for (const [element, reason] of cases) {
    const result = gateAlprElement(element);
    assert.equal(result.ok, false, `expected reject for ${JSON.stringify(element)}`);
    assert.equal(result.reason, reason);
  }
});

// ------------------------------------------------------------- strict selection

const GATE_FIXTURE = {
  elements: [
    // accepted: node, way (center), stringified id, outdoor scope
    alprNode(1, { lat: 38.8977, lon: -77.0365 }, { operator: "Metropolitan Police Department", "camera:direction": "90" }),
    { type: "way", id: 2, center: { lat: 40.7128, lon: -74.006 }, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "outdoor" } },
    alprNode("999", { lat: 34.0522, lon: -118.2437 }, { surveillance: "outdoor" }),
    // rejected: exact token + strict scope + element shape
    alprNode(10, {}, { "surveillance:type": "alpr" }),
    alprNode(11, {}, { "surveillance:type": "ALPR " }),
    alprNode(12, {}, { "surveillance:type": "alpr; ALPR" }),
    alprNode(13, {}, { "surveillance:type": "ANPR" }),
    alprNode(14, {}, { surveillance: undefined }),
    alprNode(15, {}, { surveillance: "indoor" }),
    alprNode(16, {}, { surveillance: "private" }),
    alprNode(17, {}, { surveillance: "outdoor " }),
    alprNode(18, {}, { surveillance: "Public" }),
    alprNode(19, {}, { man_made: "camera" }),
    alprNode(20, {}, { "surveillance:type": "guard", surveillance: "public" }),
    { type: "relation", id: 21, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "public" } },
    { type: "node", id: 22 },
    { type: "node", id: 22.5, lat: 1, lon: 1, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "public" } },
    // way with no center + node with no coordinates: skipped after the gate
    { type: "way", id: 23, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "public" } },
    { type: "node", id: 24, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "public" } },
    // untagged way child node (`out skel`) — skipped, never geocoded
    { type: "node", id: 25, lat: 40.0, lon: -75.0 },
    null,
  ],
};

const EXPECTED_SKIPS = {
  "surveillance:type!=ALPR": 5, // alpr, "ALPR ", "alpr; ALPR", ANPR, guard
  "missing surveillance scope": 1,
  "surveillance scope not public/outdoor": 4, // indoor, private, "outdoor ", "Public"
  "man_made!=surveillance": 1, // man_made=camera
  "unsupported element type": 1,
  "invalid OSM id": 1,
  "no coordinates": 2,
  "missing tags": 2, // id 22 (no tags) + the untagged way child node (id 25)
  "malformed element": 1,
};

test("osm-alpr: both country parsers accept only public/outdoor ALPR (everything else skipped)", () => {
  for (const { mod, slug } of ADAPTERS) {
    const { staged, skipped } = mod.parsePayload(GATE_FIXTURE);
    assert.deepEqual(
      staged.map((row) => row.external_id).sort(),
      ["osm:node/1", "osm:node/999", "osm:way/2"].sort(),
      `${slug}: only the three valid ALPR elements may be staged`,
    );
    for (const row of staged) assert.equal(row.kind, ALPR_KIND);

    assert.deepEqual(skipped.reasons, EXPECTED_SKIPS, `${slug}: per-reason skip counts`);
    const expectedTotal = Object.values(EXPECTED_SKIPS).reduce((sum, n) => sum + n, 0);
    assert.equal(skipped.total, expectedTotal);
    // Every input element lands in exactly one bucket.
    assert.equal(staged.length + skipped.total, GATE_FIXTURE.elements.length);
  }
});

test("osm-alpr: coordinates come from lat/lon for nodes and center for ways", () => {
  const { staged } = usa.parsePayload(GATE_FIXTURE);
  const byId = new Map(staged.map((row) => [row.external_id, row]));
  assert.equal(byId.get("osm:node/1").latitude, 38.8977);
  assert.equal(byId.get("osm:node/1").longitude, -77.0365);
  assert.equal(byId.get("osm:way/2").latitude, 40.7128);
  assert.equal(byId.get("osm:way/2").longitude, -74.006);
  assert.equal(byId.get("osm:node/999").latitude, 34.0522);
  assert.equal(byId.get("osm:node/1").direction, 90); // camera:direction, canonical int
});

// -------------------------------------------------------------------- privacy

test("osm-alpr: only allowlisted tags survive — no free text, links, photos or contributors", () => {
  const { staged } = usa.parsePayload({
    elements: [
      alprNode(100, { lat: 29.7604, lon: -95.3698 }, {
        description: "Tracked by officer Mario Rossi, call +1 555 0100",
        note: "see https://example.invalid/photo.jpg",
        image: "https://example.invalid/cam.jpg",
        mapillary: "1234567890",
        url: "https://example.invalid",
        "contact:email": "mario.rossi@example.org",
        wikidata: "Q123",
        created_by: "contributor-jdoe",
        check_date: "2026-01-01",
        source: "survey; user jdoe",
        operator: "Mario Rossi", // person → dropped by the entity-only policy
        "operator:wikidata": "Q456",
        brand: "Flock Safety",
      }),
    ],
  });
  assert.equal(staged.length, 1);
  const row = staged[0];
  assert.deepEqual(Object.keys(row).sort(), CANONICAL_ROW_KEYS);
  assert.equal(row.description, null);
  assert.equal(row.notes, null);
  assert.equal(row.address, null);
  const serialised = JSON.stringify(row);
  assert.doesNotMatch(serialised, /https?:|@|contributor|jdoe|Rossi|Flock|Q123|Q456|555/);
  assert.equal(row.title, "ALPR camera 100"); // no name tag → OSM ref only
});

test("osm-alpr: a link/e-mail masquerading as `name` is dropped, a real name is kept", () => {
  const { staged } = usa.parsePayload({
    elements: [
      alprNode(101, {}, { name: "https://example.invalid/cam" }),
      alprNode(102, {}, { name: "contact: ops@example.org" }),
      alprNode(103, {}, { name: "ALPR camera, Main St" }),
    ],
  });
  assert.deepEqual(staged.map((row) => row.title), [
    "ALPR camera 101",
    "ALPR camera 102",
    "ALPR camera, Main St",
  ]);
});

test("osm-alpr: operator is kept only when it looks like a public entity", () => {
  const { staged } = usa.parsePayload({
    elements: [
      alprNode(110, {}, { operator: "Metropolitan Police Department" }),
      alprNode(111, {}, { operator: "Mario Rossi" }),
      alprNode(112, {}, { operator: "City of Austin" }),
    ],
  });
  const notes = new Map(staged.map((row) => [row.external_id, row.notes]));
  assert.equal(notes.get("osm:node/110"), "Operatore: Metropolitan Police Department");
  assert.equal(notes.get("osm:node/111"), null);
  assert.equal(notes.get("osm:node/112"), "Operatore: City of Austin");
});

// ------------------------------------------------------- stable ids + titles

test("osm-alpr: external_id is stable across parses (idempotent) and namespaced osm:", () => {
  const first = usa.parsePayload(GATE_FIXTURE);
  const second = usa.parsePayload(JSON.parse(JSON.stringify(GATE_FIXTURE)));
  assert.deepEqual(first.staged, second.staged);
  for (const row of first.staged) assert.match(row.external_id, /^osm:(node|way)\/[0-9]+$/);
});

test("osm-alpr: unnamed cameras at the same gantry stay distinct rows", () => {
  // Two plate readers ~33 m apart, no names: the shared text-similarity dedup
  // must not fold them into one record — which is why unnamed titles carry the
  // OSM ref instead of the generic fallback title.
  const { staged } = usa.parsePayload({
    elements: [
      alprNode(201, { lat: 40.0, lon: -75.0 }),
      alprNode(202, { lat: 40.0003, lon: -75.0 }),
    ],
  });
  assert.equal(staged.length, 2);
  assert.deepEqual(staged.map((row) => row.title), ["ALPR camera 201", "ALPR camera 202"]);
});

// ------------------------------------------------------------ payload coercion

test("osm-alpr: payload coercion — object, array and JSON string; anything else fails closed", () => {
  const payload = { elements: [alprNode(300)] };
  assert.equal(elementsFromPayload(payload, "t").length, 1);
  assert.equal(elementsFromPayload([alprNode(301)], "t").length, 1);
  assert.equal(elementsFromPayload(JSON.stringify(payload), "t").length, 1);
  assert.throws(() => elementsFromPayload("{not json", "slug-x"), /\[slug-x\] ALPR source payload is not valid JSON/);
  assert.throws(() => elementsFromPayload({ nope: [] }, "slug-y"), /must be an object with an "elements" array/);
  assert.throws(() => elementsFromPayload(undefined, "slug-z"), /must be an object with an "elements" array/);
  assert.throws(() => usa.parsePayload("null"), /must be an object with an "elements" array/);
});

// ------------------------------------------- local-file mode (no network at all)

test("osm-alpr: local-file mode reads the extract and gates it (no Overpass)", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "osdb-alpr-local-"));
  const descriptorPath = fileURLToPath(
    new URL("../docs/data-sources/imports/osm-alpr-canada-2026.json", import.meta.url),
  );
  try {
    const extractPath = join(tmpDir, "elements.json");
    writeFileSync(extractPath, JSON.stringify(GATE_FIXTURE));
    const adapter = createOsmAlprAdapter({
      slug: "osm-alpr-canada-2026",
      iso3166: "CA",
      bbox: [-141.0, 41.6, -52.6, 83.2],
      descriptorPath,
      grid: { nx: 1, ny: 1 },
      localSourcePath: extractPath,
    });
    const fetched = await adapter.fetchPayload();
    assert.equal(fetched.elements.length, GATE_FIXTURE.elements.length);
    assert.match(fetched.checksum, /^[0-9a-f]{64}$/);
    const { staged, skipped } = adapter.parsePayload(fetched); // exactly what the runner calls
    assert.equal(staged.length, 3);
    assert.equal(skipped.total, 18);

    // A missing extract is a hard error, never an empty import.
    const broken = createOsmAlprAdapter({
      slug: "osm-alpr-canada-2026",
      iso3166: "CA",
      bbox: [-141.0, 41.6, -52.6, 83.2],
      descriptorPath,
      grid: { nx: 1, ny: 1 },
      localSourcePath: join(tmpDir, "missing.json"),
    });
    await assert.rejects(() => broken.fetchPayload(), /local OSM source file missing or unreadable/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --------------------------------------------------- runner: dry-run + apply

const RUNNER_FIXTURE = {
  elements: [
    alprNode(5001, { lat: 40.0, lon: -75.0 }, { operator: "Philadelphia Police Department" }),
    alprNode(5002, { lat: 40.0003, lon: -75.0 }), // ~33 m away: must NOT be deduped away
    { type: "way", id: 5003, center: { lat: 40.5, lon: -75.5 }, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "outdoor" } },
    alprNode(5004, {}, { surveillance: "indoor" }), // skipped by the gate
  ],
};

let db;

async function freshDb() {
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  return db;
}

function writeExtract(elements) {
  const dir = mkdtempSync(join(tmpdir(), "osdb-alpr-run-"));
  const file = join(dir, "elements.json");
  writeFileSync(file, JSON.stringify({ elements }));
  return { file, dir };
}

test("osm-alpr: runner --source dry-run loads the JSON string and stages the gated rows", async () => {
  await freshDb();
  const { file, dir } = writeExtract(RUNNER_FIXTURE.elements);
  try {
    const summary = await runImport(db, { slug: "osm-alpr-usa-2026", source: file, options: {} });
    assert.equal(summary.dryRun, true);
    assert.equal(summary.committed, false);
    assert.equal(summary.counts.total, 3);
    assert.equal(summary.counts.inserted, 3); // includes the co-located pair
    assert.equal(summary.counts.invalid, 0);
    assert.match(summary.checksum, /^[0-9a-f]{64}$/);
    assert.ok(
      summary.report.notes.some((note) => /parse-time skips: 1 row\(s\).*surveillance scope not public\/outdoor/.test(note)),
      JSON.stringify(summary.report.notes),
    );
    // Dry-run writes nothing.
    const n = (await db.prepare("SELECT COUNT(*) AS n FROM cameras").all()).results[0].n;
    assert.equal(n, 0);
    const batches = (await db.prepare("SELECT COUNT(*) AS n FROM import_batches").all()).results[0].n;
    assert.equal(batches, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("osm-alpr: runner --source apply writes canonical ALPR rows, then a re-run is a no-op", async () => {
  await freshDb();
  const { file, dir } = writeExtract(RUNNER_FIXTURE.elements);
  try {
    const summary = await runImport(db, { slug: "osm-alpr-usa-2026", source: file, options: { apply: true } });
    assert.equal(summary.committed, true);
    assert.equal(summary.counts.inserted, 3);
    assert.equal(summary.invariantTotal, summary.counts.total);

    const rows = (
      await db
        .prepare("SELECT title, kind, latitude, longitude, direction, status, source, external_id, description, notes, last_verified_at FROM cameras ORDER BY external_id")
        .all()
    ).results;
    assert.deepEqual(rows.map((row) => row.external_id), ["osm:node/5001", "osm:node/5002", "osm:way/5003"]);
    for (const row of rows) {
      assert.equal(row.kind, ALPR_KIND);
      assert.equal(row.status, "active");
      assert.equal(row.source, "import:osm-alpr-usa-2026");
      assert.equal(row.last_verified_at, null);
      assert.equal(row.description, "");
      assert.equal(row.direction, null);
    }
    // Entity operator → notes; person-like name would be dropped (see privacy test).
    assert.equal(rows[0].notes, "Operatore: Philadelphia Police Department");
    assert.equal(rows[0].title, "Philadelphia Police Department surveillance camera");
    assert.equal(rows[1].title, "ALPR camera 5002");

    const batch = await db.prepare("SELECT * FROM import_batches WHERE slug = 'osm-alpr-usa-2026'").first();
    assert.equal(batch.status, "committed");
    assert.equal(batch.license, "ODbL 1.0 (OSM)");
    assert.match(batch.attribution_text, /© OpenStreetMap contributors/);
    assert.equal(batch.source_url, "https://download.geofabrik.de/north-america/us.html");
    assert.equal(batch.records_inserted, 3);

    // Idempotency: same slug again aborts; --force re-runs without duplicating.
    await assert.rejects(
      () => runImport(db, { slug: "osm-alpr-usa-2026", source: file, options: { apply: true } }),
      /already committed/,
    );
    const forced = await runImport(db, { slug: "osm-alpr-usa-2026", source: file, options: { apply: true, force: true } });
    assert.equal(forced.counts.inserted, 0);
    assert.equal(forced.counts.skippedDuplicate, 3);
    const n = (await db.prepare("SELECT COUNT(*) AS n FROM cameras").all()).results[0].n;
    assert.equal(n, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("osm-alpr: the canada adapter runs end-to-end through the runner (dry-run)", async () => {
  await freshDb();
  const { file, dir } = writeExtract(RUNNER_FIXTURE.elements);
  try {
    const summary = await runImport(db, { slug: "osm-alpr-canada-2026", source: file, options: {} });
    assert.equal(summary.slug, "osm-alpr-canada-2026");
    assert.equal(summary.counts.total, 3);
    assert.equal(summary.counts.inserted, 3);
    assert.equal(summary.report.errors.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
