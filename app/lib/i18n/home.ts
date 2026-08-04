/**
 * home — interface strings for the home page (hub) only.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 *
 * F2 home hub (t_52dcb95e): the home is now an orienteering hub, not a
 * tool. The four tool sections (map, directory, report, correction) live on
 * their own routes and read their own bundles (`map`, `directory`, `report`,
 * `correction`). This file keeps only what the hub renders: nav labels,
 * hero (CTA → /mappa and /segnala), the static MapTeaser, the four tool
 * cards and the shortened principles block (link → /manifesto).
 */
import type { Translation } from "./types";

export const en = {
  mainNavigation: "Main navigation",
  homeAria: "OpenSurveillanceDB home",
  // QA#2 F1 (axe serious): the scrollable legal tables (/privacy data
  // table) become a focusable region when they overflow — the aria-label
  // tells keyboard users why the region is in the tab order and how to
  // scroll it.
  tableScrollAria: "Table — scroll horizontally for more columns",
  menu: "Menu",
  exploreMap: "Explore map",
  browseRecords: "Browse records",
  howItWorks: "How it works",
  rules: "Rules",
  manifesto: "Manifesto",
  addCamera: "Add a camera",
  openDatabase: "Open database · community-maintained",
  heroTitle: "Public data about public surveillance.",
  heroIntro:
    "OpenSurveillanceDB maps visible surveillance infrastructure in public space. The data is open and community-built: people contribute what they observe, so everyone can understand the systems around them.",
  exploreTheMap: "Explore the map",
  reportCta: "Report a camera",
  statsLabel: "Database statistics",
  publicRecords: "public records",
  accountsRequired: "accounts needed to browse",
  openSourceLabel: "open source",
  visualLabelFirst: "Mapping public space",
  visualLabelSecond: "with public knowledge",
  // MapTeaser (static preview, CTA → /mappa). Zero Leaflet on the hub.
  teaserEyebrow: "The map",
  teaserTitle: "Explore the interactive map",
  teaserBody: "Browse the full-screen map, with filters, exports and a keyboard-accessible directory.",
  teaserCta: "Open the map",
  // Four tool cards (grid 2×2 desktop / 1×4 mobile).
  toolsTitle: "What you can do",
  toolMapTitle: "Map",
  toolMapBody: "See every documented camera at a glance.",
  toolDirectoryTitle: "Directory",
  toolDirectoryBody: "Browse public records without the map.",
  toolReportTitle: "Report a camera",
  toolReportBody: "Submit a new camera for moderation.",
  toolCorrectionTitle: "Correct a record",
  toolCorrectionBody: "Fix or update a published record.",
  civicCommons: "A civic data commons",
  principlesTitle: "Visibility without surveillance.",
  principlesIntro:
    "We document public infrastructure, never camera feeds. Each published record has a source, a status and a way to be corrected.",
  openDefault: "Open by default",
  openDefaultBody:
    "Downloadable data with visible provenance for journalism, research and civic use.",
  privacyFirst: "Privacy first",
  privacyFirstBody:
    "Faces, licence plates and personal information must be removed before publication.",
  moderatedReports: "Moderated reports",
  moderatedReportsBody:
    "New records wait for human review. A report is not made public just because it was submitted.",
  manifestoLink: "Read the manifesto",
} as const;

export const it: Translation<typeof en> = {
  mainNavigation: "Navigazione principale",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  tableScrollAria: "Tabella — scorri in orizzontale per vedere le altre colonne",
  menu: "Menu",
  exploreMap: "Esplora la mappa",
  browseRecords: "Sfoglia i record",
  howItWorks: "Come funziona",
  rules: "Regole",
  manifesto: "Manifesto",
  addCamera: "Aggiungi una telecamera",
  openDatabase: "Database aperto · mantenuto dalla comunità",
  heroTitle: "Dati pubblici sulla sorveglianza pubblica.",
  heroIntro:
    "OpenSurveillanceDB mappa le infrastrutture di sorveglianza visibili nello spazio pubblico. I dati sono aperti e costruiti dalla comunità: le persone contribuiscono con ciò che osservano, così tutti possono capire i sistemi che li circondano.",
  exploreTheMap: "Esplora la mappa",
  reportCta: "Segnala una telecamera",
  statsLabel: "Statistiche del database",
  publicRecords: "record pubblici",
  accountsRequired: "account necessari per navigare",
  openSourceLabel: "open source",
  visualLabelFirst: "Mappare lo spazio pubblico",
  visualLabelSecond: "con conoscenza pubblica",
  // MapTeaser (anteprima statica, CTA → /mappa). Zero Leaflet sull'hub.
  teaserEyebrow: "La mappa",
  teaserTitle: "Esplora la mappa interattiva",
  teaserBody: "Sfoglia la mappa a tutto schermo, con filtri, esportazioni e un elenco accessibile da tastiera.",
  teaserCta: "Apri la mappa",
  // Quattro card strumento (griglia 2×2 desktop / 1×4 mobile).
  toolsTitle: "Cosa puoi fare",
  toolMapTitle: "Mappa",
  toolMapBody: "Vedi a colpo d'occhio ogni telecamera documentata.",
  toolDirectoryTitle: "Elenco",
  toolDirectoryBody: "Sfoglia i record pubblici senza usare la mappa.",
  toolReportTitle: "Segnala una telecamera",
  toolReportBody: "Invia una nuova telecamera alla moderazione.",
  toolCorrectionTitle: "Correggi un record",
  toolCorrectionBody: "Correggi o aggiorna un record pubblicato.",
  civicCommons: "Un bene comune di dati civici",
  principlesTitle: "Visibilità senza sorveglianza.",
  principlesIntro:
    "Documentiamo infrastrutture pubbliche, mai feed delle telecamere. Ogni record pubblicato ha una fonte, uno stato e un modo per correggerlo.",
  openDefault: "Aperto di default",
  openDefaultBody:
    "Dati scaricabili con provenienza visibile per giornalismo, ricerca e uso civico.",
  privacyFirst: "La privacy prima di tutto",
  privacyFirstBody:
    "Volti, targhe e informazioni personali devono essere rimossi prima della pubblicazione.",
  moderatedReports: "Segnalazioni moderate",
  moderatedReportsBody:
    "I nuovi record attendono la revisione umana. Una segnalazione non diventa pubblica solo perché è stata inviata.",
  manifestoLink: "Leggi il manifesto",
};
