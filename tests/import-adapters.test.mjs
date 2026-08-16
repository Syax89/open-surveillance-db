// Import adapter tests (FASE B — kanban t_c338e9df).
// Exercises the three adapters (zurigo / milano / osm) and their shared
// helpers against offline fixtures: field mapping, kind/direction mapping,
// coordinate validation, skip_if filters, external_id generation, PII-safe
// operator handling. No network, no DB — pure unit tests.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DOME_KIND,
  cleanText,
  hashExternalId,
  mapKind,
  parseDirection,
  validateStagedRow,
} from "../scripts/import/adapters/lib.mjs";
import { parsePayload as zurigoParse } from "../scripts/import/adapters/zurigo-videokameras-2026.mjs";
import { parsePayload as milanoParse } from "../scripts/import/adapters/milano-varchi-2026.mjs";
import {
  buildQuery,
  chunkBbox,
  looksLikeEntityOperator,
  parsePayload as osmParse,
} from "../scripts/import/adapters/osm-surveillance-italia-2026.mjs";

// ---------------------------------------------------------------- lib helpers

test("parseDirection: numeric degrees", () => {
  assert.equal(parseDirection("0"), 0);
  assert.equal(parseDirection("200"), 200);
  assert.equal(parseDirection("359"), 359);
  assert.equal(parseDirection("360"), 0); // normalized per design § 3.5
  assert.equal(parseDirection("045"), 45);
});

test("parseDirection: compass words EN/IT/DE (16-wind)", () => {
  assert.equal(parseDirection("N"), 0);
  assert.equal(parseDirection("NE"), 45);
  assert.equal(parseDirection("nne"), 23);
  assert.equal(parseDirection("nord-est"), 45);
  assert.equal(parseDirection("südost"), 135);
  assert.equal(parseDirection("westen"), 270);
  assert.equal(parseDirection("NNW"), 338);
});

test("parseDirection: invalid/absent → null", () => {
  assert.equal(parseDirection(""), null);
  assert.equal(parseDirection(null), null);
  assert.equal(parseDirection(undefined), null);
  assert.equal(parseDirection("400"), null);
  assert.equal(parseDirection("north-west-ish"), null);
  assert.equal(parseDirection("abc"), null);
});

test("mapKind: mapped values use canonical kinds, unmapped → Other / unknown", () => {
  const kindMap = {
    dome: "Fixed dome",
    fixed: "Bullet",
    panning: "PTZ",
    alpr: "Traffic / licence plate reader",
  };
  assert.deepEqual(mapKind("DOME", kindMap), { kind: DOME_KIND, mapped: true });
  assert.deepEqual(mapKind("Fixed", kindMap), { kind: "Bullet", mapped: true });
  assert.deepEqual(mapKind("Panning", kindMap), { kind: "PTZ", mapped: true });
  assert.deepEqual(mapKind("ALPR", kindMap), { kind: "Traffic / licence plate reader", mapped: true });
  // Unmapped source value → honest unknown, never the raw string.
  assert.deepEqual(mapKind("Flir PTZ-3000", kindMap), { kind: "Other / unknown", mapped: false });
  assert.deepEqual(mapKind(null, kindMap), { kind: "Other / unknown", mapped: false });
  assert.deepEqual(mapKind(undefined, kindMap), { kind: "Other / unknown", mapped: false });
});

test("hashExternalId: deterministic, distinct for different sites", () => {
  const a = hashExternalId("Quartierwache Hottingen", 47.3694, 8.5562);
  const b = hashExternalId("Quartierwache Hottingen", 47.3694, 8.5562);
  const c = hashExternalId("Quartierwache Hottingen", 47.3695, 8.5562);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{16}$/);
});

test("validateStagedRow: canonical row passes, each violation is caught", () => {
  const good = {
    title: "PORTA TENAGLIA",
    kind: "Traffic / licence plate reader",
    latitude: 45.477615,
    longitude: 9.181736,
    direction: null,
    external_id: "milano:areac:57",
  };
  assert.equal(validateStagedRow(good).ok, true);

  assert.equal(validateStagedRow({ ...good, title: "" }).ok, false);
  assert.equal(validateStagedRow({ ...good, title: "x".repeat(91) }).ok, false);
  assert.equal(validateStagedRow({ ...good, latitude: 91 }).ok, false);
  assert.equal(validateStagedRow({ ...good, latitude: -91 }).ok, false);
  assert.equal(validateStagedRow({ ...good, longitude: 181 }).ok, false);
  assert.equal(validateStagedRow({ ...good, latitude: "abc" }).ok, false);
  assert.equal(validateStagedRow({ ...good, latitude: 0, longitude: 0 }).ok, false); // origin rejected
  assert.equal(validateStagedRow({ ...good, latitude: 0, longitude: 0 }, { allowOrigin: true }).ok, true);
  assert.equal(validateStagedRow({ ...good, kind: "Cupola" }).ok, false); // non-canonical
  assert.equal(validateStagedRow({ ...good, external_id: null }).ok, false);
  assert.equal(validateStagedRow({ ...good, direction: 400 }).ok, false);
  assert.equal(validateStagedRow({ ...good, direction: 12.5 }).ok, false); // must be integer
  assert.equal(validateStagedRow({ ...good, direction: -5 }).ok, false);
});

test("validateStagedRow: dome invariant — direction forced null", () => {
  const dome = {
    title: "Dome cam",
    kind: DOME_KIND,
    latitude: 45.0,
    longitude: 9.0,
    direction: 120,
    external_id: "osm:node/1",
  };
  const result = validateStagedRow(dome);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("dome")));
});

test("cleanText: whitespace collapse, length cap, empty → null", () => {
  assert.equal(cleanText("  a  b  "), "a b");
  assert.equal(cleanText(""), null);
  assert.equal(cleanText(null), null);
  assert.equal(cleanText("x".repeat(10), 5), "xxxx…");
});

// --------------------------------------------------------------------- Zürich

const ZURIGO_FIXTURE_CSV = [
  "\uFEFF\"standort_beschreibung\",\"adresse_beschreibung\",\"lat\",\"lon\",\"anzahl_kameras_aussen\",\"anzahl_kameras_innen\",\"anzahl_kameras_gsa\",\"bereich_detail_beschreibung\",\"aufbewahrungsdauer\",\"verantwortliche_da\",\"rechtsgrundlage_url\"",
  "\"EWZ Unterwerk Auwiesen\",\"Aubruggweg 21, 8050 Zürich, Switzerland\",\"47.41234\",\"8.570868\",\"1\",\"0\",\"0\",\"Einfahrtstor zum Haupteingang\",\"15\",\"Elektrizitätswerk der Stadt Zürich\",\"https://example.ch/reglement\"",
  "\"Stadthaus Zürich\",\"Stadthausquai 17, 8001 Zürich, Switzerland\",\"47.3692\",\"8.5412\",\"2\",\"1\",\"0\",\"Eingang Stadthausquai\",\"30\",\"Sicherheitsdepartement der Stadt Zürich\",\"https://example.ch/reglement\"",
  "\"Nur Titel Ohne Adresse\",\"\",\"47.35\",\"8.52\",\"1\",\"0\",\"0\",\"\",\"15\",\"Stadt Zürich\",\"\"",
  "\"Riga senza coordinate\",\"Via Test 1, Zürich\",\"\",\"\",\"1\",\"0\",\"0\",\"\",\"15\",\"Stadt Zürich\",\"\"",
  "\"Città con virgola in campo\",\"Zollikerstrasse 128, 8008 Zürich, Switzerland\",\"47.36\",\"8.56\",\"1\",\"0\",\"0\",\"Area con \"\"virgolette\"\" interne\",\"15\",\"Stadt Zürich\",\"\"",
].join("\r\n");

test("zurigo: parses fixture CSV into canonical staged rows", () => {
  const { staged, skipped } = zurigoParse({ text: ZURIGO_FIXTURE_CSV });
  assert.equal(staged.length, 4); // the no-coordinates row is dropped
  assert.equal(skipped.total, 1);
  assert.deepEqual(skipped.reasons, ["non-finite coordinates"]);

  const row = staged[0];
  assert.equal(row.title, "EWZ Unterwerk Auwiesen");
  assert.equal(row.address, "Aubruggweg 21, 8050 Zürich, Switzerland");
  assert.equal(row.latitude, 47.41234);
  assert.equal(row.longitude, 8.570868);
  assert.equal(row.kind, "Other / unknown"); // source has no kind info
  assert.equal(row.direction, null);
  assert.equal(row.description, "Einfahrtstor zum Haupteingang");
  assert.match(row.external_id, /^[0-9a-f]{16}$/);
  // Privacy gate: responsible party / retention / legal basis never ingested.
  assert.equal("verantwortliche_da" in row, false);
  assert.equal("aufbewahrungsdauer" in row, false);
});

test("zurigo: quoted field with escaped quotes parses correctly", () => {
  const { staged } = zurigoParse({ text: ZURIGO_FIXTURE_CSV });
  const row = staged.find((r) => r.title === "Città con virgola in campo");
  assert.ok(row);
  assert.equal(row.description, 'Area con "virgolette" interne');
});

test("zurigo: external_id deterministic across parses (idempotency)", () => {
  const a = zurigoParse({ text: ZURIGO_FIXTURE_CSV });
  const b = zurigoParse({ text: ZURIGO_FIXTURE_CSV });
  assert.deepEqual(
    a.staged.map((r) => r.external_id),
    b.staged.map((r) => r.external_id),
  );
});

