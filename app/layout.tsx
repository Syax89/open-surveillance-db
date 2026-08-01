import type { Metadata } from "next";
import { LocaleProvider } from "./components/LocaleProvider";
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
  return {
    ...(process.env.NEXT_PUBLIC_SITE_URL
      ? { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL) }
      : {}),
    title,
    description,
    openGraph: {
      title,
      description,
      images: ["/og.png"],
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
  // LocaleProvider effect keeps it in sync on client-side switches.
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
        <LocaleProvider>
          {children}
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
