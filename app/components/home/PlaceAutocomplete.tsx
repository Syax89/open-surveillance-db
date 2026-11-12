"use client";

// Generic address/place autocomplete primitive (issue #439), extracted from
// the /segnala AddressSearch (issue #432) and shared with the home hero
// search, the /mappa place search and the /directory search field. It owns
// ONLY the proven input/dropdown mechanics:
//
//   - privacy (2026-11): NOTHING is sent to a third party while typing. The
//     place search runs only on Enter, the search button or the explicit
//     "Search the place" item. Coordinates ("41.9, 12.48") are resolved
//     locally first (app/lib/local-place-query.ts) and never leave the
//     browser; only a real place query reaches /api/geocode (our proxy →
//     Nominatim, OSM Foundation), which also matches Nominatim's usage
//     policy (no as-you-type autocomplete on the public instance);
//   - same-origin /api/geocode requests (limit=5, current locale) with a
//     429 Retry-After cooldown and in-flight cancellation;
//   - results inside the optional `view` box are listed first (ranked in the
//     browser: the map position is never sent);
//   - ARIA combobox + listbox with arrow-key navigation, Enter selects the
//     highlighted option (or the first), Escape closes, click/touch outside
//     closes, honest no-results / rate-limited / error states announced via
//     role=status;
//   - on selection the draft text becomes the place display_name (so an
//     enclosing form submits it) and the optional onPlaceSelect callback
//     lets consumers feed their own coordinate path.
//
// Search-as-you-type suggestions (2026-11, opt-in via `copy.suggest`): the
// same combobox also lists, while the visitor types,
//
//   1. an instant LOCAL item — "Go to coordinates …" / "Open record #123"
//      (app/lib/local-place-query.ts) — computed in the browser, no request;
//   2. matching PUBLIC RECORDS from our own /api/cameras/suggest
//      (useRecordSuggestions: debounced, min 2 characters, aborts stale
//      requests, caches recent queries) when `recordSuggestions` is set;
//   3. a last "Search the place «…» (OpenStreetMap)" item when
//      `placeSearchItem` is set: the place search runs ONLY when this item
//      is chosen (or on the surface's explicit submit), so the visitor sees
//      the exact moment their text leaves our server.
//
// With suggestions open and nothing highlighted, Enter keeps the surface's
// own submit behaviour (never an implicit pick). The report form passes no
// `copy.suggest` and keeps the submit-only field unchanged.
//
// Domain copy (labels, wording) stays with the consumer: this primitive
// takes a `copy` bundle so the report form and the hero never reuse strings
// invisibly across domains. The <label> for the input is passed in as a
// `label` ReactNode and rendered INSIDE the wrapper (the outside-click
// boundary), so clicking the label never closes the dropdown.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "../LocaleProvider";
import type { GeocodeSuggestion } from "./GeocodeSearch";
import { parseLocalPlaceQuery, rankByViewport } from "../../lib/local-place-query";
import { normalizeSuggestQuery, SUGGEST_MIN_QUERY_LENGTH, type RecordSuggestion } from "../../lib/search";
import { useRecordSuggestions, wantsRecordSuggestions } from "../../lib/use-record-suggestions";

const GEOCODE_LIMIT = 5;

/** Copy for the search-as-you-type items (present = suggestions enabled). */
export type SuggestCopy = {
  /** aria-label of the listbox while it shows suggestions. */
  listboxLabel: string;
  /** Live-region text: how many suggestions are listed. */
  count: (count: number) => string;
  /** The instant local item for typed coordinates ("41.90000, 12.48000"). */
  coordinates: (text: string) => string;
  /** The instant local item for "#123". */
  recordNumber: (id: number) => string;
  /** The last item: run the place search (OpenStreetMap) for this text. */
  place: (query: string) => string;
};

