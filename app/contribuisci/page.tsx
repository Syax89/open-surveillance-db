import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";
import { getServerMessages } from "../lib/server-i18n";

/** External targets (CEO decision 2026-08-08: the two support channels). */
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/syax89";
const GITHUB_URL = "https://github.com/Syax89/open-surveillance-db";

/**
 * /contribuisci — support the project (CEO 2026-08-08).
 *
 * Static SSR page in the shared InfoPage shell, reachable from the header
 * nav (4th PublicNavLinks voice). Two coherent-box CTA cards, both plain
 * external links (target=_blank, rel=noopener): Buy Me a Coffee (donation)
 * and GitHub (source code). No form, no tracking, no login — copy only,
 * sober civic-tech tone. Metadata follows the same generateMetadata
 * pattern as /faq and /api-docs.
 */
export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const content = bundle.contribuisci;
  return {
    title: content.title,
    description: content.intro,
    openGraph: { title: content.title, description: content.intro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: content.title, description: content.intro, images: ["/og.png"] },
  };
}

export default async function ContribuisciPage() {
  const bundle = await getServerMessages();
  const t = bundle.contribuisci;

  return (
    <InfoPage
      navLabel={t.navigation}
      homeLabel={t.homeAria}
      eyebrow={t.eyebrow}
      title={t.title}
      intro={t.intro}
    >
      <div className="contribuisci-page">
        <section className="contribuisci-section" aria-labelledby="contribuisci-ways-title">
          <div className="contribuisci-section-head">
            <p className="eyebrow"><span /> {t.waysEyebrow}</p>
            <h2 id="contribuisci-ways-title">{t.waysTitle}</h2>
            <p>{t.waysIntro}</p>
          </div>

          <div className="contribuisci-grid">
            <article className="contribuisci-card">
              <h3>{t.coffeeTitle}</h3>
              <p>{t.coffeeBody}</p>
              <a
                className="button button-primary contribuisci-cta"
                href={BUY_ME_A_COFFEE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.coffeeCta} <span aria-hidden="true">↗</span>
              </a>
            </article>

            <article className="contribuisci-card">
              <h3>{t.githubTitle}</h3>
              <p>{t.githubBody}</p>
              <a
                className="button detail-outline contribuisci-cta"
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.githubCta} <span aria-hidden="true">↗</span>
              </a>
            </article>
          </div>
        </section>

        <p className="contribuisci-footnote">{t.footnote}</p>
      </div>
    </InfoPage>
  );
}
