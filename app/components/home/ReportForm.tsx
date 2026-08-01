"use client";

import { FormEvent, useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { useMessages } from "../LocaleProvider";

export type NearbyCandidate = { id: number; title: string; kind: string; distanceMeters: number; similarity: number; matchStrength: "high" | "medium" | "low" };

type PhotoItem = { id: number; mimeType: string; width: number; height: number; name: string };

/**
 * Report-flow state shared between the map (pick a position) and the
 * report form (manual coordinates, nearby-duplicate check, photo upload,
 * submit). The hook owns the flow's state; `notice` is page state (the
 * map section displays it), so the page injects its setter. The page
 * reads `coordinates`/`selectCoordinates` from the hook to drive the map.
 */
export function useReportFlow({ setNotice }: { setNotice: (notice: string) => void }) {
  const t = useMessages().home;
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [nearbyCandidates, setNearbyCandidates] = useState<NearbyCandidate[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState("");
  const nearbyRequest = useRef<AbortController | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => nearbyRequest.current?.abort(), []);

  async function selectCoordinates(latitude: number, longitude: number) {
    nearbyRequest.current?.abort();
    const controller = new AbortController();
    nearbyRequest.current = controller;
    setCoordinates({ latitude, longitude });
    setManualLatitude(latitude.toFixed(5));
    setManualLongitude(longitude.toFixed(5));
    setNotice(`${t.positionSelected}: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}.`);
    setNearbyCandidates([]);
    setNearbyError("");
    setNearbyLoading(true);
    try {
      const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), radius: "75" });
      const response = await fetch(`/api/cameras/nearby?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(t.nearbyCheckError);
      const data = await response.json() as { records?: NearbyCandidate[] };
      if (!controller.signal.aborted) setNearbyCandidates(Array.isArray(data.records) ? data.records : []);
    } catch (error) {
      if (!controller.signal.aborted) setNearbyError(error instanceof Error ? error.message : t.nearbyCheckError);
    } finally {
      if (!controller.signal.aborted) setNearbyLoading(false);
    }
  }
  async function selectManualCoordinates() {
    const latitudeInput = manualLatitude.trim().replace(",", ".");
    const longitudeInput = manualLongitude.trim().replace(",", ".");
    const latitude = Number(latitudeInput);
    const longitude = Number(longitudeInput);
    if (!latitudeInput || !longitudeInput || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setNotice(t.invalidCoordinates);
      return;
    }
    await selectCoordinates(latitude, longitude);
  }
  // Upload one photo to the private evidence store (POST /api/photos).
  // The server strips EXIF/GPS and enforces MIME, size and dimension limits;
  // the client-side checks below are convenience only, not a security gate.
  async function uploadPhoto(file: File) {
    if (photos.length >= 5) { setNotice(t.photoMaxReached); return; }
    setPhotoUploading(true);
    setNotice("");
    try {
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const data = await response.json() as { photo?: { id: number; mimeType: string; width: number; height: number }; error?: string };
      if (!response.ok) throw new Error(data.error || t.photoUploadError);
      if (!data.photo) throw new Error(t.photoUploadError);
      setPhotos((items) => [...items, { id: data.photo!.id, mimeType: data.photo!.mimeType, width: data.photo!.width, height: data.photo!.height, name: file.name }]);
      setNotice(t.photoAdded);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.photoUploadError);
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function onPhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    for (const file of files) {
      if (photos.length >= 5) { setNotice(t.photoMaxReached); break; }
      void uploadPhoto(file);
    }
  }

  function removePhoto(id: number) {
    setPhotos((items) => items.filter((photo) => photo.id !== id));
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!coordinates) { setNotice(t.choosePosition); return; }
    const manufacturer = String(form.get("manufacturer") || "").trim();
    const observedOn = String(form.get("observedOn") || "").trim();
    const payload = {
      title: String(form.get("title") || t.defaultReportTitle),
      kind: String(form.get("kind") || t.unknown),
      address: String(form.get("address") || ""),
      notes: String(form.get("notes") || ""),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      ...(manufacturer ? { manufacturer } : {}),
      ...(observedOn ? { observedOn } : {}),
      ...(photos.length > 0 ? { photoIds: photos.map((photo) => photo.id) } : {}),
    };
    try {
      const response = await fetch("/api/cameras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { possibleDuplicates?: NearbyCandidate[] };
      if (!response.ok) throw new Error(t.submitReportError);
      const duplicates = Array.isArray(data.possibleDuplicates) ? data.possibleDuplicates : [];
      event.currentTarget.reset(); setCoordinates(null); setManualLatitude(""); setManualLongitude(""); setPhotos([]);
      setNotice(duplicates.length > 0 ? `${t.reportSaved} ${t.reportSavedWithNearby}` : t.reportSaved);
    } catch { setNotice(t.moderationUnavailable); }
  }

  return { coordinates, setCoordinates, manualLatitude, setManualLatitude, manualLongitude, setManualLongitude, nearbyCandidates, nearbyLoading, nearbyError, selectCoordinates, selectManualCoordinates, photos, photoUploading, photoInputRef, onPhotoSelected, removePhoto, submitReport };
}

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
  const t = useMessages().home;
  return (    <section className="report-section" id="report"><div><p className="eyebrow"><span /> {t.contribute}</p><h2>{t.reportTitle}</h2><p>{t.reportIntro}</p><div className="report-rule"><b>{t.beforeSubmitting}</b><br />{t.beforeSubmittingBody}</div>{coordinates && <div className="coordinate-readout">{t.selectedPoint}<br /><b>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</b></div>}{nearbyLoading && <p className="nearby-check" role="status">{t.checkingNearby}</p>}{nearbyCandidates.length > 0 && <aside className="duplicate-alert" role="alert" aria-live="assertive"><b>{t.possibleDuplicate}</b><p>{t.duplicateBody}</p><ul>{nearbyCandidates.map((candidate) => <li key={candidate.id}><a href={`/records/${candidate.id}`}>{candidate.title}</a> · {candidate.kind} · {Math.round(candidate.distanceMeters)} {t.metresAway}{candidate.matchStrength === "high" && <span className="duplicate-strength"> · {t.matchVeryClose}</span>}{candidate.matchStrength === "medium" && <span className="duplicate-strength"> · {t.matchLikely}</span>}</li>)}</ul><p className="duplicate-guidance"><a className="text-button" href="#correction">{t.duplicateGuidance} <span aria-hidden="true">→</span></a></p></aside>}{nearbyError && <p className="nearby-check nearby-error" role="status">{t.nearbyUnavailable}</p>}</div><form className="report-form" onSubmit={submitReport}><fieldset className="coordinate-entry"><legend>{t.manualCoordinatesTitle}</legend><p id="manual-coordinates-help">{t.manualCoordinatesHelp}</p><div className="coordinate-fields"><label htmlFor="manual-latitude">{t.latitude}<input id="manual-latitude" type="text" inputMode="decimal" autoComplete="off" value={manualLatitude} onChange={(event) => setManualLatitude(event.target.value)} aria-describedby="manual-coordinates-help" placeholder="45.46420" /></label><label htmlFor="manual-longitude">{t.longitude}<input id="manual-longitude" type="text" inputMode="decimal" autoComplete="off" value={manualLongitude} onChange={(event) => setManualLongitude(event.target.value)} aria-describedby="manual-coordinates-help" placeholder="9.19000" /></label></div><button className="button coordinate-button" type="button" onClick={selectManualCoordinates}>{t.useCoordinates}</button></fieldset><label>{t.recordTitle}<input required name="title" maxLength={90} placeholder={t.recordTitlePlaceholder} /></label><label>{t.cameraType}<select required name="kind" defaultValue=""><option value="" disabled>{t.selectOne}</option><option>{t.fixedDome}</option><option>{t.bullet}</option><option>PTZ</option><option>{t.trafficReader}</option><option>{t.otherUnknown}</option></select></label><div className="report-metadata-fields"><label>{t.manufacturer}<input name="manufacturer" maxLength={80} placeholder={t.manufacturerPlaceholder} /></label><label>{t.observedOn}<input name="observedOn" type="date" /></label></div><label>{t.approximateAddress}<input name="address" maxLength={180} placeholder={t.addressPlaceholder} /></label><label>{t.whatObserved}<textarea name="notes" maxLength={1000} rows={3} placeholder={t.observedPlaceholder} /></label><fieldset className="photo-upload" aria-labelledby="photo-upload-title"><legend id="photo-upload-title">{t.photoUploadTitle}</legend><p className="search-count" id="photo-upload-help">{t.photoUploadHelp} {t.photoExifPrivacyNote} <a href="/privacy">{t.photoExifPrivacyLink}</a>.</p><div className="photo-upload-row"><label className="button button-quiet photo-choose" htmlFor="photo-input">{t.photoUploadLabel} <span aria-hidden="true">↗</span><input id="photo-input" ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onPhotoSelected} disabled={photoUploading} /></label>{photoUploading && <span className="loading-note" role="status">{t.photoUploading}</span>}{photos.length > 0 && <span className="search-count">{photos.length}/5</span>}</div>{photos.length > 0 && <ul className="photo-list" aria-label={t.photoUploadTitle}>{photos.map((photo) => <li key={photo.id}><span className="photo-file-name">{photo.name}</span><span className="search-count">{photo.width}×{photo.height} · {photo.mimeType}</span><button type="button" className="text-button" onClick={() => removePhoto(photo.id)}>{t.photoRemove} <span aria-hidden="true">→</span></button></li>)}</ul>}<p className="search-count" role="note">{t.photoRedactionReminder}</p>{photos.length > 0 && <label className="check-label check-redaction"><input type="checkbox" required aria-describedby="report-art13-note" /> <span>{t.photoRedactionConfirm}</span></label>}</fieldset><label className="check-label"><input type="checkbox" required aria-describedby="report-art13-note" /> <span>{t.reportConsent} <a href="/privacy">{t.privacyNotice}</a> · <a href="/termini">{t.termsOfUse}</a></span></label><p className="legal-microcopy" id="report-art13-note">{t.reportArt13} <a href="/privacy">{t.privacyNotice}</a>. {t.reportArt13Rights} <a href="mailto:privacy@opensurveillancedb">{t.privacyContact}</a>.</p><button className="button button-primary" type="submit">{t.sendModeration} <span aria-hidden="true">→</span></button></form></section>

  );
}
