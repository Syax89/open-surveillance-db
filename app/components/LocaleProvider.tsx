"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { commonByLocale } from "../lib/i18n/common";
import { ThemeToggle } from "./ThemeToggle";
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
 * the pre-resolved bundle prop instead of crashing (useDomainMessages/useLocale
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
  "/",
  "/guide",
  "/manifesto",
  "/regole",
  "/faq",
  "/contatti",
  "/contribuisci",
  "/moderation",
  "/privacy",
  "/termini",
  "/licenze",
  "/accessibility",
  "/account",
  "/api-docs",
  "/fonti",
  "/forgot-password",
  "/login",
  "/register",
  "/reset-password",
  "/verify-email",
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
 * labels, and must NOT import the full two-locale dictionary: it imports
 * `commonByLocale` straight from the common domain file. Route chunks
 * likewise import only their own domains via useDomainMessages()
 * (app/lib/use-domain-messages.ts).
 */
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
      // Secure on https (the deployed site); plain http dev keeps working.
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax${secure}`;
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

  const menuRef = useRef<HTMLDetailsElement>(null);
  // Close the menu on Escape or on a pointerdown outside it (same contract
  // as the mobile nav sheet in PublicNav).
  useEffect(() => {
    const close = (event: Event) => {
      const menu = menuRef.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        menu.open = false;
        menu.querySelector("summary")?.focus();
        return;
      }
      if (!menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, []);

  const current = locales.find(({ code }) => code === locale) ?? locales[0];
  const nameOf = (info: LocaleInfo) => (info as { name?: string }).name || info.label;

  // Six languages no longer fit as a segmented control in the header: a
  // compact disclosure ("🌐 EN ▾") opens the list. The summary shows the
  // current code through CSS (data-current) so the only text nodes named
  // "EN"/"IT"… are the real language buttons (aria-pressed, lang).
  return <details className="locale-toggle" ref={menuRef}>
    <summary aria-label={`${common.languageSelection} (${nameOf(current)})`} data-current={current.label}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9M12 3C9.4 5.6 8.2 8.6 8.2 12s1.2 6.4 3.8 9" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
    </summary>
    <div className="locale-menu" role="group" aria-label={common.languageSelection}>
      {locales.map((info) => (
        <button
          key={info.code}
          type="button"
          lang={(info as { bcp47?: string }).bcp47 ?? info.code}
          className={locale === info.code ? "is-active" : ""}
          aria-pressed={locale === info.code}
          data-name={nameOf(info)}
          onClick={() => {
            if (menuRef.current) menuRef.current.open = false;
            changeLocale(info.code);
          }}
        >{info.label}</button>
      ))}
    </div>
  </details>;
}

/**
 * Header preference controls: theme switch + language menu, side by side.
 * One component so every header (public, moderation, edit) gets both.
 */
export function HeaderPreferences() {
  return <div className="header-preferences"><ThemeToggle /><LocaleToggle /></div>;
}
