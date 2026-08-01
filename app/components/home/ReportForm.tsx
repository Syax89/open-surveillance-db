"use client";

import type { FormEvent, ChangeEvent, RefObject } from "react";
import { useMessages } from "../LocaleProvider";
import { useReportFlow, type NearbyCandidate, type PhotoItem } from "../../lib/useReportFlow";

// Re-exported so the home page and /segnala can import the hook and its
// types from the component module without a second import path.
export { useReportFlow, type NearbyCandidate, type PhotoItem };

type Props = {
  coordinates: { latitude: number; longitude: number } | null;
  manualLatitude: string;
  setManualLatitude: (value: string) => void;
  manualLongitude: string;
  setManualLongitude: (value: string) => void;
  nearbyCandidates: NearbyCandidate[];
  nearbyLoading: boolean;
  nearbyError: string;
  photos: PhotoItem[];
  photoUploading: boolean;
  photoInputRef: RefObject<HTMLInputElement | null>;
  onPhotoSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  removePhoto: (id: number) => void;
  selectManualCoordinates: () => void;
  submitReport: (event: FormEvent<HTMLFormElement>) => void;
};

/**
 * Home report section: choose/enter a position, fill the report, attach
 * photos (uploaded to the private evidence store) and submit for
 * moderation. State and handlers come from `useReportFlow` via props.
 */
export function ReportForm({ coordinates, manualLatitude, setManualLatitude, manualLongitude, setManualLongitude, nearbyCandidates, nearbyLoading, nearbyError, photos, photoUploading, photoInputRef, onPhotoSelected, removePhoto, selectManualCoordinates, submitReport }: Props) {
  const t = useMessages().report;
  return (    <section className="report-section" id="report"><div><p className="eyebrow"><span /> {t.contribute}</p><h2>{t.reportTitle}</h2><p>{t.reportIntro}</p><div className="report-rule"><b>{t.beforeSubmitting}</b><br />{t.beforeSubmittingBody}</div>{coordinates && <div className="coordinate-readout">{t.selectedPoint}<br /><b>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</b></div>}{nearbyLoading && <p className="nearby-check" role="status">{t.checkingNearby}</p>}{nearbyCandidates.length > 0 && <aside className="duplicate-alert" role="alert" aria-live="assertive"><b>{t.possibleDuplicate}</b><p>{t.duplicateBody}</p><ul>{nearbyCandidates.map((candidate) => <li key={candidate.id}><a href={`/records/${candidate.id}`}>{candidate.title}</a> · {candidate.kind} · {Math.round(candidate.distanceMeters)} {t.metresAway}{candidate.matchStrength === "high" && <span className="duplicate-strength"> · {t.matchVeryClose}</span>}{candidate.matchStrength === "medium" && <span className="duplicate-strength"> · {t.matchLikely}</span>}</li>)}</ul><p className="duplicate-guidance"><a className="text-button" href="#correction">{t.duplicateGuidance} <span aria-hidden="true">→</span></a></p></aside>}{nearbyError && <p className="nearby-check nearby-error" role="status">{t.nearbyUnavailable}</p>}</div><form className="report-form" onSubmit={submitReport}><fieldset className="coordinate-entry"><legend>{t.manualCoordinatesTitle}</legend><p id="manual-coordinates-help">{t.manualCoordinatesHelp}</p><div className="coordinate-fields"><label htmlFor="manual-latitude">{t.latitude}<input id="manual-latitude" type="text" inputMode="decimal" autoComplete="off" value={manualLatitude} onChange={(event) => setManualLatitude(event.target.value)} aria-describedby="manual-coordinates-help" placeholder="45.46420" /></label><label htmlFor="manual-longitude">{t.longitude}<input id="manual-longitude" type="text" inputMode="decimal" autoComplete="off" value={manualLongitude} onChange={(event) => setManualLongitude(event.target.value)} aria-describedby="manual-coordinates-help" placeholder="9.19000" /></label></div><button className="button coordinate-button" type="button" onClick={selectManualCoordinates}>{t.useCoordinates}</button></fieldset><label>{t.recordTitle}<input required name="title" maxLength={90} placeholder={t.recordTitlePlaceholder} /></label><label>{t.cameraType}<select required name="kind" defaultValue=""><option value="" disabled>{t.selectOne}</option><option>{t.fixedDome}</option><option>{t.bullet}</option><option>PTZ</option><option>{t.trafficReader}</option><option>{t.otherUnknown}</option></select></label><div className="report-metadata-fields"><label>{t.manufacturer}<input name="manufacturer" maxLength={80} placeholder={t.manufacturerPlaceholder} /></label><label>{t.observedOn}<input name="observedOn" type="date" /></label></div><label>{t.approximateAddress}<input name="address" maxLength={180} placeholder={t.addressPlaceholder} /></label><label>{t.whatObserved}<textarea name="notes" maxLength={1000} rows={3} placeholder={t.observedPlaceholder} /></label><fieldset className="photo-upload" aria-labelledby="photo-upload-title"><legend id="photo-upload-title">{t.photoUploadTitle}</legend><p className="search-count" id="photo-upload-help">{t.photoUploadHelp} {t.photoExifPrivacyNote} <a href="/privacy">{t.photoExifPrivacyLink}</a>.</p><div className="photo-upload-row"><label className="button button-quiet photo-choose" htmlFor="photo-input">{t.photoUploadLabel} <span aria-hidden="true">↗</span><input id="photo-input" ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onPhotoSelected} disabled={photoUploading} /></label>{photoUploading && <span className="loading-note" role="status">{t.photoUploading}</span>}{photos.length > 0 && <span className="search-count">{photos.length}/5</span>}</div>{photos.length > 0 && <ul className="photo-list" aria-label={t.photoUploadTitle}>{photos.map((photo) => <li key={photo.id}><span className="photo-file-name">{photo.name}</span><span className="search-count">{photo.width}×{photo.height} · {photo.mimeType}</span><button type="button" className="text-button" onClick={() => removePhoto(photo.id)}>{t.photoRemove} <span aria-hidden="true">→</span></button></li>)}</ul>}<p className="search-count" role="note">{t.photoRedactionReminder}</p>{photos.length > 0 && <label className="check-label check-redaction"><input type="checkbox" required aria-describedby="report-art13-note" /> <span>{t.photoRedactionConfirm}</span></label>}</fieldset><label className="check-label"><input type="checkbox" required aria-describedby="report-art13-note" /> <span>{t.reportConsent} <a href="/privacy">{t.privacyNotice}</a> · <a href="/termini">{t.termsOfUse}</a></span></label><p className="legal-microcopy" id="report-art13-note">{t.reportArt13} <a href="/privacy">{t.privacyNotice}</a>. {t.reportArt13Rights} <a href="mailto:privacy@opensurveillancedb">{t.privacyContact}</a>.</p><button className="button button-primary" type="submit">{t.sendModeration} <span aria-hidden="true">→</span></button></form></section>);
}
