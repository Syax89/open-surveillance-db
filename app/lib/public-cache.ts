/**
 * Shared public-read cache (CEO 2026-08-07, DB-lightening): wraps a
 * GET handler's database work with the Cloudflare Cache API so the
 * worker itself can serve repeat requests WITHOUT hitting D1.
 *
 * Why this exists: the public routes already emit CDN Cache-Control
 * headers (s-maxage/SWR + Cache-Tag), but those only help when a CDN
 * sits in front of the worker (Cloudflare edge). On the container/dev
 * deployment there is no CDN — every request reaches the worker and
 * every request hits the database. This wrapper gives the worker a
 * bounded in-process cache with the same policy as the edge headers.
 *
 * Contract (mirrors app/api/geocode/route.ts):
 *   - cache key = the request URL (query-string sensitive: bbox/kind/
 *     freshness/sort/limit/offset are all part of the key);
 *   - only status 200 responses are stored (errors and 4xx are never
 *     cached);
 *   - the stored response keeps its original headers (Cache-Control,
 *     Cache-Tag for moderation purge) plus an X-OSDB-Cache marker;
 *   - fail-open: any cache read/write error falls back to the builder —
 *     the cache must never take the route down;
 *   - a STREAMED body (markStreamedResponse: the full CSV/GeoJSON exports)
 *     is never buffered to be cached: see cacheStreamedResponse below.
 */
import { getRequestExecutionContext } from "vinext/shims/request-context";

export function publicCache(): Cache | null {
  return typeof caches !== "undefined" ? caches.default : null;
}

