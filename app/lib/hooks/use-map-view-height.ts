import { useEffect, type RefObject } from "react";

/**
 * Measured map height budget for the mobile map (M02, design review
 * 2026-10-22 P1).
 *
 * The mobile map used a fixed `calc(100svh - 250px)` guess. On a 390x844
 * phone the map actually begins at y=399 (header + explorer toolbar + search
 * + filters row), so 844-250 = 594 never matched the real remaining space;
 * at 320x568 the map began at y=449 and only ~119px were available before
 * scrolled. The constant was the bug: the chrome above the map is not a fixed
 * height.
 *
 * This hook measures the map surface's REAL offset once and on every resize,
 * and writes the resulting height to a CSS custom property. The CSS keeps its
 * own fallback for the pre-measure/SSR frame, so first paint is unchanged.
 *
 * Loop safety (explicit): the element whose height we write is NOT observed —
 * only its parent (whose size does not depend on the map height) and the
 * window/viewport resize events. Writes are rAF-throttled and skipped when the
 * value does not change, so no resize<->measure feedback is possible and a
 * scroll never triggers a re-measure. Everything is cleaned up on unmount.
 */

/** CSS custom property the measured height is published to. */
export const MAP_VIEW_CSS_VAR = "--osm-map-height";
/**
 * Space kept below the map so the points-panel entry ("N points in this
 * view" + toggle) is discoverable without scrolling. That panel is the map's
 * keyboard/text equivalent — burying it under the fold was part of M02.
 */
export const MAP_VIEW_RESERVE_BOTTOM = 64;
/** Useful minimum: zoom control (44px stack) + attribution + map surface. */
export const MAP_VIEW_MIN_HEIGHT = 340;
/** Ceiling as a share of the viewport: the map never becomes the whole page. */
const MAP_VIEW_MAX_RATIO = 0.8;

/**
 * Height budget for a map surface that starts at `top` inside a `viewport`
 * tall window. Pure and total: unmeasurable inputs (pre-layout 0, NaN,
 * undefined) fall back to the useful minimum instead of 0/NaN.
 */
export function mapViewHeightFor(top: number | null | undefined, viewport: number | null | undefined): number {
  const offset = typeof top === "number" && Number.isFinite(top) ? Math.max(0, top) : NaN;
  const height = typeof viewport === "number" && Number.isFinite(viewport) ? viewport : NaN;
  if (!Number.isFinite(offset) || !Number.isFinite(height) || height <= 0) return MAP_VIEW_MIN_HEIGHT;
  const available = Math.floor(height - offset - MAP_VIEW_RESERVE_BOTTOM);
  const ceiling = Math.round(height * MAP_VIEW_MAX_RATIO);
  return Math.max(MAP_VIEW_MIN_HEIGHT, Math.min(available, ceiling));
}

/**
 * Publish the measured map height on `ref`'s element as `--osm-map-height`.
 * A no-op during SSR and before the element exists; safe to call
 * unconditionally from the map component.
 */
export function useMapViewHeight(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof window === "undefined") return;
    let frame: number | null = null;
    let applied = -1;
    const apply = () => {
      frame = null;
      // Dynamic browser bars: the visual viewport is the honest height on
      // mobile; fall back to innerHeight where it is unavailable.
      const viewport = Math.min(
        window.innerHeight || 0,
        window.visualViewport?.height ?? Number.POSITIVE_INFINITY,
      );
      const next = mapViewHeightFor(node.getBoundingClientRect().top, viewport);
      if (next === applied) return; // identity guard: never rewrite the same value
      applied = next;
      node.style.setProperty(MAP_VIEW_CSS_VAR, `${next}px`);
    };
    const schedule = () => {
      if (frame !== null) return; // rAF throttle: a burst of events = one measure
      frame = window.requestAnimationFrame(apply);
    };
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    // Observe the PARENT only: writing this element's height must never feed
    // back into the observer that triggered the write.
    const parent: Element | null = node.parentElement;
    const observer = typeof ResizeObserver === "function" && parent ? new ResizeObserver(schedule) : null;
    if (observer && parent) observer.observe(parent);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [ref]);
}
