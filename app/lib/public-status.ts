// Single source of truth for which camera statuses are presented to the
// public. Every public read path derives its whitelist from this constant:
//   - db/cameras.ts builds the SQL status predicate from it
//     (listPublicCameras, getPublicCameraById);
//   - db/freshness.ts isPubliclyCurrent() gates on it;
//   - the client directory/record/map components filter and label with it
//     (defense in depth: a record that is not whitelisted here is never
//     rendered, and its raw status string is never shown).
// Adding a status here is the ONLY change needed to make it public; removing
// one withdraws it from every surface at once. Anything not listed here is a
// non-public state (pending, needs_review, stale, rejected, removed, ...) and
// must never cross the UI/API/GeoJSON boundary.
//
// After migration 0039, "verified" no longer exists as a domain status;
// public records are now `active` (the migrated status) and `demo`.

export const PUBLIC_CAMERA_STATUSES = ["active", "demo"] as const;
export type PublicCameraStatus = (typeof PUBLIC_CAMERA_STATUSES)[number];

export function isPublicStatus(status: string): status is PublicCameraStatus {
  return (PUBLIC_CAMERA_STATUSES as readonly string[]).includes(status);
}

/**
 * Safe public status label: only whitelisted statuses get their localized
 * label; anything else falls back to the neutral `fallback` string so an
 * internal status name can never be rendered verbatim on a public page.
 */
export function publicStatusLabel(
  labels: Record<string, string>,
  status: string,
  fallback: string,
): string {
  return isPublicStatus(status) ? (labels[status] ?? fallback) : fallback;
}
