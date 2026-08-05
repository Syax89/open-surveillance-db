/**
 * community bundle QA — frozen vocabulary of the community system
 * (COMMUNITY_PLAN §6, copy review #814, task C-i18n t_f0e2a3ab).
 *
 * The structural EN/IT parity is a build gate (`Translation<typeof en>` in
 * types.ts) and is re-checked per-domain by navigation-pages.test.mjs; this
 * suite pins the SEMANTIC contract:
 *   1. Eva's golden strings EN/IT (frozen terminology, COMMUNITY_PLAN §6.1
 *      + copy comment #814) are the exact values served to the UI;
 *   2. zero gamification jargon (stars / karma / XP / points / tiers / rank
 *      / upvotes / badges and their Italian equivalents) in the community
 *      bundle — frozen table column "Vietato";
 *   3. Italian plurals "1 verifica / 3 verifiche / 0 verifiche" (and the
 *      English counterparts) via the plural formatters;
 *   4. the pre-existing IT "contributore" → "contributor" fix (auth.ts +
 *      moderazione.ts, COMMUNITY_PLAN §6.1) — no "contributore" left in any
 *      Italian bundle;
 *   5. community.ts is registered in index.ts for both locales (ADR 0007).
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const i18nDir = path.join(root, "app", "lib", "i18n");

/**
 * Transpile a TS module with the project's own TypeScript compiler, write it
 * to a temp file and import it. Same pattern as navigation-pages.test.mjs.
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

/** Collect every leaf string value of a bundle; plural formatters are
 *  called with a representative count (1) so their output is scanned too. */
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

/** Forbidden gamification jargon (frozen table column "Vietato", §6.1). */
const FORBIDDEN = [
  /\bstars?\b/i, // NEVER "stars"
  /karma/i,
  /\bxp\b/i,
  /\bpoints?\b/i,
  /\btiers?\b/i, // NEVER "tiers"
  /\brank\b/i, // NEVER "rank"
  /\bupvotes?\b/i,
  /\bbadges?\b/i,
  /\bexpert\b/i, // NEVER "Expert" (badge is "Experienced")
  /\bmaster\b/i,
  /\bvip\b/i,
  /\bpro\b/i,
  /\bstelle\b/i, // IT: mai "stelle"
  /\bstelline\b/i, // IT: mai "stelline"
  /\bpunti\b/i, // IT: mai "punti"
  /\bpunteggio\b/i, // IT: mai "punteggio"
];

// ---------------------------------------------------------------------------
// 1. Golden strings (Eva, comment #814) — exact frozen values
// ---------------------------------------------------------------------------

test("community bundle exposes Eva's frozen EN/IT terminology", async () => {
  const mod = await transpileAndImport(path.join(i18nDir, "community.ts"));
  const { en, it } = mod;

  const golden = [
    // Trust levels (frozen: "trust levels", never tiers/rank).
    ["trustLevels", "Trust levels", "Livelli di fiducia"],
    ["yourTrustLevel", "Your trust level", "Il tuo livello di fiducia"],
    ["levelReached", "You reached a new trust level.", "Hai raggiunto un nuovo livello di fiducia."],
    // Badges (frozen: New/Trusted/Experienced contributor).
    ["badgeLabels.new", "New contributor", "Nuovo contributor"],
    ["badgeLabels.trusted", "Trusted contributor", "Contributor fidato"],
    ["badgeLabels.experienced", "Experienced contributor", "Contributor esperto"],
    ["levelDescriptions.trusted",
      "You are a trusted contributor. Your consistent, live contributions mean your community actions carry more weight in the automatic thresholds.",
      "Sei un contributor fidato. I tuoi contributi costanti e attivi fanno sì che le tue azioni della community pesino di più nelle soglie automatiche."],
    // Verifications (frozen: "verifications", never stars).
    ["verifications", "Verifications", "Verifiche"],
    ["verifiedByCommunity", "Verified by the community", "Verificato dalla community"],
    ["confirmExists", "Confirm this record exists", "Conferma che questo record esiste"],
    ["verificationAdded", "Verification added", "Verifica aggiunta"],
    ["removeVerification", "Remove verification", "Rimuovi verifica"],
    ["verificationRemoved", "Verification removed", "Verifica rimossa"],
    ["reportVerificationAbuse", "Report verification as abuse", "Segnala la verifica come abuso"],
    ["abuseReportSent", "Abuse report sent", "Segnalazione di abuso inviata"],
    // Contributions / profile.
    ["yourContributions", "Your contributions", "I tuoi contributi"],
    ["editContribution", "Edit contribution", "Modifica contributo"],
    ["noContributionsYet", "No contributions yet", "Nessun contributo"],
    // Empty state (record verifications).
    ["noVerificationsYet", "No verifications yet", "Nessuna verifica"],
    // Errors.
    ["errorAddVerification", "Could not add your verification. Please try again.",
      "Non è stato possibile aggiungere la verifica. Riprova."],
    ["errorSelfVerify", "You cannot verify your own record.", "Non puoi verificare un tuo record."],
    ["errorAlreadyVerified", "You have already verified this record.", "Hai già verificato questo record."],
    // Destructive confirmations.
    ["removeVerificationConfirmTitle", "Remove your verification from this record?",
      "Rimuovere la tua verifica da questo record?"],
    ["cannotBeUndone", "This cannot be undone.", "Questa azione non può essere annullata."],
  ];

  const resolve = (bundle, dotted) =>
    dotted.split(".").reduce((acc, key) => acc[key], bundle);

  for (const [key, enValue, itValue] of golden) {
    assert.equal(resolve(en, key), enValue, `community.en.${key} must be the frozen EN string`);
    assert.equal(resolve(it, key), itValue, `community.it.${key} must be the frozen IT string`);
  }
});

