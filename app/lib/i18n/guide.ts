/**
 * guide — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Guide navigation",
  homeAria: "OpenSurveillanceDB home",
  map: "Map",
  directory: "Directory",
  home: "Home",
  manifesto: "Manifesto",
  eyebrow: "Project guide",
  title: "A public database, built with care.",
  intro:
    "This guide explains what OpenSurveillanceDB documents and how to use the map and the directory. It also shows how a report becomes public data, and what the database does not claim.",
  exploreMap: "Explore the map",
  browseDirectory: "Browse directory",
  overviewEyebrow: "Quick guide",
  overviewTitle: "Find what you need.",
  overviewPurpose: "What the database documents",
  overviewPublication: "How a report is published",
  overviewStatuses: "How to read record statuses",
  overviewAccount: "Accounts and contributions",
  overviewConfirmations: "Confirmations and trust",
  overviewData: "Open data and exports",
  missionEyebrow: "Purpose and boundaries",
  missionTitle: "Visibility without operational surveillance.",
  missionBody:
    "OpenSurveillanceDB helps people understand visible surveillance infrastructure in public space. It is a civic record of public-facing equipment, not a tool for watching, tracking or bypassing lawful surveillance.",
  missionOneTitle: "What we document",
  missionOneBody:
    "Visible camera infrastructure, approximate location, type, source and a community status.",
  missionTwoTitle: "What we do not collect",
  missionTwoBody:
    "Camera feeds, credentials, private-home details, operational weaknesses, faces, licence plates or other personal data.",
  missionThreeTitle: "What the map cannot prove",
  missionThreeBody:
    "An absent record does not show that an area is free of surveillance. It only shows that no record is currently published there.",
  cycleEyebrow: "A community process",
  cycleTitle: "From observation to public record.",
  cycleBody:
    "A report from a verified account becomes a public record right away. The community then keeps the directory accurate: what is still there gets confirmed, what is gone gets flagged, what is useful gets marked.",
  cycleRuleTitle: "Publication is immediate.",
  cycleRuleBody:
    "A report is published as soon as a verified contributor submits it. No queue, no waiting: accuracy is maintained by the community, not by a reviewer.",
  cycleStepsLabel: "Publication cycle",
  submitLabel: "Submit",
  submitTitle: "An observation is submitted",
  submitBody:
    "A contributor chooses an approximate public-space location and adds a short description. The report is published immediately.",
  moderateLabel: "Community",
  moderateTitle: "The community keeps it accurate",
  moderateBody:
    "People can confirm that a camera is still there, flag it as no longer present, mark it useful, or raise a problem. Every action needs a verified account; thresholds decide what changes.",
  publishLabel: "Maintain",
  publishTitle: "Records stay live until the community says otherwise",
  publishBody:
    "A record leaves the public list only after enough community flags — or a legal emergency — and every transition is recorded in the record's public history.",
  publicationDetailsEyebrow: "Publication in detail",
  publicationDetailsTitle: "The public publication model.",
  publicationDetailsSummary: "Read the detailed publication rules",
  statusEyebrow: "Reading the records",
  statusTitle: "Each status says what the record can support.",
  statusIntro:
    "A status describes the current state, not a guarantee that a camera is active, complete or permanently accurate.",
  verifiedTitle: "Published and live",
  verifiedBody:
    "The record is public: it appears in the map, directory and GeoJSON export. The community can act on it at any time.",
  reviewTitle: "Hidden",
  reviewBody:
    "The record was withdrawn pending community or legal verification. It is not listed, but its public history stays visible and confirmations can bring it back.",
  pendingTitle: "Reported as no longer present",
  pendingBody:
    "The community reported that this camera is no longer there. It is not listed, and the record can be restored if confirmations show it is back.",
  accountEyebrow: "Your account",
  accountTitle: "Why create an account?",
  accountBody:
    "Browsing the data requires no account. With an account you can submit reports, take part in community actions, follow your contributions and build a trust level.",
  accountWhyTitle: "What an account gives you",
  accountWhyBody:
    "Reports are linked to your account. You can edit your contributions, confirm records, flag problems and watch your trust level grow.",
  accountHowTitle: "How accounts work",
  accountHowBody:
    "You register with an email address and a password, stored as a hash and never exposed. Email verification is required before you can publish or take part in community actions. You can also add a passkey or a social sign-in to the same account.",
  accountAnonymousTitle: "Browsing stays open",
  accountAnonymousBody:
    "You can explore the map, the directory and the exports without an account. Submitting a report, sending a correction or taking part in community actions requires a verified contributor account.",
  editEyebrow: "Editing a contribution",
  editTitle: "You can edit your own contributions.",
  editBody:
    "Only the contributor who submitted a record can edit it. An update to an already public record becomes a private proposal: the published version stays visible until a moderator applies or discards it. For anything else, use the private correction form.",
  editOwnerTitle: "Owner only",
  editOwnerBody:
    "You can edit a record only if you submitted it. Other people's records cannot be edited directly; report what needs to change through the private correction form.",
  editRemoderationTitle: "Updates become proposals",
  editRemoderationBody:
    "When a record is already public, an edit never overwrites it: the change is saved as a private proposal, and a moderator applies or discards it. The current public version remains visible the whole time.",
  editNotImmediateTitle: "The proposal stays private",
  editNotImmediateBody:
    "Only the proposed change is private while it is reviewed. The published record keeps appearing in the map, the directory and the exports until the proposal is decided.",
  verifyEyebrow: "Confirmations",
  verifyTitle: "What confirmations mean.",
  verifyBody:
    "A confirmation is a personal check that a camera is still present at the documented location. It helps readers trust a record without revealing who confirmed it.",
  verifyWhatTitle: "A personal check",
  verifyWhatBody:
    "By confirming, you state from your own observation that the camera still exists where the record says it is.",
  verifyOneTitle: "One per user",
  verifyOneBody:
    "Each account can keep one community action per record. It is a check, not a popularity contest: one person, one signal.",
  verifyFairTitle: "Kept fair",
  verifyFairBody:
    "Community actions require a verified account, new accounts weigh less than trusted ones, and daily limits stop automated or mass actions. You cannot confirm or mark your own record.",
  verifyPrivateTitle: "Not attributed publicly",
  verifyPrivateBody:
    "Public pages show only aggregate counts and the record's public history. Who confirmed or flagged a record is never shown and never linked to a profile.",
  levelEyebrow: "Trust levels",
  levelTitle: "Recognition, not competition.",
  levelBody:
    "Trust levels reflect how many of your contributions are live in the directory. They are a quiet recognition of accurate work, not a ranking.",
  levelThresholdsTitle: "Levels and thresholds",
  levelThresholdsBody:
    "Only live contributions count. The thresholds are 1, 5, 20 and 50; hidden or removed records do not count.",
  levelBadgeTitle: "Three badges",
  levelBadgeBody:
    "Your profile shows one of three badges: New contributor, Trusted contributor or Experienced contributor. The badge is informative, never a rank.",
  levelRecognitionTitle: "Not a leaderboard",
  levelRecognitionBody:
    "Levels are personal. No public ranking or leaderboard exists, and no one else's level is ever displayed.",
  dataEyebrow: "Open data and map base",
  dataTitle: "Open where it is safe to be open.",
  dataBody:
    "Published records are available as GeoJSON and CSV for reuse and inspection. The public dataset contains the live records; private correction requests are never included.",
  downloadGeoJson: "Download public GeoJSON",
  downloadCsv: "Download public CSV",
  geoJsonTitle: "A reusable public export",
  geoJsonBody:
    "GeoJSON is a common geographic data format. It is intended for civic analysis, research and compatible mapping tools — not for finding camera feeds or sensitive operational information.",
  osmTitle: "OpenStreetMap provides the base map",
  osmBody:
    "The map background is provided by OpenStreetMap contributors. It is separate from this project’s camera records and always needs visible attribution and responsible use.",
  localLabel: "Project status",
  localTitle: "A project under development",
  localBody:
    "OpenSurveillanceDB is under active development. Records are published immediately from verified accounts and kept accurate by the community, and the project makes no claim that the data is complete, current or authoritative.",
  footer: "Built for transparency, not tracking.",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione della guida",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  map: "Mappa",
  directory: "Elenco",
  home: "Home",
  manifesto: "Manifesto",
  eyebrow: "Guida al progetto",
  title: "Un database pubblico, costruito con attenzione.",
  intro:
    "Questa guida spiega cosa documenta OpenSurveillanceDB e come usare mappa ed elenco. Spiega anche come una segnalazione diventa un dato pubblico e cosa il database non dichiara.",
  exploreMap: "Esplora la mappa",
  browseDirectory: "Sfoglia l’elenco",
  overviewEyebrow: "Guida rapida",
  overviewTitle: "Trova ciò che ti serve.",
  overviewPurpose: "Cosa documenta il database",
  overviewPublication: "Come viene pubblicata una segnalazione",
  overviewStatuses: "Come leggere gli stati dei record",
  overviewAccount: "Account e contributi",
  overviewConfirmations: "Conferme e fiducia",
  overviewData: "Dati aperti ed esportazioni",
  missionEyebrow: "Scopo e limiti",
  missionTitle: "Visibilità senza sorveglianza operativa.",
  missionBody:
    "OpenSurveillanceDB aiuta a comprendere l’infrastruttura di sorveglianza visibile nello spazio pubblico. È un registro civico di apparecchiature rivolte al pubblico, non uno strumento per osservare, tracciare o aggirare la sorveglianza legittima.",
  missionOneTitle: "Cosa documentiamo",
  missionOneBody:
    "Infrastrutture di telecamere visibili, posizione approssimativa, tipo, fonte e stato della community.",
  missionTwoTitle: "Cosa non raccogliamo",
  missionTwoBody:
    "Feed delle telecamere, credenziali, dettagli di abitazioni private, debolezze operative, volti, targhe o altri dati personali.",
  missionThreeTitle: "Cosa la mappa non può dimostrare",
  missionThreeBody:
    "L’assenza di un record non dimostra che un’area sia libera da sorveglianza. Indica solo che in quel punto non è pubblicato alcun record.",
  cycleEyebrow: "Un processo della community",
  cycleTitle: "Dall’osservazione al record pubblico.",
  cycleBody:
    "Una segnalazione di un account verificato diventa subito un record pubblico. Poi è la community a mantenere accurato l’elenco: ciò che c’è ancora viene confermato, ciò che non c’è più viene segnalato, ciò che è utile viene marcato.",
  cycleRuleTitle: "La pubblicazione è immediata.",
  cycleRuleBody:
    "Una segnalazione viene pubblicata appena un contributor verificato la invia. Niente code, niente attese: l’accuratezza è mantenuta dalla community, non da un revisore.",
  cycleStepsLabel: "Ciclo di pubblicazione",
  submitLabel: "Segnala",
  submitTitle: "Viene inviata un’osservazione",
  submitBody:
    "Chi contribuisce sceglie una posizione approssimativa nello spazio pubblico e aggiunge una breve descrizione. La segnalazione viene pubblicata subito.",
  moderateLabel: "Community",
  moderateTitle: "La community la mantiene accurata",
  moderateBody:
    "Le persone possono confermare che una telecamera c’è ancora, segnalarla come non più presente, marcarla come utile o segnalare un problema. Ogni azione richiede un account verificato; le soglie decidono cosa cambia.",
  publishLabel: "Manutenzione",
  publishTitle: "I record restano pubblici finché la community non decide altrimenti",
  publishBody:
    "Un record esce dall’elenco pubblico solo dopo abbastanza segnalazioni della community — o un’emergenza legale — e ogni transizione è registrata nella cronologia pubblica del record.",
  publicationDetailsEyebrow: "La pubblicazione, in dettaglio",
  publicationDetailsTitle: "Il modello di pubblicazione pubblico.",
  publicationDetailsSummary: "Leggi le regole di pubblicazione nel dettaglio",
  statusEyebrow: "Leggere i record",
  statusTitle: "Ogni stato indica cosa può dimostrare un record.",
  statusIntro:
    "Lo stato descrive la situazione corrente, non la garanzia che una telecamera sia attiva, completa o sempre accurata.",
  verifiedTitle: "Pubblicato e attivo",
  verifiedBody:
    "Il record è pubblico: compare in mappa, elenco ed esportazione GeoJSON. La community può intervenire in qualsiasi momento.",
  reviewTitle: "Nascosto",
  reviewBody:
    "Il record è stato ritirato in attesa di verifica da parte della community o legale. Non è elencato, ma la sua cronologia pubblica resta visibile e le conferme possono riportarlo online.",
  pendingTitle: "Segnalato come non più presente",
  pendingBody:
    "La community ha segnalato che questa telecamera non c’è più. Non è elencato e può essere ripristinato se le conferme mostrano che è tornata.",
  accountEyebrow: "Il tuo account",
  accountTitle: "Perché creare un account?",
  accountBody:
    "Consultare i dati non richiede account. Con un account puoi inviare segnalazioni, partecipare alle azioni della community, seguire i tuoi contributi e costruire un livello di fiducia.",
  accountWhyTitle: "Cosa ti dà un account",
  accountWhyBody:
    "Le tue segnalazioni sono collegate al tuo account. Puoi modificare i tuoi contributi, confermare record, segnalare problemi e vedere crescere il tuo livello di fiducia.",
  accountHowTitle: "Come funzionano gli account",
  accountHowBody:
    "Ti registri con un indirizzo email e una password, salvata come hash e mai esposta. La verifica dell'email è richiesta prima di poter pubblicare o partecipare alle azioni della community. Puoi anche aggiungere una passkey o un accesso social allo stesso account.",
  accountAnonymousTitle: "La consultazione resta aperta",
  accountAnonymousBody:
    "Puoi esplorare mappa, elenco ed esportazioni senza account. Inviare una segnalazione, una correzione o partecipare alle azioni della community richiede un account verificato.",
  editEyebrow: "Modificare un contributo",
  editTitle: "Puoi modificare i tuoi contributi.",
  editBody:
    "Solo chi ha inviato un record può modificarlo. Un aggiornamento a un record già pubblico diventa una proposta privata: la versione pubblicata resta visibile finché un moderatore non applica o scarta la modifica. Per tutto il resto, usa il modulo privato di correzione.",
  editOwnerTitle: "Solo chi ha inviato",
  editOwnerBody:
    "Puoi modificare un record solo se l'hai inviato tu. I record degli altri non sono modificabili direttamente; segnala ciò che va corretto tramite il modulo privato di correzione.",
  editRemoderationTitle: "Gli aggiornamenti diventano proposte",
  editRemoderationBody:
    "Quando un record è già pubblico, una modifica non lo sovrascrive mai: il cambiamento viene salvato come proposta privata e un moderatore la applica o la scarta. La versione pubblica attuale resta visibile per tutto il tempo.",
  editNotImmediateTitle: "La proposta resta privata",
  editNotImmediateBody:
    "Solo la modifica proposta è privata mentre viene esaminata. Il record pubblicato continua a comparire in mappa, elenco ed esportazioni finché la proposta non viene decisa.",
  verifyEyebrow: "Conferme",
  verifyTitle: "Cosa significano le conferme.",
  verifyBody:
    "Una conferma è un controllo personale che una telecamera sia ancora presente nella posizione documentata. Aiuta a fidarsi di un record senza rivelare chi lo ha confermato.",
  verifyWhatTitle: "Un controllo personale",
  verifyWhatBody:
    "Confermando, dichiari sulla base della tua osservazione che la telecamera esiste ancora dove dice il record.",
  verifyOneTitle: "Una per utente",
  verifyOneBody:
    "Ogni account può mantenere una sola azione della community per record. È un controllo, non una gara di popolarità: una persona, un segnale.",
  verifyFairTitle: "Con regole eque",
  verifyFairBody:
    "Le azioni della community richiedono un account verificato, i nuovi account pesano meno di quelli fidati e i limiti giornalieri fermano le azioni automatiche o di massa. Non puoi confermare o marcare un tuo record.",
  verifyPrivateTitle: "Mai attribuita pubblicamente",
  verifyPrivateBody:
    "Le pagine pubbliche mostrano solo conteggi aggregati e la cronologia pubblica del record. Chi ha confermato o segnalato un record non viene mai mostrato né collegato a un profilo.",
  levelEyebrow: "Livelli di fiducia",
  levelTitle: "Riconoscimento, non competizione.",
  levelBody:
    "I livelli di fiducia riflettono quanti dei tuoi contributi sono attivi nell'elenco. Sono un riconoscimento discreto del lavoro accurato, non una classifica.",
  levelThresholdsTitle: "Livelli e soglie",
  levelThresholdsBody:
    "Contano solo i contributi attivi. Le soglie sono 1, 5, 20 e 50; i record nascosti o rimossi non contano.",
  levelBadgeTitle: "Tre badge",
  levelBadgeBody:
    "Il tuo profilo mostra uno dei tre badge: Nuovo contributor, Contributor fidato o Contributor esperto. Il badge è informativo, mai un grado.",
  levelRecognitionTitle: "Non è una classifica",
  levelRecognitionBody:
    "I livelli sono personali. Non esiste alcuna classifica pubblica e il livello degli altri non viene mai mostrato.",
  dataEyebrow: "Dati aperti e base cartografica",
  dataTitle: "Aperti dove è sicuro esserlo.",
  dataBody:
    "I record pubblicati sono disponibili in GeoJSON e CSV per riuso e verifica. Il dataset pubblico contiene i record attivi; le richieste private di correzione non sono mai incluse.",
  downloadGeoJson: "Scarica il GeoJSON pubblico",
  downloadCsv: "Scarica il CSV pubblico",
  geoJsonTitle: "Un’esportazione pubblica riutilizzabile",
  geoJsonBody:
    "GeoJSON è un formato geografico comune. È pensato per analisi civica, ricerca e strumenti cartografici compatibili, non per individuare feed o informazioni operative sensibili.",
  osmTitle: "OpenStreetMap fornisce la mappa di base",
  osmBody:
    "Lo sfondo della mappa proviene dalla community di OpenStreetMap. È separato dai record sulle telecamere del progetto e richiede sempre attribuzione visibile e uso responsabile.",
  localLabel: "Stato del progetto",
  localTitle: "Un progetto in sviluppo",
  localBody:
    "OpenSurveillanceDB è ancora in sviluppo attivo. I record vengono pubblicati subito da account verificati e mantenuti accurati dalla community; il progetto non dichiara che i dati siano completi, aggiornati o autorevoli.",
  footer: "Creato per la trasparenza, non per il tracciamento.",
};
