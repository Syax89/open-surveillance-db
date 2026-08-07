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
  eyebrow: "Data · Method and sources",
  title: "Methodology and data sources",
  intro:
    "We document visible public surveillance infrastructure with community observations and openly licensed public datasets. Here is how the data is collected, checked and attributed.",
  methodologyTitle: "How the database works",
  methodologyIntro: "The database is a public record of what can be observed in public space. It is not a live monitoring system and never contains camera feeds.",
  scopeTitle: "Scope",
  scopeBody: "We record visible equipment in public space and the details needed to identify it: location, type, direction where known and source.",
  collectionTitle: "Collection",
  collectionBody: "Records come from community observations and from compatible public datasets. Imported data retains its original source, licence and attribution.",
  correctionTitle: "Verification and correction",
  correctionBody: "People can confirm that a record is still present, report an issue or request a correction. Corrections are reviewed before they change public data.",
  limitsTitle: "Limits",
  limitsBody: "An empty area does not prove that no cameras are present. A record describes the best information available at the time, and public coordinates are rounded to protect context.",
  sourcesTitle: "Imported data sources",
  sourcesIntro: "Each imported dataset is listed below with its original publisher, licence, import date, record count and required attribution.",
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
  eyebrow: "Dati · Metodo e fonti",
  title: "Metodologia e fonti dei dati",
  intro:
    "Documentiamo infrastrutture di sorveglianza pubblica visibili attraverso osservazioni della comunità e dataset pubblici con licenza aperta. Qui spieghiamo come i dati vengono raccolti, verificati e attribuiti.",
  methodologyTitle: "Come funziona il database",
  methodologyIntro: "Il database è un registro pubblico di ciò che può essere osservato nello spazio pubblico. Non è un sistema di monitoraggio in tempo reale e non contiene mai feed video.",
  scopeTitle: "Ambito",
  scopeBody: "Registriamo apparecchiature visibili nello spazio pubblico e i dettagli utili per identificarle: posizione, tipo, direzione quando nota e fonte.",
  collectionTitle: "Raccolta",
  collectionBody: "I record provengono da osservazioni della comunità e da dataset pubblici compatibili. I dati importati mantengono fonte, licenza e attribuzione originali.",
  correctionTitle: "Verifica e correzione",
  correctionBody: "Le persone possono confermare che un record è ancora presente, segnalare un problema o richiedere una correzione. Le correzioni vengono esaminate prima di modificare i dati pubblici.",
  limitsTitle: "Limiti",
  limitsBody: "Un'area vuota non dimostra l'assenza di telecamere. Un record descrive le migliori informazioni disponibili in quel momento e le coordinate pubbliche sono arrotondate per proteggere il contesto.",
  sourcesTitle: "Fonti dei dati importati",
  sourcesIntro: "Ogni dataset importato è elencato qui sotto con il suo editore originale, licenza, data di importazione, numero di record e attribuzione richiesta.",
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
