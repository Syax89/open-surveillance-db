"use client";

import ErrorPage from "./components/ErrorPage";

/**
 * Root error boundary (t_7eed4601).
 *
 * Next.js renders this file for unhandled errors thrown by a Server
 * Component or route handler below the root layout (HTTP 500). It shares
 * the same design-system shell as the 404 page and adds a "Try again"
 * button wired to reset(), which re-renders the segment that failed.
 *
 * Must be a client component (error boundary contract) and must not echo
 * the error message: the copy is generic, so no internal detail leaks.
 * Logging happens server-side; this page only tells the user something
 * went wrong and how to get back on track.
 */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPage statusCode={500} onRetry={reset} />;
}
