/**
 * manifesto — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Manifesto navigation",
  homeAria: "OpenSurveillanceDB home",
  map: "Map",
  directory: "Directory",
  guide: "How it works",
  manifesto: "Manifesto",
  home: "Home",
  eyebrow: "Project manifesto",
  title: "A manifesto for legible public space.",
  intro:
    "OpenSurveillanceDB is an open, non-commercial civic database of visible public surveillance infrastructure. This page states the project's purpose, the principles that govern it, the boundaries it accepts, and what is — and is not — published.",
  exploreMap: "Explore the map",
  browseDirectory: "Browse the directory",
  readGuide: "Read the guide",
  missionEyebrow: "Mission",
  missionTitle: "Help people understand the systems around them.",
  missionBody:
    "The project maps visible camera infrastructure in shared spaces, so the public can see what is installed nearby. It documents public-facing equipment only. It is not a tool for watching, tracking or bypassing lawful surveillance.",
  missionOneTitle: "What we document",
  missionOneBody:
    "Visible camera infrastructure, approximate location, type, source and a community status.",
  missionTwoTitle: "What we do not collect",
  missionTwoBody:
    "Camera feeds, credentials, private-home details, operational weaknesses, faces, licence plates or other personal data.",
  missionThreeTitle: "What the data cannot prove",
  missionThreeBody:
    "An absent record does not show that an area is free of surveillance. It only shows that no record is currently published there.",
  principlesEyebrow: "Principles",
  principlesTitle: "Free, open and safe by design.",
  principlesIntro:
    "Five commitments shape every decision in this project, from the data model to the community actions.",
  principleOneTitle: "Free to use",
  principleOneBody:
    "No ads, no profiling, no paid features. The database and the software are public goods.",
  principleTwoTitle: "Open source",
  principleTwoBody:
    "The software can be inspected, reused and improved by the community.",
  principleThreeTitle: "Open data with provenance",
  principleThreeBody:
    "Licensing and provenance are recorded for every published record, so journalism, research and civic use can rely on them.",
  principleFourTitle: "Privacy and safety by design",
  principleFourBody:
    "No private-home cameras, no sensitive operational details, no live-feed links. Faces and licence plates are removed before publication.",
  principleFiveTitle: "Community accuracy first",
  principleFiveBody:
    "Reports are published immediately from verified accounts. The community keeps the directory accurate: confirming what is still there, flagging what is gone, and withdrawing what is problematic — under automatic, transparent thresholds.",
  nonGoalsEyebrow: "Non-goals",
  nonGoalsTitle: "What we deliberately do not do.",
  nonGoalsBody:
    "The boundaries are as important as the mission. OpenSurveillanceDB will never become any of the following:",
  nonGoalFeedsTitle: "No camera feeds",
  nonGoalFeedsBody:
    "We document equipment, not footage. No live or recorded feed is ever linked or displayed.",
  nonGoalTrackingTitle: "No tracking tools",
  nonGoalTrackingBody:
    "The data cannot be used to watch, follow or profile people in public space.",
  nonGoalBypassTitle: "No evasion advice",
  nonGoalBypassBody:
    "The project does not help anyone avoid lawful surveillance and does not publish operational weaknesses.",
  nonGoalPrivateTitle: "No private property",
  nonGoalPrivateBody:
    "Cameras that surveil private homes, and details of private life, are out of scope.",
  publishEyebrow: "What we publish",
  publishTitle: "Open where it is safe to be open.",
  publishBody:
    "Public-facing infrastructure enters the public outputs as soon as it is reported. Every record is a fact about visible equipment, not about a person, and stays live until the community withdraws it.",
  publishedTitle: "Published",
  publishedItemOne: "Visible camera infrastructure and its approximate location",
  publishedItemTwo: "Type, source and community status for every record",
  publishedItemThree:
    "GeoJSON and CSV exports of public records, with licensing and provenance",
  neverPublishedTitle: "Never published",
  neverPublishedItemOne: "Camera feeds, credentials or links to live footage",
  neverPublishedItemTwo: "Faces, licence plates or any personal data",
  neverPublishedItemThree:
    "Private-home details, sensitive locations or operational weaknesses",
  neverPublishedItemFour:
    "Private correction requests, which never enter the public dataset",
  footerNote: "Built for transparency, not tracking.",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione del manifesto",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  map: "Mappa",
  directory: "Elenco",
  guide: "Come funziona",
  manifesto: "Manifesto",
  home: "Home",
  eyebrow: "Manifesto del progetto",
  title: "Un manifesto per uno spazio pubblico leggibile.",
  intro:
    "OpenSurveillanceDB è un database civico aperto e non commerciale che documenta l’infrastruttura di sorveglianza pubblica visibile. Questa pagina dichiara a cosa serve il progetto, quali principi lo governano, quali confini accetta e cosa viene — e non viene — pubblicato.",
  exploreMap: "Esplora la mappa",
  browseDirectory: "Sfoglia l’elenco",
  readGuide: "Leggi la guida",
  missionEyebrow: "Missione",
  missionTitle: "Aiutare le persone a comprendere i sistemi che le circondano.",
  missionBody:
    "Il progetto mappa l’infrastruttura di telecamere visibile negli spazi condivisi, così che tutti possano vedere cosa è installato nelle vicinanze. Documenta solo apparecchiature rivolte al pubblico. Non è uno strumento per osservare, tracciare o aggirare la sorveglianza legittima.",
  missionOneTitle: "Cosa documentiamo",
  missionOneBody:
    "Infrastrutture di telecamere visibili, posizione approssimativa, tipo, fonte e stato della community.",
  missionTwoTitle: "Cosa non raccogliamo",
  missionTwoBody:
    "Feed delle telecamere, credenziali, dettagli di abitazioni private, debolezze operative, volti, targhe o altri dati personali.",
  missionThreeTitle: "Cosa i dati non possono dimostrare",
  missionThreeBody:
    "L’assenza di un record non dimostra che un’area sia libera da sorveglianza. Indica solo che in quel punto non è pubblicato alcun record.",
  principlesEyebrow: "Principi",
  principlesTitle: "Gratuito, aperto e sicuro fin dalla progettazione.",
  principlesIntro:
    "Cinque impegni guidano ogni decisione del progetto, dal modello dati alle azioni della community.",
  principleOneTitle: "Gratuito da usare",
  principleOneBody:
    "Niente pubblicità, profilazione o funzioni a pagamento. Il database e il software sono beni comuni.",
  principleTwoTitle: "Open source",
  principleTwoBody:
    "Il software può essere ispezionato, riusato e migliorato dalla comunità.",
  principleThreeTitle: "Dati aperti con provenienza",
  principleThreeBody:
    "Licenza e provenienza sono registrate per ogni record pubblicato, così giornalismo, ricerca e uso civico possono farvi affidamento.",
  principleFourTitle: "Privacy e sicurezza by design",
  principleFourBody:
    "Niente telecamere di abitazioni private, dettagli operativi sensibili o link a feed live. Volti e targhe vengono rimossi prima della pubblicazione.",
  principleFiveTitle: "Accuratezza della community prima di tutto",
  principleFiveBody:
    "Le segnalazioni vengono pubblicate subito da account verificati. È la community a mantenere accurato l’elenco: confermando ciò che c’è ancora, segnalando ciò che non c’è più e ritirando ciò che è problematico — con soglie automatiche e trasparenti.",
  nonGoalsEyebrow: "Non-obiettivi",
  nonGoalsTitle: "Cosa scegliamo deliberatamente di non fare.",
  nonGoalsBody:
    "I confini sono importanti quanto la missione. OpenSurveillanceDB non diventerà mai nessuna delle seguenti cose:",
  nonGoalFeedsTitle: "Niente feed delle telecamere",
  nonGoalFeedsBody:
    "Documentiamo apparecchiature, non filmati. Nessun feed live o registrato viene mai collegato o mostrato.",
  nonGoalTrackingTitle: "Niente strumenti di tracciamento",
  nonGoalTrackingBody:
    "I dati non possono essere usati per osservare, seguire o profilare le persone nello spazio pubblico.",
  nonGoalBypassTitle: "Niente consigli per eludere",
  nonGoalBypassBody:
    "Il progetto non aiuta nessuno a evitare la sorveglianza legittima e non pubblica debolezze operative.",
  nonGoalPrivateTitle: "Niente proprietà privata",
  nonGoalPrivateBody:
    "Le telecamere che sorvegliano abitazioni private e i dettagli della vita privata sono fuori ambito.",
  publishEyebrow: "Cosa pubblichiamo",
  publishTitle: "Aperti dove è sicuro esserlo.",
  publishBody:
    "L’infrastruttura rivolta al pubblico entra nei dati pubblici appena viene segnalata. Ogni record pubblicato è un fatto su apparecchiature visibili, non su una persona, e resta online finché la community non lo ritira.",
  publishedTitle: "Pubblicato",
  publishedItemOne: "Infrastruttura di telecamere visibile e sua posizione approssimativa",
  publishedItemTwo: "Tipo, fonte e stato della community per ogni record",
  publishedItemThree:
    "Esportazioni GeoJSON e CSV dei record pubblici, con licenza e provenienza",
  neverPublishedTitle: "Mai pubblicato",
  neverPublishedItemOne: "Feed delle telecamere, credenziali o link a filmati live",
  neverPublishedItemTwo: "Volti, targhe o qualsiasi dato personale",
  neverPublishedItemThree:
    "Dettagli di abitazioni private, luoghi sensibili o debolezze operative",
  neverPublishedItemFour:
    "Le richieste private di correzione, che non entrano mai nel dataset pubblico",
  footerNote: "Creato per la trasparenza, non per il tracciamento.",
};
