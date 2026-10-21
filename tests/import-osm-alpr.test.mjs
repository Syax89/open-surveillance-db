// OSM ALPR imports (DeFlock-equivalent selection) — US + CA file-mode adapters.
//
// Offline, no network, no real data. Covers:
//   - descriptors through the REAL validator + licence allowlist;
//   - the ALPR gate (node/way, numeric safe-integer ids, exact
//     man_made/surveillance:type, explicit public|outdoor scope);
//   - safe tag omission: no `name`/`operator` (a person's name can never
//     become a title or a note), no free text/links/photos/contributors;
//   - parity with the shared OSM normaliser on the same filtered tags;
//   - the real runner load/parse path for `--source=<file>` (JSON string),
//     dry-run + apply on a disposable in-memory D1, and idempotency.

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
import { loadDescriptor, validateDescriptorShape } from "../scripts/import/descriptor.mjs";
import { createOsmCountryAdapter } from "../scripts/import/adapters/osm-country-factory.mjs";
import { createOsmAlprAdapter } from "../scripts/import/adapters/osm-alpr-factory.mjs";
import * as usa from "../scripts/import/adapters/osm-alpr-usa-2026.mjs";
import * as canada from "../scripts/import/adapters/osm-alpr-canada-2026.mjs";

after(async () => cleanupDbRuntime());

const ALPR_KIND = "Traffic / licence plate reader";
const GENERIC_TITLE = "Surveillance camera";

const ADAPTERS = [
  { mod: usa, slug: "osm-alpr-usa-2026", geofabrik: "https://download.geofabrik.de/north-america/us.html", maxRecords: 250000 },
  { mod: canada, slug: "osm-alpr-canada-2026", geofabrik: "https://download.geofabrik.de/north-america/canada.html", maxRecords: 25000 },
];

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

test("osm-alpr: descriptors pass the real validator and keep OSM/ODbL provenance", async () => {
  for (const { mod, slug, geofabrik, maxRecords } of ADAPTERS) {
    const descriptor = await mod.getDescriptor();
    assert.deepEqual(validateDescriptorShape(descriptor), [], `${slug}: descriptor shape must be loadable`);
    assert.deepEqual(await loadDescriptor(slug), descriptor, `${slug}: loader returns the adapter's descriptor`);
    assert.equal(descriptor.format, "osm-overpass"); // supported family, payload is Overpass-shaped JSON
    assert.equal(descriptor.license, "ODbL 1.0 (OSM)");
    assert.equal(isLicenceImportable(descriptor.license), true);
    assert.equal(descriptor.license_url, "https://opendatacommons.org/licenses/odbl/1-0/");
    assert.match(descriptor.attribution_text, /© OpenStreetMap contributors/);
    assert.match(descriptor.attribution_text, /https:\/\/www\.openstreetmap\.org\/copyright/);
    assert.equal(descriptor.source_url, geofabrik);
    assert.equal(descriptor.external_id_prefix, "osm:");
    assert.equal(descriptor.max_records, maxRecords);
    assert.match(descriptor.source_name, /OpenStreetMap ALPR/);
    assert.doesNotMatch(descriptor.source_name, /©\s*DeFlock|DeFlock data/i);
    assert.match(descriptor.local_source_path, /^\.import-data\/osm-alpr-[a-z]+-2026\.elements\.json$/);
    assert.match(descriptor.notes, /Geofabrik/);
    assert.match(descriptor.notes, /ODbL 1\.0/);
  }
});

test("osm-alpr: country modules expose only the runner contract (no Overpass API)", () => {
  for (const { mod } of ADAPTERS) {
    assert.deepEqual(Object.keys(mod).sort(), ["fetchPayload", "getDescriptor", "parsePayload", "slug"]);
  }
});

test("osm-alpr: the extract is resolved inside the repo, and its absence is a local-file error", async () => {
  for (const { mod, slug } of ADAPTERS) {
    try {
      const fetched = await mod.fetchPayload(); // no extract on the test machine → local error
      assert.ok(Array.isArray(fetched.elements));
      assert.match(fetched.checksum, /^[0-9a-f]{64}$/);
    } catch (err) {
      assert.match(err.message, /local OSM source file missing or unreadable/);
      assert.ok(err.message.includes("/.import-data/"), err.message);
      assert.ok(err.message.includes(`${slug}.elements.json`), err.message);
      assert.doesNotMatch(err.message, /https?:|overpass|HTTP \d/i);
    }
  }
});

