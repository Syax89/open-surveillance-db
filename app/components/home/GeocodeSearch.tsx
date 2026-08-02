"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMessages, useLocale } from "../LocaleProvider";

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
  /** External search value (parent URL ?q=) — mirrored into the input unless the last edit started here. */
  search: string;
  /** Local point filter: called on every keystroke (parent setSearch / ?q=). */
  onSearchChange: (value: string) => void;
  /**
   * A place was selected from the dropdown: the parent pans the map
   * (setView ≥ zoom 15), clears the local point filter and, once the new
   * viewport bounds land, focuses the first point in view.
   */
  onPlaceSelect: (result: GeocodeSuggestion) => void;
};

/** Debounce for the geocode autocomplete (spec: 250–300 ms). */
const GEOCODE_DEBOUNCE_MS = 300;
/** Suggestion cap — must match the proxy's MAX_LIMIT (5). */
const GEOCODE_LIMIT = 5;
const GEOCODE_LISTBOX_ID = "geocode-listbox";

/**
 * The /mappa sidebar search, dual-function (t_b9666d09): it filters the
 * viewport points by title/address/type (parent ?q=) AND, while typing,
 * suggests places through the same-origin Nominatim geocoder (/api/geocode)
 * in an ARIA combobox below the field. Selecting a suggestion reports the
 * place to the parent (onPlaceSelect); the parent pans the map and the list
 * then follows the new viewport.
 *
 * Accessibility (WCAG 2.2 AA): the input is a role=combobox with
 * aria-autocomplete=list, aria-expanded, aria-controls on the listbox and
 * aria-activedescendant following the arrow-key highlight; Enter selects the
 * active option (or the first), Escape closes, ArrowUp/Down move through
 * the options, and a click/touch outside closes the dropdown. The options
 * are real focusable-free listbox options (the input keeps focus), and the
 * honest no-results / unavailable states are announced via role=status.
 */
