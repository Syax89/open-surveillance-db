import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";
import { getServerMessages } from "../lib/server-i18n";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const t = bundle.guide;
  return {
    title: t.title,
    description: t.intro,
    openGraph: { title: t.title, description: t.intro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: t.title, description: t.intro, images: ["/og.png"] },
  };
}

export default async function GuidePage() {
  const bundle = await getServerMessages();
  const t = bundle.guide;
  const publication = bundle.moderazione;
  const statuses: Record<string, string> = bundle.status;

  return (
    <InfoPage
      navLabel={t.navigation}
      homeLabel={t.homeAria}
      eyebrow={t.eyebrow}
      title={t.title}
      intro={t.intro}
      actions={
        <>
          <Link className="button button-primary" href="/mappa">{t.exploreMap} <span aria-hidden="true">→</span></Link>
          <Link className="button detail-outline" href="/directory">{t.browseDirectory}</Link>
        </>
      }
    >
      <nav className="guide-overview" aria-labelledby="guide-overview-title">
        <div>
          <p className="eyebrow"><span /> {t.overviewEyebrow}</p>
          <h2 id="guide-overview-title">{t.overviewTitle}</h2>
        </div>
        <ul>
          <li><a href="#guide-purpose">{t.overviewPurpose}</a></li>
          <li><a href="#guide-publication">{t.overviewPublication}</a></li>
          <li><a href="#guide-statuses">{t.overviewStatuses}</a></li>
          <li><a href="#guide-account">{t.overviewAccount}</a></li>
          <li><a href="#guide-confirmations">{t.overviewConfirmations}</a></li>
          <li><a href="#guide-data">{t.overviewData}</a></li>
        </ul>
      </nav>

      <section id="guide-purpose" className="principles guide-principles guide-section-anchor" aria-labelledby="mission-title">
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

      <section id="guide-publication" className="report-section guide-publication-section guide-section-anchor" aria-labelledby="cycle-title">
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

      <section id="guide-publication-details" className="guide-publication-details guide-section-anchor" aria-labelledby="publication-details-title">
        <div>
          <p className="eyebrow"><span /> {t.publicationDetailsEyebrow}</p>
          <h2 id="publication-details-title">{t.publicationDetailsTitle}</h2>
        </div>
        <details>
          <summary>{t.publicationDetailsSummary}</summary>
          <div className="guide-publication-details-body">
            <p className="guide-publication-details-intro">{publication.intro}</p>
            <div className="report-form" aria-label={publication.flowEyebrow}>
              <div><p className="card-topline">01 · {publication.stepReceiveTitle}</p><h3>{publication.stepReceiveTitle}</h3><p>{publication.stepReceiveBody}</p></div>
              <div><p className="card-topline">02 · {publication.stepScreenTitle}</p><h3>{publication.stepScreenTitle}</h3><p>{publication.stepScreenBody}</p></div>
              <div><p className="card-topline">03 · {publication.stepVerifyTitle}</p><h3>{publication.stepVerifyTitle}</h3><p>{publication.stepVerifyBody}</p></div>
              <div><p className="card-topline">04 · {publication.stepMinimiseTitle}</p><h3>{publication.stepMinimiseTitle}</h3><p>{publication.stepMinimiseBody}</p></div>
              <div><p className="card-topline">05 · {publication.stepDecideTitle}</p><h3>{publication.stepDecideTitle}</h3><p>{publication.stepDecideBody}</p></div>
              <div><p className="card-topline">06 · {publication.stepMaintainTitle}</p><h3>{publication.stepMaintainTitle}</h3><p>{publication.stepMaintainBody}</p></div>
            </div>
            <div className="guide-publication-details-notes">
              <div className="report-rule"><b>{publication.appealsTitle}</b><br />{publication.appealsBody}<br /><br /><b>{publication.urgentTitle}</b><br />{publication.urgentBody}<br /><br /><b>{publication.slaTitle}</b><br />{publication.slaBody}</div>
              <div className="report-rule"><b>{publication.safeguardsTitle}</b><br />{publication.safeguardsBody}<ul><li><b>{publication.safeguardPairTitle}.</b> {publication.safeguardPairBody}</li><li><b>{publication.safeguardEscalationTitle}.</b> {publication.safeguardEscalationBody}</li><li><b>{publication.safeguardCredentialsTitle}.</b> {publication.safeguardCredentialsBody}</li><li><b>{publication.safeguardTrainingTitle}.</b> {publication.safeguardTrainingBody}</li><li><b>{publication.safeguardAuditTitle}.</b> {publication.safeguardAuditBody}</li></ul></div>
            </div>
          </div>
        </details>
      </section>

      <section id="guide-statuses" className="records-section guide-section-anchor" aria-labelledby="status-title">
        <div className="records-heading">
          <div><p className="eyebrow"><span /> {t.statusEyebrow}</p><h2 id="status-title">{t.statusTitle}</h2><p>{t.statusIntro}</p></div>
        </div>
        <div className="record-list">
          <article className="record-list-card"><div><p className="card-topline"><span className="status-dot active" /> {statuses.active}</p><h3>{t.verifiedTitle}</h3><p className="record-kind">{t.verifiedBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline"><span className="status-dot hidden" /> {statuses.hidden}</p><h3>{t.reviewTitle}</h3><p className="record-kind">{t.reviewBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline"><span className="status-dot removed" /> {statuses.removed}</p><h3>{t.pendingTitle}</h3><p className="record-kind">{t.pendingBody}</p></div></article>
        </div>
      </section>

      <section id="guide-account" className="records-section guide-section-anchor" aria-labelledby="account-title">
        <div className="records-heading">
          <div><p className="eyebrow"><span /> {t.accountEyebrow}</p><h2 id="account-title">{t.accountTitle}</h2><p>{t.accountBody}</p></div>
        </div>
        <div className="record-list">
          <article className="record-list-card"><div><p className="card-topline">01 · {t.accountWhyTitle}</p><h3>{t.accountWhyTitle}</h3><p className="record-kind">{t.accountWhyBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline">02 · {t.accountHowTitle}</p><h3>{t.accountHowTitle}</h3><p className="record-kind">{t.accountHowBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline">03 · {t.accountAnonymousTitle}</p><h3>{t.accountAnonymousTitle}</h3><p className="record-kind">{t.accountAnonymousBody}</p></div></article>
        </div>
      </section>

      <section className="records-section guide-section-anchor" aria-labelledby="edit-title">
        <div className="records-heading">
          <div><p className="eyebrow"><span /> {t.editEyebrow}</p><h2 id="edit-title">{t.editTitle}</h2><p>{t.editBody}</p></div>
        </div>
        <div className="record-list">
          <article className="record-list-card"><div><p className="card-topline">01 · {t.editOwnerTitle}</p><h3>{t.editOwnerTitle}</h3><p className="record-kind">{t.editOwnerBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline">02 · {t.editRemoderationTitle}</p><h3>{t.editRemoderationTitle}</h3><p className="record-kind">{t.editRemoderationBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline">03 · {t.editNotImmediateTitle}</p><h3>{t.editNotImmediateTitle}</h3><p className="record-kind">{t.editNotImmediateBody}</p></div></article>
        </div>
      </section>

      <section id="guide-confirmations" className="records-section guide-section-anchor" aria-labelledby="verify-title">
        <div className="records-heading">
          <div><p className="eyebrow"><span /> {t.verifyEyebrow}</p><h2 id="verify-title">{t.verifyTitle}</h2><p>{t.verifyBody}</p></div>
        </div>
        <div className="record-list">
          <article className="record-list-card"><div><p className="card-topline">01 · {t.verifyWhatTitle}</p><h3>{t.verifyWhatTitle}</h3><p className="record-kind">{t.verifyWhatBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline">02 · {t.verifyOneTitle}</p><h3>{t.verifyOneTitle}</h3><p className="record-kind">{t.verifyOneBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline">03 · {t.verifyFairTitle}</p><h3>{t.verifyFairTitle}</h3><p className="record-kind">{t.verifyFairBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline">04 · {t.verifyPrivateTitle}</p><h3>{t.verifyPrivateTitle}</h3><p className="record-kind">{t.verifyPrivateBody}</p></div></article>
        </div>
      </section>

      <section className="records-section guide-section-anchor" aria-labelledby="level-title">
        <div className="records-heading">
          <div><p className="eyebrow"><span /> {t.levelEyebrow}</p><h2 id="level-title">{t.levelTitle}</h2><p>{t.levelBody}</p></div>
        </div>
        <div className="record-list">
          <article className="record-list-card"><div><p className="card-topline">01 · {t.levelThresholdsTitle}</p><h3>{t.levelThresholdsTitle}</h3><p className="record-kind">{t.levelThresholdsBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline">02 · {t.levelBadgeTitle}</p><h3>{t.levelBadgeTitle}</h3><p className="record-kind">{t.levelBadgeBody}</p></div></article>
          <article className="record-list-card"><div><p className="card-topline">03 · {t.levelRecognitionTitle}</p><h3>{t.levelRecognitionTitle}</h3><p className="record-kind">{t.levelRecognitionBody}</p></div></article>
        </div>
      </section>

      <section id="guide-data" className="correction-section guide-section-anchor" aria-labelledby="open-data-title">
        <div>
          <p className="eyebrow"><span /> {t.dataEyebrow}</p>
          <h2 id="open-data-title">{t.dataTitle}</h2>
          <p>{t.dataBody}</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- download API, non navigazione: <Link> non gestisce la query di export */}
          <div className="data-actions"><a href="/api/cameras?format=geojson">{t.downloadGeoJson} <span aria-hidden="true">→</span></a><span>·</span><a href="/api/cameras?format=csv">{t.downloadCsv} <span aria-hidden="true">→</span></a></div>
        </div>
        <div className="correction-form">
          <div><p className="card-topline">GeoJSON</p><h3>{t.geoJsonTitle}</h3><p>{t.geoJsonBody}</p></div>
          <div><p className="card-topline">OpenStreetMap</p><h3>{t.osmTitle}</h3><p>{t.osmBody}</p></div>
          <div><p className="card-topline">{t.localLabel}</p><h3>{t.localTitle}</h3><p>{t.localBody}</p></div>
        </div>
      </section>
    </InfoPage>
  );
}
