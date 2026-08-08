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
 * Maximum accepted pagination `offset` on the search/nearby routes.
 *
 * The list endpoint (GET /api/cameras) does NOT use this cap anymore
 * (kanban t_e86c91c4): a fixed offset cap broke the legitimate client walk
 * once the dataset grew past 10_000 records (the /directory walk requested
 * offsets beyond 10_000 and got 400 → empty state). Pagination protection
 * for the list lives at the db boundary instead (db/cameras.ts answers an
 * empty page for offset >= total without running the SELECT, so a hostile
 * `?offset=9007199254740991` can never force an astronomical SQL OFFSET on
 * the D1 — review P2-4 preserved, but scaled to the real dataset size).
 *
 * `limit` is clamped to a hard cap (500 / 100), so a hostile client could
 * otherwise pass `?offset=9007199254740991` (MAX_SAFE_INTEGER — accepted by
 * the plain-integer validator) and force an astronomical SQL OFFSET on the
 * D1 on every request: a slow full scan that returns nothing (review P2-4).
 * Search/nearby keep the fixed cap because their result sets are inherently
 * bounded (proximity/locality queries) and deep pagination there is never
 * legitimate.
 */
export const MAX_PAGE_OFFSET = 10_000;

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
