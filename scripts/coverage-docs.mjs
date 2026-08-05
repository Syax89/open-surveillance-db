#!/usr/bin/env node
// QA coverage baseline generator + CI threshold gate (test tooling, never shipped).
//
// Consumes the Istanbul JSON produced by:
//   npm run coverage && npm run coverage:docs
// i.e. c8 report --reporter=json over the NODE_V8_COVERAGE raw dumps from a
// `node --test --experimental-test-coverage` run with OSDB_COVERAGE_TREE=1.
//
// Why a custom merge: the four test harnesses transpile the same production
// source (app/api/*, app/lib/*, db/*, worker/index.ts) into one temp tree per
// test-file process, and each process covers only the slice it exercises.
// Node's built-in "all files" row sums those partial instances, which
// inflates the denominator and understates true coverage. This script merges
// the instances of the same source at LINE/BRANCH/FUNCTION/STATEMENT level
// (union of hits) so the baseline reflects the real production code.
//
// Usage:
//   node scripts/coverage-docs.mjs              # regenerate docs/QA_COVERAGE.md
//   node scripts/coverage-docs.mjs --check      # + exit 1 if lines% < COVERAGE_LINES (default 75)

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_JSON = path.join(root, ".coverage", "report", "coverage-final.json");
const COVERAGE_TXT = path.join(root, ".coverage", "coverage.txt");
const OUT_MD = path.join(root, "docs", "QA_COVERAGE.md");
const CHECK = process.argv.includes("--check");
const THRESHOLD = Number(process.env.COVERAGE_LINES ?? 75);

// ---------------------------------------------------------------------------
// Source mapping: .coverage/trees/osdb-<harness>-<rand>/<rel>.mjs -> src path
// ---------------------------------------------------------------------------

const TREE_RE = /[\\/]\.coverage[\\/]trees[\\/]osdb-(routes|e2e|db-runtime|freshness)-[^\\/]+[\\/]/;

// Harness tree layouts:
//   routes      -> db/*.mjs are MOCKS (excluded), db-real/*.mjs real, app/** real
//   e2e         -> db/*.mjs real except geocode.mjs (mock), app/** real, worker.mjs real
//   db-runtime  -> db/** + app/lib/** real
//   freshness   -> db/** + app/lib/** real
// cloudflare-workers.mjs is a mock in every tree; vinext-*-stub.mjs are stubs.

const MOCK_LEAVES = new Set(["cloudflare-workers.mjs", "vinext-image-stub.mjs", "vinext-router-stub.mjs"]);

function mapToSource(url) {
  const match = TREE_RE.exec(url);
  if (!match) return null;
  const harness = match[1];
  const rel = url.slice(match.index + match[0].length).replace(/\\/g, "/");

  if (MOCK_LEAVES.has(path.basename(rel))) return null;
  if (rel === "db/geocode.mjs") return null; // e2e network mock
  if (harness === "routes" && rel.startsWith("db/")) return null; // api mocks

  if (rel === "worker.mjs") return "worker/index.ts";
  if (rel.startsWith("db-real/")) return `db/${rel.slice("db-real/".length).replace(/\.mjs$/, ".ts")}`;
  if (rel.startsWith("db/")) return `db/${rel.slice("db/".length).replace(/\.mjs$/, ".ts")}`;
  if (rel.startsWith("app/")) return rel.replace(/\.mjs$/, ".ts");
  return null;
}

// ---------------------------------------------------------------------------
// Line/statement/function/branch level merge (union of hits across instances)
// ---------------------------------------------------------------------------

const METRICS = ["lines", "branches", "functions", "statements"];

function emptyMetric() {
  return { total: 0, covered: 0 };
}

function newSource() {
  const m = {};
  for (const name of METRICS) m[name] = emptyMetric();
  m.statementMap = null; // {id: {start:{line}, end:{line}}} — identical across instances
  m.fnMap = null; // {id: {name, line}}
  m.branchMap = null; // {id: {locations: [...]}}
  m.s = new Map(); // stmtId -> hitCount
  m.f = new Map(); // fnId -> hitCount
  m.b = new Map(); // branchId -> array of hitCounts
  return m;
}

function absorb(source, entry) {
  if (!source.statementMap && entry.statementMap) source.statementMap = entry.statementMap;
  if (!source.fnMap && entry.fnMap) source.fnMap = entry.fnMap;
  if (!source.branchMap && entry.branchMap) source.branchMap = entry.branchMap;
  // Statements: {stmtId: count}
  for (const [id, count] of Object.entries(entry.s ?? {})) {
    source.s.set(id, Math.max(source.s.get(id) ?? 0, count));
  }
  // Functions: {fnId: count}
  for (const [id, count] of Object.entries(entry.f ?? {})) {
    source.f.set(id, Math.max(source.f.get(id) ?? 0, count));
  }
  // Branches: {branchId: [count per location]} — union per location.
  for (const [id, counts] of Object.entries(entry.b ?? {})) {
    const cur = source.b.get(id) ?? [];
    counts.forEach((count, i) => {
      cur[i] = Math.max(cur[i] ?? 0, count);
    });
    source.b.set(id, cur);
  }
}

