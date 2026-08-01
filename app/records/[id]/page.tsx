"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LocaleToggle, useLocale, useMessages } from "../../components/LocaleProvider";
import { usePublicCameras } from "../../lib/use-public-cameras";
import { publicStatusLabel } from "../../lib/public-status";

type Revision = {
  id: number;
  action: string;
  previousStatus: string;
  newStatus: string;
  createdAt: string;
};

export default function RecordPage() {
  const params = useParams<{ id: string }>();
  const bundle = useMessages();
  const { locale } = useLocale();
  const t = bundle.record;
  const statuses: Record<string, string> = bundle.status;
  const recordId = Number(params.id);

  // Shared public-cameras data layer (audit t_c6da60f0): the page no longer
  // fetches the whole directory on its own, and a dead API is surfaced as an
  // honest error state instead of a misleading "not found".
  const { records, loading: camerasLoading, error: camerasError, reload } = usePublicCameras();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  // Set when the latest revisions fetch settles. While it does not match the
  // requested record id, the detail keeps showing the loading note — no stale
  // history from a previous record is ever rendered.
  const [revisionsLoadedFor, setRevisionsLoadedFor] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cameras/revisions?cameraId=${recordId}`)
      .then((response) => response.ok ? response.json() as Promise<{ recordId: number; revisions: Revision[] }> : Promise.reject(new Error()))
      .then((data: { recordId: number; revisions: Revision[] }) => { if (!cancelled) setRevisions(data.revisions); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setRevisionsLoadedFor(recordId); });
    return () => { cancelled = true; };
  }, [recordId]);

  const record = useMemo(() => records.find((item) => item.id === recordId), [recordId, records]);
  // Safe label: whitelisted public statuses only; anything else falls back to
  // the neutral "Status" string, never the raw internal status value.
  const recordStatus = record ? publicStatusLabel(statuses, record.status, t.statusFallback) : "";
  const loading = camerasLoading || revisionsLoadedFor !== recordId;

  return <main id="main-content" className="record-page"><nav className="nav-shell" aria-label={t.navigation}><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></Link><div className="nav-record-actions"><Link className="text-button" href="/#records">{t.backToDirectory}</Link><LocaleToggle /></div></nav><section className="record-detail" aria-live="polite">{loading ? <p className="loading-note">{t.loading}</p> : camerasError ? <><p className="eyebrow"><span /> {t.unavailable}</p><h1>{t.loadError}</h1><p className="record-detail-summary">{t.loadErrorDetail}</p><div className="record-detail-actions"><button type="button" className="button button-primary" onClick={reload}>{t.retryLoad}</button><Link className="button button-quiet detail-outline" href="/#records">{t.browseDirectory}</Link></div></> : record ? <><p className="eyebrow"><span /> {t.publicRecord}</p><p className="card-topline"><span className={`status-dot ${record.status}`} /> {recordStatus}</p><h1>{record.title}</h1><p className="record-detail-kind">{record.kind}</p><p className="record-detail-summary">{record.description}</p><dl className="record-detail-facts"><div><dt>{t.recordId}</dt><dd>{record.id}</dd></div><div><dt>{t.source}</dt><dd>{record.source}</dd></div><div><dt>{t.lastVerification}</dt><dd>{record.updated}</dd></div><div><dt>{t.generalLocation}</dt><dd>{record.address || `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`}</dd></div>{record.manufacturer && <div><dt>{t.manufacturer}</dt><dd>{record.manufacturer}</dd></div>}{record.observedOn && <div><dt>{t.observedOn}</dt><dd>{record.observedOn}</dd></div>}</dl>{revisions.length > 0 && <section className="record-history" aria-label={t.changeHistory}><h2>{t.changeHistory}</h2><ul className="record-history-list">{revisions.map((revision) => <li key={revision.id}><span className="record-history-label">{t.changeHistoryLabels[revision.action as keyof typeof t.changeHistoryLabels] ?? t.changeHistoryFallback}</span><time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleDateString(locale === "it" ? "it-IT" : "en-GB", { day: "numeric", month: "long", year: "numeric" })}</time></li>)}</ul><p className="record-history-note">{t.changeHistoryNote}</p></section>}<div className="record-detail-actions"><Link className="button button-primary" href="/#map">{t.viewOnMap} <span aria-hidden="true">↗</span></Link><Link className="button button-quiet detail-outline" href="/#correction">{t.reportIssue}</Link></div><p className="record-detail-note">{t.recordNote}</p></> : <><p className="eyebrow"><span /> {t.unavailable}</p><h1>{t.notFound}</h1><p className="record-detail-summary">{t.notFoundDetail}</p><Link className="button button-primary" href="/#records">{t.browseDirectory}</Link></>}</section></main>;
}
