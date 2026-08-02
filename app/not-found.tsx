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
 */
export default function NotFound() {
  return <ErrorPage statusCode={404} />;
}
