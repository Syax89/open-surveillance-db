"use client";

import type { FormEvent, ChangeEvent, RefObject } from "react";
import { useMessages } from "../../lib/use-messages";
import { useReportFlow, type NearbyCandidate, type PhotoItem } from "../../lib/useReportFlow";
import { KIND_OPTIONS, isDomeKind } from "../../lib/camera-kinds";
import { formatDirection } from "../../lib/compass";

// Re-exported so the home page and /segnala can import the hook and its
// types from the component module without a second import path.
export { useReportFlow, type NearbyCandidate, type PhotoItem };

type Props = {
  coordinates: { latitude: number; longitude: number } | null;
  address?: string;
  setAddress?: (value: string) => void;
  addressTouched?: React.MutableRefObject<boolean>;
  reverseGeocoding?: boolean;
  manualLatitude: string;
  setManualLatitude: (value: string) => void;
  manualLongitude: string;
  setManualLongitude: (value: string) => void;
  nearbyCandidates: NearbyCandidate[];
  nearbyLoading: boolean;
  nearbyError: string;
  duplicateConfirmationRequired: boolean;
  duplicateConfirmed: boolean;
  setDuplicateConfirmed: (value: boolean) => void;
  photos: PhotoItem[];
  photoUploading: boolean;
  photoInputRef: RefObject<HTMLInputElement | null>;
  onPhotoSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  removePhoto: (id: number) => void;
  selectManualCoordinates: () => void;
  submitReport: (event: FormEvent<HTMLFormElement>) => void;
  /**
   * Field-of-view direction (t_f8b775ec): the kind select is controlled so
   * the direction fieldset appears only for directional kinds (hidden for
   * domes, whose 360° vision needs no bearing); direction is the bearing
   * 0-359 or null ("non so"); directionKnown flips when the contributor
   * specifies one. All state lives in useReportFlow, like the rest of the
   * form, so it resets with the form on success. Optional with safe
   * defaults: a host that does not wire the direction state (direct
   * embedding, tests) renders the plain form without the fieldset.
   */
  kind?: string;
  setKind?: (value: string) => void;
  direction?: number | null;
  setDirection?: (value: number | null) => void;
  directionKnown?: boolean;
  setDirectionKnown?: (value: boolean) => void;
  /**
   * P1-5 (F5): /segnala owns the page header via .tool-heading (h1). When
   * embedded in the tool page the form must not repeat eyebrow + h2 +
   * intro (FRONTEND_DESIGN §2.2 — one page header per tool page). The
   * report-rule ("Before submitting") and the coordinate readouts stay:
   * they are guidance, not a heading.
   */
  showHeading?: boolean;
};

/**
 * Home report section: choose/enter a position, fill the report, attach
 * photos (uploaded to the private evidence store) and submit for
 * moderation. State and handlers come from `useReportFlow` via props.
 */
