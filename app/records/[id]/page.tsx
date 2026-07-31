"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LocaleToggle, useLocale } from "../../components/LocaleProvider";
import { prototypeRecords, type Camera } from "../../lib/records";
import { statusLabel } from "../../lib/status";

type Revision = {
  id: number;
  action: string;
  previousStatus: string;
  newStatus: string;
  createdAt: string;
};

const copy = {
  en: {
    navigation: "Record navigation",
    backToDirectory: "← Back to directory",
    loading: "Loading the public record…",
    publicRecord: "Public record",
    recordId: "Record ID",
    source: "Source",
    lastVerification: "Last verification",
    generalLocation: "General location",
    manufacturer: "Manufacturer",
    observedOn: "Observed on",
    viewOnMap: "View on map",
    reportIssue: "Report an issue",
    changeHistory: "Change history",
    changeHistoryNote: "This history lists reviewed changes only. It never includes contributor identities or internal notes.",
    changeHistoryFallback: "Record updated",
    changeHistoryLabels: {
      approve: "Approved and published",
      "mark-stale": "Marked for re-review",
      reverify: "Re-verified",
      hide: "Removed from public listing",
    },
    recordNote: "This page contains only reviewed public records or clearly labelled prototype data. It does not provide live feeds or operational camera details.",
    unavailable: "Record unavailable",
    notFound: "We could not find that public record.",
    notFoundDetail: "It may have been removed, is not public, or the link is incorrect.",
    browseDirectory: "Browse the directory",
  },
  it: {
    navigation: "Navigazione del record",
    backToDirectory: "← Torna all'elenco",
    loading: "Caricamento del record pubblico…",
    publicRecord: "Record pubblico",
    recordId: "ID record",
    source: "Fonte",
    lastVerification: "Ultima verifica",
    generalLocation: "Posizione generale",
    manufacturer: "Produttore",
    observedOn: "Data osservata",
    viewOnMap: "Vedi sulla mappa",
    reportIssue: "Segnala un problema",
    changeHistory: "Cronologia delle modifiche",
    changeHistoryNote: "Questa cronologia elenca solo le modifiche revisionate. Non include mai identità dei contributori né note interne.",
    changeHistoryFallback: "Record aggiornato",
    changeHistoryLabels: {
      approve: "Approvato e pubblicato",
      "mark-stale": "Segnalato per un nuovo riesame",
      reverify: "Riverificato",
      hide: "Rimosso dall'elenco pubblico",
    },
    recordNote: "Questa pagina contiene solo record pubblici revisionati o dati di prototipo chiaramente etichettati. Non fornisce flussi video in diretta né dettagli operativi delle telecamere.",
    unavailable: "Record non disponibile",
    notFound: "Non è stato possibile trovare questo record pubblico.",
    notFoundDetail: "Potrebbe essere stato rimosso, non essere pubblico oppure il collegamento non è corretto.",
    browseDirectory: "Sfoglia l'elenco",
  },
} as const;

export default function RecordPage() {
  const params = useParams<{ id: string }>();
  const { locale } = useLocale();
  const t = copy[locale];
  const recordId = Number(params.id);
  const [records, setRecords] = useState<Camera[]>(prototypeRecords);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadRecord = fetch("/api/cameras")
      .then((response) => response.ok ? response.json() as Promise<{ records: Camera[] }> : Promise.reject(new Error()))
      .then((data: { records: Camera[] }) => { if (!cancelled && data.records.length) setRecords(data.records); })
      .catch(() => undefined);
    const loadRevisions = fetch(`/api/cameras/revisions?cameraId=${recordId}`)
      .then((response) => response.ok ? response.json() as Promise<{ recordId: number; revisions: Revision[] }> : Promise.reject(new Error()))
      .then((data: { recordId: number; revisions: Revision[] }) => { if (!cancelled) setRevisions(data.revisions); })
      .catch(() => undefined);
    Promise.allSettled([loadRecord, loadRevisions]).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [recordId]);

  const record = useMemo(() => records.find((item) => item.id === recordId), [recordId, records]);
  const recordStatus = record ? statusLabel(locale, record.status) : "";

  return <main id="main-content" className="record-page"><nav className="nav-shell" aria-label={t.navigation}><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></Link><div className="nav-record-actions"><Link className="text-button" href="/#records">{t.backToDirectory}</Link><LocaleToggle /></div></nav><section className="record-detail" aria-live="polite">{loading ? <p className="loading-note">{t.loading}</p> : record ? <><p className="eyebrow"><span /> {t.publicRecord}</p><p className="card-topline"><span className={`status-dot ${record.status}`} /> {recordStatus}</p><h1>{record.title}</h1><p className="record-detail-kind">{record.kind}</p><p className="record-detail-summary">{record.description}</p><dl className="record-detail-facts"><div><dt>{t.recordId}</dt><dd>{record.id}</dd></div><div><dt>{t.source}</dt><dd>{record.source}</dd></div><div><dt>{t.lastVerification}</dt><dd>{record.updated}</dd></div><div><dt>{t.generalLocation}</dt><dd>{record.address || `${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)}`}</dd></div>{record.manufacturer && <div><dt>{t.manufacturer}</dt><dd>{record.manufacturer}</dd></div>}{record.observedOn && <div><dt>{t.observedOn}</dt><dd>{record.observedOn}</dd></div>}</dl>{revisions.length > 0 && <section className="record-history" aria-label={t.changeHistory}><h2>{t.changeHistory}</h2><ul className="record-history-list">{revisions.map((revision) => <li key={revision.id}><span className="record-history-label">{t.changeHistoryLabels[revision.action as keyof typeof t.changeHistoryLabels] ?? t.changeHistoryFallback}</span><time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleDateString(locale === "it" ? "it-IT" : "en-GB", { day: "numeric", month: "long", year: "numeric" })}</time></li>)}</ul><p className="record-history-note">{t.changeHistoryNote}</p></section>}<div className="record-detail-actions"><Link className="button button-primary" href="/#map">{t.viewOnMap} <span aria-hidden="true">↗</span></Link><Link className="button button-quiet detail-outline" href="/#correction">{t.reportIssue}</Link></div><p className="record-detail-note">{t.recordNote}</p></> : <><p className="eyebrow"><span /> {t.unavailable}</p><h1>{t.notFound}</h1><p className="record-detail-summary">{t.notFoundDetail}</p><Link className="button button-primary" href="/#records">{t.browseDirectory}</Link></>}</section></main>;
}
