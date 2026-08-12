"use client";

import { useSearchParams } from "next/navigation";
import { useMessages } from "../../lib/use-messages";
import { CorrectionForm } from "../home/CorrectionForm";
import { WriteGateWall } from "../WriteGateWall";

/**
 * /correggi tool body (F1 route group (tools)): the extracted CorrectionForm
 * promoted to its own route. `?record=ID` (e.g. from the record detail page)
 * pre-selects the related record and announces it with an aria-live region.
 * Noindex is set by the page's metadata (robots).
 *
 * P1-2 (design review): the form is gated by WriteGateWall — the write gate
 * (Fase E1, ADR 0020 d.1) requires a verified contributor, so anonymous and
 * unverified visitors get the bilingual login/verify wall instead of a form
 * that would fail with the raw server "Authentication required." string.
 */
export function CorreggiTool() {
  const t = useMessages().correction;
  const searchParams = useSearchParams();
  const recordParam = searchParams.get("record");
  const defaultRecordId = recordParam && /^\d+$/.test(recordParam) ? Number(recordParam) : null;
  // Keep the selected record through the login gate. A correction normally
  // starts from a record detail page, so dropping ?record= would force a
  // contributor to find it a second time after authenticating.
  const returnTo = defaultRecordId === null ? "/correggi" : `/correggi?record=${defaultRecordId}`;

  return (
    <section className="tool-section correction-tool" aria-labelledby="correction-tool-title">
      <div className="tool-heading"><p className="eyebrow"><span /> {t.accountability}</p><h1 id="correction-tool-title">{t.pageTitle}</h1><p>{t.pageIntro}</p></div>
      <WriteGateWall returnTo={returnTo}>
        <CorrectionForm defaultRecordId={defaultRecordId} showHeading={false} />
      </WriteGateWall>
    </section>
  );
}
