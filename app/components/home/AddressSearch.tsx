"use client";

// Address search with autocomplete for the report form (issue #432):
// a role=combobox backed by the same-origin geocode proxy (/api/geocode).
// The geolocation button of step 1 sits on the same row, to its right.
//
// Since issue #439 the input/dropdown mechanics live in the shared
// PlaceAutocomplete primitive (250 ms debounce, /api/geocode with limit=5
// and the current locale, 429 cooldown, ARIA combobox + listbox with
// arrow-key navigation, Enter selects the highlighted option (or the
// first), Escape closes, click/touch outside closes, honest no-results /
// rate-limited / error states announced via role=status). This component
// keeps the report-specific surface: the visible label, the report-bundle
// copy, and the coordinate-selection callback — selecting a place feeds
// the exact same coordinate path as a map click
// (useReportFlow.selectCoordinates → reverse-geocode prefill of the
// address field). No behavior change to ReportForm.

import { useMessages } from "../../lib/use-messages";
import { PlaceAutocomplete, type PlaceAutocompleteCopy } from "./PlaceAutocomplete";
import type { GeocodeSuggestion } from "./GeocodeSearch";

type Props = {
  /** The <input> id — must be unique per form instance. */
  inputId: string;
  /** Called when a place is picked; the parent selects the coordinates. */
  onPlaceSelect: (result: GeocodeSuggestion) => void;
};

export function AddressSearch({ inputId, onPlaceSelect }: Props) {
  const t = useMessages().report;
  const copy: PlaceAutocompleteCopy = {
    listboxLabel: t.addressSearchLabel,
    placeholder: t.addressSearchPlaceholder,
    help: t.addressSearchHelp,
    noResults: t.addressSearchNoResults,
    rateLimited: t.addressSearchRateLimited,
    unavailable: t.addressSearchUnavailable,
    attribution: t.addressSearchAttribution,
  };
  // The visible label travels as a `label` ReactNode into the primitive's
  // wrapper (the outside-click boundary), so clicking the label never
  // closes the dropdown; the wrapper carries the .address-search class the
  // report-locate-row styles target.
  return (
    <PlaceAutocomplete
      inputId={inputId}
      copy={copy}
      onPlaceSelect={onPlaceSelect}
      className="address-search"
      label={<label htmlFor={inputId}>{t.addressSearchLabel}</label>}
    />
  );
}
