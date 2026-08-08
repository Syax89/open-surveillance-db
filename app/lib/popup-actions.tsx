"use client";

import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { CommunityActions, type ActionCounts } from "../components/CommunityActions";
import { messages } from "./i18n";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./i18n/types";

/**
 * Standalone mount for the map marker popup action widget (ADR 0021 §3,
 * FASE 3 UI). The Leaflet popup is a raw HTML string bound by
 * SurveillanceMap; this helper renders the SAME CommunityActions component
 * into the popup's mount node as a separate React root.
 *
 * The popup root lives OUTSIDE the Next.js tree, so LocaleProvider context
 * (and its skip-link side effect) is unavailable: the locale is resolved
 * directly from the same storage/cookie the provider reads
 * (opensurveillancedb-locale), and the bundle is passed via the
 * CommunityActions `bundle` prop. A transient popup does not live-switch
 * language; on close/reopen the locale is re-read.
 *
 * Lifecycle: mountPopupActions on Leaflet 'popupopen', unmountPopupActions
 * on 'popupclose' — a stale React root inside a destroyed popup node would
 * leak and warn on every marker click.
 */

let activeRoot: { root: Root; node: HTMLElement; recordId: number } | null = null;

/**
 * Server-confirmed counts per record (BUG t_5bc23d61 — CEO 2026-08-08:
 * "il voto useful sulla mappa non persiste, rimane al numero precedente").
 *
 * The map's record payload (camera.usefulCount etc.) is a snapshot taken
 * BEFORE the vote, and the popup widget is re-seeded from it on EVERY
 * remount: the map rebuild path swaps the popup DOM for a FRESH
 * .osm-popup-community node (setPopupContent on a kept marker) and calls
 * mountPopupActions again with the stale payload counts, and a popup
 * close/reopen does the same. The widget's own (server-confirmed) state
 * is destroyed with the old root, so the visible count reverts.
 *
 * Fix: the widget reports every server-confirmed count change here (one
 * map per record), and mountPopupActions seeds remounts from this store,
 * falling back to the payload only when no vote has happened yet. The
 * server response is the ONLY authority — a stale payload must never
 * undo it.
 */
const confirmedCounts = new Map<number, ActionCounts>();

const STORAGE_KEY = "opensurveillancedb-locale";

function resolvePopupLocale(): Locale {
  if (typeof window === "undefined") return "en" as Locale;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved !== null) return resolveLocale(saved);
  // Cookie fallback (server-rendered preference).
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  return match ? resolveLocale(decodeURIComponent(match.slice(LOCALE_COOKIE.length + 1))) : resolveLocale(null);
}

/** Unmount the previous popup widget (a new popup replaced the old one). */
export function unmountPopupActions(): void {
  if (!activeRoot) return;
  activeRoot.root.unmount();
  activeRoot = null;
}

/**
 * Render the compact action widget into a popup mount node. `counts` come
 * from the shared record payload (list API already exposes them); the
 * widget falls back to zero when the seed lacks them.
 *
 * P0 t_bb310428 (popup flicker): the mount is IDEMPOTENT for the SAME
 * record + node — a popupopen that re-fires on the same popup (Leaflet
 * re-fires the event in some openPopup paths) must NOT unmount/remount the
 * root: a remount resets the widget's local state (counts, disclosure,
 * personal action) and makes the buttons visibly reset.
 */
export function mountPopupActions(node: HTMLElement, recordId: number, counts?: Partial<ActionCounts>): void {
  if (activeRoot && activeRoot.node === node && activeRoot.recordId === recordId) return;
  unmountPopupActions();
  const root = createRoot(node);
  // BUG t_5bc23d61: seed from the SERVER-CONFIRMED counts when this record
  // has already been voted on during this page session. The payload counts
  // passed by the map are a pre-vote snapshot; re-seeding from them after
  // a rebuild would revert the count the CEO just saw update.
  const seed = confirmedCounts.get(recordId) ?? counts;
  // P1-7 (review 2026-08-07): flush the first render synchronously. The
  // popupopen handler runs in a DOM event outside React's tree, and a
  // plain root.render is scheduled — the browser could paint the popup
  // with an empty mount node and mount the toolbar one frame later
  // (first-paint flicker, exactly what the P0 contract forbids). flushSync
  // forces the widget into the DOM before the popup becomes visible.
  flushSync(() => {
    root.render(
      <CommunityActions
        recordId={recordId}
        counts={seed}
        compact
        bundle={messages[resolvePopupLocale()]}
        onCountsChange={(next) => { confirmedCounts.set(recordId, next); }}
      />,
    );
  });
  activeRoot = { root, node, recordId };
}
