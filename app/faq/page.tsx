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
      eyebrow={t.eyebrow}
      title={t.title}
      intro={t.intro}
      actions={
        <>
          <Link className="button button-primary" href="/correggi">{t.correctionCta} <span aria-hidden="true">→</span></Link>
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
          <summary>{t.qAccount}</summary>
          <p>{t.aAccount}</p>
        </details>
      </section>

      <section className="faq-resources" aria-labelledby="faq-more-title">
        <div className="faq-resources-heading">
          <p className="eyebrow"><span /> {t.eyebrow}</p>
          <h2 id="faq-more-title">{t.moreTitle}</h2>
          <p>{t.moreBody}</p>
        </div>
        <div className="faq-resource-links">
          <Link href="/guide">{t.guideCta} <span aria-hidden="true">→</span></Link>
          <Link href="/regole">{t.rulesCta} <span aria-hidden="true">→</span></Link>
          <Link href="/privacy">{t.privacyCta} <span aria-hidden="true">→</span></Link>
          <Link href="/correggi">{t.correctionCta} <span aria-hidden="true">→</span></Link>
          <Link href="/contatti">{t.contactCta} <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </InfoPage>
  );
}
