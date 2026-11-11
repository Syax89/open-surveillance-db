/** Static agent/API discovery documents served at the edge (split from worker/index.ts). */

/**
 * OAuth Protected Resource Metadata (RFC 9728, 2026-08-22): describes the
 * resource server's bearer-credential requirements for the write API —
 * the scopes an API key can carry and the header method. Published because
 * the isitagentready authMd check requires the PRM document at
 * /.well-known/oauth-protected-resource; the values are real OSDB facts
 * (scopes from db/api-keys.ts, bearer header from app/lib/write-gate.ts).
 * authorization_servers names this origin because key issuance happens
 * here (account settings), NOT because an OAuth authorization server
 * exists — /auth.md states that explicitly. No AS metadata document is
 * published (there is no OAuth token endpoint to describe).
 */
export const OAUTH_PROTECTED_RESOURCE = {
  // `resource` matches the scanned site origin exactly (RFC 9728 allows a
  // string or array; the scanner's validator requires the value to match
  // the target — a path suffix is rejected as a mismatch).
  resource: "https://opensurveillancedb.org",
  resource_name: "OpenSurveillanceDB API",
  authorization_servers: ["https://opensurveillancedb.org"],
  scopes_supported: ["submit", "confirm", "edit", "action"],
  bearer_methods_supported: ["header"],
};

/**
 * OAuth Authorization Server metadata (RFC 8414 shape, 2026-08-22): the
 * authMd check follows authorization_servers from the PRM and requires
 * this document with an `agent_auth` block. All values are real OSDB
 * facts — the registration method is email-verified account registration
 * (register_uri /identity_endpoint) with the email verification link as
 * the claim ceremony (claim_uri), issuing scoped API keys (credentials).
 * Deliberately NO authorization/token/jwks endpoints: OSDB does not run
 * an OAuth token flow, and publishing fake endpoints would be worse than
 * omitting them — /auth.md states the credential model explicitly.
 */
export const OAUTH_AUTHORIZATION_SERVER = {
  issuer: "https://opensurveillancedb.org",
  service_documentation: "https://opensurveillancedb.org/api-docs",
  scopes_supported: ["submit", "confirm", "edit", "action"],
  agent_auth: {
    skill: "https://opensurveillancedb.org/auth.md",
    register_uri: "https://opensurveillancedb.org/register",
    identity_endpoint: "https://opensurveillancedb.org/api/auth/register",
    claim_uri: "https://opensurveillancedb.org/api/auth/verify-email",
    identity_types_supported: ["identity_assertion"],
    credential_types_supported: ["api_key"],
    identity_assertion: {
      assertion_types_supported: ["verified_email"],
      credential_types_supported: ["api_key"],
    },
  },
};

/**
 * Agent index document (DNS-AID, draft-mozleywilliams-dnsop-dnsaid):
 * the organization-level registry of agent services, pointed to by the
 * `_index._agents.opensurveillancedb.org` SVCB/HTTPS records. Only real
 * services — every URL below answers 200.
 */
export const AGENT_INDEX = {
  index: "https://opensurveillancedb.org/.well-known/agent-index.json",
  organization: "OpenSurveillanceDB",
  description:
    "Open database of publicly visible surveillance cameras: fixed CCTV, traffic cameras, license-plate readers and similar infrastructure that watches public space.",
  agent_services: [
    {
      name: "OpenSurveillanceDB API",
      type: "web-api",
      description: "Read and write access to the camera database. Read endpoints are keyless; write endpoints require a scoped Bearer API key.",
      api_catalog: "https://opensurveillancedb.org/.well-known/api-catalog",
      openapi: "https://opensurveillancedb.org/openapi.json",
      documentation: "https://opensurveillancedb.org/api-docs",
      authentication: "https://opensurveillancedb.org/auth.md",
    },
    {
      name: "Agent registration",
      type: "auth",
      description: "Register a credential for write access: /api/auth/register (email + verification), /api/auth/keys (scoped API key). No OAuth token flow exists.",
      auth_md: "https://opensurveillancedb.org/auth.md",
      oauth_authorization_server: "https://opensurveillancedb.org/.well-known/oauth-authorization-server",
      oauth_protected_resource: "https://opensurveillancedb.org/.well-known/oauth-protected-resource",
    },
    {
      name: "Markdown content",
      type: "content",
      description: "The main public pages are served as Markdown to agents via Accept: text/markdown content negotiation.",
      pages: ["https://opensurveillancedb.org/", "https://opensurveillancedb.org/api-docs", "https://opensurveillancedb.org/guide", "https://opensurveillancedb.org/privacy", "https://opensurveillancedb.org/faq", "https://opensurveillancedb.org/contatti", "https://opensurveillancedb.org/manifesto"],
    },
  ],
};

