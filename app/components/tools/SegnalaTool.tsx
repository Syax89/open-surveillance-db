"use client";

import { useState } from "react";
import { useMessages } from "../LocaleProvider";
import { ReportForm } from "../home/ReportForm";
import { useReportFlow } from "../../lib/useReportFlow";
import type { ReportCoordinates } from "../../lib/report-coordinates";

type Props = {
  /**
   * Position pre-filled from the /segnala URL shell (?lat=&lng= — the deep
   * link the /mappa pick popup builds, t_6abb96ac). Null when the form is
   * opened plain (no deep link).
   */
  initialCoordinates?: ReportCoordinates | null;
};

/**
 * /segnala tool body (F1 route group (tools)): the extracted ReportForm +
 * useReportFlow promoted to its own route. Noindex is set by the page's
 * metadata (robots), so this form page is never indexed.
 */
export function SegnalaTool({ initialCoordinates = null }: Props) {
  const t = useMessages().report;
  const [notice, setNotice] = useState("");
  const report = useReportFlow({ setNotice, initialCoordinates });

  return (
    <section className="tool-section report-tool" aria-labelledby="report-tool-title">
      <div className="tool-heading"><p className="eyebrow"><span /> {t.contribute}</p><h1 id="report-tool-title">{t.pageTitle}</h1><p>{t.pageIntro}</p></div>
      <ReportForm
        coordinates={report.coordinates}
        manualLatitude={report.manualLatitude}
        setManualLatitude={report.setManualLatitude}
        manualLongitude={report.manualLongitude}
        setManualLongitude={report.setManualLongitude}
        nearbyCandidates={report.nearbyCandidates}
        nearbyLoading={report.nearbyLoading}
        nearbyError={report.nearbyError}
        duplicateConfirmationRequired={report.duplicateConfirmationRequired}
        duplicateConfirmed={report.duplicateConfirmed}
        setDuplicateConfirmed={report.setDuplicateConfirmed}
        photos={report.photos}
        photoUploading={report.photoUploading}
        photoInputRef={report.photoInputRef}
        onPhotoSelected={report.onPhotoSelected}
        removePhoto={report.removePhoto}
        selectManualCoordinates={report.selectManualCoordinates}
        submitReport={report.submitReport}
      />
      {notice && <p className="notice" role="status">{notice}</p>}
    </section>
  );
}
