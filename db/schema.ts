import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const cameras = sqliteTable(
  "cameras",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    manufacturer: text("manufacturer"),
    observedOn: text("observed_on"),
    publishManufacturer: integer("publish_manufacturer").notNull().default(0),
    publishObservedOn: integer("publish_observed_on").notNull().default(0),
    address: text("address"),
    notes: text("notes").notNull().default(""),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    // Field-of-view direction (migration 0035, kanban t_1b08fe12): compass
    // bearing in degrees 0-359 (clockwise from north) for DIRECTIONAL
    // cameras; NULL for non-directional / unknown. The map layer draws a
    // field-of-view triangle from it. A camera whose kind is the canonical
    // 'Fixed dome' always stores NULL — domes render circular, never with a
    // direction. Same nullable-integer semantics as every other optional
    // column: absent and NULL both mean "no direction".
    direction: integer("direction"),
    status: text("status").notNull().default("pending"),
    source: text("source").notNull(),
    updated: text("updated").notNull(),
    description: text("description").notNull().default(""),
    // Freshness state: last_verified_at is the machine-readable ISO date of the
    // last successful verification; review_due_at is the scheduled recheck date
    // (last_verified_at + review_interval_months). A verified record is only
    // published as current while it is inside this review window.
    lastVerifiedAt: text("last_verified_at"),
    reviewDueAt: text("review_due_at"),
    reviewIntervalMonths: integer("review_interval_months").notNull().default(12),
    // Optional attribution to the logged-in contributor who submitted the
    // report (ADR 0013). NULL for anonymous submissions, which remain allowed.
    contributorId: integer("contributor_id").references(() => contributors.id),
    createdAt: text("created_at").notNull(),
    // Import provenance (migration 0040, FONTI PUBBLICHE pipeline FASE A —
    // docs/data-sources/normalizzazione-pipeline.md §6.3): NULL for community
    // reports, which are the pre-existing population. `external_id` is the
    // source-native stable identifier and `import_batch_id` the FK to the
    // import run that inserted the row. Together with `source =
    // 'import:<slug>'` (the provenance string, immutable for the row's life)
    // they carry attribution, the idempotency key (partial UNIQUE
    // (source, external_id) — re-running a batch can never double-insert)
    // and the rollback handle. Imported rows are community-owned once
    // inserted: the community validates them like any other record and the
    // rollback (removing a whole batch) only ever touches rows this batch
    // itself inserted.
    externalId: text("external_id"),
    importBatchId: integer("import_batch_id").references(() => importBatches.id),
  },
  (table) => [
    index("cameras_status_idx").on(table.status),
    // Coordinate lookup for the proximity searches (bbox pre-filter, 0013).
    index("cameras_coordinates_idx").on(table.latitude, table.longitude),
    // Composite public-directory indexes (migration 0019, FRONTEND_PLAN
    // § 3.2.5): the directory filters always lead with the public status
    // whitelist, so (status, kind) turns the kind filter into an index seek
    // and (status, updated DESC) covers the status+recency navigation. The
    // freshness windows are anchored on last_verified_at (domain decision
    // § 3.2.6), so (status, last_verified_at DESC) serves those range scans.
    // Declared here so drizzle-kit generate never re-emits them (convention
    // 0012/0014: hand-written migration + schema declaration together).
    index("cameras_status_kind_idx").on(table.status, table.kind),
    index("cameras_status_updated_idx").on(table.status, sql`updated DESC`),
    index("cameras_status_last_verified_idx").on(table.status, sql`last_verified_at DESC`),
    // Community trust levels (ADR 0018 §3, migration 0023): the level COUNT
    // is `WHERE contributor_id = ? AND status = 'verified'`, so
    // (contributor_id, status) turns it into an index-only seek. Declared
    // here so drizzle-kit generate never re-emits it (convention 0012/0014:
    // hand-written migration + schema declaration together).
    index("cameras_contributor_status_idx").on(table.contributorId, table.status),
    // Community profile contributions list (migration 0025, C2): the "my
    // reports" branch of listContributorContributions filters on
    // contributor_id and orders by created_at DESC; the leading-contributor
    // composite turns that into an index scan instead of a full table scan.
    index("cameras_contributor_created_idx").on(table.contributorId, sql`created_at DESC`),
    // Import provenance (migration 0040, FONTI PUBBLICHE pipeline FASE A —
    // docs/data-sources/normalizzazione-pipeline.md §6.3): the partial
    // UNIQUE (source, external_id) is the idempotency key of the import
    // runner — re-running a batch can never double-insert a row — and
    // (import_batch_id) is the rollback/attribution handle (a whole batch is
    // removed in one indexed DELETE). Both are declared here so
    // drizzle-kit generate never re-emits them (convention 0012/0014:
    // hand-written migration + schema declaration together).
    uniqueIndex("cameras_source_external_unique")
      .on(table.source, table.externalId)
      .where(sql`external_id IS NOT NULL`),
    index("cameras_import_batch_idx").on(table.importBatchId),
  ],
);

