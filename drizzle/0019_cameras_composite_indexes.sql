-- F0 backend prereq (FRONTEND_PLAN § 3.2.5/3.2.6):
--   1. Normalise every non-ISO `updated` value to a real ISO timestamp so the
--      composite (status, updated DESC) index is usable. The old public
--      freshness filter defended against prose labels ("Demo data",
--      "Local moderation: ...") with a runtime GLOB, which defeats the index
--      seek; after this migration every row carries a comparable ISO value
--      and the GLOB is dropped from the queries. The schema column is NOT
--      NULL, so the fallback is the record creation date (always ISO), never
--      NULL.
--   2. Backfill `last_verified_at` for legacy `verified` rows that predate the
--      freshness columns (0005) or the 0007 recovery: the public freshness
--      windows are anchored on last_verified_at (domain decision § 3.2.6),
--      and a verified row without a verification moment would otherwise never
--      match a freshness window. The recovered verification timestamp lives
--      in `updated` (0007 already resolved it from the moderation trail);
--      demo rows keep NULL (illustrative, never "freshly verified").
--   3. Create the composite directory indexes (status, kind) and
--      (status, updated DESC) requested by the plan, plus
--      (status, last_verified_at DESC) that actually serves the freshness
--      range scans after the domain decision.
--
-- Idempotent: the UPDATEs only touch rows that still need fixing, and the
-- indexes use IF NOT EXISTS.

UPDATE cameras
SET updated = created_at
WHERE updated NOT GLOB '[0-9][0-9][0-9][0-9]-*';

UPDATE cameras
SET last_verified_at = updated
WHERE status = 'verified'
  AND last_verified_at IS NULL
  AND updated GLOB '[0-9][0-9][0-9][0-9]-*';

CREATE INDEX IF NOT EXISTS cameras_status_kind_idx ON cameras (status, kind);
CREATE INDEX IF NOT EXISTS cameras_status_updated_idx ON cameras (status, updated DESC);
CREATE INDEX IF NOT EXISTS cameras_status_last_verified_idx ON cameras (status, last_verified_at DESC);
