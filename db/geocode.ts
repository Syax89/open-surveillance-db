/**
 * External place resolution for the locality/address search route.
 *
 * The search route resolves free-text locality and address queries to a point
 * plus bounding box through a Nominatim (OpenStreetMap) endpoint, then the
 * route searches reviewed public records near that area. This module is the
 * only place the route touches an external geocoder, so deployments can point
 * `GEOCODER_BASE_URL` at an approved instance (self-hosted or community
 * policy-compliant) without touching route logic. It lives in `db/` because
 * the route harness mocks every `db/*` module: tests never make network calls.
 *
 * Safety notes:
 *  - Results are cached per isolate with a short TTL to keep external load
 *    minimal; the cache never stores requestor data, only the geocoder reply.
 *  - A failed/overloaded geocoder throws, and the route turns that into a
 *    truthful "search temporarily unavailable" response — never fabricated
 *    results, and never a claim that a place has no cameras.
 *  - The Nominatim usage policy requires an identifying User-Agent; keep the
 *    contact line current.
 */

import { env } from "cloudflare:workers";

export type BoundingBox = { south: number; north: number; west: number; east: number };

export type ResolvedPlace = {
  displayName: string;
  latitude: number;
  longitude: number;
  boundingBox: BoundingBox;
};

const defaultGeocoderBaseUrl = "https://nominatim.openstreetmap.org";
const requestTimeoutMs = 5_000;
/** Negative results are cached too, so a typo does not hammer the endpoint. */
const cacheTtlMs = 60 * 60 * 1_000;
const cache = new Map<string, { expiresAt: number; value: ResolvedPlace | null }>();

type EnvLike = { [key: string]: unknown };

export function geocoderBaseUrl(envValue: unknown = env): string {
  const configured = (envValue as EnvLike).GEOCODER_BASE_URL;
  return typeof configured === "string" && configured.trim() ? configured.trim() : defaultGeocoderBaseUrl;
}

export async function resolvePlace(
  query: string,
  options: { language?: string } = {},
): Promise<ResolvedPlace | null> {
  const baseUrl = geocoderBaseUrl();
  const language = options.language ?? "en";
  const cacheKey = `${baseUrl}|${language}|${query.trim().toLocaleLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const url = new URL("/search", baseUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("limit", "1");
    url.searchParams.set("accept-language", language);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "OpenSurveillanceDB/0.1 (civic public-data directory; https://github.com/Syax89/open-surveillance-db)",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Geocoder responded with HTTP ${response.status}`);
    }

    const results = await response.json() as Array<{
      display_name: string;
      lat: string;
      lon: string;
      boundingbox: [string, string, string, string];
    }>;
    const first = results[0];
    if (!first) {
      cache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, value: null });
      return null;
    }

    const place: ResolvedPlace = {
      displayName: first.display_name,
      latitude: Number(first.lat),
      longitude: Number(first.lon),
      boundingBox: {
        south: Number(first.boundingbox[0]),
        north: Number(first.boundingbox[1]),
        west: Number(first.boundingbox[2]),
        east: Number(first.boundingbox[3]),
      },
    };
    if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
      throw new Error("Geocoder returned unusable coordinates");
    }
    cache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, value: place });
    return place;
  } finally {
    clearTimeout(timer);
  }
}
