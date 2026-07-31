import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LocaleProvider } from "./components/LocaleProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  ...(process.env.NEXT_PUBLIC_SITE_URL
    ? { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL) }
    : {}),
  title: "OpenSurveillanceDB — Public data about public surveillance",
  description: "An open, community-maintained database of public surveillance cameras.",
  openGraph: {
    title: "OpenSurveillanceDB",
    description: "Public data about public surveillance.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenSurveillanceDB",
    description: "Public data about public surveillance.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Relative href on purpose: metadata icons would be resolved against
            metadataBase (or the localhost fallback), which breaks the favicon
            on deployments where NEXT_PUBLIC_SITE_URL is unset. */}
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
