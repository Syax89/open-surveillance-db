/**
 * One-line, log-safe summary of a caught error: `Name: message`, followed by
 * its `cause` chain (`<- Name: message`).
 *
 * Why (Workers Observability, 2026-11): `console.error(label, error)` on a
 * D1 failure reached Workers Logs as the stack frames ONLY
 * ("at D1DatabaseSessionAlwaysPrimary._sendOrThrow ..."), without the line
 * that says WHAT failed, so a week of 503s on the camera exports could not be
 * diagnosed from the logs. Callers log this summary next to the error object.
 *
 * Privacy (docs/PRIVACY_AND_SAFETY.md: logs carry no personal data): only use
 * it where the error cannot embed caller input, e.g. D1/SQLite errors, which
 * never echo bound parameter values. Never use it for errors whose message
 * may contain a URL or query text (upstream fetch/geocoder failures).
 * Defence in depth: email-shaped substrings are redacted and the result is
 * length-capped.
 */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MAX_CAUSE_DEPTH = 3;
export const ERROR_SUMMARY_MAX_LENGTH = 300;

function describeOne(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message ? `${error.name}: ${message}` : error.name;
  }
  if (typeof error === "string") return error;
  return typeof error;
}

export function errorSummary(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth += 1) {
    parts.push(describeOne(current));
    current = current instanceof Error ? (current as Error & { cause?: unknown }).cause : undefined;
  }
  const summary = parts.join(" <- ").replace(/\s+/g, " ").replace(EMAIL_PATTERN, "[email]");
  return summary.length > ERROR_SUMMARY_MAX_LENGTH ? `${summary.slice(0, ERROR_SUMMARY_MAX_LENGTH - 1)}…` : summary;
}