// ---------------------------------------------------------------------------
// 2. Zero jargon
// ---------------------------------------------------------------------------

test("community bundle contains no gamification jargon (EN or IT)", async () => {
  const mod = await transpileAndImport(path.join(i18nDir, "community.ts"));
  const violations = [];
  for (const [locale, bundle] of [["en", mod.en], ["it", mod.it]]) {
    for (const value of collectStrings(bundle)) {
      for (const pattern of FORBIDDEN) {
        if (pattern.test(value)) {
          violations.push(`${locale}: "${value}" matches ${pattern}`);
        }
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `community bundle must be jargon-free (frozen table "Vietato"): ${violations.join(" | ")}`,
  );
});

// ---------------------------------------------------------------------------
// 3. Plural formatters: "1 verifica / 3 verifiche / 0 verifiche"
// ---------------------------------------------------------------------------

test("plural formatters produce the frozen Italian and English forms", async () => {
  const mod = await transpileAndImport(path.join(i18nDir, "community.ts"));
  const { en, it } = mod;

  // Italian: singular, plural, zero (COMMUNITY_PLAN §6.1).
  assert.equal(it.verificationCount(1), "1 verifica");
  assert.equal(it.verificationCount(3), "3 verifiche");
  assert.equal(it.verificationCount(0), "0 verifiche");
  assert.equal(en.verificationCount(1), "1 verification");
  assert.equal(en.verificationCount(3), "3 verifications");
  assert.equal(en.verificationCount(0), "0 verifications");

  assert.equal(it.contributionCount(1), "1 contributo");
  assert.equal(it.contributionCount(3), "3 contributi");
  assert.equal(it.recordHasVerifications(1), "Questo record ha 1 verifica");
  assert.equal(it.recordHasVerifications(3), "Questo record ha 3 verifiche");

  // Progress row: 1 live contribution / 3 live contributions.
  assert.equal(
    it.progressToNextLevel(1),
    "1 contributo attivo per raggiungere il prossimo livello di fiducia",
  );
  assert.equal(
    it.progressToNextLevel(3),
    "3 contributi attivi per raggiungere il prossimo livello di fiducia",
  );
  assert.equal(
    en.progressToNextLevel(1),
    "1 live contribution to reach the next trust level",
  );
  assert.equal(
    en.progressToNextLevel(3),
    "3 live contributions to reach the next trust level",
  );
});

// ---------------------------------------------------------------------------
// 4. Pre-existing IT fix: "contributore" → "contributor"
// ---------------------------------------------------------------------------

test("auth.ts IT registerTitle is natural Italian (copy finale, t_ee3adc33)", async () => {
  const auth = await transpileAndImport(path.join(i18nDir, "auth.ts"));
  assert.equal(auth.en.registerTitle, "Create a contributor account");
  assert.equal(auth.it.registerTitle, "Crea un account per contribuire");
});

test("no \"contributore\" is left in any Italian bundle (auth, moderazione, …)", async () => {
  const files = (await readdir(i18nDir))
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => name !== "index.ts" && name !== "types.ts");
  const leftovers = [];
  for (const name of files) {
    const src = await readFile(path.join(i18nDir, name), "utf8");
    const itPart = src.split("export const it: Translation<typeof en> = {")[1];
    if (itPart && itPart.includes("contributore")) {
      leftovers.push(name);
    }
  }
  assert.deepEqual(
    leftovers,
    [],
    "Italian bundles must use \"contributor\", never \"contributore\": " + leftovers.join(", "),
  );
});

// ---------------------------------------------------------------------------
// 5. Registered in both per-locale bundles (ADR 0007; F5 qa#5 split: the
//    assemblies moved from index.ts to bundles/{en,it}.ts so the dictionary
//    leaves the root chunk)
// ---------------------------------------------------------------------------

test("community bundle is registered in both per-locale bundles", async () => {
  const enSrc = await readFile(path.join(i18nDir, "bundles", "en.ts"), "utf8");
  const itSrc = await readFile(path.join(i18nDir, "bundles", "it.ts"), "utf8");
  assert.match(enSrc, /import \{ en as communityEn \} from "\.\.\/community"/,
    "bundles/en.ts must import the community EN bundle");
  assert.match(enSrc, /community: communityEn/,
    "the EN messages object must include the community namespace");
  assert.match(itSrc, /import \{ it as communityIt \} from "\.\.\/community"/,
    "bundles/it.ts must import the community IT bundle");
  assert.match(itSrc, /community: communityIt/,
    "the IT messages object must include the community namespace");
});
