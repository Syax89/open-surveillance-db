// Mock of db/import-sources as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.
// (Import pipeline FASE C, t_4dbce318.)
import { makeMock } from "../mock-state.mjs";

export const {
  listCommittedImportBatches,
  getImportBatchById,
} = makeMock({
  listCommittedImportBatches: "listCommittedImportBatches",
  getImportBatchById: "getImportBatchById",
});
