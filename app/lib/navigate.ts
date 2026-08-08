/**
 * Hard navigation helper for auth success redirects.
 *
 * After a successful login/register the fresh session cookies are set by
 * the fetch response; a FULL page load guarantees the SSR pass reads them.
 * router.push() + refresh() does NOT work on the vinext dev server: the
 * RSC request fires but the UI stays frozen on the login page (reproduced
 * live on the pre-prod domain, 2026-08-08 — passkey login: complete 200,
 * /account RSC 200, no visual change until a manual reload).
 *
 * Kept in its own module so the DOM test harness can stub it exactly like
 * it stubs next/navigation (tests assert the recorded destinations).
 */
export function hardNavigate(href: string): void {
  window.location.assign(href);
}