test("zurigo: empty payload → no staged rows", () => {
  const { staged, skipped } = zurigoParse({ text: "" });
  assert.equal(staged.length, 0);
  assert.equal(skipped.total, 0);
});

// --------------------------------------------------------------------- Milano

function milanoFixture() {
  const areaC = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id_amat: 57, label: "PORTA TENAGLIA" },
        geometry: { type: "Point", coordinates: [9.181736, 45.477615] },
      },
      {
        type: "Feature",
        properties: { id_amat: 58, label: "LEGNANO" },
        geometry: { type: "Point", coordinates: [9.1901, 45.4701] },
      },
    ],
  };
  const areaB = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id_amat: 57, nome: "057 - CERTOSA 2", stato: "ATTIVI E SANZIONANTI" },
        geometry: { type: "Point", coordinates: [9.175, 45.505] },
      },
      {
        type: "Feature",
        properties: { id_amat: 58, nome: "058 - BRESSANONE", stato: "DA PROGRAMMARE PRE-ESERCIZIO" },
        geometry: { type: "Point", coordinates: [9.16, 45.51] },
      },
      {
        type: "Feature",
        properties: { id_amat: 1, nome: "001 - CORELLI", stato: "IN PRE-ESERCIZIO" },
        geometry: { type: "Point", coordinates: [9.261, 45.471] },
      },
      {
        type: "Feature",
        properties: { id_amat: 99 },
        geometry: { type: "LineString", coordinates: [[9.0, 45.0], [9.1, 45.1]] },
      },
    ],
  };
  return { payloads: [{ key: "areaC", geojson: areaC }, { key: "areaB", geojson: areaB }] };
}

test("milano: external_id namespaced per dataset (same id_amat in C and B)", () => {
  const { staged } = milanoParse(milanoFixture());
  const ids = staged.map((r) => r.external_id);
  assert.ok(ids.includes("milano:areac:57"));
  assert.ok(ids.includes("milano:areab:57"));
  assert.equal(new Set(ids).size, ids.length); // no collisions
});

test("milano: kind = Traffic / licence plate reader (varchi elettronici)", () => {
  const { staged } = milanoParse(milanoFixture());
  for (const row of staged) assert.equal(row.kind, "Traffic / licence plate reader");
});

test("milano: skip_if stato 'DA PROGRAMMARE PRE-ESERCIZIO' drops the row", () => {
  const { staged, skipped } = milanoParse(milanoFixture());
  assert.equal(staged.some((r) => r.title === "058 - BRESSANONE"), false);
  assert.equal(skipped.total, 2); // 1 da-programmare + 1 non-Point
  assert.equal(skipped.reasons["skip_if:stato=DA PROGRAMMARE PRE-ESERCIZIO"], 1);
  assert.equal(skipped.reasons["non-Point geometry"], 1);
});

test("milano: label/nome → title, coordinates from Point [lon, lat]", () => {
  const { staged } = milanoParse(milanoFixture());
  const porta = staged.find((r) => r.external_id === "milano:areac:57");
  assert.equal(porta.title, "PORTA TENAGLIA");
  assert.equal(porta.latitude, 45.477615);
  assert.equal(porta.longitude, 9.181736);
});

// ----------------------------------------------------------------------- OSM

test("osm: chunkBbox splits Italy into a covering nx×ny grid", () => {
  const chunks = chunkBbox([6.5, 35.4, 19.0, 47.2], 4, 3);
  assert.equal(chunks.length, 12);
  const dLat = (47.2 - 35.4) / 3; // 3.9333…
  const dLon = (19.0 - 6.5) / 4; // 3.125
  // First chunk starts at the south-west corner, last ends at north-east.
  assert.deepEqual(chunks[0], [35.4, 6.5, 35.4 + dLat, 6.5 + dLon]);
  assert.deepEqual(chunks[11], [35.4 + 2 * dLat, 6.5 + 3 * dLon, 47.2, 19.0]);
  // Adjacent chunks share edges (no gaps / no overlap).
  for (let iy = 0; iy < 3; iy += 1) {
    for (let ix = 0; ix < 4; ix += 1) {
      const idx = iy * 4 + ix;
      if (ix < 3) assert.equal(chunks[idx][2], chunks[idx + 1][2]); // same north
    }
  }
});

test("osm: buildQuery targets node+way man_made=surveillance public|outdoor", () => {
  const q = buildQuery([45.4, 9.1, 45.5, 9.3], { timeout: 60 });
  assert.match(q, /\[out:json\]\[timeout:60\]/);
  // Italy admin area is resolved and intersected with the bbox chunk
  assert.match(q, /area\["ISO3166-1"="IT"\]\[admin_level=2\]->\.it;/);
  assert.match(q, /node\["man_made"="surveillance"\]\["surveillance"~"\^\(public\|outdoor\)\$"\]\(area\.it\)\(45\.4000,9\.1000,45\.5000,9\.3000\)/);
  assert.match(q, /way\["man_made"="surveillance"\]/);
  assert.match(q, /out center/);
});

function osmFixture() {
  const elements = [
    // node with full tags: dome + no direction (invariant) + entity operator
    { type: "node", id: 1, lat: 45.1, lon: 9.1, tags: { name: "Corso Como", "camera:type": "dome", "camera:direction": "120", operator: "Comune di Milano", surveillance: "public" } },
    // bullet with numeric direction + region operator
    { type: "node", id: 2, lat: 45.2, lon: 9.2, tags: { "camera:type": "fixed", "camera:direction": "200", operator: "Regione Lombardia", surveillance: "outdoor" } },
    // PTZ
    { type: "node", id: 3, lat: 45.3, lon: 9.3, tags: { "camera:type": "panning", "camera:direction": "NNE", surveillance: "public" } },
    // ALPR via surveillance:type (overrides camera:type)
    { type: "node", id: 4, lat: 45.4, lon: 9.4, tags: { "camera:type": "fixed", "surveillance:type": "alpr", operator: "Polizia Locale - Comune di Milano", surveillance: "public" } },
    // guard → skipped (not a camera)
    { type: "node", id: 5, lat: 45.5, lon: 9.5, tags: { "surveillance:type": "guard", surveillance: "public" } },
    // indoor → skipped
    { type: "node", id: 6, lat: 45.6, lon: 9.6, tags: { surveillance: "indoor" } },
    // person-like operator → notes dropped (PII gate)
    { type: "node", id: 7, lat: 45.7, lon: 9.7, tags: { operator: "Mario Rossi", "camera:type": "fixed", surveillance: "public" } },
    // no name, no operator → generated title from addr:street
    { type: "node", id: 8, lat: 45.8, lon: 9.8, tags: { "addr:street": "Via Garibaldi", "addr:housenumber": "12", "addr:city": "Milano", "camera:type": "fixed", surveillance: "public" } },
    // way with center
    { type: "way", id: 900, center: { lat: 45.9, lon: 9.9 }, tags: { name: "Viale della Tecnica", "camera:type": "fixed", surveillance: "public" } },
    // no coordinates at all → skipped
    { type: "node", id: 10, tags: { "camera:type": "fixed", surveillance: "public" } },
  ];
  return { elements };
}

test("osm: camera:type → kind mapping (dome/fixed/panning)", () => {
  const { staged } = osmParse(osmFixture());
  const byId = (id) => staged.find((r) => r.external_id === `osm:node/${id}`);
  assert.equal(byId(1).kind, "Fixed dome");
  assert.equal(byId(2).kind, "Bullet");
  assert.equal(byId(3).kind, "PTZ");
});

test("osm: dome forces direction NULL even when camera:direction is set", () => {
  const { staged } = osmParse(osmFixture());
  const dome = staged.find((r) => r.external_id === "osm:node/1");
  assert.equal(dome.direction, null);
});

test("osm: direction from degrees and compass words", () => {
  const { staged } = osmParse(osmFixture());
  assert.equal(staged.find((r) => r.external_id === "osm:node/2").direction, 200);
  assert.equal(staged.find((r) => r.external_id === "osm:node/3").direction, 23); // NNE → 22.5 → 23
});

test("osm: surveillance:type=alpr overrides kind; guard and indoor are skipped", () => {
  const { staged, skipped } = osmParse(osmFixture());
  const alpr = staged.find((r) => r.external_id === "osm:node/4");
  assert.equal(alpr.kind, "Traffic / licence plate reader");
  assert.equal(staged.some((r) => r.external_id === "osm:node/5"), false); // guard
  assert.equal(staged.some((r) => r.external_id === "osm:node/6"), false); // indoor
  assert.equal(skipped.reasons["surveillance:type=guard"], 1);
  assert.equal(skipped.reasons["surveillance=indoor"], 1);
});

test("osm: operator → notes only for public entities, never person names", () => {
  const { staged } = osmParse(osmFixture());
  const byId = (id) => staged.find((r) => r.external_id === `osm:node/${id}`);
  assert.equal(byId(2).notes, "Operatore: Regione Lombardia");
  assert.equal(byId(4).notes, "Operatore: Polizia Locale - Comune di Milano");
  assert.equal(byId(7).notes, null); // "Mario Rossi" looks like a person
  assert.equal(byId(7).title, "Surveillance camera"); // operator not usable as title either
});

