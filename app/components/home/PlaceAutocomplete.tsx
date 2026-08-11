"use client";

// Generic address/place autocomplete primitive (issue #439), extracted from
// the /segnala AddressSearch (issue #432) and shared with the home hero
// directory search. It owns ONLY the proven input/dropdown mechanics:
//
//   - controlled text with a 250 ms debounce and in-flight cancellation
//     (AbortController) — no fetch before the debounce fires;
//   - same-origin /api/geocode requests (limit=5, current locale) with a
//     429 Retry-After cooldown;
//   - ARIA combobox + listbox with arrow-key navigation, Enter selects the
//     highlighted option (or the first), Escape closes, click/touch outside
//     closes, honest no-results / rate-limited / error states announced via
//     role=status;
//   - on selection the draft text becomes the place display_name (so an
//     enclosing form submits it) and the optional onPlaceSelect callback
//     lets consumers feed their own coordinate path.
//
// Domain copy (labels, wording) stays with the consumer: this primitive
// takes a `copy` bundle so the report form and the hero never reuse strings
// invisibly across domains. The <label> for the input is passed in as a
// `label` ReactNode and rendered INSIDE the wrapper (the outside-click
// boundary), so clicking the label never closes the dropdown.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "../LocaleProvider";
import type { GeocodeSuggestion } from "./GeocodeSearch";

const GEOCODE_DEBOUNCE_MS = 250;
const GEOCODE_LIMIT = 5;

export type PlaceAutocompleteCopy = {
  /** aria-label of the suggestions listbox. */
  listboxLabel: string;
  placeholder: string;
  /** sr-only helper describing the keyboard interaction. */
  help: string;
  noResults: (query: string) => string;
  rateLimited: (seconds: number) => string;
  unavailable: string;
  attribution: string;
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
  /** Enter with no highlighted option selects the first suggestion
      (default true). Pass false to leave plain Enter alone so it submits
      the enclosing form (the hero's GET directory search). */
  selectFirstOnEnter?: boolean;
};

function retryAfterSeconds(response: Response): number {
  const parsed = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 120) : 1;
}

export function PlaceAutocomplete({ inputId, copy, name, onPlaceSelect, className, label, selectFirstOnEnter = true }: Props) {
  const { locale } = useLocale();

  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "results" | "empty" | "error" | "rate-limited">("idle");
  const [results, setResults] = useState<GeocodeSuggestion[]>([]);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lastQuery, setLastQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const cooldownUntilRef = useRef(0);
  const listboxId = `${inputId}-listbox`;

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

  // Unmount: cancel the debounce and any in-flight request.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    };
  }, []);

  const runGeocode = useCallback((query: string) => {
    controllerRef.current?.abort();
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
        const next = data.results ?? [];
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
  }, [locale]);

  const handleChange = useCallback((value: string) => {
    setDraft(value);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    if (value.trim() === "") {
      setResults([]);
      setRetryAfter(null);
      setStatus("idle");
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setLastQuery(value.trim());
      runGeocode(value);
    }, GEOCODE_DEBOUNCE_MS);
  }, [runGeocode]);

  const selectSuggestion = useCallback((result: GeocodeSuggestion) => {
    // A pointer choice wins over any queued/in-flight query: cancel the
    // pending debounce and abort the active request, then reset the stale
    // result/status/retry state so a late reply cannot reopen the dropdown
    // or clobber the selection.
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
    setResults([]);
    setRetryAfter(null);
    setLastQuery("");
    setStatus("idle");
    // Fill the input (and therefore the enclosing form's field) with the
    // place's display name, then report the pick to the consumer.
    setDraft(result.display_name);
    onPlaceSelect?.(result);
    closeDropdown();
  }, [onPlaceSelect, closeDropdown]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
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
      const index = activeIndex >= 0 ? activeIndex : 0;
      const result = results[index];
      // With no highlighted option and selectFirstOnEnter=false (the hero),
      // Enter must do NOTHING — no selection and no preventDefault — so the
      // normal GET form submission proceeds.
      if (result && (activeIndex >= 0 || selectFirstOnEnter)) {
        event.preventDefault();
        selectSuggestion(result);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
    }
  }, [open, results, activeIndex, selectFirstOnEnter, selectSuggestion, closeDropdown]);

  const showOptions = open && status === "results";
  const showStatus = open && (status === "empty" || status === "error" || status === "rate-limited");

  return (
    <div className={className} ref={wrapRef}>
      {label}
      <input
        id={inputId}
        name={name}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={showOptions ? listboxId : undefined}
        aria-activedescendant={showOptions && activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (status !== "idle" && draft.trim() !== "") setOpen(true);
        }}
        placeholder={copy.placeholder}
        autoComplete="off"
        aria-describedby={`${inputId}-help`}
      />
      <p id={`${inputId}-help`} className="sr-only">{copy.help}</p>
      {open && (
        <div className="geocode-dropdown">
          {showOptions && (
            <ul id={listboxId} role="listbox" aria-label={copy.listboxLabel}>
              {results.map((result, index) => (
                <li
                  key={`${result.lat},${result.lng},${index}`}
                  id={`${inputId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`geocode-option${index === activeIndex ? " is-active" : ""}`}
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
          {showStatus && (
            <p className="geocode-status" role="status">
              {status === "empty"
                ? copy.noResults(lastQuery)
                : status === "rate-limited"
                  ? copy.rateLimited(retryAfter ?? 1)
                  : copy.unavailable}
            </p>
          )}
          <p className="geocode-attribution">{copy.attribution}</p>
        </div>
      )}
    </div>
  );
}
