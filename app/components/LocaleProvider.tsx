"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { messages } from "../lib/i18n";
import type { Locale, MessageBundle } from "../lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const storageKey = "opensurveillancedb-locale";
const localeChangeEvent = "opensurveillancedb-locale-change";

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
  const common = messages[locale].common;
  return <div className="locale-toggle" aria-label={common.languageSelection}>
    <button type="button" className={locale === "en" ? "is-active" : ""} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
    <button type="button" className={locale === "it" ? "is-active" : ""} aria-pressed={locale === "it"} onClick={() => setLocale("it")}>IT</button>
  </div>;
}
