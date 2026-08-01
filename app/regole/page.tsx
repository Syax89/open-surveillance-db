import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";
import { getServerMessages } from "../lib/server-i18n";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const t = bundle.rules;
  return {
    title: t.title,
    description: t.intro,
    openGraph: { title: t.title, description: t.intro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: t.title, description: t.intro, images: ["/og.png"] },
  };
}

export default async function RulesPage() {
  const bundle = await getServerMessages();
  const t = bundle.rules;

  return (
    <InfoPage
      navLabel={t.navigation}
      homeLabel={t.homeAria}
      navLinks={
        <>
          <Link href="/#map">{t.map}</Link>
          <Link href="/#records">{t.directory}</Link>
          <Link href="/guide">{t.guide}</Link>
          <Link className="nav-action" href="/">{t.home}</Link>
        </>
      }
      eyebrow={t.eyebrow}
      title={t.title}
      intro={t.intro}
      actions={
        <>
          <Link className="button button-primary" href="/#report">{t.reportEyebrow} <span aria-hidden="true">↘</span></Link>
          <Link className="button detail-outline" href="/#records">{t.directory}</Link>
        </>
      }
    >
      <section className="principles" aria-labelledby="eligible-title">
        <div className="principles-intro">
          <p className="eyebrow"><span /> {t.reportEyebrow}</p>
          <h2 id="eligible-title">{t.reportTitle}</h2>
          <p>{t.reportBody}</p>
        </div>
        <div className="principles-grid">
          <article><span>01</span><h3>{t.eligibleOneTitle}</h3><p>{t.eligibleOneBody}</p></article>
          <article><span>02</span><h3>{t.eligibleTwoTitle}</h3><p>{t.eligibleTwoBody}</p></article>
          <article><span>03</span><h3>{t.eligibleThreeTitle}</h3><p>{t.eligibleThreeBody}</p></article>
        </div>
      </section>

      <section className="report-section" aria-labelledby="never-title">
        <div>
          <h2 id="never-title">{t.neverTitle}</h2>
          <p>{t.neverBody}</p>
          <div className="report-rule"><b>{t.beforeSubmittingTitle}</b><br />{t.beforeSubmittingBody}</div>
        </div>
        <div className="report-form" aria-label={t.neverTitle}>
          <div><p className="card-topline">01 · {t.neverOneTitle}</p><h3>{t.neverOneBody}</h3></div>
          <div><p className="card-topline">02 · {t.neverTwoTitle}</p><h3>{t.neverTwoBody}</h3></div>
          <div><p className="card-topline">03 · {t.neverThreeTitle}</p><h3>{t.neverThreeBody}</h3></div>
          <div><p className="card-topline">04 · {t.neverFourTitle}</p><h3>{t.neverFourBody}</h3></div>
        </div>
      </section>

      <section className="records-section" aria-labelledby="moderation-title">
        <div className="records-heading">
          <div><p className="eyebrow"><span /> {t.moderationEyebrow}</p><h2 id="moderation-title">{t.moderationTitle}</h2><p>{t.moderationBody}</p></div>
        </div>
        <ol className="record-list" aria-label={t.flowLabel}>
          <li className="record-list-card"><div><p className="card-topline">01 · {t.flowOneTitle}</p><h3>{t.flowOneBody}</h3></div></li>
          <li className="record-list-card"><div><p className="card-topline">02 · {t.flowTwoTitle}</p><h3>{t.flowTwoBody}</h3></div></li>
          <li className="record-list-card"><div><p className="card-topline">03 · {t.flowThreeTitle}</p><h3>{t.flowThreeBody}</h3></div></li>
          <li className="record-list-card"><div><p className="card-topline">04 · {t.flowFourTitle}</p><h3>{t.flowFourBody}</h3></div></li>
          <li className="record-list-card"><div><p className="card-topline">05 · {t.flowFiveTitle}</p><h3>{t.flowFiveBody}</h3></div></li>
          <li className="record-list-card"><div><p className="card-topline">06 · {t.flowSixTitle}</p><h3>{t.flowSixBody}</h3></div></li>
        </ol>
      </section>

      <section className="correction-section" aria-labelledby="correction-title">
        <div>
          <p className="eyebrow"><span /> {t.correctionEyebrow}</p>
          <h2 id="correction-title">{t.correctionTitle}</h2>
          <p>{t.correctionBody}</p>
        </div>
        <div className="correction-form">
          <div><p className="card-topline">01</p><h3>{t.correctionOneTitle}</h3><p>{t.correctionOneBody}</p></div>
          <div><p className="card-topline">02</p><h3>{t.correctionTwoTitle}</h3><p>{t.correctionTwoBody}</p></div>
          <div><p className="card-topline">03</p><h3>{t.correctionThreeTitle}</h3><p>{t.correctionThreeBody}</p></div>
        </div>
      </section>

      <section className="correction-section" aria-labelledby="data-title">
        <div>
          <p className="eyebrow"><span /> {t.dataEyebrow}</p>
          <h2 id="data-title">{t.dataTitle}</h2>
          <p>{t.dataBody}</p>
          <div className="data-actions"><a href="/api/cameras?format=geojson">{t.downloadGeoJson} <span aria-hidden="true">→</span></a><span>·</span><a href="/api/cameras?format=csv">{t.downloadCsv} <span aria-hidden="true">→</span></a></div>
        </div>
        <div className="correction-form">
          <div><p className="card-topline">GeoJSON</p><h3>{t.reuseOneTitle}</h3><p>{t.reuseOneBody}</p></div>
          <div><p className="card-topline">OpenStreetMap</p><h3>{t.reuseTwoTitle}</h3><p>{t.reuseTwoBody}</p></div>
          <div><p className="card-topline">{t.guide}</p><h3>{t.reuseThreeTitle}</h3><p>{t.reuseThreeBody}</p></div>
        </div>
      </section>
    </InfoPage>
  );
}
