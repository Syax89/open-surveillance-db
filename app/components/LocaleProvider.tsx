"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LOCALE_COOKIE, messages } from "../lib/i18n";
import type { Locale, MessageBundle } from "../lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
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
  if (typeof window === "undefined") return "en";
  const savedLocale = window.localStorage.getItem(storageKey);
  return savedLocale === "en" || savedLocale === "it" ? savedLocale : "en";
}

function subscribeToLocale(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(localeChangeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(localeChangeEvent, callback);
  };
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeToLocale, readStoredLocale, () => "en" as Locale);

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

  const common = messages[locale].common;

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

/** Typed message bundle for the current locale (English pilot, Italian parity). */
export function useMessages(): MessageBundle {
  const { locale } = useLocale();
  return messages[locale];
}

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const common = messages[locale].common;

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
    <button type="button" className={locale === "en" ? "is-active" : ""} aria-pressed={locale === "en"} onClick={() => changeLocale("en")}>EN</button>
    <button type="button" className={locale === "it" ? "is-active" : ""} aria-pressed={locale === "it"} onClick={() => changeLocale("it")}>IT</button>
  </div>;
}
