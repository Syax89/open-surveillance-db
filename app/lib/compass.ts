/**
 * Compass helpers for the camera field-of-view direction (kanban
 * t_f8b775ec, design review).
 *
 * Directions are stored as integer compass bearings 0-359 (clockwise from
 * north, see migration 0035). This module turns a bearing into the 16-wind
 * compass name and the compact "NE 45°" form used by the map popup, the
 * record detail and the form readout. Wind names are language-neutral
 * abbreviations (N, NNE, NE, …), identical in EN and IT, so no i18n keys
 * are needed for them — only the surrounding labels are localized.
 */

/** 16-wind rose, clockwise from north, 22.5° per sector. */
const WIND_NAMES = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

/** Normalise any number (0-359, negatives, ≥360) to a 0-359 bearing. */
export function normalizeBearing(degrees: number): number {
  return ((Math.round(degrees) % 360) + 360) % 360;
}

/** Nearest 16-wind name for a bearing (0 → "N", 45 → "NE", 359 → "N"). */
export function compassWind(degrees: number): string {
  const index = Math.round(normalizeBearing(degrees) / 22.5) % 16;
  return WIND_NAMES[index];
}

/**
 * Compact display form: wind name + rounded degrees, e.g. "NE 45°".
 * Used in the record detail facts, the map popup and the form readout.
 */
export function formatDirection(degrees: number): string {
  const bearing = normalizeBearing(degrees);
  return `${compassWind(bearing)} ${bearing}°`;
}