export type PlaceAutocompleteCopy = {
  /** aria-label of the suggestions listbox. */
  listboxLabel: string;
  placeholder: string;
  /** sr-only helper describing the keyboard interaction (omit when the
      consumer renders its own visible help and passes it via describedBy). */
  help?: string;
  noResults: (query: string) => string;
  rateLimited: (seconds: number) => string;
  unavailable: string;
  attribution: string;
  /** Visible label of the search button (omit to render no button). */
  searchButton?: string;
  /** Search-as-you-type suggestions; omit to keep the submit-only field. */
  suggest?: SuggestCopy;
};

type Props = {
  /** The <input> id — must be unique per form instance. */
  inputId: string;
  copy: PlaceAutocompleteCopy;
  /** Input `name` for the enclosing form (the hero sends `q`). */
  name?: string;
  /** Called when a place is picked (report: select the coordinates). */
  onPlaceSelect?: (result: GeocodeSuggestion) => void;
  /** Extra class on the wrapper div (consumer positioning). */
  className?: string;
  /** The <label> for the input, rendered inside the wrapper (the
      outside-click boundary). The hero passes its sr-only label, the
      report form its visible one. */
  label?: ReactNode;
  /** Enter with no highlighted option selects the first place result /
      runs the search (default true). Pass false to leave plain Enter alone
      so it submits the enclosing form (the hero's GET directory search,
      the directory's place search). */
  selectFirstOnEnter?: boolean;
  /** Current map view: results inside it are listed first (browser-only). */
  view?: { south: number; north: number; west: number; east: number } | null;
  /** "#123" — and a chosen record suggestion — opens that record; without
      it "#123" is not a place. */
  onRecordSelect?: (id: number) => void;
  /** Rendered right after the input (e.g. the map's visible caption). */
  afterInput?: ReactNode;
  /** Extra ids for the input's aria-describedby. */
  describedBy?: string;
  /** List matching public records while typing (needs `copy.suggest`). */
  recordSuggestions?: boolean;
  /** Offer the last "Search the place «…»" item (needs `copy.suggest`). */
  placeSearchItem?: boolean;
  /** The consumer runs the place search itself (the directory's
      /api/cameras/search flow): the place item — and typed coordinates when
      there is no onPlaceSelect — call this instead of the built-in geocoder. */
  onPlaceSearch?: (query: string) => void;
  /** Controlled value (the directory's ?q= filter); omit for an internal draft. */
  value?: string;
  onValueChange?: (value: string) => void;
};

/** One row of the listbox. */
type Item =
  | { type: "coordinates"; latitude: number; longitude: number }
  | { type: "record-number"; id: number }
  | { type: "record"; record: RecordSuggestion }
  | { type: "place-search"; query: string }
  | { type: "place"; place: GeocodeSuggestion };

function retryAfterSeconds(response: Response): number {
  const parsed = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 120) : 1;
}

function coordinatesPlace(latitude: number, longitude: number): GeocodeSuggestion {
  const lat = latitude.toFixed(5);
  const lng = longitude.toFixed(5);
  return { display_name: `${lat}, ${lng}`, lat: latitude, lng: longitude, type: "coordinates", boundingbox: [lat, lat, lng, lng] };
}

function itemKey(item: Item, index: number): string {
  switch (item.type) {
    case "place": return `place-${item.place.lat},${item.place.lng},${index}`;
    case "record": return `record-${item.record.id}`;
    case "record-number": return `record-number-${item.id}`;
    default: return `${item.type}-${index}`;
  }
}

