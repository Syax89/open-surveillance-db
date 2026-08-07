import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";
import { getServerMessages } from "../lib/server-i18n";
import Link from "next/link";

const SECURITY_ADVISORY_URL =
  "https://github.com/Syax89/open-surveillance-db/security/advisories/new";

export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const t = bundle.contact;
  return {
    title: t.title,
    description: t.intro,
    openGraph: { title: t.title, description: t.intro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: t.title, description: t.intro, images: ["/og.png"] },
  };
}

export default async function ContactPage() {
  const bundle = await getServerMessages();
  const t = bundle.contact;

  return (
    <InfoPage
      navLabel={t.navigation}
      homeLabel={t.homeAria}
      eyebrow={t.contactLabel}
      title={t.title}
      intro={t.intro}
      actions={
        <>
          <Link className="button button-primary" href="/correggi">{t.correctionForm} <span aria-hidden="true">→</span></Link>
          <Link className="button detail-outline" href="/faq">{t.faqLabel}</Link>
        </>
      }
    >
      <section className="correction-section" aria-labelledby="correction-contact-title">
        <div>
          <p className="eyebrow"><span /> {t.eyebrow}</p>
          <h2 id="correction-contact-title">{t.correctionTitle}</h2>
          <p>{t.correctionBody}</p>
          <div className="data-actions"><Link href="/correggi">{t.correctionForm} <span aria-hidden="true">→</span></Link><span>·</span><a href={`mailto:${t.correctionEmail}`}>{t.correctionEmail}</a></div>
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
    </InfoPage>
  );
}
