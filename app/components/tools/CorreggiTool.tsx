"use client";

import { useSearchParams } from "next/navigation";
import { useMessages } from "../LocaleProvider";
import { publicRecords, prototypeRecords } from "../../lib/records";
import { usePublicCameras } from "../../lib/use-public-cameras";
import { CorrectionForm } from "../home/CorrectionForm";

/**
 * /correggi tool body (F1 route group (tools)): the extracted CorrectionForm
 * promoted to its own route. `?record=ID` (e.g. from the record detail page)
 * pre-selects the related record and announces it with an aria-live region.
 * Noindex is set by the page's metadata (robots).
 */
export function CorreggiTool() {
  const t = useMessages().correction;
  const searchParams = useSearchParams();
  const recordParam = searchParams.get("record");
  const defaultRecordId = recordParam && /^\d+$/.test(recordParam) ? Number(recordParam) : null;

  const { records } = usePublicCameras({
    seed: publicRecords(prototypeRecords),
  });

  return (
    <section className="tool-section correction-tool" aria-labelledby="correction-tool-title">
      <div className="tool-heading"><p className="eyebrow"><span /> {t.accountability}</p><h1 id="correction-tool-title">{t.pageTitle}</h1><p>{t.pageIntro}</p></div>
      <CorrectionForm records={records} defaultRecordId={defaultRecordId} showHeading={false} />
    </section>
  );
}
