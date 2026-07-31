"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { SurveillanceMap } from "./components/SurveillanceMap";
import { LocaleToggle, useLocale } from "./components/LocaleProvider";
import { prototypeRecords, statusLabel, type Camera } from "./lib/records";

export default function Home() {
  const { locale } = useLocale();
  const isItalian = locale === "it";
  const t = isItalian ? italian : english;
  const localizedStatusLabel: Record<string, string> = isItalian
    ? { ...statusLabel, verified: "Verificata", demo: "Record prototipo", pending: "In moderazione", needs_review: "Da ricontrollare", removed: "Rimossa", rejected: "Rifiutata" }
    : { ...statusLabel, needs_review: "Needs review", removed: "Removed", rejected: "Rejected" };
  const [records, setRecords] = useState<Camera[]>(prototypeRecords);
  const [selectedId, setSelectedId] = useState(1);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"alphabetical" | "position">("alphabetical");
  const [correctionNotice, setCorrectionNotice] = useState("");
  const [nearbyCandidates, setNearbyCandidates] = useState<Array<{ id: number; title: string; kind: string; distanceMeters: number }>>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState("");
  const nearbyRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cameras")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(t.apiLoadError)))
      .then((data: { records: Camera[] }) => { if (!cancelled && data.records.length) { setRecords(data.records); setSelectedId(data.records[0].id); } })
      .catch(() => { if (!cancelled) setNotice(t.apiUnavailable); })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [t.apiLoadError, t.apiUnavailable]);

  useEffect(() => () => nearbyRequest.current?.abort(), []);

  const cameraKinds = useMemo(() => Array.from(new Set(records.map((camera) => camera.kind).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [records]);
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matchingRecords = records.filter((camera) => {
      const matchesSearch = !query || [camera.title, camera.kind, camera.source, camera.address, camera.manufacturer, camera.description, camera.latitude.toFixed(5), camera.longitude.toFixed(5)].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(query));
      return matchesSearch && (kindFilter === "all" || camera.kind === kindFilter);
    });
    return matchingRecords.sort((first, second) => sortOrder === "alphabetical"
      ? first.title.localeCompare(second.title)
      : first.latitude - second.latitude || first.longitude - second.longitude || first.title.localeCompare(second.title));
  }, [kindFilter, records, search, sortOrder]);
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
      const data = await response.json() as { records?: Array<{ id: number; title: string; kind: string; distanceMeters: number }> };
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
      if (!response.ok) throw new Error(t.submitReportError);
      event.currentTarget.reset(); setCoordinates(null); setManualLatitude(""); setManualLongitude("");
      setNotice(t.reportSaved);
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
      <div className={`nav-links ${menuOpen ? "is-open" : ""}`} id="main-links"><a href="#map">{t.exploreMap}</a><a href="#records">{t.browseRecords}</a><a href="/guide">{t.howItWorks}</a><a className="nav-action" href="#report">{t.addCamera}</a></div><LocaleToggle />
    </nav>

    <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow"><span /> {t.openDatabase}</p><h1>{t.heroTitle}</h1><p className="hero-intro">{t.heroIntro}</p><div className="hero-actions"><a className="button button-primary" href="#map">{t.exploreTheMap} <span aria-hidden="true">↘</span></a><a className="button button-quiet" href="#how-it-works">{t.ourPrinciples}</a></div><dl className="hero-stats" aria-label={t.prototypeStats}><div><dt>{records.length}</dt><dd>{t.publicRecords}</dd></div><div><dt>0</dt><dd>{t.accountsRequired}</dd></div><div><dt>100%</dt><dd>{t.openPrototype}</dd></div></dl></div><div className="hero-visual" aria-hidden="true"><div className="hero-grid" /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="signal signal-one"><i /><b /></div><div className="signal signal-two"><i /><b /></div><div className="signal signal-three"><i /><b /></div><div className="visual-label">{t.visualLabelFirst}<br />{t.visualLabelSecond}</div></div></section>

    <section className="map-section" id="map" aria-labelledby="map-title">
      <div className="section-heading"><div><p className="eyebrow"><span /> {t.livePrototype}</p><h2 id="map-title">{t.mapTitle}</h2></div><p className="section-note">{t.osmBaseMap}</p></div>
      <div className="prototype-banner"><b>{t.prototypeMode}</b> {t.prototypeBanner}</div>
      <div className="live-map-workspace"><div className="map-panel"><SurveillanceMap cameras={filteredRecords} selectedId={selectedId} focusLocation={coordinates} onSelect={setSelectedId} onPick={selectCoordinates} /><div className="map-hint">{t.mapHint}</div></div>
      {selectedCamera && <article className="camera-card" aria-live="polite"><div className="card-topline"><span className={`status-dot ${selectedCamera.status}`} /> {localizedStatusLabel[selectedCamera.status] ?? selectedCamera.status}</div><h3>{selectedCamera.title}</h3><p>{selectedCamera.kind}</p><dl><div><dt>{t.source}</dt><dd>{selectedCamera.source}</dd></div><div><dt>{t.freshness}</dt><dd>{selectedCamera.updated}</dd></div><div><dt>{t.location}</dt><dd>{selectedCamera.latitude.toFixed(5)}, {selectedCamera.longitude.toFixed(5)}</dd></div></dl><p className="record-description">{selectedCamera.description}</p><a className="text-button" href="#correction">{t.reportIssue} <span aria-hidden="true">→</span></a></article>}</div>
      {loading && <p className="loading-note">{t.loadingRecords}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      <div className="data-actions"><a href="/api/cameras?format=geojson" download="opensurveillancedb-cameras.geojson">{t.downloadGeoJson}</a><span>·</span><a href="/api/cameras?format=csv" download="opensurveillancedb-cameras.csv">{t.downloadCsv}</a><span>·</span><a href="/guide">{t.readDataPolicy}</a></div>
    </section>

    <section className="records-section" id="records" aria-labelledby="records-title">
      <div className="records-heading"><div><p className="eyebrow"><span /> {t.accessibleDirectory}</p><h2 id="records-title">{t.recordsTitle}</h2><p>{t.recordsIntro}</p></div><a className="text-button" href="#map">{t.useMapInstead} <span aria-hidden="true">↑</span></a></div>
      <div className="directory-controls"><div className="record-search"><label htmlFor="record-search">{t.searchDirectory}</label><input id="record-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlaceholder} aria-describedby="record-search-help record-search-count" /><p id="record-search-help">{t.searchHelp}</p></div><div className="record-filter"><label htmlFor="record-kind-filter">{t.cameraType}</label><select id="record-kind-filter" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="all">{t.allTypes}</option>{cameraKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></div><div className="record-filter"><label htmlFor="record-sort">{t.orderRecords}</label><select id="record-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "alphabetical" | "position")}><option value="alphabetical">{t.alphabetical}</option><option value="position">{t.positionOrder}</option></select></div></div>
      <p className="search-count" id="record-search-count" role="status">{filteredRecords.length === 1 ? t.oneRecordFound : `${filteredRecords.length} ${t.recordsFound}`}</p>
      {filteredRecords.length ? <ul className="record-list">{filteredRecords.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className={`status-dot ${camera.status}`} /> {localizedStatusLabel[camera.status] ?? camera.status}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div><dl><div><dt>{t.source}</dt><dd>{camera.source}</dd></div><div><dt>{t.lastVerification}</dt><dd>{camera.updated}</dd></div><div><dt>{t.location}</dt><dd>{camera.address || `${camera.latitude.toFixed(5)}, ${camera.longitude.toFixed(5)}`}</dd></div>{camera.manufacturer && <div><dt>{t.manufacturerLabel}</dt><dd>{camera.manufacturer}</dd></div>}{camera.observedOn && <div><dt>{t.observedOnLabel}</dt><dd>{camera.observedOn}</dd></div>}</dl><div className="record-list-actions"><button type="button" className="text-button" onClick={() => { setSelectedId(camera.id); document.getElementById("map")?.scrollIntoView({ behavior: "smooth" }); }}>{t.showOnMap} <span aria-hidden="true">→</span></button><a className="text-button" href={`/records/${camera.id}`}>{t.openRecord} <span aria-hidden="true">→</span></a></div></article></li>)}</ul> : <div className="empty-state"><h3>{t.emptyTitle}</h3><p>{t.emptyBody}</p><button type="button" className="text-button" onClick={() => setSearch("")}>{t.clearSearch} <span aria-hidden="true">→</span></button></div>}
    </section>

    <section className="correction-section" id="correction" aria-labelledby="correction-title"><div><p className="eyebrow"><span /> {t.accountability}</p><h2 id="correction-title">{t.correctionTitle}</h2><p>{t.correctionIntro}</p><div className="report-rule"><b>{t.urgentConcern}</b><br />{t.urgentConcernBody}</div></div><form className="correction-form" onSubmit={submitCorrection}><label>{t.relatedRecord}<select name="cameraId" defaultValue=""><option value="">{t.noSpecificRecord}</option>{records.map((camera) => <option key={camera.id} value={camera.id}>{camera.id} — {camera.title}</option>)}</select></label><label>{t.needsReview}<select required name="issueType" defaultValue=""><option value="" disabled>{t.selectOne}</option><option value="inaccurate">{t.inaccurate}</option><option value="outdated">{t.outdated}</option><option value="privacy-safety">{t.privacySafety}</option><option value="duplicate">{t.duplicate}</option><option value="other">{t.other}</option></select></label><label>{t.briefDescription}<textarea required name="message" maxLength={1500} rows={4} placeholder={t.correctionPlaceholder} /></label><label>{t.contactEmail}<input type="email" name="contact" maxLength={180} placeholder={t.contactPlaceholder} /></label><label className="check-label"><input type="checkbox" required /> <span>{t.correctionConsent}</span></label><button className="button button-primary" type="submit">{t.sendPrivateRequest} <span aria-hidden="true">→</span></button>{correctionNotice && <p className="notice" role="status">{correctionNotice}</p>}</form></section>

    <section className="principles" id="how-it-works"><div className="principles-intro"><p className="eyebrow"><span /> {t.civicCommons}</p><h2>{t.principlesTitle}</h2><p>{t.principlesIntro}</p></div><div className="principles-grid"><article><span>01</span><h3>{t.openDefault}</h3><p>{t.openDefaultBody}</p></article><article><span>02</span><h3>{t.privacyFirst}</h3><p>{t.privacyFirstBody}</p></article><article><span>03</span><h3>{t.moderatedReports}</h3><p>{t.moderatedReportsBody}</p></article></div></section>

    <section className="report-section" id="report"><div><p className="eyebrow"><span /> {t.contribute}</p><h2>{t.reportTitle}</h2><p>{t.reportIntro}</p><div className="report-rule"><b>{t.beforeSubmitting}</b><br />{t.beforeSubmittingBody}</div>{coordinates && <div className="coordinate-readout">{t.selectedPoint}<br /><b>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</b></div>}{nearbyLoading && <p className="nearby-check" role="status">{t.checkingNearby}</p>}{nearbyCandidates.length > 0 && <aside className="duplicate-alert" role="alert" aria-live="assertive"><b>{t.possibleDuplicate}</b><p>{t.duplicateBody}</p><ul>{nearbyCandidates.map((candidate) => <li key={candidate.id}><a href={`/records/${candidate.id}`}>{candidate.title}</a> · {candidate.kind} · {Math.round(candidate.distanceMeters)} {t.metresAway}</li>)}</ul></aside>}{nearbyError && <p className="nearby-check nearby-error" role="status">{t.nearbyUnavailable}</p>}</div><form className="report-form" onSubmit={submitReport}><fieldset className="coordinate-entry"><legend>{t.manualCoordinatesTitle}</legend><p id="manual-coordinates-help">{t.manualCoordinatesHelp}</p><div className="coordinate-fields"><label htmlFor="manual-latitude">{t.latitude}<input id="manual-latitude" type="text" inputMode="decimal" autoComplete="off" value={manualLatitude} onChange={(event) => setManualLatitude(event.target.value)} aria-describedby="manual-coordinates-help" placeholder="45.46420" /></label><label htmlFor="manual-longitude">{t.longitude}<input id="manual-longitude" type="text" inputMode="decimal" autoComplete="off" value={manualLongitude} onChange={(event) => setManualLongitude(event.target.value)} aria-describedby="manual-coordinates-help" placeholder="9.19000" /></label></div><button className="button coordinate-button" type="button" onClick={selectManualCoordinates}>{t.useCoordinates}</button></fieldset><label>{t.recordTitle}<input required name="title" maxLength={90} placeholder={t.recordTitlePlaceholder} /></label><label>{t.cameraType}<select required name="kind" defaultValue=""><option value="" disabled>{t.selectOne}</option><option>{t.fixedDome}</option><option>{t.bullet}</option><option>PTZ</option><option>{t.trafficReader}</option><option>{t.otherUnknown}</option></select></label><div className="report-metadata-fields"><label>{t.manufacturer}<input name="manufacturer" maxLength={80} placeholder={t.manufacturerPlaceholder} /></label><label>{t.observedOn}<input name="observedOn" type="date" /></label></div><label>{t.approximateAddress}<input name="address" maxLength={180} placeholder={t.addressPlaceholder} /></label><label>{t.whatObserved}<textarea name="notes" maxLength={1000} rows={3} placeholder={t.observedPlaceholder} /></label><label className="check-label"><input type="checkbox" required /> <span>{t.reportConsent}</span></label><button className="button button-primary" type="submit">{t.sendModeration} <span aria-hidden="true">→</span></button></form></section>

    <footer id="about"><div className="brand"><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></div><p>{t.footerLineOne}<br />{t.footerLineTwo}</p><div className="footer-links"><a href="/guide">{t.howItWorks}</a><a href="/api/cameras?format=geojson">{t.openData}</a><a href="#report">{t.contribute}</a><a href="#top">{t.backToTop} ↑</a></div></footer>
  </main>;
}

