"use client";

import { LocaleToggle, useMessages } from "../components/LocaleProvider";
import Link from "next/link";

export default function ManifestoPage() {
  const bundle = useMessages();
  const t = bundle.manifesto;

  return <main id="main-content" className="record-page">
    <nav className="nav-shell" aria-label={t.navigation}>
      <Link className="brand" href="/" aria-label={t.homeAria}><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></Link>
      <div className="nav-links">
        <Link href="/#map">{t.map}</Link>
        <Link href="/#records">{t.directory}</Link>
        <Link href="/guide">{t.guide}</Link>
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
        <Link className="button button-quiet detail-outline" href="/#records">{t.browseDirectory}</Link>
        <Link className="button button-quiet detail-outline" href="/guide">{t.readGuide}</Link>
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

    <section className="principles" aria-labelledby="principles-title">
      <div className="principles-intro">
        <p className="eyebrow"><span /> {t.principlesEyebrow}</p>
        <h2 id="principles-title">{t.principlesTitle}</h2>
        <p>{t.principlesIntro}</p>
      </div>
      <div className="principles-grid">
        <article><span>01</span><h3>{t.principleOneTitle}</h3><p>{t.principleOneBody}</p></article>
        <article><span>02</span><h3>{t.principleTwoTitle}</h3><p>{t.principleTwoBody}</p></article>
        <article><span>03</span><h3>{t.principleThreeTitle}</h3><p>{t.principleThreeBody}</p></article>
        <article><span>04</span><h3>{t.principleFourTitle}</h3><p>{t.principleFourBody}</p></article>
        <article><span>05</span><h3>{t.principleFiveTitle}</h3><p>{t.principleFiveBody}</p></article>
      </div>
    </section>

    <section className="records-section" aria-labelledby="non-goals-title">
      <div className="records-heading">
        <div><p className="eyebrow"><span /> {t.nonGoalsEyebrow}</p><h2 id="non-goals-title">{t.nonGoalsTitle}</h2><p>{t.nonGoalsBody}</p></div>
      </div>
      <div className="record-list">
        <article className="record-list-card"><div><p className="card-topline">01</p><h3>{t.nonGoalFeedsTitle}</h3><p className="record-kind">{t.nonGoalFeedsBody}</p></div></article>
        <article className="record-list-card"><div><p className="card-topline">02</p><h3>{t.nonGoalTrackingTitle}</h3><p className="record-kind">{t.nonGoalTrackingBody}</p></div></article>
        <article className="record-list-card"><div><p className="card-topline">03</p><h3>{t.nonGoalBypassTitle}</h3><p className="record-kind">{t.nonGoalBypassBody}</p></div></article>
        <article className="record-list-card"><div><p className="card-topline">04</p><h3>{t.nonGoalPrivateTitle}</h3><p className="record-kind">{t.nonGoalPrivateBody}</p></div></article>
      </div>
    </section>

    <section className="correction-section" aria-labelledby="publish-title">
      <div>
        <p className="eyebrow"><span /> {t.publishEyebrow}</p>
        <h2 id="publish-title">{t.publishTitle}</h2>
        <p>{t.publishBody}</p>
      </div>
      <div className="correction-form">
        <div><p className="card-topline">{t.publishedTitle}</p><ul className="manifesto-list"><li>{t.publishedItemOne}</li><li>{t.publishedItemTwo}</li><li>{t.publishedItemThree}</li></ul></div>
        <div><p className="card-topline">{t.neverPublishedTitle}</p><ul className="manifesto-list"><li>{t.neverPublishedItemOne}</li><li>{t.neverPublishedItemTwo}</li><li>{t.neverPublishedItemThree}</li><li>{t.neverPublishedItemFour}</li></ul></div>
      </div>
    </section>

  </main>;
}