// ------------------------------------------------------------- strict selection

const GATE_FIXTURE = {
  elements: [
    // accepted
    alprNode(1, { lat: 38.8977, lon: -77.0365 }, { "camera:direction": "90", "addr:street": "Pennsylvania Ave" }),
    { type: "way", id: 2, center: { lat: 40.7128, lon: -74.006 }, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "outdoor" } },
    alprNode(3, { lat: 34.0522, lon: -118.2437 }, { surveillance: "outdoor" }),
    // exact token + strict scope
    alprNode(10, {}, { "surveillance:type": "alpr" }),
    alprNode(11, {}, { "surveillance:type": "ALPR " }),
    alprNode(12, {}, { "surveillance:type": "alpr; ALPR" }),
    alprNode(13, {}, { "surveillance:type": "ANPR" }),
    alprNode(14, {}, { "surveillance:type": "guard" }),
    alprNode(15, {}, { surveillance: undefined }),
    alprNode(16, {}, { surveillance: "indoor" }),
    alprNode(17, {}, { surveillance: "private" }),
    alprNode(18, {}, { surveillance: "outdoor " }),
    alprNode(19, {}, { surveillance: "Public" }),
    // object shape + numeric-only ids
    alprNode(20, {}, { man_made: "camera" }),
    { type: "relation", id: 21, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "public" } },
    { type: "node", id: 22 },
    alprNode("123", {}, {}),
    alprNode(24, {}, {}),
    alprNode(0, {}, {}),
    alprNode(1.5, {}, {}),
    // coordinates
    { type: "way", id: 26, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "public" } },
    { type: "node", id: 27, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "public" } },
    // untagged way child node (`out skel`)
    { type: "node", id: 28, lat: 40.0, lon: -75.0 },
    null,
  ],
};

const EXPECTED_SKIPS = {
  "surveillance:type!=ALPR": 5, // alpr, "ALPR ", "alpr; ALPR", ANPR, guard
  "missing surveillance scope": 1,
  "surveillance scope not public/outdoor": 4, // indoor, private, "outdoor ", "Public"
  "man_made!=surveillance": 1,
  "unsupported element type": 1,
  "missing tags": 2, // id 22 (no tags) + the untagged child node
  "invalid OSM id": 3, // "123" (string), 0, 1.5
  "no coordinates": 2,
  "malformed element": 1,
};

test("osm-alpr: both countries accept only public/outdoor ALPR with a numeric id", () => {
  for (const { mod, slug } of ADAPTERS) {
    const { staged, skipped } = mod.parsePayload(GATE_FIXTURE);
    assert.deepEqual(
      staged.map((row) => row.external_id).sort(),
      ["osm:node/1", "osm:node/24", "osm:node/3", "osm:way/2"].sort(),
      `${slug}: only valid public/outdoor ALPR elements may be staged`,
    );
    for (const row of staged) assert.equal(row.kind, ALPR_KIND);
    assert.deepEqual(skipped.reasons, EXPECTED_SKIPS, `${slug}: per-reason skip counts`);
    assert.equal(skipped.total, Object.values(EXPECTED_SKIPS).reduce((sum, n) => sum + n, 0));
    assert.equal(staged.length + skipped.total, GATE_FIXTURE.elements.length);
  }
});

test("osm-alpr: string ids are rejected, never normalised", () => {
  const { staged, skipped } = usa.parsePayload({
    elements: [alprNode("123"), alprNode("0123"), alprNode("node/123"), alprNode(123)],
  });
  assert.deepEqual(staged.map((row) => row.external_id), ["osm:node/123"]);
  assert.equal(skipped.reasons["invalid OSM id"], 3);
});

test("osm-alpr: coordinates come from lat/lon for nodes and center for ways", () => {
  const { staged } = usa.parsePayload(GATE_FIXTURE);
  const byId = new Map(staged.map((row) => [row.external_id, row]));
  assert.equal(byId.get("osm:node/1").latitude, 38.8977);
  assert.equal(byId.get("osm:node/1").longitude, -77.0365);
  assert.equal(byId.get("osm:node/1").direction, 90);
  assert.equal(byId.get("osm:node/1").address, "Pennsylvania Ave");
  assert.equal(byId.get("osm:way/2").latitude, 40.7128);
  assert.equal(byId.get("osm:way/2").longitude, -74.006);
  assert.equal(byId.get("osm:node/3").latitude, 34.0522);
});

