/**
 * report-coordinates — parse and validate report coordinates coming from
 * the /segnala URL shell (?lat=&lng=, deep link from the /mappa pick
 * popup, t_6abb96ac).
 *
 * Privacy & safety by design: the coordinates are a public position the
 * contributor picked on the map — never a device location. The parser is a
 * pure function so the page server component and the client tests share
 * one validation rule: finite numbers inside the decimal-degrees ranges.
 */
export type ReportCoordinates = { latitude: number; longitude: number };

const isFiniteNumber = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));

/**
 * Parse ?lat=&lng= into validated coordinates, or null when absent or
 * outside the decimal-degrees ranges (latitude -90..90, longitude
 * -180..180). Invalid values are ignored, not clamped: a malformed deep
 * link must degrade to the plain empty form, never to a silently moved
 * position.
 */
export function parseReportCoordinates(searchParams: URLSearchParams): ReportCoordinates | null {
  const rawLat = searchParams.get("lat") ?? undefined;
  const rawLng = searchParams.get("lng") ?? undefined;
  if (!isFiniteNumber(rawLat) || !isFiniteNumber(rawLng)) return null;
  const latitude = Number(rawLat);
  const longitude = Number(rawLng);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}