test("osm: title generation fallbacks (name → operator → street → generic)", () => {
  const { staged } = osmParse(osmFixture());
  const byId = (id) => staged.find((r) => r.external_id === `osm:node/${id}`);
  assert.equal(byId(1).title, "Corso Como"); // name wins
  assert.equal(byId(2).title, "Regione Lombardia surveillance camera"); // operator + generic
  assert.equal(byId(8).title, "Surveillance camera, Via Garibaldi 12"); // street + number
  assert.equal(byId(8).address, "Via Garibaldi 12, Milano");
  assert.equal(byId(7).title, "Surveillance camera"); // last resort
});

test("osm: way elements use center coordinates", () => {
  const { staged } = osmParse(osmFixture());
  const way = staged.find((r) => r.external_id === "osm:way/900");
  assert.ok(way);
  assert.equal(way.latitude, 45.9);
  assert.equal(way.longitude, 9.9);
  assert.equal(way.kind, "Bullet");
});

test("osm: elements without coordinates are skipped, others valid", () => {
  const { staged, skipped } = osmParse(osmFixture());
  assert.equal(staged.some((r) => r.external_id === "osm:node/10"), false);
  assert.equal(skipped.reasons["no coordinates"], 1);
  for (const row of staged) assert.equal(validateStagedRow(row).ok, true);
});

test("osm: looksLikeEntityOperator heuristics", () => {
  assert.equal(looksLikeEntityOperator("Comune di Milano"), true);
  assert.equal(looksLikeEntityOperator("Polizei Berlin"), true);
  assert.equal(looksLikeEntityOperator("EWZ"), true); // acronym
  assert.equal(looksLikeEntityOperator("ACME Security GmbH"), true); // legal form
  assert.equal(looksLikeEntityOperator("Mario Rossi"), false); // person name
  assert.equal(looksLikeEntityOperator("Giuseppe Verdi"), false);
  assert.equal(looksLikeEntityOperator(""), false);
  assert.equal(looksLikeEntityOperator(null), false);
});

// ------------------------------------------------------------- OSM country factory

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOsmCountryAdapter } from "../scripts/import/adapters/osm-country-factory.mjs";
import {
  buildQuery as atBuildQuery,
  parsePayload as atParse,
} from "../scripts/import/adapters/osm-surveillance-austria-2026.mjs";
import {
  buildQuery as chBuildQuery,
} from "../scripts/import/adapters/osm-surveillance-svizzera-2026.mjs";
import {
  buildQuery as deBuildQuery,
  parsePayload as deParse,
} from "../scripts/import/adapters/osm-surveillance-germania-2026.mjs";
import {
  buildQuery as frBuildQuery,
  parsePayload as frParse,
} from "../scripts/import/adapters/osm-surveillance-francia-2026.mjs";
import {
  buildQuery as gbBuildQuery,
  parsePayload as gbParse,
} from "../scripts/import/adapters/osm-surveillance-regno-unito-2026.mjs";
import {
  buildQuery as nlBuildQuery,
  parsePayload as nlParse,
} from "../scripts/import/adapters/osm-surveillance-paesi-bassi-2026.mjs";
import {
  buildQuery as esBuildQuery,
  parsePayload as esParse,
} from "../scripts/import/adapters/osm-surveillance-spagna-2026.mjs";

test("osm-factory: buildQuery targets the right ISO3166 admin area per country", () => {
  const at = atBuildQuery([46.5, 9.7, 46.6, 9.8], { timeout: 60 });
  assert.match(at, /area\["ISO3166-1"="AT"\]\[admin_level=2\]->\.at;/);
  assert.match(at, /\(area\.at\)\(46\.5000,9\.7000,46\.6000,9\.8000\)/);
  const ch = chBuildQuery([46.9, 6.1, 47.0, 6.2], { timeout: 60 });
  assert.match(ch, /area\["ISO3166-1"="CH"\]\[admin_level=2\]->\.ch;/);
  const de = deBuildQuery([48.1, 8.1, 48.2, 8.2], { timeout: 60 });
  assert.match(de, /area\["ISO3166-1"="DE"\]\[admin_level=2\]->\.de;/);
  const fr = frBuildQuery([46.5, 2.1, 46.6, 2.2], { timeout: 60 });
  assert.match(fr, /area\["ISO3166-1"="FR"\]\[admin_level=2\]->\.fr;/);
  const gb = gbBuildQuery([52.1, -1.1, 52.2, -1.0], { timeout: 60 });
  assert.match(gb, /area\["ISO3166-1"="GB"\]\[admin_level=2\]->\.gb;/);
  const nl = nlBuildQuery([52.1, 4.9, 52.2, 5.0], { timeout: 60 });
  assert.match(nl, /area\["ISO3166-1"="NL"\]\[admin_level=2\]->\.nl;/);
  const es = esBuildQuery([40.1, -3.1, 40.2, -3.0], { timeout: 60 });
  assert.match(es, /area\["ISO3166-1"="ES"\]\[admin_level=2\]->\.es;/);
});

test("osm-factory: parsePayload maps the same canonical rows for every country", () => {
  const fixture = {
    elements: [
      { type: "node", id: 1, lat: 48.1, lon: 16.3, tags: { name: "Stephansplatz", "camera:type": "dome", operator: "Stadt Wien", surveillance: "public" } },
      { type: "node", id: 2, lat: 47.4, lon: 8.5, tags: { "camera:type": "fixed", "camera:direction": "90", operator: "Stadtpolizei Zürich", surveillance: "outdoor" } },
      { type: "node", id: 3, lat: 52.5, lon: 13.4, tags: { "camera:type": "panning", surveillance: "public", operator: "Berliner Polizei" } },
      { type: "node", id: 4, lat: 52.6, lon: 13.5, tags: { "surveillance:type": "guard", surveillance: "public" } },
      { type: "node", id: 5, lat: 52.7, lon: 13.6, tags: { surveillance: "indoor" } },
    ],
  };
  const at = atParse(fixture);
  const de = deParse(fixture);
  const fr = frParse(fixture);
  const gb = gbParse(fixture);
  const nl = nlParse(fixture);
  const es = esParse(fixture);
  for (const p of [at, de, fr, gb, nl, es]) {
    assert.equal(p.staged.length, 3); // guard + indoor skipped
    assert.equal(p.skipped.reasons["surveillance:type=guard"], 1);
    assert.equal(p.skipped.reasons["surveillance=indoor"], 1);
  }
  const dome = de.staged.find((r) => r.external_id === "osm:node/1");
  assert.equal(dome.kind, "Fixed dome");
  assert.equal(dome.direction, null); // dome invariant
  assert.equal(dome.notes, "Operatore: Stadt Wien"); // entity operator kept
  const fixed = de.staged.find((r) => r.external_id === "osm:node/2");
  assert.equal(fixed.kind, "Bullet");
  assert.equal(fixed.direction, 90);
});

