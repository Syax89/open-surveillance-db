// Test del riordino dei dump D1 per le foreign key (scripts/ops/reorder-d1-data.mjs).
// Contesto: l'export D1 ordina le tabelle alfabeticamente e l'import remoto
// committa a batch -> i figli finiscono prima dei genitori e il restore muore
// con "FOREIGN KEY constraint failed" (drill 34973331544).

import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { orderTables, splitInserts, tableDeps } from "../scripts/ops/reorder-d1-data.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/ops/reorder-d1-data.mjs", import.meta.url));

const SCHEMA = `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "contributors" (
  id integer PRIMARY KEY,
  email text NOT NULL
);
CREATE TABLE \`cameras\` (
  id integer PRIMARY KEY,
  title text NOT NULL,
  contributor_id integer REFERENCES contributors(id)
);
CREATE TABLE \`camera_lifecycle_events\` (
  id integer PRIMARY KEY,
  camera_id integer NOT NULL REFERENCES \`cameras\`(id)
);
`;

// ordine alfabetico = quello che produce l'export D1 (figli prima dei genitori)
const DATA_ALPHA = `PRAGMA defer_foreign_keys=TRUE;
INSERT INTO \`camera_lifecycle_events\` (id,camera_id) VALUES(1,10);
INSERT INTO \`cameras\` (id,title,contributor_id) VALUES(10,'A',7);
INSERT INTO \`cameras\` (id,title,contributor_id) VALUES(11,'B',NULL);
INSERT INTO "contributors" (id,email) VALUES(7,'x@example.org');
`;

test("tableDeps: legge i REFERENCES anche da CREATE TABLE multi-riga e con quoting misto", () => {
  const deps = tableDeps(SCHEMA);
  assert.deepEqual([...deps.get("cameras")], ["contributors"]);
  assert.deepEqual([...deps.get("camera_lifecycle_events")], ["cameras"]);
  assert.equal(deps.get("contributors").size, 0);
});

test("orderTables: genitori prima dei figli, cicli in coda", () => {
  const tables = ["camera_lifecycle_events", "cameras", "contributors"];
  const { ordered, cycles } = orderTables(tables, tableDeps(SCHEMA));
  assert.ok(ordered.indexOf("contributors") < ordered.indexOf("cameras"));
  assert.ok(ordered.indexOf("cameras") < ordered.indexOf("camera_lifecycle_events"));
  assert.equal(cycles.length, 0);

  const cyclic = orderTables(["a", "b"], new Map([["a", new Set(["b"])], ["b", new Set(["a"])]]));
  assert.deepEqual(cyclic.ordered, []);
  assert.deepEqual(cyclic.cycles, ["a", "b"]);
});

test("splitInserts: raggruppa per tabella e tiene la testa (PRAGMA) separata", () => {
  const { head, byTable } = splitInserts(DATA_ALPHA);
  assert.equal(head.filter((l) => l.startsWith("PRAGMA")).length, 1);
  assert.equal(byTable.get("cameras").length, 2);
  assert.equal(byTable.get("contributors").length, 1);
});

test("splitInserts: INSERT multi-riga -> errore (fail-closed, niente dump corrotti)", () => {
  assert.throws(
    () => splitInserts('INSERT INTO cameras (id,\n title) VALUES(1,\n "x");\n'),
    /INSERT non su una sola riga/,
  );
});

test("CLI: regge un dump grande (150k INSERT) senza RangeError sullo spread", () => {
  const dir = mkdtempSync(join(tmpdir(), "osdb-reorder-big-"));
  const schemaPath = join(dir, "schema.sql");
  const dataPath = join(dir, "data.sql");
  writeFileSync(schemaPath, SCHEMA);
  const rows = [];
  rows.push('INSERT INTO `camera_lifecycle_events` (id,camera_id) VALUES(1,10);');
  for (let i = 0; i < 150_000; i++) {
    rows.push(`INSERT INTO "contributors" (id,email) VALUES(${i},'u${i}@example.org');`);
  }
  rows.push("INSERT INTO `cameras` (id,title,contributor_id) VALUES(10,'A',7);");
  writeFileSync(dataPath, rows.join("\n") + "\n");

  const out = execFileSync("node", [SCRIPT, schemaPath, dataPath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const lines = out.split("\n").filter((l) => l.startsWith("INSERT"));
  assert.equal(lines.length, 150_002); // nessuno statement perso
  // i genitori restano prima dei figli anche su dump grandi
  assert.ok(out.indexOf('INSERT INTO "contributors"') < out.indexOf("INSERT INTO `cameras`"));
});

test("CLI: il file in output mette contributors prima di cameras e camera_lifecycle_events", () => {
  const dir = mkdtempSync(join(tmpdir(), "osdb-reorder-"));
  const schemaPath = join(dir, "schema.sql");
  const dataPath = join(dir, "data.sql");
  writeFileSync(schemaPath, SCHEMA);
  writeFileSync(dataPath, DATA_ALPHA);

  const out = execFileSync("node", [SCRIPT, schemaPath, dataPath], { encoding: "utf8" });
  const lines = out.split("\n").filter((l) => l.trim() !== "");
  const idx = (needle) => lines.findIndex((l) => l.startsWith(needle));

  assert.equal(lines[0], "PRAGMA defer_foreign_keys=TRUE;"); // la testa resta in cima
  assert.ok(idx("INSERT INTO \"contributors\"") < idx("INSERT INTO `cameras`"));
  assert.ok(idx("INSERT INTO `cameras`") < idx("INSERT INTO `camera_lifecycle_events`"));
  // ordine interno alla tabella preservato (A prima di B)
  assert.match(out, /VALUES\(10,'A'[\s\S]*VALUES\(11,'B'/);
  // nessuno statement perso
  assert.equal(lines.filter((l) => l.startsWith("INSERT")).length, 4);
  assert.equal(readFileSync(dataPath, "utf8"), DATA_ALPHA); // input non modificato
});
