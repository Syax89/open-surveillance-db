// Mock of db/corrections as seen by the transpiled route handlers.

import { makeMock } from "../mock-state.mjs";

export const { createCorrectionRequest } = makeMock({
  createCorrectionRequest: "createCorrectionRequest",
});
