"use client";

import Link from "next/link";
import { LocaleToggle, useLocale } from "../components/LocaleProvider";
import Link from "next/link";

export default function GuidePage() {
  const { locale } = useLocale();
  const t = locale === "it" ? italian : english;

  return <main id="main-content" className="record-page">
    <nav className="nav-shell" aria-label={t.navigation}>
      <Link className="brand" href="/" aria-label={t.homeAria}><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></Link>
      <div className="nav-links">
        <Link href="/#map">{t.map}</Link>
        <Link href="/#records">{t.directory}</Link>
        <Link className="nav-action" href="/">{t.home}</Link>
      </div>
      <LocaleToggle />
    </nav>

    <article className="record-detail">
      <p className="eyebrow"><span /> {t.eyebrow}</p>
      <h1>{t.title}</h1>
      <p className="record-detail-summary">{t.intro}</p>
      <div className="record-detail-actions">
        <Link className="button button-primary" href="/#map">{t.exploreMap} <span aria-hidden="true">↘</span></Link>
        <Link className="button detail-outline" href="/#records">{t.browseDirectory}</Link>
      </div>
    </article>

    <section className="principles" aria-labelledby="mission-title">
      <div className="principles-intro">
        <p className="eyebrow"><span /> {t.missionEyebrow}</p>
        <h2 id="mission-title">{t.missionTitle}</h2>
        <p>{t.missionBody}</p>
      </div>
      <div className="principles-grid">
        <article><span>01</span><h3>{t.missionOneTitle}</h3><p>{t.missionOneBody}</p></article>
        <article><span>02</span><h3>{t.missionTwoTitle}</h3><p>{t.missionTwoBody}</p></article>
        <article><span>03</span><h3>{t.missionThreeTitle}</h3><p>{t.missionThreeBody}</p></article>
      </div>
    </section>

    <section className="report-section" aria-labelledby="cycle-title">
      <div>
        <p className="eyebrow"><span /> {t.cycleEyebrow}</p>
        <h2 id="cycle-title">{t.cycleTitle}</h2>
        <p>{t.cycleBody}</p>
        <div className="report-rule"><b>{t.cycleRuleTitle}</b><br />{t.cycleRuleBody}</div>
      </div>
      <div className="report-form" aria-label={t.cycleStepsLabel}>
        <div><p className="card-topline">01 · {t.submitLabel}</p><h3>{t.submitTitle}</h3><p>{t.submitBody}</p></div>
        <div><p className="card-topline">02 · {t.moderateLabel}</p><h3>{t.moderateTitle}</h3><p>{t.moderateBody}</p></div>
        <div><p className="card-topline">03 · {t.publishLabel}</p><h3>{t.publishTitle}</h3><p>{t.publishBody}</p></div>
      </div>
    </section>

    <section className="records-section" aria-labelledby="status-title">
      <div className="records-heading">
        <div><p className="eyebrow"><span /> {t.statusEyebrow}</p><h2 id="status-title">{t.statusTitle}</h2><p>{t.statusIntro}</p></div>
      </div>
      <div className="record-list">
        <article className="record-list-card"><div><p className="card-topline"><span className="status-dot verified" /> {t.verifiedLabel}</p><h3>{t.verifiedTitle}</h3><p className="record-kind">{t.verifiedBody}</p></div></article>
        <article className="record-list-card"><div><p className="card-topline"><span className="status-dot needs-review" /> {t.reviewLabel}</p><h3>{t.reviewTitle}</h3><p className="record-kind">{t.reviewBody}</p></div></article>
        <article className="record-list-card"><div><p className="card-topline"><span className="status-dot community-report" /> {t.pendingLabel}</p><h3>{t.pendingTitle}</h3><p className="record-kind">{t.pendingBody}</p></div></article>
      </div>
    </section>

    <section className="correction-section" aria-labelledby="open-data-title">
      <div>
        <p className="eyebrow"><span /> {t.dataEyebrow}</p>
        <h2 id="open-data-title">{t.dataTitle}</h2>
        <p>{t.dataBody}</p>
        <div className="data-actions"><a href="/api/cameras?format=geojson">{t.downloadGeoJson} <span aria-hidden="true">→</span></a><span>·</span><a href="/api/cameras?format=csv">{t.downloadCsv} <span aria-hidden="true">→</span></a></div>
      </div>
      <div className="correction-form">
        <div><p className="card-topline">GeoJSON</p><h3>{t.geoJsonTitle}</h3><p>{t.geoJsonBody}</p></div>
        <div><p className="card-topline">OpenStreetMap</p><h3>{t.osmTitle}</h3><p>{t.osmBody}</p></div>
        <div><p className="card-topline">{t.localLabel}</p><h3>{t.localTitle}</h3><p>{t.localBody}</p></div>
      </div>
    </section>

    <footer>
      <div className="brand"><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></div>
      <p>{t.footer}</p>
      <div className="footer-links"><Link href="/">{t.home}</Link><Link href="/#map">{t.map}</Link><Link href="/#records">{t.directory}</Link></div>
    </footer>
  </main>;
}

