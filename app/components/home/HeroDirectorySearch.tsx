"use client";

// Hero directory search (issue #439): the home hero's search field becomes
// full-width inside the hero-copy column and gains accessible address
// autocomplete — WITHOUT touching the directory-search contract.
//
// The markup is a normal server-rendered GET form to /directory with a
// name="q" input, so the no-JS path is unchanged: submit goes to
// /directory?q=… exactly as before. JavaScript (hydrated client island)
// enriches the same input through the shared PlaceAutocomplete primitive
// (the proven /segnala mechanics: 250 ms debounce, same-origin
// /api/geocode?limit=5&lang=<locale>, 429 cooldown, ARIA combobox/listbox,
// keyboard + pointer selection, honest empty/error/rate-limited status).
// Selecting a suggestion fills `q` with the place display_name and closes
// the popup; the user submits the normal form themselves. No map deep
// links, no geospatial filtering, no new API route — and the hero never
// fetches during SSR (the autocomplete only runs in effects).

import { useMessages } from "../../lib/use-messages";
import { PlaceAutocomplete } from "./PlaceAutocomplete";

export function HeroDirectorySearch() {
  const t = useMessages().home;
  return (
    <form className="hero-search" action="/directory" role="search">
      <PlaceAutocomplete
        inputId="hero-search"
        name="q"
        className="hero-search-autocomplete"
        label={<label className="sr-only" htmlFor="hero-search">{t.searchDirectory}</label>}
        // Plain Enter (no highlighted suggestion) must keep submitting the
        // normal GET directory form — no first-option interception.
        selectFirstOnEnter={false}
        copy={{
          listboxLabel: t.searchSuggestionsLabel,
          placeholder: t.searchDirectoryPlaceholder,
          help: t.searchDirectoryHelp,
          noResults: t.searchNoResults,
          rateLimited: t.searchRateLimited,
          unavailable: t.searchUnavailable,
          attribution: t.searchAttribution,
        }}
      />
      <button type="submit">{t.searchDirectory} <span aria-hidden="true">→</span></button>
    </form>
  );
}
