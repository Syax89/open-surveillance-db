"use client";

import { useEffect, useState } from "react";
import { commonByLocale } from "../lib/i18n/common";
import { THEME_COOKIE, type Theme } from "../lib/theme";
import { useLocale } from "./LocaleProvider";

const darkQuery = "(prefers-color-scheme: dark)";

function effectiveTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia?.(darkQuery).matches ? "dark" : "light";
}

/**
 * Light/dark switch (2026-11). Without a choice the site follows the system
 * setting (CSS prefers-color-scheme); a click pins the opposite of what is
 * showing, in <html data-theme> and in a preference cookie the root layout
 * reads, so the next page is server-rendered in that theme (no flash, no
 * inline script). The cookie holds only "light" or "dark": no personal data.
 *
 * Both icons are rendered and CSS shows the right one, so the server HTML
 * matches whatever the system theme turns out to be.
 */
export function ThemeToggle() {
  const { locale } = useLocale();
  const t = commonByLocale[locale];
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(effectiveTheme() === "dark");
    const media = window.matchMedia?.(darkQuery);
    const sync = () => setDark(effectiveTheme() === "dark");
    media?.addEventListener?.("change", sync);
    return () => media?.removeEventListener?.("change", sync);
  }, []);

  const toggle = () => {
    const next: Theme = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setDark(next === "dark");
  };

  return (
    <button type="button" className="theme-toggle" aria-pressed={dark} aria-label={t.darkTheme} title={t.darkTheme} onClick={toggle}>
      <svg className="theme-icon-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
      <svg className="theme-icon-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    </button>
  );
}
