/**
 * Publication-copy truth regression (guide / faq / report / map bundles).
 *
 * Context (guide current-state rewrite): the guide, FAQ, report and map copy
 * used to repeat the obsolete claim that an ordinary report was private /
 * "reviewed before publication", and that an edit to a published record was
 * "reviewed before it appears in public data". The product truth — already
 * stated in app/lib/legal/en.ts, app/lib/i18n/rules.ts, manifesto.ts and
 * community.ts — is:
 *
 *   1. A report from a verified account is PUBLISHED IMMEDIATELY. There is
 *      no review queue for ordinary reports.
 *   2. An edit to an already public record becomes a PRIVATE PROPOSAL: the
 *      published version stays visible until a moderator applies or
 *      discards it (nothing public is ever overwritten behind the scenes).
 *
 * These assertions pin the corrected copy in BOTH languages at the i18n
 * bundle level (the source of truth) and forbid the obsolete claims from
 * coming back. Render-level coverage (EN SSR in rendered-html.test.mjs,
 * IT SSR in i18n-pages.test.mjs) is added separately where the copy is
 * actually rendered; faq.aEdit and map.emptyBody are not part of any SSR
 * output (FAQ page renders only the four quick answers; the map empty state
 * is client-side only), so the bundle is their only honest coverage point.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const i18nDir = path.join(root, "app", "lib", "i18n");

/**
 * Transpile a TS module with the project's own TypeScript compiler, write it
 * to a temp file and import it. Same pattern as community-i18n.test.mjs /
 * navigation-pages.test.mjs — no build required.
 */
