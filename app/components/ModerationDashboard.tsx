"use client";

// Moderation dashboard — thin orchestrator (kanban t_c7460073).
// The queue state, the fetch and the decision flow live in
// useModerationQueue; the repeated section shell lives in QueueSection;
// the cards and the history live in the dedicated components under
// ./moderation. This file only composes them.

import Link from "next/link";
import { LocaleToggle } from "./LocaleProvider";
import { useDomainMessages } from "../lib/use-domain-messages";
import { errorsByLocale } from "../lib/i18n/errors";
import { moderationByLocale } from "../lib/i18n/moderation";
import { SiteHeader } from "./SiteHeader";
import { CameraQueueItem } from "./moderation/CameraQueueItem";
import { CorrectionHistorySection } from "./moderation/CorrectionHistorySection";
import { CorrectionQueueItem } from "./moderation/CorrectionQueueItem";
import { EditQueueItem } from "./moderation/EditQueueItem";
import { HistorySection } from "./moderation/HistorySection";
import { QueueSection } from "./moderation/QueueSection";
import { QueueTabs, useQueueTab } from "./moderation/QueueTabs";
import { useModerationQueue } from "./moderation/useModerationQueue";

export function ModerationDashboard() {
  const errors = useDomainMessages(errorsByLocale);
  const t = useDomainMessages(moderationByLocale);
  const q = useModerationQueue();
  const [tab, setTab] = useQueueTab();
  const count = (queue: "pending" | "review" | "corrections" | "edits", shown: number) => q.loading ? undefined : (q.totals[queue] ?? shown);

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
      {q.queueError && <p className="notice" role="alert">{q.queueError}</p>}
      {q.loading ? <p className="loading-note" aria-live="polite">{t.loading}</p> : <p className="search-count" aria-live="polite">{q.summary}</p>}

      {/* Compact toolbar (2026-11): the acting reviewer is one inline field,
          not a section of its own. */}
      <div className="moderation-toolbar">
        <label htmlFor="actor-select">{t.selectActor}</label>
        <select id="actor-select" value={q.actorId} onChange={(event) => q.setActorId(event.target.value)} required aria-describedby="actor-help">
          <option value="">{t.selectReason.replace("reason", "reviewer")}</option>
          {q.reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.displayName} · {reviewer.role}</option>)}
        </select>
        <span className="search-count" id="actor-help">{t.actorHelp}</span>
      </div>

      <QueueTabs label={t.queuesLabel} tab={tab} onSelect={setTab} labels={t.tabs}
        counts={{ pending: count("pending", q.cameras.length), review: count("review", q.reviewCameras.length), corrections: count("corrections", q.corrections.length), edits: count("edits", q.editRequests.length), published: q.loading ? undefined : q.publishedTotal }} />
      <div className="moderation-panel" role="tabpanel" id={`queue-panel-${tab}`} aria-labelledby={`queue-tab-${tab}`}>
      {tab === "pending" && (
      <QueueSection
        id="pending-cameras-title" eyebrow={t.reports} title={t.pendingReports} note={`${q.queuePaging("pending", q.cameras.length).note} ${t.pending}`}
        listLabel={t.pendingReports} loading={q.loading} items={q.cameras} paging={q.queuePaging("pending", q.cameras.length)}
        emptyTitle={t.noPendingTitle} emptyText={t.noPendingText}
        itemKey={(camera) => camera.id}
        renderItem={(camera) => <CameraQueueItem camera={camera} variant="pending" queueBadge={q.queueBadge("camera", camera.id)} api={q.decisionApi} readableDate={q.readableDate} />}
      />

      )}
      {tab === "published" && (
      <QueueSection
        id="published-cameras-title" eyebrow={t.lifecycle} title={t.publishedRecords} note={`${t.shownOf(q.publishedCameras.length, q.publishedTotal)} ${t.verified}`}
        listLabel={t.publishedRecords} loading={q.loading || q.publishedPagination.loading || q.publishedPagination.failed} items={q.publishedCameras}
        emptyTitle={t.noPublishedTitle} emptyText={t.noPublishedText} hasHistory={q.publishedPagination.hasPrevious}
        itemKey={(camera) => camera.id}
        renderItem={(camera) => <CameraQueueItem camera={camera} variant="published" queueBadge={q.queueBadge("camera", camera.id)} api={q.decisionApi} readableDate={q.readableDate} />}
        footer={(q.publishedCameras.length > 0 || q.publishedPagination.hasPrevious || q.publishedPagination.hasNext || q.publishedPagination.failed) && (
          <nav className="directory-pagination" aria-label={t.publishedRecords} aria-busy={q.publishedPagination.loading}>
            <button type="button" className="pagination-button" disabled={!q.publishedPagination.hasPrevious || q.publishedPagination.loading} onClick={q.publishedPagination.onPrevious}><span aria-hidden="true">←</span> {q.publishedPagination.previousLabel}</button>
            {q.publishedPagination.failed && <button type="button" className="pagination-button" disabled={q.publishedPagination.loading} onClick={q.publishedPagination.onRetry}>{errors.tryAgain}</button>}
            <button type="button" className="pagination-button" disabled={!q.publishedPagination.hasNext || q.publishedPagination.loading} onClick={q.publishedPagination.onNext}>{q.publishedPagination.nextLabel} <span aria-hidden="true">→</span></button>
          </nav>
        )}
      />

      )}
      {tab === "review" && (
      <QueueSection
        id="review-cameras-title" eyebrow={t.lifecycle} title={t.recordsNeedReview} note={`${q.queuePaging("review", q.reviewCameras.length).note} ${t.awaitingReview}`}
        listLabel={t.recordsNeedReview} loading={q.loading} items={q.reviewCameras} paging={q.queuePaging("review", q.reviewCameras.length)}
        emptyTitle={t.noReviewTitle} emptyText={t.noReviewText}
        itemKey={(camera) => camera.id}
        renderItem={(camera) => <CameraQueueItem camera={camera} variant="review" queueBadge={q.queueBadge("camera", camera.id)} api={q.decisionApi} readableDate={q.readableDate} />}
      />

      )}
      {tab === "corrections" && (<>
      <QueueSection
        id="correction-requests-title" eyebrow={t.corrections} title={t.privateCorrections} note={`${q.queuePaging("corrections", q.corrections.length).note} ${t.pending}`}
        listLabel={t.privateCorrections} loading={q.loading} items={q.corrections} paging={q.queuePaging("corrections", q.corrections.length)}
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

      </>)}
      {tab === "edits" && (
      <QueueSection
        id="edit-requests-title" eyebrow={t.editing} title={t.editRequests} note={`${q.queuePaging("edits", q.editRequests.length).note} ${t.pending}`}
        listLabel={t.editRequests} loading={q.loading} items={q.editRequests} paging={q.queuePaging("edits", q.editRequests.length)}
        emptyTitle={t.noEditRequestsTitle} emptyText={t.noEditRequestsText}
        itemKey={(editRequest) => editRequest.id}
        renderItem={(editRequest) => <EditQueueItem editRequest={editRequest} queueBadge={q.queueBadge("camera_edit", editRequest.id)} api={q.decisionApi} readableDate={q.readableDate} />}
      />

      )}
      {tab === "history" && (
      <HistorySection
        events={q.recentEvents}
        readableDate={q.readableDate}
        readableAction={q.readableAction}
        readableReason={q.readableReason}
        readableStatus={q.readableStatus}
      />
      )}
      </div>
    </section>
  </main>;
}
