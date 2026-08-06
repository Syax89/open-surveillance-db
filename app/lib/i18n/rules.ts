/**
 * rules — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Rules navigation",
  homeAria: "OpenSurveillanceDB home",
  map: "Map",
  directory: "Directory",
  guide: "Guide",
  home: "Home",
  eyebrow: "Participation rules",
  title: "What we publish, and how you can help.",
  intro:
    "These rules explain what OpenSurveillanceDB documents and what contributors may report. They cover publication, community actions, corrections and data reuse.",
  reportEyebrow: "What you can report",
  reportTitle: "Public space, observed from public space.",
  reportBody:
    "Only visible surveillance infrastructure in shared spaces can be documented. A record is publishable when it has a clear civic-transparency purpose and contains no unnecessary personal data.",
  eligibleOneTitle: "Public street infrastructure",
  eligibleOneBody:
    "A camera visibly mounted in a public street, square, station exterior, or public building exterior.",
  eligibleTwoTitle: "Publicly documented traffic cameras",
  eligibleTwoBody:
    "A traffic-monitoring camera that is publicly documented, where publishing the record is lawful and safe.",
  eligibleThreeTitle: "Official public sources",
  eligibleThreeBody:
    "A record from an official public source, marked with its source and verification date.",
  neverTitle: "Never report",
  neverBody:
    "Reports containing any of the following are never kept in the public dataset.",
  neverOneTitle: "Private homes",
  neverOneBody:
    "Residential or private cameras, including doorbells and cameras facing a private home.",
  neverTwoTitle: "People and personal data",
  neverTwoBody:
    "Identifiable people, vehicle licence plates, or private interiors.",
  neverThreeTitle: "Live feeds and access",
  neverThreeBody:
    "Live video, stream URLs, credentials, network information, or control interfaces.",
  neverFourTitle: "Sensitive details",
  neverFourBody:
    "Detailed field-of-view or operational capability that could create a safety risk, or sensitive locations where publication could be unsafe.",
  beforeSubmittingTitle: "Before submitting",
  beforeSubmittingBody:
    "Submitting requires a verified contributor account. Do not upload or describe people, licence plates, private homes, security weaknesses or sensitive locations. Your report is published immediately, so make sure it is safe to be public.",
  correctionEyebrow: "Corrections",
  correctionTitle: "A private way to challenge a record.",
  correctionBody:
    "Any verified contributor can request a correction, challenge a record, or report harm. Requests are private, reviewed by a person, and never change the map automatically.",
  correctionOneTitle: "Request a correction",
  correctionOneBody:
    "Inaccurate, outdated or duplicate records can be flagged for review.",
  correctionTwoTitle: "Report a privacy or safety concern",
  correctionTwoBody:
    "A privacy concern hides a record immediately, pending community verification. Legal emergencies use the same immediate path.",
  correctionThreeTitle: "No personal data needed",
  correctionThreeBody:
    "Describe only the minimum needed to identify the problem. Do not include personal data, live-feed links, credentials, or images.",
  dataEyebrow: "Data reuse",
  dataTitle: "Open where it is safe to be open.",
  dataBody:
    "Published records are available as GeoJSON and CSV for reuse and inspection. The public dataset contains the live records; private correction requests are never included.",
  downloadGeoJson: "Download public GeoJSON",
  downloadCsv: "Download public CSV",
  reuseOneTitle: "Licensing and provenance",
  reuseOneBody:
    "Every published record keeps its source and verification date, and the data is licensed for open reuse.",
  reuseTwoTitle: "No operational detail",
  reuseTwoBody:
    "Exports are intended for civic analysis, research and compatible mapping tools — not for finding camera feeds or sensitive operational information.",
  reuseThreeTitle: "Attribution to OpenStreetMap",
  reuseThreeBody:
    "The map background is provided by OpenStreetMap contributors and is separate from this project's camera records.",
  footer: "Built for transparency, not tracking.",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione delle regole",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  map: "Mappa",
  directory: "Elenco",
  guide: "Guida",
  home: "Home",
  eyebrow: "Regole di partecipazione",
  title: "Cosa pubblichiamo e come puoi aiutare.",
  intro:
    "Queste regole spiegano cosa documenta OpenSurveillanceDB e cosa si può segnalare. Coprono la pubblicazione, le azioni della community, le correzioni e il riuso dei dati.",
  reportEyebrow: "Cosa puoi segnalare",
  reportTitle: "Spazio pubblico, osservato dallo spazio pubblico.",
  reportBody:
    "Si può documentare solo l’infrastruttura di sorveglianza visibile negli spazi condivisi. Un record è pubblicabile quando ha un chiaro scopo di trasparenza civica e non contiene dati personali non necessari.",
  eligibleOneTitle: "Infrastruttura su strada pubblica",
  eligibleOneBody:
    "Una telecamera visibilmente montata in una strada, piazza, esterno di stazione o esterno di edificio pubblico.",
  eligibleTwoTitle: "Telecamere del traffico documentate pubblicamente",
  eligibleTwoBody:
    "Una telecamera di monitoraggio del traffico documentata pubblicamente, quando pubblicare il record è lecito e sicuro.",
  eligibleThreeTitle: "Fonti pubbliche ufficiali",
  eligibleThreeBody:
    "Un record proveniente da una fonte pubblica ufficiale, marcato con la sua fonte e la data di verifica.",
  neverTitle: "Da non segnalare mai",
  neverBody:
    "Le segnalazioni che contengono uno dei seguenti elementi non vengono mai mantenute nel dataset pubblico.",
  neverOneTitle: "Abitazioni private",
  neverOneBody:
    "Telecamere residenziali o private, inclusi videocitofoni e telecamere rivolte verso un’abitazione privata.",
  neverTwoTitle: "Persone e dati personali",
  neverTwoBody:
    "Persone identificabili, targhe di veicoli o interni privati.",
  neverThreeTitle: "Feed live e accessi",
  neverThreeBody:
    "Video in diretta, URL di streaming, credenziali, informazioni di rete o interfacce di controllo.",
  neverFourTitle: "Dettagli sensibili",
  neverFourBody:
    "Dettagli sul campo visivo o sulle capacità operative che potrebbero creare un rischio per la sicurezza, o località sensibili la cui pubblicazione potrebbe essere pericolosa.",
  beforeSubmittingTitle: "Prima di inviare",
  beforeSubmittingBody:
    "Per inviare serve un account verificato. Non caricare né descrivere persone, targhe, abitazioni private, debolezze di sicurezza o luoghi sensibili. La tua segnalazione viene pubblicata subito: assicurati che sia sicuro renderla pubblica.",
  correctionEyebrow: "Correzioni",
  correctionTitle: "Un modo privato per contestare un record.",
  correctionBody:
    "Ogni account verificato può richiedere una correzione, contestare un record o segnalare un danno. Le richieste sono private, esaminate da una persona e non modificano mai la mappa automaticamente.",
  correctionOneTitle: "Richiedi una correzione",
  correctionOneBody:
    "I record inaccurati, obsoleti o duplicati possono essere segnalati per la revisione.",
  correctionTwoTitle: "Segnala un problema di privacy o sicurezza",
  correctionTwoBody:
    "Un problema di privacy nasconde un record subito, in attesa di verifica della community. Le emergenze legali usano lo stesso percorso immediato.",
  correctionThreeTitle: "Nessun dato personale richiesto",
  correctionThreeBody:
    "Descrivi solo il minimo necessario a identificare il problema. Non includere dati personali, link a feed live, credenziali o immagini.",
  dataEyebrow: "Riuso dei dati",
  dataTitle: "Aperti dove è sicuro esserlo.",
  dataBody:
    "I record pubblicati sono disponibili in GeoJSON e CSV per riuso e verifica. Il dataset pubblico contiene i record attivi; le richieste private di correzione non sono mai incluse.",
  downloadGeoJson: "Scarica il GeoJSON pubblico",
  downloadCsv: "Scarica il CSV pubblico",
  reuseOneTitle: "Licenza e provenienza",
  reuseOneBody:
    "Ogni record pubblicato conserva la sua fonte e la data di verifica, e i dati sono concessi in licenza per il riuso aperto.",
  reuseTwoTitle: "Nessun dettaglio operativo",
  reuseTwoBody:
    "Le esportazioni sono pensate per analisi civica, ricerca e strumenti cartografici compatibili — non per trovare feed di telecamere o informazioni operative sensibili.",
  reuseThreeTitle: "Attribuzione a OpenStreetMap",
  reuseThreeBody:
    "Lo sfondo della mappa proviene dalla community di OpenStreetMap ed è separato dai record sulle telecamere del progetto.",
  footer: "Creato per la trasparenza, non per il tracciamento.",
};