export async function withPublicCache(
  request: Request,
  ttlSeconds: number,
  build: () => Promise<Response>,
): Promise<Response> {
  const cache = publicCache();
  if (cache) {
    try {
      const cacheKey = new Request(request.url);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-OSDB-Cache", "hit");
        return new Response(cached.body, { status: cached.status, headers });
      }
    } catch (error) {
      console.error("public-cache read failed (fail-open)", error);
    }
  }

  const response = await build();

  if (cache && response.status === 200 && streamedResponses.has(response)) {
    return cacheStreamedResponse(cache, request, ttlSeconds, response);
  }

  if (cache && response.status === 200) {
    try {
      const headers = new Headers(response.headers);
      // The stored entry's TTL comes from its Cache-Control; routes that
      // already emit s-maxage/SWR (list, bbox, record) keep theirs — this
      // is only a sensible fallback so a route can never cache forever by
      // accident.
      if (!headers.has("Cache-Control")) {
        headers.set("Cache-Control", `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);
      }
      headers.set("X-OSDB-Cache", "miss");
      const cacheKey = new Request(request.url);
      await cache.put(cacheKey, new Response(response.clone().body, { status: response.status, headers }));
      // Mirror the marker on the response we hand back to the caller, so
      // a miss is observable from both sides of the cache boundary.
      response.headers.set("X-OSDB-Cache", "miss");
    } catch (error) {
      console.error("public-cache write failed (fail-open)", error);
    }
  }

  return response;
}

const streamedResponses = new WeakSet<Response>();

/**
 * Flags a response whose body is a stream that must never be held in memory
 * as a whole (the full CSV/GeoJSON exports, ~273k rows: buffering them
 * exceeded the 128 MB isolate limit). withPublicCache then caches it through
 * cacheStreamedResponse instead of `await cache.put(response.clone())`:
 * that await drains the cache branch of the clone's tee before the client
 * branch is read, so the tee would keep the WHOLE body queued for the client.
 */
export function markStreamedResponse(response: Response): Response {
  streamedResponses.add(response);
  return response;
}

/**
 * Cache-miss path for a streamed body. The body is split with lockstepTee
 * (bounded: the source is read only when BOTH the client and the cache
 * writer want the next chunk) and the cache write runs in ctx.waitUntil,
 * concurrently with the client download instead of before it.
 *
 * Deliberate bypass: without a request ExecutionContext (plain-Node dev
 * server, tests) there is no waitUntil to carry the write past the return,
 * and awaiting it here would deadlock the lockstep tee (the client branch is
 * not read until we return), so the response is served uncached.
 *
 * A client that disconnects aborts the source and the cache write (no
 * partial entry, no D1 walk for nobody); a cache write that fails is
 * detached and the client download carries on.
 */
function cacheStreamedResponse(cache: Cache, request: Request, ttlSeconds: number, response: Response): Response {
  const ctx = getRequestExecutionContext();
  if (!ctx || !response.body) return response;
  try {
    const stored = new Headers(response.headers);
    if (!stored.has("Cache-Control")) {
      stored.set("Cache-Control", `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);
    }
    stored.set("X-OSDB-Cache", "miss");
    const tee = lockstepTee(response.body);
    let put: Promise<void>;
    try {
      put = cache.put(new Request(request.url), new Response(tee.secondary, { status: response.status, headers: stored }));
    } catch (error) {
      put = Promise.reject(error);
    }
    ctx.waitUntil(
      put.catch((error: unknown) => {
        tee.detachSecondary(error);
        console.error("public-cache write failed (fail-open)", error);
      }),
    );
    const headers = new Headers(response.headers);
    headers.set("X-OSDB-Cache", "miss");
    return new Response(tee.primary, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error("public-cache write failed (fail-open)", error);
    return response;
  }
}

/**
 * Splits `source` into two streams that advance together: a chunk is read
 * from the source only once every live branch has asked for one, so at most
 * one chunk is in flight and nothing accumulates for the slower reader
 * (ReadableStream.tee() buffers without bound for the slower branch).
 *
 * - cancelling `primary` (the client went away) cancels the source and
 *   errors `secondary`;
 * - cancelling `secondary`, or `detachSecondary(reason)`, drops it and lets
 *   `primary` carry on alone;
 * - a source error errors both branches.
 */
export function lockstepTee(source: ReadableStream<Uint8Array>): {
  primary: ReadableStream<Uint8Array>;
  secondary: ReadableStream<Uint8Array>;
  detachSecondary: (reason?: unknown) => void;
} {
  type Branch = {
    controller: ReadableStreamDefaultController<Uint8Array> | null;
    live: boolean;
    waiting: (() => void) | null;
  };
  const reader = source.getReader();
  const branches: Branch[] = [];
  let reading = false;

  const release = (branch: Branch) => {
    const resolve = branch.waiting;
    branch.waiting = null;
    resolve?.();
  };
  const fail = (branch: Branch, reason: unknown) => {
    if (!branch.live) return;
    branch.live = false;
    try {
      branch.controller?.error(reason);
    } catch {
      // already closed or errored
    }
    release(branch);
  };
  const maybeRead = () => {
    const live = branches.filter((branch) => branch.live);
    if (reading || live.length === 0 || live.some((branch) => !branch.waiting)) return;
    reading = true;
    reader.read().then(
      ({ done, value }) => {
        reading = false;
        for (const branch of branches.filter((candidate) => candidate.live)) {
          try {
            if (done) branch.controller?.close();
            else branch.controller?.enqueue(value);
          } catch {
            // the branch was closed under us; nothing to deliver
          }
          if (done) branch.live = false;
          release(branch);
        }
      },
      (error: unknown) => {
        reading = false;
        for (const branch of branches) fail(branch, error);
      },
    );
  };
  const drop = (branch: Branch, reason: unknown) => {
    if (!branch.live) return;
    branch.live = false;
    release(branch);
    if (branches.every((candidate) => !candidate.live)) {
      reader.cancel(reason).catch(() => {});
    } else {
      maybeRead();
    }
  };
  const makeBranch = (onCancel: (branch: Branch, reason: unknown) => void) => {
    const branch: Branch = { controller: null, live: true, waiting: null };
    branches.push(branch);
    const stream = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          branch.controller = controller;
        },
        pull() {
          return new Promise<void>((resolve) => {
            branch.waiting = resolve;
            maybeRead();
          });
        },
        cancel(reason) {
          onCancel(branch, reason);
        },
      },
      { highWaterMark: 0 },
    );
    return { branch, stream };
  };

  const secondary = makeBranch(drop);
  const primary = makeBranch((branch, reason) => {
    fail(secondary.branch, reason ?? new Error("primary branch cancelled"));
    drop(branch, reason);
  });
  return {
    primary: primary.stream,
    secondary: secondary.stream,
    detachSecondary: (reason?: unknown) => {
      if (!secondary.branch.live) return;
      fail(secondary.branch, reason ?? new Error("secondary branch detached"));
      maybeRead();
    },
  };
}
