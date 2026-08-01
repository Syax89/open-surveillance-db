"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "../LocaleProvider";
import { publicRecords, prototypeRecords } from "../../lib/records";
import { usePublicCameras } from "../../lib/use-public-cameras";
import { textMatches } from "../../lib/search";
import { PublicDirectory } from "../home/PublicDirectory";

/**
 * /directory tool body (F1 route group (tools), D3-qualified shell): the
 * extracted PublicDirectory (FiltersBar + EmptyState + RecordCard) with
 * client-side filters — the same pattern as the home page, promoted to its
 * own route. Server-side pagination arrives with F0/F4 (API filters).
 */
export function DirectoryTool() {
  const t = useMessages().directory;
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all");
  const [freshnessCutoff, setFreshnessCutoff] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"alphabetical" | "position">("alphabetical");

  const { records } = usePublicCameras({
    seed: publicRecords(prototypeRecords),
  });

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

  // Keyboard path on /directory: "Show on map" opens /mappa with the record
  // preselected via ?focus=ID (F4 wires the focus handling on /mappa).
  function showRecordOnMap(id: number) {
    router.push(`/mappa?focus=${id}`);
  }

  return (
    <section className="tool-section directory-tool" aria-labelledby="directory-tool-title">
      <div className="tool-heading"><p className="eyebrow"><span /> {t.accessibleDirectory}</p><h1 id="directory-tool-title">{t.pageTitle}</h1><p>{t.pageIntro}</p></div>
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
        setCoordinates={() => {}}
        mapHref="/mappa"
        reportHref="/segnala"
      />
    </section>
  );
}
