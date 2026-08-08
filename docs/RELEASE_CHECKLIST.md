# Local release checklist (current environment)

This checklist covers a release of the **current local environment**: the
always-on LAN test site on Proxmox LXC 114 (`osdb-test`,
http://192.168.1.201:3000). It is the concrete step-by-step companion to the
[release procedure](DEPLOYMENT.md#release-procedure) and to the environment
description in [DEPLOYMENT.md](DEPLOYMENT.md#local-lxc-deployment-current).

A **public** release is a different gate: see the
[preconditions for a public environment](DEPLOYMENT.md#preconditions-for-a-public-environment),
the operations manual ([docs/OPERATIONS.md](OPERATIONS.md)), and the
[roadmap](roadmap.md) (Wave C gate) before anything leaves the
LAN.

## Prerequisites

- Write access to `https://github.com/Syax89/open-surveillance-db` (branch +
  PR flow; releases are tagged `v*`, CI builds from the tag).
- A machine with Node.js `>= 22.13` for the verification steps.
- SSH root access to LXC 114 (`root@192.168.1.201`, deploy key injected at
  container creation; password login disabled).
- The site is reachable on the LAN: `http://192.168.1.201:3000`.

## Checklist

### 1. Prepare a clean main

```bash
git fetch origin --prune
git checkout main
git pull --ff-only origin main
git status -sb                 # working tree clean
```

- [ ] Local `main` is at the commit you intend to release.

### 2. Verify the build and tests

Run the same chain CI runs (documented in
[DEPLOYMENT.md](DEPLOYMENT.md#build-and-verification)):

```bash
npm ci            # reproducible install (requires Node >= 22.13)
npm run lint      # ESLint over app/, db/, worker/, build/
npx tsc --noEmit  # strict TypeScript check (includes worker-configuration.d.ts)
npm run build     # vinext production build -> dist/client + dist/server
npm test          # build + API contract and publication-boundary tests
```

> Last verified against `main` at `236dd6a` (2026-07-31): lint, type-check,
> build, and the full test suite (153 tests) all green on a clean `npm ci`.

- [ ] `npm ci` completes without errors.
- [ ] `npm run lint` reports no errors.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` produces `dist/client` and `dist/server`.
- [ ] `npm test` passes (runtime API tests + publication-boundary tests).

QA evidence from the latest E2E and navigation-test rounds is archived under
[`docs/qa/`](qa/) (`QA_REPORT_auth-flow-e2e.md`, `QA_REPORT_navigation-pages.md`).

### 3. Review what changed

```bash
git log --oneline <last-tag-or-commit>..HEAD | cat   # changes since last release
git diff --stat <last-tag-or-commit> HEAD            # surface area
ls db/migrations 2>/dev/null || ls drizzle/          # schema/migration changes
```

- [ ] Changes are understood and documented (PRs reviewed and merged).
- [ ] Schema/migration impact is known before deploying (D1 migrations are
      applied through the deploy tooling; the local LXC site uses the demo
      database, so a migration is not applied at runtime there).
- [ ] User-facing changes are reflected in `docs/roadmap.md`.

### 4. Update the changelog

- [ ] `CHANGELOG.md`: move the accumulated changes from `[Unreleased]` into a
      dated section for the new version (or keep them under `[Unreleased]` if
      no tag is being cut yet).
- [ ] Commit the changelog (and any doc updates) on a branch and merge via PR
      (docs-only PRs follow the same review flow).

### 5. Tag the release (numbered releases only)

```bash
git tag v0.1.0                    # match the version in package.json
git push origin v0.1.0            # CI builds from the tag
```

- [ ] Tag exists on `origin` (`git ls-remote --tags origin`).
- [ ] CI pipeline on the tag is green.

> Per [docs/OPERATIONS.md](OPERATIONS.md#51-identifying-versions), every
> release correlates to a `v*` tag. Record the tag/commit next to the deployed
> version so a rollback can identify it later.

### 6. Deploy to LXC 114

```bash
ssh root@192.168.1.201
cd /opt/open-surveillance-db
git fetch origin && git reset --hard origin/main
npm ci
systemctl restart osdb-test.service
systemctl status osdb-test.service --no-pager    # active (running)
journalctl -u osdb-test.service -n 50 --no-pager # no startup errors
```

- [ ] Service is `active (running)` after the restart.
- [ ] `journalctl` shows a clean startup (no `ERR_UNSUPPORTED_ESM_URL_SCHEME`
      or crash loop).

> The runtime is `vinext dev` under `workerd` (see the systemd unit and the
> runtime note in [DEPLOYMENT.md](DEPLOYMENT.md#runtime-choice-vinext-dev-not-vinext-start)).
> `npm ci` is required after updating `package-lock.json`.

### 7. Smoke test the public surface

From any LAN machine (expected results from the verified procedure in
[DEPLOYMENT.md](DEPLOYMENT.md#verification)):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://192.168.1.201:3000/                                        # 200
curl -sS -o /dev/null -w '%{http_code}\n' "http://192.168.1.201:3000/api/cameras/nearby?latitude=41.9004&longitude=12.4936&radius=50"  # 200
curl -sS -o /dev/null -w '%{http_code}\n' http://192.168.1.201:3000/guide                                  # 200
curl -sS -o /dev/null -w '%{http_code}\n' http://192.168.1.201:3000/api/moderation                         # 503 fail-closed (no creds)
curl -sS http://192.168.1.201:3000/api/cameras | grep -c '"notes"'                                        # 0 — private field never public
```

- [ ] `/` returns 200.
- [ ] `/api/cameras` returns 200 and contains only `demo`/`verified` records.
- [ ] `/api/cameras/nearby` returns 200.
- [ ] `/guide` returns 200.
- [ ] `/api/moderation` returns 503 without credentials (fail-closed).
- [ ] No `notes` field in public JSON responses.

### 8. Record the release

- [ ] Note the deployed commit/tag and (for Workers releases) the
      `wrangler` version-id in the changelog or the release issue, per
      [docs/OPERATIONS.md](OPERATIONS.md#51-identifying-versions).
- [ ] Update `docs/roadmap.md` if the release changes implemented capability.

## Rollback (local environment)

The local site tracks `origin/main`; rolling back is a redeploy of a previous
good commit:

```bash
ssh root@192.168.1.201
cd /opt/open-surveillance-db
git fetch origin
git reset --hard <previous-good-commit-or-tag>
npm ci
systemctl restart osdb-test.service
```

- [ ] Previous good commit identified (from the release record in step 8).
- [ ] Service is `active (running)` and smoke tests (step 7) pass again.

For the Cloudflare Workers deployment the rollback procedure is the
`wrangler rollback` plan in [docs/OPERATIONS.md](OPERATIONS.md#5-rollback-plan-previous-workers-versions).
