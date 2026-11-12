/**
 * Local place-query resolution (privacy, 2026-11).
 *
 * The project sends as little as possible to third parties. Before a search
 * box asks the community geocoder (our /api/geocode proxy → Nominatim), it
 * resolves the queries that need no lookup at all, entirely in the browser:
 *
 *   - coordinates: "41.9068, 12.4808", "41.9068 12.4808", "41,9068; 12,4808"
 *     (Italian decimal comma), "geo:41.9068,12.4808", with optional N/S/E/W
 *     suffixes ("41.9 N 12.48 E");
 *   - a record number: "#6302" (the explicit "#" keeps plain numbers —
 *     house numbers, postcodes like "00184" — going to the geocoder).
 *
 * Anything else returns null and the caller may geocode it.
 */
export type LocalPlaceQuery =
  | { kind: "coordinates"; latitude: number; longitude: number }
  | { kind: "record"; id: number };

const NUMBER = String.raw`[+-]?\d{1,3}(?:[.,]\d+)?`;
const COORDINATES = new RegExp(
  String.raw`^(?:geo:)?\s*(${NUMBER})\s*([NS])?\s*(?:[,;\s]\s*)(${NUMBER})\s*([EWO])?\s*$`,
  "i",
);

function toNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

export function parseLocalPlaceQuery(input: string): LocalPlaceQuery | null {
  const text = input.trim();
  if (!text) return null;

  const record = /^#\s*(\d{1,9})$/.exec(text);
  if (record) {
    const id = Number(record[1]);
    return id > 0 ? { kind: "record", id } : null;
  }

  // "41,9068, 12,4808": decimal commas AND a comma separator. Normalise the
  // unambiguous "digits,digits, digits,digits" shape before matching.
  const normalised = text.replace(/^(\S+?\d),(\d+)\s*[,;]\s*([+-]?\d{1,3}),(\d+)/, "$1.$2, $3.$4");
  const match = COORDINATES.exec(normalised);
  if (!match) return null;
  let latitude = toNumber(match[1]);
  let longitude = toNumber(match[3]);
  if (match[2]?.toUpperCase() === "S") latitude = -Math.abs(latitude);
  // W (west) or O (Italian "ovest") → negative longitude.
  if (match[4] && /^[WO]$/i.test(match[4])) longitude = -Math.abs(longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // Two bare integers ("12 3") are far more likely an address fragment than
  // a position: require at least one decimal part or an explicit "geo:".
  const hasDecimals = /[.,]\d/.test(match[1]) || /[.,]\d/.test(match[3]);
  if (!hasDecimals && !/^geo:/i.test(text)) return null;
  return { kind: "coordinates", latitude, longitude };
}

/**
 * Rank geocoder results with the ones inside the current map view first,
 * keeping the geocoder's own order otherwise. Runs in the browser: the map
 * position is never sent anywhere.
 */
export function rankByViewport<T extends { lat: number; lng: number }>(
  results: readonly T[],
  view: { south: number; north: number; west: number; east: number } | null | undefined,
): T[] {
  if (!view) return [...results];
  const inside = (result: T) =>
    result.lat >= view.south && result.lat <= view.north && result.lng >= view.west && result.lng <= view.east;
  return [...results.filter(inside), ...results.filter((result) => !inside(result))];
}
