"use client";

import { FormEvent, useState } from "react";
import { useMessages } from "../../lib/use-messages";
import type { Camera } from "../../lib/records";

type Props = {
  /** Public records: the "related record" select is fed from these. */
  records: Camera[];
  /** ?record=ID prefill: the related record is preselected and announced. */
  defaultRecordId?: number | null;
  /**
   * P1-5 (F5): /correggi owns the page header via .tool-heading (h1). When
   * embedded in the tool page the form must not repeat eyebrow + h2 +
   * intro (FRONTEND_DESIGN §2.2 — one page header per tool page). The
   * report-rule ("Urgent concern") stays: it is guidance, not a heading.
   */
  showHeading?: boolean;
};

/**
 * Correction tool form (F1 route group (tools)): private request to review /
 * fix a record. Owns its own notice and submit handler; the record list
 * comes from the page (the same set shown in the directory). Reads the
 * `correction` i18n bundle. `?record=ID` (from the record detail page)
 * pre-selects the related record and announces it via an aria-live region.
 */
export function CorrectionForm({ records, defaultRecordId = null, showHeading = true }: Props) {
  const t = useMessages().correction;
  const [correctionNotice, setCorrectionNotice] = useState("");
  const preselected = defaultRecordId ? records.find((camera) => camera.id === defaultRecordId) : undefined;

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Capture the element synchronously: React nulls event.currentTarget
    // once the synchronous dispatch finishes, so reading it again after the
    // awaits below (formElement.reset()) would throw a TypeError.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = { cameraId: String(form.get("cameraId") || ""), issueType: String(form.get("issueType") || ""), message: String(form.get("message") || ""), contact: String(form.get("contact") || "") };
    try {
      const response = await fetch("/api/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      // P1-2 (design review): the write gate answers 401 (no session) and 403
      // (unverified email) with a single canonical EN body; surface the
      // localized guidance instead of the raw server string ("Authentication
      // required."). The login wall covers the common case; this maps the
      // mid-form session death.
      if (response.status === 401) { setCorrectionNotice(t.loginRequired); return; }
      if (response.status === 403) { setCorrectionNotice(t.verifyRequired); return; }
      const data = await response.json() as { referenceId?: number; error?: string };
      if (!response.ok) throw new Error(data.error || t.saveRequestError);
      formElement.reset();
      setCorrectionNotice(`${t.correctionSaved} #${data.referenceId}. ${t.correctionPrivate}`);
    } catch (error) { setCorrectionNotice(error instanceof Error ? error.message : t.correctionUnavailable); }
  }

  return (
    <section className="correction-section" id="correction" aria-labelledby={showHeading ? "correction-title" : undefined} aria-label={showHeading ? undefined : t.accountability}>
      <div>
        {showHeading && <><p className="eyebrow"><span /> {t.accountability}</p><h2 id="correction-title">{t.correctionTitle}</h2><p>{t.correctionIntro}</p></>}
        <div className="report-rule"><b>{t.urgentConcern}</b><br />{t.urgentConcernBody}</div>
      </div>
      <form className="correction-form" onSubmit={submitCorrection}>
        {preselected && <p className="notice" role="status">{t.recordPreselected(preselected.id, preselected.title)}</p>}
        <fieldset className="contribution-step">
          <legend>{t.stepRecord}</legend>
          <label>{t.relatedRecord}<select name="cameraId" defaultValue={preselected ? String(preselected.id) : ""}><option value="">{t.noSpecificRecord}</option>{records.map((camera) => <option key={camera.id} value={camera.id}>{camera.id} — {camera.title}</option>)}</select></label>
        </fieldset>
        <fieldset className="contribution-step">
          <legend>{t.stepIssue}</legend>
          <label>{t.needsReview}<select required name="issueType" defaultValue=""><option value="" disabled>{t.selectOne}</option><option value="inaccurate">{t.inaccurate}</option><option value="missing">{t.missing}</option><option value="removal">{t.removal}</option><option value="abuse">{t.abuse}</option><option value="other">{t.other}</option></select></label>
          <label>{t.briefDescription}<textarea required name="message" maxLength={1500} rows={4} placeholder={t.correctionPlaceholder} /></label>
        </fieldset>
        <fieldset className="contribution-step contribution-step-send">
          <legend>{t.stepContact}</legend>
          <label>{t.contactEmail}<input type="email" name="contact" maxLength={180} placeholder={t.contactPlaceholder} /></label>
          <label className="check-label"><input type="checkbox" required aria-describedby="correction-art13-note" /> <span>{t.correctionConsent} <a href="/privacy">{t.privacyNotice}</a> · <a href="/termini">{t.termsOfUse}</a></span></label>
          <p className="legal-microcopy" id="correction-art13-note">{t.correctionArt13} <a href="/privacy">{t.privacyNotice}</a>. {t.correctionArt13Rights} <a href="mailto:privacy@opensurveillancedb.org">{t.privacyContact}</a>.</p>
          <button className="button button-primary" type="submit">{t.sendPrivateRequest} <span aria-hidden="true">→</span></button>
        </fieldset>
        {correctionNotice && <p className="notice" role="status">{correctionNotice}</p>}
      </form>
    </section>

  );
}
