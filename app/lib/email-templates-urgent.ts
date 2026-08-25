import { escapeHtml } from "./email-templates";

/**
 * Urgent report email (issue #438): renders the /correggi urgent-report
 * intake into a plain, readable notification for privacy@. The report is
 * ALREADY persisted by POST /api/corrections (same intake, issueType
 * whitelist) — this only notifies the operator so urgent cases are seen
 * without a moderation login. All user-supplied values are escaped.
 */
export function renderUrgentReportEmail(input: {
  referenceId: number;
  issueType: string;
  recordId: number | null;
  message: string;
  contact: string;
}): { subject: string; html: string; text: string } {
  const subject = `[OSDB] Urgent report #${input.referenceId} (${input.issueType})`;
  const rows = [
    ["Reference", `#${input.referenceId}`],
    ["Issue type", input.issueType],
    ["Record", input.recordId === null ? "—" : String(input.recordId)],
    ["Message", input.message],
    ["Contact", input.contact === "" ? "(none provided)" : input.contact],
  ];
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = `<table role="presentation" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="text-align:left;vertical-align:top">${escapeHtml(label)}</th><td>${escapeHtml(value).replace(/\n/g, "<br />")}</td></tr>`,
    )
    .join("")}</table>`;
  return { subject, html, text };
}
