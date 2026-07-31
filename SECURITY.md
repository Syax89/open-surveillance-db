# Security policy

## Scope

OpenSurveillanceDB is an open, non-commercial civic database of visible public
surveillance infrastructure. This policy covers vulnerabilities that could:

- expose contributor identities, pending submissions, evidence, or moderation data;
- expose database credentials or hosting secrets;
- permit unauthorized changes to published records or to the moderation queue;
- break the fail-closed behaviour of the moderation endpoints;
- break the public-data boundary (private fields such as `notes`, pending
  records, or reviewer attributes leaking through the API, exports, or UI).

The project is **privacy and safety by design**: if a finding touches personal
data (pending submissions, evidence, correction requests, moderator identity
attributes), it is also a personal-data incident and is handled under
[docs/legal/BREACH_PROCEDURE.md](docs/legal/BREACH_PROCEDURE.md).

## Reporting a vulnerability

### Private route (security reports) — preferred

Use the GitHub **Private Vulnerability Reporting** flow, which creates a
confidential advisory only the maintainers can see:

https://github.com/Syax89/open-surveillance-db/security/advisories/new

Do **not** open a public issue for a vulnerability. Public issues are for
feature discussion and non-sensitive bug reports only.

For payloads that contain personal data, evidence, or operational details,
**encrypt them with the project PGP key below** and include the ciphertext in
the advisory. Do not send raw sensitive data through unencrypted channels.

### PGP key

```
-----BEGIN PGP PUBLIC KEY BLOCK-----

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
t6wz8hRIXkSOB2xgFo9yV+DHZ58x
=cJVN
-----END PGP PUBLIC KEY BLOCK-----
```

- Fingerprint: `04E8 A3EE 7C72 188B D3AF 925D 496C F0BD 4920 D3F7`
- Key id: `496CF0BD4920D3F7` (RSA 4096, created 2026-07-31)
- The private key never leaves the maintainers' local GPG vault; the public
  key above is the only published form.

### What to include in a report

- Description of the vulnerability and its impact (what an attacker could do).
- Steps to reproduce, or a proof of concept, kept as small as possible.
- Which component (API, UI, worker, db, deployment) is affected.
- Any personal-data exposure — **encrypt it with the PGP key above** and do
  not include raw identities, evidence, or credentials in the advisory body.

### Response commitment

Targets (aligned with [docs/legal/MODERATION_SLA.md](docs/legal/MODERATION_SLA.md)):

| Event | Target |
|-------|--------|
| First response (acknowledgement + next step) | within 48 h |
| Substantive response / decision | within 14 days |
| Emergency: hide affected content | within 24 h |

If the report involves personal data, the incident handling in
[docs/legal/BREACH_PROCEDURE.md](docs/legal/BREACH_PROCEDURE.md) applies from
confirmation onward (Garante notification within 72 h for high-risk breaches).

## Public route (privacy requests)

The **correction / request-for-review form** on the site (correction form on
the home page, `app/api/corrections/route.ts`) remains the public route for:

- requests to correct, review, or remove a published record;
- privacy-related requests from data subjects (rights under the privacy
  notice, [docs/legal/PRIVACY_NOTICE.md](docs/legal/PRIVACY_NOTICE.md)).

These requests are non-public moderation requests and never contain security
exploit details.

## Current deployment status

The repository is public with CI (lint, type-check, tests, build, gitleaks,
npm audit). The always-on test site runs on a LAN-only container
(`osdb-test`, LXC 114, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)) and is
**not** exposed to the public internet. Do not treat it as a production
service, and do not load real reports into it.
