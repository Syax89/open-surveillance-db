"use client";

// Hero directory search (issue #439; privacy pass 2026-11).
//
// A plain server-rendered GET form to /directory with a name="q" input: the
// no-JS path and the JS path are identical. It used to geocode every pause
// in typing against the community geocoder; it no longer sends anything
// while typing — the directory itself searches around a place on Enter, so
// the home page needs no third-party lookup at all.

import { useDomainMessages } from "../../lib/use-domain-messages";
import { homeByLocale } from "../../lib/i18n/home";

export function HeroDirectorySearch() {
  const t = useDomainMessages(homeByLocale);
  return (
    <form className="hero-search" action="/directory" role="search">
      <div className="hero-search-autocomplete">
        <label className="sr-only" htmlFor="hero-search">{t.searchDirectory}</label>
        <input id="hero-search" name="q" type="search" placeholder={t.searchDirectoryPlaceholder} autoComplete="off" aria-describedby="hero-search-help" />
        <p id="hero-search-help" className="sr-only">{t.searchDirectoryHelp}</p>
      </div>
      <button type="submit" aria-label={t.searchDirectory}><span className="hero-search-submit-label">{t.searchDirectory}</span> <span aria-hidden="true">→</span></button>
    </form>
  );
}
