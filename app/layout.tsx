import type { Metadata } from "next";
import { LocaleProvider } from "./components/LocaleProvider";
import { LegacyAnchorRedirect } from "./components/LegacyAnchorRedirect";
import { SiteFooter } from "./components/SiteFooter";
import { getServerLocale, getServerMessages } from "./lib/server-i18n";
import "./globals.css";

/**
 * Root metadata, localized from the locale cookie (ADR 0015).
 *
 * This is the fallback <title>/<description> for every route without its own
 * generateMetadata (home, records, auth pages). The informational pages
 * define their own per-route metadata. Without a cookie the server renders
 * the pilot language (English, ADR 0007) — which is also what crawlers see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const title = bundle.common.metaTitle;
  const description = bundle.common.metaDescription;
  // F6 qa#5 (t_ab0d4c75): metadataBase is intentionally conditional — the
  // repo convention (docs/DEPLOYMENT.md "Environment variables") forbids an
  // absolute-URL fallback that would leak `localhost` into metadata on
  // deployments without a public domain. When NEXT_PUBLIC_SITE_URL IS set,
  // Next resolves the relative "/og.png" below against metadataBase, so
  // og:image/twitter:image become absolute automatically. The regenerated
  // asset is 1200x630 / ~163 KiB (from 1,626,075 B) — within the social
  // preview weight budget.
  return {
    ...(process.env.NEXT_PUBLIC_SITE_URL
      ? { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL) }
      : {}),
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "OpenSurveillanceDB — public data about public surveillance",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-rendered <html lang> from the persisted preference: the first
  // paint already matches the user's language (no EN->IT flash) and the
  // attribute is correct before any client JavaScript runs. The client
  // LocaleProvider effect keeps it in sync on client-side switches. The same
  // server locale seeds LocaleProvider's SSR snapshot, so client islands
  // rendered by the server (SiteFooter, skip link, toggle active state) also
  // match the cookie locale instead of always being English (QA-2026-08-01-1).
  const locale = await getServerLocale();

  return (
    <html lang={locale}>
      <head>
        {/* Relative href on purpose: metadata icons would be resolved against
            metadataBase (or the localhost fallback), which breaks the favicon
            on deployments where NEXT_PUBLIC_SITE_URL is unset. */}
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body className="antialiased">
        <LocaleProvider serverLocale={locale}>
          {/* F3 t_2ca69725: legacy tool anchors (#map #records #report
              #correction) redirect client-side to the tool routes. Mounted
              in the root layout so the redirect works from any page the
              bookmark lands on; SSR renders nothing (progressive
              enhancement, CTO t_f24c3227). */}
          <LegacyAnchorRedirect />
          {children}
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