const english = {
  mainNavigation: "Main navigation", homeAria: "OpenSurveillanceDB home", menu: "Menu", exploreMap: "Explore map", browseRecords: "Browse records", howItWorks: "How it works", addCamera: "Add a camera",
  openDatabase: "Open database · community maintained", heroTitle: "Public data about public surveillance.", heroIntro: "OpenSurveillanceDB maps visible surveillance infrastructure in public space. The data is open, sourced and built by people who want to understand the systems around them.", exploreTheMap: "Explore the map", ourPrinciples: "Our principles", prototypeStats: "Prototype database statistics", publicRecords: "public records", accountsRequired: "accounts required", openPrototype: "open prototype", visualLabelFirst: "Mapping public space", visualLabelSecond: "with public knowledge",
  livePrototype: "Live prototype", mapTitle: "Explore documented cameras", osmBaseMap: "OpenStreetMap base map", prototypeMode: "Prototype mode.", prototypeBanner: "The base map is real OpenStreetMap data; the two visible camera pins are clearly labelled illustrative records. Click anywhere on the map to select a position for a report.", mapHint: "Click the map to choose a report position", source: "Source", freshness: "Freshness", location: "Location", reportIssue: "Report an issue", loadingRecords: "Loading the public record API…", downloadGeoJson: "Download GeoJSON", downloadCsv: "Download CSV", readDataPolicy: "Read the data policy",
  accessibleDirectory: "Accessible directory", recordsTitle: "Browse public records without the map", recordsIntro: "Search covers the same reviewed records shown on the map. A result is never evidence that an area has no surveillance.", useMapInstead: "Use the map instead", searchDirectory: "Search the public directory", searchPlaceholder: "Type, source, place or coordinate", searchHelp: "Only reviewed public records and labelled prototype records appear here.", cameraType: "Camera type", allTypes: "All types", orderRecords: "Order records", alphabetical: "Alphabetical", positionOrder: "Position (south to north)", oneRecordFound: "1 public record found", recordsFound: "public records found", lastVerification: "Last verification", showOnMap: "Show on map", openRecord: "Open record", emptyTitle: "No published record matches that search.", emptyBody: "This does not mean that there are no cameras in the area. You can clear the search, explore the map, or submit a private observation for moderation.", clearSearch: "Clear search",
  accountability: "Accountability", correctionTitle: "Correct a record or raise a concern.", correctionIntro: "Corrections are private. They do not change the map automatically and are never included in the public data export.", urgentConcern: "Urgent privacy or safety concern?", urgentConcernBody: "Describe only the minimum needed to identify the problem. Do not include personal data, live-feed links, credentials, or images.", relatedRecord: "Related public record", noSpecificRecord: "No specific record / general concern", needsReview: "What needs review?", selectOne: "Select one", inaccurate: "Inaccurate information", outdated: "Outdated record", privacySafety: "Privacy or safety concern", duplicate: "Duplicate record", other: "Other", briefDescription: "Brief description", correctionPlaceholder: "Explain the issue without including personal data or operational details.", contactEmail: "Contact email (optional)", contactPlaceholder: "Only if you want a reply", correctionConsent: "I understand that this request is private, reviewed by humans, and may not result in an automatic change.", sendPrivateRequest: "Send private request",
  civicCommons: "A civic data commons", principlesTitle: "Visibility without surveillance.", principlesIntro: "We document public infrastructure, never camera feeds. Each published record has a source, a status and a way to be corrected.", openDefault: "Open by default", openDefaultBody: "Downloadable data with visible provenance for journalism, research and civic use.", privacyFirst: "Privacy first", privacyFirstBody: "Faces, licence plates and personal information must be removed before publication.", moderatedReports: "Moderated reports", moderatedReportsBody: "New records wait for human review. A report is not made public just because it was submitted.",
  contribute: "Contribute", reportTitle: "Help make public space legible.", reportIntro: "Choose a location on the map or enter coordinates, then add only what you can observe from public space. This version has a real local moderation queue but no photo upload yet.", beforeSubmitting: "Before submitting", beforeSubmittingBody: "Do not upload or describe people, licence plates, private homes, security weaknesses or sensitive locations.", selectedPoint: "Selected point", manualCoordinatesTitle: "Or enter coordinates", manualCoordinatesHelp: "Use decimal degrees. Latitude must be between -90 and 90; longitude between -180 and 180. A comma is accepted as the decimal separator.", latitude: "Latitude", longitude: "Longitude", useCoordinates: "Use these coordinates", checkingNearby: "Checking reviewed records within 75 metres…", possibleDuplicate: "Possible duplicate nearby", duplicateBody: "These reviewed records are within 75 metres. You can still submit a new report; it will be reviewed separately.", metresAway: "m away", nearbyUnavailable: "We could not check nearby records. You can still submit this report for moderation.", recordTitle: "Record title", recordTitlePlaceholder: "e.g. Public security camera", fixedDome: "Fixed dome", bullet: "Bullet", trafficReader: "Traffic / licence plate reader", otherUnknown: "Other / unknown", manufacturer: "Manufacturer (optional)", manufacturerPlaceholder: "e.g. manufacturer name", manufacturerLabel: "Manufacturer", observedOn: "Date observed (optional)", observedOnLabel: "Observed on", approximateAddress: "Approximate address", addressPlaceholder: "Street and city (optional)", whatObserved: "What did you observe?", observedPlaceholder: "Direction, operator, visible notice, model…", reportConsent: "I confirm this observation was made from public space and contains no personal data.", sendModeration: "Send to moderation",
  footerLineOne: "An open database of public surveillance cameras.", footerLineTwo: "Built for transparency, not tracking.", openData: "Open data", backToTop: "Back to top", apiLoadError: "Unable to load records", apiUnavailable: "The public API is not available yet, so the prototype is showing illustrative records.", positionSelected: "Position selected", nearbyCheckError: "Unable to check nearby records", choosePosition: "Choose the approximate camera position on the map or enter valid coordinates before submitting.", invalidCoordinates: "Enter a valid latitude (-90 to 90) and longitude (-180 to 180).", defaultReportTitle: "Public camera report", unknown: "Unknown", submitReportError: "Unable to submit report", reportSaved: "Report saved. It is now marked ‘In moderation’ and is not shown publicly until reviewed.", moderationUnavailable: "The moderation queue is unavailable. Please try again after restarting the local prototype.", saveRequestError: "Unable to save request", correctionSaved: "Private correction request saved with reference", correctionPrivate: "It is not displayed in the public directory.", correctionUnavailable: "The correction queue is unavailable. Please try again later.",
} as const;

