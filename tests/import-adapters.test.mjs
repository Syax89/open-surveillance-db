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

test("osm-factory: buildQuery targets the right ISO3166 admin area per country", () => {
  const at = atBuildQuery([46.5, 9.7, 46.6, 9.8], { timeout: 60 });
  assert.match(at, /area\["ISO3166-1"="AT"\]\[admin_level=2\]->\.at;/);
  assert.match(at, /\(area\.at\)\(46\.5000,9\.7000,46\.6000,9\.8000\)/);
  const ch = chBuildQuery([46.9, 6.1, 47.0, 6.2], { timeout: 60 });
  assert.match(ch, /area\["ISO3166-1"="CH"\]\[admin_level=2\]->\.ch;/);
  const de = deBuildQuery([48.1, 8.1, 48.2, 8.2], { timeout: 60 });
  assert.match(de, /area\["ISO3166-1"="DE"\]\[admin_level=2\]->\.de;/);
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
  assert.equal(at.staged.length, 3); // guard + indoor skipped
  assert.equal(de.staged.length, 3);
  const dome = de.staged.find((r) => r.external_id === "osm:node/1");
  assert.equal(dome.kind, "Fixed dome");
  assert.equal(dome.direction, null); // dome invariant
  assert.equal(dome.notes, "Operatore: Stadt Wien"); // entity operator kept
  const fixed = de.staged.find((r) => r.external_id === "osm:node/2");
  assert.equal(fixed.kind, "Bullet");
  assert.equal(fixed.direction, 90);
  assert.equal(de.skipped.reasons["surveillance:type=guard"], 1);
  assert.equal(de.skipped.reasons["surveillance=indoor"], 1);
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