export function ReportForm({ coordinates, manualLatitude, setManualLatitude, manualLongitude, setManualLongitude, nearbyCandidates, nearbyLoading, nearbyError, duplicateConfirmationRequired, duplicateConfirmed, setDuplicateConfirmed, photos, photoUploading, photoInputRef, onPhotoSelected, removePhoto, selectManualCoordinates, submitReport, kind = "", setKind = () => {}, direction = null, setDirection = () => {}, directionKnown = false, setDirectionKnown = () => {}, address = "", setAddress = () => {}, addressTouched, reverseGeocoding = false, showHeading = true }: Props) {
  const t = useMessages().report;
  // Dome selection hides the direction field entirely (a dome's 360° vision
  // has no bearing — the backend stores NULL for domes as an invariant).
  // Switching TO a dome clears any bearing the contributor may have picked.
  // A blank/unwired kind never shows the field (safe default for direct
  // embeddings that do not pass the direction state).
  const showDirectionField = kind !== "" && !isDomeKind(kind);
  const handleKindChange = (value: string) => {
    setKind(value);
    if (isDomeKind(value)) { setDirection(null); setDirectionKnown(false); }
  };
  const kindLabel = (labelKey: string): string => t[labelKey as keyof typeof t] ?? labelKey;
  return (    <section className="report-section" id="report"><div>{showHeading && <><p className="eyebrow"><span /> {t.contribute}</p><h2>{t.reportTitle}</h2><p>{t.reportIntro}</p></>}<div className="report-rule"><b>{t.beforeSubmitting}</b><br />{t.beforeSubmittingBody}</div>{coordinates && <div className="coordinate-readout">{t.selectedPoint}<br /><b>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</b></div>}{nearbyLoading && <p className="nearby-check" role="status">{t.checkingNearby}</p>}{nearbyCandidates.length > 0 && <aside className="duplicate-alert" role="alert" aria-live="assertive"><b>{duplicateConfirmationRequired ? t.duplicateConfirmTitle : t.possibleDuplicate}</b><p>{duplicateConfirmationRequired ? t.duplicateConfirmBody : t.duplicateBody}</p><ul>{nearbyCandidates.map((candidate) => <li key={candidate.id}><a href={`/records/${candidate.id}`}>{candidate.title}</a> · {candidate.kind} · {Math.round(candidate.distanceMeters)} {t.metresAway}{candidate.matchStrength === "high" && <span className="duplicate-strength"> · {t.matchVeryClose}</span>}{candidate.matchStrength === "medium" && <span className="duplicate-strength"> · {t.matchLikely}</span>}</li>)}</ul>{duplicateConfirmationRequired && <label className="check-label check-duplicate"><input type="checkbox" checked={duplicateConfirmed} onChange={(event) => setDuplicateConfirmed(event.target.checked)} aria-required="true" /> <span>{t.duplicateConfirmLabel}</span></label>}<p className="duplicate-guidance"><a className="text-button" href="#correction">{t.duplicateGuidance} <span aria-hidden="true">→</span></a></p></aside>}{nearbyError && <p className="nearby-check nearby-error" role="status">{t.nearbyUnavailable}</p>}</div><form className="report-form" onSubmit={submitReport}><fieldset className="contribution-step"><legend>{t.stepLocation}</legend><fieldset className="coordinate-entry"><legend>{t.manualCoordinatesTitle}</legend><p id="manual-coordinates-help">{t.manualCoordinatesHelp}</p><div className="coordinate-fields"><label htmlFor="manual-latitude">{t.latitude}<input id="manual-latitude" type="text" inputMode="decimal" autoComplete="off" value={manualLatitude} onChange={(event) => setManualLatitude(event.target.value)} aria-describedby="manual-coordinates-help" placeholder="45.46420" /></label><label htmlFor="manual-longitude">{t.longitude}<input id="manual-longitude" type="text" inputMode="decimal" autoComplete="off" value={manualLongitude} onChange={(event) => setManualLongitude(event.target.value)} aria-describedby="manual-coordinates-help" placeholder="9.19000" /></label></div><button className="button coordinate-button" type="button" onClick={selectManualCoordinates}>{t.useCoordinates}</button></fieldset></fieldset><fieldset className="contribution-step"><legend>{t.stepObservation}</legend><label>{t.recordTitle}<input required name="title" maxLength={90} placeholder={t.recordTitlePlaceholder} /></label><label>{t.cameraType}<select required name="kind" value={kind} onChange={(event) => handleKindChange(event.target.value)}><option value="" disabled>{t.selectOne}</option>{KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{kindLabel(option.labelKey)}</option>)}</select></label>{showDirectionField && <fieldset className="direction-entry" aria-labelledby="direction-title"><legend id="direction-title">{t.directionTitle}</legend><p className="search-count" id="direction-help">{t.directionHelp}</p><label className="check-label check-direction-unknown"><input type="checkbox" checked={!directionKnown} onChange={(event) => { setDirectionKnown(!event.target.checked); if (!event.target.checked) setDirection(null); }} /> <span>{t.directionUnknown}</span></label>{directionKnown && <div className="direction-controls"><span className="direction-arrow" aria-hidden="true" style={{ transform: `rotate(${direction ?? 0}deg)` }}>→</span><div className="direction-slider-row"><label htmlFor="direction-slider">{t.directionDegrees}</label><input id="direction-slider" type="range" min={0} max={359} step={1} value={direction ?? 0} onChange={(event) => setDirection(Number(event.target.value))} aria-describedby="direction-help" /><output htmlFor="direction-slider" className="direction-output">{formatDirection(direction ?? 0)}</output></div></div>}<input type="hidden" name="direction" value={directionKnown ? String(direction ?? 0) : ""} /></fieldset>}<div className="report-metadata-fields"><label>{t.manufacturer}<input name="manufacturer" maxLength={80} placeholder={t.manufacturerPlaceholder} /></label><label>{t.observedOn}<input name="observedOn" type="date" /></label></div><label>{t.approximateAddress}<input name="address" maxLength={180} value={address} onChange={(event) => { if (addressTouched) addressTouched.current = true; setAddress(event.target.value); }} placeholder={reverseGeocoding ? t.resolvingAddress : t.addressPlaceholder} aria-busy={reverseGeocoding || undefined} /></label><label>{t.whatObserved}<textarea name="notes" maxLength={1000} rows={3} placeholder={t.observedPlaceholder} /></label></fieldset><fieldset className="contribution-step contribution-step-send"><legend>{t.stepEvidence}</legend><fieldset className="photo-upload" aria-labelledby="photo-upload-title"><legend id="photo-upload-title">{t.photoUploadTitle}</legend><p className="search-count" id="photo-upload-help">{t.photoUploadHelp} {t.photoExifPrivacyNote} <a href="/privacy">{t.photoExifPrivacyLink}</a>.</p><div className="photo-upload-row"><label className="button button-quiet photo-choose" htmlFor="photo-input">{t.photoUploadLabel} <span aria-hidden="true">↗</span><input id="photo-input" ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onPhotoSelected} disabled={photoUploading} /></label>{photoUploading && <span className="loading-note" role="status">{t.photoUploading}</span>}{photos.length > 0 && <span className="search-count">{photos.length}/5</span>}</div>{photos.length > 0 && <ul className="photo-list" aria-label={t.photoUploadTitle}>{photos.map((photo) => <li key={photo.id}><span className="photo-file-name">{photo.name}</span><span className="search-count">{photo.width}×{photo.height} · {photo.mimeType}</span><button type="button" className="text-button" onClick={() => removePhoto(photo.id)}>{t.photoRemove} <span aria-hidden="true">→</span></button></li>)}</ul>}<p className="search-count" role="note">{t.photoRedactionReminder}</p>{photos.length > 0 && <label className="check-label check-redaction"><input type="checkbox" required aria-describedby="report-art13-note" /> <span>{t.photoRedactionConfirm}</span></label>}</fieldset><label className="check-label"><input type="checkbox" required aria-describedby="report-art13-note" /> <span>{t.reportConsent} <a href="/privacy">{t.privacyNotice}</a> · <a href="/termini">{t.termsOfUse}</a></span></label><p className="legal-microcopy" id="report-art13-note">{t.reportArt13} <a href="/privacy">{t.privacyNotice}</a>. {t.reportArt13Rights} <a href="mailto:privacy@opensurveillancedb.org">{t.privacyContact}</a>.</p><button className="button button-primary" type="submit" disabled={duplicateConfirmationRequired && !duplicateConfirmed}>{t.sendModeration} <span aria-hidden="true">→</span></button></fieldset></form></section>);
}