test("osm-factory: localSourcePath mode reads a local JSON extract (no Overpass)", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "osdb-osm-local-"));
  const elementsPath = join(tmpDir, "elements.json");
  try {
    writeFileSync(
      elementsPath,
      JSON.stringify({
        elements: [
          { type: "node", id: 1, lat: 48.85, lon: 2.35, tags: { name: "Tour Eiffel", "camera:type": "dome", operator: "Ville de Paris", surveillance: "public" } },
          { type: "way", id: 2, center: { lat: 48.86, lon: 2.36 }, tags: { surveillance: "outdoor", operator: "Préfecture de Police" } },
        ],
      }),
    );
    const descriptorPath = fileURLToPath(
      new URL("../docs/data-sources/imports/osm-surveillance-francia-2026.json", import.meta.url),
    );
    const adapter = createOsmCountryAdapter({
      slug: "test-local",
      iso3166: "FR",
      bbox: [-5.5, 41.2, 9.8, 51.2],
      descriptorPath,
      grid: { nx: 1, ny: 1 },
      localSourcePath: elementsPath,
    });
    const { elements, checksum } = await adapter.fetchPayload();
    assert.equal(elements.length, 2);
    assert.match(checksum, /^[0-9a-f]{64}$/);
    const { staged } = adapter.parsePayload({ elements });
    assert.equal(staged.length, 2);
    assert.ok(staged.some((r) => r.external_id === "osm:node/1"));
    assert.ok(staged.some((r) => r.external_id === "osm:way/2"));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------- Bern / Hamburg official

import { lv95ToWgs84, mapRow } from "../scripts/import/adapters/berna-videouberwachung-2026.mjs";
import { parsePayload as hamburgParse } from "../scripts/import/adapters/amburgo-verkehrskameras-2026.mjs";
import { isLicenceImportable } from "../scripts/import/licence-gate.mjs";

test("bern: LV95→WGS84 conversion lands in Bern (46.95, 7.44) for the city centre", () => {
  const { lat, lon } = lv95ToWgs84(2600000, 1200000);
  assert.ok(Math.abs(lat - 46.951) < 0.002, `lat ${lat}`);
  assert.ok(Math.abs(lon - 7.439) < 0.002, `lon ${lon}`);
});

test("bern: parses GeoParquet-shaped rows into canonical staged rows", () => {
  const mapped = mapRow({
    objectid: 62, gebaed_de: "Spital Riggisberg", plz: 3132, ortsname: "Riggisberg", strname: "Eyweg", hausnr: "2", zustng_de: "Insel Gruppe AG", xkoord: 2602981.5, ykoord: 1184740.375,
  });
  assert.ok(mapped.staged, "row should map");
  const row = mapped.staged;
  assert.equal(row.title, "Spital Riggisberg");
  assert.equal(row.address, "Eyweg 2, 3132 Riggisberg");
  assert.equal(row.notes, "Gestione: Insel Gruppe AG");
  assert.equal(row.external_id, "be-video:62");
});

test("hamburg: parses OGC API GeoJSON features into canonical staged rows", () => {
  const { staged } = hamburgParse({
    features: [
      { id: "k1", geometry: { type: "Point", coordinates: [10.038, 53.503] }, properties: { lage: "A1 AK Hamburg-Süd", anmerkung: "Kamera mit mehreren Blickrichtungen" } },
      { id: "k2", geometry: { type: "Point", coordinates: [9.99, 53.55] }, properties: { lage: "B7 Volkspark" } },
      { id: "k3", geometry: { type: "LineString", coordinates: [] }, properties: {} },
    ],
  });
  assert.equal(staged.length, 2); // LineString skipped
  assert.equal(staged[0].title, "A1 AK Hamburg-Süd");
  assert.equal(staged[0].latitude, 53.503);
  assert.equal(staged[0].longitude, 10.038);
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.match(staged[0].external_id, /^hh-verkehrskamera:k1$/);
});

test("licence-gate: dl-de-by-2.0 and Swiss open-use are importable; CC BY-NC is not", () => {
  assert.equal(isLicenceImportable("Datenlizenz Deutschland Namensnennung 2.0 (dl-de-by-2.0)"), true);
  assert.equal(isLicenceImportable("dl-de-by-2.0"), true);
  assert.equal(isLicenceImportable("Open use. Attribution required (Kanton Bern)"), true);
  assert.equal(isLicenceImportable("CC BY-NC 4.0"), false);
});

// -------------------------------------------------- FR / ES / NL official sources

import { parsePayload as gpsoParse } from "../scripts/import/adapters/francia-gpso-videoprotection-2026.mjs";
import { parsePayload as pvppParse } from "../scripts/import/adapters/francia-pvpp-cameras-2026.mjs";
import { parsePayload as agenParse } from "../scripts/import/adapters/francia-agen-cameras-2026.mjs";
import { parsePayload as dgtParse } from "../scripts/import/adapters/spagna-dgt-camaras-2026.mjs";
import { utm30ToWgs84, parsePayload as madridParse } from "../scripts/import/adapters/spagna-madrid-camaras-2026.mjs";
import { parsePayload as bcnParse } from "../scripts/import/adapters/spagna-barcelona-cameras-2026.mjs";
import { parsePayload as utrechtParse } from "../scripts/import/adapters/paesi-bassi-utrecht-cameraregister-2026.mjs";
import { rdToWgs84, parsePayload as amsParse } from "../scripts/import/adapters/paesi-bassi-amsterdam-verkeerscamera-2026.mjs";

test("gpso: parses ODS GeoJSON features into canonical staged rows", () => {
  const { staged, skipped } = gpsoParse({
    features: [
      { geometry: { type: "Point", coordinates: [2.232061, 48.839062] }, properties: { nom: "Caméra 91", adresse: "1 Rue Test", commune: "Meudon", type: "fixe", etat: "en service" } },
      { geometry: { type: "Point", coordinates: [2.23, 48.84] }, properties: { nom: null } },
      { geometry: { type: "Polygon", coordinates: [] }, properties: {} },
    ],
  });
  assert.equal(staged.length, 2);
  assert.equal(staged[0].title, "Caméra 91");
  assert.equal(staged[0].address, "1 Rue Test, Meudon");
  assert.equal(staged[0].latitude, 48.839062);
  assert.equal(skipped.total, 1);
});

test("pvpp: parses KML placemarks into canonical staged rows", () => {
  const { staged } = pvppParse({
    text: `<kml><Document>
      <Placemark><name>B1</name><Point><coordinates>2.285098,48.837464,0</coordinates></Point></Placemark>
      <Placemark><Point><coordinates>2.29,48.84,0</coordinates></Point></Placemark>
    </Document></kml>`,
  });
  assert.equal(staged.length, 2);
  assert.equal(staged[0].title, "B1");
  assert.equal(staged[0].latitude, 48.837464);
  assert.equal(staged[0].longitude, 2.285098);
  assert.match(staged[0].external_id, /^pvpp-camera:/);
});

test("agen: parses CSV (lon,lat despite header) into canonical staged rows", () => {
  const { staged, skipped } = agenParse({
    text: "\uFEFFNom,Lien,Latitude,Longitude\nCaméra 129 - Place Esquirol bis,https://www.agen.fr/video-protection,0.6154632851324493,44.20325623833256\n,,\n",
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Caméra 129 - Place Esquirol bis");
  assert.equal(staged[0].latitude, 44.203256); // header inverted, file stores lon,lat
  assert.equal(staged[0].longitude, 0.615463);
  assert.equal(skipped.total, 1); // empty row has no coordinates
});

test("dgt: parses DATEX2 camera devices into canonical staged rows", () => {
  const { staged, skipped } = dgtParse({
    text: `<d2:payload><ns2:device xsi:type="fse:ExtendedDevice" id="176130" version="2">
      <ns2:typeOfDevice>camera</ns2:typeOfDevice>
      <ns2:pointLocation><loc:supplementaryPositionalDescription>
        <loc:roadInformation><loc:roadDestination>PORTUGAL</loc:roadDestination><loc:roadName>A-62</loc:roadName></loc:roadInformation>
      </loc:supplementaryPositionalDescription>
      <loc:tpegPointLocation><loc:point><loc:pointCoordinates><loc:latitude>42.2624</loc:latitude><loc:longitude>-3.9403</loc:longitude></loc:pointCoordinates></loc:point></loc:tpegPointLocation></ns2:pointLocation>
      <fse:deviceUrl>https://etraffic.dgt.es/camarasEtraffic/176130.jpg</fse:deviceUrl></ns2:device>
      <ns2:device><ns2:typeOfDevice>other</ns2:typeOfDevice></ns2:device>
    </d2:payload>`,
  });
  assert.equal(staged.length, 1); // "other" device skipped
  assert.equal(staged[0].title, "Cámara A-62");
  assert.equal(staged[0].latitude, 42.2624);
  assert.equal(staged[0].longitude, -3.9403);
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "dgt-camara:176130");
  assert.equal(skipped.total, 1);
});

test("madrid: utm30ToWgs84 lands in Madrid (40.48, -3.69) for C/Pedro Rico", () => {
  const { lat, lon } = utm30ToWgs84(441555.75, 4481256.59); // C/Pedro Rico 213 sample
  assert.ok(Math.abs(lat - 40.48) < 0.01, `lat ${lat}`);
  assert.ok(Math.abs(lon - -3.69) < 0.05, `lon ${lon}`);
});

test("madrid: parses ZBEDEP CSV (lat/lon) and ZBE CSV (utm) rows", () => {
  const { staged } = madridParse({
    parts: [
      { dataset: "ZBEDEP", text: "gis_x;gis_y;fecha_alta;distrito;barrio;calle;num_finca;tipo_elemento;codigo;num_puerta;id_camara;longitud;latitud;direccion\n439654;4473220;2018-11-30;01 CENTRO;01-02 EMBAJADORES;CAPITAN SALAZAR MARTINEZ, CALLE, DEL;1;Cámaras;Camara Entrada;1;1.1;-3.7111951;40.4074126;C" },
      { dataset: "ZBE", text: "id;\"lugar_infr\";utm_x;utm_y\n1;\"C PEDRO RICO 213\";441555.75;4481256.59" },
    ],
  });
  assert.equal(staged.length, 2);
  assert.equal(staged[0].latitude, 40.407413);
  assert.equal(staged[0].longitude, -3.711195);
  assert.match(staged[0].external_id, /^madrid-camara:/);
  // second row converted from UTM → WGS84, lands in Madrid (C/Pedro Rico)
  assert.ok(Math.abs(staged[1].latitude - 40.48) < 0.01, `lat ${staged[1].latitude}`);
});

test("barcelona: parses CKAN CSV rows into canonical staged rows", () => {
  const { staged, skipped } = bcnParse({
    text: "Id_Cam_Seguretat,Codi_Cam_Seguretat,Tipus_Cam_Seguretat,Num_Cam_Seguretat,Codi_Suport,Codi_Districte,Nom_Districte,Codi_Barri,Nom_Barri,X_ETRS89,Y_ETRS89,Longitud,Latitud,Data_Alta\n417105,CIM Ronda,Càmera mòbil,,Mastil,3, Sants-Montjuïc,12,la Marina,427000,4574000,2.121082,41.339963,2024-02-01\n417106,,Càmera fixa,5,,3, Sants-Montjuïc,12,la Marina,,,,abc,41.5,\n",
  });
  assert.equal(staged.length, 1); // non-numeric lat skipped
  assert.equal(staged[0].latitude, 41.339963);
  assert.equal(staged[0].longitude, 2.121082);
  assert.equal(skipped.total, 1);
});

test("utrecht: parses a real XLSX buffer (fflate mini-reader) into staged rows", async () => {
  const { zipSync, strToU8 } = await import("fflate");
  const sheetXml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <sheetData>
      <row r="1"><c r="A1"><v>Naam</v></c><c r="B1"><v>straat</v></c><c r="C1"><v>GPS Latitude</v></c><c r="D1"><v>GPS Longtitude</v></c></row>
      <row r="2"><c r="A2"><v>UTR-CM-501</v></c><c r="B2"><v>Biltstraat</v></c><c r="C2"><v>52.093665</v></c><c r="D2"><v>5.118365</v></c></row>
    </sheetData></worksheet>`;
  const buf = Buffer.from(
    zipSync({
      "xl/worksheets/sheet1.xml": strToU8(sheetXml),
      "[Content_Types].xml": strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`),
    })
  );
  const { staged, skipped } = await utrechtParse({ buf });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "UTR-CM-501");
  assert.equal(staged[0].address, "Biltstraat");
  assert.equal(staged[0].latitude, 52.093665);
  assert.equal(staged[0].longitude, 5.118365);
  assert.match(staged[0].external_id, /^utrecht-camera:UTR-CM-501$/);
  assert.equal(skipped.total, 0);
});

