"use client";

import { useState } from "react";
import { useMessages } from "../LocaleProvider";
import { ReportForm } from "../home/ReportForm";
import { useReportFlow } from "../../lib/useReportFlow";

/**
 * /segnala tool body (F1 route group (tools)): the extracted ReportForm +
 * useReportFlow promoted to its own route. Noindex is set by the page's
 * metadata (robots), so this form page is never indexed.
 */
export function SegnalaTool() {
  const t = useMessages().report;
  const [notice, setNotice] = useState("");
  const report = useReportFlow({ setNotice });

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
