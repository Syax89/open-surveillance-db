"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { SurveillanceMap } from "./components/SurveillanceMap";
import { LocaleToggle, useLocale, useMessages } from "./components/LocaleProvider";
import { prototypeRecords, publicRecords, type Camera } from "./lib/records";
import { publicStatusLabel } from "./lib/public-status";
import { formatDistance, textMatches } from "./lib/search";

type NearbyCandidate = { id: number; title: string; kind: string; distanceMeters: number; similarity: number; matchStrength: "high" | "medium" | "low" };

type PlaceSearchArea = { kind: "coordinates" | "place"; displayName?: string; latitude: number; longitude: number; radiusMeters: number; radiusLabel: string };

type PlaceSearchResult = {
  status: "loading" | "success" | "empty" | "not-found" | "error";
  message?: string;
  area?: PlaceSearchArea;
  records?: Array<Camera & { distanceMeters: number }>;
};

export default function Home() {
  const bundle = useMessages();
  const t = bundle.home;
  const statuses: Record<string, string> = bundle.status;
  const { locale } = useLocale();
  const [records, setRecords] = useState<Camera[]>(publicRecords(prototypeRecords));
  const [selectedId, setSelectedId] = useState(1);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all");
  const [freshnessCutoff, setFreshnessCutoff] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"alphabetical" | "position">("alphabetical");
  const [correctionNotice, setCorrectionNotice] = useState("");
  const [nearbyCandidates, setNearbyCandidates] = useState<NearbyCandidate[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState("");
  const nearbyRequest = useRef<AbortController | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResult, setPlaceResult] = useState<PlaceSearchResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cameras")
      .then((response) => response.ok ? response.json() as Promise<{ records: Camera[] }> : Promise.reject(new Error(t.apiLoadError)))
      .then((data: { records: Camera[] }) => { if (!cancelled && data.records.length) { setRecords(publicRecords(data.records)); setSelectedId(data.records[0].id); } })
      .catch(() => { if (!cancelled) setNotice(t.apiUnavailable); })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [t.apiLoadError, t.apiUnavailable]);

  useEffect(() => () => nearbyRequest.current?.abort(), []);

  const cameraKinds = useMemo(() => Array.from(new Set(records.map((camera) => camera.kind).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [records]);
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matchingRecords = records.filter((camera) => {
      const matchesSearch = !query || textMatches(camera, query);
      const matchesKind = kindFilter === "all" || camera.kind === kindFilter;
      const updatedAt = new Date(camera.updated).getTime();
      const matchesFreshness = freshnessCutoff === null || (Number.isFinite(updatedAt) && updatedAt >= freshnessCutoff);
      return matchesSearch && matchesKind && matchesFreshness;
    });
    return matchingRecords.sort((first, second) => sortOrder === "alphabetical"
      ? first.title.localeCompare(second.title)
      : first.latitude - second.latitude || first.longitude - second.longitude || first.title.localeCompare(second.title));
  }, [freshnessCutoff, kindFilter, records, search, sortOrder]);
  const selectedCamera = useMemo(() => filteredRecords.find((camera) => camera.id === selectedId) ?? filteredRecords[0], [filteredRecords, selectedId]);

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

  // Locality/address/coordinate search: resolve the place server-side
  // (coordinates are parsed locally, other text is geocoded), then render the
  // searched area, the result count, and a truthful zero-result state.
  async function searchByPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = placeQuery.trim();
    if (!query) {
      setPlaceResult({ status: "error", message: t.placeSearchEmptyQuery });
      return;
    }
    setPlaceResult({ status: "loading" });
    try {
      const params = new URLSearchParams({ q: query, lang: locale });
      const response = await fetch(`/api/cameras/search?${params}`);
      if (response.status === 404) {
        setPlaceResult({ status: "not-found", message: t.placeNotFoundTitle });
        return;
      }
      if (response.status === 429) {
        setPlaceResult({ status: "error", message: t.placeSearchRateLimited });
        return;
      }
      if (!response.ok) {
        setPlaceResult({ status: "error", message: t.placeSearchUnavailable });
        return;
      }
      const data = await response.json() as { area: PlaceSearchArea; records: Array<Camera & { distanceMeters: number }> };
      setPlaceResult({ status: data.records.length ? "success" : "empty", area: data.area, records: data.records });
      if (data.records.length) setCoordinates({ latitude: data.area.latitude, longitude: data.area.longitude });
    } catch {
      setPlaceResult({ status: "error", message: t.placeSearchUnavailable });
    }
  }

  // Keyboard/text-list path for the map's "select a record" task: choose the
  // record from the directory, then move both the viewport AND keyboard focus
  // to the map region so the selection has a visible, announced context.
  // Motion is disabled when the user prefers reduced motion.
  function showRecordOnMap(id: number) {
    setSelectedId(id);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("map")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    document.getElementById("map-region")?.focus({ preventScroll: true });
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
    };
    try {
      const response = await fetch("/api/cameras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { possibleDuplicates?: NearbyCandidate[] };
      if (!response.ok) throw new Error(t.submitReportError);
      const duplicates = Array.isArray(data.possibleDuplicates) ? data.possibleDuplicates : [];
      event.currentTarget.reset(); setCoordinates(null); setManualLatitude(""); setManualLongitude("");
      setNotice(duplicates.length > 0 ? `${t.reportSaved} ${t.reportSavedWithNearby}` : t.reportSaved);
    } catch { setNotice(t.moderationUnavailable); }
  }

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

  return <main id="main-content">
    <nav className="nav-shell" aria-label={t.mainNavigation}>
      <a className="brand" href="#top" aria-label={t.homeAria}><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></a>
      <button className="menu-button" type="button" aria-expanded={menuOpen} aria-controls="main-links" onClick={() => setMenuOpen((current) => !current)}>{t.menu}</button>
      <div className={`nav-links ${menuOpen ? "is-open" : ""}`} id="main-links"><a href="#map">{t.exploreMap}</a><a href="#records">{t.browseRecords}</a><a href="/guide">{t.howItWorks}</a><a href="/regole">{t.rules}</a><a href="/manifesto">{t.manifesto}</a><a className="nav-action" href="#report">{t.addCamera}</a></div><LocaleToggle />
    </nav>

    <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow"><span /> {t.openDatabase}</p><h1>{t.heroTitle}</h1><p className="hero-intro">{t.heroIntro}</p><div className="hero-actions"><a className="button button-primary" href="#map">{t.exploreTheMap} <span aria-hidden="true">↘</span></a><a className="button button-quiet" href="#how-it-works">{t.ourPrinciples}</a></div><dl className="hero-stats" aria-label={t.prototypeStats}><div><dt>{records.length}</dt><dd>{t.publicRecords}</dd></div><div><dt>0</dt><dd>{t.accountsRequired}</dd></div><div><dt>100%</dt><dd>{t.openPrototype}</dd></div></dl></div><div className="hero-visual" aria-hidden="true"><div className="hero-grid" /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="signal signal-one"><i /><b /></div><div className="signal signal-two"><i /><b /></div><div className="signal signal-three"><i /><b /></div><div className="visual-label">{t.visualLabelFirst}<br />{t.visualLabelSecond}</div></div></section>

    <section className="map-section" id="map" aria-labelledby="map-title">
      <div className="section-heading"><div><p className="eyebrow"><span /> {t.livePrototype}</p><h2 id="map-title">{t.mapTitle}</h2></div><p className="section-note">{t.osmBaseMap} · {t.mapCoverageNote}</p></div>
      <div className="prototype-banner"><b>{t.prototypeMode}</b> {t.prototypeBanner}</div>
      <div className="live-map-workspace"><div className="map-panel"><SurveillanceMap cameras={filteredRecords} selectedId={selectedId} focusLocation={coordinates} onSelect={setSelectedId} onPick={selectCoordinates} /><div className="map-hint">{t.mapHint}</div></div>
      {selectedCamera && <article className="camera-card" aria-live="polite"><div className="card-topline"><span className={`status-dot ${selectedCamera.status}`} /> {publicStatusLabel(statuses, selectedCamera.status, t.unknown)}</div><h3>{selectedCamera.title}</h3><p>{selectedCamera.kind}</p><dl><div><dt>{t.recordId}</dt><dd>{selectedCamera.id}</dd></div><div><dt>{t.source}</dt><dd>{selectedCamera.source}</dd></div><div><dt>{t.freshness}</dt><dd>{selectedCamera.updated}</dd></div><div><dt>{t.location}</dt><dd>{selectedCamera.latitude.toFixed(4)}, {selectedCamera.longitude.toFixed(4)}</dd></div></dl><p className="record-description">{selectedCamera.description}</p><a className="text-button" href="#correction">{t.reportIssue} <span aria-hidden="true">→</span></a></article>}</div>
      {loading && <p className="loading-note">{t.loadingRecords}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      <div className="data-actions"><a href="/api/cameras?format=geojson" download="opensurveillancedb-cameras.geojson">{t.downloadGeoJson}</a><span>·</span><a href="/api/cameras?format=csv" download="opensurveillancedb-cameras.csv">{t.downloadCsv}</a><span>·</span><a href="/guide">{t.readDataPolicy}</a></div>
    </section>

    <section className="records-section" id="records" aria-labelledby="records-title">
      <div className="records-heading"><div><p className="eyebrow"><span /> {t.accessibleDirectory}</p><h2 id="records-title">{t.recordsTitle}</h2><p>{t.recordsIntro}</p></div><a className="text-button" href="#map">{t.useMapInstead} <span aria-hidden="true">↑</span></a></div>
      <div className="place-search"><h3>{t.placeSearchTitle}</h3><p>{t.placeSearchHelp}</p><form className="place-search-form" role="search" onSubmit={searchByPlace}><label htmlFor="place-search">{t.placeSearchLabel}</label><div className="place-search-row"><input id="place-search" type="search" value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} maxLength={200} placeholder={t.placeSearchPlaceholder} autoComplete="off" /><button className="button" type="submit">{t.placeSearchSubmit}</button>{placeResult && placeResult.status !== "loading" ? <button type="button" className="text-button" onClick={() => { setPlaceResult(null); setPlaceQuery(""); }}>{t.placeClearResults} <span aria-hidden="true">→</span></button> : null}</div></form><div aria-live="polite">{placeResult?.status === "loading" && <p className="loading-note" role="status">{t.placeSearchLoading}</p>}{placeResult?.status === "error" && <p className="nearby-error" role="alert">{placeResult.message}</p>}{placeResult?.status === "not-found" && <div className="empty-state"><h3>{t.placeNotFoundTitle}</h3><p>{t.placeNotFoundBody}</p></div>}{(placeResult?.status === "success" || placeResult?.status === "empty") && placeResult.area && <div className="place-results"><p className="search-count" role="status">{t.placeAreaLabel(placeResult.area)}</p>{placeResult.status === "success" && placeResult.records && <><p className="search-count">{t.placeResultsFound(placeResult.records.length)}</p><ul className="record-list">{placeResult.records.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className={`status-dot ${camera.status}`} /> {publicStatusLabel(statuses, camera.status, t.unknown)}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div><dl><div><dt>{t.distance}</dt><dd>{formatDistance(camera.distanceMeters)}</dd></div><div><dt>{t.location}</dt><dd>{camera.address || `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}`}</dd></div><div><dt>{t.lastVerification}</dt><dd>{camera.updated}</dd></div></dl><div className="record-list-actions"><button type="button" className="text-button" onClick={() => showRecordOnMap(camera.id)}>{t.showOnMap} <span aria-hidden="true">→</span></button><a className="text-button" href={`/records/${camera.id}`}>{t.openRecord} <span aria-hidden="true">→</span></a></div></article></li>)}</ul></>}{placeResult.status === "empty" && <div className="empty-state"><h3>{t.placeEmptyTitle}</h3><p>{t.placeEmptyBody}</p><div className="record-list-actions"><a className="text-button" href="#report">{t.placeEmptySubmit} <span aria-hidden="true">→</span></a><a className="text-button" href="/guide">{t.placeEmptyCoverage} <span aria-hidden="true">→</span></a></div></div>}</div>}</div></div>
      <div className="directory-controls"><div className="record-search"><label htmlFor="record-search">{t.searchDirectory}</label><input id="record-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlaceholder} aria-describedby="record-search-help record-search-count" /><p id="record-search-help">{t.searchHelp}</p></div><div className="record-filter"><label htmlFor="record-kind-filter">{t.cameraType}</label><select id="record-kind-filter" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="all">{t.allTypes}</option>{cameraKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></div><div className="record-filter"><label htmlFor="record-freshness-filter">{t.freshnessFilter}</label><select id="record-freshness-filter" value={freshnessFilter} onChange={(event) => { const value = event.target.value; setFreshnessFilter(value); setFreshnessCutoff(value === "all" ? null : Date.now() - Number.parseInt(value, 10) * 24 * 60 * 60 * 1000); }}><option value="all">{t.freshnessAll}</option><option value="7d">{t.freshness7d}</option><option value="30d">{t.freshness30d}</option><option value="90d">{t.freshness90d}</option></select></div><div className="record-filter"><label htmlFor="record-sort">{t.orderRecords}</label><select id="record-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "alphabetical" | "position")}><option value="alphabetical">{t.alphabetical}</option><option value="position">{t.positionOrder}</option></select></div></div>
      <p className="search-count" id="record-search-count" role="status">{filteredRecords.length === 1 ? t.oneRecordFound : `${filteredRecords.length} ${t.recordsFound}`}</p>
      {filteredRecords.length ? <ul className="record-list">{filteredRecords.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className={`status-dot ${camera.status}`} /> {publicStatusLabel(statuses, camera.status, t.unknown)}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div><dl><div><dt>{t.recordId}</dt><dd>{camera.id}</dd></div><div><dt>{t.source}</dt><dd>{camera.source}</dd></div><div><dt>{t.lastVerification}</dt><dd>{camera.updated}</dd></div><div><dt>{t.location}</dt><dd>{camera.address || `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}`}</dd></div>{camera.manufacturer && <div><dt>{t.manufacturerLabel}</dt><dd>{camera.manufacturer}</dd></div>}{camera.observedOn && <div><dt>{t.observedOnLabel}</dt><dd>{camera.observedOn}</dd></div>}</dl><div className="record-list-actions"><button type="button" className="text-button" onClick={() => showRecordOnMap(camera.id)}>{t.showOnMap} <span aria-hidden="true">→</span></button><a className="text-button" href={`/records/${camera.id}`}>{t.openRecord} <span aria-hidden="true">→</span></a></div></article></li>)}</ul> : <div className="empty-state"><h3>{t.emptyTitle}</h3><p>{t.emptyBody}</p><button type="button" className="text-button" onClick={() => setSearch("")}>{t.clearSearch} <span aria-hidden="true">→</span></button></div>}
    </section>

    <section className="correction-section" id="correction" aria-labelledby="correction-title"><div><p className="eyebrow"><span /> {t.accountability}</p><h2 id="correction-title">{t.correctionTitle}</h2><p>{t.correctionIntro}</p><div className="report-rule"><b>{t.urgentConcern}</b><br />{t.urgentConcernBody}</div></div><form className="correction-form" onSubmit={submitCorrection}><label>{t.relatedRecord}<select name="cameraId" defaultValue=""><option value="">{t.noSpecificRecord}</option>{records.map((camera) => <option key={camera.id} value={camera.id}>{camera.id} — {camera.title}</option>)}</select></label><label>{t.needsReview}<select required name="issueType" defaultValue=""><option value="" disabled>{t.selectOne}</option><option value="inaccurate">{t.inaccurate}</option><option value="outdated">{t.outdated}</option><option value="privacy-safety">{t.privacySafety}</option><option value="duplicate">{t.duplicate}</option><option value="other">{t.other}</option></select></label><label>{t.briefDescription}<textarea required name="message" maxLength={1500} rows={4} placeholder={t.correctionPlaceholder} /></label><label>{t.contactEmail}<input type="email" name="contact" maxLength={180} placeholder={t.contactPlaceholder} /></label><label className="check-label"><input type="checkbox" required /> <span>{t.correctionConsent}</span></label><button className="button button-primary" type="submit">{t.sendPrivateRequest} <span aria-hidden="true">→</span></button>{correctionNotice && <p className="notice" role="status">{correctionNotice}</p>}</form></section>

    <section className="principles" id="how-it-works"><div className="principles-intro"><p className="eyebrow"><span /> {t.civicCommons}</p><h2>{t.principlesTitle}</h2><p>{t.principlesIntro}</p></div><div className="principles-grid"><article><span>01</span><h3>{t.openDefault}</h3><p>{t.openDefaultBody}</p></article><article><span>02</span><h3>{t.privacyFirst}</h3><p>{t.privacyFirstBody}</p></article><article><span>03</span><h3>{t.moderatedReports}</h3><p>{t.moderatedReportsBody}</p></article></div></section>
    <section className="report-section" id="report"><div><p className="eyebrow"><span /> {t.contribute}</p><h2>{t.reportTitle}</h2><p>{t.reportIntro}</p><div className="report-rule"><b>{t.beforeSubmitting}</b><br />{t.beforeSubmittingBody}</div>{coordinates && <div className="coordinate-readout">{t.selectedPoint}<br /><b>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</b></div>}{nearbyLoading && <p className="nearby-check" role="status">{t.checkingNearby}</p>}{nearbyCandidates.length > 0 && <aside className="duplicate-alert" role="alert" aria-live="assertive"><b>{t.possibleDuplicate}</b><p>{t.duplicateBody}</p><ul>{nearbyCandidates.map((candidate) => <li key={candidate.id}><a href={`/records/${candidate.id}`}>{candidate.title}</a> · {candidate.kind} · {Math.round(candidate.distanceMeters)} {t.metresAway}{candidate.matchStrength === "high" && <span className="duplicate-strength"> · {t.matchVeryClose}</span>}{candidate.matchStrength === "medium" && <span className="duplicate-strength"> · {t.matchLikely}</span>}</li>)}</ul><p className="duplicate-guidance"><a className="text-button" href="#correction">{t.duplicateGuidance} <span aria-hidden="true">→</span></a></p></aside>}{nearbyError && <p className="nearby-check nearby-error" role="status">{t.nearbyUnavailable}</p>}</div><form className="report-form" onSubmit={submitReport}><fieldset className="coordinate-entry"><legend>{t.manualCoordinatesTitle}</legend><p id="manual-coordinates-help">{t.manualCoordinatesHelp}</p><div className="coordinate-fields"><label htmlFor="manual-latitude">{t.latitude}<input id="manual-latitude" type="text" inputMode="decimal" autoComplete="off" value={manualLatitude} onChange={(event) => setManualLatitude(event.target.value)} aria-describedby="manual-coordinates-help" placeholder="45.46420" /></label><label htmlFor="manual-longitude">{t.longitude}<input id="manual-longitude" type="text" inputMode="decimal" autoComplete="off" value={manualLongitude} onChange={(event) => setManualLongitude(event.target.value)} aria-describedby="manual-coordinates-help" placeholder="9.19000" /></label></div><button className="button coordinate-button" type="button" onClick={selectManualCoordinates}>{t.useCoordinates}</button></fieldset><label>{t.recordTitle}<input required name="title" maxLength={90} placeholder={t.recordTitlePlaceholder} /></label><label>{t.cameraType}<select required name="kind" defaultValue=""><option value="" disabled>{t.selectOne}</option><option>{t.fixedDome}</option><option>{t.bullet}</option><option>PTZ</option><option>{t.trafficReader}</option><option>{t.otherUnknown}</option></select></label><div className="report-metadata-fields"><label>{t.manufacturer}<input name="manufacturer" maxLength={80} placeholder={t.manufacturerPlaceholder} /></label><label>{t.observedOn}<input name="observedOn" type="date" /></label></div><label>{t.approximateAddress}<input name="address" maxLength={180} placeholder={t.addressPlaceholder} /></label><label>{t.whatObserved}<textarea name="notes" maxLength={1000} rows={3} placeholder={t.observedPlaceholder} /></label><label className="check-label"><input type="checkbox" required /> <span>{t.reportConsent}</span></label><button className="button button-primary" type="submit">{t.sendModeration} <span aria-hidden="true">→</span></button></form></section>

  </main>;
}