export function GeocodeSearch({ search, onSearchChange, onPlaceSelect }: Props) {
  const t = useMessages().map;
  const { locale } = useLocale();

  // The input shows `draft`: it mirrors the parent's `search` (URL ?q=)
  // while the user types, but keeps the selected place's display name after
  // a suggestion pick (the parent clears ?q= on selection so the list can
  // follow the new viewport unfiltered). lastLocalEditRef distinguishes
  // edits originating here from external changes (reset, deep link,
  // back/forward), which must still sync the input.
  const [draft, setDraft] = useState(search);
  const [status, setStatus] = useState<"idle" | "results" | "empty" | "error">("idle");
  const [results, setResults] = useState<GeocodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lastQuery, setLastQuery] = useState("");
  const lastLocalEditRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // External sync: the parent's `search` (URL ?q=) changes on reset, deep
  // link or back/forward — mirror it into the input. Edits that started in
  // THIS input are already in `draft`, so they are skipped (and the flag
  // consumed) instead of clobbering the text under the user's fingers or
  // the display name of a just-selected place.
  useEffect(() => {
    if (lastLocalEditRef.current) {
      lastLocalEditRef.current = false;
      return;
    }
    setDraft(search);
  }, [search]);

  // Click/touch outside the search wrapper closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target as Node)) closeDropdown();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, closeDropdown]);

  // Cancel the debounce timer and any in-flight geocode request on unmount.
  useEffect(() => () => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
  }, []);

  const runGeocode = useCallback((query: string) => {
    abortRef.current?.abort();
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setStatus("idle");
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const params = new URLSearchParams({ q: trimmed, limit: String(GEOCODE_LIMIT), lang: locale });
    fetch(`/api/geocode?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`geocode HTTP ${response.status}`);
        const data = (await response.json()) as { results?: GeocodeSuggestion[] };
        if (controller.signal.aborted) return;
        const next = data.results ?? [];
        setResults(next);
        setStatus(next.length > 0 ? "results" : "empty");
        setOpen(true);
        setActiveIndex(-1);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        // The geocoder is a progressive enhancement: a failure never breaks
        // the local point filtering or the map — it just closes the
        // dropdown with an honest note when the user is looking at it.
        console.error("geocode autocomplete failed", error);
        setResults([]);
        setStatus("error");
        setOpen(true);
        setActiveIndex(-1);
      });
  }, [locale]);

  const scheduleGeocode = useCallback((value: string) => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setLastQuery(value.trim());
      runGeocode(value);
    }, GEOCODE_DEBOUNCE_MS);
  }, [runGeocode]);

  const handleSearchChange = useCallback((value: string) => {
    lastLocalEditRef.current = true;
    setDraft(value);
    // (a) local point filter as today (parent URL ?q=).
    onSearchChange(value);
    // (b) geocode suggestions, debounced, only while there is text.
    if (value.trim() === "") {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      abortRef.current?.abort();
      setResults([]);
      setStatus("idle");
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    scheduleGeocode(value);
  }, [scheduleGeocode, onSearchChange]);

  const selectSuggestion = useCallback((result: GeocodeSuggestion) => {
    // Keep the chosen name in the input, then report the place to the
    // parent (pan + clear ?q= so the list can follow the new viewport
    // unfiltered — searching "Ferrara" must show the cameras near Ferrara,
    // not only the ones whose address contains the word "Ferrara").
    lastLocalEditRef.current = true;
    setDraft(result.display_name);
    onPlaceSelect(result);
    closeDropdown();
  }, [closeDropdown, onPlaceSelect]);

  const handleSearchKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (event.key === "Escape") closeDropdown();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (results.length === 0 ? -1 : (current + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (results.length === 0 ? -1 : (current - 1 + results.length) % results.length));
    } else if (event.key === "Enter") {
      // Enter selects the highlighted option (or the first one when the
      // arrows were never used) — the combobox pattern.
      const index = activeIndex >= 0 ? activeIndex : 0;
      const result = results[index];
      if (result) {
        event.preventDefault();
        selectSuggestion(result);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
    }
  }, [open, results, activeIndex, selectSuggestion, closeDropdown]);

  const showSuggestionOptions = open && status === "results";
  const showSuggestionStatus = open && (status === "empty" || status === "error");

  return (
    <div className="map-list-search" ref={searchWrapRef}>
      <label htmlFor="map-list-search">{t.listSearchLabel}</label>
      <input
        id="map-list-search"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={showSuggestionOptions ? GEOCODE_LISTBOX_ID : undefined}
        aria-activedescendant={showSuggestionOptions && activeIndex >= 0 ? `geocode-option-${activeIndex}` : undefined}
        value={draft}
        onChange={(event) => handleSearchChange(event.target.value)}
        onKeyDown={handleSearchKeyDown}
        onFocus={() => {
          // Re-open the dropdown for the current query when the user
          // returns to the field (e.g. after a click outside).
          if (status !== "idle" && draft.trim() !== "") setOpen(true);
        }}
        placeholder={t.listSearchPlaceholder}
        aria-describedby="map-list-help"
      />
      <p id="map-list-help" className="sr-only">{t.listSearchHelp}</p>
      {open && (
        <div className="geocode-dropdown">
          {showSuggestionOptions && (
            <ul id={GEOCODE_LISTBOX_ID} role="listbox" aria-label={t.geocodeLabel}>
              {results.map((result, index) => (
                <li
                  key={`${result.lat},${result.lng},${index}`}
                  id={`geocode-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`geocode-option${index === activeIndex ? " is-active" : ""}`}
                  // mousedown preventDefault keeps the input focused so
                  // the click-outside handler does not close the
                  // dropdown before the selection lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSuggestion(result)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="geocode-option-name">{result.display_name}</span>
                  {result.type ? <span className="geocode-option-type">{result.type}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {showSuggestionStatus && (
            <p className="geocode-status" role="status">
              {status === "empty" ? t.geocodeNoResults(lastQuery) : t.geocodeUnavailable}
            </p>
          )}
          <p className="geocode-attribution">{t.geocodeAttribution}</p>
        </div>
      )}
    </div>
  );
}
