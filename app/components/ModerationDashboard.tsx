"use client";

// Moderation dashboard — thin orchestrator (kanban t_c7460073).
// The queue state, the fetch and the decision flow live in
// useModerationQueue; the repeated section shell lives in QueueSection;
// the cards and the history live in the dedicated components under
// ./moderation. This file only composes them.

import Link from "next/link";
import { LocaleToggle } from "./LocaleProvider";
import { useMessages } from "../lib/use-messages";
import { SiteHeader } from "./SiteHeader";
import { CameraQueueItem } from "./moderation/CameraQueueItem";
import { CorrectionHistorySection } from "./moderation/CorrectionHistorySection";
import { CorrectionQueueItem } from "./moderation/CorrectionQueueItem";
import { EditQueueItem } from "./moderation/EditQueueItem";
import { HistorySection } from "./moderation/HistorySection";
import { QueueSection } from "./moderation/QueueSection";
import { useModerationQueue } from "./moderation/useModerationQueue";

export function ModerationDashboard() {
  const t = useMessages().moderation;
  const q = useModerationQueue();

  return <main id="main-content">
    <SiteHeader navLabel={t.navigation} homeLabel={t.home} toggle="none">
      <div className="nav-actions"><LocaleToggle /><Link className="text-button" href="/">{t.returnPublic} <span aria-hidden="true">→</span></Link></div>
    </SiteHeader>

    <section className="moderation-page" aria-labelledby="moderation-title">
      <p className="eyebrow"><span /> {t.localAdministration}</p>
      <h1 id="moderation-title">{t.title}</h1>
      <p>{t.intro}</p>
      <div className="prototype-banner" role="note"><b>{t.localTool}</b> {t.localWarning}</div>
      {q.message && <p className="notice" role="status">{q.message}</p>}
      {q.error && <p className="notice" role="alert">{q.error}</p>}
      {q.loading ? <p className="loading-note" aria-live="polite">{t.loading}</p> : <p className="search-count" aria-live="polite">{q.summary}</p>}

      <section className="moderation-section" aria-labelledby="actor-selector-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.localAudit}</p><h2 id="actor-selector-title">{t.selectActor}</h2></div><p className="section-note">{t.actorRequired}</p></div>
        <fieldset className="report-form" style={{ marginTop: 4, padding: 18 }}>
          <label htmlFor="actor-select">{t.selectActor}
            <select id="actor-select" value={q.actorId} onChange={(event) => q.setActorId(event.target.value)} required>
              <option value="">{t.selectReason.replace("reason", "reviewer")}</option>
              {q.reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.displayName} · {reviewer.role}</option>)}
            </select>
            <span className="search-count">{t.actorHelp}</span>
          </label>
        </fieldset>
      </section>

      <QueueSection
        id="pending-cameras-title" eyebrow={t.reports} title={t.pendingReports} note={`${q.cameras.length} ${t.pending}`}
        listLabel={t.pendingReports} loading={q.loading} items={q.cameras}
        emptyTitle={t.noPendingTitle} emptyText={t.noPendingText}
        itemKey={(camera) => camera.id}
        renderItem={(camera) => <CameraQueueItem camera={camera} variant="pending" queueBadge={q.queueBadge("camera", camera.id)} api={q.decisionApi} readableDate={q.readableDate} />}
      />

      <QueueSection
        id="published-cameras-title" eyebrow={t.lifecycle} title={t.publishedRecords} note={`${q.publishedCameras.length} ${t.verified}`}
        listLabel={t.publishedRecords} loading={q.loading} items={q.publishedCameras}
        emptyTitle={t.noPublishedTitle} emptyText={t.noPublishedText}
        itemKey={(camera) => camera.id}
        renderItem={(camera) => <CameraQueueItem camera={camera} variant="published" queueBadge={q.queueBadge("camera", camera.id)} api={q.decisionApi} readableDate={q.readableDate} />}
      />

      <QueueSection
        id="review-cameras-title" eyebrow={t.lifecycle} title={t.recordsNeedReview} note={`${q.reviewCameras.length} ${t.awaitingReview}`}
        listLabel={t.recordsNeedReview} loading={q.loading} items={q.reviewCameras}
        emptyTitle={t.noReviewTitle} emptyText={t.noReviewText}
        itemKey={(camera) => camera.id}
        renderItem={(camera) => <CameraQueueItem camera={camera} variant="review" queueBadge={q.queueBadge("camera", camera.id)} api={q.decisionApi} readableDate={q.readableDate} />}
      />

      <QueueSection
        id="correction-requests-title" eyebrow={t.corrections} title={t.privateCorrections} note={`${q.corrections.length} ${t.pending}`}
        listLabel={t.privateCorrections} loading={q.loading} items={q.corrections}
        emptyTitle={t.noCorrectionsTitle} emptyText={t.noCorrectionsText}
        itemKey={(correction) => correction.id}
        renderItem={(correction) => <CorrectionQueueItem correction={correction} queueBadge={q.queueBadge("correction", correction.id)} api={q.decisionApi} readableDate={q.readableDate} readableStatus={q.readableStatus} readableOutcome={q.readableOutcome} />}
      />

      <CorrectionHistorySection
        readableDate={q.readableDate}
        readableAction={q.readableAction}
        readableReason={q.readableReason}
        readableStatus={q.readableStatus}
        readableOutcome={q.readableOutcome}
      />

      <QueueSection
        id="edit-requests-title" eyebrow={t.editing} title={t.editRequests} note={`${q.editRequests.length} ${t.pending}`}
        listLabel={t.editRequests} loading={q.loading} items={q.editRequests}
        emptyTitle={t.noEditRequestsTitle} emptyText={t.noEditRequestsText}
        itemKey={(editRequest) => editRequest.id}
        renderItem={(editRequest) => <EditQueueItem editRequest={editRequest} queueBadge={q.queueBadge("camera_edit", editRequest.id)} api={q.decisionApi} readableDate={q.readableDate} />}
      />

      <HistorySection
        events={q.recentEvents}
        readableDate={q.readableDate}
        readableAction={q.readableAction}
        readableReason={q.readableReason}
        readableStatus={q.readableStatus}
      />
    </section>
  </main>;
}
