/**
 * Content model for the public legal / information pages
 * (/privacy, /termini, /licenze).
 *
 * Unlike the UI message bundles (app/lib/i18n), the legal pages carry
 * long-form, structured content (sections with paragraphs, lists, notes
 * and tables). The model is explicit instead of a recursive mapped type
 * so that each block variant keeps its own fields; both language files
 * (en.ts / it.ts) are pinned to the same `LegalContent` type, so a
 * missing or extra key fails `tsc` exactly like the i18n parity check
 * (ADR 0007: English is the pilot language, Italian mirrors it).
 *
 * Inline markup supported inside block text:
 *   **bold**          → <strong>
 *   [label](url)      → <a href="url">
 * rendered by `app/components/LegalPage.tsx`.
 */
export type LegalBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "note"; text: string }
  | { type: "table"; caption?: string; headers: string[]; rows: string[][] };

export type LegalSection = { heading: string; blocks: LegalBlock[] };

export type LegalPageContent = {
  eyebrow: string;
  title: string;
  intro: string;
  /** Short version/status line shown in the page footer. */
  versionNote: string;
  sections: LegalSection[];
};

export type LegalContent = {
  privacy: LegalPageContent;
  terms: LegalPageContent;
  licenses: LegalPageContent;
};
