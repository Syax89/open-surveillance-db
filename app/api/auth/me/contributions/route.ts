import { env } from "cloudflare:workers";
import { resolveOptionalContributor } from "../../../../lib/auth-session";
import { authLimit } from "../../../../lib/auth-route-helpers";
import { urlTooLong } from "../../../../lib/input-limits";
import { trustLevelMeta } from "../../../../lib/trust-levels";
import {
  CONTRIBUTION_STATUSES,
  CONTRIBUTION_TYPES,
  countVerifiedCameras,
  listContributorContributions,
  type ContributionType,
} from "../../../../../db/auth";

/**
 * GET /api/auth/me/contributions — the authenticated contributor's own
 * attributed contributions (camera reports, corrections, photo uploads),
 * paginated with the canonical F0 pagination contract
 * (page/pageSize default 25, hard max 100, `pagination` object) and the
 * trust level in the response meta.
 *
 * Guard order:
 *  1. 414 on absurdly long URLs (shared input limit);
 *  2. 429 on the shared auth rate-limit bucket;
 *  3. 401 when anonymous (own data only, never someone else's);
 *  4. 400 when a whitelist filter (type/status) or a page number is invalid;
 *  5. 503 when the database is unavailable.
 *
 * Privacy/safety by design:
 *  - Cache-Control: no-store — personal data must never be edge-cached;
 *  - only rows attributed to the caller are returned; there is no
 *    cross-account path (a `contributorId` targeting another account is
 *    rejected with 400, never resolved);
 *  - the level in the meta is the caller's own, derived from
 *    countVerifiedCameras — no endpoint exposes anyone else's or a global
 *    level (COMMUNITY_PLAN §3.1).
 *
 * The old GET /api/auth/me/submissions stays for backward compatibility
 * (deprecated; see DATA_MODEL.md / DATA_DICTIONARY.md).
 */
export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  const blocked = authLimit(request, env, "/api/auth/me/contributions");
  if (blocked) return blocked;

  const url = new URL(request.url);

  // Cross-account guard: the endpoint is self-scoped. A caller who tries to
  // address another account by id answers 400 — the id is never used to
  // resolve anything, it only signals an invalid request shape.
  const targetAccount = url.searchParams.get("contributorId");
  if (targetAccount !== null && targetAccount.trim() !== "") {
    return Response.json(
      { error: "This endpoint only serves the authenticated contributor's own contributions." },
      { status: 400 },
    );
  }

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Whitelist filters: unknown type/status values are a 400, never a
    // silent empty result (a typo must be loud, not look like "no data").
    const typeRaw = url.searchParams.get("type");
    let type: ContributionType | undefined;
    if (typeRaw !== null && typeRaw.trim() !== "") {
      if (!(CONTRIBUTION_TYPES as readonly string[]).includes(typeRaw.trim())) {
        return Response.json(
          { error: `type must be one of: ${CONTRIBUTION_TYPES.join(", ")}.` },
          { status: 400 },
        );
      }
      type = typeRaw.trim() as ContributionType;
    }

    const statusRaw = url.searchParams.get("status");
    let status: string | undefined;
    if (statusRaw !== null && statusRaw.trim() !== "") {
      if (!(CONTRIBUTION_STATUSES as readonly string[]).includes(statusRaw.trim())) {
        return Response.json(
          { error: `status must be one of: ${CONTRIBUTION_STATUSES.join(", ")}.` },
          { status: 400 },
        );
      }
      status = statusRaw.trim();
    }

    // Pagination (F0 canonical contract): page is 1-based, pageSize defaults
    // to 25 with a hard cap of 100. Non-numeric or out-of-range values are a
    // 400; pageSize is clamped at the db boundary too, defense in depth.
    const page = readPageNumber(url.searchParams.get("page"), 1);
    const pageSize = readPageNumber(url.searchParams.get("pageSize"), 25, 100);
    if (page === null || pageSize === null) {
      return Response.json(
        { error: "page must be a positive integer and pageSize an integer between 1 and 100." },
        { status: 400 },
      );
    }

    const offset = (page - 1) * pageSize;
    const [pageResult, verifiedCount] = await Promise.all([
      listContributorContributions(resolved.contributor.id, { type, status, limit: pageSize, offset }),
      countVerifiedCameras(resolved.contributor.id),
    ]);

    const totalPages = Math.ceil(pageResult.total / pageSize);
    return Response.json(
      {
        contributions: pageResult.contributions,
        pagination: {
          page,
          pageSize,
          total: pageResult.total,
          totalPages,
          hasMore: page < totalPages,
        },
        level: trustLevelMeta(verifiedCount),
      },
      {
        // Personal data: never edge-cache.
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("GET /api/auth/me/contributions failed", error);
    return Response.json({ error: "Unable to list your contributions" }, { status: 503 });
  }
}

/**
 * Parse a page/pageSize query value: blank → fallback; otherwise a positive
 * integer, clamped to `max` (when given). Returns null for anything else so
 * the route can answer 400.
 */
function readPageNumber(value: string | null, fallback: number, max?: number): number | null {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return max === undefined ? parsed : Math.min(parsed, max);
}
