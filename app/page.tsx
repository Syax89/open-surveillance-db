"use client";

import { useEffect, useMemo, useState } from "react";
import { LocaleToggle, useMessages } from "./components/LocaleProvider";
import { prototypeRecords, publicRecords, type Camera } from "./lib/records";
import { textMatches } from "./lib/search";
import { Hero } from "./components/home/Hero";
import { MapPanel } from "./components/home/MapPanel";
import { PublicDirectory } from "./components/home/PublicDirectory";
import { CorrectionForm } from "./components/home/CorrectionForm";
import { ReportForm, useReportFlow } from "./components/home/ReportForm";

export default function Home() {
  const t = useMessages().home;
  const [records, setRecords] = useState<Camera[]>(publicRecords(prototypeRecords));
  const [selectedId, setSelectedId] = useState(1);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all");
  const [freshnessCutoff, setFreshnessCutoff] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"alphabetical" | "position">("alphabetical");

  // Report flow (position + nearby-duplicate check + photo upload + submit):
  // the hook owns the flow's internal state; the page injects the notice
  // setter (the notice is displayed in the map section) and distributes the
  // flow to the map (pick a position) and the report form (display + submit).
  const report = useReportFlow({ setNotice });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cameras")
      .then((response) => response.ok ? response.json() as Promise<{ records: Camera[] }> : Promise.reject(new Error(t.apiLoadError)))
      .then((data: { records: Camera[] }) => { if (!cancelled && data.records.length) { setRecords(publicRecords(data.records)); setSelectedId(data.records[0].id); } })
      .catch(() => { if (!cancelled) setNotice(t.apiUnavailable); })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [t.apiLoadError, t.apiUnavailable]);

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

  return <main id="main-content">
    <nav className="nav-shell" aria-label={t.mainNavigation}>
      <a className="brand" href="#top" aria-label={t.homeAria}><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></a>
      <button className="menu-button" type="button" aria-expanded={menuOpen} aria-controls="main-links" onClick={() => setMenuOpen((current) => !current)}>{t.menu}</button>
      <div className={`nav-links ${menuOpen ? "is-open" : ""}`} id="main-links"><a href="#map">{t.exploreMap}</a><a href="#records">{t.browseRecords}</a><a href="/guide">{t.howItWorks}</a><a href="/regole">{t.rules}</a><a href="/manifesto">{t.manifesto}</a><a className="nav-action" href="#report">{t.addCamera}</a></div><LocaleToggle />
    </nav>

    <Hero recordsCount={records.length} />

    <MapPanel
      filteredRecords={filteredRecords}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onPick={report.selectCoordinates}
      coordinates={report.coordinates}
      selectedCamera={selectedCamera}
      loading={loading}
      notice={notice}
    />

    <PublicDirectory
      filteredRecords={filteredRecords}
      cameraKinds={cameraKinds}
      search={search}
      setSearch={setSearch}
      kindFilter={kindFilter}
      setKindFilter={setKindFilter}
      freshnessFilter={freshnessFilter}
      setFreshnessFilter={setFreshnessFilter}
      setFreshnessCutoff={setFreshnessCutoff}
      sortOrder={sortOrder}
      setSortOrder={setSortOrder}
      showRecordOnMap={showRecordOnMap}
      setCoordinates={report.setCoordinates}
    />

    <CorrectionForm records={records} />

    <section className="principles" id="how-it-works"><div className="principles-intro"><p className="eyebrow"><span /> {t.civicCommons}</p><h2>{t.principlesTitle}</h2><p>{t.principlesIntro}</p></div><div className="principles-grid"><article><span>01</span><h3>{t.openDefault}</h3><p>{t.openDefaultBody}</p></article><article><span>02</span><h3>{t.privacyFirst}</h3><p>{t.privacyFirstBody}</p></article><article><span>03</span><h3>{t.moderatedReports}</h3><p>{t.moderatedReportsBody}</p></article></div></section>

    <ReportForm
      coordinates={report.coordinates}
      manualLatitude={report.manualLatitude}
      setManualLatitude={report.setManualLatitude}
      manualLongitude={report.manualLongitude}
      setManualLongitude={report.setManualLongitude}
      nearbyCandidates={report.nearbyCandidates}
      nearbyLoading={report.nearbyLoading}
      nearbyError={report.nearbyError}
      photos={report.photos}
      photoUploading={report.photoUploading}
      photoInputRef={report.photoInputRef}
      onPhotoSelected={report.onPhotoSelected}
      removePhoto={report.removePhoto}
      selectManualCoordinates={report.selectManualCoordinates}
      submitReport={report.submitReport}
    />
  </main>;
}