/**
 * Import runs (FONTI PUBBLICHE pipeline FASE A, migration 0040 —
 * docs/data-sources/normalizzazione-pipeline.md §6.2). One row per import
 * run; `slug` is the unique key ('<dataset>-<year>', lower-kebab) and is
 * embedded verbatim in every inserted camera's `source` column as
 * `import:<slug>` — attribution by construction. Every field the kanban
 * task listed is present: fonte (`source_name` + `source_url`), licenza
 * (`license` + `license_url` + `attribution_text`), data import
 * (`import_date`), n record (the `records_*` counters) e rollback
 * (`status` + `rollback_payload`).
 *
 * Lifecycle (`status`): 'running' while the batch is being written,
 * 'committed' on success, 'failed' when the write phase aborted, and
 * 'rolled_back' after `import:rollback` removed every row the batch
 * inserted. The runner aborts unless the slug is free (idempotency);
 * `--force` refreshes an existing batch in place.
 *
 * No ON DELETE action on the cameras.import_batch_id FK by design: batch
 * rows are never deleted; rollback deletes *cameras* rows, not the batch
 * row (design doc §6.3).
 *
 * Declared here so drizzle-kit generate never re-emits it (convention
 * 0012/0014: hand-written migration + schema declaration together).
 */
export const importBatches = sqliteTable(
  "import_batches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // 'milano-videosorveglianza-2026' — the unique key of the run and the
    // tail of every inserted camera's `source` ('import:<slug>').
    slug: text("slug").notNull().unique(),
    // 'Comune di Milano — Open Data'
    sourceName: text("source_name").notNull(),
    // 'csv' | 'geojson' | 'osm-overpass' | 'wfs' (FASE B adapter family).
    format: text("format").notNull(),
    // 'IODL 2.0' | 'ODbL 1.0 (OSM)' | 'CC-BY 4.0' | ... — hard-gated by the
    // runner against the licence matrix (docs/data-sources/licenze-compatibilita.md).
    license: text("license").notNull(),
    licenseUrl: text("license_url"),
    // Human-readable attribution required by the source licence, e.g.
    // '© OpenStreetMap contributors' — surfaced on /licenze (FASE P5).
    attributionText: text("attribution_text"),
    // Landing page / download URL from the census (#1).
    sourceUrl: text("source_url").notNull(),
    // ISO 8601 import timestamp.
    importDate: text("import_date").notNull(),
    // 'running' | 'committed' | 'rolled_back' | 'failed'
    status: text("status").notNull().default("running"),
    recordsTotal: integer("records_total").notNull().default(0),
    recordsInserted: integer("records_inserted").notNull().default(0),
    recordsSkippedDuplicate: integer("records_skipped_duplicate").notNull().default(0),
    recordsMerged: integer("records_merged").notNull().default(0),
    recordsReview: integer("records_review").notNull().default(0),
    recordsInvalid: integer("records_invalid").notNull().default(0),
    // sha256 of the downloaded payload — reproducibility gate (a re-run
    // against a changed payload is a different batch unless --force).
    sourceChecksum: text("source_checksum"),
    // JSON {camera_id: {col: oldValue}} — merge phase (enrich) only, v1 empty.
    rollbackPayload: text("rollback_payload"),
    // JSON: per-row errors, review candidates, kind_map misses.
    report: text("report"),
    notes: text("notes"),
    createdBy: text("created_by").notNull().default("import-runner"),
    createdAt: text("created_at").notNull(),
    // Last mutation (commit/rollback/force-refresh) — mirrors the
    // created_at/updated_at convention of every mutable table in the
    // project (contributors, users, reviewers, ...). NULL until the first
    // status transition (a just-created 'running' batch has no update yet).
    updatedAt: text("updated_at"),
  },
  (table) => [
    index("import_batches_status_idx").on(table.status),
    check("import_batches_status_check", sql`status IN ('running', 'committed', 'rolled_back', 'failed')`),
  ],
);

export const correctionRequests = sqliteTable(
  "correction_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // FK to cameras (migration 0015). Historical corrections must survive
    // the removal of a camera record: SET NULL keeps the request auditable
    // while unlinking it from the deleted record.
    cameraId: integer("camera_id").references(() => cameras.id, { onDelete: "set null" }),
    issueType: text("issue_type").notNull(),
    message: text("message").notNull(),
    contact: text("contact"),
    status: text("status").notNull().default("pending"),
    outcome: text("outcome"),
    // Resolution timestamp (migration 0018): set when a moderator reaches a
    // terminal state (approve -> reviewed, reject -> rejected). R4 anchors
    // the 2-year retention floor on this date ("Resolution date",
    // RETENTION_SCHEDULE.md R4), NOT on created_at — created_at would purge
    // resolved requests before the legal floor. NULL while the request is
    // still pending; legacy rows resolved before the column existed are
    // backfilled by migration 0018 from their moderation decision event.
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
    // Optional attribution to the contributor who filed the report (ADR 0018
    // §6.1, migration 0022): NULL = anonymous, which stays possible (reporter
    // privacy). NEVER ON DELETE CASCADE — de-attribution is explicit in
    // eraseContributor, exactly like cameras.contributor_id.
    contributorId: integer("contributor_id").references(() => contributors.id),
  },
  (table) => [
    index("correction_requests_status_idx").on(table.status),
    // C4 dedupe (COMMUNITY_PLAN §2.4, A5): one open (pending) report per
    // (submitter, target), race-safe at the DB level. The logged-in variant
    // keys on (camera_id, contributor_id); the anonymous variant keys on
    // camera_id alone because NULLs are distinct in a plain UNIQUE index —
    // the predicate disambiguates. Anonymity is preserved: no IP or other
    // identifier is stored, only the absence of a contributor.
    // Declared here so drizzle-kit generate never re-emits them (convention
    // 0012/0014: hand-written migration + schema declaration together).
    uniqueIndex("correction_requests_open_contributor_unique")
      .on(table.cameraId, table.contributorId)
      .where(sql`status = 'pending' AND contributor_id IS NOT NULL`),
    uniqueIndex("correction_requests_open_anon_unique")
      .on(table.cameraId)
      .where(sql`status = 'pending' AND contributor_id IS NULL`),
    // "My corrections" profile list (migration 0022). Declared here so
    // drizzle-kit generate never re-emits it (convention 0012/0014:
    // hand-written migration + schema declaration together).
    index("correction_requests_contributor_idx").on(table.contributorId),
  ],
);

