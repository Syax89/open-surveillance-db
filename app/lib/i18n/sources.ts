/**
 * sources — /fonti (data sources page) interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 *
 * The page lists the publicly imported datasets (import_batches rows with
 * status 'committed'). It is deliberately NOT in the main navigation: the
 * CEO route decision (2026-08-05, kanban t_4dbce318) keeps it linked from
 * the footer, next to Licences.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Site navigation",
  homeAria: "OpenSurveillanceDB home",
  eyebrow: "Data · Sources",
  title: "Data sources",
  intro:
    "The public records may include datasets released by public administrations and open-data projects. Every imported dataset keeps its own licence and attribution; this page lists them all.",
  // Table / card labels (per-source attribution contract, licence matrix
  // docs/data-sources/licenze-compatibilita.md).
  sourceColumn: "Source",
  licenseColumn: "Licence",
  importedOnColumn: "Imported on",
  recordsColumn: "Records",
  attributionColumn: "Attribution",
  recordsCount: (count: number) => `${count.toLocaleString()} ${count === 1 ? "record" : "records"}`,
  openSource: "Open the source dataset (new window)",
  openLicense: "Open the licence text (new window)",
  // Honest empty state: no committed import batch yet — the page exists and
  // explains itself without inventing sources.
  emptyTitle: "No imported datasets yet",
  emptyBody:
    "No public dataset has been imported so far. Community reports are always published individually and never need this page. When the first import lands, every source will be listed here with its licence and attribution.",
  versionNote: "Updated 5 August 2026 (import pipeline). The import descriptors in the repository (docs/data-sources/imports/) remain canonical.",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione del sito",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  eyebrow: "Dati · Fonti",
  title: "Fonti dei dati",
  intro:
    "I record pubblici possono includere dataset rilasciati da amministrazioni pubbliche e progetti open data. Ogni dataset importato mantiene la propria licenza e la propria attribuzione; questa pagina li elenca tutti.",
  sourceColumn: "Fonte",
  licenseColumn: "Licenza",
  importedOnColumn: "Importato il",
  recordsColumn: "Record",
  attributionColumn: "Attribuzione",
  recordsCount: (count: number) => `${count.toLocaleString("it-IT")} record`,
  openSource: "Apri il dataset della fonte (nuova finestra)",
  openLicense: "Apri il testo della licenza (nuova finestra)",
  emptyTitle: "Nessun dataset importato ancora",
  emptyBody:
    "Finora nessun dataset pubblico è stato importato. Le segnalazioni della community vengono sempre pubblicate singolarmente e non richiedono questa pagina. Quando arriverà il primo import, ogni fonte sarà elencata qui con la sua licenza e la sua attribuzione.",
  versionNote: "Aggiornato il 5 agosto 2026 (pipeline di import). I descriptor di import nel repository (docs/data-sources/imports/) restano la versione canonica.",
};