/**
 * Markdown for Agents (2026-08-22, isitagentready `markdownNegotiation`):
 * curated Markdown renderings of the main public pages, served when the
 * client sends `Accept: text/markdown`. Summaries are honest — titles and
 * section headings verified against the live pages — and link to the HTML
 * originals. `Vary: Accept` keeps edge caches separate per variant; zero
 * D1, zero app-router CPU, edge-cacheable 1h. Pages NOT in the map (and
 * every API route) are never negotiated.
 */
export const MARKDOWN_PAGES: Record<string, string> = {
  "/": `# OpenSurveillanceDB

Public data about public surveillance.

OpenSurveillanceDB is an open database of publicly visible surveillance cameras: fixed CCTV, traffic cameras, license-plate readers and similar infrastructure that watches public space. Every record documents the camera — where it is, who appears to operate it, what it captures — and the public evidence for each claim.

## What you can do

- **Explore the map** — https://opensurveillancedb.org/mappa
- **Search the directory** — https://opensurveillancedb.org/directory
- **Report a camera** — https://opensurveillancedb.org/segnala
- **Read the API documentation** — https://opensurveillancedb.org/api-docs
- **Machine-readable discovery**: API catalog (/.well-known/api-catalog), OpenAPI specification (/openapi.json), agent registration (/auth.md).

Visibility without surveillance: the database is public about public infrastructure, and deliberately does not publish live footage, tracking data, or private-home details. Faces and licence plates are stripped before anything is published.

Human page: https://opensurveillancedb.org/
`,
  "/api-docs": `# Public API

OpenSurveillanceDB exposes a documented public API for reading and (with a scoped API key) writing camera records.

- **OpenAPI specification**: https://opensurveillancedb.org/openapi.json (OpenAPI 3.0.3)
- **API catalog (RFC 9727)**: https://opensurveillancedb.org/.well-known/api-catalog
- **Agent registration (Auth.md)**: https://opensurveillancedb.org/auth.md

## Read endpoints (keyless)

List, bbox queries, GeoJSON/CSV exports, per-record detail, search, nearby, revisions, geocoding, raster tiles, import sources — no credentials required.

## Write endpoints (Bearer API key)

Publishing camera reports, corrections, community confirmations, actions and edits require an API key with the matching scope: \`submit\`, \`confirm\`, \`edit\`, \`action\`. Keys are created in the account settings (https://opensurveillancedb.org/account), sent as \`Authorization: Bearer <key>\`, stored hashed, revocable.

Full interactive documentation: https://opensurveillancedb.org/api-docs
`,
  "/guide": `# Guide — A public database, built with care.

How OpenSurveillanceDB works, in one document.

- **Find what you need** — search the directory, browse the map, export CSV/GeoJSON.
- **Visibility without operational surveillance** — the database documents cameras; it is not a surveillance tool.
- **From observation to public record** — contributions are evidence-based: each record cites its public source.
- **The public publication model** — anything published stays public; the site is an archive, not a message board.
- **Each status says what the record can support** — camera statuses reflect the strength of the evidence.
- **Why create an account?** — accounts let you report, correct, confirm and edit; they are never required to read.
- **You can edit your own contributions** — and correct others with evidence.
- **What confirmations mean** — community confirmations verify that a camera is still present and accurate.

Full guide: https://opensurveillancedb.org/guide
`,
  "/privacy": `# Privacy notice

OpenSurveillanceDB's privacy notice (controller: see section 1 of the full notice).

1. Who we are (controller)
2. What the service does
3. What personal data we process
4. What we do NOT collect or publish
5. Recipients and transfers
6. International data transfers
7. Retention
8. Your rights (GDPR Articles 15–22)

The database publishes information about cameras, not about people: faces and licence plates are stripped before publication. Full notice: https://opensurveillancedb.org/privacy
`,
  "/faq": `# FAQ — Clear answers about how the database works.

Frequently asked questions about OpenSurveillanceDB: what the database contains, how cameras are documented, how to contribute, correct or remove a record, and how privacy is protected.

Still have questions? https://opensurveillancedb.org/contatti
`,
  "/contatti": `# Contacts — Who runs this, and how to reach us.

Who runs OpenSurveillanceDB and how to reach the maintainers.

- **Corrections and removal** — how to request a correction or removal of a record.
- **Reporting a security vulnerability** — responsible-disclosure contact for security issues.

Full page: https://opensurveillancedb.org/contatti
`,
  "/manifesto": `# A manifesto for legible public space.

What OpenSurveillanceDB stands for.

- **Transparency is a condition of public space** — people deserve to know the surveillance systems around them.
- **Help people understand the systems around them** — legibility, not fear.
- **Free, open and safe by design** — open data, ODbL licensed, safety by design.
- **What we deliberately do not do** — no live footage, no tracking, no private-home details.
- **Open where it is safe to be open** — openness has limits where safety requires them.

Full manifesto: https://opensurveillancedb.org/manifesto
`,
};

