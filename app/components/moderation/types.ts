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
  outcome?: string | null;
  createdAt?: string;
};

/**
 * Record-outcome allowlist for correction approvals (H1, t_69891619).
 * Mirrors the backend `correctionOutcomes` in db/moderation.ts so the UI
 * never proposes a value the API would reject. `kept` is the "verified /
 * record unchanged" outcome; the three headline outcomes of the H1
 * requirement (verified / corrected / removed) come first in the selector.
 */
export const correctionOutcomeOptions = [
  { value: "kept" },
  { value: "corrected" },
  { value: "removed" },
  { value: "marked-stale" },
  { value: "escalated" },
] as const;
export type CorrectionOutcomeValue = (typeof correctionOutcomeOptions)[number]["value"];

/**
 * A pending community edit request (ADR 0018 §4, C3). `proposed*` are the
 * per-column diff the contributor sent (null = column unchanged); `current*`
 * are the camera's stored values, so the review UI diffs old/new in one row.
 */
export type EditRequestInQueue = {
  id: number;
  cameraId?: number | null;
  contributorId?: number | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  proposedTitle?: string | null;
  proposedKind?: string | null;
  proposedAddress?: string | null;
  proposedNotes?: string | null;
  proposedManufacturer?: string | null;
  proposedObservedOn?: string | null;
  proposedDescription?: string | null;
  currentTitle?: string | null;
  currentKind?: string | null;
  currentAddress?: string | null;
  currentNotes?: string | null;
  currentManufacturer?: string | null;
  currentObservedOn?: string | null;
  currentDescription?: string | null;
  cameraStatus?: string | null;
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
  cameraEditRequests?: EditRequestInQueue[];
  photoReports?: PhotoInQueue[];
  recentEvents?: ModerationEvent[];
  reviewers?: Reviewer[];
  queueItems?: QueueItem[];
  error?: string;
};

export type QueueEntity = "camera" | "correction" | "photo" | "camera_edit";
export type ModerationAction = "approve" | "reject" | "hide" | "mark-stale" | "reverify" | "escalate" | "associate";
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
  // Correction-only fields (H1, t_69891619): the record outcome chosen on
  // approve and the record id the request is linked to (associate requires
  // it; approve/reject may re-link).
  outcome: (key: string) => string;
  setOutcome: (key: string, value: string) => void;
  cameraId: (key: string) => string;
  setCameraId: (key: string, value: string) => void;
  metadataChoices: (key: string) => { manufacturer: boolean; observedOn: boolean };
  setMetadataChoice: (key: string, field: "manufacturer" | "observedOn", value: boolean) => void;
  redactionConfirmed: (key: string) => boolean;
  setRedactionConfirmed: (key: string, value: boolean) => void;
  processing: string | null;
  actorId: string;
  decide: (entity: QueueEntity, id: number, action: ModerationAction) => void;
};

