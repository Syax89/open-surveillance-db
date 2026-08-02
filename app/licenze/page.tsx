import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";
import { legalMessages } from "../lib/legal";
import { getServerLocale, getServerMessages } from "../lib/server-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const content = legalMessages[locale].licenses;
  return {
    title: content.title,
    description: content.intro,
    openGraph: { title: content.title, description: content.intro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: content.title, description: content.intro, images: ["/og.png"] },
  };
}

export default async function LicencesPage() {
  const [locale, bundle] = await Promise.all([getServerLocale(), getServerMessages()]);
  const home = bundle.home;
  return <LegalPage
    content={legalMessages[locale].licenses}
    navLabels={{
      mainNavigation: home.mainNavigation,
      homeAria: home.homeAria,
    }}
  />;
}