/**
 * Registered contributors (STATUS gap #1, ADR 0013). `email` is stored
 * lowercase and unique; `password_hash` is a PBKDF2-SHA256 string
 * (`pbkdf2$<iterations>$<saltB64>$<hashB64>`). `display_name` is an optional
 * public handle. Anonymous submissions remain possible by design; an account
 * is only needed to track and attribute your own reports.
 *
 * Multi-method auth (migration 0027, AUTH_OPTIONS.md — Fase A):
 *   - `email_verified_at` — ISO timestamp of the verification; NULL while
 *     the address is unverified (write sessions are gated on it in Fase B).
 *   - `auth_provider` — registration method: 'password' | 'passkey' |
 *     'github' | 'google' (validated in code); defaults to 'password' so
 *     every legacy row stays valid without a backfill.
 *   - `external_sub` — OIDC subject for external providers (Fase D), NULL
 *     otherwise; the provider email is never stored (privacy by design).
 */
export const contributors = sqliteTable(
  "contributors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    displayName: text("display_name"),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: text("email_verified_at"),
    authProvider: text("auth_provider").notNull().default("password"),
    externalSub: text("external_sub"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("contributors_email_unique").on(table.email)],
);

/**
 * Email verification tokens (migration 0027, Fase B; purpose column 0031).
 * Only the SHA-256 of the raw token is stored — a database leak cannot
 * replay it (same rule as `sessions.token_hash`, ADR 0013). A token is dead
 * after `expires_at` (24h) or once `used_at` is set (single-use; consume is
 * an atomic conditional UPDATE in Fase B). The `expires_at` index serves the
 * expiry sweep. Declared here so drizzle-kit generate never re-emits it
 * (convention 0012/0014).
 *
 * `purpose` (migration 0031) separates the two flows sharing this table:
 * 'verify' — email verification at registration (Fase B); 'reset' — the
 * password-reset link (Fase B). The send budget is the SHARED
 * 1-email-per-5-minutes atomic `email_send_log` reservation (issue #440,
 * db/mailer.ts — one budget across verify and reset, not per-purpose); each
 * purpose keeps its own consume semantics (a reset link never re-verifies
 * the email address by itself; the reset-confirm handler does).
 */
export const emailVerificationTokens = sqliteTable(
  "email_verification_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contributorId: integer("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull().default("verify"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
  },
  (table) => [
    uniqueIndex("email_verification_tokens_token_hash_unique").on(table.tokenHash),
    index("email_verification_tokens_contributor_idx").on(table.contributorId),
    index("email_verification_tokens_expires_idx").on(table.expiresAt),
  ],
);

/**
 * WebAuthn passkeys (migration 0027, Fase C). Only the COSE public key is
 * stored — the private key never leaves the user's authenticator.
 * `credential_id` is globally UNIQUE per relying party; `counter` tracks
 * the signature counter to detect cloned authenticators; `transports` is an
 * optional JSON array (SimpleWebAuthn) for ceremony hints. Declared here so
 * drizzle-kit generate never re-emits it (convention 0012/0014).
 */
export const passkeys = sqliteTable(
  "passkeys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contributorId: integer("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("passkeys_credential_id_unique").on(table.credentialId),
    index("passkeys_contributor_idx").on(table.contributorId),
  ],
);

/**
 * One-time recovery codes (migration 0027, Fase C): the 10 codes issued at
 * passkey enrollment, stored hashed (SHA-256) and single-use (`used_at`).
 * `code_hash` is globally UNIQUE so consuming a code is a point lookup by
 * hash alone; ownership is checked in code against the contributor. The
 * `contributor_id` index serves the per-account list and erasure. Declared
 * here so drizzle-kit generate never re-emits it (convention 0012/0014).
 */
export const recoveryCodes = sqliteTable(
  "recovery_codes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contributorId: integer("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    createdAt: text("created_at").notNull(),
    usedAt: text("used_at"),
  },
  (table) => [
    uniqueIndex("recovery_codes_code_hash_unique").on(table.codeHash),
    index("recovery_codes_contributor_idx").on(table.contributorId),
  ],
);

/**
 * WebAuthn ceremony challenges (migration 0028, Fase C). Only the SHA-256 of
 * the base64url challenge is stored — a database leak cannot replay a live
 * ceremony (same rule as `sessions.token_hash`). `kind` separates the
 * 'register' (session-bound) from the 'login' (public) ceremony; `expires_at`
 * is created_at + 10 minutes (WEBAUTHN_CHALLENGE_TTL_MS, no KV binding in
 * this project so the store lives in D1 with an expiry sweep) and `used_at`
 * makes each challenge single-use (atomic conditional consume). Declared here
 * so drizzle-kit generate never re-emits it (convention 0012/0014).
 */
