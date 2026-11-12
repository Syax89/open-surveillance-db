/**
 * Colour-theme preference (2026-11). Absent = follow the system setting.
 * Light import path: no message bundles, safe for the root layout.
 */
export const THEME_COOKIE = "opensurveillancedb-theme";

export type Theme = "light" | "dark";

/** Resolve an untrusted cookie value; anything else means "system". */
export function resolveTheme(value: string | null | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}
