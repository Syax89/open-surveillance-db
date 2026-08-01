"use client";

import { useMemo, useState } from "react";
import { useMessages } from "./components/LocaleProvider";
import { SiteHeader } from "./components/SiteHeader";
import { prototypeRecords, publicRecords } from "./lib/records";
import { usePublicCameras } from "./lib/use-public-cameras";
import { textMatches } from "./lib/search";
import { Hero } from "./components/home/Hero";
import { MapPanel } from "./components/home/MapPanel";
import { PublicDirectory } from "./components/home/PublicDirectory";
import { CorrectionForm } from "./components/home/CorrectionForm";
import { ReportForm } from "./components/home/ReportForm";
import { useReportFlow } from "./lib/useReportFlow";

export default function Home() {
  const t = useMessages().home;
  const [selectedId, setSelectedId] = useState(1);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all");
  const [freshnessCutoff, setFreshnessCutoff] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"alphabetical" | "position">("alphabetical");

  // Shared public-cameras data layer (audit t_c6da60f0): fetch + abort +
  // module cache + explicit loading/error states. The layer walks the
  // paginated /api/cameras (limit 500/page, nextOffset) so the map renders
  // ALL public records; `total` is the server total, never a first-page
  // count. The prototype records are the explicit demo seed rendered while
  // loading or when the API is unreachable (the notice below says so); the
  // API payload replaces them.
  const { records, total, loading } = usePublicCameras({
    seed: publicRecords(prototypeRecords),
    onRecords: (next) => setSelectedId(next[0].id),
    onError: () => setNotice(t.apiUnavailable),
  });

  // Report flow (position + nearby-duplicate check + photo upload + submit):
  // the hook owns the flow's internal state; the page injects the notice
  // setter (the notice is displayed in the map section) and distributes the
  // flow to the map (pick a position) and the report form (display + submit).
  const report = useReportFlow({ setNotice });

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
    <SiteHeader navLabel={t.mainNavigation} homeLabel={t.homeAria} brandHref="#top" brandAs="anchor" menu menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((current) => !current)}>
      <div className={`nav-links ${menuOpen ? "is-open" : ""}`} id="main-links"><a href="#map">{t.exploreMap}</a><a href="#records">{t.browseRecords}</a><a href="/guide">{t.howItWorks}</a><a href="/regole">{t.rules}</a><a href="/manifesto">{t.manifesto}</a><a className="nav-action" href="#report">{t.addCamera}</a></div>
    </SiteHeader>

    <Hero recordsCount={total ?? records.length} />

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
