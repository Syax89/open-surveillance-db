"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
// F5 qa#5 (t_ab0d4c75): useMessages moved out of LocaleProvider to keep
// the root layout graph light — import the typed bundle from lib.
import { useMessages } from "../lib/use-messages";

/**
 * LegalTableWrap — keyboard access for the scrollable legal tables
 * (QA#2 finding F1, axe serious, WCAG 2.1.1 / scrollable-region-focusable).
 *
 * The legal pages (/privacy, /termini, /licenze) render wide data tables
 * inside a horizontally scrollable wrapper (.legal-table-wrap, overflow-x:
 * auto in globals.css). A scrollable region that is NOT focusable is
 * unreachable for keyboard users — they can Tab past it but never scroll
 * its content (axe: scrollable-region-focusable, serious). The QA audit
 * flagged /privacy on this rule.
 *
 * Fix (per QA recommendation): make the wrapper a keyboard-focusable
 * region, but ONLY when the table actually overflows:
 *   - measuring happens client-side (scrollWidth > clientWidth), because
 *     overflow depends on the viewport and cannot be known at SSR time;
 *   - when overflowing: tabIndex={0} + role="region" + a localized
 *     aria-label, so a Tab lands on the region and arrow keys scroll it;
 *   - when the table fits: plain div, NO extra tab stop (the tab order
 *     stays untouched for the common desktop case).
 *
 * The aria-label comes from the home message bundle (the same bundle the
 * legal pages use for their nav labels), localized EN/IT like everything
 * else.
 */
export function LegalTableWrap({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const t = useMessages().home;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth);
    check();
    // Re-check on resize (viewport changes can make a fitting table
    // overflow and vice versa). ResizeObserver is guarded: jsdom and old
    // browsers lack it, the window resize listener covers the fallback.
    window.addEventListener("resize", check);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(check);
      observer.observe(el);
    }
    return () => {
      window.removeEventListener("resize", check);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="legal-table-wrap"
      {...(overflowing
        ? { tabIndex: 0, role: "region", "aria-label": t.tableScrollAria }
        : {})}
    >
      {children}
    </div>
  );
}
