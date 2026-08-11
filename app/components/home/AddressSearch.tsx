"use client";

// Address search with autocomplete for the report form (issue #432):
// a role=combobox backed by the same-origin geocode proxy (/api/geocode).
// The geolocation button of step 1 sits on the same row, to its right.
//
// Same accessibility pattern as the /mappa sidebar GeocodeSearch: debounced
// suggestions (250 ms), ARIA combobox + listbox with arrow-key navigation,
// Enter selects the highlighted option (or the first), Escape closes,
// click/touch outside closes, honest no-results / rate-limited / error
// states announced via role=status. On selection the parent feeds the exact
// same coordinate path as a map click (useReportFlow.selectCoordinates →
// reverse-geocode prefill of the address field).

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../LocaleProvider";
import { useMessages } from "../../lib/use-messages";
import type { GeocodeSuggestion } from "./GeocodeSearch";

const GEOCODE_DEBOUNCE_MS = 250;
const GEOCODE_LIMIT = 5;

type Props = {
  /** The <input> id — must be unique per form instance. */
  inputId: string;
  /** Called when a place is picked; the parent selects the coordinates. */
  onPlaceSelect: (result: GeocodeSuggestion) => void;
};

function retryAfterSeconds(response: Response): number {
  const parsed = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 120) : 1;
}

export function AddressSearch({ inputId, onPlaceSelect }: Props) {
  const t = useMessages().report;
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
        // form — the manual coordinate fields and geolocation still work.
        console.error("address autocomplete failed", error);
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
    setDraft(result.display_name);
    onPlaceSelect(result);
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
      if (result) {
        event.preventDefault();
        selectSuggestion(result);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
    }
  }, [open, results, activeIndex, selectSuggestion, closeDropdown]);

  const showOptions = open && status === "results";
  const showStatus = open && (status === "empty" || status === "error" || status === "rate-limited");

  return (
    <div className="address-search" ref={wrapRef}>
      <label htmlFor={inputId}>{t.addressSearchLabel}</label>
      <input
        id={inputId}
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
        placeholder={t.addressSearchPlaceholder}
        aria-describedby={`${inputId}-help`}
      />
      <p id={`${inputId}-help`} className="sr-only">{t.addressSearchHelp}</p>
      {open && (
        <div className="geocode-dropdown">
          {showOptions && (
            <ul id={listboxId} role="listbox" aria-label={t.addressSearchLabel}>
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
                ? t.addressSearchNoResults(lastQuery)
                : status === "rate-limited"
                  ? t.addressSearchRateLimited(retryAfter ?? 1)
                  : t.addressSearchUnavailable}
            </p>
          )}
          <p className="geocode-attribution">{t.addressSearchAttribution}</p>
        </div>
      )}
    </div>
  );
}
