"use client";

import { LocaleToggle, useMessages } from "../components/LocaleProvider";
import Link from "next/link";

export default function FaqPage() {
  const bundle = useMessages();
  const t = bundle.faq;

  return <main id="main-content" className="record-page">
    <nav className="nav-shell" aria-label={t.navigation}>
      <Link className="brand" href="/" aria-label={t.homeAria}><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></Link>
      <div className="nav-links">
        <Link href="/#map">{t.map}</Link>
        <Link href="/#records">{t.directory}</Link>
        <Link href="/contatti">{t.contactLabel}</Link>
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
        <Link className="button detail-outline" href="/contatti">{t.contactCta}</Link>
      </div>
    </article>

    <section className="faq-section" aria-label={t.eyebrow}>
      <details className="faq-item" open>
        <summary>{t.qReport}</summary>
        <p>{t.aReport}</p>
      </details>
      <details className="faq-item">
        <summary>{t.qAccuracy}</summary>
        <p>{t.aAccuracy}</p>
      </details>
      <details className="faq-item">
        <summary>{t.qCorrect}</summary>
        <p>{t.aCorrect}</p>
      </details>
      <details className="faq-item">
        <summary>{t.qPrivacy}</summary>
        <p>{t.aPrivacy}</p>
      </details>
    </section>

    <section className="correction-section" aria-labelledby="faq-more-title">
      <div>
        <p className="eyebrow"><span /> {t.eyebrow}</p>
        <h2 id="faq-more-title">{t.moreTitle}</h2>
        <p>{t.moreBody}</p>
        <div className="data-actions">
          <Link href="/#correction">{t.correctionCta} <span aria-hidden="true">→</span></Link>
          <span>·</span>
          <Link href="/contatti">{t.contactCta} <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </section>

    <footer>
      <div className="brand"><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></div>
      <p>{t.footer}</p>
      <div className="footer-links"><Link href="/">{t.home}</Link><Link href="/#map">{t.map}</Link><Link href="/#records">{t.directory}</Link><Link href="/contatti">{t.contactLabel}</Link></div>
    </footer>
  </main>;
}
