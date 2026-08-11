/**
 * Component smoke tests — post-refactor structure (kanban t_14b1949c).
 *
 * Questa suite pina il CONTRATTO strutturale del refactor della home
 * (t_6104f386: app/page.tsx -> app/components/home/*) e del componente
 * condiviso (t_04ad3e41: app/components/InfoPage.tsx):
 *
 *   1. i componenti estratti esistono nei path previsti;
 *   2. ogni componente rispetta l'obiettivo ~150 righe (refactor goal);
 *   3. la home non e' piu' un monolite (page orchestrator sottile) e
 *      importa i componenti estratti (non li definisce inline);
 *   4. le pagine informative usano il layout condiviso InfoPage.
 *
 * Il refactor moderation (t_c7460073) segue lo stesso contratto:
 * ModerationDashboard.tsx resta un orchestratore sottile e importa i
 * componenti estratti da app/components/moderation/.
 *
 * La deviazione di ReportForm registrata in passato (hook useReportFlow
 * co-locato, 162 righe) è stata risolta in F1 (t_03c0fa15): l'hook è stato
 * estratto in app/lib/useReportFlow.ts (QA t_14b1949c), il componente
 * resta solo JSX e rientra nel target ~150. Nessuna deviazione attiva.
 *
 * F2 home hub (t_52dcb95e): la home è ora un hub di orientamento SSR-puro.
 * Importa il NUOVO set di componenti hub (Hero, MapTeaser, ToolCards,
 * HomeNav); i componenti tool della vecchia home (PublicDirectory,
 * ReportForm, CorrectionForm, MapPanel) vivono ora sulle route tool
 * (app/components/tools/*) e restano nel repo — il contratto di esistenza
 * e dimensione si applica a entrambi i set, ma solo il set hub è importato
 * da app/page.tsx.
 *
 * Stile: come rendered-html.test.mjs — guardie statiche su sorgente +
 * render reale via Miniflare. Non importa i componenti direttamente
 * (il bundle di produzione risolve cloudflare:workers solo nel runtime
 * Workers); verifica il contratto ai confini osservabili.
 */
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_COMPONENT_LINES = 150;

/** Conteggio righe coerente con `wc -l` (ignora la riga vuota da trailing newline). */
function countLines(source) {
  return source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
}

/** Componenti attesi dal refactor della home. */
const HOME_COMPONENTS = [
  { name: "Hero", file: "app/components/home/Hero.tsx" },
  { name: "PublicDirectory", file: "app/components/home/PublicDirectory.tsx" },
  { name: "ReportForm", file: "app/components/home/ReportForm.tsx" },
  { name: "CorrectionForm", file: "app/components/home/CorrectionForm.tsx" },
  { name: "MapPanel", file: "app/components/home/MapPanel.tsx" },
  // F2 home hub (t_52dcb95e): componenti nuovi dell'hub SSR-puro.
  { name: "MapTeaser", file: "app/components/home/MapTeaser.tsx" },
  { name: "ToolCards", file: "app/components/home/ToolCards.tsx" },
  { name: "HomeNav", file: "app/components/home/HomeNav.tsx" },
];

/**
 * Componenti che app/page.tsx DEVE importare (F2 home hub): l'hub è un
 * orienteering page che non ospita più i tool (mappa/directory/form vivono
 * sulle route tool e leggono i propri bundle). PublicDirectory/ReportForm/
 * CorrectionForm/MapPanel restano nel repo ma NON sono più importati dalla
 * home — il contratto di import riflette il nuovo hub.
 */
const HOME_IMPORTS = [
  { name: "Hero", base: "Hero" },
  { name: "ToolCards", base: "ToolCards" },
  { name: "HomeNav", base: "HomeNav" },
];

/**
 * Componenti che la home NON deve più importare (CEO 2026-08-07): il
 * MapTeaser statico è stato rimosso (ridondante accanto alla card /mappa
 * e all'hero CTA), i tool vivono sulle loro route.
 */
const HOME_ABSENT_IMPORTS = ["MapTeaser", "PublicDirectory", "ReportForm", "CorrectionForm", "MapPanel"];

/**
 * Componenti attesi dal refactor moderation (t_c7460073):
 * ModerationDashboard.tsx -> app/components/moderation/*. L'hook
 * useModerationQueue possiede stato/fetch/decide (pattern del refactor
 * home); le sezioni e le card sono presentazionali e ricevono l'API.
 */
const MODERATION_COMPONENTS = [
  { name: "QueueSection", file: "app/components/moderation/QueueSection.tsx" },
  { name: "DecisionForm", file: "app/components/moderation/DecisionForm.tsx" },
  { name: "CameraQueueItem", file: "app/components/moderation/CameraQueueItem.tsx" },
  { name: "CorrectionQueueItem", file: "app/components/moderation/CorrectionQueueItem.tsx" },
  { name: "HistorySection", file: "app/components/moderation/HistorySection.tsx" },
  { name: "useModerationQueue", file: "app/components/moderation/useModerationQueue.tsx" },
];

