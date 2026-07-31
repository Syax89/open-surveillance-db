// Mock of the `cloudflare:workers` runtime surface imported by the route
// handlers (`import { env } from "cloudflare:workers"`). The handlers read
// the submission environment knobs through `env`; the generous rate-limit
// ceiling keeps the runtime harness deterministic while the real
// rate-limit module still runs (the 429/submissions-disabled contract is
// covered statically in publication-boundaries.test.mjs).
export const env = {
  POST_RATE_LIMIT_MAX: "1000000",
  POST_RATE_LIMIT_WINDOW_SECONDS: "60",
  POST_SUBMISSIONS_DISABLED: "false",
  SEARCH_RATE_LIMIT_MAX: "1000000",
  SEARCH_RATE_LIMIT_WINDOW_SECONDS: "60",
};
