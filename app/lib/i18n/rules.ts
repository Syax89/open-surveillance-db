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
    "These rules explain what OpenSurveillanceDB documents, what contributors may report, how moderation works, how to correct a record, and how the data can be reused.",
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
    "Reports containing any of the following are screened out and are never published.",
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
    "Detailed field-of-view or operational capability that could create a safety risk, or sensitive locations where publication could increase risk.",
  beforeSubmittingTitle: "Before submitting",
  beforeSubmittingBody:
    "Submitting requires a verified contributor account. Do not upload or describe people, licence plates, private homes, security weaknesses or sensitive locations. Submissions are private until a moderator reviews them; they are not published automatically.",
  moderationEyebrow: "Moderation",
  moderationTitle: "Every record is reviewed by a person.",
  moderationBody:
    "Reports are deliberately separated from published records. The public map and exports are not an automatic mirror of submissions.",
  flowLabel: "Review flow",
  flowOneTitle: "Receive",
  flowOneBody:
    "A private pending record is created and acknowledged without promising publication.",
  flowTwoTitle: "Screen",
  flowTwoBody:
    "Spam, personal data, prohibited content and dangerous details are removed.",
  flowThreeTitle: "Verify",
  flowThreeBody:
    "A moderator assesses whether the camera is public, visible, current and within local policy.",
  flowFourTitle: "Minimise",
  flowFourBody:
    "The least specific location and metadata that still serves transparency are published. Exact coordinates stay in the private moderation record; published coordinates are rounded to about 10 metres.",
  flowFiveTitle: "Decide",
  flowFiveBody:
    "Approve, request clarification, reject, or escalate — always recording a reason.",
  flowSixTitle: "Maintain",
  flowSixBody:
    "Records are re-checked periodically and respond to corrections or removal requests.",
  correctionEyebrow: "Corrections and appeals",
  correctionTitle: "A simple way to challenge a record.",
  correctionBody:
    "Any verified contributor can request a correction, challenge a record, or report harm. Requests are private, reviewed by humans, and never change the map automatically.",
  correctionOneTitle: "Request a correction",
  correctionOneBody:
    "Inaccurate, outdated or duplicate records can be flagged for review.",
  correctionTwoTitle: "Report a privacy or safety concern",
  correctionTwoBody:
    "Urgent reports are temporarily hidden from the public outputs while they are reviewed.",
  correctionThreeTitle: "No personal data needed",
  correctionThreeBody:
    "Describe only the minimum needed to identify the problem. Do not include personal data, live-feed links, credentials, or images.",
  dataEyebrow: "Data reuse",
  dataTitle: "Open where it is safe to be open.",
  dataBody:
    "Published records are available as GeoJSON and CSV for reuse and inspection. The public dataset contains only records that passed review; submissions and corrections are excluded.",
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
    "Queste regole spiegano cosa documenta OpenSurveillanceDB, cosa possono segnalare i contributori, come funziona la moderazione, come correggere un record e come riutilizzare i dati.",
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
    "Le segnalazioni che contengono uno dei seguenti elementi vengono filtrate e non vengono mai pubblicate.",
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
    "Dettagli sul campo visivo o sulle capacità operative che potrebbero creare un rischio per la sicurezza, o località sensibili la cui pubblicazione potrebbe aumentare il rischio.",
  beforeSubmittingTitle: "Prima di inviare",
  beforeSubmittingBody:
    "Per inviare serve un account di contributore verificato. Non caricare né descrivere persone, targhe, abitazioni private, debolezze di sicurezza o località sensibili. Gli invii restano privati finché un moderatore non li esamina; non vengono pubblicati automaticamente.",
  moderationEyebrow: "Moderazione",
  moderationTitle: "Ogni record viene esaminato da una persona.",
  moderationBody:
    "Le segnalazioni sono intenzionalmente separate dai record pubblicati. Mappa ed esportazioni non sono una copia automatica degli invii.",
  flowLabel: "Flusso di revisione",
  flowOneTitle: "Ricezione",
  flowOneBody:
    "Viene creato un record privato in attesa e l’invio è riconosciuto senza promettere la pubblicazione.",
  flowTwoTitle: "Filtro",
  flowTwoBody:
    "Spam, dati personali, contenuti vietati e dettagli pericolosi vengono rimossi.",
  flowThreeTitle: "Verifica",
  flowThreeBody:
    "Un moderatore valuta se la telecamera è pubblica, visibile, attuale e conforme alla policy locale.",
  flowFourTitle: "Minimizzazione",
  flowFourBody:
    "Viene pubblicata la posizione e la quantità minima di metadati necessaria alla trasparenza. Le coordinate esatte restano nel record privato di moderazione; quelle pubblicate sono arrotondate a circa 10 metri.",
  flowFiveTitle: "Decisione",
  flowFiveBody:
    "Approvare, chiedere chiarimenti, respingere o inoltrare — registrando sempre una motivazione.",
  flowSixTitle: "Manutenzione",
  flowSixBody:
    "I record vengono ricontrollati periodicamente e rispondono a correzioni o richieste di rimozione.",
  correctionEyebrow: "Correzioni e ricorsi",
  correctionTitle: "Un modo semplice per contestare un record.",
  correctionBody:
    "Ogni contributore verificato può richiedere una correzione, contestare un record o segnalare un danno. Le richieste sono private, esaminate da persone e non modificano mai la mappa automaticamente.",
  correctionOneTitle: "Richiedi una correzione",
  correctionOneBody:
    "I record inaccurati, obsoleti o duplicati possono essere segnalati per la revisione.",
  correctionTwoTitle: "Segnala un problema di privacy o sicurezza",
  correctionTwoBody:
    "Le segnalazioni urgenti vengono temporaneamente nascoste dagli output pubblici durante la revisione.",
  correctionThreeTitle: "Nessun dato personale richiesto",
  correctionThreeBody:
    "Descrivi solo il minimo necessario a identificare il problema. Non includere dati personali, link a feed live, credenziali o immagini.",
  dataEyebrow: "Riuso dei dati",
  dataTitle: "Aperti dove è sicuro esserlo.",
  dataBody:
    "I record pubblicati sono disponibili in GeoJSON e CSV per riuso e verifica. Il dataset pubblico contiene solo record che hanno superato la revisione; segnalazioni e correzioni sono escluse.",
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
    "Lo sfondo della mappa proviene dai contributori di OpenStreetMap ed è separato dai record sulle telecamere del progetto.",
  footer: "Creato per la trasparenza, non per il tracciamento.",
};
