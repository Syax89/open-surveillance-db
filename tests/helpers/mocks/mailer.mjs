// Mock of db/mailer as seen by the transpiled route handlers (canonical
// transactional mailer, AUTH MULTI-METODO Fase A2 — ADR 0020 decision 2).
//
// The routes call sendAuthEmail (render → rate-limit → provider → log) and
// canSendAuthEmail (the email_send_log pre-flight budget). Both go through
// makeMock so each test stubs the exact outcome it needs; unstubbed calls
// throw so a route that forgot to stub cannot pass by accident. The pure
// knobs (mailerFromAddress, emailSendLimits) and the default constants run
// for real, so routes and tests share the same numbers.

import { makeMock } from "../mock-state.mjs";

export const EMAIL_SEND_LIMIT_DEFAULT_MAX = 3;
export const EMAIL_SEND_LIMIT_DEFAULT_WINDOW_SECONDS = 60 * 60;

export function mailerFromAddress(config) {
  const values = config ?? {};
  const override = values.MAILER_FROM;
  return typeof override === "string" && override.length > 0
    ? override
    : "noreply@opensurveillancedb.org";
}

export function emailSendLimits(config) {
  const values = config ?? {};
  const maxRequests = Number(values.EMAIL_SEND_LIMIT_MAX);
  const windowSeconds = Number(values.EMAIL_SEND_LIMIT_WINDOW_SECONDS);
  return {
    maxRequests:
      Number.isFinite(maxRequests) && maxRequests > 0
        ? maxRequests
        : EMAIL_SEND_LIMIT_DEFAULT_MAX,
    windowSeconds:
      Number.isFinite(windowSeconds) && windowSeconds > 0
        ? windowSeconds
        : EMAIL_SEND_LIMIT_DEFAULT_WINDOW_SECONDS,
  };
}

export const {
  sendAuthEmail,
  canSendAuthEmail,
  recordEmailSend,
  sendMail,
  verifyBaseUrl,
} = makeMock({
  sendAuthEmail: "sendAuthEmail",
  canSendAuthEmail: "canSendAuthEmail",
  recordEmailSend: "recordEmailSend",
  sendMail: "sendMail",
  verifyBaseUrl: "verifyBaseUrl",
});
