"use client";

// Shared document-scroll lock for the confirmation-modal family (C6 /
// api-keys epic T18). Every dialog that mounts the shared
// .confirm-dialog-backdrop shell calls useModalScrollLock(open) — the root
// lock lives HERE, once, and NOT in CSS: a CSS-only root lock
// (html/body overflow-y:hidden keyed on :has(.confirm-dialog-backdrop))
// was proven inadequate on real Chromium — a native wheel over the
// scrollable API-key create dialog still moved
// document.scrollingElement.scrollTop while the dialog itself scrolled.
// A body pinned with position:fixed has no scrollable content to move, so
// no wheel/touch gesture can reach the page behind the modal on any engine
// (desktop Chromium, Firefox, Safari, iOS/Android).
//
// Contract (pinned by tests/a11y-interactive.test.mjs):
//  - REFERENCE-COUNTED at module scope: all dialog instances share ONE
//    lock. The first open saves + locks; the last close queues restore for
//    the next microtask. A new modal effect in the same React commit
//    invalidates that pending release, so overlapping dialogs and the
//    API-key create → reveal transition never unlock/relock the page.
//  - EXACT RESTORE: the prior inline styles of <html> and <body> and the
//    current document scroll position are captured at first lock and
//    restored verbatim at last unlock (getAttribute("style") round-trip),
//    so a dialog never clobbers unrelated inline styles.
//  - FIXED-BODY PATTERN (mobile-safe): body is pinned with
//    position:fixed + top:-scrollY (+ left/right + width:100%) and html/
//    body get inline overflow:hidden, so the background cannot move on
//    mobile either; the shell's own internal scrolling (backdrop + dialog
//    overflow-y:auto with overscroll-behavior:contain) is untouched.

import { useEffect } from "react";

let lockCount = 0;
let releaseGeneration = 0;
let documentScrollLocked = false;
let savedHtmlStyle: string | null = null;
let savedBodyStyle: string | null = null;
let savedScrollTop = 0;

function lockDocumentScroll(): void {
  const html = document.documentElement;
  const body = document.body;
  const scroller = document.scrollingElement ?? html;
  savedHtmlStyle = html.getAttribute("style");
  savedBodyStyle = body.getAttribute("style");
  savedScrollTop = scroller.scrollTop;

  // Pin the page behind the modal: a fixed body cannot be scrolled by a
  // wheel or touch gesture, and html/body overflow:hidden is the
  // belt-and-braces lock for the root scroller on every engine.
  body.style.position = "fixed";
  body.style.top = `-${savedScrollTop}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
  html.style.overflow = "hidden";
  documentScrollLocked = true;
}

function restoreDocumentScroll(): void {
  const html = document.documentElement;
  const body = document.body;
  const scroller = document.scrollingElement ?? html;
  // Restore the exact prior inline styles (verbatim round-trip).
  if (savedHtmlStyle === null) html.removeAttribute("style");
  else html.setAttribute("style", savedHtmlStyle);
  if (savedBodyStyle === null) body.removeAttribute("style");
  else body.setAttribute("style", savedBodyStyle);
  // The global stylesheet uses smooth scrolling. Force this restoration to
  // be synchronous so closing a dialog returns to the exact captured offset
  // rather than visibly animating the page behind it.
  html.style.scrollBehavior = "auto";
  scroller.scrollTop = savedScrollTop;
  if (savedHtmlStyle === null) html.removeAttribute("style");
  else html.setAttribute("style", savedHtmlStyle);
  documentScrollLocked = false;
  savedHtmlStyle = null;
  savedBodyStyle = null;
  savedScrollTop = 0;
}

/**
 * Acquire the shared document-scroll lock (first caller saves + pins the
 * page) and return the matching release function (last caller restores).
 */
function acquireDocumentScrollLock(): () => void {
  // React cleans up the old passive effect before setting up the next one.
  // In the API-key create → reveal swap that briefly takes the count to zero;
  // invalidate a pending last-release so the same commit never unlocks/relocks
  // the document between its two dialog effects.
  releaseGeneration += 1;
  lockCount += 1;
  if (!documentScrollLocked) lockDocumentScroll();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount -= 1;
    if (lockCount !== 0) return;

    const generationAtRelease = ++releaseGeneration;
    queueMicrotask(() => {
      if (lockCount !== 0 || releaseGeneration !== generationAtRelease || !documentScrollLocked) return;
      restoreDocumentScroll();
    });
  };
}

/**
 * Lock document scrolling while a confirmation modal is open.
 *
 * Call unconditionally (hooks rules) with the dialog's `open` prop: the
 * lock is acquired when the first shared-shell dialog opens and released
 * only when the last one closes, so the page behind the modal never moves.
 */
export function useModalScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return acquireDocumentScrollLock();
  }, [active]);
}
