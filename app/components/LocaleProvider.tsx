"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { en as commonEn, it as commonIt } from "../lib/i18n/common";
// Light import path (F5 qa#5, t_ab0d4c75): registry/cookie constants live
// in types.ts, NOT in the index barrel that assembles the full two-locale
// dictionary. Importing them from here would pull ~150 KB of messages
// into the root chunk.
import { DEFAULT_LOCALE, LOCALE_COOKIE, SUPPORTED_LOCALES, resolveLocale, type Locale, type LocaleInfo } from "../lib/i18n/types";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

/**
 * Locale context — exported for standalone roots OUTSIDE the Next tree (the
 * map popup action widget, lib/popup-actions): those roots render without a
 * LocaleProvider, so the widget reads the context directly and falls back to
 * the pre-resolved bundle prop instead of crashing (useMessages/useLocale
 * throw by design — see CommunityActions `bundle` prop).
 */
export const LocaleContext = createContext<LocaleContextValue | null>(null);
const storageKey = "opensurveillancedb-locale";
const localeChangeEvent = "opensurveillancedb-locale-change";

/**
 * Routes rendered as Server Components with per-route metadata (SSR/SEO,
 * task t_c36fe96c). On these routes the page text is produced by the server
 * from the locale cookie, so switching language must re-render the route
 * server-side (router.refresh()) instead of only updating the client context.
 * The cookie write happens in setLocale below; the refresh here.
 */
const SERVER_RENDERED_INFO_ROUTES = new Set([
  "/guide",
  "/manifesto",
  "/regole",
  "/faq",
  "/contatti",
  "/moderazione",
  "/privacy",
  "/termini",
  "/licenze",
]);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const savedLocale = window.localStorage.getItem(storageKey);
  if (savedLocale !== null) return resolveLocale(savedLocale);
  // Cookie fallback (F6 qa#8, audit 2026-08-09): when the user arrives via
  // /api/locale?lang=it&next=/mappa, the SSR renders Italian (reads the cookie)
  // but the client would hydrate English (localStorage empty) without this.
  // Same read pattern as popup-actions.tsx standalone roots.
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  return match
    ? resolveLocale(decodeURIComponent(match.slice(LOCALE_COOKIE.length + 1)))
    : resolveLocale(null);
}

function subscribeToLocale(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(localeChangeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(localeChangeEvent, callback);
  };
}

/**
 * Root-layout strings, scoped to the `common` domain only (F5 qa#5,
 * t_ab0d4c75): the root shell renders the skip link and the toggle
 * labels, and must NOT import the full two-locale dictionary — that stays
 * in route chunks via useMessages() (app/lib/use-messages.ts). Adding a
 * language means adding its common domain here next to the registry line.
 */
const commonByLocale = {
  en: commonEn,
  it: commonIt,
} as const;

export function LocaleProvider({
  children,
  serverLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  /**
   * Locale resolved server-side from the `opensurveillancedb-locale` cookie
   * (app/lib/server-i18n.ts, root layout). Used as the SSR snapshot of
   * useSyncExternalStore so client islands (SiteFooter, skip link, toggle
   * state) render the right language on first paint — fixing the EN footer
   * inside Italian SSR HTML (QA-2026-08-01-1). After hydration the client
   * snapshot (localStorage) takes over, exactly like before.
   */
  serverLocale?: Locale;
}) {
  const locale = useSyncExternalStore(subscribeToLocale, readStoredLocale, () => serverLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale(nextLocale: Locale) {
      window.localStorage.setItem(storageKey, nextLocale);
      // Mirror the preference to a cookie so Server Components can render the
      // right bundle (and <html lang>) on the next request. Privacy by design:
      // a pure interface-locale preference, no personal data (LOCALE_COOKIE).
      document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
      window.dispatchEvent(new Event(localeChangeEvent));
    },
  }), [locale]);

  const common = commonByLocale[locale];

  return <LocaleContext.Provider value={value}>
    <a className="skip-link" href="#main-content">{common.skipLink}</a>
    {children}
  </LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}

/**
 * Language switcher.
 *
 * The buttons are GENERATED from the locale registry (SUPPORTED_LOCALES):
 * one button per registered language, labelled with the registry label.
 * Adding a language to the registry automatically adds its button — no
 * hardcoded EN/IT pair. The `locales` prop exists for previews/demos and
 * lets tests exercise the toggle with a 3+-language mock registry.
 */
export function LocaleToggle({ locales = SUPPORTED_LOCALES }: { locales?: readonly LocaleInfo[] }) {
  const { locale, setLocale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const common = commonByLocale[locale];

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    // On server-rendered info routes the page text comes from the server:
    // refresh the route so it re-renders with the new cookie. On client
    // pages the context update above is enough; the refresh would be a no-op.
    if (pathname && SERVER_RENDERED_INFO_ROUTES.has(pathname)) {
      router.refresh();
    }
  };

  return <div className="locale-toggle" aria-label={common.languageSelection}>
    {locales.map(({ code, label }) => (
      <button
        key={code}
        type="button"
        className={locale === code ? "is-active" : ""}
        aria-pressed={locale === code}
        onClick={() => changeLocale(code)}
      >{label}</button>
    ))}
  </div>;
}
