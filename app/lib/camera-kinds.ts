/**
 * Canonical camera kinds (kanban t_f8b775ec, design Vera).
 *
 * The DB stores canonical English kind values ("Fixed dome", "Bullet", …);
 * every UI renders the localized label and submits the canonical value.
 * This module is the single frontend source for the kind vocabulary and
 * for the dome rule that the map and both forms share:
 *
 *   - a dome camera (kind === DOME_KIND) has NO directional field of view:
 *     the map draws a 360° circle around it, and the report/edit forms hide
 *     the direction field entirely (the backend enforces the same rule by
 *     normalising any supplied direction to NULL at every write boundary);
 *   - any other kind is directional by default: the direction field is
 *     offered and the map draws a field-of-view cone when a direction is
 *     stored (NULL / absent = unknown, nothing drawn).
 *
 * The value mirrors DOME_KIND in db/cameras.ts — the backend treats `kind`
 * as a controlled string, not a whitelist, so this list is a UI contract,
 * not a validation gate.
 */

/** Canonical stored kind value for dome cameras (must match db/cameras.ts DOME_KIND). */
export const DOME_KIND = "Fixed dome";

/**
 * Stable select options for the report and edit forms. `value` is the
 * canonical kind stored in the DB (language-neutral); `labelKey` resolves
 * to the localized label through the page's own dictionary (report.ts /
 * record.ts editKindOptions) — the same key names in both.
 */
export const KIND_OPTIONS = [
  { value: "Fixed dome", labelKey: "fixedDome" },
  { value: "Bullet", labelKey: "bullet" },
  { value: "PTZ", labelKey: "ptz" },
  { value: "Traffic / licence plate reader", labelKey: "trafficReader" },
  { value: "Other / unknown", labelKey: "otherUnknown" },
] as const;

export type KindOption = (typeof KIND_OPTIONS)[number];

/** A dome camera has no directional field of view. */
export function isDomeKind(kind: string): boolean {
  return kind === DOME_KIND;
}

/**
 * Whether a camera record carries a drawable field-of-view direction: a
 * non-dome kind AND a finite numeric direction. Domes and cameras whose
 * direction is NULL/absent/NaN never draw a cone.
 */
export function hasDrawableDirection(camera: { kind: string; direction?: number | null }): boolean {
  return !isDomeKind(camera.kind) && typeof camera.direction === "number" && Number.isFinite(camera.direction);
}