// -------------------------------------------------------------------- privacy

test("osm-alpr: a person's name never becomes a title, a note or any other field", () => {
  const { staged } = usa.parsePayload({
    elements: [
      alprNode(100, { lat: 29.7604, lon: -95.3698 }, {
        name: "John Smith",
        operator: "John Smith",
        description: "Installed by John Smith, call +1 555 0100",
        note: "contact john@example.org",
        image: "https://example.invalid/cam.jpg",
        mapillary: "1234567890",
        url: "https://example.invalid",
        "contact:email": "john.smith@example.org",
        wikidata: "Q123",
        created_by: "contributor-jdoe",
      }),
      alprNode(101, {}, { name: "John Smith", operator: "Metropolitan Police Department" }),
    ],
  });
  assert.equal(staged.length, 2);
  for (const row of staged) {
    assert.deepEqual(Object.keys(row).sort(), CANONICAL_ROW_KEYS);
    assert.equal(row.title, GENERIC_TITLE); // name/operator are not forwarded at all
    assert.equal(row.notes, null);
    assert.equal(row.description, null);
    assert.doesNotMatch(JSON.stringify(row), /Smith|john|Rossi|Police|https?:|@|jdoe|Q123|555/);
  }
});

test("osm-alpr: street address and direction survive; free text, links and photos do not", () => {
  const { staged } = usa.parsePayload({
    elements: [
      alprNode(102, {}, {
        "addr:street": "Market Street",
        "addr:housenumber": "12",
        "addr:city": "Philadelphia",
        "camera:direction": "NW",
        "camera:type": "dome",
        name: "https://example.invalid/cam",
        description: "see https://example.invalid/photo.jpg",
      }),
    ],
  });
  const [row] = staged;
  assert.equal(row.address, "Market Street 12, Philadelphia");
  assert.equal(row.title, "Surveillance camera, Market Street 12");
  assert.equal(row.direction, 315); // NW
  assert.equal(row.kind, ALPR_KIND); // surveillance:type wins over camera:type
  assert.doesNotMatch(JSON.stringify(row), /https?:|example\.invalid/);
});

// ------------------------------------------- parity with the shared normaliser

test("osm-alpr: output equals the shared OSM normaliser on the same filtered tags", () => {
  const raw = [
    { type: "node", id: 7001, lat: 40.1, lon: -75.1, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "public", name: "John Smith", operator: "John Smith", source: "survey", "camera:type": "dome", "camera:direction": "90", "addr:street": "Market St", "addr:housenumber": "12", "addr:city": "Philadelphia" } },
    { type: "way", id: 7002, center: { lat: 41.2, lon: -73.2 }, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "outdoor", "camera:direction": "N" } },
    { type: "node", id: 7003, lat: 42.0, lon: -71.0, tags: { man_made: "surveillance", "surveillance:type": "ALPR", surveillance: "public", operator: "City of Boston" } },
  ];
  // The same elements with only the allowlisted tags — what the gate forwards.
  const filtered = [
    { type: "node", id: 7001, lat: 40.1, lon: -75.1, tags: { man_made: "surveillance", surveillance: "public", "surveillance:type": "ALPR", "camera:direction": "90", "addr:street": "Market St", "addr:housenumber": "12", "addr:city": "Philadelphia" } },
    { type: "way", id: 7002, center: { lat: 41.2, lon: -73.2 }, tags: { man_made: "surveillance", surveillance: "outdoor", "surveillance:type": "ALPR", "camera:direction": "N" } },
    { type: "node", id: 7003, lat: 42.0, lon: -71.0, tags: { man_made: "surveillance", surveillance: "public", "surveillance:type": "ALPR" } },
  ];
  const descriptorPath = fileURLToPath(
    new URL("../docs/data-sources/imports/osm-alpr-usa-2026.json", import.meta.url),
  );
  const shared = createOsmCountryAdapter({ slug: "osm-alpr-usa-2026", descriptorPath, localSourcePath: null });

  const ours = usa.parsePayload({ elements: raw });
  const theirs = shared.parsePayload({ elements: filtered });
  assert.deepEqual(ours.staged, theirs.staged); // no title rewrite, no forced kind
  assert.deepEqual(ours.skipped, theirs.skipped);
  assert.equal(ours.staged.find((row) => row.external_id === "osm:node/7001").notes, null);
});