export const webauthnChallenges = sqliteTable(
  "webauthn_challenges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    challengeHash: text("challenge_hash").notNull(),
    kind: text("kind").notNull(),
    contributorId: integer("contributor_id").references(() => contributors.id, {
      onDelete: "cascade",
    }),
    userHandle: text("user_handle"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
  },
  (table) => [
    uniqueIndex("webauthn_challenges_challenge_hash_unique").on(table.challengeHash),
    index("webauthn_challenges_expires_idx").on(table.expiresAt),
    index("webauthn_challenges_contributor_idx").on(table.contributorId),
  ],
);

/**
 * OIDC authorization state (migration 0030, Fase D). One row per in-flight
 * PKCE redirect to an external provider (GitHub/Google). `state_hash` is the
 * SHA-256 of the raw `state` nonce (never stored in clear, same rule as
 * `sessions.token_hash`); `code_verifier` MUST stay recoverable to exchange
 * the authorization code, so it is stored in clear but single-use and
 * short-lived (10-minute expiry, swept on `expires_at`). Declared here so
 * drizzle-kit generate never re-emits it (convention 0012/0014).
 */
export const oidcStates = sqliteTable(
  "oidc_states",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stateHash: text("state_hash").notNull(),
    provider: text("provider").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    redirectTo: text("redirect_to").notNull().default("/account"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
  },
  (table) => [
    uniqueIndex("oidc_states_state_hash_unique").on(table.stateHash),
    index("oidc_states_expires_idx").on(table.expiresAt),
  ],
);

/**
 * Pending manual merges (migration 0030, Fase D): when an OIDC provider's
 * verified email matches an existing password account, the callback refuses
 * to auto-link (that would be an account-takeover vector) and issues a
 * single-use merge token instead. The user proves ownership of the existing
 * account with its password, then `auth_provider`/`external_sub` are written
 * onto that contributor. The provider email is never persisted (only
 * compared in memory at callback time) — `contributor_id` references the
 * existing account directly. Declared here so drizzle-kit generate never
 * re-emits it (convention 0012/0014).
 */
export const oidcMergeRequests = sqliteTable(
  "oidc_merge_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull(),
    provider: text("provider").notNull(),
    externalSub: text("external_sub").notNull(),
    contributorId: integer("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    // Provider assertion about the conflicting email, captured at callback
    // time (the email itself is never stored — Fase D constraint). When the
    // user proves the password, linkExternalIdentity() uses this flag to set
    // email_verified_at on the existing account if it is not verified yet.
    emailVerified: integer("email_verified").notNull().default(0),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
  },
  (table) => [
    uniqueIndex("oidc_merge_requests_token_hash_unique").on(table.tokenHash),
    index("oidc_merge_requests_contributor_idx").on(table.contributorId),
    index("oidc_merge_requests_expires_idx").on(table.expiresAt),
  ],
);

/**
 * Login sessions (ADR 0013). Only the SHA-256 of the raw session token is
 * stored, plus a per-session CSRF token echoed through a non-HttpOnly cookie
 * and verified on state-changing requests. A row is dead after `expires_at`
 * or once `revoked_at` is set (logout).
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contributorId: integer("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    csrfToken: text("csrf_token").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_contributor_idx").on(table.contributorId),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

/**
 * Per-email login lockout counters (P2 security, ADR 0016). One row per
 * normalised email, keyed by the SHA-256 of the normalised email
 * (`email_key`) so the table stores no PII. `failed_count` counts failed
 * logins inside the current window (`window_start`); reaching the threshold
 * sets `locked_until` and every login for that email answers 429 with
 * Retry-After until it passes. `lockout_level` counts consecutive lockouts
 * so the duration backs off exponentially (capped in code). All queries go
 * through db/auth.ts; this definition exists so the drizzle model stays the
 * single schema reference.
 *
 * Retention (R16, RETENTION_SCHEDULE.md): the retention cron sweeps rows
 * whose `window_start` is older than LOGIN_ATTEMPT_RETENTION_DAYS (30 days)
 * with a bounded delete; a row whose `locked_until` is still in the future
 * (an ACTIVE lock) is never swept — the cleanup must not weaken a lockout.
 */
export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    emailKey: text("email_key").primaryKey(),
    failedCount: integer("failed_count").notNull().default(0),
    windowStart: text("window_start").notNull(),
    lockedUntil: text("locked_until"),
    lockoutLevel: integer("lockout_level").notNull().default(0),
  },
);

