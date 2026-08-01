"use client";

import { LocaleToggle, useMessages } from "../components/LocaleProvider";
import Link from "next/link";

/**
 * Public "How moderation works" page (/moderazione).
 *
 * Explains the review flow, appeals and corrections, and the moderator
 * safeguards, sourced from docs/MODERATION.md and ADR 0014. This is the
 * PUBLIC informational page; the private moderator queue stays at
 * /moderation (gated at the worker edge) and is deliberately not linked
 * anywhere in the public experience (publication-boundaries suite).
 *
 * Layout follows the shared informational-page pattern (nav-shell +
 * record-page), and the global footer is rendered by the root layout —
 * it is NOT repeated here (SITEMAP: "footer mai copiato per pagina").
 */
export default function ModerazionePage() {
  const bundle = useMessages();
  const t = bundle.moderazione;

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
        <Link className="button button-primary" href="/#correction">{t.correctionCta} <span aria-hidden="true">→</span></Link>
        <Link className="button detail-outline" href="/#map">{t.exploreMapCta}</Link>
      </div>
    </article>

    <section className="report-section" aria-labelledby="flow-title">
      <div>
        <p className="eyebrow"><span /> {t.flowEyebrow}</p>
        <h2 id="flow-title">{t.flowTitle}</h2>
        <p>{t.flowBody}</p>
      </div>
      <div className="report-form" aria-label={t.flowEyebrow}>
        <div><p className="card-topline">01 · {t.stepReceiveTitle}</p><h3>{t.stepReceiveTitle}</h3><p>{t.stepReceiveBody}</p></div>
        <div><p className="card-topline">02 · {t.stepScreenTitle}</p><h3>{t.stepScreenTitle}</h3><p>{t.stepScreenBody}</p></div>
        <div><p className="card-topline">03 · {t.stepVerifyTitle}</p><h3>{t.stepVerifyTitle}</h3><p>{t.stepVerifyBody}</p></div>
        <div><p className="card-topline">04 · {t.stepMinimiseTitle}</p><h3>{t.stepMinimiseTitle}</h3><p>{t.stepMinimiseBody}</p></div>
        <div><p className="card-topline">05 · {t.stepDecideTitle}</p><h3>{t.stepDecideTitle}</h3><p>{t.stepDecideBody}</p></div>
        <div><p className="card-topline">06 · {t.stepMaintainTitle}</p><h3>{t.stepMaintainTitle}</h3><p>{t.stepMaintainBody}</p></div>
      </div>
    </section>

    <section className="records-section" aria-labelledby="appeals-title">
      <div className="records-heading">
        <div><p className="eyebrow"><span /> {t.appealsEyebrow}</p><h2 id="appeals-title">{t.appealsTitle}</h2><p>{t.appealsBody}</p></div>
      </div>
      <div className="record-list">
        <article className="record-list-card"><div><p className="card-topline">{t.outcomeUpheldTitle}</p><h3>{t.outcomeUpheldTitle}</h3><p className="record-kind">{t.outcomeUpheldBody}</p></div></article>
        <article className="record-list-card"><div><p className="card-topline">{t.outcomeDismissedTitle}</p><h3>{t.outcomeDismissedTitle}</h3><p className="record-kind">{t.outcomeDismissedBody}</p></div></article>
        <article className="record-list-card"><div><p className="card-topline">{t.outcomeEscalatedTitle}</p><h3>{t.outcomeEscalatedTitle}</h3><p className="record-kind">{t.outcomeEscalatedBody}</p></div></article>
      </div>
      <div className="report-rule"><b>{t.urgentTitle}</b><br />{t.urgentBody}<br /><br /><b>{t.slaTitle}</b><br />{t.slaBody}</div>
    </section>

    <section className="correction-section" aria-labelledby="safeguards-title">
      <div>
        <p className="eyebrow"><span /> {t.safeguardsEyebrow}</p>
        <h2 id="safeguards-title">{t.safeguardsTitle}</h2>
        <p>{t.safeguardsBody}</p>
        <div className="report-rule"><b>{t.notDashboardTitle}</b><br />{t.notDashboardBody}</div>
      </div>
      <div className="report-form" aria-label={t.safeguardsEyebrow}>
        <div><p className="card-topline">01 · {t.safeguardPairTitle}</p><h3>{t.safeguardPairTitle}</h3><p>{t.safeguardPairBody}</p></div>
        <div><p className="card-topline">02 · {t.safeguardEscalationTitle}</p><h3>{t.safeguardEscalationTitle}</h3><p>{t.safeguardEscalationBody}</p></div>
        <div><p className="card-topline">03 · {t.safeguardCredentialsTitle}</p><h3>{t.safeguardCredentialsTitle}</h3><p>{t.safeguardCredentialsBody}</p></div>
        <div><p className="card-topline">04 · {t.safeguardTrainingTitle}</p><h3>{t.safeguardTrainingTitle}</h3><p>{t.safeguardTrainingBody}</p></div>
        <div><p className="card-topline">05 · {t.safeguardAuditTitle}</p><h3>{t.safeguardAuditTitle}</h3><p>{t.safeguardAuditBody}</p></div>
      </div>
    </section>
  </main>;
}