/**
 * Componenti attesi dal pannello API keys di /account (epic api-keys T18,
 * piano §3.2): la sezione tra passkeys e danger zone è un orchestratore
 * sottile che possiede lo stato (useApiKeys) e compone lista, dialog di
 * creazione (pill scope aria-pressed, MAI checkbox) e dialog reveal-once
 * (alertdialog, no Escape, copy once).
 */
const ACCOUNT_COMPONENTS = [
  { name: "ApiKeysSection", file: "app/account/ApiKeysSection.tsx" },
  { name: "ApiKeyList", file: "app/account/ApiKeyList.tsx" },
  { name: "ApiKeyRow", file: "app/account/ApiKeyRow.tsx" },
  { name: "ApiKeyCreateDialog", file: "app/components/ApiKeyCreateDialog.tsx" },
  { name: "ApiKeyRevealDialog", file: "app/components/ApiKeyRevealDialog.tsx" },
];

/**
 * Deviazioni note dal target ~150, con baseline pinnata: il file NON deve
 * crescere oltre il numero di righe registrato al momento del pin. Qualsiasi
 * nuovo file oltre il target NON registrato qui fa fallire il test.
 *
 * (Nessuna deviazione attiva da F1 — ReportForm è tornato sotto target dopo
 * l'estrazione di useReportFlow in app/lib/useReportFlow.ts.)
 *
 * Deviazione H1 (t_69891619): useModerationQueue cresce di ~19 righe per lo
 * stato di associazione correzione→esito record (campi outcome + record id,
 * validazione client, cleanup, getter/setter per DecisionFormApi). Stato e
 * accessor appartengono all'hook decisionale condiviso; l'estrazione in un
 * file separato non ridurrebbe la superficie. Baseline pinnata a 168 righe.
 * Deviazione H1 +2 (t_6424f961): il lookup data è ora registry-driven
 * (LOCALE_BCP47 da SUPPORTED_LOCALES, niente ternario it-IT/en-US):
 * un import dal registro + un commento — baseline aggiornata a 170 righe.
 *
 * Deviazione FASE C (t_4dbce318): MapPanel cresce di ~9 righe per il wiring
 * della provenienza import nel popup (fetch unico dei batch committed +
 * risoluzione slug→fonte condivisa + locale per la data di aggiunta). Il
 * blocco è semanticamente isolato (.osm-popup-provenance con data-* attrs)
 * e verrà sostituito dal redesign popup (t_b7728ad0): baseline 159 righe.
 *
 * Deviazione redesign popup + mappa mobile (t_b7728ad0): MapPanel raggiunge
 * 165 righe — il link "Report an issue" è stato RIMOSSO dal popup (le
 * azioni Problema/Privacy del disclosure la coprono) e la provenienza ora
 * passa come options (4° arg); +6 righe per lo stato pointsCollapsed
 * (matchMedia al mount) del pannello punti mobile map-first. Baseline
 * aggiornata a 165.
 *
 * Deviazione hydration (t_66766914, P0): MapPanel cresce a 188 righe — lo
 * stato pointsCollapsed è ora DETERMINISTICO (expanded) sia SSR sia primo
 * render client, e la preferenza mobile (matchMedia ≤768px) viene applicata
 * SOLO dopo hydration in un effect (+ guardia ref per non sovrascrivere una
 * scelta utente, + listener change per il resize). Il lazy initializer che
 * leggeva window.matchMedia causava il mismatch di hydration riportato dal
 * CEO (server is-open aria-expanded=true vs client collapsed). Baseline
 * aggiornata a 188.
 */
const KNOWN_DEVIATIONS = new Map([
  ["app/components/moderation/useModerationQueue.tsx", { baselineLines: 170, reason: "H1 t_69891619: campi associazione correzione→esito record (outcome + record id, validazione, cleanup) + commento contratto server/client aggiornato (fix PR #187); +2 t_6424f961: lookup data registry-driven LOCALE_BCP47 (no ternario it-IT/en-US)" }],
  ["app/components/home/MapPanel.tsx", { baselineLines: 188, reason: "t_b7728ad0: redesign popup (report-issue link rimosso, provenance via options) + stato pointsCollapsed pannello punti mobile map-first; t_66766914: stato DETERMINISTICO expanded SSR/client + preferenza mobile applicata solo post-hydration in effect (fix mismatch hydration CEO) — blocchi isolati" }],
  ["app/components/ApiKeyCreateDialog.tsx", { baselineLines: 182, reason: "t_7dce2869 F2: campo scadenza opzionale (select 30/90/365/mai + help i18n EN/IT) nel create dialog — scadenza chiave era invisibile in tutta la UI; blocchi isolati (label+select+small, stato expiry, expiryIso helper); +3 righe fix mobile dialog: import + chiamata shared useModalScrollLock(open), la logica resta estratta in app/lib/hooks" }],
]);