test("utrecht: null buffer → empty result (network fetch is live-only)", async () => {
  const { staged, skipped } = await utrechtParse({ buf: null });
  assert.equal(staged.length, 0);
  assert.equal(skipped.total, 0);
});

test("ams: rdToWgs84 lands in Amsterdam (52.37, 4.90) for the centre", () => {
  // Stadhouderskade VIS sample (120997, 485841) → ~52.364, 4.893
  const { lat, lon } = rdToWgs84(120997, 485841);
  assert.ok(Math.abs(lat - 52.364) < 0.005, `lat ${lat}`);
  assert.ok(Math.abs(lon - 4.893) < 0.005, `lon ${lon}`);
});

test("ams: parses VIS camera items (RD → WGS84) into canonical staged rows", () => {
  const { staged, skipped } = amsParse({
    items: [
      { id: "1", objectnummer: "ANPR-06005-A", objectSoort: "Verkeerscamera", standplaats: "Stadhouderskade", geometrie: { type: "Point", coordinates: [120997, 485841] } },
      { id: "2", objectnummer: "DRIP-1", objectSoort: "Informatiepaneel", geometrie: { type: "Point", coordinates: [121000, 485800] } },
      { id: "3", objectnummer: "X", objectSoort: "Verkeerscamera", geometrie: { type: "LineString", coordinates: [] } },
    ],
  });
  assert.equal(staged.length, 1); // only camera + Point
  assert.equal(staged[0].title, "Verkeerscamera ANPR-06005-A");
  assert.equal(staged[0].address, "Stadhouderskade");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.ok(Math.abs(staged[0].latitude - 52.364) < 0.005, `lat ${staged[0].latitude}`);
  assert.equal(skipped.total, 2); // DRIP (non-camera) + LineString
});

test("licence-gate: FR (Licence Ouverte), ES (CC-BY), NL (CC0) descriptors are importable", () => {
  assert.equal(isLicenceImportable("Licence Ouverte 2.0"), true);
  assert.equal(isLicenceImportable("CC-BY"), true);
  assert.equal(isLicenceImportable("CC0 1.0"), true);
  assert.equal(isLicenceImportable("CC BY 4.0"), true);
  assert.equal(isLicenceImportable("CC BY 4.0 (NZ)"), true); // Wellington WCC
});

// -------------------------------------------------- wave 4 (catalog.csv 2026-08-08): NO / UK / FI / US-NY

import { utm33ToWgs84, parsePayload as nvdbParse } from "../scripts/import/adapters/norvegia-nvdb-kamera-2026.mjs";
import { parsePayload as tflParse } from "../scripts/import/adapters/regno-unito-tfl-jamcams-2026.mjs";
import { parsePayload as finParse } from "../scripts/import/adapters/finlandia-fintraffic-weathercam-2026.mjs";
import { parsePayload as rocParse } from "../scripts/import/adapters/usa-rochester-cameras-2026.mjs";

test("nvdb: utm33ToWgs84 lands at Gardermoen (60.009, 11.056) for the E6 anchor", () => {
  const [lat, lon] = utm33ToWgs84(280145.275, 6659021.026);
  assert.ok(Math.abs(lat - 60.009) < 0.01, `lat ${lat}`);
  assert.ok(Math.abs(lon - 11.056) < 0.01, `lon ${lon}`);
});

test("nvdb: parses NVDB kamera objects (UTM33N → WGS84) into canonical staged rows", () => {
  const { staged, skipped } = nvdbParse({
    data: [
      { id: "83720877", href: "https://nvdbapiles-v3.atlas.vegvesen.no/vegobjekter/163/83720877/1", egenskaper: [{ navn: "Type kamera", verdi: "Fast videokamera" }], geometri: { wkt: "POINT Z(280145.275 6659021.026 177.034)" }, lokasjon: { fylker: [32], kommuner: [3205] } },
      { id: "2", href: "/163/2/1", egenskaper: [{ navn: "Type kamera", verdi: "Bevegelig videokamera (PTZ/dome)" }], geometri: { wkt: "POINT Z(281000 6658000 10)" } },
      { id: "3", href: "/163/3/1", egenskaper: [{ navn: "Type kamera", verdi: "Utgår_IP-kamera" }], geometri: { wkt: "POINT Z(280000 6658000 10)" } },
      { id: "4", href: "/163/4/1", egenskaper: [], geometri: { wkt: "POINT Z(280000 6658000 10)" } },
      { id: "5", href: "/163/5/1", egenskaper: [{ navn: "Type kamera", verdi: "Fast videokamera" }], geometri: null },
    ],
  });
  assert.equal(staged.length, 2); // Utgår_ + empty-type + no-geometry skipped
  assert.equal(staged[0].kind, "Fixed dome"); // kind canonical, mai inventato
  assert.equal(staged[1].kind, "PTZ");
  assert.equal(staged[0].external_id, "nvdb:83720877/1");
  assert.ok(Math.abs(staged[0].latitude - 60.009443) < 0.0001, `lat ${staged[0].latitude}`);
  assert.equal(skipped.total, 3);
});

test("tfl: parses JamCam places into canonical staged rows", () => {
  const { staged, skipped } = tflParse({
    data: [
      { id: "JamCams_00002.00865", commonName: "A406 Billet Upass E", lat: "51.60067", lon: "-0.01594", additionalProperties: [{ key: "view", value: "West" }, { key: "imageUrl", value: "https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.jpg" }] },
      { id: "x", commonName: "Bad", lat: "999", lon: "-0.01" },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "A406 Billet Upass E");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].latitude, 51.60067);
  assert.equal(staged[0].external_id, "tfl-jamcam:JamCams_00002.00865");
  assert.equal(skipped.total, 1);
});

test("fintraffic: parses GeoJSON weathercam stations into canonical staged rows", () => {
  const { staged, skipped } = finParse({
    data: {
      features: [
        { type: "Feature", id: "C01503", geometry: { type: "Point", coordinates: [23.99616, 60.05374, 0.0] }, properties: { id: "C01503", name: "kt51_Inkoo", collectionStatus: "GATHERING", presets: [{ id: "C0150301" }, { id: "C0150302" }, { id: "C0150309" }] } },
        { type: "Feature", id: "bad", geometry: { type: "Point", coordinates: [200, 60] }, properties: { id: "bad", name: "x" } },
      ],
    },
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "kt51_Inkoo");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].latitude, 60.05374);
  assert.equal(staged[0].notes, "3 camere · Stato: GATHERING");
  assert.equal(staged[0].external_id, "digitraffic:C01503");
  assert.equal(skipped.total, 1);
});