const english = {
  navigation: "Guide navigation", homeAria: "OpenSurveillanceDB home", map: "Map", directory: "Directory", home: "Home",
  eyebrow: "Project guide", title: "A public database, built with care.", intro: "This guide explains what OpenSurveillanceDB documents, how a report becomes public data, and the limits of this local prototype.", exploreMap: "Explore the map", browseDirectory: "Browse directory",
  missionEyebrow: "Purpose and boundaries", missionTitle: "Visibility without operational surveillance.", missionBody: "OpenSurveillanceDB helps people understand visible surveillance infrastructure in public space. It is a civic record of public-facing equipment, not a tool for watching, tracking, or bypassing it.", missionOneTitle: "What we document", missionOneBody: "Visible camera infrastructure, approximate location, type, source and a review status.", missionTwoTitle: "What we do not collect", missionTwoBody: "Camera feeds, credentials, private-home details, operational weaknesses, faces, licence plates or other personal data.", missionThreeTitle: "What the map cannot prove", missionThreeBody: "An absent record does not show that an area is free of surveillance. It only shows that no reviewed record is currently published.",
  cycleEyebrow: "A reviewed process", cycleTitle: "From observation to public record.", cycleBody: "Reports are deliberately separated from published records. The public map and exports are not an automatic mirror of submissions.", cycleRuleTitle: "The default is not publication.", cycleRuleBody: "A report becomes public only after a human review finds it suitable, sufficiently documented and safe to publish.", cycleStepsLabel: "Publication cycle", submitLabel: "Submit", submitTitle: "An observation is submitted", submitBody: "A contributor chooses an approximate public-space location and adds a short description. The report begins as private pending data.", moderateLabel: "Moderate", moderateTitle: "A person reviews it", moderateBody: "Review checks relevance, duplication, accuracy and whether the report contains material that should not be made public.", publishLabel: "Publish", publishTitle: "Only reviewed data appears", publishBody: "Approved records are marked verified and can appear in the map, directory and GeoJSON export. Other reports remain out of public outputs.",
  statusEyebrow: "Reading the records", statusTitle: "Each status says what the record can support.", statusIntro: "A status describes the current review state, not a guarantee that a camera is active, complete or permanently accurate.", verifiedLabel: "Verified", verifiedTitle: "Reviewed and publishable", verifiedBody: "A moderator has approved this record for public display. It can appear in the map, directory and GeoJSON download.", reviewLabel: "Needs review", reviewTitle: "Temporarily withheld", reviewBody: "Something needs checking: the record may be old, unclear, duplicated or the subject of a correction. It is not a public record while under review.", pendingLabel: "Pending", pendingTitle: "Awaiting a decision", pendingBody: "A submission has been saved for local review but is not visible in public data, the map, the directory or exports.",
  dataEyebrow: "Open data and map base", dataTitle: "Open where it is safe to be open.", dataBody: "Published records are available as GeoJSON and CSV for reuse and inspection. The public dataset contains only records that passed review; submissions and corrections are excluded.", downloadGeoJson: "Download public GeoJSON", downloadCsv: "Download public CSV", geoJsonTitle: "A reusable public export", geoJsonBody: "GeoJSON is a common geographic data format. It is intended for civic analysis, research and compatible mapping tools—not for finding camera feeds or sensitive operational information.", osmTitle: "OpenStreetMap provides the base map", osmBody: "The map background is provided by OpenStreetMap contributors. It is separate from this project’s camera records and always needs visible attribution and responsible use.", localLabel: "Local prototype", localTitle: "This version is not a public service", localBody: "It runs locally for product development. Its illustrative records, queues and decisions are test material; no claim should be made about real surveillance infrastructure from this prototype.",
  footer: "Built for transparency, not tracking.",
} as const;