/** Componente condiviso atteso dal refactor. */
const INFO_PAGE_COMPONENT = { name: "InfoPage", file: "app/components/InfoPage.tsx" };

/** Pagine informative che devono usare il layout condiviso InfoPage. */
const INFO_PAGES = ["guide", "faq", "manifesto", "contatti", "regole"];

test("refactor: i componenti della home esistono nei path previsti", async () => {
  for (const { name, file } of HOME_COMPONENTS) {
    const full = path.join(root, file);
    await assert.doesNotReject(access(full), `atteso ${file} (componente ${name})`);
  }
});

test("refactor: il componente InfoPage condiviso esiste", async () => {
  await assert.doesNotReject(access(path.join(root, INFO_PAGE_COMPONENT.file)));
});

test("refactor: nessun componente della home supera il target ~150 (o la baseline registrata)", async () => {
  for (const { name, file } of HOME_COMPONENTS) {
    const source = await readFile(path.join(root, file), "utf8");
    const lines = countLines(source);
    const deviation = KNOWN_DEVIATIONS.get(file);
    if (deviation) {
      assert.ok(
        lines <= deviation.baselineLines,
        `${name} (${file}): ${lines} righe > baseline registrata ${deviation.baselineLines} — la deviazione e' cresciuta (${deviation.reason})`,
      );
      // La deviazione resta VISIBILE: log esplicito, non un pass silenzioso.
      console.log(`   [deviazione registrata] ${file}: ${lines} righe (> target ${MAX_COMPONENT_LINES}) — ${deviation.reason}`);
    } else {
      assert.ok(
        lines <= MAX_COMPONENT_LINES,
        `${name} (${file}): ${lines} righe > ${MAX_COMPONENT_LINES} (obiettivo refactor) — registrare in KNOWN_DEVIATIONS solo con baseline + motivo`,
      );
    }
  }
});

test("refactor: InfoPage non supera ~150 righe", async () => {
  const source = await readFile(path.join(root, INFO_PAGE_COMPONENT.file), "utf8");
  const lines = countLines(source);
  assert.ok(
    lines <= MAX_COMPONENT_LINES,
    `InfoPage (${INFO_PAGE_COMPONENT.file}): ${lines} righe > ${MAX_COMPONENT_LINES} (obiettivo refactor)`,
  );
});

test("refactor: la home non e' piu' un monolite (page orchestrator sottile)", async () => {
  const source = await readFile(path.join(root, "app", "page.tsx"), "utf8");
  const lines = countLines(source);
  assert.ok(
    lines <= MAX_COMPONENT_LINES,
    `app/page.tsx: ${lines} righe > ${MAX_COMPONENT_LINES} (deve restare un orchestratore sottile)`,
  );
});

test("refactor: la home importa i componenti estratti (non li definisce inline)", async () => {
  const source = await readFile(path.join(root, "app", "page.tsx"), "utf8");
  for (const { name, base } of HOME_IMPORTS) {
    assert.match(
      source,
      new RegExp(`from\\s+["'].*${base}["']`),
      `atteso import di ${name} in app/page.tsx`,
    );
  }
  // I componenti tool della vecchia home NON devono tornare nell'hub: la
  // home è un orienteering page, i tool vivono sulle loro route (F2); il
  // MapTeaser è stato rimosso (CEO 2026-08-07).
  for (const base of HOME_ABSENT_IMPORTS) {
    assert.doesNotMatch(
      source,
      new RegExp(`from\\s+["'].*${base}["']`),
      `l'hub non deve reimportare ${base} (vive sulle route tool)`,
    );
  }
});

