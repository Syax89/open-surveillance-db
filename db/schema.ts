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
  (table) => [index("cameras_status_idx").on(table.status)],
);

export const correctionRequests = sqliteTable(
  "correction_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cameraId: integer("camera_id"),
    issueType: text("issue_type").notNull(),
    message: text("message").notNull(),
    contact: text("contact"),
    status: text("status").notNull().default("pending"),
    outcome: text("outcome"),
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
 * Named local moderators. Roles encode the separation of duties in
 * DATA_TRUST.md: intake reviewers triage but cannot publish, record reviewers
 * and senior moderators approve, the privacy/safety lead owns urgent hides,
 * and the administrator can only escalate (never edit content or approve).
 * Real authentication/MFA is a public-alpha ticket; `mfa_enabled` already
 * records the expectation. The five "Demo" rows are the local-prototype seed
 * from the Wave B migration.
 */
export const reviewers = sqliteTable(
  "reviewers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    displayName: text("display_name").notNull().unique(),
    role: text("role").notNull(),
    active: integer("active").notNull().default(1),
    mfaEnabled: integer("mfa_enabled").notNull().default(0),
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
 * Append-only audit trail for moderation decisions. Extended with reviewer
 * attribution (reviewer id + role captured at write time), recusal and
 * escalation flags, and the second reviewer involved in a two-person review.
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
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("moderation_events_created_at_idx").on(table.createdAt, table.id)],
);