/**
 * Real identities behind the coarse roles (ADR 0014). `role` is the coarse
 * authorization tier enforced on every protected route: `contributor` (submit
 * reports, file appeals), `moderator` (moderation queue, appeal review),
 * `admin` (everything, plus user/reviewer management). A moderator/admin user
 * has an optional linked `reviewers` row carrying the granular DATA_TRUST
 * role; the five "Demo" rows and the demo contributor are the local-prototype
 * seed from migration 0010 and are replaced by provisioned accounts before
 * any public-alpha deployment. The public credential store (`contributors`,
 * ADR 0013) is a separate layer: registration provisions a contributor
 * account, while provisioning maps it onto a `users` role identity at alpha
 * (see ADR 0014 integration note).
 */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("contributor"),
    active: integer("active").notNull().default(1),
    mfaEnabled: integer("mfa_enabled").notNull().default(0),
    // Explicit contributor→users identity link (audit t_5ca60ab2, P2): the
    // only attribution path from a contributor session to a `users` role
    // identity. Email equality is never used to bridge the two stores — a
    // contributor could register with an email matching any users row and
    // inherit that identity's role (spoofable attribution). Provisioning
    // (ops) sets this link. Like cameras.contributor_id there is NO ON
    // DELETE action: severance is explicit, inside eraseContributor (SET
    // NULL before the contributor row is deleted), so a role identity is
    // unlinked but never deleted by account erasure.
    contributorId: integer("contributor_id").references(() => contributors.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("users_role_idx").on(table.role),
    uniqueIndex("users_contributor_id_unique").on(table.contributorId),
  ],
);

/**
 * Named local moderators. Roles encode the separation of duties in
 * DATA_TRUST.md: intake reviewers triage but cannot publish, record reviewers
 * and senior moderators approve, the privacy/safety lead owns urgent hides,
 * and the administrator can only escalate (never edit content or approve).
 * Real authentication/MFA is a public-alpha ticket; `mfa_enabled` already
 * records the expectation. `user_id` links the reviewer profile to the
 * identity account in `users` (coarse role); the five "Demo" rows are the
 * local-prototype seed from the Wave B migration.
 */
export const reviewers = sqliteTable(
  "reviewers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    displayName: text("display_name").notNull().unique(),
    role: text("role").notNull(),
    active: integer("active").notNull().default(1),
    mfaEnabled: integer("mfa_enabled").notNull().default(0),
    userId: integer("user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("reviewers_role_idx").on(table.role)],
);

/**
 * Moderation workflow state per entity. One open row per entity; a new row
 * can be opened after the previous one is closed (partial unique index).
 * `cameras.status` remains the domain/public state; this table tracks
 * assignment, sensitivity, second review, and escalation.
 */
export const moderationQueue = sqliteTable(
  "moderation_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entity: text("entity").notNull(),
    entityId: integer("entity_id").notNull(),
    state: text("state").notNull().default("queued"),
    assigneeId: integer("assignee_id").references(() => reviewers.id),
    sensitivity: text("sensitivity").notNull().default("standard"),
    requiresSecondReview: integer("requires_second_review").notNull().default(0),
    secondReviewerId: integer("second_reviewer_id").references(() => reviewers.id),
    escalationReason: text("escalation_reason"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("moderation_queue_open_unique")
      .on(table.entity, table.entityId)
      .where(sql`state != 'closed'`),
    index("moderation_queue_state_idx").on(table.state),
  ],
);

/**
 * Contributor appeals against a moderation decision (DATA_TRUST.md
 * "Corrections, removals, and appeals"). A contributor contests a recorded
 * decision; an independent senior moderator (not the original reviewer)
 * reviews it. Statuses: `pending` → `upheld` | `dismissed` | `escalated`.
 * Every status change writes an append-only `moderation_events` row with the
 * `appeal_id` link, so the appeal trail is part of the immutable audit log.
 *
 * `decision_event_id` references the appealed decision event. The reverse
 * link (`moderation_events.appeal_id`) is a plain integer column: the FK is
 * applied by the migration, and keeping the schema one-directional avoids a
 * circular table reference that TypeScript cannot resolve.
 */
export const moderationAppeals = sqliteTable(
  "moderation_appeals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entity: text("entity").notNull(),
    entityId: integer("entity_id").notNull(),
    decisionEventId: integer("decision_event_id")
      .notNull()
      .references(() => moderationEvents.id),
    appellantId: integer("appellant_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    decidedBy: integer("decided_by").references(() => reviewers.id),
    decisionNote: text("decision_note"),
    createdAt: text("created_at").notNull(),
    decidedAt: text("decided_at"),
  },
  (table) => [
    index("moderation_appeals_status_idx").on(table.status),
    index("moderation_appeals_entity_idx").on(table.entity, table.entityId),
    // QA F2 (t_894e0cc3): fileAppeal's SELECT-then-INSERT is not atomic —
    // two concurrent POSTs on the same decision both pass the pending check
    // and file two pending appeals. The partial UNIQUE index on
    // (decision_event_id) WHERE status='pending' makes duplicate_pending
    // atomic at the SQL level: the second INSERT fails (or ON CONFLICT DO
    // NOTHING in fileAppeal), closing the race. The index is PARTIAL so an
    // already-decided appeal does not block a later appeal on the same
    // decision (the 409 is only for a second PENDING one).
    uniqueIndex("moderation_appeals_pending_decision_unique")
      .on(table.decisionEventId)
      .where(sql`status = 'pending'`),
  ],
);

/**
 * Append-only audit trail for moderation decisions. Extended with reviewer
 * attribution (reviewer id + role captured at write time), recusal and
 * escalation flags, and the second reviewer involved in a two-person review.
 * `appeal_id` links an appeal's audit events back to the appeal row.
 * UPDATE/DELETE are blocked at the database layer (triggers in migration
 * 0008, re-created by migration 0034 to admit ONLY the R5 archival
 * transition: setting `archived_at` on a live row, then deleting the
 * archived row); the API exposes no way to mutate history.
 */
export const moderationEvents = sqliteTable(
  "moderation_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entity: text("entity").notNull(),
    entityId: integer("entity_id").notNull(),
    previousStatus: text("previous_status").notNull(),
    newStatus: text("new_status").notNull(),
    action: text("action").notNull(),
    reasonCode: text("reason_code").notNull(),
    note: text("note"),
    actor: text("actor").notNull(),
    reviewerId: integer("reviewer_id").references(() => reviewers.id),
    actorRole: text("actor_role"),
    recused: integer("recused").notNull().default(0),
    escalated: integer("escalated").notNull().default(0),
    secondReviewerId: integer("second_reviewer_id").references(() => reviewers.id),
    // Plain column: the FK to moderation_appeals is applied by migration 0010.
    // Keeping it reference-free in the schema avoids a circular table
    // reference between moderation_appeals and moderation_events.
    appealId: integer("appeal_id"),
    createdAt: text("created_at").notNull(),
    // R5 archival marker (QA#3 F6): set by the retention sweep on the live
    // row BEFORE it is deleted; the re-created 0034 triggers permit UPDATE
    // only for this NULL → timestamp transition and DELETE only of rows with
    // it set. An archived row is immutable and purgeable, nothing else is.
    archivedAt: text("archived_at"),
  },
  (table) => [
    index("moderation_events_created_at_idx").on(table.createdAt, table.id),
    // Audit-trail lookup index: listPublicCameraRevisions and the
    // second-reviewer lookups in moderateCamera/moderateCorrection filter on
    // (entity, entity_id); without it every read is a full scan of the
    // append-only audit trail. Migration 0012.
    index("moderation_events_entity_idx").on(table.entity, table.entityId),
    // Retention-sweep decision-date index (migration 0018): runRetentionSweep
    // resolves the R2/R6/R4 "decision date" with
    //   WHERE entity = ? AND action = ? GROUP BY entity_id
    // over the append-only trail; (entity, action, entity_id) turns that
    // filter into an index seek and covers the GROUP BY key without a sort.
    // Declared here so drizzle-kit generate never re-emits it (convention
    // 0012/0014: hand-written migration + schema declaration together).
    index("moderation_events_entity_action_idx").on(table.entity, table.action, table.entityId),
  ],
);