const italian: { [K in keyof typeof english]: string } = {
  mainNavigation: "Navigazione principale", homeAria: "Pagina iniziale di OpenSurveillanceDB", menu: "Menu", exploreMap: "Esplora la mappa", browseRecords: "Sfoglia i record", howItWorks: "Come funziona", addCamera: "Aggiungi una telecamera",
  openDatabase: "Database aperto · mantenuto dalla comunità", heroTitle: "Dati pubblici sulla sorveglianza pubblica.", heroIntro: "OpenSurveillanceDB mappa le infrastrutture di sorveglianza visibili nello spazio pubblico. I dati sono aperti, provengono da fonti documentate e sono costruiti da persone che vogliono capire i sistemi che le circondano.", exploreTheMap: "Esplora la mappa", ourPrinciples: "I nostri principi", prototypeStats: "Statistiche del database prototipo", publicRecords: "record pubblici", accountsRequired: "account richiesti", openPrototype: "prototipo aperto", visualLabelFirst: "Mappare lo spazio pubblico", visualLabelSecond: "con conoscenza pubblica",
  livePrototype: "Prototipo attivo", mapTitle: "Esplora le telecamere documentate", osmBaseMap: "Mappa di base OpenStreetMap", prototypeMode: "Modalità prototipo.", prototypeBanner: "La mappa di base usa dati reali di OpenStreetMap; i due pin visibili sono record illustrativi chiaramente etichettati. Fai clic in un punto della mappa per selezionare la posizione di una segnalazione.", mapHint: "Fai clic sulla mappa per scegliere la posizione della segnalazione", source: "Fonte", freshness: "Aggiornamento", location: "Posizione", reportIssue: "Segnala un problema", loadingRecords: "Caricamento dell’API dei record pubblici…", downloadGeoJson: "Scarica GeoJSON", downloadCsv: "Scarica CSV", readDataPolicy: "Leggi la politica dei dati",
  accessibleDirectory: "Elenco accessibile", recordsTitle: "Sfoglia i record pubblici senza usare la mappa", recordsIntro: "La ricerca include gli stessi record revisionati mostrati sulla mappa. Un risultato non prova mai l’assenza di sorveglianza in un’area.", useMapInstead: "Usa invece la mappa", searchDirectory: "Cerca nell’elenco pubblico", searchPlaceholder: "Tipo, fonte, luogo o coordinate", searchHelp: "Qui compaiono solo record pubblici revisionati e record prototipo etichettati.", cameraType: "Tipo di telecamera", allTypes: "Tutti i tipi", orderRecords: "Ordina i record", alphabetical: "Alfabetico", positionOrder: "Posizione (da sud a nord)", oneRecordFound: "1 record pubblico trovato", recordsFound: "record pubblici trovati", lastVerification: "Ultima verifica", showOnMap: "Mostra sulla mappa", openRecord: "Apri record", emptyTitle: "Nessun record pubblicato corrisponde alla ricerca.", emptyBody: "Questo non significa che nell’area non ci siano telecamere. Puoi cancellare la ricerca, esplorare la mappa o inviare un’osservazione privata per la moderazione.", clearSearch: "Cancella ricerca",
  accountability: "Responsabilità", correctionTitle: "Correggi un record o segnala una criticità.", correctionIntro: "Le correzioni sono private. Non modificano automaticamente la mappa e non sono mai incluse nell’esportazione dei dati pubblici.", urgentConcern: "Problema urgente di privacy o sicurezza?", urgentConcernBody: "Descrivi solo il minimo necessario per identificare il problema. Non includere dati personali, link a feed in diretta, credenziali o immagini.", relatedRecord: "Record pubblico collegato", noSpecificRecord: "Nessun record specifico / segnalazione generale", needsReview: "Cosa deve essere rivisto?", selectOne: "Seleziona un’opzione", inaccurate: "Informazione inesatta", outdated: "Record non aggiornato", privacySafety: "Problema di privacy o sicurezza", duplicate: "Record duplicato", other: "Altro", briefDescription: "Breve descrizione", correctionPlaceholder: "Spiega il problema senza inserire dati personali o dettagli operativi.", contactEmail: "Email di contatto (facoltativa)", contactPlaceholder: "Solo se desideri una risposta", correctionConsent: "Comprendo che questa richiesta è privata, viene revisionata da persone e potrebbe non produrre una modifica automatica.", sendPrivateRequest: "Invia richiesta privata",
  civicCommons: "Un bene comune civico di dati", principlesTitle: "Visibilità senza sorveglianza.", principlesIntro: "Documentiamo infrastrutture pubbliche, mai feed delle telecamere. Ogni record pubblicato ha una fonte, uno stato e un modo per essere corretto.", openDefault: "Aperto per impostazione predefinita", openDefaultBody: "Dati scaricabili con provenienza visibile per giornalismo, ricerca e uso civico.", privacyFirst: "La privacy prima di tutto", privacyFirstBody: "Volti, targhe e informazioni personali devono essere rimossi prima della pubblicazione.", moderatedReports: "Segnalazioni moderate", moderatedReportsBody: "I nuovi record attendono la revisione umana. Una segnalazione non diventa pubblica solo perché è stata inviata.",
  contribute: "Contribuisci", reportTitle: "Rendi leggibile lo spazio pubblico.", reportIntro: "Scegli una posizione sulla mappa o inserisci le coordinate, poi aggiungi solo ciò che puoi osservare dallo spazio pubblico. Questa versione ha una coda di moderazione locale reale, ma non supporta ancora il caricamento di foto.", beforeSubmitting: "Prima di inviare", beforeSubmittingBody: "Non caricare né descrivere persone, targhe, abitazioni private, debolezze di sicurezza o luoghi sensibili.", selectedPoint: "Punto selezionato", manualCoordinatesTitle: "Oppure inserisci le coordinate", manualCoordinatesHelp: "Usa gradi decimali. La latitudine deve essere tra -90 e 90; la longitudine tra -180 e 180. La virgola è accettata come separatore decimale.", latitude: "Latitudine", longitude: "Longitudine", useCoordinates: "Usa queste coordinate", checkingNearby: "Verifica dei record revisionati entro 75 metri…", possibleDuplicate: "Possibile duplicato nelle vicinanze", duplicateBody: "Questi record revisionati sono entro 75 metri. Puoi comunque inviare una nuova segnalazione: sarà revisionata separatamente.", metresAway: "m di distanza", nearbyUnavailable: "Non è stato possibile verificare i record vicini. Puoi comunque inviare la segnalazione per la moderazione.", recordTitle: "Titolo del record", recordTitlePlaceholder: "es. Telecamera di sicurezza pubblica", fixedDome: "Dome fissa", bullet: "Bullet", trafficReader: "Traffico / lettore targhe", otherUnknown: "Altro / sconosciuto", manufacturer: "Produttore (facoltativo)", manufacturerPlaceholder: "es. nome del produttore", manufacturerLabel: "Produttore", observedOn: "Data osservata (facoltativa)", observedOnLabel: "Data osservata", approximateAddress: "Indirizzo approssimativo", addressPlaceholder: "Via e città (facoltative)", whatObserved: "Cosa hai osservato?", observedPlaceholder: "Direzione, gestore, avviso visibile, modello…", reportConsent: "Confermo che l’osservazione è stata fatta dallo spazio pubblico e non contiene dati personali.", sendModeration: "Invia alla moderazione",
  footerLineOne: "Un database aperto delle telecamere di sorveglianza pubblica.", footerLineTwo: "Creato per la trasparenza, non per il tracciamento.", openData: "Dati aperti", backToTop: "Torna in alto", apiLoadError: "Impossibile caricare i record", apiUnavailable: "L’API pubblica non è ancora disponibile: il prototipo mostra record illustrativi.", positionSelected: "Posizione selezionata", nearbyCheckError: "Impossibile verificare i record vicini", choosePosition: "Scegli la posizione approssimativa della telecamera sulla mappa o inserisci coordinate valide prima di inviare.", invalidCoordinates: "Inserisci una latitudine valida (-90 a 90) e una longitudine valida (-180 a 180).", defaultReportTitle: "Segnalazione di telecamera pubblica", unknown: "Sconosciuto", submitReportError: "Impossibile inviare la segnalazione", reportSaved: "Segnalazione salvata. Ora è in moderazione e non viene mostrata pubblicamente finché non è revisionata.", moderationUnavailable: "La coda di moderazione non è disponibile. Riprova dopo aver riavviato il prototipo locale.", saveRequestError: "Impossibile salvare la richiesta", correctionSaved: "Richiesta privata di correzione salvata con riferimento", correctionPrivate: "Non viene mostrata nell’elenco pubblico.", correctionUnavailable: "La coda delle correzioni non è disponibile. Riprova più tardi.",
};
