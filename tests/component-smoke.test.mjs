/**
 * Component smoke tests — post-refactor structure (kanban t_14b1949c).
 *
 * Questa suite pina il CONTRATTO strutturale del refactor di Ada
 * (t_6104f386: app/page.tsx -> app/components/home/*) e di Linus
 * (t_04ad3e41: app/components/InfoPage.tsx condiviso):
 *
 *   1. i componenti estratti esistono nei path previsti;
 *   2. ogni componente rispetta l'obiettivo ~150 righe (refactor goal);
 *   3. la home non e' piu' un monolite (page orchestrator sottile) e
 *      importa i componenti estratti (non li definisce inline);
 *   4. le pagine informative usano il layout condiviso InfoPage.
 *
 * Il refactor moderation (t_c7460073, Ada) segue lo stesso contratto:
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

/** Componenti attesi dal refactor di Ada (home). */
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
  { name: "MapTeaser", base: "MapTeaser" },
  { name: "ToolCards", base: "ToolCards" },
  { name: "HomeNav", base: "HomeNav" },
];

/**
 * Componenti attesi dal refactor moderation di Ada (t_c7460073):
 * ModerationDashboard.tsx -> app/components/moderation/*. L'hook
 * useModerationQueue possiede stato/fetch/decide (pattern del refactor
 * home); le sezioni e le card sono presentazionali e ricevono l'API.
 */
const MODERATION_COMPONENTS = [
  { name: "QueueSection", file: "app/components/moderation/QueueSection.tsx" },
  { name: "DecisionForm", file: "app/components/moderation/DecisionForm.tsx" },
  { name: "CameraQueueItem", file: "app/components/moderation/CameraQueueItem.tsx" },
  { name: "CorrectionQueueItem", file: "app/components/moderation/CorrectionQueueItem.tsx" },
  { name: "PhotoQueueItem", file: "app/components/moderation/PhotoQueueItem.tsx" },
  { name: "HistorySection", file: "app/components/moderation/HistorySection.tsx" },
  { name: "useModerationQueue", file: "app/components/moderation/useModerationQueue.tsx" },
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
 */
const KNOWN_DEVIATIONS = new Map([
  ["app/components/moderation/useModerationQueue.tsx", { baselineLines: 170, reason: "H1 t_69891619: campi associazione correzione→esito record (outcome + record id, validazione, cleanup) + commento contratto server/client aggiornato (fix PR #187); +2 t_6424f961: lookup data registry-driven LOCALE_BCP47 (no ternario it-IT/en-US)" }],
]);

/** Componente condiviso atteso dal refactor di Linus. */
const INFO_PAGE_COMPONENT = { name: "InfoPage", file: "app/components/InfoPage.tsx" };

/** Pagine informative che devono usare il layout condiviso InfoPage. */
const INFO_PAGES = ["guide", "faq", "manifesto", "contatti", "regole", "moderazione"];

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
  // home è un orienteering page, i tool vivono sulle loro route (F2).
  for (const base of ["PublicDirectory", "ReportForm", "CorrectionForm", "MapPanel"]) {
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
  for (const file of ["app/components/moderation/CameraQueueItem.tsx", "app/components/moderation/CorrectionQueueItem.tsx", "app/components/moderation/PhotoQueueItem.tsx"]) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.match(
      source,
      /from\s+["'].*DecisionForm["']/,
      `atteso import di DecisionForm in ${file}`,
    );
  }
});
