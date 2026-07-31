# Personal data breach procedure

Status: **DRAFT — pre-launch.** Procedure under GDPR arts. 33 and 34 for
personal data breaches affecting the service. References: GDPR art. 4(12)
(definition), 33 (notification to the supervisory authority), 34
(communication to data subjects), 33(5) (breach register), 32 (security).

## 1. Definitions and scope

- **Personal data breach**: a breach of security leading to the accidental or
  unlawful destruction, loss, alteration, unauthorised disclosure of, or
  access to, personal data transmitted, stored, or otherwise processed.
- In scope: pending submissions, correction requests (incl. `contact`),
  moderation audit data, moderator identity data, and any future evidence.
  Public record data is not personal data but may be involved in an incident.

## 2. Detection

Sources: monitoring and error alerts (DEPLOYMENT.md), moderation team reports,
the security disclosure process (SECURITY.md — private, monitored address
before launch), hosting-provider notifications (Cloudflare), and internal
testing.

## 3. Triage — risk assessment (art. 33(1))

Within the first hours, assess likelihood and severity of risk to the rights
and freedoms of natural persons, considering:

- **Confidentiality**: was personal data disclosed to unauthorised parties?
- **Integrity**: was data altered or destroyed?
- **Availability**: was data made inaccessible (e.g. D1 outage, ransomware)?

Reference scenarios for this project:

| Scenario | Likely risk level | Notes |
| --- | --- | --- |
| Unauthorised access to `/moderation` (pending records, notes, correction requests visible) | High | Pending submissions contain location and free-text notes; correction requests may contain a contact address. |
| Public API leaking non-public fields (e.g. `notes` boundary regression — cf. finding H3) | Medium/High | Content not reviewed becomes public; mitigation: boundary tests, immediate fix and removal from exports. |
| Database exfiltration (D1 credentials, backups) | High | Includes evidence and moderation data if stored. |
| Logs capturing moderator email/full name (M4 regression) | Medium | Prevented by design; check all logging sinks if suspected. |
| Loss of availability (protracted outage / data loss) | Low/Medium | Restoration from encrypted backups; deletion obligations of the retention schedule may be affected. |

## 4. Notification to the supervisory authority (art. 33)

- Where the breach is likely to result in a **risk** to rights and freedoms,
  notify the Garante per la protezione dei dati personali (Italy) **within
  72 hours** of becoming aware (art. 33(1)).
- Content (art. 33(3)): (a) nature of the breach, categories and approximate
  number of data subjects and records; (b) name and contact of the DPO/privacy
  contact; (c) likely consequences; (d) measures taken or proposed. Where
  information is not yet available, it is provided in phases without undue
  delay (art. 33(4)).
- If the breach is **not likely** to result in a risk, it is documented
  internally and not notified (art. 33(1) second sentence); the reasoning is
  recorded.

## 5. Communication to data subjects (art. 34)

- Communicate **without undue delay** where the breach is likely to result in
  a **high risk** (art. 34(1)), in clear and plain language: nature of the
  breach, contact of the privacy team, likely consequences, measures taken.
- Exemptions (art. 34(3)): encryption or other measures making data
  unintelligible; subsequent measures eliminating the high risk; or where
  communication would involve disproportionate effort (public communication in
  that case).

## 6. Breach register (art. 33(5))

Record every breach — date, facts, effects, remedial action, notification
decisions and rationale. Proposed retention: 5 years from the last record,
extended on legal hold (the GDPR does not fix a term; 5 years is a practical
audit horizon to be confirmed with counsel).

## 7. Roles

- **Privacy/DPO lead (Rosa / legal function)**: risk classification,
  notification to the authority, communication to data subjects, register.
- **Technical lead (Ada / CTO)**: containment, fix, forensics, restoration.
- **Maintainers**: public communication, incident post-mortem.
- Notification to affected data subjects uses the channels of the privacy
  notice; where the only contact stored is the correction-request `contact`,
  it is used solely for this purpose.

## 8. Post-incident

1. Root-cause analysis and corrective actions (code, tests, access control).
2. Update this procedure, the PROCESSOR_REGISTER.md (if a processor caused the
   incident), and the incident runbook.
3. Assess whether the incident triggers a review of the DPIA (LAWFUL_BASIS.md).

## 9. Contact

Privacy contact placeholder (see PRIVACY_NOTICE.md section 1) and the
SECURITY.md disclosure address — both must be real and monitored **before**
launch (SECURITY.md).
