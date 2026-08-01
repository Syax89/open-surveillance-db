/**
 * Input size limits for request bodies and URLs.
 *
 * Layer 4 of the abuse controls described in docs/workstreams/OPS_OPEN.md
 * (§Service protections): schema validation and per-field caps live in the
 * route handlers, while this module caps the raw transport inputs — JSON body
 * bytes and URL length — before any parsing or database work happens.
 *
 * The 32 KiB body cap is generous for every documented API payload (the
 * largest field, correction `message`, is capped at 1500 characters) while
 * still rejecting multi-megabyte spam bodies cheaply.
 */

type EnvLike = { [key: string]: unknown };

export const DEFAULT_MAX_BODY_BYTES = 32 * 1024; // 32 KiB
export const DEFAULT_MAX_URL_CHARS = 4096;

/**
 * Base class for transport-level request-body errors that carry an HTTP
 * status. Handlers answer `status` with `error.message`; subclasses pin
 * specific codes (413 too large, 400 malformed JSON).
 */
export class BodyReadError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "BodyReadError";
    this.status = status;
  }
}

/** Thrown when a request body exceeds the configured byte cap. */
export class PayloadTooLargeError extends BodyReadError {
  constructor(message = "Request body too large.") {
    super(message, 413);
    this.name = "PayloadTooLargeError";
  }
}

/** Thrown when a request body is syntactically invalid JSON. */
export class MalformedJsonError extends BodyReadError {
  constructor(message = "Request body is not valid JSON.") {
    super(message, 400);
    this.name = "MalformedJsonError";
  }
}

export function maxBodyBytes(env: unknown): number {
  const value = Number((env as EnvLike).MAX_BODY_BYTES);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_BODY_BYTES;
}

/** Reject absurdly long URLs before query parsing or routing work. */
export function urlTooLong(request: Request): boolean {
  return request.url.length > DEFAULT_MAX_URL_CHARS;
}

/**
 * Parse a JSON request body under a byte cap.
 *
 * - Body over the cap (declared via Content-Length or measured after read):
 *   throws `PayloadTooLargeError` → handlers answer 413.
 * - Malformed JSON / unreadable body: throws `MalformedJsonError` → handlers
 *   answer 400 with a clear message instead of a 500.
 * - Valid JSON (including `null`): returned as-is for the handler's own
 *   schema validation (null bodies already answer 400, see OSDB-QA-001).
 */
export async function readJsonBody(request: Request, env: unknown): Promise<unknown> {
  const cap = maxBodyBytes(env);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > cap) {
    throw new PayloadTooLargeError();
  }
  const text = await request.text();
  if (text.length > cap) {
    throw new PayloadTooLargeError();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new MalformedJsonError();
  }
}