test("refactor: le pagine informative usano il layout condiviso InfoPage", async () => {
  for (const page of INFO_PAGES) {
    const file = path.join(root, "app", page, "page.tsx");
    const source = await readFile(file, "utf8");
    assert.match(
      source,
      /from\s+["']\.\.\/components\/InfoPage["']/,
      `atteso import di InfoPage in app/${page}/page.tsx`,
    );
  }
});

test("refactor moderation: i componenti estratti esistono nei path previsti (t_c7460073)", async () => {
  for (const { name, file } of MODERATION_COMPONENTS) {
    const full = path.join(root, file);
    await assert.doesNotReject(access(full), `atteso ${file} (componente ${name})`);
  }
});

test("refactor moderation: nessun componente supera il target ~150 (o la baseline registrata)", async () => {
  for (const { name, file } of MODERATION_COMPONENTS) {
    const source = await readFile(path.join(root, file), "utf8");
    const lines = countLines(source);
    const deviation = KNOWN_DEVIATIONS.get(file);
    if (deviation) {
      assert.ok(
        lines <= deviation.baselineLines,
        `${name} (${file}): ${lines} righe > baseline registrata ${deviation.baselineLines} — la deviazione e' cresciuta (${deviation.reason})`,
      );
      console.log(`   [deviazione registrata] ${file}: ${lines} righe (> target ${MAX_COMPONENT_LINES}) — ${deviation.reason}`);
    } else {
      assert.ok(
        lines <= MAX_COMPONENT_LINES,
        `${name} (${file}): ${lines} righe > ${MAX_COMPONENT_LINES} (obiettivo refactor) — registrare in KNOWN_DEVIATIONS solo con baseline + motivo`,
      );
    }
  }
});

test("refactor moderation: la dashboard non e' piu' un monolite (orchestratore sottile)", async () => {
  const source = await readFile(path.join(root, "app", "components", "ModerationDashboard.tsx"), "utf8");
  const lines = countLines(source);
  assert.ok(
    lines <= MAX_COMPONENT_LINES,
    `ModerationDashboard.tsx: ${lines} righe > ${MAX_COMPONENT_LINES} (deve restare un orchestratore sottile)`,
  );
});

test("refactor moderation: la dashboard importa i componenti estratti (non li definisce inline)", async () => {
  const source = await readFile(path.join(root, "app", "components", "ModerationDashboard.tsx"), "utf8");
  // Componenti composti direttamente dalla dashboard.
  for (const { name, file } of MODERATION_COMPONENTS.filter((c) => c.name !== "DecisionForm")) {
    const base = path.basename(file, path.extname(file));
    assert.match(
      source,
      new RegExp(`from\\s+["'].*${base}["']`),
      `atteso import di ${name} in ModerationDashboard.tsx`,
    );
  }
});

test("refactor moderation: DecisionForm e' importato dalle card che lo usano", async () => {
  for (const file of ["app/components/moderation/CameraQueueItem.tsx", "app/components/moderation/CorrectionQueueItem.tsx"]) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.match(
      source,
      /from\s+["'].*DecisionForm["']/,
      `atteso import di DecisionForm in ${file}`,
    );
  }
});

test("refactor account api-keys: i componenti del pannello esistono nei path previsti (T18)", async () => {
  for (const { name, file } of ACCOUNT_COMPONENTS) {
    const full = path.join(root, file);
    await assert.doesNotReject(access(full), `atteso ${file} (componente ${name})`);
  }
});

test("refactor account api-keys: nessun componente supera il target ~150 (T18)", async () => {
  for (const { name, file } of ACCOUNT_COMPONENTS) {
    const source = await readFile(path.join(root, file), "utf8");
    const lines = countLines(source);
    const deviation = KNOWN_DEVIATIONS.get(file);
    if (deviation) {
      assert.ok(
        lines <= deviation.baselineLines,
        `${name} (${file}): ${lines} righe > baseline registrata ${deviation.baselineLines} — la deviazione e' cresciuta (${deviation.reason})`,
      );
      console.log(`   [deviazione registrata] ${file}: ${lines} righe (> target ${MAX_COMPONENT_LINES}) — ${deviation.reason}`);
    } else {
      assert.ok(
        lines <= MAX_COMPONENT_LINES,
        `${name} (${file}): ${lines} righe > ${MAX_COMPONENT_LINES} (obiettivo refactor) — registrare in KNOWN_DEVIATIONS solo con baseline + motivo`,
      );
    }
  }
});

test("refactor account api-keys: la sezione e' un orchestratore sottile che compone i dialog (T18)", async () => {
  const source = await readFile(path.join(root, "app", "account", "ApiKeysSection.tsx"), "utf8");
  // La sezione possiede lo stato (useApiKeys) e compone i dialog, non li
  // definisce inline: import attesi verso lista + dialog.
  for (const base of ["ApiKeyList", "ApiKeyCreateDialog", "ApiKeyRevealDialog", "ConfirmDialog"]) {
    assert.match(
      source,
      new RegExp(`from\\s+["'].*${base}["']`),
      `atteso import di ${base} in ApiKeysSection.tsx`,
    );
  }
  // Il dialog di creazione usa pill scope native con aria-pressed: MAI
  // checkbox (WCAG 2.5.8 issue #413 precedent).
  const createDialog = await readFile(path.join(root, "app", "components", "ApiKeyCreateDialog.tsx"), "utf8");
  assert.doesNotMatch(createDialog, /<input[^>]*type=["']checkbox["']/, "scope pill buttons, never checkboxes");
  assert.match(createDialog, /aria-pressed=/, "scope pills carry aria-pressed");
});
