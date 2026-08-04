// Mock of the `cloudflare:workers` runtime surface imported by the route
// handlers (`import { env } from "cloudflare:workers"`). The handlers read
// the submission environment knobs through `env`; the generous rate-limit
// ceiling keeps the runtime harness deterministic while the real
// rate-limit module still runs (the 429/submissions-disabled contract is
// covered statically in publication-boundaries.test.mjs).
export const env = {
  POST_RATE_LIMIT_MAX: "1000000",
  POST_RATE_LIMIT_WINDOW_SECONDS: "60",
  READ_RATE_LIMIT_MAX: "1000000",
  READ_RATE_LIMIT_WINDOW_SECONDS: "60",
  EXPORT_RATE_LIMIT_MAX: "1000000",
  EXPORT_RATE_LIMIT_WINDOW_SECONDS: "60",
  NEARBY_RATE_LIMIT_MAX: "1000000",
  NEARBY_RATE_LIMIT_WINDOW_SECONDS: "60",
  REVISIONS_RATE_LIMIT_MAX: "1000000",
  REVISIONS_RATE_LIMIT_WINDOW_SECONDS: "60",
  MODERATION_RATE_LIMIT_MAX: "1000000",
  MODERATION_RATE_LIMIT_WINDOW_SECONDS: "60",
  APPEAL_RATE_LIMIT_MAX: "1000000",
  APPEAL_RATE_LIMIT_WINDOW_SECONDS: "60",
  ACTION_RATE_LIMIT_MAX: "1000000",
  ACTION_RATE_LIMIT_WINDOW_SECONDS: "60",
  POST_SUBMISSIONS_DISABLED: "false",
  SEARCH_RATE_LIMIT_MAX: "1000000",
  SEARCH_RATE_LIMIT_WINDOW_SECONDS: "60",
  // WebAuthn relying-party identity (multi-method auth Fase C, t_36989e06):
  // the routes read WEBAUTHN_* via webauthnRpConfig(). The test origin
  // matches apiRequest()'s https://osdb.test; rpID localhost keeps the
  // ceremony verification deterministic (verification itself is stubbed at
  // route level, covered for real in the WebAuthn conformance story).
  WEBAUTHN_RP_ID: "localhost",
  WEBAUTHN_RP_NAME: "OpenSurveillanceDB",
  WEBAUTHN_ORIGIN: "https://osdb.test",
};
