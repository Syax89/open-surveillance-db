"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMessages } from "../components/LocaleProvider";

export type NearbyCandidate = { id: number; title: string; kind: string; distanceMeters: number; similarity: number; matchStrength: "high" | "medium" | "low" };

export type PhotoItem = { id: number; mimeType: string; width: number; height: number; name: string };

/**
 * Report-flow state shared between the map (pick a position) and the
 * report form (manual coordinates, nearby-duplicate check, photo upload,
 * submit). The hook owns the flow's state; `notice` is page state (the
 * map section displays it), so the page injects its setter. The page
 * reads `coordinates`/`selectCoordinates` from the hook to drive the map.
 *
 * Extracted from ReportForm.tsx in F1 (kanban t_03c0fa15, QA t_14b1949c):
 * the hook owns the ~130 lines of flow logic so the component file stays
 * under the ~150-line refactor target.
 */
export function useReportFlow({ setNotice }: { setNotice: (notice: string) => void }) {
  const t = useMessages().report;
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
      formElement.reset(); setCoordinates(null); setManualLatitude(""); setManualLongitude(""); setPhotos([]);
      setNotice(duplicates.length > 0 ? `${t.reportSaved} ${t.reportSavedWithNearby}` : t.reportSaved);
    } catch { setNotice(t.moderationUnavailable); }
  }

  return { coordinates, setCoordinates, manualLatitude, setManualLatitude, manualLongitude, setManualLongitude, nearbyCandidates, nearbyLoading, nearbyError, selectCoordinates, selectManualCoordinates, photos, photoUploading, photoInputRef, onPhotoSelected, removePhoto, submitReport };
}
