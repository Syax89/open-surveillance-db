# Deployment and operations plan

## Local development

```bash
npm install
npm run dev
npm run build
```

The default local database is seeded with demo pins. Do not load real reports into a development machine or demo deployment.

## Preconditions for a public environment

- Public repository, domain ownership, maintainers, and contact address established.
- D1/database migrations reviewed and applied through a repeatable release process.
- Separate environments for development, staging, and production.
- Secrets stored in the hosting platform, never in source or client bundles.
- Automated backups, restoration drill, monitoring, error alerting, and incident runbook.
- Abuse controls: rate limiting, authentication where needed, moderation roles, and audit logs.
- Privacy notice, terms, correction/removal form, and retention schedule published.
- Approved map tile provider or self-hosted map infrastructure.

## Release procedure

1. Review changes, tests, migration impact, and documentation.
2. Deploy to staging with only synthetic/demo data.
3. Verify public routes do not expose `pending`, reviewer, account, or evidence data.
4. Confirm backups and rollback plan.
5. Deploy production, monitor health and error rates, and record the release.
6. Publish a concise changelog and data-export version where applicable.

## Environment variables

`NEXT_PUBLIC_SITE_URL` may be set to the canonical public URL for metadata generation. It must be absent or point to a non-production value in local development. Any future identity, storage, analytics, or notification settings need an explicit inventory and privacy review.
