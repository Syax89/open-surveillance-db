"use client";

import { LocaleToggle, useMessages } from "../components/LocaleProvider";
import Link from "next/link";

const SECURITY_ADVISORY_URL =
  "https://github.com/Syax89/open-surveillance-db/security/advisories/new";

export default function ContactPage() {
  const bundle = useMessages();
  const t = bundle.contact;

  return <main id="main-content" className="record-page">
    <nav className="nav-shell" aria-label={t.navigation}>
      <Link className="brand" href="/" aria-label={t.homeAria}><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></Link>
      <div className="nav-links">
        <Link href="/#map">{t.map}</Link>
        <Link href="/#records">{t.directory}</Link>
        <Link href="/faq">{t.faqLabel}</Link>
        <Link className="nav-action" href="/">{t.home}</Link>
      </div>
      <LocaleToggle />
    </nav>

    <article className="record-detail">
      <p className="eyebrow"><span /> {t.eyebrow}</p>
      <h1>{t.title}</h1>
      <p className="record-detail-summary">{t.intro}</p>
      <div className="record-detail-actions">
        <Link className="button button-primary" href="/#correction">{t.correctionForm} <span aria-hidden="true">→</span></Link>
        <Link className="button detail-outline" href="/faq">{t.faqLabel}</Link>
      </div>
    </article>

    <section className="records-section" aria-labelledby="who-title">
      <div className="records-heading">
        <div><p className="eyebrow"><span /> {t.eyebrow}</p><h2 id="who-title">{t.whoTitle}</h2><p>{t.whoBody}</p></div>
      </div>
      <div className="record-detail-list">
        <dl>
          <div><dt>{t.rolesTitle}</dt><dd>{t.rolesIntro}</dd></div>
          <div><dt>{t.roleMaintainers}</dt><dd>{t.roleMaintainersBody}</dd></div>
          <div><dt>{t.roleOps}</dt><dd>{t.roleOpsBody}</dd></div>
          <div><dt>{t.roleData}</dt><dd>{t.roleDataBody}</dd></div>
          <div><dt>{t.roleSecurity}</dt><dd>{t.roleSecurityBody}</dd></div>
          <div><dt>{t.roleModeration}</dt><dd>{t.roleModerationBody}</dd></div>
          <div><dt>{t.controllerTitle}</dt><dd>{t.controllerBody}</dd></div>
        </dl>
      </div>
    </section>

    <section className="correction-section" aria-labelledby="correction-contact-title">
      <div>
        <p className="eyebrow"><span /> {t.eyebrow}</p>
        <h2 id="correction-contact-title">{t.correctionTitle}</h2>
        <p>{t.correctionBody}</p>
        <div className="data-actions"><Link href="/#correction">{t.correctionForm} <span aria-hidden="true">→</span></Link><span>·</span><a href={`mailto:${t.correctionEmail}`}>{t.correctionEmail}</a></div>
        <div className="report-rule"><b>{t.correctionEmail}</b><br />{t.correctionEmailNote}</div>
      </div>
    </section>

    <section className="report-section" aria-labelledby="security-title">
      <div>
        <p className="eyebrow"><span /> {t.eyebrow}</p>
        <h2 id="security-title">{t.securityTitle}</h2>
        <p>{t.securityBody}</p>
        <div className="data-actions"><a href={SECURITY_ADVISORY_URL} target="_blank" rel="noreferrer">{t.securityAdvisory} <span aria-hidden="true">→</span></a></div>
      </div>
      <div className="report-form" aria-label={t.securityPgpTitle}>
        <div><p className="card-topline">{t.securityPgpTitle}</p><p>{t.securityPgpBody}</p></div>
        <div className="report-rule"><b>{t.securityRouteNote}</b></div>
      </div>
    </section>

    <footer>
      <div className="brand"><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></div>
      <p>{t.footer}</p>
      <div className="footer-links"><Link href="/">{t.home}</Link><Link href="/#map">{t.map}</Link><Link href="/#records">{t.directory}</Link><Link href="/faq">{t.faqLabel}</Link></div>
    </footer>
  </main>;
}
