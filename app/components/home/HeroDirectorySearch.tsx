"use client";

// Hero directory search (issue #439; privacy pass 2026-11; search-as-you-type
// 2026-11).
//
// A server-rendered GET form to /directory with a name="q" input: the no-JS
// path is a plain directory search and Enter / the submit button keep doing
// exactly that. With JS the field is the shared PlaceAutocomplete combobox
// and suggests, while the visitor types:
//
//   - "Show coordinates … on the map" for pasted coordinates and
//     "Open record #123" for a record number — answered in the browser, no
//     request at all;
//   - matching public records from OUR OWN /api/cameras/suggest (debounced,
//     min 2 characters) — choosing one opens /records/<id>;
//   - a last "Search the place «…» (OpenStreetMap)" item: only when it is
//     chosen does the text reach the place geocoder (/api/geocode →
//     Nominatim); a chosen place then opens /mappa centred there.
//
// Nothing typed is ever sent to a third party while typing.

import { useCallback } from "react";
import { useDomainMessages } from "../../lib/use-domain-messages";
import { homeByLocale } from "../../lib/i18n/home";
import { hardNavigate } from "../../lib/navigate";
import { stringifyMapView } from "../../lib/map-viewport";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import type { GeocodeSuggestion } from "./GeocodeSearch";

/** Zoom used when the hero opens the map on a chosen point / place. */
export const HERO_COORDINATES_ZOOM = 17;
export const HERO_PLACE_ZOOM = 15;

/** The /mappa URL centred on a chosen place or typed coordinates. */
export function heroMapHref(result: Pick<GeocodeSuggestion, "lat" | "lng" | "type">): string {
  const zoom = result.type === "coordinates" ? HERO_COORDINATES_ZOOM : HERO_PLACE_ZOOM;
  return `/mappa?${stringifyMapView({ lat: result.lat, lng: result.lng, zoom })}`;
}

export function HeroDirectorySearch() {
  const t = useDomainMessages(homeByLocale);
  const openRecord = useCallback((id: number) => hardNavigate(`/records/${id}`), []);
  const openMap = useCallback((result: GeocodeSuggestion) => hardNavigate(heroMapHref(result)), []);
  return (
    <form className="hero-search" action="/directory" role="search">
      <PlaceAutocomplete
        inputId="hero-search"
        name="q"
        className="hero-search-autocomplete"
        label={<label className="sr-only" htmlFor="hero-search">{t.searchDirectory}</label>}
        selectFirstOnEnter={false}
        recordSuggestions
        placeSearchItem
        onRecordSelect={openRecord}
        onPlaceSelect={openMap}
        copy={{
          listboxLabel: t.searchPlaceLabel,
          placeholder: t.searchDirectoryPlaceholder,
          help: t.searchDirectoryHelp,
          noResults: t.searchPlaceNoResults,
          rateLimited: t.searchPlaceRateLimited,
          unavailable: t.searchPlaceUnavailable,
          attribution: t.searchPlaceAttribution,
          suggest: {
            listboxLabel: t.suggestLabel,
            count: t.suggestCount,
            coordinates: t.suggestCoordinates,
            recordNumber: t.suggestRecordNumber,
            place: t.suggestPlace,
          },
        }}
      />
      <button type="submit" aria-label={t.searchDirectory}><span className="hero-search-submit-label">{t.searchDirectory}</span> <span aria-hidden="true">→</span></button>
    </form>
  );
}
