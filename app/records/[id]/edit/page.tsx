"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LocaleToggle } from "../../../components/LocaleProvider";
import { useMessages } from "../../../lib/use-messages";
import { SiteHeader } from "../../../components/SiteHeader";
import { KIND_OPTIONS, isDomeKind } from "../../../lib/camera-kinds";
import { formatDirection } from "../../../lib/compass";

/**
 * /records/[id]/edit — dedicated contribution edit page (COMMUNITY_PLAN §2.2,
 * §6 C6; SITEMAP kebab-case route listed before code).
 *
 * Privacy/safety by design:
 *  - the page is a private surface: it is never linked from public
 *    navigation, renders only after the owner-only GET /api/cameras/[id]/edit
 *    answers 200, and keeps `robots: noindex` in its metadata so crawlers
 *    never index the form;
 *  - the public record API is attribution-free, so pre-filling comes from
 *    the dedicated owner read (notes included, editRequest state included);
 *  - all mutations go through the two-track PATCH /api/cameras/[id]:
 *    `pending` → direct update, `verified`/`needs_review`/`stale` → an
 *    edit-request that a moderator reviews before it replaces the record
 *    (the page shows the "changes enter moderation" notice), and
 *    `removed`/`rejected` → a localized 409 blocked message, never a form.
 *
 * Accessibility (QA-2026-08-01-2/-3): every field is wired with
 * aria-invalid + aria-describedby to its inline error, server errors are
 * announced in role="alert" and receive focus after a failed submit, the
 * success state is announced and focused, and the form is noValidate (no
 * duplicate native UI). All strings come from record.ts (form) and
 * community.ts (moderation notice / statuses) — zero hardcoded copy.
 */

/** Read the script-readable CSRF cookie so mutations can echo it back. */
function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("osdb_csrf="));
  return match ? decodeURIComponent(match.slice("osdb_csrf=".length)) : null;
}

/** Editable whitelist mirrors EDITABLE_EDIT_FIELD_LIMITS in db/camera-edits.ts. */
const FIELD_LIMITS: Record<string, number> = {
  title: 90,
  kind: 60,
  address: 180,
  notes: 1000,
  manufacturer: 80,
  observedOn: 10,
  description: 1000,
};

type OwnerRecord = {
  id: number;
  title: string;
  kind: string;
  manufacturer: string | null;
  observedOn: string | null;
  address: string | null;
  notes: string;
  description: string;
  status: string;
  updated: string;
  /** Field-of-view bearing 0-359 or NULL (domes/unknown), migration 0035 (t_f8b775ec). */
  direction: number | null;
};

type EditRequest = { id: number; cameraId: number; status: "pending"; createdAt: string };

type EditView = { record: OwnerRecord; editRequest: EditRequest | null };

// ADR 0021 §12.1: after migration 0039 the published status is "active"
// ("verified" remains for legacy moderation flows).
const PUBLISHED_STATUSES = ["active", "verified", "needs_review", "stale"];

type Phase = "loading" | "login" | "notFound" | "notOwner" | "error" | "ready";

