# ADR 0023: Per-user private write API keys with a unified write-auth gate

- **Status:** accepted (CEO decision, 2026-08-09)
- **Date:** 2026-08-09
- **Author:** Simone Rondina (project owner), recording the CEO decision of
  2026-08-09 (decisions D1–D13, approved on the epic
  [t_3fb55b43] — decision log on [t_98e46fdb])
- **Decision owner:** CEO (Simone) — decisions D1–D13 approved 2026-08-09
- **Updates:** ADR 0020 (multi-method authentication — the verified-account
  write gate gains an API-key authentication path; the session path is
  unchanged except for decision 10 below, which tightens the PATCH edit gate)
- **Related ADRs:** 0013 (contributor accounts and sessions — session/CSRF
  baseline unchanged), 0018 (community verifications and trust levels — the
  PATCH edit gate interacts with the L1 gate), 0019 (pre-submit duplicate
  confirmation gate — unchanged, still runs on the submit path), 0003
  (moderation access control — the worker edge gate is untouched), 0004
  (retention and review cycle — R21 extends the schedule)
- **Related docs:** implementation plan (2026-08-09,
  `/home/simone/.hermes/plans/2026-08-09_223218-osdb-write-api-keys.md`,
  outside the repo), `docs/DATA_MODEL.md` (api_keys table),
  `docs/legal/RETENTION_SCHEDULE.md` (new R21),
  `docs/legal/PRIVACY_NOTICE.md`, `docs/TERMS_OF_USE.md`,
  `docs/PRIVACY_AND_SAFETY.md`, `docs/SECURITY.md`,
  `app/lib/i18n/api.ts` (read API stays keyless — copy to be extended)

## Context

Every write in OSDB today requires a browser session. `POST /api/cameras` and
`POST /api/corrections` pass the `submit` rate-limit family, then
`requireVerifiedContributor`, then `sameOrigin` + `csrfVerified`; `PUT/DELETE`
confirmation and actions routes pass `guardMutation`; `PATCH /api/cameras/[id]`
(edit) calls `resolveOptionalContributor` only — **no verification gate at
all** (a known identity gap). The public read API, by contrast, is
deliberately keyless — "No API key, no registration" is the documented promise
in `app/lib/i18n/api.ts` and the reason the directory is frictionless to
consume.

Verified contributors who automate submissions (scripts, cron jobs, local
tooling) are forced to either keep a live browser session or scrape the
session cookie — neither is a reasonable credential for a machine. The gap is
not just ergonomics: an unattended session cookie is a standing account
takeover risk, and the unauthenticated PATCH edit route lets any caller mutate
cameras if they guess an id.

The existing credential machinery gives us the primitives we need:
`sessions` stores only SHA-256 hashes of opaque raw tokens
(`db/auth.ts` — `sha256Hex`, `randomBase64Url`), constant-time compare
already exists, and PBKDF2 runs on WebCrypto. The runtime constraint is
Cloudflare Workers + D1 with WebCrypto only (no `node:crypto`), which shapes
what is cryptographically honest here (decision 3).

API keys identify a verified account, so they are **personal data**: their
retention, erasure and disclosure must be recorded in the same legal
machinery as every other per-account row (R-rules, art. 17 erasure batch).

## Decision

1. **Write-only keys. The read API stays keyless.** This feature authenticates
   the five write routes only; every public read endpoint remains open with
   no key and no registration, preserving the existing promise in
   `app/lib/i18n/api.ts` (D1).
2. **Key format.** Raw key = `osdb_` + 32 random bytes base64url (≈ 50
   characters), generated with the existing `randomBase64Url(32)`. `key_prefix`
   = first 10 characters of the raw key, stored for display only. The raw key
   is returned **exactly once** (the 201 creation response) and never stored,
   logged, or emitted again (D2).
3. **Storage — SHA-256 hex only.** Store the full SHA-256 hex of the raw key
   (`sha256Hex`, WebCrypto), with a unique index on the full hash; compare in
   constant time. **No pepper** (the 256-bit key entropy already defeats
   offline attack), **no scrypt/argon2** (not available in WebCrypto and
   pointless for high-entropy keys) (D3).
4. **Scopes — family-level, code-validated whitelist.** Four scopes:
   `submit` (cameras + corrections), `confirm`, `edit`, `action`. Default at
   mint = all four; a client may narrow. Whitelist is validated in code, never
   free-form; stored as JSON text in `scopes` (D4).
5. **Cap — 5 active keys per contributor**, server-enforced **atomically inside
   the INSERT** (the active-key count and the insert are one conditional SQL
   statement, so concurrent mints cannot overshoot a stale count; 409 on
   overflow), env knob `API_KEYS_MAX_PER_CONTRIBUTOR` (default 5) (D5).
