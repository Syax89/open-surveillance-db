import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";
import { getServerMessages } from "../lib/server-i18n";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const t = bundle.faq;
  return {
    title: t.title,
    description: t.intro,
    openGraph: { title: t.title, description: t.intro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: t.title, description: t.intro, images: ["/og.png"] },
  };
}

export default async function FaqPage() {
  const bundle = await getServerMessages();
  const t = bundle.faq;

  return (
    <InfoPage
      navLabel={t.navigation}
      homeLabel={t.homeAria}
      navLinks={
        <>
          <Link href="/#map">{t.map}</Link>
          <Link href="/#records">{t.directory}</Link>
          <Link href="/contatti">{t.contactLabel}</Link>
          <Link className="nav-action" href="/">{t.home}</Link>
        </>
      }
      eyebrow={t.eyebrow}
      title={t.title}
      intro={t.intro}
      actions={
        <>
          <Link className="button button-primary" href="/#correction">{t.correctionCta} <span aria-hidden="true">→</span></Link>
          <Link className="button detail-outline" href="/contatti">{t.contactCta}</Link>
        </>
      }
    >
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
        <details className="faq-item">
          <summary>{t.qAccount}</summary>
          <p>{t.aAccount}</p>
        </details>
        <details className="faq-item">
          <summary>{t.qVerifications}</summary>
          <p>{t.aVerifications}</p>
        </details>
        <details className="faq-item">
          <summary>{t.qEdit}</summary>
          <p>{t.aEdit}</p>
        </details>
        <details className="faq-item">
          <summary>{t.qLevels}</summary>
          <p>{t.aLevels}</p>
        </details>
        <details className="faq-item">
          <summary>{t.qDeleteAccount}</summary>
          <p>{t.aDeleteAccount}</p>
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
    </InfoPage>
  );
}