/**
 * R5 archival store (QA#3 F6): moderation decisions older than the 2-year
 * retention window are moved here by the daily sweep, ANONYMIZED — `note`
 * (free-text, may hold personal data of reporter/subject) and `actor` /
 * `reviewer_id` / `second_reviewer_id` (who decided) are deliberately NOT
 * copied. The archive keeps the decision structure (entity, action, status
 * transition, reason code, role, timestamps, appeal link) so the trail of
 * WHAT was decided survives the retention window without the WHO or the
 * free-text notes. No foreign keys: the archive outlives the reviewer /
 * appeal rows it references. Append-only by convention; there is no code
 * path that deletes from it.
 */
export const moderationEventsArchive = sqliteTable(
  "moderation_events_archive",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entity: text("entity").notNull(),
    entityId: integer("entity_id").notNull(),
    previousStatus: text("previous_status").notNull(),
    newStatus: text("new_status").notNull(),
    action: text("action").notNull(),
    reasonCode: text("reason_code").notNull(),
    note: text("note"),
    actor: text("actor"),
    reviewerId: integer("reviewer_id"),
    actorRole: text("actor_role"),
    recused: integer("recused").notNull().default(0),
    escalated: integer("escalated").notNull().default(0),
    secondReviewerId: integer("second_reviewer_id"),
    appealId: integer("appeal_id"),
    createdAt: text("created_at").notNull(),
    archivedAt: text("archived_at").notNull(),
  },
  (table) => [
    // The sweep anchors on created_at to pick the rows to archive.
    index("moderation_events_archive_created_at_idx").on(table.createdAt, table.id),
  ],
);

/**
 * Community actions (ADR 0021 §3, migration 0036). The pivot replaces the
 * verification toggle (former `camera_confirmations`, ADR 0018 §2 — dropped
 * by migration 0039 after its rows were copied here as `confirm` actions)
 * with a five-type action surface. `UNIQUE (camera_id, contributor_id)` is
 * the structural anti-gaming layer: ONE active action per (record,
 * contributor), enforced at the database level — a switch overwrites the
 * row, never a second row (ADR 0021 §3.2).
 *
 * `weight` is a SNAPSHOT taken from the contributor's trust level at action
 * time (ADR 0021 §3.4): deterministic and auditable, later level changes
 * never rewrite history. The `action_type` whitelist is a CHECK constraint
 * (like / confirm / gone / problem / privacy, ADR 0021 §3). The
 * `(camera_id, action_type)` index serves the threshold evaluation (one
 * indexed GROUP BY over active actions of the triggering type:
 * COUNT(DISTINCT contributor_id) + SUM(weight)); `(contributor_id,
 * created_at)` serves the daily-quota counts and erasure.
 *
 * ON DELETE CASCADE is mirrored by an explicit delete in eraseContributor
 * because the test harness does not enforce foreign keys.
 * Declared here so drizzle-kit generate never re-emits it (convention
 * 0012/0014: hand-written migration + schema declaration together).
 */
