/**
 * Legal bundle parity guard (ADR 0007) — follow-up ADR 0021 (t_e480aa1e).
 *
 * Verifies after a re-sync of app/lib/legal/en.ts + it.ts:
 *   1. structural parity (same non-text keys, same section block counts,
 *      same table row cardinality, by section index — not by translated
 *      heading);
 *   2. the ADR 0021 content the canonical v0.11/v0.7 requires: the
 *      "Community actions on records" row and the public per-record
 *      event-history note in privacy § 3, the updated moderation-audit
 *      purpose ("historical appeals closed by migration"), and the TERMS
 *      § 3 authentication disclosure (email verification for write access,
 *      passkeys, OIDC — ADR 0020).
 *
 * Usage: node scripts/check-legal-parity.mjs  (run from the repo root)
 * Exit code 1 on any mismatch.
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function parseBundle(file) {
  const dir = mkdtempSync(path.join(tmpdir(), "legal-parse-"));
  const out = path.join(dir, "bundle.mjs");
  const src = readFileSync(file, "utf8")
    .replace(/^import type .*$/gm, "")
    .replace(/export const (en|it)Legal: LegalContent =/, "const L =")
    .replace(/\n(export type|export interface)[\s\S]*$/, "");
  writeFileSync(out, src + "\nexport default L;\n");
  return import("file://" + out).then((m) => m.default);
}

// Structural shape: keep only non-localized keys (exclude all user-facing text).
const TEXT_KEYS = new Set(["text", "items", "heading", "eyebrow", "intro", "versionNote", "title", "label", "note", "caption", "headers", "rows"]);
function shape(obj) {
  if (Array.isArray(obj)) return obj.map(shape);
  if (obj && typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    const out = {};
    for (const k of keys) {
      if (TEXT_KEYS.has(k)) continue;
      out[k] = shape(obj[k]);
    }
    return out;
  }
  return obj;
}

// Per-section block-type counts by INDEX (not by translated heading).
function sectionCounts(bundle) {
  const docs = Object.keys(bundle).sort(); // privacy, terms, licences, accessibility
  const out = {};
  for (const doc of docs) {
    const docObj = bundle[doc];
    if (!docObj || !Array.isArray(docObj.sections)) continue;
    out[doc] = docObj.sections.map((sec) => {
      const counts = { list: 0, paragraph: 0, note: 0, table: 0 };
      for (const bl of sec.blocks ?? []) if (counts[bl.type] !== undefined) counts[bl.type]++;
      return counts;
    });
  }
  return out;
}

const en = await parseBundle("app/lib/legal/en.ts");
const it = await parseBundle("app/lib/legal/it.ts");

const enShape = shape(en);
const itShape = shape(it);
const equal = JSON.stringify(enShape) === JSON.stringify(itShape);
console.log("STRUCTURAL PARITY EN/IT (non-text keys):", equal ? "OK" : "MISMATCH");
if (!equal) {
  function diff(a, b, p = "$") {
    if (JSON.stringify(a) === JSON.stringify(b)) return null;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return `${p}: length ${a.length} vs ${b.length}`;
      for (let i = 0; i < a.length; i++) { const d = diff(a[i], b[i], `${p}[${i}]`); if (d) return d; }
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) { const d = diff(a[k], b[k], `${p}.${k}`); if (d) return d; }
    }
    return `${p}: scalar ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  }
  console.log("FIRST DIFF:", diff(enShape, itShape));
}

const enC = sectionCounts(en);
const itC = sectionCounts(it);
const sameCounts = JSON.stringify(enC) === JSON.stringify(itC);
console.log("SECTION BLOCK-COUNTS EN/IT (by index):", sameCounts ? "OK" : "MISMATCH");
if (!sameCounts) {
  for (const doc of Object.keys(enC)) {
    const a = enC[doc];
    const b = itC[doc];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      console.log(`  ${doc}: EN=${JSON.stringify(a)} IT=${JSON.stringify(b)}`);
    }
  }
}

// Table row-cardinality parity: same number of rows per table, per section index.
function tableRowCounts(bundle) {
  const out = {};
  for (const doc of Object.keys(bundle).sort()) {
    const docObj = bundle[doc];
    if (!docObj || !Array.isArray(docObj.sections)) continue;
    out[doc] = docObj.sections.map((sec) =>
      (sec.blocks ?? []).filter((bl) => bl.type === "table").map((t) => (t.rows ?? []).length),
    );
  }
  return out;
}
const enR = tableRowCounts(en);
const itR = tableRowCounts(it);
const sameRows = JSON.stringify(enR) === JSON.stringify(itR);
console.log("TABLE ROW-COUNTS EN/IT (by section index):", sameRows ? "OK" : "MISMATCH");
if (!sameRows) {
  for (const doc of Object.keys(enR)) {
    if (JSON.stringify(enR[doc]) !== JSON.stringify(itR[doc])) {
      console.log(`  ${doc}: EN=${JSON.stringify(enR[doc])} IT=${JSON.stringify(itR[doc])}`);
    }
  }
}

// --- Content-level checks (localized patterns) ---
const sec3 = (b) => b.sections.find((s) => s.blocks && s.blocks.some((bl) => bl.type === "table"));
const tableRows = (b) => sec3(b).blocks.filter((bl) => bl.type === "table").flatMap((t) => t.rows ?? []);
const notes = (b) => sec3(b).blocks.filter((bl) => bl.type === "note").map((n) => n.text);

let fail = 0;
const runCheck = (name, fn, bundle) => {
  let ok = true;
  try { ok = fn(bundle); } catch { ok = false; }
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) fail++;
};
runCheck("EN privacy §3 community-actions row", (b) => tableRows(b.privacy).some((r) => r[0] && r[0].includes("Community actions on records")), en);
runCheck("IT privacy §3 community-actions row", (b) => tableRows(b.privacy).some((r) => r[0] && r[0].includes("Azioni della community sui record")), it);
runCheck("EN moderation-audit purpose updated", (b) => {
  const r = tableRows(b.privacy).find((x) => x[0] && x[0].includes("Moderation audit entries"));
  return r ? r[2].includes("historical appeals closed by migration") : false;
}, en);
runCheck("IT moderation-audit purpose updated", (b) => {
  const r = tableRows(b.privacy).find((x) => x[0] && x[0].includes("Voci di audit della moderazione"));
  return r ? r[2].includes("ricorsi storici chiusi con la migrazione") : false;
}, it);
runCheck("EN event-history note", (b) => notes(b.privacy).some((n) => n.includes("Public per-record event history")), en);
runCheck("IT event-history note", (b) => notes(b.privacy).some((n) => n.includes("Cronologia pubblica degli eventi per record")), it);
runCheck("EN TERMS auth disclosure", (b) => {
  const t = JSON.stringify(b.terms.sections.find((s) => s.heading.includes("Permitted use")));
  return t.includes("Authentication methods") && t.includes("email verification required for write access") && t.includes("OIDC");
}, en);
runCheck("IT TERMS auth disclosure", (b) => {
  const t = JSON.stringify(b.terms.sections.find((s) => s.heading.includes("Uso consentito")));
  return t.includes("Metodi di autenticazione") && t.includes("verifica dell'email richiesta per l'accesso in scrittura") && t.includes("OIDC");
}, it);
console.log(fail === 0 ? "CONTENT CHECKS: all PASS" : `${fail} content checks FAILED`);
if (fail > 0 || !equal || !sameCounts || !sameRows) process.exit(1);
console.log("PARITY GUARD: OK");