6. **Expiry.** Optional `expires_at` at mint; default 365 days
   (`API_KEYS_DEFAULT_TTL_DAYS`). Expiries are stored as **canonical ISO-8601
   UTC TEXT** (any client-supplied offset is normalised at mint), and
   liveness is judged by the **instant** (`Date.parse`/`julianday`), never by
   string order — a key whose offset-bearing expiry is temporally past is
   dead even when its raw string sorts after `now`. An expired key answers
   **401** on every write, uniformly (D6).
7. **`last_used_at` throttled** — updated at most once per 5 minutes per key,
   stored as ISO-8601 UTC TEXT with like-for-like string comparisons; never
   SQLite `datetime('now')` (D7).
8. **Rate limits — per-key additive to per-IP.** After successful key
   resolution, `checkRateLimit(env, family, \`key:<apiKeyId>\`)` via a
   `callerKeyFor(request, env, gate)` helper: per-key bucket rides the
   existing family, additive with the per-IP check (fail-closed double
   count). `submit` rides the existing edge binding `WRITE_LIMITER`
   (per-key namespacing already works there); confirm/edit/action stay on the
   in-memory per-isolate fallback — a **documented limitation**, with future
   edge namespaces (1206–1208) as a one-line config option once the pending
   rate-limit audit lands. **No new bindings now** (D8).
9. **Retention — 90-day sweep, hard delete at erasure.** A revoked or expired
   key's row is swept 90 days after `revoked_at`/`expires_at` (new rule R21 in
   the retention schedule); `eraseContributor` (db/auth.ts) hard-deletes all
   `api_keys` rows in the same atomic batch as the rest of the account
   (art. 17) (D9).
10. **PATCH edit gate — session path gains verified-contributor.** The edit
    route moves from `resolveOptionalContributor` to `requireWriteAuth(scope:
    "edit")`; the session path now **requires a verified contributor**, a
    behavior change for owner edits from unverified sessions — flagged in the
    PR and the CHANGELOG (D10).
11. **Branch.** Implementation branches from current HEAD (2026-08-09); it does
    not wait for `feat/login-single-tile` — overlap is minimal and a `git
    merge main` is trivial if that branch lands first (D11).
12. **Phasing — two waves, one epic.** Wave 1 (MVP): migration, db layer,
    key endpoints, `requireWriteAuth` gate, **submit routes only**, rate
    limits, account UI, `/api-docs`, legal updates, deploy. Wave 2:
    confirmation/actions/PATCH swaps (scopes `confirm`/`action`/`edit`) (D12).
13. **Env knobs via `EnvLike`** (code defaults + optional env override, the
    pattern already used in `rate-limit.ts`). **No `vars` block in
    `wrangler.jsonc`** — env defaults keep the deploy surface identical (D13).

### Mechanics (locked in the plan)

- **Migration `0045_api_keys.sql`** (next free index after 0044, hand-written,
  never drizzle-kit generate): table `api_keys` (id, `contributor_id` FK →
  `contributors` ON DELETE cascade, `name` 1..60 chars, `key_prefix`,
  `key_hash` unique, `scopes` JSON text, `created_at`, `last_used_at`,
  `expires_at`, `revoked_at`), unique index on `key_hash`, indexes on
  `contributor_id` and `(revoked_at, expires_at)`.
- **DB layer `db/api-keys.ts`**: `createApiKey` (returns the raw key once;
  the D5 cap is enforced atomically via the `maxActive` conditional-INSERT
  guard), `findApiKeyByHash` (JOIN contributors, liveness check by
  instant), `listApiKeysForContributor`,
  `revokeApiKey` (soft, owner-only), `countApiKeysForContributor`,
  `touchApiKeyLastUsed` (throttled ≥ 5 min).
- **Endpoints** (session + CSRF, auth-family rate limit): `POST /api/auth/keys`
  (201 with raw key, `Cache-Control: no-store`), `GET /api/auth/keys`
  (metadata only — never hash/raw), `DELETE /api/auth/keys/[id]` (soft revoke,
  idempotent, 404 on non-own/unknown — no existence oracle).
- **Gate**: `app/lib/api-key-auth.ts` (dependency-free of `cloudflare:workers`:
  `parseBearerToken` — Bearer only, reject Basic/multi-scheme;
  `resolveApiKeyContributor` — hash → lookup → liveness → uniform 401) +
  `requireWriteAuth(request, scope)` in `write-gate.ts`: Bearer → API-key path
  (401 invalid/revoked/expired, 403 scope not granted, canonical
  `WRITE_GATE_ERROR` body, no-store); no Authorization → **exact existing
  session path** (400/401/403, CSRF as today). CSRF is conditional on
  `authMethod === "session"` — machine clients carry no ambient authority.
- **Route swaps**: `POST /api/cameras` + `POST /api/corrections` → scope
  `submit` (Wave 1); confirmation → `confirm`, actions → `action`, PATCH
  cameras → `edit` (Wave 2). Read routes, `GET /api/cameras/[id]/edit` and the
  confirmation personal view are unchanged.

## Consequences

- **Schema/data:** one new table and three indexes; additive migration
  0045, no backfill, no renames once applied anywhere (D1 journals by
  filename). FK cascade on contributor deletion is exercised by the harness.
