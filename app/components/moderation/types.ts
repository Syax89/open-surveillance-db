"use client";

// Shared moderation types — extracted from the ModerationDashboard monolith
// (kanban t_c7460073, pattern of the home refactor t_6104f386).

export type CameraInQueue = {
  id: number;
  title: string;
  kind: string;
  manufacturer?: string | null;
  observedOn?: string | null;
  publishManufacturer?: boolean;
  publishObservedOn?: boolean;
  address?: string | null;
  notes?: string;
  latitude: number;
  longitude: number;
  status: string;
  source?: string;
  createdAt?: string;
  updated?: string;
};

export type CorrectionInQueue = {
  id: number;
  cameraId?: number | null;
  issueType: string;
  message: string;
  contact?: string | null;
  status: string;
  createdAt?: string;
};

export type PhotoInQueue = {
  id: number;
  cameraId?: number | null;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  status: string;
  exifStripped: number;
  redactionConfirmed: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Reviewer = {
  id: number;
  displayName: string;
  role: string;
  active?: number;
  mfaEnabled?: number;
};

export type QueueItem = {
  id: number | null;
  entity: "camera" | "correction";
  entityId: number;
  state: "queued" | "assigned" | "second_review" | "escalated" | "closed";
  assigneeId?: number | null;
  sensitivity: "standard" | "sensitive" | "urgent";
  requiresSecondReview?: number;
  secondReviewerId?: number | null;
  escalationReason?: string | null;
  assignee?: string | null;
  secondReviewer?: string | null;
};

export type ModerationEvent = {
  id?: number;
  entity?: string;
  entityId?: number;
  previousStatus?: string;
  newStatus?: string;
  action?: string;
  reasonCode?: string;
  reason?: string;
  note?: string | null;
  actor?: string;
  actorRole?: string | null;
  recused?: number;
  escalated?: number;
  secondReviewerId?: number | null;
  createdAt?: string;
  timestamp?: string;
};

export type QueuePayload = {
  cameraReports?: CameraInQueue[];
  publishedCameras?: CameraInQueue[];
  reviewCameras?: CameraInQueue[];
  correctionRequests?: CorrectionInQueue[];
  photoReports?: PhotoInQueue[];
  recentEvents?: ModerationEvent[];
  reviewers?: Reviewer[];
  queueItems?: QueueItem[];
  error?: string;
};

export type QueueEntity = "camera" | "correction" | "photo";
export type ModerationAction = "approve" | "reject" | "hide" | "mark-stale" | "reverify" | "escalate";
export type ReasonCode = "verified-public-infrastructure" | "insufficient-evidence" | "duplicate" | "private-or-sensitive-location" | "inaccurate-or-outdated" | "privacy-or-safety-concern" | "requires-senior-review" | "other";

export const reasonOptions: { value: ReasonCode }[] = [
  { value: "verified-public-infrastructure" },
  { value: "insufficient-evidence" },
  { value: "duplicate" },
  { value: "private-or-sensitive-location" },
  { value: "inaccurate-or-outdated" },
  { value: "privacy-or-safety-concern" },
  { value: "requires-senior-review" },
  { value: "other" },
];

/**
 * Decision-form API exposed by useModerationQueue. Components receive this
 * object instead of a pile of unrelated state props (pattern t_6104f386:
 * "each receiving only the props it needs"). All keys are derived from the
 * `${entity}-${id}` row key internally.
 */
export type DecisionFormApi = {
  reason: (key: string) => string;
  setReason: (key: string, value: string) => void;
  note: (key: string) => string;
  setNote: (key: string, value: string) => void;
  metadataChoices: (key: string) => { manufacturer: boolean; observedOn: boolean };
  setMetadataChoice: (key: string, field: "manufacturer" | "observedOn", value: boolean) => void;
  redactionConfirmed: (key: string) => boolean;
  setRedactionConfirmed: (key: string, value: boolean) => void;
  processing: string | null;
  actorId: string;
  decide: (entity: QueueEntity, id: number, action: ModerationAction) => void;
};

