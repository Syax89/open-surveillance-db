#!/usr/bin/env node
// Riordina le INSERT di un dump D1 (export --no-schema) per rispettare le
// foreign key: i genitori prima dei figli.
//
// Perche': D1 non permette di disattivare l'enforcement delle FK e l'import
// remoto committa a batch, quindi il `PRAGMA defer_foreign_keys=TRUE` in testa
// al dump non basta. L'export ordina le tabelle alfabeticamente (es.
// camera_lifecycle_events prima di cameras) -> il restore muore con
// "FOREIGN KEY constraint failed" (drill 34973331544). Con l'ordine
// topologico il file dati si applica dopo lo schema senza violazioni.
//
// Uso: node scripts/ops/reorder-d1-data.mjs <schema.sql> <data.sql> > dati-ordinati.sql
//
// Assunzione (verificata sui dump D1 reali): una INSERT per riga, terminata
// da ';'. Se non regge, esce con errore invece di produrre un dump corrotto.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [schemaPath, dataPath] = process.argv.slice(2);

const TABLE_RE = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+["'`]?([A-Za-z0-9_]+)["'`]?\s*\(/g;

/** Estrae {tabella -> Set(tabelle referenziate)} dallo schema. */
export function tableDeps(schemaSql) {
  const deps = new Map();
  // Taglia il corpo di ogni CREATE TABLE bilanciando le parentesi: i
  // REFERENCES possono stare su piu' righe.
  TABLE_RE.lastIndex = 0;
  let m;
  while ((m = TABLE_RE.exec(schemaSql)) !== null) {
    const name = m[1];
    let depth = 1;
    let i = TABLE_RE.lastIndex;
    for (; i < schemaSql.length && depth > 0; i++) {
      const c = schemaSql[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    const body = schemaSql.slice(TABLE_RE.lastIndex, i);
    const refs = new Set();
    for (const r of body.matchAll(/REFERENCES\s+["'`]?([A-Za-z0-9_]+)["'`]?/gi)) refs.add(r[1]);
    deps.set(name, refs);
    TABLE_RE.lastIndex = i;
  }
  return deps;
}

/** Raggruppa le INSERT per tabella, preservando l'ordine interno. */
export function splitInserts(dataSql) {
  const head = [];
  const byTable = new Map();
  const lines = dataSql.split("\n");
  for (const line of lines) {
    const ins = /^INSERT INTO\s+["'`]?([A-Za-z0-9_]+)["'`]?/.exec(line);
    if (!ins) {
      head.push(line);
      continue;
    }
    if (!line.trimEnd().endsWith(";")) {
      throw new Error(`INSERT non su una sola riga (formato dump inatteso): ${line.slice(0, 80)}`);
    }
    const t = ins[1];
    if (!byTable.has(t)) byTable.set(t, []);
    byTable.get(t).push(line);
  }
  return { head, byTable };
}

/** Ordine topologico: i genitori prima dei figli; i cicli restano in coda. */
export function orderTables(tables, deps) {
  const present = new Set(tables);
  const ordered = [];
  const done = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const t of tables) {
      if (done.has(t)) continue;
      const parents = [...(deps.get(t) ?? [])].filter((p) => present.has(p) && !done.has(p));
      if (parents.length === 0) {
        ordered.push(t);
        done.add(t);
        progress = true;
      }
    }
  }
  const cycles = tables.filter((t) => !done.has(t));
  return { ordered, cycles };
}

function main() {
  if (!schemaPath || !dataPath) {
    console.error("uso: node scripts/ops/reorder-d1-data.mjs <schema.sql> <data.sql>");
    process.exit(2);
  }
  const schema = readFileSync(schemaPath, "utf8");
  const data = readFileSync(dataPath, "utf8");
  const deps = tableDeps(schema);
  const { head, byTable } = splitInserts(data);
  const { ordered, cycles } = orderTables([...byTable.keys()], deps);
  if (cycles.length > 0) {
    console.error(`# attenzione: dipendenze cicliche fra ${cycles.join(", ")} — ordine originale`);
  }
  const unknown = [...byTable.keys()].filter((t) => !deps.has(t));
  if (unknown.length > 0) {
    console.error(`# attenzione: tabelle nei dati assenti dallo schema: ${unknown.join(", ")}`);
  }
  const out = [...head];
  // push riga per riga: lo spread di ~160k argomenti manda in RangeError
  // (Maximum call stack size exceeded) — successo nel run 34975382804.
  for (const t of [...ordered, ...cycles]) {
    for (const line of byTable.get(t)) out.push(line);
  }
  process.stdout.write(out.join("\n"));
  console.error(`# riordinate ${byTable.size} tabelle (${ordered.length} in ordine topologico)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
