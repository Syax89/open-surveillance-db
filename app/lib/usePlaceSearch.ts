"use client";

/**
 * usePlaceSearch — the place-search flow shared by the home directory
 * section (PublicDirectory hub mode) and the /directory catalog
 * (DirectoryCatalog, t_127492f1).
 *
 * Locality/address/coordinate search: coordinates are parsed server-side,
 * other text is geocoded through the same-origin proxy (`/api/cameras/search`,
 * never a raw Nominatim payload — data minimization). The hook owns the
 * query, the result envelope and the fetch; the RENDERING of the outcome
 * (block inside the hub's aria-live region vs. catalog banner + single list)
 * stays in the components.
 *
 * Extracted from PublicDirectory (home) so both modes share ONE flow — the
 * ReportForm/useReportFlow precedent (F1, t_03c0fa15).
 */
import { FormEvent, useState } from "react";
import type { Camera } from "./records";

export type PlaceSearchArea = { kind: "coordinates" | "place"; displayName?: string; latitude: number; longitude: number; radiusMeters: number; radiusLabel: string };

export type PlaceSearchResult = {
  status: "loading" | "success" | "empty" | "not-found" | "error";
  message?: string;
  area?: PlaceSearchArea;
  records?: Array<Camera & { distanceMeters: number }>;
};

/** The `directory` bundle keys the flow needs (structural type, no coupling). */
export type PlaceSearchMessages = {
  placeSearchEmptyQuery: string;
  placeSearchRateLimited: string;
  placeSearchUnavailable: string;
  placeNotFoundTitle: string;
};

export function usePlaceSearch(t: PlaceSearchMessages, locale: string, onPlaceFound?: (coordinates: { latitude: number; longitude: number }) => void) {
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResult, setPlaceResult] = useState<PlaceSearchResult | null>(null);

  async function searchByQuery(value: string) {
    const query = value.trim();
    if (!query) {
      setPlaceResult({ status: "error", message: t.placeSearchEmptyQuery });
      return;
    }
    setPlaceResult({ status: "loading" });
    try {
      const params = new URLSearchParams({ q: query, lang: locale });
      const response = await fetch(`/api/cameras/search?${params}`);
      if (response.status === 404) {
        setPlaceResult({ status: "not-found", message: t.placeNotFoundTitle });
        return;
      }
      if (response.status === 429) {
        setPlaceResult({ status: "error", message: t.placeSearchRateLimited });
        return;
      }
      if (!response.ok) {
        setPlaceResult({ status: "error", message: t.placeSearchUnavailable });
        return;
      }
      const data = await response.json() as { area: PlaceSearchArea; records: Array<Camera & { distanceMeters: number }> };
      setPlaceResult({ status: data.records.length ? "success" : "empty", area: data.area, records: data.records });
      if (data.records.length) onPlaceFound?.({ latitude: data.area.latitude, longitude: data.area.longitude });
    } catch {
      setPlaceResult({ status: "error", message: t.placeSearchUnavailable });
    }
  }

  function searchByPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchByQuery(placeQuery);
  }

  function clearPlaceSearch() {
    setPlaceResult(null);
    setPlaceQuery("");
  }

  return { placeQuery, setPlaceQuery, placeResult, setPlaceResult, searchByPlace, searchByQuery, clearPlaceSearch };
}
