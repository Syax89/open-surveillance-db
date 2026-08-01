"use client";

import { FormEvent, useState } from "react";
import { useMessages } from "../LocaleProvider";
import type { Camera } from "../../lib/records";

type Props = {
  /** Public records: the "related record" select is fed from these. */
  records: Camera[];
};

/**
 * Home correction section: private request to review / fix a record.
 * Owns its own notice and submit handler; the record list comes from the
 * page (the same set shown in the directory).
 */
export function CorrectionForm({ records }: Props) {
  const t = useMessages().home;
  const [correctionNotice, setCorrectionNotice] = useState("");

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { cameraId: String(form.get("cameraId") || ""), issueType: String(form.get("issueType") || ""), message: String(form.get("message") || ""), contact: String(form.get("contact") || "") };
    try {
      const response = await fetch("/api/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { referenceId?: number; error?: string };
      if (!response.ok) throw new Error(data.error || t.saveRequestError);
      event.currentTarget.reset();
      setCorrectionNotice(`${t.correctionSaved} #${data.referenceId}. ${t.correctionPrivate}`);
    } catch (error) { setCorrectionNotice(error instanceof Error ? error.message : t.correctionUnavailable); }
  }

  return (
    <section className="correction-section" id="correction" aria-labelledby="correction-title"><div><p className="eyebrow"><span /> {t.accountability}</p><h2 id="correction-title">{t.correctionTitle}</h2><p>{t.correctionIntro}</p><div className="report-rule"><b>{t.urgentConcern}</b><br />{t.urgentConcernBody}</div></div><form className="correction-form" onSubmit={submitCorrection}><label>{t.relatedRecord}<select name="cameraId" defaultValue=""><option value="">{t.noSpecificRecord}</option>{records.map((camera) => <option key={camera.id} value={camera.id}>{camera.id} — {camera.title}</option>)}</select></label><label>{t.needsReview}<select required name="issueType" defaultValue=""><option value="" disabled>{t.selectOne}</option><option value="inaccurate">{t.inaccurate}</option><option value="outdated">{t.outdated}</option><option value="privacy-safety">{t.privacySafety}</option><option value="duplicate">{t.duplicate}</option><option value="other">{t.other}</option></select></label><label>{t.briefDescription}<textarea required name="message" maxLength={1500} rows={4} placeholder={t.correctionPlaceholder} /></label><label>{t.contactEmail}<input type="email" name="contact" maxLength={180} placeholder={t.contactPlaceholder} /></label><label className="check-label"><input type="checkbox" required aria-describedby="correction-art13-note" /> <span>{t.correctionConsent} <a href="/privacy">{t.privacyNotice}</a> · <a href="/termini">{t.termsOfUse}</a></span></label><p className="legal-microcopy" id="correction-art13-note">{t.correctionArt13} <a href="/privacy">{t.privacyNotice}</a>. {t.correctionArt13Rights} <a href="mailto:privacy@opensurveillancedb">{t.privacyContact}</a>.</p><button className="button button-primary" type="submit">{t.sendPrivateRequest} <span aria-hidden="true">→</span></button>{correctionNotice && <p className="notice" role="status">{correctionNotice}</p>}</form></section>

  );
}
