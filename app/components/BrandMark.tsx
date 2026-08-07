/**
 * BrandMark — the OSDB logomark as inline SVG (CEO 2026-08-07).
 *
 * Replaces the old "◉" glyph with the actual logo artwork: a solid
 * centre dot inside two concentric dashed orbits (viewBox 48). The
 * strokes/fill use `currentColor`, so the mark inherits the brand
 * palette of whatever container renders it (mint on ink in the nav and
 * footer, exactly like the glyph it replaces) — the surrounding
 * .brand-mark box is untouched.
 */
export function BrandMark() {
  return (
    <svg width="29" height="29" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="5.5" fill="currentColor" />
      <circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeDasharray="55 20" transform="rotate(-20 24 24)" />
      <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeDasharray="90 30" transform="rotate(35 24 24)" />
    </svg>
  );
}
