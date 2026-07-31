"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type Locale = "en" | "it";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const storageKey = "opensurveillancedb-locale";

function getStoredLocale(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(storageKey);
}

function subscribeToLocaleStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const storedLocale = useSyncExternalStore(subscribeToLocaleStorage, getStoredLocale, () => null);
  const locale: Locale = storedLocale === "en" || storedLocale === "it" ? storedLocale : "en";

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale(nextLocale: Locale) {
      window.localStorage.setItem(storageKey, nextLocale);
      // The `storage` event only fires in other tabs; notify same-tab
      // subscribers so the locale switches immediately.
      window.dispatchEvent(new Event("storage"));
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