function finalize(source) {
  const stmts = [...source.s.values()];
  source.statements = { total: stmts.length, covered: stmts.filter((c) => c > 0).length };

  // Line coverage derived from statements (Istanbul convention): a line is
  // executable if any statement spans it, covered if any executed statement
  // spans it. Ranges are inclusive [start.line .. end.line].
  const totalLines = new Set();
  const coveredLines = new Set();
  for (const [id, count] of source.s) {
    const loc = source.statementMap?.[id];
    if (!loc?.start?.line) continue;
    for (let line = loc.start.line; line <= (loc.end?.line ?? loc.start.line); line++) {
      totalLines.add(line);
      if (count > 0) coveredLines.add(line);
    }
  }
  source.lines = { total: totalLines.size, covered: coveredLines.size };

  const fns = [...source.f.values()];
  source.functions = { total: fns.length, covered: fns.filter((c) => c > 0).length };

  let bTotal = 0;
  let bCovered = 0;
  for (const [id, counts] of source.b) {
    const locations = source.branchMap?.[id]?.locations?.length ?? counts.length;
    bTotal += locations;
    counts.forEach((c, i) => {
      if (c > 0 && i < locations) bCovered += 1;
    });
  }
  source.branches = { total: bTotal, covered: bCovered };
  return source;
}