export const cameraCommunityActions = sqliteTable(
  "camera_community_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cameraId: integer("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    contributorId: integer("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    weight: real("weight").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("camera_community_actions_camera_contributor_unique").on(table.cameraId, table.contributorId),
    index("camera_community_actions_camera_action_idx").on(table.cameraId, table.actionType),
    index("camera_community_actions_contributor_created_idx").on(table.contributorId, table.createdAt),
    check("camera_community_actions_action_type_check", sql`action_type IN ('like', 'confirm', 'gone', 'problem', 'privacy')`),
  ],
);

/**
 * Tunable community configuration (ADR 0021 §5, migration 0037). Every
 * threshold, weight, quota and cooldown of the pivot is a key; `value` is
 * a JSON TEXT blob (a bare number, or an object like `weights.byLevel`).
 * The migration seeds the ADR's defaults so config and code agree at first
 * boot; the code fallback lives in db/community-settings.ts
 * (`DEFAULT_COMMUNITY_SETTINGS`) so a missing row can never fail an
 * evaluation. Declared here so drizzle-kit generate never re-emits it
 * (convention 0012/0014: hand-written migration + schema declaration
 * together).
 */
export const communitySettings = sqliteTable(
  "community_settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

/**
 * Public per-record lifecycle history (ADR 0021 §7, migration 0038).
 * Semantic, aggregate event types (`published`, `confirmed` (count),
 * `liked` (count), `gone-flagged`, `hidden` (reason + counts), `removed`
 * (counts), `restored` (counts), `action-consumed`, `migration`,
 * `setting-changed`); `detail` carries the threshold counts / reasons as
 * JSON. NO actor attribution, ever: public rows never carry contributor
 * ids, emails or IP-derived data (identification risk — ADR 0018 § 3.4).
 * The `(camera_id, created_at)` index serves the per-record timeline.
 * Declared here so drizzle-kit generate never re-emits it (convention
 * 0012/0014: hand-written migration + schema declaration together).
 */
export const cameraLifecycleEvents = sqliteTable(
  "camera_lifecycle_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cameraId: integer("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    detail: text("detail"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("camera_lifecycle_events_camera_created_idx").on(table.cameraId, table.createdAt),
  ],
);

/**
 * Community contribution editing (ADR 0018 §4, migration 0021). Published-
 * record edits never mutate `cameras` directly: they insert a row here with
 * the explicit per-column diff against the editable whitelist plus a
 * `moderation_queue` row (entity `camera_edit`). The partial unique index
 * `(camera_id) WHERE status = 'pending'` mirrors
 * `moderation_queue_open_unique`: one open edit-request per camera. The
 * proposed-* columns are the editable whitelist; status transitions
 * pending -> approved | rejected with the reviewer decision fields.
 * Declared here so drizzle-kit generate never re-emits it (convention
 * 0012/0014: hand-written migration + schema declaration together).
 */
export const cameraEditRequests = sqliteTable(
  "camera_edit_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cameraId: integer("camera_id").references(() => cameras.id, { onDelete: "set null" }),
    contributorId: integer("contributor_id").references(() => contributors.id),
    proposedTitle: text("proposed_title"),
    proposedKind: text("proposed_kind"),
    proposedAddress: text("proposed_address"),
    proposedNotes: text("proposed_notes"),
    proposedManufacturer: text("proposed_manufacturer"),
    proposedObservedOn: text("proposed_observed_on"),
    // Proposed field-of-view direction (migration 0035, kanban t_1b08fe12):
    // integer bearing 0-359 or NULL. Mirrors the editable whitelist of
    // db/camera-edits.ts; NULL proposed = column unchanged (same COALESCE
    // model as the other proposed_* columns). The dome rule is enforced at
    // apply time: a diff whose final kind is 'Fixed dome' stores NULL.
    proposedDirection: integer("proposed_direction"),
    proposedDescription: text("proposed_description"),
    // Proposed position (migration 0044, kanban t_775c8400): the latitude/
    // longitude the contributor wants the camera moved to (5-decimal
    // precision). NULL proposed = column unchanged (same COALESCE model as
    // the other proposed_* columns); a moderator applies the diff on approve.
    proposedLatitude: real("proposed_latitude"),
    proposedLongitude: real("proposed_longitude"),
    status: text("status").notNull().default("pending"),
    decidedBy: integer("decided_by").references(() => reviewers.id),
    decisionNote: text("decision_note"),
    decidedAt: text("decided_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("camera_edit_requests_open_unique")
      .on(table.cameraId)
      .where(sql`status = 'pending'`),
    index("camera_edit_requests_contributor_idx").on(table.contributorId),
  ],
);

/**
 * Outbound transactional-email send log (AUTH MULTI-METODO Fase A2, migration
 * 0029). Exists ONLY to enforce the 1-email-per-5-minutes-per-contributor
 * re-send limit for account verification and password reset (issue #440,
 * ADR 0020 decision 2). Admission is ATOMIC: `reserveAuthEmail` runs one
 * INSERT ... SELECT ... WHERE (count < limit) RETURNING id statement, so
 * concurrent sends cannot race past a stale count; the reserved row doubles
 * as the send-log row (kept when the provider accepts, deleted by id on a
 * deterministic pre-delivery failure). Privacy by design: the row stores NO
 * content, NO recipient address (the address already lives on
 * `contributors.email`) and NO IP — a leak of this table reveals nothing
 * beyond "account X was emailed for kind Y at time T". `kind` is
 * 'verify' | 'reset'; the rate-limit window counts rows newer than
 * now - 5 min for the contributor. Rows cascade-delete with the account
 * (ADR 0013 erasure) and age out via retention R18 (24 h).
 * Declared here so drizzle-kit generate never re-emits it (convention
 * 0012/0014: hand-written migration + schema declaration together).
 */
export const emailSendLog = sqliteTable(
  "email_send_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contributorId: integer("contributor_id").notNull().references(() => contributors.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sentAt: text("sent_at").notNull(),
  },
  (table) => [
    index("email_send_log_contributor_idx").on(table.contributorId),
    index("email_send_log_sent_at_idx").on(table.sentAt),
  ],
);

