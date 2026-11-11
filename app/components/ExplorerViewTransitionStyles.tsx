/**
 * Scoped cross-document View Transition opt-in for the explorer switch
 * (map ↔ directory, issue #410; perf 2026-11).
 *
 * The `@view-transition { navigation:auto }` rule and its animations live in
 * the static public/explorer-view-transition.css and are linked ONLY from the
 * /mappa and /directory pages through this component, so every other
 * same-origin navigation stays a plain navigation (no full-page snapshots).
 * React 19 hoists a `precedence` stylesheet <link> into <head> (render
 * blocking, deduplicated), which is what a cross-document opt-in needs: the
 * rule must be in effect on BOTH documents when the navigation happens.
 */
export const EXPLORER_VIEW_TRANSITION_CSS = "/explorer-view-transition.css";

export function ExplorerViewTransitionStyles() {
  return <link rel="stylesheet" href={EXPLORER_VIEW_TRANSITION_CSS} precedence="default" />;
}