export function PlaceAutocomplete({ inputId, copy, name, onPlaceSelect, className, label, selectFirstOnEnter = true, view = null, onRecordSelect, afterInput, describedBy, recordSuggestions = false, placeSearchItem = false, onPlaceSearch, value, onValueChange }: Props) {
  const { locale } = useLocale();
  const suggestCopy = copy.suggest;
  const suggestionsEnabled = Boolean(suggestCopy);

  const [innerDraft, setInnerDraft] = useState("");
  const draft = value ?? innerDraft;
  // "suggest": the as-you-type list (local + records + place item);
  // "places": the geocoder's answer to an explicit search.
  const [mode, setMode] = useState<"suggest" | "places">("suggest");
  const [status, setStatus] = useState<"idle" | "results" | "empty" | "error" | "rate-limited">("idle");
  const [results, setResults] = useState<GeocodeSuggestion[]>([]);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lastQuery, setLastQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const cooldownUntilRef = useRef(0);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const listboxId = `${inputId}-listbox`;
  const records = useRecordSuggestions(suggestionsEnabled && recordSuggestions);
  const { update: updateRecords, cancel: cancelRecords, clear: clearRecords } = records;

  const setDraft = useCallback((next: string) => {
    if (value === undefined) setInnerDraft(next);
    onValueChange?.(next);
  }, [value, onValueChange]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // Click/touch outside the wrapper closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) closeDropdown();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, closeDropdown]);

  // Unmount: cancel any in-flight request.
  useEffect(() => () => controllerRef.current?.abort(), []);

  // The as-you-type items, computed from the draft. Nothing here talks to a
  // third party: records come from our own /api/cameras/suggest, the rest
  // is answered in the browser.
  const suggestItems = useMemo<Item[]>(() => {
    if (!suggestCopy) return [];
    const query = normalizeSuggestQuery(draft);
    if (!query) return [];
    const list: Item[] = [];
    const local = parseLocalPlaceQuery(query);
    if (local?.kind === "coordinates") list.push({ type: "coordinates", latitude: local.latitude, longitude: local.longitude });
    if (local?.kind === "record" && onRecordSelect) list.push({ type: "record-number", id: local.id });
    if (recordSuggestions && wantsRecordSuggestions(query)) {
      for (const record of records.suggestions) list.push({ type: "record", record });
    }
    if (placeSearchItem && local === null && query.length >= SUGGEST_MIN_QUERY_LENGTH) list.push({ type: "place-search", query });
    return list;
  }, [suggestCopy, draft, onRecordSelect, recordSuggestions, records.suggestions, placeSearchItem]);

  const items = useMemo<Item[]>(() => (mode === "places"
    ? (status === "results" ? results.map((place) => ({ type: "place" as const, place })) : [])
    : suggestItems), [mode, status, results, suggestItems]);

  const runGeocode = useCallback((query: string) => {
    controllerRef.current?.abort();
    cancelRecords();
    setMode("places");
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setRetryAfter(null);
      setStatus("idle");
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    const cooldown = Math.ceil((cooldownUntilRef.current - Date.now()) / 1_000);
    if (cooldown > 0) {
      setResults([]);
      setRetryAfter(cooldown);
      setStatus("rate-limited");
      setOpen(true);
      setActiveIndex(-1);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    const params = new URLSearchParams({ q: trimmed, limit: String(GEOCODE_LIMIT), lang: locale });
    fetch(`/api/geocode?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 429) {
          const seconds = retryAfterSeconds(response);
          cooldownUntilRef.current = Date.now() + seconds * 1_000;
          if (controller.signal.aborted) return;
          setResults([]);
          setRetryAfter(seconds);
          setStatus("rate-limited");
          setOpen(true);
          setActiveIndex(-1);
          return;
        }
        if (!response.ok) throw new Error(`geocode HTTP ${response.status}`);
        const data = (await response.json()) as { results?: GeocodeSuggestion[] };
        if (controller.signal.aborted) return;
        const next = rankByViewport(data.results ?? [], viewRef.current);
        setResults(next);
        setRetryAfter(null);
        setStatus(next.length > 0 ? "results" : "empty");
        setOpen(true);
        setActiveIndex(-1);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        // Progressive enhancement: a geocoder failure never blocks the
        // enclosing form — the plain directory GET search still works.
        console.error("place autocomplete failed", error);
        setResults([]);
        setRetryAfter(null);
        setStatus("error");
        setOpen(true);
        setActiveIndex(-1);
      });
  }, [locale, cancelRecords]);

  // Typing edits the draft and (when enabled) refreshes the as-you-type
  // suggestions — our own records only. The geocoder is never called here.
  const handleChange = useCallback((next: string) => {
    setDraft(next);
    controllerRef.current?.abort();
    setResults([]);
    setRetryAfter(null);
    setStatus("idle");
    setMode("suggest");
    setActiveIndex(-1);
    if (suggestionsEnabled) {
      updateRecords(next);
      setOpen(next.trim() !== "");
    } else {
      setOpen(false);
    }
  }, [setDraft, suggestionsEnabled, updateRecords]);

  const selectSuggestion = useCallback((result: GeocodeSuggestion) => {
    // A choice wins over any in-flight query: abort it and reset the stale
    // result/status/retry state so a late reply cannot reopen the dropdown
    // or clobber the selection.
    controllerRef.current?.abort();
    controllerRef.current = null;
    clearRecords();
    setResults([]);
    setRetryAfter(null);
    setLastQuery("");
    setStatus("idle");
    setMode("suggest");
    // Fill the input (and therefore the enclosing form's field) with the
    // place's display name, then report the pick to the consumer.
    setDraft(result.display_name);
    onPlaceSelect?.(result);
    closeDropdown();
  }, [onPlaceSelect, closeDropdown, clearRecords, setDraft]);

  /** The explicit place search: the consumer's own flow, or the built-in geocoder. */
  const searchPlace = useCallback((query: string) => {
    if (onPlaceSearch) {
      cancelRecords();
      closeDropdown();
      onPlaceSearch(query);
      return;
    }
    setLastQuery(query);
    runGeocode(query);
  }, [onPlaceSearch, cancelRecords, closeDropdown, runGeocode]);

  /** Explicit search (Enter / button): local coordinates first, then the place search. */
  const submitSearch = useCallback(() => {
    const query = draft.trim();
    cancelRecords();
    if (!query) return;
    const local = parseLocalPlaceQuery(query);
    if (local?.kind === "coordinates") {
      selectSuggestion(coordinatesPlace(local.latitude, local.longitude));
      return;
    }
    if (local?.kind === "record") {
      if (onRecordSelect) {
        closeDropdown();
        onRecordSelect(local.id);
        return;
      }
      // "#123" is never a place: answer locally instead of asking the geocoder.
      setMode("places");
      setLastQuery(query);
      setResults([]);
      setStatus("empty");
      setOpen(true);
      return;
    }
    searchPlace(query);
  }, [draft, cancelRecords, selectSuggestion, onRecordSelect, closeDropdown, searchPlace]);

  const chooseItem = useCallback((item: Item) => {
    switch (item.type) {
      case "place":
        selectSuggestion(item.place);
        return;
      case "coordinates":
        // The map and the hero centre on the point; the directory runs its
        // own (server-side, geocoder-free) coordinate search.
        if (onPlaceSelect || !onPlaceSearch) selectSuggestion(coordinatesPlace(item.latitude, item.longitude));
        else searchPlace(draft.trim());
        return;
      case "record-number":
      case "record":
        clearRecords();
        closeDropdown();
        onRecordSelect?.(item.type === "record" ? item.record.id : item.id);
        return;
      case "place-search":
        searchPlace(item.query);
        return;
    }
  }, [selectSuggestion, onPlaceSelect, onPlaceSearch, searchPlace, draft, clearRecords, closeDropdown, onRecordSelect]);

  const showOptions = open && items.length > 0;
  const showStatus = open && mode === "places" && (status === "empty" || status === "error" || status === "rate-limited");

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showOptions) {
      if (event.key === "Escape") closeDropdown();
      if (event.key === "ArrowDown" && items.length > 0) {
        // Reopen a list the visitor closed (Escape / outside click).
        event.preventDefault();
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      // Enter with no list open runs the search, unless the consumer wants
      // plain Enter to submit its enclosing form.
      if (event.key === "Enter") {
        if (selectFirstOnEnter) {
          event.preventDefault();
          submitSearch();
        } else {
          // The enclosing form submits: drop any pending suggestion request.
          cancelRecords();
          closeDropdown();
        }
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? items.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      const highlighted = activeIndex >= 0 ? items[activeIndex] : undefined;
      if (highlighted) {
        event.preventDefault();
        chooseItem(highlighted);
        return;
      }
      if (mode === "places") {
        // With no highlighted option and selectFirstOnEnter=false (the hero),
        // Enter must do NOTHING — no selection and no preventDefault — so the
        // normal GET form submission proceeds.
        if (selectFirstOnEnter && items[0]) {
          event.preventDefault();
          chooseItem(items[0]);
        }
        return;
      }
      // Suggestions open, nothing highlighted: Enter keeps the surface's
      // submit behaviour (the map's explicit search, the hero's GET form,
      // the directory's place search) — never an implicit pick.
      if (selectFirstOnEnter) {
        event.preventDefault();
        submitSearch();
      } else {
        cancelRecords();
        closeDropdown();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
    }
  }, [showOptions, items, activeIndex, mode, selectFirstOnEnter, chooseItem, closeDropdown, submitSearch, cancelRecords]);

  const listboxLabel = mode === "suggest" && suggestCopy ? suggestCopy.listboxLabel : copy.listboxLabel;
  const helpId = copy.help ? `${inputId}-help` : undefined;
  const describedByIds = [helpId, describedBy].filter(Boolean).join(" ") || undefined;
  // Live announcement of the as-you-type list ("3 suggestions"); the places
  // mode keeps its own role=status messages inside the dropdown.
  const announcement = suggestCopy && mode === "suggest" && showOptions ? suggestCopy.count(items.length) : "";

  function renderItem(item: Item) {
    switch (item.type) {
      case "place":
        return (
          <>
            <span className="geocode-option-name">{item.place.display_name}</span>
            {item.place.type ? <span className="geocode-option-type">{item.place.type}</span> : null}
          </>
        );
      case "coordinates":
        return <span className="geocode-option-name">{suggestCopy?.coordinates(`${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`)}</span>;
      case "record-number":
        return <span className="geocode-option-name">{suggestCopy?.recordNumber(item.id)}</span>;
      case "record":
        return (
          <>
            <span className="suggest-option-text">
              <span className="geocode-option-name">{item.record.title}</span>
              <span className="suggest-option-detail">{item.record.address ? `${item.record.kind} · ${item.record.address}` : item.record.kind}</span>
            </span>
            <span className="geocode-option-type">#{item.record.id}</span>
          </>
        );
      case "place-search":
        return <span className="geocode-option-name">{suggestCopy?.place(item.query)}</span>;
    }
  }

  return (
    <div className={className} ref={wrapRef}>
      {label}
      <input
        id={inputId}
        name={name}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showOptions}
        aria-controls={showOptions ? listboxId : undefined}
        aria-activedescendant={showOptions && activeIndex >= 0 && activeIndex < items.length ? `${inputId}-option-${activeIndex}` : undefined}
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (draft.trim() === "") return;
          if (mode === "places" ? status !== "idle" : suggestionsEnabled) setOpen(true);
        }}
        placeholder={copy.placeholder}
        autoComplete="off"
        enterKeyHint="search"
        aria-describedby={describedByIds}
      />
      {copy.searchButton ? (
        <button type="button" className="button detail-outline place-search-button" onClick={submitSearch}>{copy.searchButton}</button>
      ) : null}
      {afterInput}
      {copy.help ? <p id={helpId} className="sr-only">{copy.help}</p> : null}
      {suggestCopy ? <p className="sr-only" role="status" aria-live="polite">{announcement}</p> : null}
      {(showOptions || showStatus) && (
        <div className="geocode-dropdown">
          {showOptions && (
            <ul id={listboxId} role="listbox" aria-label={listboxLabel}>
              {items.map((item, index) => (
                <li
                  key={itemKey(item, index)}
                  id={`${inputId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`geocode-option${mode === "suggest" ? ` suggest-option suggest-option-${item.type}` : ""}${index === activeIndex ? " is-active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseItem(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {renderItem(item)}
                </li>
              ))}
            </ul>
          )}
          {showStatus && (
            <p className="geocode-status" role="status">
              {status === "empty"
                ? copy.noResults(lastQuery)
                : status === "rate-limited"
                  ? copy.rateLimited(retryAfter ?? 1)
                  : copy.unavailable}
            </p>
          )}
          {mode === "places" ? <p className="geocode-attribution">{copy.attribution}</p> : null}
        </div>
      )}
    </div>
  );
}
