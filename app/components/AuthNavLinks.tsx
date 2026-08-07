"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
// Header lives on EVERY page: import only the `auth` domain (F5 qa#5,
// t_ab0d4c75) instead of the full dictionary via useMessages().
import { useLocale } from "./LocaleProvider";
import { en as authEn, it as authIt } from "../lib/i18n/auth";
import type { Locale, Translation } from "../lib/i18n";
import { fetchSessionMe } from "../lib/session-fetch";

const authByLocale: Record<Locale, Translation<typeof authEn>> = {
  en: authEn,
  it: authIt,
};

/**
 * AuthNavLinks — login/register/account links of the shared public header
 * (CEO request 2026-08-02, kanban t_65b778c5; mobile placement fix
 * t_94b3726d).
 *
 * The public nav (PublicNavLinks) keeps its primary content links;
 * this component renders the auth entry point as the LAST item of the
 * .nav-links container (PublicNav renders it right after PublicNavLinks).
 * On mobile (<768px) .nav-links is the hamburger dropdown, so the auth
 * links travel inside the menu (CEO live feedback 2026-08-02: they used to
 * sit in a separate top-right element and wrapped the header at 320/390px);
 * on desktop (≥768px) the container is the inline nav row and the links
 * stay visible in the header, pushed to the right end next to the
 * LocaleToggle.
 *
 * Session state (server half: app/lib/auth-session.ts): the header cannot
 * call resolveOptionalContributor() (it needs the raw Request), so it reads
 * the public GET /api/auth/me endpoint — the same call the account page
 * makes (AccountPageBody). Privacy by design:
 *  - the initial state renders NOTHING (no flash of "Log in" for a signed-in
 *    user, no session leak into SSR HTML);
 *  - a network/endpoint failure also renders nothing (fail-closed: never
 *    claim "anonymous" — or "signed in" — on an error we cannot interpret);
 *  - only the display name (or the generic account label) is rendered, the
 *    response's personal data is never copied into the DOM.
 *
 * States:
 *  - unknown (initial / error): render nothing;
 *  - anonymous (401): "Log in" (/login) + "Create account" (/register);
 *  - authenticated (200): account link (/account), label = displayName when
 *    present, else the localized account title; aria-label always.
 *
 * a11y (WCAG 2.2 AA): labels come from the existing auth bundle
 * (app/lib/i18n/auth.ts — EN login:21/register:22, IT login:90/register:91);
 * the current page is marked aria-current="page" on the matching link.
 */
type AuthState =
  | { status: "unknown" }
  | { status: "anonymous" }
  | { status: "authenticated"; displayName: string | null };

export function AuthNavLinks() {
  const { locale } = useLocale();
  const t = authByLocale[locale];
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthState>({ status: "unknown" });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        // QA#2 F3: bounded retry on 429 — the endpoint has its own
        // generous session bucket (120/min), and a transient burst
        // (back/forward spam, shared NAT IP) retries briefly instead of
        // silently dropping the session links.
        const response = await fetchSessionMe(controller.signal);
        if (cancelled) return;
        if (response.status === 401) {
          setAuth({ status: "anonymous" });
          return;
        }
        if (!response.ok) {
          // Unexpected status (5xx, rate-limited…): fail closed, no links.
          setAuth({ status: "unknown" });
          return;
        }
        const body = (await response.json()) as { contributor?: { displayName?: string | null } };
        if (cancelled) return;
        setAuth({
          status: "authenticated",
          displayName: body.contributor?.displayName ?? null,
        });
      } catch {
        // Network error / fetch unavailable: fail closed, no links.
        if (!cancelled) setAuth({ status: "unknown" });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (auth.status === "unknown") return null;

  if (auth.status === "authenticated") {
    return (
      <span className="auth-nav-links">
        <Link
          href="/account"
          className="nav-action"
          aria-label={t.accountAria}
          aria-current={pathname === "/account" ? "page" : undefined}
        >
          {auth.displayName ?? t.accountTitle}
        </Link>
      </span>
    );
  }

  return (
    <span className="auth-nav-links">
      <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined}>
        {t.login}
      </Link>
      <Link
        href="/register"
        className="nav-action"
        aria-current={pathname === "/register" ? "page" : undefined}
      >
        {t.register}
      </Link>
    </span>
  );
}
