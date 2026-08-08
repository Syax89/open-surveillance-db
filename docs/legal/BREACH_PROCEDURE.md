# Personal data breach procedure (GDPR arts. 33-34)

- **Status:** in force — personal open-source project, 2026-08-08
- **Owner:** Rosa (Legal & Privacy Officer / privacy contact); containment coordinated with Ada (CTO)
- **Scope:** any incident that leads to accidental or unlawful destruction, loss, alteration, or unauthorised disclosure of, or access to, personal data held by OpenSurveillanceDB — including pending submissions, evidence, correction requests, and moderator identity attributes.

> **Disclaimer:** this document is product guidance / not legal advice. The document is in force for the pilot jurisdiction (Italy); per-jurisdiction review remains the documented precondition for an EU-wide launch.

---

## 1. Roles

| Role | Person (pre-launch) | Duty |
|------|--------------------|----|
| **Privacy contact / first responder** | Rosa (Legal & Privacy Officer) | Receive reports, run triage, decide notifications, own the breach register |
| **Technical containment** | Ada (CTO) | Stop the leak, preserve evidence, analyse root cause |
| **Communication** | Marie (docs) | Internal/external statements under privacy-contact direction |
| **Escalation** | Angelina (CEO) | High-risk incidents: approval of data-subject notification, external communication |
| **On-call** | Defined at launch (monitored mailbox + pager rotation) | Guarantee a response outside business hours once the service is public |

## 2. Detection

Sources of detection:

- Cloudflare incident notification (per the Cloudflare DPA, art. 33(2) flow — processor notifies us without undue delay);
- application/monitoring alerts (5xx spikes, unexpected 403/429 patterns, /moderation access anomalies once auth is wired);
- reports from users, moderators, or third parties (`privacy@opensurveillancedb.org` mailbox);
- scheduled internal checks (logs review, moderation audit log review).

Any team member who suspects a breach must report it to the privacy contact **within 1 hour** of suspicion — suspicion is enough; confirmation is the triage step.

## 3. Triage and severity assessment

1. **Confirm** whether personal data is involved and the breach type: confidentiality (unauthorised access/disclosure), integrity (alteration), availability (loss/destruction).
2. **Assess likelihood × impact** of risk to data subjects:

| | Low impact | Medium impact | High impact |
|---|---|---|---|
| **Likely** | Medium | High | **High** |
| **Unlikely** | Low | Medium | High |
| **Remote** | Low | Low | Medium |

Impact factors: data category (location data, evidence, identities rank higher), volume, whether data was pseudonymised, whether published, exploitability, mitigations in place (e.g. encryption at rest — D1 data is encrypted at rest by the provider; TLS in transit).

3. **Classify:**
   - **Low/Medium:** contain, document in the register; notify the Garante only if required by the assessment.
   - **High:** contain + notify the Garante within 72 h (art. 33) + assess data-subject notification (art. 34).
   - **Not personal data** (e.g. leak of demo records only): still document; no GDPR notification.

## 4. Containment and recovery

- Ada (CTO) leads: revoke/rotate credentials, take the affected route offline (e.g. disable the endpoint, apply auth — see H1/H2 mitigations), preserve logs and database state **before** remediation (Time Travel PITR can serve as evidence snapshot and rollback point), stop further exposure.
- For published-data incidents: hide affected records immediately (MODERATION_SLA.md emergency flow) pending review.
- Communicate internally on a need-to-know basis; no public statements without the privacy contact.

## 5. Notification

### 5.1 To the supervisory authority (art. 33 GDPR)

- **When:** within **72 hours** of becoming aware, unless the breach is unlikely to result in a risk to the rights and freedoms of natural persons. If not feasible within 72 h, notify with reasons for the delay.
- **Authority (IT):** *Garante per la protezione dei dati personali* (www.garanteprivacy.it — breach notification form).
- **Content (art. 33(3)):** nature of the breach; categories and approximate number of data subjects and records; measures taken/planned; contact point for information; where available, the data categories (not the data itself).
- The 72-h clock starts when the controller (privacy contact) *becomes aware* — i.e. at confirmation in step 3, not at discovery of suspicion.

### 5.2 To data subjects (art. 34 GDPR)

- **When:** where the breach is likely to result in a **high risk** to rights and freedoms — communicate **without undue delay**, in clear and plain language.
- **Content (art. 34(2)):** nature of the breach; the privacy contact to obtain more information; likely consequences; measures taken.
- **Exceptions (art. 34(3)):** (a) data were encrypted/pseudonymised such that they are unintelligible; (b) subsequent measures eliminate the high risk; (c) disproportionate effort — in that case a public communication (e.g. site notice, press release) is required instead.
- **Internal database leak vs. public dataset:** for the public dataset (mostly non-personal infrastructure data) art. 34 rarely applies; it applies to leaked pending submissions, evidence, or moderator identities.

## 6. Documentation (breach register)

Every breach — including low-risk and near-misses — is recorded:

| Field | Content |
|-------|---------|
| Date/time | When detected, when confirmed, when contained |
| Description | Facts, data categories, approximate volumes |
| Cause / root cause | Later analysis |
| Effects | Actual or potential consequences |
| Remedial action | Steps taken and by whom |
| Notification decision | To whom (Garante/data subjects/public), when, content, rationale |
| Lessons learned | Actions to prevent recurrence |

Retention: **2 years** (aligned with the audit log, RETENTION_SCHEDULE.md R5/R9); the register is not public.

## 7. Post-incident review

- Root-cause analysis with Ada; corrective actions tracked as tasks (this kanban board) with owners and deadlines.
- Review this procedure and the privacy notice if the incident reveals gaps; report lessons to the advisory circle (../GOVERNANCE.md).
- Aggregate breach statistics (counts by severity, no incident detail) feed the quarterly transparency report.

## 8. Communication templates (draft)

- **Internal alert:** `[BREACH] <severity> — <summary> — detected <timestamp> — owner <name>`.
- **Garante notification:** structured per art. 33(3) — see 5.1.
- **Data-subject notice:** plain-language email/page: what happened, what data, what we are doing, what they can do, contact.
- **Public statement (only via Marie under privacy-contact direction):** factual, no speculation, no victim blaming, no unverified details.

---

*Pre-launch note: this procedure becomes operational once the on-call rotation exists (the monitored mailbox is active; see PRIVACY_NOTICE.md § 9 and ../GOVERNANCE.md "Before launch").*
