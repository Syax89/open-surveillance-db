"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMessages } from "./use-messages";
import type { ReportCoordinates } from "./report-coordinates";

export type NearbyCandidate = { id: number; title: string; kind: string; distanceMeters: number; similarity: number; matchStrength: "high" | "medium" | "low" };

export type PhotoItem = { id: number; mimeType: string; width: number; height: number; name: string };

/**
 * Report-flow state shared between the map (pick a position) and the
 * report form (manual coordinates, nearby-duplicate check, photo upload,
 * submit). The hook owns the flow's state; `notice` is page state (the
 * map section displays it), so the page injects its setter. The page
 * reads `coordinates`/`selectCoordinates` from the hook to drive the map.
 *
 * `initialCoordinates` (t_6abb96ac) pre-fills the form from the /segnala
 * URL shell (?lat=&lng= — the deep link the /mappa pick popup builds):
 * the coordinate state, the manual fields and the nearby check all start
 * from the URL position instead of an empty form.
 *
 * Extracted from ReportForm.tsx in F1 (kanban t_03c0fa15, QA t_14b1949c):
 * the hook owns the ~130 lines of flow logic so the component file stays
 * under the ~150-line refactor target.
 */
export function useReportFlow({ setNotice, initialCoordinates = null }: { setNotice: (notice: string) => void; initialCoordinates?: ReportCoordinates | null }) {
  const t = useMessages().report;
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(initialCoordinates);
  const [manualLatitude, setManualLatitude] = useState(initialCoordinates ? initialCoordinates.latitude.toFixed(5) : "");
  const [manualLongitude, setManualLongitude] = useState(initialCoordinates ? initialCoordinates.longitude.toFixed(5) : "");
  const [nearbyCandidates, setNearbyCandidates] = useState<NearbyCandidate[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState("");
  // Horizon 1 duplicate gate (ADR 0019): when the server answers 409 with a
  // high-strength candidate, the contributor must explicitly confirm this is
  // a distinct camera before the report is stored. The checkbox state lives
  // here (not in the form DOM) so the submit payload and the disabled button
  // share one source of truth.
  const [duplicateConfirmationRequired, setDuplicateConfirmationRequired] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  // Field-of-view direction (t_f8b775ec): kind is controlled so the form
  // can hide the direction field for domes; direction is the bearing 0-359
  // or null (NULL = unknown/"non so", the default); directionKnown flips
  // when the contributor actually specifies a bearing. All three reset with
  // the form on success.
  const [kind, setKind] = useState("");
  const [direction, setDirection] = useState<number | null>(null);
  const [directionKnown, setDirectionKnown] = useState(false);
  // Reverse geocoding prefill (CEO 2026-08-07): when the contributor picks
  // a position, /api/geocode/reverse returns the nearest address (cache
  // hit = free) and the form pre-fills it. The user's own typing ALWAYS
  // wins: addressTouched flips on first keystroke and the lookup never
  // overwrites afterwards.
  const [address, setAddress] = useState("");
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const addressTouched = useRef(false);
  const reverseRequest = useRef<AbortController | null>(null);
  const nearbyRequest = useRef<AbortController | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => nearbyRequest.current?.abort(), []);

  // Deep link (?lat=&lng=, t_6abb96ac): when the form opens with a URL
  // position, run the same nearby check a map click would, once, so the
  // duplicate gate is already populated. Guarded by a ref: the URL is
  // external state (deep link), not a value the user edits in the form.
  const initialRunRef = useRef(false);
  useEffect(() => {
    if (!initialCoordinates || initialRunRef.current) return;
    initialRunRef.current = true;
    void selectCoordinates(initialCoordinates.latitude, initialCoordinates.longitude);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL deep link (FRONTEND_DESIGN §6.2): one-shot on mount with the URL position; selectCoordinates is the flow's own stable handler.
  }, [initialCoordinates]);

  async function selectCoordinates(latitude: number, longitude: number) {
    nearbyRequest.current?.abort();
    reverseRequest.current?.abort();
    const controller = new AbortController();
    nearbyRequest.current = controller;
    setCoordinates({ latitude, longitude });
    setManualLatitude(latitude.toFixed(5));
    setManualLongitude(longitude.toFixed(5));
    setNotice(`${t.positionSelected}: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}.`);
    setNearbyCandidates([]);
    setNearbyError("");
    setDuplicateConfirmationRequired(false);
    setDuplicateConfirmed(false);
    setNearbyLoading(true);
    // Reverse geocode prefill (CEO 2026-08-07): ask the nearest address
    // in parallel with the nearby check — the D1 cache makes repeat
    // positions free, a miss costs one Nominatim call. Only pre-fills
    // when the contributor has not typed their own address.
    if (!addressTouched.current) {
      setReverseGeocoding(true);
      const reverse = new AbortController();
      reverseRequest.current = reverse;
      void (async () => {
        try {
          const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
          const response = await fetch(`/api/geocode/reverse?${params}`, { signal: reverse.signal });
          if (!response.ok) return;
          const data = await response.json() as { address?: string | null };
          if (!reverse.signal.aborted && typeof data.address === "string" && data.address && !addressTouched.current) {
            setAddress(data.address);
          }
        } catch {
          // Lookup unavailable: the field stays empty, the contributor
          // can type it — never block the flow on a geocoder failure.
        } finally {
          if (!reverse.signal.aborted) setReverseGeocoding(false);
        }
      })();
    }
    try {
      const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), radius: "75", limit: "8" });
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
    // Capture the element synchronously: React nulls event.currentTarget
    // once the synchronous dispatch finishes, so reading it again after the
    // awaits below (e.g. formElement.reset()) would throw a TypeError.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!coordinates) { setNotice(t.choosePosition); return; }
    // Belt-and-braces client guard: Enter in a text field submits the form
    // even when the submit button is disabled, so the hook refuses to fire
    // the POST until the duplicate confirmation is checked. The server gate
    // (409) remains the real enforcement.
    if (duplicateConfirmationRequired && !duplicateConfirmed) { setNotice(t.duplicateConfirmNotice); return; }
    const manufacturer = String(form.get("manufacturer") || "").trim();
    const observedOn = String(form.get("observedOn") || "").trim();
    // Direction payload (t_f8b775ec): the hidden input carries the bearing
    // when the contributor specified one (directionKnown), empty otherwise —
    // empty maps to NULL ("non so"), which the API stores as no direction.
    const directionRaw = String(form.get("direction") || "").trim();
    const directionValue =
      directionKnown && directionRaw !== "" && Number.isFinite(Number(directionRaw))
        ? Math.min(359, Math.max(0, Math.round(Number(directionRaw))))
        : null;
    const payload = {
      title: String(form.get("title") || t.defaultReportTitle),
      kind: String(form.get("kind") || t.unknown),
      address: String(form.get("address") || ""),
      notes: String(form.get("notes") || ""),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      // Always sent: null is explicit ("no direction") and the server's
      // dome rule normalises it for domes anyway.
      direction: directionValue,
      ...(manufacturer ? { manufacturer } : {}),
      ...(observedOn ? { observedOn } : {}),
      ...(photos.length > 0 ? { photoIds: photos.map((photo) => photo.id) } : {}),
      ...(duplicateConfirmed ? { duplicateConfirmed: true } : {}),
    };
    try {
      const response = await fetch("/api/cameras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { possibleDuplicates?: NearbyCandidate[]; error?: string };
      // Horizon 1 gate: a 409 with candidates means the server refused to
      // store the report until the contributor confirms it is a distinct
      // camera. Surface the authoritative (text-aware) candidate list in the
      // duplicate alert and require the confirmation checkbox before the
      // next submit. The form is NOT reset — the contributor keeps their
      // input and only adds the acknowledgement.
      if (response.status === 409 && Array.isArray(data.possibleDuplicates) && data.possibleDuplicates.length > 0) {
        setNearbyCandidates(data.possibleDuplicates);
        setDuplicateConfirmationRequired(true);
        setDuplicateConfirmed(false);
        setNotice(t.duplicateConfirmNotice);
        return;
      }
      // P1-2 (Vera design): the write gate answers 401 (no session) and 403
      // (session, unverified email) with a single canonical body. The login
      // wall covers the common case; these map the mid-form session death to
      // localized guidance instead of the raw server string or the dev text.
      if (response.status === 401) {
        setNotice(t.loginRequired);
        return;
      }
      if (response.status === 403) {
        setNotice(t.verifyRequired);
        return;
      }
      if (!response.ok) throw new Error(t.submitReportError);
      const duplicates = Array.isArray(data.possibleDuplicates) ? data.possibleDuplicates : [];
      formElement.reset(); setCoordinates(null); setManualLatitude(""); setManualLongitude(""); setPhotos([]);
      setDuplicateConfirmationRequired(false); setDuplicateConfirmed(false);
      setKind(""); setDirection(null); setDirectionKnown(false);
      setAddress(""); addressTouched.current = false; setReverseGeocoding(false);
      setNotice(duplicates.length > 0 ? `${t.reportSaved} ${t.reportSavedWithNearby}` : t.reportSaved);
    } catch { setNotice(t.moderationUnavailable); }
  }

  return { coordinates, setCoordinates, manualLatitude, setManualLatitude, manualLongitude, setManualLongitude, nearbyCandidates, nearbyLoading, nearbyError, selectCoordinates, selectManualCoordinates, photos, photoUploading, photoInputRef, onPhotoSelected, removePhoto, submitReport, duplicateConfirmationRequired, duplicateConfirmed, setDuplicateConfirmed, kind, setKind, direction, setDirection, directionKnown, setDirectionKnown, address, setAddress, addressTouched, reverseGeocoding };
}
