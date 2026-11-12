"use client";

import { useDomainMessages } from "../../lib/use-domain-messages";
import { mapByLocale } from "../../lib/i18n/map";
import { PlaceAutocomplete } from "./PlaceAutocomplete";

/**
 * One place suggestion returned by the same-origin geocode proxy
 * (app/api/geocode/route.ts): exactly the minimized fields the dropdown
 * renders — never the raw Nominatim payload (data minimization).
 */
export type GeocodeSuggestion = {
  display_name: string;
  lat: number;
  lng: number;
  type: string;
  boundingbox: [string, string, string, string];
};

type Props = {
  /**
   * A place (or pasted coordinates) was chosen: the parent pans the map
   * (setView ≥ zoom 15 / fits the place box) and focuses the first point.
   */
  onPlaceSelect: (result: GeocodeSuggestion) => void;
  /** "#123" was submitted: the parent selects and opens that record. */
  onRecordSelect: (id: number) => void;
  /** Current map view: results inside it are listed first (browser-only). */
  view?: { south: number; north: number; west: number; east: number } | null;
};

/** The search input id (kept stable: CSS, tests and the map's own focus code). */
export const GEOCODE_INPUT_ID = "map-list-search";

/**
 * Kept for the test harness: the map search no longer holds module-level
 * debounce state (nothing runs while typing), so there is nothing to reset.
 */
export function __resetGeocodePending(): void {}

/**
 * The /mappa place search (privacy pass 2026-11). ONE purpose: find a
 * place, an address, coordinates or a record number — it no longer filters
 * the points while typing (that doubled as a confusing "the map emptied"
 * effect and is the directory's job).
 *
 * Privacy: nothing reaches a third party while typing. As-you-type
 * suggestions list matching public records from our own
 * /api/cameras/suggest (choosing one focuses it on the map, like "#123");
 * Enter, the Search button or the last "Search the place" item runs the
 * place query; coordinates and "#123" are resolved in the browser and never
 * leave it; only a real place name reaches our /api/geocode proxy (→ Nominatim,
 * OSM Foundation), which never sees the visitor's IP or page URL. Results
 * inside the current view are ranked first in the browser — the map
 * position is never sent.
 *
 * The input/listbox mechanics (ARIA combobox, keyboard, 429 cooldown,
 * honest empty/error states) come from the shared PlaceAutocomplete.
 */
export function GeocodeSearch({ onPlaceSelect, onRecordSelect, view = null }: Props) {
  const t = useDomainMessages(mapByLocale);
  return (
    <PlaceAutocomplete
      inputId={GEOCODE_INPUT_ID}
      className="map-list-search"
      label={<label htmlFor={GEOCODE_INPUT_ID}>{t.listSearchLabel}</label>}
      onPlaceSelect={onPlaceSelect}
      onRecordSelect={onRecordSelect}
      view={view}
      describedBy="map-list-caption"
      recordSuggestions
      placeSearchItem
      afterInput={<p className="map-list-search-hint" id="map-list-caption">{t.listSearchCaption}</p>}
      copy={{
        listboxLabel: t.geocodeLabel,
        placeholder: t.listSearchPlaceholder,
        help: t.listSearchHelp,
        noResults: t.geocodeNoResults,
        rateLimited: t.geocodeRateLimited,
        unavailable: t.geocodeUnavailable,
        attribution: t.geocodeAttribution,
        searchButton: t.listSearchButton,
        suggest: {
          listboxLabel: t.suggestLabel,
          count: t.suggestCount,
          coordinates: t.suggestCoordinates,
          recordNumber: t.suggestRecordNumber,
          place: t.suggestPlace,
        },
      }}
    />
  );
}
