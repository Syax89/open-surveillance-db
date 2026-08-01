"use client";

import { useEffect, useRef, useState } from "react";
import { publicRecords, type Camera } from "./records";

/**
 * Shared public-cameras data layer (audit t_c6da60f0, P2).
 *
 * One hook, every public surface: the home directory and the record detail
 * page used to duplicate fetch("/api/cameras") + publicRecords() + ad-hoc
 * loading/error handling, and the record page swallowed failures
 * (.catch(() => undefined)) so a dead API rendered "not found".
 *
 * Contract:
 *  - module-level cache: the public list is fetched at most once per page
 *    load; navigating home -> record detail reuses the payload;
 *  - concurrent consumers share a single in-flight fetch (dedupes the dev
 *    StrictMode double-effect), and the shared fetch is aborted when the
 *    last consumer unmounts;
 *  - explicit states: loading (first fetch in flight), error (network or
 *    non-2xx), empty (API answered but no public records);
 *  - on error the seed records remain visible (explicit demo seed for the
 *    home page); the caller decides how to surface the failure.
 */

let cachedRecords: Camera[] | null = null;

let inflight: { promise: Promise<Camera[]>; controller: AbortController; listeners: number } | null = null;

function abortInflight() {
  if (!inflight) return;
  inflight.controller.abort();
  inflight = null;
}

/**
 * Register one consumer. Returns the shared fetch (a resolved cache promise
 * when the fetch already happened, the in-flight promise otherwise).
 */
function ensureFetch(): Promise<Camera[]> {
  if (cachedRecords !== null) return Promise.resolve(cachedRecords);
  if (!inflight) {
    const controller = new AbortController();
    const promise = fetch("/api/cameras", { signal: controller.signal })
      .then((response) => response.ok
        ? response.json() as Promise<{ records: Camera[] }>
        : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((data) => {
        cachedRecords = publicRecords(data.records);
        return cachedRecords;
      })
      .finally(() => { inflight = null; });
    // The shared promise may reject with no consumer left attached (abort
    // path); mark it handled so the rejection never becomes unhandled.
    promise.catch(() => {});
    inflight = { promise, controller, listeners: 0 };
  }
  inflight.listeners += 1;
  return inflight.promise;
}

function releaseFetch() {
  if (!inflight) return;
  inflight.listeners -= 1;
  if (inflight.listeners <= 0) abortInflight();
}

export type UsePublicCamerasOptions = {
  /** Explicit demo seed rendered while loading or when the API is unreachable. */
  seed?: Camera[];
  /** Fired once when the API returns a non-empty public payload. */
  onRecords?: (records: Camera[]) => void;
  /** Fired once when the API fetch fails (callers surface the notice). */
  onError?: () => void;
};

export type UsePublicCamerasResult = {
  /** Current display records (seed when the API is empty/unreachable). */
  records: Camera[];
  /** True while the first API fetch is in flight. */
  loading: boolean;
  /** The API fetch failed (network error or non-2xx response). */
  error: boolean;
  /** The API answered but returned no public records. */
  empty: boolean;
  /** Drop the cache and fetch again (error-state recovery). */
  reload: () => void;
};

export function usePublicCameras({ seed = [], onRecords, onError }: UsePublicCamerasOptions = {}): UsePublicCamerasResult {
  // A cached EMPTY payload is indistinguishable from "nothing loaded" at the
  // cache level, so an empty cache keeps the seed visible (home contract:
  // an empty API answer never blanks the demo directory).
  const [records, setRecords] = useState<Camera[]>(() => cachedRecords === null
    ? seed
    : cachedRecords.length ? cachedRecords : seed);
  const [loading, setLoading] = useState(() => cachedRecords === null);
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(() => cachedRecords !== null && cachedRecords.length === 0);
  const [attempt, setAttempt] = useState(0);
  const onRecordsRef = useRef(onRecords);
  const onErrorRef = useRef(onError);
  useEffect(() => { onRecordsRef.current = onRecords; });
  useEffect(() => { onErrorRef.current = onError; });

  // All state transitions happen in async continuations of the shared fetch,
  // so a consumer that mounts after the cache was populated settles in the
  // same microtask without a visible loading flash.
  useEffect(() => {
    let cancelled = false;
    ensureFetch()
      .then((fetched) => {
        if (cancelled) return;
        setLoading(false);
        setError(false);
        if (fetched.length) {
          setEmpty(false);
          setRecords(fetched);
          onRecordsRef.current?.(fetched);
        } else {
          // API answered with an empty public list: keep the seed and expose
          // the empty state so callers can render an honest "no records".
          setEmpty(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(true);
        // Records stay at the seed: a failed API must never blank the page.
        onErrorRef.current?.();
      });
    return () => {
      cancelled = true;
      releaseFetch();
    };
  }, [attempt]);

  return {
    records,
    loading,
    error,
    empty,
    reload: () => {
      cachedRecords = null;
      abortInflight();
      setError(false);
      setLoading(true);
      setAttempt((value) => value + 1);
    },
  };
}

/** Test-only: drop the module cache between DOM-harness tests. */
export function __resetPublicCamerasCache() {
  abortInflight();
  cachedRecords = null;
}