export default function RecordEditPage() {
  const params = useParams<{ id: string }>();
  const bundle = useMessages();
  const t = bundle.record;
  const community = bundle.community;
  const recordId = Number(params.id);

  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<EditView | null>(null);
  const [values, setValues] = useState({ title: "", kind: "", manufacturer: "", observedOn: "", address: "", notes: "", description: "", direction: null as number | null });
  // Field-of-view direction (t_f8b775ec): mirrors the record's stored
  // bearing; directionKnown is true only when the record HAS one (so the
  // slider pre-fills) and resets when the contributor checks "non so".
  const [directionKnown, setDirectionKnown] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cameras/${recordId}/edit`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) { setPhase("login"); return; }
        if (response.status === 403) { setPhase("notOwner"); return; }
        if (response.status === 404) { setPhase("notFound"); return; }
        if (!response.ok) { setPhase("error"); return; }
        const data = await response.json() as EditView;
        if (cancelled) return;
        setView(data);
        setValues({
          title: data.record.title,
          kind: data.record.kind,
          manufacturer: data.record.manufacturer ?? "",
          observedOn: data.record.observedOn ?? "",
          address: data.record.address ?? "",
          notes: data.record.notes,
          description: data.record.description,
          direction: data.record.direction,
        });
        setDirectionKnown(data.record.direction !== null && typeof data.record.direction === "number" && Number.isFinite(data.record.direction));
        setPhase("ready");
      })
      .catch(() => { if (!cancelled) setPhase("error"); });
    return () => { cancelled = true; };
  }, [recordId]);

  // Focus the page heading once the gate settles (keyboard/screen-reader
  // users land on the h1 instead of an empty main).
  useEffect(() => {
    if (phase !== "loading") headingRef.current?.focus();
  }, [phase]);

  const record = view?.record ?? null;
  const editRequest = view?.editRequest ?? null;
  const isBlocked = record !== null && (record.status === "removed" || record.status === "rejected");
  const isPublished = record !== null && (PUBLISHED_STATUSES as readonly string[]).includes(record.status);

  function setField(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    setFieldErrors((errors) => (errors[name] ? { ...errors, [name]: undefined } : errors));
  }

  /** Client-side validation: required title + per-field max lengths (noValidate form). */
  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (values.title.trim().length === 0) errors.title = t.editTitleRequired;
    for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
      const text = values[field as keyof typeof values];
      if (typeof text === "string" && text.length > limit) {
        errors[field] = t.editFieldTooLong(limit);
      }
    }
    if (values.observedOn !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(values.observedOn)) {
      errors.observedOn = t.editObservedOnInvalid;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);
    setSaved(false);
    if (!validate()) return;

    const csrfToken = readCsrfToken();
    const payload = {
      title: values.title.trim(),
      kind: values.kind.trim(),
      address: values.address.trim(),
      notes: values.notes.trim(),
      manufacturer: values.manufacturer.trim(),
      observedOn: values.observedOn.trim(),
      description: values.description.trim(),
      // Field-of-view direction (t_f8b775ec): always sent — a bearing when
      // the contributor specified one, null otherwise ("non so" clears /
      // leaves it unset; the server re-applies the dome rule on apply).
      direction: directionKnown && values.direction !== null ? values.direction : null,
      // Optimistic concurrency: the PATCH answers 409 when the record
      // changed since the page loaded (race), never a silent overwrite.
      expectedUpdated: record?.updated,
    };

    setSubmitting(true);
    try {
      const response = await fetch(`/api/cameras/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as Record<string, unknown>;
      if (response.ok) {
        // 200 direct_applied / no_changes (pending track) or
        // 202 edit_request_created (published track).
        setSaved(true);
        if (response.status === 202 && body.editRequest) {
          setView((current) => current ? { ...current, editRequest: body.editRequest as EditRequest } : current);
        }
        return;
      }
      const message = String(body.error ?? "");
      if (response.status === 409) {
        if (message.includes("already pending")) { setServerError(community.errorEditConflict); }
        else if (message.includes("changed since")) { setServerError(community.errorEditRace); }
        else { setServerError(community.editBlockedRemoved); }
      } else if (response.status === 403) {
        setServerError(community.errorEditNotOwner);
      } else if (response.status === 429) {
        setServerError(community.errorEditRateLimit);
      } else if (response.status === 404) {
        setServerError(community.errorEditNotFound);
      } else {
        setServerError(community.errorEditGeneric);
      }
    } catch {
      setServerError(community.errorEditGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  // Focus the error alert after a failed submit so assistive technology
  // announces it immediately (same pattern as the auth forms).
  useEffect(() => {
    if (serverError) alertRef.current?.focus();
  }, [serverError]);

  const kindKnown = record !== null && KIND_OPTIONS.some((option) => option.value === record?.kind);
  const kindLabel = (key: string): string => t.editKindOptions[key as keyof typeof t.editKindOptions] ?? key;
  // Dome rule (t_f8b775ec): a dome has no directional field of view — the
  // direction fieldset is hidden and any stored/selected bearing is cleared
  // when the kind becomes a dome (the server normalises NULL on write too).
  const showDirectionField = !isDomeKind(values.kind);
  const handleKindChange = (value: string) => {
    setField("kind", value);
    if (isDomeKind(value)) {
      setValues((v) => ({ ...v, direction: null }));
      setDirectionKnown(false);
    }
  };

  return (
    <main id="main-content" className="record-page">
      <SiteHeader navLabel={t.navigation} toggle="none">
        <div className="nav-record-actions">
          <Link className="text-button" href={`/records/${recordId}`}>{t.backToDirectory}</Link>
          <LocaleToggle />
        </div>
      </SiteHeader>

      <article className="record-detail auth-card">
        <p className="eyebrow"><span /> {community.editContribution}</p>
        <h1 tabIndex={-1} ref={headingRef}>{community.editYourContribution}</h1>

        {phase === "loading" ? <p className="loading-note">{t.loading}</p> : null}

        {phase === "login" ? (
          <>
            <h2>{community.editLoginTitle}</h2>
            <p className="record-detail-summary">{community.editLoginBody}</p>
            <p className="auth-switch">
              <Link className="button button-primary" href="/login">{community.editLoginAction}</Link>
            </p>
          </>
        ) : null}

        {phase === "notFound" ? (
          <>
            <h2>{t.notFound}</h2>
            <p className="record-detail-summary">{community.errorEditNotFound}</p>
            <Link className="button button-primary" href="/directory">{t.browseDirectory}</Link>
          </>
        ) : null}

        {phase === "notOwner" ? (
          <>
            <h2>{t.unavailable}</h2>
            <p className="record-detail-summary">{community.errorEditNotOwner}</p>
            <Link className="button button-primary" href="/directory">{t.browseDirectory}</Link>
          </>
        ) : null}

        {phase === "error" ? (
          <>
            <h2>{t.unavailable}</h2>
            <p className="record-detail-summary">{t.loadErrorDetail}</p>
            <Link className="button button-primary" href="/directory">{t.browseDirectory}</Link>
          </>
        ) : null}

        {phase === "ready" && isBlocked ? (
          <>
            <h2>{t.editBlockedRemovedTitle}</h2>
            <p className="record-detail-summary">{community.editBlockedRemoved}</p>
            <Link className="button button-primary" href={`/records/${recordId}`}>{community.editBackToRecord}</Link>
          </>
        ) : null}

        {phase === "ready" && !isBlocked && editRequest ? (
          <>
            <p className="auth-error" role="status" tabIndex={-1}>
              {saved ? community.editSubmitted : community.editRequestPending}
            </p>
            <p className="record-detail-summary">{community.editReviewNotice}</p>
            <Link className="button button-primary" href={`/records/${recordId}`}>{community.editBackToRecord}</Link>
          </>
        ) : null}

        {phase === "ready" && !isBlocked && !editRequest ? (
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {saved ? (
              <p className="edit-saved" role="status" tabIndex={-1}>
                {isPublished ? community.editSubmitted : community.editSaved}
              </p>
            ) : null}

            {serverError ? (
              <p className="auth-error" role="alert" tabIndex={-1} ref={alertRef}>{serverError}</p>
            ) : null}

            <label className="auth-field">
              <span>{t.editTitle}</span>
              <input
                name="title"
                required
                maxLength={FIELD_LIMITS.title}
                placeholder={t.editTitlePlaceholder}
                aria-invalid={fieldErrors.title ? true : undefined}
                aria-describedby={fieldErrors.title ? "edit-title-error" : undefined}
                value={values.title}
                onChange={(event) => setField("title", event.target.value)}
              />
              {fieldErrors.title ? <small id="edit-title-error">{fieldErrors.title}</small> : null}
            </label>

            <label className="auth-field">
              <span>{t.editKind}</span>
              <select
                name="kind"
                required
                aria-invalid={fieldErrors.kind ? true : undefined}
                aria-describedby={fieldErrors.kind ? "edit-kind-error" : undefined}
                value={values.kind}
                onChange={(event) => handleKindChange(event.target.value)}
              >
                {!kindKnown && values.kind !== "" ? <option value={values.kind}>{values.kind}</option> : null}
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{kindLabel(option.labelKey)}</option>
                ))}
              </select>
              {fieldErrors.kind ? <small id="edit-kind-error">{fieldErrors.kind}</small> : null}
            </label>

            {showDirectionField ? (
              <fieldset className="direction-entry" aria-labelledby="edit-direction-title">
                <legend id="edit-direction-title">{t.editDirectionTitle}</legend>
                <p className="search-count" id="edit-direction-help">{t.editDirectionHelp}</p>
                <label className="check-label check-direction-unknown">
                  <input
                    type="checkbox"
                    checked={!directionKnown}
                    onChange={(event) => {
                      setDirectionKnown(!event.target.checked);
                      if (!event.target.checked) setValues((v) => ({ ...v, direction: null }));
                    }}
                  />
                  <span>{t.editDirectionUnknown}</span>
                </label>
                {directionKnown ? (
                  <div className="direction-controls">
                    <span className="direction-arrow" aria-hidden="true" style={{ transform: `rotate(${values.direction ?? 0}deg)` }}>→</span>
                    <div className="direction-slider-row">
                      <label htmlFor="edit-direction-slider">{t.editDirectionDegrees}</label>
                      <input
                        id="edit-direction-slider"
                        name="direction"
                        type="range"
                        min={0}
                        max={359}
                        step={1}
                        value={values.direction ?? 0}
                        onChange={(event) => setValues((v) => ({ ...v, direction: Number(event.target.value) }))}
                        aria-describedby="edit-direction-help"
                      />
                      <output htmlFor="edit-direction-slider" className="direction-output">{formatDirection(values.direction ?? 0)}</output>
                    </div>
                  </div>
                ) : null}
              </fieldset>
            ) : null}

            <div className="report-metadata-fields">
              <label className="auth-field">
                <span>{t.editManufacturer}</span>
                <input
                  name="manufacturer"
                  maxLength={FIELD_LIMITS.manufacturer}
                  placeholder={t.editManufacturerPlaceholder}
                  aria-invalid={fieldErrors.manufacturer ? true : undefined}
                  aria-describedby={fieldErrors.manufacturer ? "edit-manufacturer-error" : undefined}
                  value={values.manufacturer}
                  onChange={(event) => setField("manufacturer", event.target.value)}
                />
                {fieldErrors.manufacturer ? <small id="edit-manufacturer-error">{fieldErrors.manufacturer}</small> : null}
              </label>
              <label className="auth-field">
                <span>{t.editObservedOn}</span>
                <input
                  name="observedOn"
                  type="date"
                  maxLength={FIELD_LIMITS.observedOn}
                  aria-invalid={fieldErrors.observedOn ? true : undefined}
                  aria-describedby={fieldErrors.observedOn ? "edit-observed-on-error" : undefined}
                  value={values.observedOn}
                  onChange={(event) => setField("observedOn", event.target.value)}
                />
                {fieldErrors.observedOn ? <small id="edit-observed-on-error">{fieldErrors.observedOn}</small> : null}
              </label>
            </div>

            <label className="auth-field">
              <span>{t.editAddress}</span>
              <input
                name="address"
                maxLength={FIELD_LIMITS.address}
                placeholder={t.editAddressPlaceholder}
                aria-invalid={fieldErrors.address ? true : undefined}
                aria-describedby={fieldErrors.address ? "edit-address-error" : undefined}
                value={values.address}
                onChange={(event) => setField("address", event.target.value)}
              />
              {fieldErrors.address ? <small id="edit-address-error">{fieldErrors.address}</small> : null}
            </label>

            <label className="auth-field">
              <span>{t.editNotes}</span>
              <textarea
                name="notes"
                rows={3}
                maxLength={FIELD_LIMITS.notes}
                placeholder={t.editNotesPlaceholder}
                aria-invalid={fieldErrors.notes ? true : undefined}
                aria-describedby={fieldErrors.notes ? "edit-notes-error" : undefined}
                value={values.notes}
                onChange={(event) => setField("notes", event.target.value)}
              />
              {fieldErrors.notes ? <small id="edit-notes-error">{fieldErrors.notes}</small> : null}
            </label>

            <label className="auth-field">
              <span>{t.editDescription}</span>
              <textarea
                name="description"
                rows={3}
                maxLength={FIELD_LIMITS.description}
                placeholder={t.editDescriptionPlaceholder}
                aria-invalid={fieldErrors.description ? true : undefined}
                aria-describedby={fieldErrors.description ? "edit-description-error" : undefined}
                value={values.description}
                onChange={(event) => setField("description", event.target.value)}
              />
              {fieldErrors.description ? <small id="edit-description-error">{fieldErrors.description}</small> : null}
            </label>

            {isPublished ? (
              <p className="edit-moderation-notice" role="note">{community.editReviewNotice}</p>
            ) : null}

            <button className="button button-primary" type="submit" disabled={submitting}>
              {submitting ? t.loading : isPublished ? community.saveSubmitForReview : community.saveChanges}
            </button>

            <p className="auth-switch">
              <Link href={`/records/${recordId}`}>{community.editBackToRecord}</Link>
            </p>
          </form>
        ) : null}
      </article>
    </main>
  );
}