// ------------------------------------------------------------ payload coercion

test("osm-alpr: payload is an {elements:[...]} object or a JSON string; anything else fails closed", () => {
  const payload = { elements: [alprNode(300)] };
  assert.equal(usa.parsePayload(payload).staged.length, 1);
  assert.equal(usa.parsePayload(JSON.stringify(payload)).staged.length, 1);
  assert.throws(() => usa.parsePayload("{not json"), /ALPR source payload is not valid JSON/);
  assert.throws(() => usa.parsePayload({ nope: [] }), /must be an object with an "elements" array/);
  assert.throws(() => usa.parsePayload([alprNode(301)]), /must be an object with an "elements" array/);
  assert.throws(() => usa.parsePayload(undefined), /must be an object with an "elements" array/);
});

// ------------------------------------------- local-file mode (no network at all)

test("osm-alpr: local-file mode reads the extract and gates it (no Overpass)", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "osdb-alpr-local-"));
  const descriptorPath = fileURLToPath(
    new URL("../docs/data-sources/imports/osm-alpr-canada-2026.json", import.meta.url),
  );
  const options = { slug: "osm-alpr-canada-2026", descriptorPath };
  try {
    const extractPath = join(tmpDir, "elements.json");
    writeFileSync(extractPath, JSON.stringify(GATE_FIXTURE));
    const adapter = createOsmAlprAdapter({ ...options, localSourcePath: extractPath });
    const fetched = await adapter.fetchPayload();
    assert.equal(fetched.elements.length, GATE_FIXTURE.elements.length);
    assert.match(fetched.checksum, /^[0-9a-f]{64}$/);
    const { staged, skipped } = adapter.parsePayload(fetched); // exactly what the runner calls
    assert.equal(staged.length, 4);
    assert.equal(skipped.total, 20);

    // A missing extract is a hard error, never an empty import.
    const broken = createOsmAlprAdapter({ ...options, localSourcePath: join(tmpDir, "missing.json") });
    await assert.rejects(() => broken.fetchPayload(), /local OSM source file missing or unreadable/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --------------------------------------------------- runner: dry-run + apply

const RUNNER_FIXTURE = {
  elements: [
    alprNode(5001, { lat: 40.0, lon: -75.0 }, { "addr:street": "Market St", name: "John Smith", operator: "John Smith" }),
    alprNode(5002, { lat: 40.3, lon: -75.3 }, { "camera:direction": "180" }),
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
    assert.equal(summary.counts.inserted, 3);
    assert.equal(summary.counts.invalid, 0);
    assert.match(summary.checksum, /^[0-9a-f]{64}$/);
    assert.ok(
      summary.report.notes.some((note) => /parse-time skips: 1 row\(s\).*surveillance scope not public\/outdoor/.test(note)),
      JSON.stringify(summary.report.notes),
    );
    // Dry-run writes nothing.
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM cameras").all()).results[0].n, 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM import_batches").all()).results[0].n, 0);
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
        .prepare("SELECT title, kind, latitude, longitude, direction, address, status, source, external_id, description, notes, last_verified_at FROM cameras ORDER BY external_id")
        .all()
    ).results;
    assert.deepEqual(rows.map((row) => row.external_id), ["osm:node/5001", "osm:node/5002", "osm:way/5003"]);
    for (const row of rows) {
      assert.equal(row.kind, ALPR_KIND);
      assert.equal(row.status, "active");
      assert.equal(row.source, "import:osm-alpr-usa-2026");
      assert.equal(row.last_verified_at, null);
      assert.equal(row.description, "");
      assert.equal(row.notes, "");
      assert.doesNotMatch(JSON.stringify(row), /Smith/);
    }
    assert.equal(rows[0].title, "Surveillance camera, Market St");
    assert.equal(rows[0].address, "Market St");
    assert.equal(rows[1].direction, 180);
    assert.equal(rows[2].title, GENERIC_TITLE);

    const batch = await db.prepare("SELECT * FROM import_batches WHERE slug = 'osm-alpr-usa-2026'").first();
    assert.equal(batch.status, "committed");
    assert.equal(batch.format, "osm-overpass");
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
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM cameras").all()).results[0].n, 3);
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
