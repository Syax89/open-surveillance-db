// Mock of db/camera-edits as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.
// parseEditableEditFields is a pure validator (no db, no crypto): it runs for
// real, exactly like the pure helpers in the auth/confirmations mocks, so the
// route tests exercise the whitelist enforcement and per-field 400s.

import { makeMock } from "../mock-state.mjs";

export const EDITABLE_EDIT_FIELDS = [
  "title",
  "kind",
  "address",
  "notes",
  "manufacturer",
  "observedOn",
  "direction",
  "description",
];

export const EDITABLE_EDIT_FIELD_LIMITS = {
  title: 90,
  kind: 60,
  address: 180,
  notes: 1000,
  manufacturer: 80,
  observedOn: 10,
  direction: 3,
  description: 1000,
};

export const NEVER_EDITABLE_EDIT_FIELDS = [
  "status",
  "contributorId",
  "source",
  "publishManufacturer",
  "publishObservedOn",
  "lastVerifiedAt",
  "reviewDueAt",
  "reviewIntervalMonths",
  "latitude",
  "longitude",
  "id",
  "createdAt",
  "updated",
];

export const PUBLISHED_EDITABLE_STATUSES = ["verified", "needs_review", "stale"];
export const TERMINAL_EDITABLE_STATUSES = ["removed", "rejected"];

function isCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Real validator: mirrors db/camera-edits.parseEditableEditFields so route
// tests can assert the 400 per-field contract without a db round-trip.
export function parseEditableEditFields(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "A JSON object with at least one editable field is required." };
  }
  const body = value;
  const fields = {};
  let expectedUpdated;
  for (const key of Object.keys(body)) {
    if (key === "expectedUpdated") {
      if (typeof body[key] !== "string" || body[key].length === 0) {
        return { ok: false, error: 'The "expectedUpdated" precondition must be a non-empty string.' };
      }
      expectedUpdated = body[key];
      continue;
    }
    if (!EDITABLE_EDIT_FIELDS.includes(key)) {
      return { ok: false, error: `Field "${key}" is not editable.` };
    }
    const maxLength = EDITABLE_EDIT_FIELD_LIMITS[key];
    const raw = body[key];
    // direction (t_1b08fe12): nullable integer bearing 0-359, handled before
    // the string columns because an explicit null is a MEANINGFUL clear.
    if (key === "direction") {
      if (raw === undefined) continue;
      if (raw === null) {
        fields.direction = null;
        continue;
      }
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 359) {
        return { ok: false, error: 'Field "direction" must be an integer between 0 and 359, or null.', status: 422 };
      }
      fields.direction = raw;
      continue;
    }
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") {
      return { ok: false, error: `Field "${key}" must be a string.` };
    }
    const text = raw.trim();
    if (text.length > maxLength) {
      return { ok: false, error: `Field "${key}" must be at most ${maxLength} characters.` };
    }
    if (key === "observedOn") {
      if (text !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return { ok: false, error: `Field "observedOn" must be a YYYY-MM-DD date.` };
      }
      if (text !== "" && !isCalendarDate(text)) {
        return { ok: false, error: `Field "observedOn" is not a valid calendar date.` };
      }
      fields[key] = text === "" ? null : text;
      continue;
    }
    if (key === "title" || key === "kind") {
      if (text === "") {
        return { ok: false, error: `Field "${key}" cannot be empty.` };
      }
      fields[key] = text;
      continue;
    }
    if (key === "address" || key === "manufacturer") {
      fields[key] = text === "" ? null : text;
      continue;
    }
    fields[key] = text;
  }
  if (Object.keys(fields).length === 0 && expectedUpdated === undefined) {
    return { ok: false, error: "Provide at least one editable field." };
  }
  return { ok: true, payload: { fields, ...(expectedUpdated !== undefined ? { expectedUpdated } : {}) } };
}

export const {
  applyCameraEdit,
  getCameraEditView,
} = makeMock({
  applyCameraEdit: "applyCameraEdit",
  getCameraEditView: "getCameraEditView",
});
