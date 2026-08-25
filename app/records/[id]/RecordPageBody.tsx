"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LocaleToggle, useLocale } from "../../components/LocaleProvider";
import { useMessages } from "../../lib/use-messages";
import { SiteHeader } from "../../components/SiteHeader";
import { CommunityActions } from "../../components/CommunityActions";
import { usePublicCamera } from "../../lib/use-public-cameras";
import { isRecordPageStatus } from "../../lib/public-status";
import { formatPublicDate } from "../../lib/format-date";
import { formatDirection } from "../../lib/compass";
import { formatLocation } from "../../lib/format-location";
import { RecordMiniMap } from "../../components/RecordMiniMap";

/**
 * Public lifecycle event (ADR 0021 §7, FASE 3 UI): the unattributed event
 * stream served by GET /api/cameras/[id]/events. `detail` is parsed JSON —
 * shape varies by event type (see eventDetailText below).
 */
type LifecycleEvent = {
  id: number;
  eventType: string;
  detail: { reason?: string; count?: number; counts?: { sum: number; distinct: number }; actionType?: string } | null;
  createdAt: string;
};

/** Withdrawn statuses: the direct-link banner contract (ADR §6.3). */
function isWithdrawn(status: string): boolean {
  return status === "hidden" || status === "removed";
}

