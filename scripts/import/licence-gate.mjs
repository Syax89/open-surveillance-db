// Licence gate for the import pipeline (FONTI PUBBLICHE FASE A, kanban
// t_6030d390). The runner's `--apply` hard-gate: a descriptor whose licence
// is not in the importable set is refused BEFORE any row is written.
//
// The set mirrors the licence-compatibility matrix
// (docs/data-sources/licenze-compatibilita.md §2/§3): permissive licences
// (attribution-only) can be imported into an ODbL database because the
// ODbL obligations already satisfy them; share-alike incompatible licences
// (CC BY-SA, CC BY-NC/ND) are refused. The matrix is a draft pending legal
// review — treat this set as the operational snapshot and update it in the
// same PR that finalises the matrix.

/**
 * Licence identifiers the runner accepts for --apply. Match is exact on the
 * descriptor `license` string (case-sensitive, like the matrix rows).
 * Variants a source may write are listed explicitly — no fuzzy matching, so
 * an unknown licence string FAILS CLOSED (refuse the import, tell the
 * operator to review the licence).
 */
export const IMPORTABLE_LICENSES = new Set([
  // Italian open-data standard (PA) — attribution only, no share-alike.
  "IODL 2.0",
  // Creative Commons Attribution — attribution only.
  "CC BY 4.0",
  "CC-BY 4.0",
  // CC BY 3.0 Italia (Comune di Milano — open data CKAN dichiara 'cc-by'
  // senza versione; la 3.0 IT è quella storica del portale, da confermare
  // con l'ente prima del primo import in produzione). Permissiva, solo
  // attribuzione — stessa classe di compatibilità di CC BY 4.0 (matrice
  // licenze-compatibilita.md § 3.2).
  "CC BY 3.0 IT",
  // Public-domain dedication — no obligations.
  "CC0",
  "CC0 1.0",
  "CC0-1.0",
  // Same licence as the destination database (OSM and other ODbL sources).
  "ODbL 1.0",
  "ODbL-1.0",
  "ODbL 1.0 (OSM)",
  // Other permissive EU licences the matrix marks compatible.
  "Licence Ouverte 2.0",
  "Open Government Licence 3.0",
  "OGL 3.0",
  // No explicit licence but a statutory open-data basis (art. 52 CAD) —
  // only after the legal review has confirmed the specific source.
  "Open data (art. 52 CAD)",
]);

/** True when the descriptor licence is importable. */
export function isLicenceImportable(license) {
  return IMPORTABLE_LICENSES.has(license);
}

/** Human-readable list for error messages (sorted, stable). */
export function importableLicenceList() {
  return [...IMPORTABLE_LICENSES].sort();
}