/**
 * Auth.md agent registration discovery (2026-08-22, isitagentready
 * `authMd`): a self-contained Markdown document at /auth.md telling AI
 * agents how to register for WRITE access to the API. OpenSurveillanceDB
 * does NOT run an OAuth authorization server — it issues its own scoped
 * API keys — so the Auth.md spec's fallback path applies (no PRM / OAuth
 * AS metadata is published, and the document explains the credential
 * model itself). Served like the API catalog: before the app router,
 * static, edge-cacheable.
 */
export const AUTH_MD = `# auth.md — OpenSurveillanceDB Agent Registration

Not an agent? You might be looking for https://opensurveillancedb.org/api-docs.

You are an agent. This document tells you how to register a credential for the **OpenSurveillanceDB write API** — publishing camera reports, corrections, community confirmations, actions and edits. Read access to the API is keyless and needs no registration. Follow the steps in order; do not skip ahead.

Endpoints live at \`https://opensurveillancedb.org\`. The machine-readable API surface is the API catalog (/.well-known/api-catalog), the OpenAPI specification (/openapi.json) and the human documentation (/api-docs).

## Step 1 — Register an account

\`\`\`http
POST /api/auth/register HTTP/1.1
Host: opensurveillancedb.org
Content-Type: application/json

{"email": "agent@example.com", "password": "<12+ character password>"}
\`\`\`

A verification email is sent to the address (one per five minutes per address). Complete the link inside it before Step 3.

## Step 2 — Sign in to create an API key

\`\`\`http
POST /api/auth/login HTTP/1.1
Host: opensurveillancedb.org
Content-Type: application/json

{"email": "agent@example.com", "password": "<password>"}
\`\`\`

The response sets a session cookie. Keep that cookie for Step 3; it is the proof of the verified account and is never a credential for the data API.

## Step 3 — Create an API key

\`\`\`http
POST /api/auth/keys HTTP/1.1
Host: opensurveillancedb.org
Content-Type: application/json
Cookie: <session cookie from Step 2>

{"name": "my-agent", "scopes": ["submit", "confirm", "edit", "action"], "expiresAt": "2027-01-01T00:00:00.000Z"}
\`\`\`

- \`scopes\`: non-empty subset of \`submit\`, \`confirm\`, \`edit\`, \`action\` — one line each below.
- \`expiresAt\`: ISO-8601 UTC; default one year, explicit null = never.
- The key is shown **exactly once** in the response — store it; it cannot be recovered, only reissued.

Scopes:

- \`submit\` — publish camera reports and corrections.
- \`confirm\` — cast or withdraw community confirmations.
- \`edit\` — update camera details.
- \`action\` — cast or withdraw community actions.

## Step 4 — Use the credential

Send the key as a bearer credential in the Authorization header on every write request:

\`\`\`http
POST /api/cameras HTTP/1.1
Host: opensurveillancedb.org
Content-Type: application/json
Authorization: Bearer <api key from Step 3>

{"title": "Example camera", "latitude": 47.41, "longitude": 8.57, "kind": "Fixed dome"}
\`\`\`

- Credentials in the query string are rejected (HTTP 400) — header only.
- Each endpoint requires the scope shown in its documentation (/api-docs).
- Keys are stored hashed and never logged; revoke a key from the account settings (https://opensurveillancedb.org/account) at any time.

## No OAuth authorization server

OpenSurveillanceDB does not run an OAuth authorization server: it issues its own scoped API keys, so no OAuth Authorization Server metadata is published and this document is self-contained. Token requests against OAuth endpoints are not supported.

## Notes for agents

- Respect the rate limits documented in /api-docs; bulk exports are metered separately.
- The dataset is licensed ODbL 1.0 — see /api-docs for attribution requirements.
- Do not probe account endpoints; create a real test account for integration testing.
`;