export default function RecordPageBody() {
  const params = useParams<{ id: string }>();
  const bundle = useMessages();
  const { locale } = useLocale();
  const t = bundle.record;
  const community = bundle.community;
  const statuses: Record<string, string> = bundle.status;
  const recordId = Number(params.id);

  const { record, loading: camerasLoading, error: camerasError, reload } = usePublicCamera(recordId);
  const [events, setEvents] = useState<LifecycleEvent[] | null>(null);
  const [eventsLoadedFor, setEventsLoadedFor] = useState<number | null>(null);
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

  // Public event timeline (ADR §7): fetched once per record; the events are
  // public aggregate data (Cache-Control s-maxage=300), so a stale row while
  // revalidating is fine — the loading gate keys on the resolved id only.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cameras/${recordId}/events`)
      .then((response) => response.ok ? response.json() as Promise<{ events: LifecycleEvent[] }> : Promise.reject(new Error()))
      .then((data) => { if (!cancelled) setEvents(Array.isArray(data.events) ? data.events : []); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setEventsLoadedFor(recordId); });
    return () => { cancelled = true; };
  }, [recordId]);

  // Safe label: the record-page whitelist (active/demo/hidden/removed) gets
  // its localized label; anything else falls back to the neutral string,
  // never the raw internal status value.
  const recordStatus = record
    ? (isRecordPageStatus(record.status) ? statuses[record.status] : t.statusFallback)
    : "";
  const loading = camerasLoading || eventsLoadedFor !== recordId;

  // Owner-only "Edit" link (C6): unchanged probe — the public record API is
  // attribution-free, so ownership is discovered with the dedicated owner
  // read instead. Failures are silent — the link simply does not render.
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!record) return;
    fetch(`/api/cameras/${recordId}/edit`)
      .then((response) => { if (!cancelled && response.ok) setIsOwner(true); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [record, recordId]);

  // Timeline event text: the semantic label plus the aggregate detail —
  // counts (distinct people) and hide reasons only, never weights (ADR
  // §10.2: the weighted sum is internal threshold machinery).
  function eventDetailText(event: LifecycleEvent): string {
    const detail = event.detail;
    if (!detail) return "";
    const parts: string[] = [];
    if (event.eventType === "hidden" && detail.reason) {
      const reasonKey = detail.reason === "admin-legal" ? "adminLegal" : detail.reason;
      const reasonLabel = t.hideReasons[reasonKey as keyof typeof t.hideReasons];
      if (reasonLabel) parts.push(reasonLabel);
    }
    const distinct = typeof detail.count === "number" ? detail.count : detail.counts?.distinct;
    if (typeof distinct === "number" && distinct > 0) parts.push(t.eventPeople(distinct));
    return parts.length > 0 ? ` — ${parts.join(" · ")}` : "";
  }

  return <main id="main-content" className="record-page"><SiteHeader navLabel={t.navigation} toggle="none"><div className="nav-record-actions"><Link className="text-button" href="/directory">{t.backToDirectory}</Link><LocaleToggle /></div></SiteHeader><section className="record-detail" aria-live="polite">{loading ? <p className="loading-note">{t.loading}</p> : offline ? <><p className="eyebrow"><span /> {t.unavailable}</p><h1>{t.offlineTitle}</h1><p className="record-detail-summary">{t.offlineBody}</p><div className="record-detail-actions"><button type="button" className="button button-primary" onClick={reload}>{t.offlineAction}</button><Link className="button button-quiet detail-outline" href="/directory">{t.browseDirectory}</Link></div></> : camerasError ? <><p className="eyebrow"><span /> {t.unavailable}</p><h1>{t.loadError}</h1><p className="record-detail-summary">{t.loadErrorDetail}</p><div className="record-detail-actions"><button type="button" className="button button-primary" onClick={reload}>{t.retryLoad}</button><Link className="button button-quiet detail-outline" href="/directory">{t.browseDirectory}</Link></div></> : record ? <>{isWithdrawn(record.status) && (
    <div className={`record-banner record-banner-${record.status}`} role="note">
      <p className="record-banner-title"><span className={`status-dot ${record.status}`} aria-hidden="true" /> {record.status === "hidden" ? t.hiddenTitle : t.removedTitle}</p>
      <p className="record-banner-body">{record.status === "hidden" ? t.hiddenBody : t.removedBody} <a className="text-button" href="#record-timeline">{t.bannerHistoryLink} <span aria-hidden="true">→</span></a></p>
      <p className="record-banner-note">{t.bannerNote}</p>
    </div>
  )}<p className="eyebrow"><span /> {t.publicRecord}</p><p className="card-topline"><span className={`status-dot ${record.status}`} /> {recordStatus}</p><h1>{record.title}</h1><p className="record-detail-kind">{record.kind}</p><p className="record-detail-summary">{record.description}</p>{/* Community status badge (ADR §9.1, FASE 3 UI): informational freshness —
    never a state change. No confirmations → neutral "never confirmed";
    otherwise the count and the last-confirmed date. */}
    <p className="community-badge">{record.status === "demo" ? <><span className="community-badge-label">{t.communityStatus}:</span> {t.demoUpdated}</> : !isWithdrawn(record.status) && record.lastVerifiedAt ? <><span className="community-badge-label">{t.communityStatus}:</span> {t.confirmedTimes(record.confirmCount ?? record.confirmationCount ?? 0)} · {t.lastConfirmed}: {formatPublicDate(record.lastVerifiedAt, locale)}</> : !isWithdrawn(record.status) ? <><span className="community-badge-label">{t.communityStatus}:</span> {t.neverConfirmed}</> : null}</p>{/* Import provenance (FASE C, t_4dbce318): imported records carry the
    source dataset and its licence right under the community badge — the
    licence-matrix attribution, not the raw "import:<slug>" value. The
    source link opens the original dataset; the licence link the licence
    text. Community reports and demo rows render nothing. */}
    {record.importBatch ? <p className="record-provenance"><span className="community-badge-label">{t.importedFrom}:</span> <a href={record.importBatch.sourceUrl} target="_blank" rel="noopener noreferrer">{record.importBatch.sourceName}</a>{" · "}{record.importBatch.licenseUrl ? <a href={record.importBatch.licenseUrl} target="_blank" rel="noopener noreferrer">{record.importBatch.license}</a> : record.importBatch.license}</p> : null}<dl className="record-detail-facts"><div><dt>{t.recordId}</dt><dd>{record.id}</dd></div><div><dt>{t.source}</dt><dd>{record.status === "demo" ? t.demoSource : record.importBatch ? record.importBatch.sourceName : record.source}</dd></div><div><dt>{t.addedOn}</dt><dd>{formatPublicDate(record.createdAt, locale)}</dd></div><div><dt>{t.lastVerification}</dt><dd>{record.status === "demo" ? t.demoUpdated : formatPublicDate(record.updated, locale)}</dd></div>{!isWithdrawn(record.status) && <div><dt>{t.generalLocation}</dt><dd>{formatLocation(record.address, record.latitude as number, record.longitude as number)}</dd></div>}{record.manufacturer && <div><dt>{t.manufacturer}</dt><dd>{record.manufacturer}</dd></div>}{record.observedOn && <div><dt>{t.observedOn}</dt><dd>{formatPublicDate(record.observedOn, locale)}</dd></div>}{typeof record.direction === "number" && Number.isFinite(record.direction) && <div><dt>{t.direction}</dt><dd>{formatDirection(record.direction)}</dd></div>}</dl>{/* Mini map (CEO 2026-08-07): where the camera is + its field-of-view
     cone/circle — read-only Leaflet display, same geometry as /mappa. */}{!isWithdrawn(record.status) && <RecordMiniMap latitude={record.latitude as number} longitude={record.longitude as number} kind={record.kind} direction={record.direction} title={record.title} status={record.status} />}{/* Community action widget (ADR 0021 §3): five actions, live counts,
        (ADR §6.3). */}{!isWithdrawn(record.status) && <CommunityActions key={recordId} recordId={recordId} counts={{ like: record.usefulCount, confirm: record.confirmCount, gone: record.goneCount, problem: record.problemCount, privacy: record.privacyCount }} />}{/* Public event timeline (ADR §7, FASE 3 UI): replaces the old
        moderation change-history — the same history, unattributed and
        aggregate. */}<section className="record-timeline" id="record-timeline" aria-label={t.timeline}><h2>{t.timeline}</h2>{events === null ? <p className="loading-note">{t.loading}</p> : events.length === 0 ? <p className="record-timeline-empty">{t.timelineEmpty}</p> : <><ul className="record-timeline-list">{events.map((event) => <li key={event.id}><span className="record-timeline-label">{t.timelineLabels[event.eventType as keyof typeof t.timelineLabels] ?? t.timelineFallback}{eventDetailText(event)}</span><time dateTime={event.createdAt}>{formatPublicDate(event.createdAt, locale)}</time></li>)}</ul><p className="record-timeline-note">{t.timelineNote}</p></>}</section><div className="record-detail-actions">{!isWithdrawn(record.status) && <Link className="button button-primary" href="/mappa">{t.viewOnMap} <span aria-hidden="true">↗</span></Link>}{isOwner && <Link className="button button-quiet detail-outline" href={`/records/${recordId}/edit`}>{community.edit}</Link>}<Link className="button button-quiet detail-outline" href="/correggi">{t.reportIssue}</Link></div><p className="record-detail-note">{t.recordNote}</p></> : <><p className="eyebrow"><span /> {t.unavailable}</p><h1>{t.notFound}</h1><p className="record-detail-summary">{t.notFoundDetail}</p><Link className="button button-primary" href="/directory">{t.browseDirectory}</Link></>}</section></main>;
}
