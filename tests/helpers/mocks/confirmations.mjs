// Mock of db/confirmations as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.
// confirmationQuota is a pure knob resolver (no db, no crypto): it runs for
// real, exactly like the pure helpers in the auth mock.

import { makeMock } from "../mock-state.mjs";

export function confirmationQuota(envValue) {
  const config = envValue ?? {};
  const read = (key, fallback) => {
    const value = Number(config[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    maxPerDay: read("CONFIRMATIONS_DAILY_MAX", 20),
    maxPerDayTrusted: read("CONFIRMATIONS_DAILY_MAX_TRUSTED", 40),
    perRecordPerDay: read("CONFIRMATIONS_PER_RECORD_DAILY_MAX", 5),
  };
}

export const {
  confirmationCountsFor,
  recordConfirmationCount,
  getConfirmation,
  setConfirmation,
  removeConfirmation,
  verifiedContributionCount,
} = makeMock({
  confirmationCountsFor: "confirmationCountsFor",
  recordConfirmationCount: "recordConfirmationCount",
  getConfirmation: "getConfirmation",
  setConfirmation: "setConfirmation",
  removeConfirmation: "removeConfirmation",
  verifiedContributionCount: "verifiedContributionCount",
});
