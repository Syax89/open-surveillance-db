# Moderation policy

## Publication standard

OpenSurveillanceDB may publish a record only when it documents visible public surveillance infrastructure, has a clear civic-transparency purpose, contains no unnecessary personal data or sensitive operational detail, and has been reviewed by a trained moderator.

## Eligible examples

- A camera visibly mounted in a public street, square, station exterior, or public building exterior.
- A publicly documented traffic-monitoring camera, where publishing the record is lawful and safe.
- A record from an official public source, marked with its source and verification date.

## Exclusions

- Residential/private cameras, including doorbells and cameras facing a private home.
- Live video, stream URLs, credentials, network information, or control interfaces.
- Detailed field-of-view or operational capability that could create a safety risk.
- Sensitive facilities or locations where publication could materially increase risk.
- Images containing identifiable people, vehicle plates, or private interiors unless safely redacted and necessary.
- Unverifiable allegations about people or organisations.

## Review flow

1. **Receive:** create a private `pending` record; acknowledge without promising publication.
2. **Screen:** remove spam, personal data, prohibited content, and dangerous details.
3. **Verify:** assess whether the camera is public, visible, current, and within local policy.
4. **Minimise:** publish the least specific location and metadata that still serves transparency. Optional manufacturer and observation-date values are reviewed individually; approval of the camera does not publish them.
5. **Decide:** approve, request clarification, reject, or escalate; record a reason. When approving a camera, set the publication choice for manufacturer and observation date separately, with both choices defaulting to private.
6. **Maintain:** re-check periodically and respond to corrections or removal requests.

## Appeals and corrections

Before public launch, the project must provide a simple, reachable way to challenge a record, request correction, or report harm. Urgent privacy/safety reports should be temporarily hidden while reviewed. Decisions and rationale should be auditable internally, without exposing reporters or reviewers. Target response times for requests, appeals, and emergency hides are proposed in [MODERATION_SLA.md](MODERATION_SLA.md) — a draft for pre-launch review, not yet in force.

## Moderator safeguards

- Two-person review for sensitive or disputed records.
- Clear escalation route for legal/privacy questions.
- Separate moderation credentials from general contributor accounts.
- Training for consistent criteria and bias awareness.
- Regular review of published records, reversals, and false-positive patterns.