/**
 * Per-IP registration attempts (P3-4, CEO decision t_0941036b; migration
 * 0032). One row per POST /api/auth/register request, keyed by the SHA-256
 * of the caller key (cf-connecting-ip) — NEVER the raw IP (privacy by
 * design, same rule as the abuse-alert `callerHash`). The register route records the attempt and counts the
 * rolling window (`WHERE ip_hash = ? AND created_at >= ?`) in ONE D1 batch,
 * so two concurrent registrations cannot race past a stale count; the
 * request that brings the count to the cap (default 5 per 24h) answers 429.
 * Rows older than the window fall out of the COUNT, so the cap resets
 * automatically without any cleanup job. Declared here so drizzle-kit
 * generate never re-emits it (convention 0012/0014: hand-written migration
 * + schema declaration together).
 */
export const registrationIpLog = sqliteTable(
  "registrations_ip_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ipHash: text("ip_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    // The window COUNT is `WHERE ip_hash = ? AND created_at >= ?`, so
    // (ip_hash, created_at) turns it into an index-only seek.
    index("registrations_ip_log_ip_created_idx").on(table.ipHash, table.createdAt),
  ],
);

/**
 * Per-contributor private write API keys (EPIC api-keys, decisions D1-D13
 * approved 2026-08-09 — docs/decisions/ADR 0022, migration 0045).
 *
 * Authenticate the write API for scripts and tools without a browser
 * session. Read API stays keyless by design (D1).
 *
 * Security properties (D2/D3), following the same rules as db/auth.ts:
 *  - The raw key (`osdb_` + 32 random bytes base64url, D2) is NEVER stored:
 *    only its SHA-256 hex (`key_hash`, globally UNIQUE — D3) plus the first
 *    10 chars (`key_prefix`) for display. A database leak cannot replay a
 *    key, and the raw value exists in exactly one API response (the mint
 *    POST, reveal-once, Cache-Control: no-store).
 *  - `scopes` is the JSON array of write scopes the key grants (D4):
 *    `["submit","confirm","edit","action"]` — family-level, default all
 *    four at mint, code-validated whitelist (never free-form).
 *  - Soft revoke via `revoked_at` (DELETE endpoint); a revoked key is dead
 *    even if its hash is known. `expires_at` is optional (NULL = never,
 *    default +365d at mint, D6); expired keys answer 401.
 *  - `last_used_at` is throttled (updated at most every 5 minutes, D7) and
 *    ISO-8601 UTC TEXT like every other timestamp in this project (never
 *    SQLite `datetime('now')`).
 *  - The `contributor_id` FK is ON DELETE CASCADE (account erasure removes
 *    the keys — art. 17, D9); the erasure batch in db/auth.ts mirrors the
 *    delete because the test harness does not enforce foreign keys (same
 *    rule as `sessions` and `camera_community_actions`).
 *
 * Declared here so drizzle-kit generate never re-emits it (convention
 * 0012/0014: hand-written migration + schema declaration together).
 */
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contributorId: integer("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    // User label, 1..60 chars (code-validated at mint).
    name: text("name").notNull(),
    // First 10 chars of the raw key — display only, never authenticates.
    keyPrefix: text("key_prefix").notNull(),
    // SHA-256 hex of the full raw key (D3). UNIQUE via api_keys_key_hash_unique.
    keyHash: text("key_hash").notNull(),
    // JSON array ["submit","confirm","edit","action"] (D4, code-validated).
    scopes: text("scopes").notNull(),
    createdAt: text("created_at").notNull(),
    // Throttled (≥5 min, D7); NULL until the key is first used.
    lastUsedAt: text("last_used_at"),
    // NULL = never; default +365d at mint (D6). Expired → 401.
    expiresAt: text("expires_at"),
    // Soft revoke (D9). NULL = active.
    revokedAt: text("revoked_at"),
  },
  (table) => [
    // Lookup key for every authenticated request: hash the presented Bearer
    // token and point-lookup by key_hash (constant-time compare in code).
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
    // "My keys" list, cap-5 COUNT and erasure all filter on contributor_id.
    index("api_keys_contributor_idx").on(table.contributorId),
    // R21 retention sweep (90d after revoked/expired) filters on
    // (revoked_at, expires_at); the liveness predicate in the gate
    // (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?))
    // also reads it.
    index("api_keys_liveness_idx").on(table.revokedAt, table.expiresAt),
  ],
);