const pct = (m) => (m.total === 0 ? 100 : (m.covered / m.total) * 100);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(REPORT_JSON)) {
    console.error(`Missing ${REPORT_JSON} — run "npm run coverage && npm run coverage:docs" first.`);
    process.exit(1);
  }

  const raw = JSON.parse(await readFile(REPORT_JSON, "utf8"));
  const bySource = new Map();
  let dropped = 0;

  for (const [url, entry] of Object.entries(raw)) {
    const source = mapToSource(url.replace(/^file:\/\//, ""));
    if (!source) {
      dropped += 1;
      continue;
    }
    if (!bySource.has(source)) bySource.set(source, newSource());
    absorb(bySource.get(source), entry);
  }

  const rows = [...bySource.entries()]
    .map(([file, s]) => ({ file, ...finalize(s) }))
    .sort((a, b) => pct(a.lines) - pct(b.lines) || a.file.localeCompare(b.file));

  const total = newSource();
  for (const r of rows) {
    for (const name of METRICS) {
      total[name].total += r[name].total;
      total[name].covered += r[name].covered;
    }
  }

  const linesPct = pct(total.lines);
  const lowest = rows.filter((r) => pct(r.lines) < 100).slice(0, 10);

  // Suite stats from the tee'd run output, if available.
  let suiteNote = "";
  if (existsSync(COVERAGE_TXT)) {
    const txt = await readFile(COVERAGE_TXT, "utf8");
    // Node's test runner emits either "# " (pipe) or "ℹ " (TTY-style) prefixes.
    const tests = txt.match(/^[#ℹ] tests (\d+)$/m)?.[1];
    const pass = txt.match(/^[#ℹ] pass (\d+)$/m)?.[1];
    const fail = txt.match(/^[#ℹ] fail (\d+)$/m)?.[1];
    if (tests) suiteNote = `Suite: ${pass ?? "?"}/${tests} test PASS, ${fail ?? "0"} fail.`;
  }

  const date = new Date().toISOString().slice(0, 10);
  let commit = "unknown";
  try {
    const { execFileSync } = await import("node:child_process");
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
  } catch { /* not a git checkout */ }

  const table = [
    "| File (sorgente) | Righe % | Branch % | Funzioni % | Righe coperte/totali |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| \`${r.file}\` | ${pct(r.lines).toFixed(2)} | ${pct(r.branches).toFixed(2)} | ${pct(r.functions).toFixed(2)} | ${r.lines.covered}/${r.lines.total} |`),
  ].join("\n");

  // Preserve any manually-curated CI note between markers so it survives
  // regeneration (e.g. the t_c97844c2 note on the coverage job flake).
  const NOTE_BEGIN = "<!-- CI-NOTE-BEGIN -->";
  const NOTE_END = "<!-- CI-NOTE-END -->";
  let preservedNote = "";
  try {
    const existing = await readFile(OUT_MD, "utf8");
    const m = existing.match(new RegExp(`${NOTE_BEGIN}[\\s\\S]*?${NOTE_END}`));
    if (m) preservedNote = m[0];
  } catch { /* first run: nothing to preserve */ }

  const md = `# QA Coverage Report

Baseline generata il **${date}** su commit \`${commit}\` con
\`npm run coverage && npm run coverage:docs\`. ${suiteNote}

## Riepilogo (solo codice di produzione, esclusi test/helper/mock/fixture)

| Metrica | Coperto | Totale | % |
|---|---|---|---|
| Righe | ${total.lines.covered} | ${total.lines.total} | **${linesPct.toFixed(2)}%** |
| Branch | ${total.branches.covered} | ${total.branches.total} | ${pct(total.branches).toFixed(2)}% |
| Funzioni | ${total.functions.covered} | ${total.functions.total} | ${pct(total.functions).toFixed(2)}% |
| Statement | ${total.statements.covered} | ${total.statements.total} | ${pct(total.statements).toFixed(2)}% |

## Soglia minima CI

La soglia minima sulle righe è **${THRESHOLD}%** (default 75, override con \`COVERAGE_LINES\`).
È applicata dal job \`coverage\` in \`.github/workflows/ci.yml\` (\`scripts/coverage-docs.mjs --check\`):
sotto soglia il job fallisce.

${preservedNote}

## Moduli a coverage più bassa (priorità per nuovi test)

${lowest.length ? lowest.map((r) => `- \`${r.file}\` — righe ${pct(r.lines).toFixed(2)}% (${r.lines.covered}/${r.lines.total}), branch ${pct(r.branches).toFixed(2)}%, funzioni ${pct(r.functions).toFixed(2)}%`).join("\n") : "- Nessun modulo sotto il 100%."}

## Dettaglio per file

${table}

## Metodologia

- I test transpilano le route \`app/api/**\`, i moduli \`app/lib/*\`, \`db/*\` e \`worker/index.ts\`
  in alberi temporanei (harness in \`tests/helpers/\`); con \`OSDB_COVERAGE_TREE=1\` gli alberi
  restano su disco in \`.coverage/trees/\` (gitignored) così il reporter Node può attribuire le righe.
- Esclusi dal computo: \`tests/**\`, helper e mock di test (\`cloudflare-workers.mjs\`, \`db/geocode.mjs\`,
  mocks \`db/*\` dell'albero routes, stub vinext), \`node_modules\`, bundle \`dist/\` (build di Next).
- I file transpilati sono rimappati alla sorgente TypeScript (\`db-real/cameras.mjs\` → \`db/cameras.ts\`,
  \`worker.mjs\` → \`worker/index.ts\`) e le istanze duplicate nei quattro harness sono **unite per
  linea/branch/funzione/statement** (union degli hit): il numero riflette la copertura reale del
  sorgente, non la somma di istanze parziali.
- Il bundle \`dist/server/index.js\` è escluso: i test pagina lo caricano come modulo ma è output
  di build, non sorgente. I componenti client (\`app/components\` "use client") non sono quindi
  misurati da questa metrica — copertura a cura dei test di interazione (PR #94).
- Dati grezzi V8: \`.coverage/raw/\`; report Istanbul: \`.coverage/report/\`; log run: \`.coverage/coverage.txt\`.
`;

  await writeFile(OUT_MD, md);

  const f = (m) => `${(m.covered / m.total * 100).toFixed(2)}%`.padStart(7);
  console.log("=".repeat(72));
  console.log("QA COVERAGE — baseline (produzione, esclusi test/mock/fixture)");
  console.log("=".repeat(72));
  console.log(`  File sorgente considerati : ${rows.length} (${dropped} voci scartate)`);
  console.log(`  Righe    : ${f(total.lines)}  (${total.lines.covered}/${total.lines.total})`);
  console.log(`  Branch   : ${f(total.branches)}  (${total.branches.covered}/${total.branches.total})`);
  console.log(`  Funzioni : ${f(total.functions)}  (${total.functions.covered}/${total.functions.total})`);
  console.log(`  Statement: ${f(total.statements)}  (${total.statements.covered}/${total.statements.total})`);
  console.log("-".repeat(72));
  console.log("  Moduli a coverage più bassa:");
  for (const r of lowest) {
    console.log(`    ${pct(r.lines).toFixed(2).padStart(6)}%  ${r.file}  (${r.lines.covered}/${r.lines.total} righe)`);
  }
  console.log("-".repeat(72));
  console.log(`  Report scritto in ${OUT_MD}`);

  if (CHECK) {
    const ok = linesPct >= THRESHOLD;
    console.log(`  [check] soglia righe ${THRESHOLD}% → ${ok ? "OK (verde)" : `FAIL (${linesPct.toFixed(2)}% < ${THRESHOLD}%)`}`);
    if (!ok) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
