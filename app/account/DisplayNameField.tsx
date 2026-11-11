"use client";

// Display name inline edit (C6/C8), extracted from AccountPageBody: the
// editing state, draft and per-field error are local to the field and
// announced/focused on submit (aria-invalid + aria-describedby). A
// successful PATCH hands the updated profile back to the page.

import { useEffect, useRef, useState } from "react";
import { useDomainMessages } from "../lib/use-domain-messages";
import { authByLocale } from "../lib/i18n/auth";
import { readCsrfToken } from "../lib/csrf";
import type { Contributor } from "./account-types";

type Props = {
  contributor: Contributor;
  /** The PATCH response's updated profile (shared page state). */
  onContributorUpdated: (contributor: Contributor) => void;
};

export function DisplayNameField({ contributor, onContributorUpdated }: Props) {
  const t = useDomainMessages(authByLocale);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameErrorRef = useRef<HTMLParagraphElement>(null);

  // Move focus into the name input when inline editing opens.
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // Announce + focus the name error after a failed save.
  useEffect(() => {
    if (nameError) nameErrorRef.current?.focus();
  }, [nameError]);

  function startEditName() {
    setNameDraft(contributor.displayName ?? "");
    setNameError(null);
    setNameSaved(false);
    setEditingName(true);
  }

  function cancelEditName() {
    setEditingName(false);
    setNameError(null);
  }

  async function onSaveDisplayName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = nameDraft.trim();
    if (trimmed.length > 0 && (trimmed.length < 2 || trimmed.length > 60)) {
      setNameError(t.errorDisplayName);
      return;
    }
    const csrfToken = readCsrfToken();
    setNameSaving(true);
    setNameError(null);
    setNameSaved(false);
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        body: JSON.stringify({ displayName: trimmed.length === 0 ? null : trimmed }),
      });
      if (response.status === 429) {
        setNameError(t.errorDisplayNameRateLimit);
        return;
      }
      if (response.status === 403) {
        setNameError(t.errorCrossOrigin);
        return;
      }
      if (!response.ok) {
        setNameError(t.errorDisplayNameGeneric);
        return;
      }
      const body = await response.json() as { contributor?: Contributor };
      if (body.contributor) onContributorUpdated(body.contributor);
      setEditingName(false);
      setNameSaved(true);
    } catch {
      setNameError(t.errorDisplayNameGeneric);
    } finally {
      setNameSaving(false);
    }
  }

  if (editingName) {
    return (
      <form className="display-name-form" onSubmit={onSaveDisplayName} noValidate>
        <label className="auth-field">
          <span className="sr-only">{t.displayNameLabel}</span>
          <input
            ref={nameInputRef}
            name="displayName"
            maxLength={60}
            autoComplete="nickname"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "display-name-error" : "display-name-help"}
            value={nameDraft}
            onChange={(event) => { setNameDraft(event.target.value); if (nameError) setNameError(null); }}
          />
          <small id="display-name-help">{t.displayNameHelp}</small>
        </label>
        {nameError ? (
          <p className="auth-error" role="alert" tabIndex={-1} ref={nameErrorRef} id="display-name-error">{nameError}</p>
        ) : null}
        <div className="display-name-actions">
          <button className="button button-primary" type="submit" disabled={nameSaving}>
            {nameSaving ? t.loading : t.displayNameSave}
          </button>
          <button className="button detail-outline" type="button" onClick={cancelEditName} disabled={nameSaving}>
            {t.displayNameCancel}
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      {contributor.displayName ?? t.anonymous}
      {nameSaved ? <span className="display-name-saved" role="status"> {t.displayNameSaved}</span> : null}
      <button className="text-button display-name-edit" type="button" onClick={startEditName}>
        {t.displayNameEdit}
      </button>
    </>
  );
}
