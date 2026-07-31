import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cameras = sqliteTable("cameras", {
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
  createdAt: text("created_at").notNull(),
});

export const correctionRequests = sqliteTable("correction_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cameraId: integer("camera_id"),
  issueType: text("issue_type").notNull(),
  message: text("message").notNull(),
  contact: text("contact"),
  status: text("status").notNull().default("pending"),
  outcome: text("outcome"),
  createdAt: text("created_at").notNull(),
});

export const moderationEvents = sqliteTable("moderation_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entity: text("entity").notNull(),
  entityId: integer("entity_id").notNull(),
  previousStatus: text("previous_status").notNull(),
  newStatus: text("new_status").notNull(),
  action: text("action").notNull(),
  reasonCode: text("reason_code").notNull(),
  note: text("note"),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull(),
});
