"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMessages } from "./use-messages";
import type { ReportCoordinates } from "./report-coordinates";

export type NearbyCandidate = { id: number; title: string; kind: string; distanceMeters: number; similarity: number; matchStrength: "high" | "medium" | "low" };

/**
 * Report-flow state shared between the map (pick a position) and the
 * report form (manual coordinates, nearby-duplicate check, submit).
 * The hook owns the flow's state; `notice` is page state (the
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
  // One-tap geolocation (CEO 2026-08-09): the contributor is standing in
  // front of the camera on a phone — the fastest correct position is the
  // device's own. `geolocationAvailable` starts FALSE on purpose so the SSR
  // markup never contains the button (navigator does not exist on the
  // server): a deterministic initial state plus a post-hydration effect is
  // the same fail-closed pattern the OIDC panel uses, and it keeps SSR and
  // the first client render byte-identical.
  const [geolocationAvailable, setGeolocationAvailable] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  // Unlike generic form notices (rendered after the entire form), a declined
  // browser permission must remain adjacent to the button that caused it.
  const [geolocationNotice, setGeolocationNotice] = useState("");
  // getCurrentPosition has no AbortSignal. Incrementing this token on an
  // unmount or a future request makes late callbacks harmless instead of
  // updating state after the form has gone away.
  const geolocationRequest = useRef(0);

  useEffect(() => () => {
    nearbyRequest.current?.abort();
    geolocationRequest.current += 1;
  }, []);
  useEffect(() => {
    let cancelled = false;
    // Deliberately defer the state write: react-compiler forbids synchronous
    // setState in an effect, and this retains the deterministic false → true
    // post-hydration transition.
    void Promise.resolve().then(() => {
      if (!cancelled) setGeolocationAvailable(typeof navigator !== "undefined" && typeof navigator.geolocation?.getCurrentPosition === "function");
    });
    return () => { cancelled = true; };
  }, []);

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
  /**
   * One-tap geolocation: resolve the device position and feed it through the
   * SAME `selectCoordinates` path a map click uses, so the coordinate
   * readout, the manual fields, the reverse-geocode prefill and the
   * duplicate check all behave identically. A failure never blocks the
   * flow — it explains itself in the notice and leaves the map and the
   * manual fields as the alternatives.
   */
  function requestMyPosition() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeolocationNotice(t.geolocationUnavailable);
      return;
    }
    const request = geolocationRequest.current + 1;
    geolocationRequest.current = request;
    setGeolocationNotice("");
    setGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== geolocationRequest.current) return;
        setGeolocating(false);
        // A browser fixes a person's device much more precisely than this
        // public-infrastructure report needs. Round before *any* follow-up
        // call, so reverse geocoding/duplicate lookup receive the same
        // ~11m precision documented for the report flow.
        const latitude = Math.round(position.coords.latitude * 10_000) / 10_000;
        const longitude = Math.round(position.coords.longitude * 10_000) / 10_000;
        void selectCoordinates(latitude, longitude);
      },
      (error) => {
        if (request !== geolocationRequest.current) return;
        setGeolocating(false);
        // 1 PERMISSION_DENIED, 3 TIMEOUT, everything else = unavailable.
        if (error.code === 1) setGeolocationNotice(t.geolocationDenied);
        else if (error.code === 3) setGeolocationNotice(t.geolocationTimeout);
        else setGeolocationNotice(t.geolocationUnavailable);
      },
      // High accuracy matters here (a camera is a street-level object); a
      // 60s cached fix is fine and saves battery on repeat taps.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  // Reverse-geocode prefill guard (CEO 2026-08-07): once the contributor
  // types, the address is theirs — later lookups must never overwrite it.
  // Defined here (not inline in the JSX) so the react-compiler eslint rule
  // sees the ref write inside a handler, not during render.
  function handleAddressChange(value: string) {
    addressTouched.current = true;
    setAddress(value);
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
      // P1-2 (design review): the write gate answers 401 (no session) and 403
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
      formElement.reset(); setCoordinates(null); setManualLatitude(""); setManualLongitude("");
      setDuplicateConfirmationRequired(false); setDuplicateConfirmed(false);
      setKind(""); setDirection(null); setDirectionKnown(false);
      setAddress(""); addressTouched.current = false; setReverseGeocoding(false);
      setNotice(duplicates.length > 0 ? `${t.reportSaved} ${t.reportSavedWithNearby}` : t.reportSaved);
    } catch { setNotice(t.moderationUnavailable); }
  }

  return { coordinates, setCoordinates, manualLatitude, setManualLatitude, manualLongitude, setManualLongitude, nearbyCandidates, nearbyLoading, nearbyError, selectCoordinates, selectManualCoordinates, geolocationAvailable, geolocating, geolocationNotice, requestMyPosition, submitReport, duplicateConfirmationRequired, duplicateConfirmed, setDuplicateConfirmed, kind, setKind, direction, setDirection, directionKnown, setDirectionKnown, address, setAddress, handleAddressChange, reverseGeocoding };
}
