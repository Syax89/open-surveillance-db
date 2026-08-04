"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LocaleToggle, useLocale } from "../../components/LocaleProvider";
import { useMessages } from "../../lib/use-messages";
import { SiteHeader } from "../../components/SiteHeader";
import { VerificationWidget } from "../../components/VerificationWidget";
import { usePublicCamera } from "../../lib/use-public-cameras";
import { publicStatusLabel } from "../../lib/public-status";
import { formatPublicDate } from "../../lib/format-date";
import { formatDirection } from "../../lib/compass";

type Revision = {
  id: number;
  action: string;
  previousStatus: string;
  newStatus: string;
  createdAt: string;
};

export default function RecordPageBody() {
  const params = useParams<{ id: string }>();
  const bundle = useMessages();
  const { locale } = useLocale();
  const t = bundle.record;
  const community = bundle.community;
  const statuses: Record<string, string> = bundle.status;
  const recordId = Number(params.id);

  // Shared public-cameras data layer (audit t_c6da60f0, pagination
  // t_cc94f340): a targeted walk resolves this single id without fetching
  // the whole directory (early exit on the id DESC list, module cache shared
  // with the home page), and a dead API is surfaced as an honest error state
  // instead of a misleading "not found".
  const { record, loading: camerasLoading, error: camerasError, reload } = usePublicCamera(recordId);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  // Offline state: the fetch cannot reach the API, so instead of the generic
  // "load error" we explain the cause and offer the same retry. SSR-safe:
  // navigator is undefined on the server, so first paint never shows it.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") return;
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
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

  // `record` comes from the shared layer (targeted paginated walk); null
  // while loading and when the id is definitively not public.
  // Safe label: whitelisted public statuses only; anything else falls back to
  // the neutral "Status" string, never the raw internal status value.
  const recordStatus = record ? publicStatusLabel(statuses, record.status, t.statusFallback) : "";
  const loading = camerasLoading || revisionsLoadedFor !== recordId;

  // Owner-only "Edit" link (C6): the public record API is attribution-free,
  // so ownership is discovered with the dedicated owner read instead. The
  // probe answers 200 only for the contributor who owns the record (401
  // anonymous, 403 non-owner on published, 404 fail-closed otherwise), so
  // nothing is leaked: the record is already public, and a non-owner learns
  // nothing beyond the page they are looking at. Failures are silent — the
  // link simply does not render.
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!record) return;
    fetch(`/api/cameras/${recordId}/edit`)
      .then((response) => { if (!cancelled && response.ok) setIsOwner(true); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [record, recordId]);

  return <main id="main-content" className="record-page"><SiteHeader navLabel={t.navigation} toggle="none"><div className="nav-record-actions"><Link className="text-button" href="/#records">{t.backToDirectory}</Link><LocaleToggle /></div></SiteHeader><section className="record-detail" aria-live="polite">{loading ? <p className="loading-note">{t.loading}</p> : offline ? <><p className="eyebrow"><span /> {t.unavailable}</p><h1>{t.offlineTitle}</h1><p className="record-detail-summary">{t.offlineBody}</p><div className="record-detail-actions"><button type="button" className="button button-primary" onClick={reload}>{t.offlineAction}</button><Link className="button button-quiet detail-outline" href="/#records">{t.browseDirectory}</Link></div></> : camerasError ? <><p className="eyebrow"><span /> {t.unavailable}</p><h1>{t.loadError}</h1><p className="record-detail-summary">{t.loadErrorDetail}</p><div className="record-detail-actions"><button type="button" className="button button-primary" onClick={reload}>{t.retryLoad}</button><Link className="button button-quiet detail-outline" href="/#records">{t.browseDirectory}</Link></div></> : record ? <><p className="eyebrow"><span /> {t.publicRecord}</p><p className="card-topline"><span className={`status-dot ${record.status}`} /> {recordStatus}</p><h1>{record.title}</h1><p className="record-detail-kind">{record.kind}</p><p className="record-detail-summary">{record.description}</p><dl className="record-detail-facts"><div><dt>{t.recordId}</dt><dd>{record.id}</dd></div><div><dt>{t.source}</dt><dd>{record.status === "demo" ? t.demoSource : record.source}</dd></div><div><dt>{t.lastVerification}</dt><dd>{record.status === "demo" ? t.demoUpdated : formatPublicDate(record.updated, locale)}</dd></div><div><dt>{t.generalLocation}</dt><dd>{record.address || `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`}</dd></div>{record.manufacturer && <div><dt>{t.manufacturer}</dt><dd>{record.manufacturer}</dd></div>}{record.observedOn && <div><dt>{t.observedOn}</dt><dd>{formatPublicDate(record.observedOn, locale)}</dd></div>}{typeof record.direction === "number" && Number.isFinite(record.direction) && <div><dt>{t.direction}</dt><dd>{formatDirection(record.direction)}</dd></div>}</dl>{/* Community verification widget (C5): aggregate count from the public
        record, personal toggle + trust gate owned by VerificationWidget.
        key={recordId} remounts it between records so its state resets
        naturally (no sync setState in effects). SOLO nel record detail —
        mai in card/directory/home (C3). */}<VerificationWidget key={recordId} recordId={recordId} aggregateCount={record.confirmationCount ?? 0} />{revisions.length > 0 && <section className="record-history" aria-label={t.changeHistory}><h2>{t.changeHistory}</h2><ul className="record-history-list">{revisions.map((revision) => <li key={revision.id}><span className="record-history-label">{t.changeHistoryLabels[revision.action as keyof typeof t.changeHistoryLabels] ?? t.changeHistoryFallback}</span><time dateTime={revision.createdAt}>{formatPublicDate(revision.createdAt, locale)}</time></li>)}</ul><p className="record-history-note">{t.changeHistoryNote}</p></section>}<div className="record-detail-actions"><Link className="button button-primary" href="/#map">{t.viewOnMap} <span aria-hidden="true">↗</span></Link>{isOwner && <Link className="button button-quiet detail-outline" href={`/records/${recordId}/edit`}>{community.edit}</Link>}<Link className="button button-quiet detail-outline" href="/#correction">{t.reportIssue}</Link></div><p className="record-detail-note">{t.recordNote}</p></> : <><p className="eyebrow"><span /> {t.unavailable}</p><h1>{t.notFound}</h1><p className="record-detail-summary">{t.notFoundDetail}</p><Link className="button button-primary" href="/#records">{t.browseDirectory}</Link></>}</section></main>;
}