async function transpileAndImport(tsSourcePath) {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const { pathToFileURL } = await import("node:url");
  const ts = (await import("typescript")).default;
  const source = await readFile(tsSourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: tsSourcePath,
  }).outputText;
  const dir = await mkdtemp(path.join(os.tmpdir(), "osdb-i18n-"));
  const out = path.join(dir, "bundle.mjs");
  await writeFile(out, output);
  try {
    return await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Every leaf string value of a bundle (plural formatters called with 1). */
function collectStrings(bundle) {
  const out = [];
  const walk = (obj) => {
    for (const value of Object.values(obj)) {
      if (typeof value === "function") out.push(value(1));
      else if (typeof value === "string") out.push(value);
      else if (value && typeof value === "object") walk(value);
    }
  };
  walk(bundle);
  return out;
}

const CHANGED_DOMAINS = ["guide", "faq", "map", "report"];

// ---------------------------------------------------------------------------
// 1. Corrected truth, EN + IT
// ---------------------------------------------------------------------------

test("guide: edits to published records become private proposals in EN and IT", async () => {
  const { en, it } = await transpileAndImport(path.join(i18nDir, "guide.ts"));

  // editBody: an update to a public record is a private proposal, and the
  // published version stays visible until a moderator decides.
  assert.ok(en.editBody.includes("becomes a private proposal"), "EN editBody must say the update becomes a private proposal");
  assert.ok(en.editBody.includes("moderator applies or discards it"), "EN editBody must say a moderator applies or discards it");
  assert.ok(it.editBody.includes("diventa una proposta privata"), "IT editBody must say the update becomes a private proposal");
  assert.ok(it.editBody.includes("applica o scarta"), "IT editBody must say a moderator applies or discards it");

  // editRemoderation: an edit never overwrites the public record.
  assert.equal(en.editRemoderationTitle, "Updates become proposals");
  assert.equal(it.editRemoderationTitle, "Gli aggiornamenti diventano proposte");
  assert.ok(en.editRemoderationBody.includes("an edit never overwrites it"), "EN editRemoderationBody must say an edit never overwrites the record");
  assert.ok(it.editRemoderationBody.includes("non lo sovrascrive mai"), "IT editRemoderationBody must say an edit never overwrites the record");

  // editNotImmediate: only the proposal is private; the public record stays
  // in every public output until the proposal is decided.
  assert.equal(en.editNotImmediateTitle, "The proposal stays private");
  assert.equal(it.editNotImmediateTitle, "La proposta resta privata");
  assert.ok(
    en.editNotImmediateBody.includes("The published record keeps appearing in the map, the directory and the exports"),
    "EN editNotImmediateBody must say the published record stays visible in public outputs",
  );
  assert.ok(
    it.editNotImmediateBody.includes("Il record pubblicato continua a comparire in mappa, elenco ed esportazioni"),
    "IT editNotImmediateBody must say the published record stays visible in public outputs",
  );

  // editOwnerBody: other people's records cannot be edited directly.
  assert.ok(en.editOwnerBody.includes("private correction form"), "EN editOwnerBody must point at the private correction form");
  assert.ok(it.editOwnerBody.includes("modulo privato di correzione"), "IT editOwnerBody must point at the private correction form");
});

test("faq: the edit answer describes private proposals in EN and IT", async () => {
  const { en, it } = await transpileAndImport(path.join(i18nDir, "faq.ts"));

  assert.ok(en.aEdit.includes("becomes a private proposal"), "EN aEdit must say the update becomes a private proposal");
  assert.ok(en.aEdit.includes("moderator applies or discards it"), "EN aEdit must say a moderator applies or discards it");
  assert.ok(it.aEdit.includes("diventa una proposta privata"), "IT aEdit must say the update becomes a private proposal");
  assert.ok(it.aEdit.includes("modulo privato di correzione"), "IT aEdit must point at the private correction form");
});

test("report: a report is published immediately, in EN and IT", async () => {
  const { en, it } = await transpileAndImport(path.join(i18nDir, "report.ts"));

  for (const [key, enValue, itValue] of [
    ["pageIntro", en.pageIntro, it.pageIntro],
    ["reportIntro", en.reportIntro, it.reportIntro],
  ]) {
    assert.ok(enValue.endsWith("Your report is published immediately."), `EN ${key} must end with the immediate-publication sentence`);
    assert.ok(itValue.endsWith("La tua segnalazione viene pubblicata subito."), `IT ${key} must end with the immediate-publication sentence`);
  }
});

test("map: the empty state invites a public-space report, not a private observation", async () => {
  const { en, it } = await transpileAndImport(path.join(i18nDir, "map.ts"));

  assert.ok(
    en.emptyBody.includes("report a camera you observed from public space"),
    "EN emptyBody must invite reporting a camera observed from public space",
  );
  assert.ok(
    it.emptyBody.includes("segnalare una telecamera osservata dallo spazio pubblico"),
    "IT emptyBody must invite reporting a camera observed from public space",
  );
});

// ---------------------------------------------------------------------------
// 2. Obsolete claims must not come back (both languages, whole bundles)
// ---------------------------------------------------------------------------

test("no obsolete private/reviewed-before-publication claim survives in the changed bundles", async () => {
  const forbiddenEn = [
    "after review", // old report intro: "published immediately after review"
    "private observation", // old map empty body: "submit a private observation for moderation"
    "reviewed before they appear", // old guide edit body
    "stay private while they are reviewed", // old guide remoderation body
    "Not immediately public", // old guide editNotImmediate title
  ];
  const forbiddenIt = [
    "dopo la revisione", // old report intro: "pubblicata dopo la revisione"
    "osservazione privata", // old map empty body: "un'osservazione privata per la moderazione"
    "vengono riviste prima di comparire", // old guide edit body
    "restano private durante la revisione", // old guide remoderation body
    "Non subito pubblico", // old guide editNotImmediate title
  ];

  for (const domain of CHANGED_DOMAINS) {
    const { en, it } = await transpileAndImport(path.join(i18nDir, `${domain}.ts`));
    for (const value of collectStrings(en)) {
      for (const phrase of forbiddenEn) {
        assert.ok(
          !value.includes(phrase),
          `${domain}.en must not contain obsolete copy "${phrase}" — found: "${value}"`,
        );
      }
    }
    for (const value of collectStrings(it)) {
      for (const phrase of forbiddenIt) {
        assert.ok(
          !value.includes(phrase),
          `${domain}.it must not contain obsolete copy "${phrase}" — found: "${value}"`,
        );
      }
    }
  }
});
