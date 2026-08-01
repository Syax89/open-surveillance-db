"use client";

import { LocaleToggle, useMessages } from "../components/LocaleProvider";
import Link from "next/link";

export default function GuidePage() {
  const bundle = useMessages();
  const t = bundle.guide;
  const statuses: Record<string, string> = bundle.status;

  return <main id="main-content" className="record-page">
    <nav className="nav-shell" aria-label={t.navigation}>
      <Link className="brand" href="/" aria-label={t.homeAria}><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></Link>
      <div className="nav-links">
        <Link href="/#map">{t.map}</Link>
        <Link href="/#records">{t.directory}</Link>
        <Link href="/faq">{bundle.faq.faqLabel}</Link>
        <Link href="/contatti">{bundle.contact.contactLabel}</Link>
        <Link href="/manifesto">{t.manifesto}</Link>
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
        <article className="record-list-card"><div><p className="card-topline"><span className="status-dot verified" /> {statuses.verified}</p><h3>{t.verifiedTitle}</h3><p className="record-kind">{t.verifiedBody}</p></div></article>
        <article className="record-list-card"><div><p className="card-topline"><span className="status-dot needs-review" /> {statuses.needs_review}</p><h3>{t.reviewTitle}</h3><p className="record-kind">{t.reviewBody}</p></div></article>
        <article className="record-list-card"><div><p className="card-topline"><span className="status-dot community-report" /> {statuses.pending}</p><h3>{t.pendingTitle}</h3><p className="record-kind">{t.pendingBody}</p></div></article>
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

  </main>;
}
