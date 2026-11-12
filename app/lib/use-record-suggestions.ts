"use client";

/**
 * useRecordSuggestions — search-as-you-type over OUR OWN public records
 * (2026-11). The suggestion dropdowns (home hero, map, directory) call it
 * with the live input text; it answers matching public records from
 * GET /api/cameras/suggest.
 *
 * Privacy: this is the ONLY request made while typing, and it goes to our
 * own server — never to a third party. The place geocoder (/api/geocode →
 * Nominatim) is not touched here: it still runs only on an explicit
 * submit. Text the browser can answer on its own (coordinates, "#123"
 * record numbers — app/lib/local-place-query.ts) is never sent at all.
 *
 * Mechanics:
 *   - debounced: the request fires only after the visitor pauses for
 *     SUGGEST_DEBOUNCE_MS; every new keystroke restarts the wait;
 *   - at least SUGGEST_MIN_QUERY_LENGTH characters (after trimming);
 *   - a new input aborts the in-flight request (AbortController), so a
 *     slow stale reply can never overwrite a newer one;
 *   - a small per-instance LRU cache of recent queries answers repeats
 *     (backspacing, retyping) without any request;
 *   - failures degrade silently to "no record suggestions" — the field and
 *     its submit path keep working.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseLocalPlaceQuery } from "./local-place-query";
import {
  normalizeSuggestQuery,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_DEFAULT_LIMIT,
  SUGGEST_MIN_QUERY_LENGTH,
  type RecordSuggestion,
} from "./search";

/** How many recent queries the client cache keeps. */
export const SUGGEST_CACHE_SIZE = 30;

export type RecordSuggestionState = {
  /** The normalised query the suggestions answer ("" when none). */
  query: string;
  suggestions: RecordSuggestion[];
  /** True while a debounced request is waiting or in flight. */
  pending: boolean;
};

const EMPTY: RecordSuggestionState = { query: "", suggestions: [], pending: false };

/** Does this text ask for record suggestions at all? (no request otherwise) */
export function wantsRecordSuggestions(text: string): boolean {
  const query = normalizeSuggestQuery(text);
  return query.length >= SUGGEST_MIN_QUERY_LENGTH && parseLocalPlaceQuery(query) === null;
}

export function useRecordSuggestions(enabled: boolean, limit: number = SUGGEST_DEFAULT_LIMIT) {
  const [state, setState] = useState<RecordSuggestionState>(EMPTY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, RecordSuggestion[]>());

  /** Cancel the pending pause timer and any in-flight request. */
  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  /** Forget the current suggestions (and stop anything pending). */
  const clear = useCallback(() => {
    cancel();
    setState(EMPTY);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  /** Feed the live input text: schedules (or skips) one debounced request. */
  const update = useCallback((text: string) => {
    cancel();
    if (!enabled || !wantsRecordSuggestions(text)) {
      setState(EMPTY);
      return;
    }
    const query = normalizeSuggestQuery(text);
    const key = query.toLocaleLowerCase();
    const cached = cacheRef.current.get(key);
    if (cached) {
      // LRU refresh: re-insert so the entry becomes the most recent.
      cacheRef.current.delete(key);
      cacheRef.current.set(key, cached);
      setState({ query, suggestions: cached, pending: false });
      return;
    }
    // Keep the previous list visible while waiting (no flicker), flagged pending.
    setState((current) => ({ ...current, pending: true }));
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const controller = new AbortController();
      controllerRef.current = controller;
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      fetch(`/api/cameras/suggest?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`suggest HTTP ${response.status}`);
          const data = (await response.json()) as { suggestions?: RecordSuggestion[] };
          if (controller.signal.aborted) return;
          const suggestions = Array.isArray(data.suggestions) ? data.suggestions.slice(0, limit) : [];
          const cache = cacheRef.current;
          cache.set(key, suggestions);
          while (cache.size > SUGGEST_CACHE_SIZE) {
            const oldest = cache.keys().next().value;
            if (oldest === undefined) break;
            cache.delete(oldest);
          }
          controllerRef.current = null;
          setState({ query, suggestions, pending: false });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          controllerRef.current = null;
          // Silent degradation: no record suggestions, nothing else breaks.
          setState({ query, suggestions: [], pending: false });
        });
    }, SUGGEST_DEBOUNCE_MS);
  }, [enabled, limit, cancel]);

  return { ...state, update, cancel, clear };
}
