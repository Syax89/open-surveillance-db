import ErrorPage from "./components/ErrorPage";

/**
 * Custom 404 page (t_7eed4601).
 *
 * Next.js renders this file for non-existent routes and for every
 * notFound() call (e.g. app/records/[id]/page.tsx rejects a malformed id).
 * The copy is resolved via the shared client ErrorPage shell, which reads
 * the persisted locale through LocaleProvider — the root layout already
 * wraps every route, error pages included.
 *
 * No data is echoed here: a 404 must not leak what was requested or why
 * the route is missing (privacy and safety by design).
 *
 * F5 (P3-3, WCAG 2.4.2): the error pages set their own document <title>
 * ("Page not found — OpenSurveillanceDB" / "Something went wrong —
 * OpenSurveillanceDB") client-side inside ErrorPage (useEffect). This
 * vinext build does not resolve generateMetadata from not-found.tsx, so
 * the client effect is the reliable path — it covers both the 404 and the
 * 500 (error.tsx is a client boundary and cannot export metadata at all).
 */
export default function NotFound() {
  return <ErrorPage statusCode={404} />;
}