const italian: { [K in keyof typeof english]: string } = {
  navigation: "Navigazione della guida", homeAria: "Pagina iniziale di OpenSurveillanceDB", map: "Mappa", directory: "Elenco", home: "Home",
  eyebrow: "Guida al progetto", title: "Un database pubblico, costruito con attenzione.", intro: "Questa guida spiega cosa documenta OpenSurveillanceDB, come una segnalazione diventa un dato pubblico e quali sono i limiti di questo prototipo locale.", exploreMap: "Esplora la mappa", browseDirectory: "Sfoglia l’elenco",
  missionEyebrow: "Scopo e limiti", missionTitle: "Visibilità senza sorveglianza operativa.", missionBody: "OpenSurveillanceDB aiuta a comprendere l’infrastruttura di sorveglianza visibile nello spazio pubblico. È un registro civico di apparecchiature rivolte al pubblico, non uno strumento per osservare, tracciare o aggirarle.", missionOneTitle: "Cosa documentiamo", missionOneBody: "Infrastrutture di telecamere visibili, posizione approssimativa, tipo, fonte e stato di revisione.", missionTwoTitle: "Cosa non raccogliamo", missionTwoBody: "Feed delle telecamere, credenziali, dettagli di abitazioni private, debolezze operative, volti, targhe o altri dati personali.", missionThreeTitle: "Cosa la mappa non può dimostrare", missionThreeBody: "L’assenza di un record non dimostra che un’area sia libera da sorveglianza. Indica solo che non è pubblicato alcun record revisionato.",
  cycleEyebrow: "Un processo revisionato", cycleTitle: "Dall’osservazione al record pubblico.", cycleBody: "Le segnalazioni sono intenzionalmente separate dai record pubblicati. Mappa ed esportazioni non sono una copia automatica degli invii.", cycleRuleTitle: "La regola predefinita è non pubblicare.", cycleRuleBody: "Una segnalazione diventa pubblica solo dopo una revisione umana che la ritenga pertinente, sufficientemente documentata e sicura da pubblicare.", cycleStepsLabel: "Ciclo di pubblicazione", submitLabel: "Segnala", submitTitle: "Viene inviata un’osservazione", submitBody: "Chi contribuisce sceglie una posizione approssimativa nello spazio pubblico e aggiunge una breve descrizione. La segnalazione nasce come dato privato in attesa.", moderateLabel: "Revisiona", moderateTitle: "Una persona la valuta", moderateBody: "La revisione controlla pertinenza, duplicati, accuratezza e la presenza di materiale che non dovrebbe essere pubblico.", publishLabel: "Pubblica", publishTitle: "Appaiono solo dati revisionati", publishBody: "I record approvati sono marcati come verificati e possono comparire in mappa, elenco ed esportazione GeoJSON. Le altre segnalazioni restano fuori dagli output pubblici.",
  statusEyebrow: "Leggere i record", statusTitle: "Ogni stato chiarisce cosa può sostenere un record.", statusIntro: "Lo stato descrive la condizione corrente della revisione, non garantisce che una telecamera sia attiva, completa o accurata in modo permanente.", verifiedLabel: "Verificata", verifiedTitle: "Revisionata e pubblicabile", verifiedBody: "Un moderatore ha approvato il record per la visualizzazione pubblica. Può comparire in mappa, elenco e download GeoJSON.", reviewLabel: "Da ricontrollare", reviewTitle: "Temporaneamente non visibile", reviewBody: "Qualcosa deve essere verificato: il record può essere vecchio, poco chiaro, duplicato o oggetto di una correzione. Non è pubblico durante la revisione.", pendingLabel: "In moderazione", pendingTitle: "In attesa di una decisione", pendingBody: "Una segnalazione è stata salvata per la revisione locale, ma non è visibile nei dati pubblici, nella mappa, nell’elenco o nelle esportazioni.",
  dataEyebrow: "Dati aperti e base cartografica", dataTitle: "Aperti dove è sicuro esserlo.", dataBody: "I record pubblicati sono disponibili in GeoJSON e CSV per riuso e verifica. Il dataset pubblico contiene solo record che hanno superato la revisione; segnalazioni e correzioni sono escluse.", downloadGeoJson: "Scarica il GeoJSON pubblico", downloadCsv: "Scarica il CSV pubblico", geoJsonTitle: "Un’esportazione pubblica riutilizzabile", geoJsonBody: "GeoJSON è un formato geografico comune. È pensato per analisi civica, ricerca e strumenti cartografici compatibili, non per individuare feed o informazioni operative sensibili.", osmTitle: "OpenStreetMap fornisce la mappa di base", osmBody: "Lo sfondo della mappa proviene dai contributori di OpenStreetMap. È separato dai record sulle telecamere del progetto e richiede sempre attribuzione visibile e uso responsabile.", localLabel: "Prototipo locale", localTitle: "Questa versione non è un servizio pubblico", localBody: "Funziona localmente per lo sviluppo del prodotto. Record illustrativi, code e decisioni sono materiale di test: da questo prototipo non si deve dedurre nulla su infrastrutture di sorveglianza reali.",
  footer: "Creato per la trasparenza, non per il tracciamento.",
};
