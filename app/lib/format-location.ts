/**
 * Location formatting (CEO 2026-08-07): the database stores BOTH the
 * address and the precise coordinates for every record, and the UI must
 * show both — never "address OR coordinates". The address is an
 * approximate, human-readable label (reverse geocoding, Nominatim); the
 * coordinates are the authoritative position. Both are always kept and
 * both are always displayed.
 */

/** Round public coordinates to 4 decimals (~11 m, same as the popup). */
export function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

/**
 * Full location string: "Address — lat, lng" when an address exists,
 * plain coordinates otherwise. The address (approximate label) and the
 * coordinates (authoritative position) are separate facts; showing one
 * instead of the other would hide data the user explicitly wants to see.
 */
export function formatLocation(address: string | null | undefined, latitude: number, longitude: number): string {
  const coords = formatCoordinates(latitude, longitude);
  return address ? `${address} — ${coords}` : coords;
}
