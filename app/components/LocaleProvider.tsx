"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "en" | "it";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const storageKey = "opensurveillancedb-locale";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(storageKey);
    if (savedLocale === "en" || savedLocale === "it") setLocaleState(savedLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale(nextLocale: Locale) {
      setLocaleState(nextLocale);
      window.localStorage.setItem(storageKey, nextLocale);
    },
  }), [locale]);

  return <LocaleContext.Provider value={value}>
    <a className="skip-link" href="#main-content">{locale === "it" ? "Vai al contenuto principale" : "Skip to main content"}</a>
    {children}
  </LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  return <div className="locale-toggle" aria-label={locale === "it" ? "Selezione lingua" : "Language selection"}>
    <button type="button" className={locale === "en" ? "is-active" : ""} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
    <button type="button" className={locale === "it" ? "is-active" : ""} aria-pressed={locale === "it"} onClick={() => setLocale("it")}>IT</button>
  </div>;
}
