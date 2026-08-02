"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useMessages } from "./LocaleProvider";

/**
 * AuthNavLinks — login/register/account links in the TOP-RIGHT of the
 * shared public header (CEO request 2026-08-02, kanban t_65b778c5).
 *
 * The public nav (PublicNavLinks, t_a72a3106) keeps its six content links;
 * this component renders the auth entry point as a SEPARATE element on the
 * right of the LocaleToggle (SiteHeader `trailing` prop), so it is always
 * visible — also on mobile, where .nav-links collapses into the hamburger
 * menu.
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
  const t = useMessages().auth;
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthState>({ status: "unknown" });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/auth/me", { signal: controller.signal });
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
