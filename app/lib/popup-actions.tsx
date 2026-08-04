"use client";

import { createRoot, type Root } from "react-dom/client";
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

let activeRoot: { root: Root; node: HTMLElement } | null = null;

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
 */
export function mountPopupActions(node: HTMLElement, recordId: number, counts?: Partial<ActionCounts>): void {
  unmountPopupActions();
  const root = createRoot(node);
  root.render(
    <CommunityActions
      recordId={recordId}
      counts={counts}
      compact
      bundle={messages[resolvePopupLocale()]}
    />,
  );
  activeRoot = { root, node };
}
