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
    "This guide explains what OpenSurveillanceDB documents, how to use the map and directory pages, how a report becomes public data, and the limits of this local prototype.",
  exploreMap: "Explore the map",
  browseDirectory: "Browse directory",
  missionEyebrow: "Purpose and boundaries",
  missionTitle: "Visibility without operational surveillance.",
  missionBody:
    "OpenSurveillanceDB helps people understand visible surveillance infrastructure in public space. It is a civic record of public-facing equipment, not a tool for watching, tracking, or bypassing it.",
  missionOneTitle: "What we document",
  missionOneBody:
    "Visible camera infrastructure, approximate location, type, source and a review status.",
  missionTwoTitle: "What we do not collect",
  missionTwoBody:
    "Camera feeds, credentials, private-home details, operational weaknesses, faces, licence plates or other personal data.",
  missionThreeTitle: "What the map cannot prove",
  missionThreeBody:
    "An absent record does not show that an area is free of surveillance. It only shows that no reviewed record is currently published.",
  cycleEyebrow: "A reviewed process",
  cycleTitle: "From observation to public record.",
  cycleBody:
    "Reports are deliberately separated from published records. The public map, directory and exports are not an automatic mirror of submissions.",
  cycleRuleTitle: "The default is not publication.",
  cycleRuleBody:
    "A report becomes public only after a human review finds it suitable, sufficiently documented and safe to publish.",
  cycleStepsLabel: "Publication cycle",
  submitLabel: "Submit",
  submitTitle: "An observation is submitted",
  submitBody:
    "A contributor chooses an approximate public-space location and adds a short description. The report begins as private pending data.",
  moderateLabel: "Moderate",
  moderateTitle: "A person reviews it",
  moderateBody:
    "Review checks relevance, duplication, accuracy and whether the report contains material that should not be made public.",
  publishLabel: "Publish",
  publishTitle: "Only reviewed data appears",
  publishBody:
    "Approved records are marked verified and can appear in the map, directory and GeoJSON export. Other reports remain out of public outputs.",
  statusEyebrow: "Reading the records",
  statusTitle: "Each status says what the record can support.",
  statusIntro:
    "A status describes the current review state, not a guarantee that a camera is active, complete or permanently accurate.",
  verifiedTitle: "Reviewed and publishable",
  verifiedBody:
    "A moderator has approved this record for public display. It can appear in the map, directory and GeoJSON download.",
  reviewTitle: "Temporarily withheld",
  reviewBody:
    "Something needs checking: the record may be old, unclear, duplicated or the subject of a correction. It is not a public record while under review.",
  pendingTitle: "Awaiting a decision",
  pendingBody:
    "A submission has been saved for local review but is not visible in public data, the map, the directory or exports.",
  accountEyebrow: "Your account",
  accountTitle: "Why create an account?",
  accountBody:
    "An account is optional. It lets you keep track of your own reports, verify records you have seen, and build a trust level from your verified contributions.",
  accountWhyTitle: "What an account gives you",
  accountWhyBody:
    "Your reports are linked to your account, you can edit your own contributions, add verifications to records, and see your trust level grow as your contributions are verified.",
  accountHowTitle: "How registration works today",
  accountHowBody:
    "Registration uses an email address and a password, stored hashed and never exposed (ADR 0013). The login method may change before launch; this guide will be updated to match the final choice.",
  accountAnonymousTitle: "Anonymous remains possible",
  accountAnonymousBody:
    "You can still submit a report or a correction without an account. An account adds attribution and community features; it is never required to participate.",
  editEyebrow: "Editing a contribution",
  editTitle: "You can edit your own contributions.",
  editBody:
    "Only the contributor who submitted a record can edit it. Changes to a published record are reviewed again before they appear in public data.",
  editOwnerTitle: "Owner only",
  editOwnerBody:
    "You can edit a record only if you submitted it. Other people's records cannot be edited from the community pages.",
  editRemoderationTitle: "Published changes are re-moderated",
  editRemoderationBody:
    "When a record is already public, an edit goes back into moderation and replaces the record only after a human review approves it.",
  editNotImmediateTitle: "Not immediately public",
  editNotImmediateBody:
    "An edited record does not appear in the map, directory or exports right away: it stays out of public outputs until the review of the edit is complete.",
  verifyEyebrow: "Verifications",
  verifyTitle: "What verifications confirm.",
  verifyBody:
    "A verification is a personal confirmation that a camera is present at the documented location. It helps readers trust a record without revealing who confirmed it.",
  verifyWhatTitle: "A personal check",
  verifyWhatBody:
    "By verifying, you confirm from your own observation that the camera exists where the record says it is.",
  verifyOneTitle: "One per user",
  verifyOneBody:
    "Each account can add one verification per record. It is a check, not a popularity contest: one person, one verification.",
  verifyFairTitle: "Kept fair",
  verifyFairBody:
    "Verifying needs at least one published contribution of your own, you cannot verify your own record, and daily limits stop automated or mass verification.",
  verifyPrivateTitle: "Not attributed publicly",
  verifyPrivateBody:
    "Public pages show only the total number of verifications. Who verified a record is never shown and never linked to a profile.",
  levelEyebrow: "Trust levels",
  levelTitle: "Recognition, not competition.",
  levelBody:
    "Trust levels reflect how many of your contributions have been verified by reviewers. They are a quiet recognition of accurate work, not a ranking.",
  levelThresholdsTitle: "Levels and thresholds",
  levelThresholdsBody:
    "Only verified contributions count. The thresholds are 1, 5, 20 and 50 verified contributions; reports still in moderation, rejected or removed do not count.",
  levelBadgeTitle: "Three badges",
  levelBadgeBody:
    "Your profile shows one of three badges: New contributor, Trusted contributor or Experienced contributor. The badge is informative, never a rank.",
  levelRecognitionTitle: "Not a leaderboard",
  levelRecognitionBody:
    "Levels are personal. No public ranking or leaderboard exists, and no one else's level is ever displayed.",
  dataEyebrow: "Open data and map base",
  dataTitle: "Open where it is safe to be open.",
  dataBody:
    "Published records are available as GeoJSON and CSV for reuse and inspection. The public dataset contains only records that passed review; submissions and corrections are excluded.",
  downloadGeoJson: "Download public GeoJSON",
  downloadCsv: "Download public CSV",
  geoJsonTitle: "A reusable public export",
  geoJsonBody:
    "GeoJSON is a common geographic data format. It is intended for civic analysis, research and compatible mapping tools—not for finding camera feeds or sensitive operational information.",
  osmTitle: "OpenStreetMap provides the base map",
  osmBody:
    "The map background is provided by OpenStreetMap contributors. It is separate from this project’s camera records and always needs visible attribution and responsible use.",
  localLabel: "Local prototype",
  localTitle: "This version is not a public service",
  localBody:
    "It runs locally for product development. Its illustrative records, queues and decisions are test material; no claim should be made about real surveillance infrastructure from this prototype.",
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
    "Questa guida spiega cosa documenta OpenSurveillanceDB, come usare le pagine della mappa e dell'elenco, come una segnalazione diventa un dato pubblico e quali sono i limiti di questo prototipo locale.",
  exploreMap: "Esplora la mappa",
  browseDirectory: "Sfoglia l’elenco",
  missionEyebrow: "Scopo e limiti",
  missionTitle: "Visibilità senza sorveglianza operativa.",
  missionBody:
    "OpenSurveillanceDB aiuta a comprendere l’infrastruttura di sorveglianza visibile nello spazio pubblico. È un registro civico di apparecchiature rivolte al pubblico, non uno strumento per osservare, tracciare o aggirarle.",
  missionOneTitle: "Cosa documentiamo",
  missionOneBody:
    "Infrastrutture di telecamere visibili, posizione approssimativa, tipo, fonte e stato di revisione.",
  missionTwoTitle: "Cosa non raccogliamo",
  missionTwoBody:
    "Feed delle telecamere, credenziali, dettagli di abitazioni private, debolezze operative, volti, targhe o altri dati personali.",
  missionThreeTitle: "Cosa la mappa non può dimostrare",
  missionThreeBody:
    "L’assenza di un record non dimostra che un’area sia libera da sorveglianza. Indica solo che non è pubblicato alcun record revisionato.",
  cycleEyebrow: "Un processo revisionato",
  cycleTitle: "Dall’osservazione al record pubblico.",
  cycleBody:
    "Le segnalazioni sono intenzionalmente separate dai record pubblicati. Mappa, elenco ed esportazioni non sono una copia automatica degli invii.",
  cycleRuleTitle: "La regola predefinita è non pubblicare.",
  cycleRuleBody:
    "Una segnalazione diventa pubblica solo dopo una revisione umana che la ritenga pertinente, sufficientemente documentata e sicura da pubblicare.",
  cycleStepsLabel: "Ciclo di pubblicazione",
  submitLabel: "Segnala",
  submitTitle: "Viene inviata un’osservazione",
  submitBody:
    "Chi contribuisce sceglie una posizione approssimativa nello spazio pubblico e aggiunge una breve descrizione. La segnalazione nasce come dato privato in attesa.",
  moderateLabel: "Revisiona",
  moderateTitle: "Una persona la valuta",
  moderateBody:
    "La revisione controlla pertinenza, duplicati, accuratezza e la presenza di materiale che non dovrebbe essere pubblico.",
  publishLabel: "Pubblica",
  publishTitle: "Appaiono solo dati revisionati",
  publishBody:
    "I record approvati sono marcati come verificati e possono comparire in mappa, elenco ed esportazione GeoJSON. Le altre segnalazioni restano fuori dagli output pubblici.",
  statusEyebrow: "Leggere i record",
  statusTitle: "Ogni stato chiarisce cosa può sostenere un record.",
  statusIntro:
    "Lo stato descrive la condizione corrente della revisione, non garantisce che una telecamera sia attiva, completa o accurata in modo permanente.",
  verifiedTitle: "Revisionata e pubblicabile",
  verifiedBody:
    "Un moderatore ha approvato il record per la visualizzazione pubblica. Può comparire in mappa, elenco e download GeoJSON.",
  reviewTitle: "Temporaneamente non visibile",
  reviewBody:
    "Qualcosa deve essere verificato: il record può essere vecchio, poco chiaro, duplicato o oggetto di una correzione. Non è pubblico durante la revisione.",
  pendingTitle: "In attesa di una decisione",
  pendingBody:
    "Una segnalazione è stata salvata per la revisione locale, ma non è visibile nei dati pubblici, nella mappa, nell’elenco o nelle esportazioni.",
  accountEyebrow: "Il tuo account",
  accountTitle: "Perché creare un account?",
  accountBody:
    "L'account è facoltativo. Ti permette di tenere traccia delle tue segnalazioni, verificare i record che hai visto e costruire un livello di fiducia con i tuoi contributi verificati.",
  accountWhyTitle: "Cosa ti dà un account",
  accountWhyBody:
    "Le tue segnalazioni sono collegate al tuo account, puoi modificare i tuoi contributi, aggiungere verifiche ai record e vedere crescere il tuo livello di fiducia man mano che i contributi vengono verificati.",
  accountHowTitle: "Come funziona la registrazione oggi",
  accountHowBody:
    "La registrazione usa un indirizzo email e una password, salvata come hash e mai esposta (ADR 0013). Il metodo di accesso può cambiare prima del lancio; questa guida verrà aggiornata in base alla scelta finale.",
  accountAnonymousTitle: "L'anonimato resta possibile",
  accountAnonymousBody:
    "Puoi comunque inviare una segnalazione o una correzione senza account. L'account aggiunge attribuzione e funzioni community; non è mai obbligatorio per partecipare.",
  editEyebrow: "Modificare un contributo",
  editTitle: "Puoi modificare i tuoi contributi.",
  editBody:
    "Solo chi ha inviato un record può modificarlo. Le modifiche a un record già pubblicato vengono riviste di nuovo prima di comparire nei dati pubblici.",
  editOwnerTitle: "Solo chi ha inviato",
  editOwnerBody:
    "Puoi modificare un record solo se l'hai inviato tu. I record degli altri non sono modificabili dalle pagine community.",
  editRemoderationTitle: "Le modifiche ai record pubblicati sono riviste di nuovo",
  editRemoderationBody:
    "Quando un record è già pubblico, una modifica torna in moderazione e sostituisce il record solo dopo l'approvazione di una revisione umana.",
  editNotImmediateTitle: "Non subito pubblico",
  editNotImmediateBody:
    "Un record modificato non compare subito in mappa, elenco o esportazioni: resta fuori dagli output pubblici finché la revisione della modifica non è completata.",
  verifyEyebrow: "Verifiche",
  verifyTitle: "Cosa confermano le verifiche.",
  verifyBody:
    "Una verifica è una conferma personale che una telecamera sia presente nella posizione documentata. Aiuta a fidarsi di un record senza rivelare chi lo ha confermato.",
  verifyWhatTitle: "Un controllo personale",
  verifyWhatBody:
    "Verificando, confermi sulla base della tua osservazione che la telecamera esiste dove dice il record.",
  verifyOneTitle: "Una per utente",
  verifyOneBody:
    "Ogni account può aggiungere una verifica per record. È un controllo, non una gara di popolarità: una persona, una verifica.",
  verifyFairTitle: "Con regole eque",
  verifyFairBody:
    "Per verificare serve almeno un contributo pubblicato, non puoi verificare un tuo record e i limiti giornalieri fermano le verifiche automatiche o di massa.",
  verifyPrivateTitle: "Mai attribuita pubblicamente",
  verifyPrivateBody:
    "Le pagine pubbliche mostrano solo il numero totale di verifiche. Chi ha verificato un record non viene mai mostrato né collegato a un profilo.",
  levelEyebrow: "Livelli di fiducia",
  levelTitle: "Riconoscimento, non competizione.",
  levelBody:
    "I livelli di fiducia riflettono quanti dei tuoi contributi sono stati verificati dai revisori. Sono un riconoscimento discreto del lavoro accurato, non una classifica.",
  levelThresholdsTitle: "Livelli e soglie",
  levelThresholdsBody:
    "Contano solo i contributi verificati. Le soglie sono 1, 5, 20 e 50 contributi verificati; le segnalazioni in moderazione, rifiutate o rimosse non contano.",
  levelBadgeTitle: "Tre badge",
  levelBadgeBody:
    "Il tuo profilo mostra uno di tre badge: Nuovo contributor, Contributor fidato o Contributor esperto. Il badge è informativo, mai un grado.",
  levelRecognitionTitle: "Non è una classifica",
  levelRecognitionBody:
    "I livelli sono personali. Non esiste alcuna classifica pubblica e il livello degli altri non viene mai mostrato.",
  dataEyebrow: "Dati aperti e base cartografica",
  dataTitle: "Aperti dove è sicuro esserlo.",
  dataBody:
    "I record pubblicati sono disponibili in GeoJSON e CSV per riuso e verifica. Il dataset pubblico contiene solo record che hanno superato la revisione; segnalazioni e correzioni sono escluse.",
  downloadGeoJson: "Scarica il GeoJSON pubblico",
  downloadCsv: "Scarica il CSV pubblico",
  geoJsonTitle: "Un’esportazione pubblica riutilizzabile",
  geoJsonBody:
    "GeoJSON è un formato geografico comune. È pensato per analisi civica, ricerca e strumenti cartografici compatibili, non per individuare feed o informazioni operative sensibili.",
  osmTitle: "OpenStreetMap fornisce la mappa di base",
  osmBody:
    "Lo sfondo della mappa proviene dai contributori di OpenStreetMap. È separato dai record sulle telecamere del progetto e richiede sempre attribuzione visibile e uso responsabile.",
  localLabel: "Prototipo locale",
  localTitle: "Questa versione non è un servizio pubblico",
  localBody:
    "Funziona localmente per lo sviluppo del prodotto. Record illustrativi, code e decisioni sono materiale di test: da questo prototipo non si deve dedurre nulla su infrastrutture di sorveglianza reali.",
  footer: "Creato per la trasparenza, non per il tracciamento.",
};
