import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  },
  (table) => [
    index("cameras_status_idx").on(table.status),
    // Coordinate lookup for the proximity searches (bbox pre-filter, 0013).
    index("cameras_coordinates_idx").on(table.latitude, table.longitude),
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
  },
  (table) => [index("correction_requests_status_idx").on(table.status)],
);

/**
 * Registered contributors (STATUS gap #1, ADR 0013). `email` is stored
 * lowercase and unique; `password_hash` is a PBKDF2-SHA256 string
 * (`pbkdf2$<iterations>$<saltB64>$<hashB64>`). `display_name` is an optional
 * public handle. Anonymous submissions remain possible by design; an account
 * is only needed to track and attribute your own reports.
 */
export const contributors = sqliteTable(
  "contributors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    displayName: text("display_name"),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("contributors_email_unique").on(table.email)],
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
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("users_role_idx").on(table.role)],
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
  ],
);

/**
 * Append-only audit trail for moderation decisions. Extended with reviewer
 * attribution (reviewer id + role captured at write time), recusal and
 * escalation flags, and the second reviewer involved in a two-person review.
 * `appeal_id` links an appeal's audit events back to the appeal row.
 * UPDATE/DELETE are blocked at the database layer (triggers in migration
 * 0008); the API exposes no way to mutate history.
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
 * Photo evidence attached to a camera report. D1 stores METADATA ONLY; the
 * image bytes live in object storage (R2 bucket `PHOTOS`) under an opaque
 * `storage_key` that is never exposed to clients. Photos are never public:
 * they must be approved by a moderator with confirmed redaction, and the
 * linked camera must itself be public (`cameras.status` + freshness).
 * `exif_stripped` records the mandatory intake strip; `redaction_confirmed`
 * is set by the moderator at approval time.
 */
export const photos = sqliteTable(
  "photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cameraId: integer("camera_id"),
    contributorId: integer("contributor_id"),
    // Internal pending-quota bucket (migration 0013): `contributor:<id>` for
    // authenticated uploads, `anon:<sha256(caller key)>` for anonymous ones.
    // Never exposed through the public projection; only 'pending' rows count.
    submitterKey: text("submitter_key"),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: text("status").notNull().default("pending"),
    exifStripped: integer("exif_stripped").notNull().default(1),
    redactionConfirmed: integer("redaction_confirmed").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("photos_status_idx").on(table.status),
    index("photos_camera_idx").on(table.cameraId),
    // Pending-quota lookups always filter on (submitter_key, status='pending').
    index("photos_pending_submitter_idx")
      .on(table.submitterKey)
      .where(sql`${table.status} = 'pending'`),
  ],
);
