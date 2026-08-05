// Canonical kind vocabulary + kind mapping (FONTI PUBBLICHE FASE A, kanban
// t_6030d390; docs/data-sources/normalizzazione-pipeline.md §3.4/§7.3).
//
// The DB stores the canonical English values (db/cameras.ts treats `kind`
// as a controlled string; app/lib/camera-kinds.ts is the UI contract). An
// import NEVER invents a kind: unmapped source values fall back to
// 'Other / unknown' with a report note, and a misclassified dome is worse
// than an honest unknown (the map cone rendering depends on kind).
//
// Pure module — no bindings — so the tests exercise it directly.

/** Canonical kinds (must match app/lib/camera-kinds.ts KIND_OPTIONS). */
export const CANONICAL_KINDS = [
  "Fixed dome",
  "Bullet",
  "PTZ",
  "Traffic / licence plate reader",
  "Other / unknown",
];

/** Canonical dome kind — direction is always NULL for domes (invariant). */
export const DOME_KIND = "Fixed dome";

/**
 * Default source-vocabulary → canonical-kind map (design §3.4), used when a
 * descriptor has no `kind_map` of its own. Keys are lowercase, diacritics
 * folded. Conservative by design: `fissa`/`fixed` (ambiguous dome-vs-bullet)
 * maps to 'Other / unknown', NOT 'Bullet' — a bare "fixed" does not say
 * which form it is, and a misclassified kind breaks the map rendering.
 */
export const DEFAULT_KIND_MAP = {
  "dome": DOME_KIND,
  "cupola": DOME_KIND,
  "a cupola": DOME_KIND,
  "telecamera a cupola": DOME_KIND,
  "bullet": "Bullet",
  "a proiettile": "Bullet",
  "ptz": "PTZ",
  "motorizzata": "PTZ",
  "brandeggiabile": "PTZ",
  "targa": "Traffic / licence plate reader",
  "lettura targhe": "Traffic / licence plate reader",
  "ocr": "Traffic / licence plate reader",
  "targa reader": "Traffic / licence plate reader",
  "varchi ztl": "Traffic / licence plate reader",
  "alpr": "Traffic / licence plate reader",
  "traffic": "Traffic / licence plate reader",
  "velox": "Traffic / licence plate reader",
  "tutor": "Traffic / licence plate reader",
};

/** Fold diacritics + lowercase + collapse spaces (mirror of normalizeText). */
export function foldKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Map a raw source kind value to a canonical kind using the descriptor's
 * `kind_map` merged over the defaults. Returns { kind, mapped: boolean } —
 * `mapped: false` means the value was unmapped and fell back to
 * 'Other / unknown' (caller logs a report note).
 */
export function mapKind(rawValue, kindMap = {}) {
  const merged = { ...DEFAULT_KIND_MAP, ...kindMap };
  const key = foldKey(rawValue);
  if (key === "") return { kind: "Other / unknown", mapped: false };
  const kind = merged[key];
  if (kind === undefined) return { kind: "Other / unknown", mapped: false };
  // A descriptor may map to a non-canonical value (typo): never store it.
  if (!CANONICAL_KINDS.includes(kind)) {
    return { kind: "Other / unknown", mapped: false };
  }
  return { kind, mapped: true };
}

/** Canonical kinds of the current project vocabulary (import-facing). */
export function isCanonicalKind(kind) {
  return CANONICAL_KINDS.includes(kind);
}