- **Security posture:** hash-only at rest (a D1 dump yields no usable keys);
  raw key exists only in the 201 response; Bearer headers never logged; keys
  in URLs rejected (400, no-store, before authentication, for the query
  names `api_key`/`apiKey`/`key` — case-insensitive — on the write-auth and
  key-management surfaces; the value is never reflected or logged); no-store
  on key-authenticated responses; uniform
  401/403 bodies (no enumeration); instant per-key revocation; `last_used_at`
  as an anomaly signal. CSRF is skipped only on the Bearer path — there is no
  ambient authority to abuse, and CORS stays closed.
- **Rate limiting:** per-key budget is additive to per-IP on every family
  (fail-closed double count), so one script cannot exhaust the shared per-IP
  budget. Confirmed limitation: confirm/edit/action are per-isolate until
  edge namespaces 1206–1208 are added after the rate-limit audit
  (t_dff3dadf).
- **Behavior change (D10):** PATCH edit from an unverified session now answers
  403 instead of succeeding. Owner-edit UX guidance and the CHANGELOG must
  flag it; the PR carries the flag too.
- **Privacy/legal:** API keys are personal data (linked identifier of a
  verified account). Updates (no new processors, no DPIA trigger):
  `PRIVACY_NOTICE.md` gains the "API access credentials" category (hash only,
  last_used, retention); `TERMS_OF_USE.md` states the verified-account
  requirement, non-transferability and revocation; `RETENTION_SCHEDULE.md`
  gains R21 (hash + metadata while the account is active; revoked/expired rows
  swept after 90 days; hashes only in backups); `PRIVACY_AND_SAFETY.md` and
  `SECURITY.md` scope notes; `app/lib/i18n/api.ts` copy documents write keys
  while keeping the read API keyless.
- **Frontend/UX:** account page section (between passkeys and the danger
  zone) with list, create dialog (scope pills with `aria-pressed`, not
  checkboxes — WCAG 2.5.8), reveal-once dialog (`role="alertdialog"`, Tab
  trap, no Escape/overlay dismiss — closing means the key is lost), revoke via
  the existing `ConfirmDialog`; 5 new components, zero new design tokens;
  `/api-docs` gains an "API keys" section (Bearer example, scope cards, error
  cards, keyed rate limits) and fixes any read-only claim the feature
  invalidates.
- **Ops/deploy:** no `wrangler.jsonc` changes at all (D13); migration 0045
  applied exactly once to prod D1 before the container restarts with new code;
  rollback is a worker rollback (D1 untouched — 0045 is additive). Test
  harnesses register `db/api-keys` and the two key endpoints; gitleaks rules
  added for the `osdb_` prefix.
- **Accepted trade-offs:** family-level scopes instead of per-endpoint
  granularity (simpler validation, adequate for the threat model); no pepper
  (entropy argument); 90-day retention instead of keep-forever or immediate
  hard-delete (audit trail with bounded exposure); in-memory limits for
  wave-2 routes (documented, follow-up bound).

## Alternatives

- **Keys for the read API too:** rejected — breaks the documented
  "No API key, no registration" promise that keeps the directory frictionless
  to consume (D1).
- **Pepper / scrypt / argon2 on key hashes:** rejected — WebCrypto does not
  expose scrypt/argon2, and a pepper adds nothing against offline attack on
  256-bit key entropy; SHA-256 + constant-time compare is the honest
  minimum (D3).
- **Plaintext or reversible storage of keys:** rejected — a D1 dump would
  expose every key; hash-only is non-negotiable.
- **Per-endpoint scopes (e.g. cameras-only submit):** rejected — family-level
  scopes cover the real use cases with a much smaller whitelist surface to
  validate and document (D4).
- **No cap or higher cap:** rejected — unlimited key creation would let a
  contributor farm per-key rate limits and multiply the abuse surface (D5).
- **Keys that never expire:** rejected — dormant keys are a standing
  compromise risk; the 365-day default with optional override balances
  automation convenience and hygiene (D6).
- **`last_used_at` updated on every request:** rejected — write amplification
  on every authenticated call; the 5-minute throttle is the bound (D7).
- **New edge bindings for every family now:** rejected — binding counters
  multiply per Cloudflare location, and hard-coding confirm/edit/action
  thresholds pre-empts the pending maintainer sign-off on the rate-limit
  audit (D8).
- **Immediate hard-delete on revoke:** rejected — loses the audit trail;
  the 90-day sweep (R21) balances forensics and data minimisation (D9).
- **Keeping the PATCH edit gate as-is:** rejected — it is the known identity
  gap this ADR closes (D10).
- **Single wave (everything in the MVP):** rejected — concentrates risk;
  Wave 1 proves the gate, mint/revoke lifecycle and submit path before the
  remaining three route swaps (D12).
- **`vars` block in `wrangler.jsonc` for the knobs:** rejected — a deploy
  surface that drifts from code defaults; `EnvLike` keeps defaults in code and
  override optional (D13).