test("rochester: parses ArcGIS features (POINT_X/Y WGS84) into canonical staged rows", () => {
  const { staged, skipped } = rocParse({
    data: [
      { attributes: { OBJECTID: 1, Address: "704 Hudson Ave", Notes: "RFD", Type: "Video", Program: "BlueLight", POINT_X: -77.59863136899997, POINT_Y: 43.17778600100007 } },
      { attributes: { OBJECTID: 2, Address: null, POINT_X: 0, POINT_Y: 0 } },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "704 Hudson Ave");
  assert.equal(staged[0].kind, "Other / unknown"); // kind canonico, mai inventato
  assert.equal(staged[0].latitude, 43.177786);
  assert.equal(staged[0].external_id, "rochester:1");
  assert.equal(skipped.total, 1);
});

test("licence-gate: wave-4 descriptors (NLOD, OGL 2.0, CC BY 4.0, ODbL) are importable; BY-SA is NOT", () => {
  assert.equal(isLicenceImportable("NLOD 2.0"), true);
  assert.equal(isLicenceImportable("OGL 2.0"), true);
  assert.equal(isLicenceImportable("OGL-BC"), true);
  assert.equal(isLicenceImportable("CC BY 3.0 AU"), true);
  assert.equal(isLicenceImportable("PDDL"), true);
  assert.equal(isLicenceImportable("CC BY 3.0"), true); // Denver Open Data Catalog
  assert.equal(isLicenceImportable("NY OPEN-NY Terms of Use"), true); // NY: no restrictions
  assert.equal(isLicenceImportable("CC BY-SA 4.0"), false); // share-alike: escluso
  assert.equal(isLicenceImportable("CC BY-SA 2.0"), false);
});

test("licence-gate: PM decisions 2026-08-09 (t_8a0445a4) — King County removed, Denver blocked until confirmed", () => {
  // King County: no-sale clause incompatible with ODbL §3.6 → source REMOVED (125 cameras), string out of allowlist.
  assert.equal(isLicenceImportable("King County GIS Terms (copy/distribute permitted; sale prohibited)"), false);
  // Denver HALO: no explicit license on the dataset → descriptor updated, batch NOT importable until confirmed.
  assert.equal(isLicenceImportable("No explicit license — disclaimer (to be confirmed)"), false);
  // The generic CC BY 3.0 class stays importable (other sources may declare it).
  assert.equal(isLicenceImportable("CC BY 3.0"), true);
  // Thailandia ODC: kept ONLY for Nakhon Ratchasima (government-filtered), Phetchaburi removed.
  assert.equal(isLicenceImportable("Open Data Common (ODC)"), true);
});

// -------------------------------------------------- wave 5 (catalog.csv 2026-08-08): BC / QC / DC / NOLA / Boulder / LU / SF

import { parsePayload as drivebcParse } from "../scripts/import/adapters/canada-drivebc-highwaycams-2026.mjs";
import { parsePayload as quebecParse } from "../scripts/import/adapters/canada-quebec-mtmd-cameras-2026.mjs";
import { parsePayload as ddotParse } from "../scripts/import/adapters/usa-ddot-traffic-cameras-2026.mjs";
import { parsePayload as nolaParse } from "../scripts/import/adapters/usa-new-orleans-traffic-cameras-2026.mjs";
import { parsePayload as boulderParse } from "../scripts/import/adapters/usa-boulder-redlight-cameras-2026.mjs";
import { parsePayload as citaParse } from "../scripts/import/adapters/lussemburgo-cita-cameras-2026.mjs";
import { parsePayload as sfParse } from "../scripts/import/adapters/usa-san-francisco-enforcement-cameras-2026.mjs";
import { webMercatorToWgs84 } from "../scripts/import/adapters/lib.mjs";

test("webMercatorToWgs84 lands in Washington DC (-76.98, 38.89) for the DDOT anchor", () => {
  const [lat, lon] = webMercatorToWgs84(-8575659.651078826, 4720480.913208556);
  assert.ok(Math.abs(lat - 38.99) < 0.01, `lat ${lat}`);
  assert.ok(Math.abs(lon - -77.04) < 0.02, `lon ${lon}`);
});

test("drivebc: parses webcams.csv rows into canonical staged rows", () => {
  const { staged, skipped } = drivebcParse({
    text: "links_bchighwaycam,links_imageDisplay,links_imageThumbnail,links_replayTheDay,id,highway_number,highway_locationDescription,camName,caption,credit,orientation,latitude,longitude\n" +
      "https://images.drivebc.ca/bchighwaycam/pub/html/www/2.html,https://images.drivebc.ca/bchighwaycam/pub/cameras/2.jpg,https://images.drivebc.ca/bchighwaycam/pub/cameras/tn/2.jpg,https://images.drivebc.ca/ReplayTheDay/player.htm,2,5,Coquihalla,Coquihalla Great Bear Snowshed - N,,,N,49.596374,-121.159832\n" +
      ",,,,,,,,bad,,,999,999\n",
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Coquihalla Great Bear Snowshed - N");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].latitude, 49.596374);
  assert.equal(staged[0].external_id, "drivebc:2");
  assert.equal(skipped.total, 1);
});

test("quebec: parses WFS GeoJSON (Web Mercator) into canonical staged rows", () => {
  const { staged, skipped } = quebecParse({
    data: [
      { properties: { IDEcamera: "4057", NumeroCamera: "T2410101", DescriptionLocalisationFr: "Route 241 à la hauteur du boulevard de Bromont (Bromont)", NumeroRoute: "00241", NomRegionDiffusion: "Estrie" }, geometry: { type: "Point", coordinates: [-8087109.424082, 5672110.06649] } },
      { properties: { IDEcamera: "x" }, geometry: null },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Route 241 à la hauteur du boulevard de Bromont (Bromont)");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.ok(Math.abs(staged[0].latitude - 45.32044) < 0.01, `lat ${staged[0].latitude}`);
  assert.equal(staged[0].external_id, "mtmd:4057");
  assert.equal(skipped.total, 1);
});

test("ddot: parses ArcGIS features (Web Mercator) into canonical staged rows", () => {
  const { staged, skipped } = ddotParse({
    data: [
      { attributes: { CAMERAID: 84, CAMERATYPE: "CCTV", FACILITYID: "84", OBJECTID: 1 }, geometry: { x: -8575659.651078826, y: 4720480.913208556 } },
      { attributes: { CAMERAID: 85, OBJECTID: 2 }, geometry: { x: 0, y: 0 } },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Traffic camera 84");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.ok(Math.abs(staged[0].longitude - -77.04) < 0.02, `lon ${staged[0].longitude}`);
  assert.equal(staged[0].external_id, "ddot:84");
  assert.equal(skipped.total, 1);
});

test("nola: parses Socrata rows (the_geom Point) into canonical staged rows", () => {
  const { staged, skipped } = nolaParse({
    data: [
      { camid: "NO179", camloc: "5200 Bullard Ave", function: "TFS", operational: "Yes", the_geom: { type: "Point", coordinates: [-89.948880999256, 30.031396000519] } },
      { camid: "x", the_geom: { type: "Point", coordinates: [0, 0] } },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "5200 Bullard Ave");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "nola:NO179");
  assert.equal(skipped.total, 1);
});

test("boulder: parses ArcGIS features (Web Mercator) into canonical staged rows", () => {
  const { staged } = boulderParse({
    data: [{ attributes: { OBJECTID: 1, Location: "EB Arapahoe at 30th", CameraType: null }, geometry: { x: -11716806.292805046, y: 4868060.026341455 } }],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "EB Arapahoe at 30th");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.ok(Math.abs(staged[0].latitude - 40.014572) < 0.01, `lat ${staged[0].latitude}`);
  assert.equal(staged[0].external_id, "boulder:1");
});

test("cita: parses KML placemarks into canonical staged rows", () => {
  const { staged, skipped } = citaParse({
    text: `<kml><Document><Folder><Placemark id="camera_3"><name>A6 - Camera 3</name><Point><coordinates>5.921276,49.636941,0</coordinates></Point></Placemark><Placemark id="camera_x"><Point><coordinates>200,49,0</coordinates></Point></Placemark></Folder></Document></kml>`,
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "A6 - Camera 3");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "cita:camera_3");
  assert.equal(skipped.total, 1);
});

test("sf: parses red-light + speed rows into canonical staged rows", () => {
  const { staged, skipped } = sfParse({
    data: [
      { site_id: "4th St at Harrison St", location: "4th St at Harrison St", point: { type: "Point", coordinates: [-122.399629446, 37.780796429] }, __src: "redlight" },
      { site_id: "MTAF001", location: "NB 2510 FRANKLIN ST", point: { type: "Point", coordinates: [-122.425263, 37.797669] }, __src: "speed" },
      { site_id: "bad", point: { type: "Point", coordinates: [200, 90] }, __src: "speed" },
    ],
  });
  assert.equal(staged.length, 2);
  assert.equal(staged[0].title, "4th St at Harrison St");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "sf-red-light:4th St at Harrison St");
  assert.equal(staged[1].external_id, "sf-speed:MTAF001");
  assert.equal(skipped.total, 1);
});

// -------------------------------------------------- wave 6 (USA, licenze esplicite): CA / MN / CO / NY

import { parsePayload as caltransParse } from "../scripts/import/adapters/usa-caltrans-cctv-2026.mjs";
import { parsePayload as mndotParse } from "../scripts/import/adapters/usa-mndot-snowplow-cameras-2026.mjs";
import { parsePayload as denverParse } from "../scripts/import/adapters/usa-denver-halo-cameras-2026.mjs";
import { parsePayload as thruwayParse } from "../scripts/import/adapters/usa-ny-thruway-gantries-2026.mjs";

test("caltrans: parses ArcGIS features (WGS84) into canonical staged rows", () => {
  const { staged, skipped } = caltransParse({
    data: [
      { attributes: { OBJECTID: 1, locationName: "SR-20 : At SR-1 - Looking East (C020)", nearbyPlace: "Fort Bragg", county: "Mendocino", route: "SR-20", district: 1, latitude: 39.42002, longitude: -123.80779, direction: "East" } },
      { attributes: { OBJECTID: 2, locationName: "bad", latitude: 0, longitude: 0 } },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "SR-20 : At SR-1 - Looking East (C020)");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].direction, 90); // East
  assert.equal(staged[0].external_id, "caltrans-cctv:1");
  assert.equal(skipped.total, 1);
});

test("mndot: parses ArcGIS plow cam features into canonical staged rows", () => {
  const { staged, skipped } = mndotParse({
    data: [
      { attributes: { OBJECTID: 2, PHOTO_ANUMBER: "b468-i", PHOTO_LATITUDE: 45.5726089, PHOTO_LONGITUDE: -93.2248764, REF_POST: 41.66, ROUTE_NAME: "MN 95", PHOTO_URL: "https://crc-public-s3.s3.us-west-2.amazonaws.com/avl/prod/MN/b468" } },
      { attributes: { OBJECTID: 3, PHOTO_LATITUDE: "x", PHOTO_LONGITUDE: 0 } },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "MnDOT plow cam MN 95");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "mndot-plow:2");
  assert.equal(skipped.total, 1);
});

test("denver: parses ArcGIS HALO features (Web Mercator) into canonical staged rows", () => {
  const { staged, skipped } = denverParse({
    data: [
      { attributes: { OBJECTID: 4626, LOCATION: "Halo D1 15th- Platte", GLOBALID: "f8103ce9-bc6f-4510-b421-641ec9cfb056" }, geometry: { x: -11689599.504325293, y: 4830610.947452243 } },
      { attributes: { OBJECTID: 2, LOCATION: "x" }, geometry: { x: 0, y: 0 } },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Halo D1 15th- Platte");
  assert.equal(staged[0].kind, "Other / unknown");
  assert.ok(Math.abs(staged[0].latitude - 39.756435) < 0.01, `lat ${staged[0].latitude}`);
  assert.equal(staged[0].external_id, "denver-halo:4626");
  assert.equal(skipped.total, 1);
});

test("thruway: parses Socrata gantry rows into canonical staged rows", () => {
  const { staged, skipped } = thruwayParse({
    data: [
      { name: "Grand Island North", description: "Highway", road: "I-190 - Niagara Thruway", milepost: "20", latitude: "43.05845", longitude: "-78.99061", type: "Barrier Fixed Toll" },
      { name: "bad", latitude: "0", longitude: "0" },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Grand Island North");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "ny-thruway:Grand Island North");
  assert.equal(skipped.total, 1);
});

// -------------------------------------------------- wave 7 (USA, verdetti legali): PA / MD / Baltimore

import { parsePayload as penndotParse } from "../scripts/import/adapters/usa-penndot-traffic-cameras-2026.mjs";
import { parsePayload as mdotParse } from "../scripts/import/adapters/usa-mdot-chart-cameras-2026.mjs";
import { parsePayload as citiwatchParse } from "../scripts/import/adapters/usa-baltimore-citiwatch-2026.mjs";
import { parsePayload as atvesParse } from "../scripts/import/adapters/usa-baltimore-atves-cameras-2026.mjs";
import { lcc2248ToWgs84 } from "../scripts/import/adapters/lib.mjs";

test("lcc2248ToWgs84 lands in Baltimore (~39.29, -76.62) for the CitiWatch anchor", () => {
  const [lat, lon] = lcc2248ToWgs84(1419616.6991678923, 591850.2132046372);
  assert.ok(Math.abs(lat - 39.291154) < 0.001, `lat ${lat}`);
  assert.ok(Math.abs(lon - -76.620948) < 0.001, `lon ${lon}`);
});

test("penndot: parses ArcGIS features (Web Mercator) into canonical staged rows", () => {
  const { staged, skipped } = penndotParse({
    data: [
      { attributes: { OBJECTID: 1, STATEWIDE_ID: "CAM-08-001", STATUS_NAME: "EXISTING", INSTALL_TYPE_NAME: "PERMANENT" }, geometry: { x: -8572497.387, y: 4923635.152800001 } },
      { attributes: { OBJECTID: 2, STATEWIDE_ID: "x" }, geometry: { x: 0, y: 0 } },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "PennDOT cam CAM-08-001");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "penndot:CAM-08-001");
  assert.equal(skipped.total, 1);
});

test("mdot: parses ArcGIS features (Web Mercator) into canonical staged rows", () => {
  const { staged, skipped } = mdotParse({
    data: [
      { attributes: { OBJECTID: 1, location: "WPL C506 at Gantry S-9 MP 33.6", county: "Anne Arundel County", feedID: "dd0157c42d7c001300503336c4235c0a", url: "https://chart.maryland.gov/video/video.php?feed=dd0157c42d7c001300503336c4235c0a" }, geometry: { x: -8503572.3371, y: 4720926.744599998 } },
      { attributes: { OBJECTID: 2, location: "x" }, geometry: { x: 0, y: 0 } },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "WPL C506 at Gantry S-9 MP 33.6");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "mdot-chart:dd0157c42d7c001300503336c4235c0a");
  assert.equal(skipped.total, 1);
});

test("citiwatch: parses ArcGIS features (EPSG:2248) into canonical staged rows", () => {
  const { staged, skipped } = citiwatchParse({
    data: [
      { attributes: { OBJECTID: 1, CAM_NUMBER: "1", CAM_LOCATION: "Eutaw and Lexington Market" }, geometry: { x: 1419616.6991678923, y: 591850.2132046372 } },
      { attributes: { OBJECTID: 2, CAM_NUMBER: "2", CAM_LOCATION: "x" }, geometry: null },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Eutaw and Lexington Market");
  assert.equal(staged[0].kind, "Other / unknown");
  assert.equal(staged[0].external_id, "balt-citiwatch:1");
  assert.equal(skipped.total, 1);
});

test("atves: parses 3 services (EPSG:2248) into canonical staged rows with src prefix", () => {
  const { staged, skipped } = atvesParse({
    data: [
      { __svc: "redlight", attributes: { GIS_ID: 1001, CamType: "Red Light Camera", Location: "Bel Air Rd & Erdman Ave SB" }, geometry: { x: 1433012.8000003397, y: 603103.409858346 } },
      { __svc: "speed-fixed", attributes: { GIS_ID: 4029, CamType: "Speed Camera Fixed", Location: "6000 Hillen Rd SB and NB" }, geometry: { x: 1431066.195297718, y: 617507.945681721 } },
      { __svc: "speed-portable", attributes: { GIS_ID: 5001, CamType: "Speed Camera Portable", Location: "2700 Blk Gywnns Falls Pkwy WB" }, geometry: { x: 1407967.5902483016, y: 600409.6019257307 } },
      { __svc: "redlight", attributes: { GIS_ID: 1, CamType: "x", Location: "x" }, geometry: null },
    ],
  });
  assert.equal(staged.length, 3);
  assert.equal(staged[0].external_id, "balt-atves:redlight:1001");
  assert.equal(staged[1].external_id, "balt-atves:speed-fixed:4029");
  assert.equal(staged[2].external_id, "balt-atves:speed-portable:5001");
  assert.ok(Math.abs(staged[1].latitude - 39.361458) < 0.001, `lat ${staged[1].latitude}`); // 6000 Hillen Rd
  assert.equal(skipped.total, 1);
});

// -------------------------------------------------- wave 8 (UK / UA): Plymouth, Ukraine

import { parsePayload as plymouthParse } from "../scripts/import/adapters/regno-unito-plymouth-cctv-2026.mjs";
import { parsePayload as ukraineParse } from "../scripts/import/adapters/ucraina-speed-cameras-2026.mjs";

test("plymouth: parses CSV rows (x/y WGS84) into canonical staged rows", () => {
  const { staged, skipped } = plymouthParse({
    text: "fid,Camera Num,Camera Loc,Easting,Northing,x,y\n1,1002,Cattedown Roundabout,248978,54397,-4.125025,50.370026\n2,1040,Chales Church/ edbrington street,248211,54676,-4.135915,50.372335\n3,,bad,,,999,999\n",
  });
  assert.equal(staged.length, 2);
  assert.equal(staged[0].title, "Cattedown Roundabout");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "plymouth-cctv:1");
  assert.equal(skipped.total, 1);
});

test("ukraine: parses CSV rows (lat/lon) into canonical staged rows", () => {
  const { staged, skipped } = ukraineParse({
    text: "inventoryNumber,addressThoroughfare,addressAdminUnitL3,lat,lon,balanceHolderName,isSpeedRecognition\nUA-01,вул. Олени Теліги,Київ,50.479649,30.453529,Патрульна поліція,true\nUA-02,,,0,0,,true\n",
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "вул. Олени Теліги");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "ua-camera:UA-01");
  assert.equal(skipped.total, 1);
});

// -------------------------------------------------- wave 9 (nuovi paesi): Australia NSW

import { parsePayload as nswParse } from "../scripts/import/adapters/australia-nsw-speed-cameras-2026.mjs";

test("nsw: parses fixed + red-light CSV rows into canonical staged rows", () => {
  const { staged, skipped } = nswParse({
    data: [
      { __src: "fixed", text: "SZ?,SUBURB/TOWN,ROAD/S,Cameras,Lat(1),Long(1),Lat(2),Long(2)\nY,Ashfield,\"Hume Highway, between Murrell Street and Queen Street (school zone)\",1,-33.89017676,151.1279851,,\nN,,bad,1,999,999,,\n" },
      { __src: "redlight", text: "SZ?,SUBURB/TOWN,ROAD/S,Cameras,Lat(1),Long(1),Lat(2),Long(2),Lat(3),Long(3),\nN,Kotara / Adamstown,Park Avenue and Northcott Drive,1,-32.940335,151.712118,,,,,\n" },
    ],
  });
  assert.equal(staged.length, 2);
  assert.equal(staged[0].title, "Hume Highway, between Murrell Street and Queen Street (school zone)");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "nsw-cam:fixed:0");
  assert.equal(staged[1].external_id, "nsw-cam:redlight:1");
  assert.equal(skipped.total, 1);
});

// -------------------------------------------------- wave 10 (nuovi paesi): Irlanda DCC

import { parsePayload as dccParse } from "../scripts/import/adapters/irlanda-dublino-cctv-poles-2026.mjs";

test("dcc: parses GeoJSON features into canonical staged rows", () => {
  const { staged, skipped } = dccParse({
    data: {
      features: [
        { properties: { ID: 2, Road_1: "Dorset St", Latitude: 53.356014, Longitude: -6.265284 }, geometry: { type: "Point", coordinates: [-6.265284, 53.356014] } },
        { properties: { ID: 3, Road_1: "bad", Latitude: 0, Longitude: 0 }, geometry: null },
      ],
    },
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Dorset St");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "dcc-cctv:2");
  assert.equal(skipped.total, 1);
});

// -------------------------------------------------- wave 11 (cron discovery): OH, KY, NE511, KingCo, Wellington NZ

import { parsePayload as ohioParse } from "../scripts/import/adapters/usa-ohio-ohgo-cameras-2026.mjs";
import { parsePayload as kytcParse } from "../scripts/import/adapters/usa-kentucky-kytc-cameras-2026.mjs";
import { parsePayload as ne511Parse } from "../scripts/import/adapters/usa-new-england-511-cameras-2026.mjs";
import { parsePayload as wellingtonParse } from "../scripts/import/adapters/nuova-zelanda-wellington-cctv-2026.mjs";
import { lcc2926ToWgs84, nztm2193ToWgs84 } from "../scripts/import/adapters/lib.mjs";

test("lcc2926ToWgs84 lands in King County (~47.71, -122.19)", () => {
  const [lat, lon] = lcc2926ToWgs84(1307383.0233, 262401.6072);
  assert.ok(Math.abs(lat - 47.711339) < 0.001, `lat ${lat}`);
  assert.ok(Math.abs(lon - -122.186165) < 0.001, `lon ${lon}`);
});

test("nztm2193ToWgs84 lands in Wellington (~-41.29, 174.78)", () => {
  const [lat, lon] = nztm2193ToWgs84(1749339.4537, 5427234.9352);
  assert.ok(Math.abs(lat - -41.292629) < 0.001, `lat ${lat}`);
  assert.ok(Math.abs(lon - 174.783576) < 0.001, `lon ${lon}`);
});

test("ohio: parses OHGO API camera sites (WGS84) into canonical staged rows", () => {
  const { staged, skipped } = ohioParse({
    data: [
      { Id: "00000000000001", Latitude: 41.50557, Longitude: -82.84921, Location: "SR-2 at S Lightner Rd" },
      { Id: "x", Latitude: 0, Longitude: 0 },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "SR-2 at S Lightner Rd");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(staged[0].external_id, "ohio-ohgo:00000000000001");
  assert.equal(skipped.total, 1);
});

test("kytc: parses ArcGIS features (Web Mercator) into canonical staged rows", () => {
  const { staged, skipped } = kytcParse({
    data: [
      { attributes: { OBJECTID: 1, description: "I-65 just South of I-265", district: "6", county: "Jefferson" }, geometry: { x: -9554547.69, y: 4628309.87 } },
      { attributes: { OBJECTID: 2 }, geometry: { x: 0, y: 0 } },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].external_id, "kytc-cam:1");
  assert.equal(staged[0].kind, "Traffic / licence plate reader");
  assert.equal(skipped.total, 1);
});

test("ne511: parses C2C XML (microdegrees) for VT/NH/ME into staged rows", () => {
  const { staged, skipped } = ne511Parse({
    data: [
      { __net: "Vermont", text: '<status xmlns="http://its.gov/c2c_icd"><cctvStatusData><net id="Vermont"><cctvStatus id="VT-78 EB ALBURGH" netId="Vermont"><name>Alburgh CCTV</name><lat>44975151</lat><lon>-73227072</lon><status>Device Offline</status><equipLoc><roadway>VT-78</roadway><direction>East</direction></equipLoc></cctvStatus></net></cctvStatusData></status>' },
      { __net: "Maine", text: '<cctvStatus id="ME-1" netId="Maine"><name>Portland</name><lat>0</lat><lon>0</lon></cctvStatus>' },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Alburgh CCTV");
  assert.equal(staged[0].latitude, 44.975151);
  assert.equal(staged[0].external_id, "ne511:Vermont:VT-78 EB ALBURGH");
  assert.equal(skipped.total, 1);
});

test("wellington: parses ArcGIS features (EPSG:2193) into canonical staged rows", () => {
  const { staged, skipped } = wellingtonParse({
    data: [
      { attributes: { OBJECTID: 1, Camera_Name: "Wakefield/Blair (Chaffers New World Car park)" }, geometry: { x: 1749339.4537, y: 5427234.9352 } },
      { attributes: { OBJECTID: 2 }, geometry: null },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Wakefield/Blair (Chaffers New World Car park)");
  assert.equal(staged[0].kind, "Other / unknown");
  assert.equal(staged[0].external_id, "wcc-cctv:1");
  assert.equal(skipped.total, 1);
});

// -------------------------------------------------- wave 12 (cron discovery): Giappone Tokyo + Thailandia

import { parsePayload as tokyoParse } from "../scripts/import/adapters/giappone-tokyo-metro-cameras-2026.mjs";
import { parsePayload as nkrParse } from "../scripts/import/adapters/tailandia-nakhon-ratchasima-cctv-2026.mjs";

test("tokyo: parses river CSV (UTF-8) with 緯度/経度 into staged rows", () => {
  const { staged, skipped } = tokyoParse({
    data: [
      { __set: "river", text: "番号,観測所名（映像監視局）,河川名,URL（動画）,緯度,経度\n1,飯田橋,神田川,https://youtu.be/x,35.70286194,139.749895\n2,test,川,https://youtu.be/y,0,0\n" },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "飯田橋");
  assert.equal(staged[0].external_id, "tmg-cam:river:1");
  assert.equal(skipped.total, 1);
});

test("tokyo: parses Izu CSV (Shift-JIS, lat/lon combinato) into staged rows", () => {
  const { staged } = tokyoParse({
    data: [
      { __set: "izu", text: "項番,名称,設置場所,撮影方向,緯度経度,動画リンク\n1,元町港,大島_元町港船客待合所 1F,岸壁方面,\"34.751877197231124,139.3523663219215\",https://youtube.com/live/x\n" },
    ],
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].latitude, 34.751877);
  assert.equal(staged[0].external_id, "tmg-cam:izu:1");
});

test("nkr: parses Thai police CSV and keeps ONLY government cameras (categoria 'ราชการ')", () => {
  const { staged, skipped } = nkrParse({
    data: "รายการข้อมูล, สถานะกล้อง,ชื่อจุดติดตั้ง, ชื่อสถานที่, ประเภทสถานที่, ละติจูด, ลองจิจูด, หน่วยงาน\nพิกัดจุดติดตั้งกล้อง cctv,ใช้ได้,ที่พักสายตรวจ,ตู้ยามบะใหญ่,ราชการ,14.5596019,101.9763107,สภ. อุดมทรัพย์\nพิกัดจุดติดตั้งกล้อง cctv,ใช้ได้,ร้านทอง,เอกชน,เอกชน,14.55,101.97,ร้านทอง x\nพิกัดจุดติดตั้งกล้อง cctv,ใช้ได้,\"campo, con virgola\",test,ราชการ,0,0,สภ. x\n",
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "ที่พักสายตรวจ");
  assert.equal(staged[0].external_id, "nkr-cctv:0");
  assert.equal(skipped.total, 2); // 1 private + 1 zero coords
});

test("nkr: fails closed when the category column is missing (privacy filter impossible)", () => {
  const { staged, skipped } = nkrParse({
    data: "รายการข้อมูล, สถานะกล้อง,ชื่อจุดติดตั้ง, ชื่อสถานที่, ละติจูด, ลองจิจูด, หน่วยงาน\nพิกัดจุดติดตั้งกล้อง cctv,ใช้ได้,ที่พักสายตรวจ,ตู้ยามบะใหญ่,14.5596019,101.9763107,สภ. อุดมทรัพย์\n",
  });
  assert.equal(staged.length, 0);
  assert.equal(skipped.reasons["no category column (cannot filter government cameras)"], 1);
});

// -------------------------------------------------- wave 13: Brasile BH + Giappone Ichikawa

import { parsePayload as bhParse } from "../scripts/import/adapters/brasile-bh-bhtrans-cameras-2026.mjs";
import { parsePayload as ichikawaParse } from "../scripts/import/adapters/giappone-ichikawa-cctv-2026.mjs";
import { utm23sToWgs84 } from "../scripts/import/adapters/lib.mjs";

test("utm23sToWgs84 lands in Belo Horizonte (~-19.90, -43.94)", () => {
  const [lat, lon] = utm23sToWgs84(611367.363251832, 7798693.4598023);
  assert.ok(Math.abs(lat - -19.904872) < 0.001, `lat ${lat}`);
  assert.ok(Math.abs(lon - -43.936041) < 0.001, `lon ${lon}`);
});

test("bhtrans: parses CSV with GEOMETRIA POINT (UTM 23S) into staged rows", () => {
  const { staged, skipped } = bhParse({
    data: 'ID_FISCALIZACAO_ELETRONICA,DESC_LOC_CONTROLADOR_TRANSITO,DESC_TIPO_CONTROLADOR_TRANSITO,VELOCIDADE_REGULAMENTAR,GEOMETRIA\n262,Av. Cristiano Machado 1320,Controlador Eletrônico de Velocidade,60,"POINT (611367.363251832 7798693.4598023)"\n263,test,,,POINT (0 0)\n',
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "Av. Cristiano Machado 1320");
  assert.equal(staged[0].external_id, "bh-bhtrans:262");
  assert.equal(skipped.total, 1);
});

test("ichikawa: parses CSV (Shift-JIS 緯度/経度) into staged rows", () => {
  const { staged, skipped } = ichikawaParse({
    data: "itemID,緯度,経度,住所,分類,設置施設名称,管理番号\n237,35.731853055555554,139.906921,市川2-31-20,街頭防犯カメラ,エスポワール市川,21\n238,0,0,x,街頭防犯カメラ,x,22\n",
  });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].title, "エスポワール市川");
  assert.equal(staged[0].external_id, "ichikawa-cctv:21");
  assert.equal(skipped.total, 1);
});
