import { getD1 } from "../cameras";

// ---------------------------------------------------------------------------
// Account erasure (RETENTION_SCHEDULE R7, TERMS §15 pre-launch item)
// ---------------------------------------------------------------------------

export type ErasureResult = {
  /** Whether a contributor row with this id existed and was hard-deleted. */
  deleted: boolean;
  /** Number of attributed reports that were de-attributed to anonymous. */
  deattributedReports: number;
  /** Number of community verifications given/received that were hard-deleted. */
  deletedConfirmations: number;
  /** Number of correction reports de-attributed to anonymous (SET NULL). */
  deattributedCorrections: number;
};

/**
 * Erase a contributor account (GDPR art. 17 erasure path, R7; community data
 * ADR 0018 §6.2).
 *
 * De-attribution is EXPLICIT, not FK-driven: `cameras.contributor_id` has no
 * ON DELETE action on purpose, so the only way to remove a contributor who
 * owns reports is this function — which first severs the attribution, then
 * revokes every session, then hard-deletes the account. The reported data
 * itself stays published: only the link between the account and its reports
 * is removed (RETENTION_SCHEDULE R7: "on verified records kept as
 * provenance … as long as the record is public"; the anonymous report keeps
 * its public fields, `contributor_id` becomes NULL).
 *
 * Community data (ADR 0018 §6.2): verifications *given* to other records are
 * hard-deleted — they were the contributor's own data, art. 17 — and the
 * verification count on every record drops back. Verifications *received*
 * by the erased account disappear with it. `camera_edit_requests` and
 * `correction_requests` are de-attributed with SET NULL, never deleted: the
 * requests (audit trail) survive, unlinked. `cameras` are never touched
 * beyond the existing de-attribution (the ADR 0013 pattern).
 *
 * The statements run as one atomic batch: a failure in any step rolls back
 * the whole erasure, so an account is never left half-deleted (e.g. sessions
 * gone but reports still attributed, or verifications deleted but the
 * contributor row surviving).
 *
 * Auth artifacts are hard-deleted explicitly, in the same batch: passkeys,
 * recovery codes, email-verification tokens, the transactional-email send
 * log, WebAuthn ceremony challenges, pending OIDC merge requests and API
 * keys (EPIC api-keys, D9) are the contributor's own data (art. 17), and
 * each of those tables declares ON DELETE CASCADE on `contributors.id` —
 * mirrored here because the test harness does not enforce foreign keys
 * (P2-2, t_adfc121b; same rule as `sessions` and `camera_community_actions`).
 * `oidc_states` is NOT included: it is pre-auth state with no contributor
 * link.
 *
 * Returns the number of reports de-attributed, community actions deleted
 * (ADR 0021 §13.1) and correction reports de-attributed (for the erasure
 * response and the audit trail) and whether the account row existed at all.
 */
export async function eraseContributor(contributorId: number): Promise<ErasureResult> {
  const d1 = await getD1();

  // A contributor that never existed (or was already erased) is a no-op:
  // nothing to de-attribute, nothing to delete.
  const existing = await d1
    .prepare("SELECT COUNT(*) AS n FROM contributors WHERE id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  if (Number(existing?.n ?? 0) === 0) {
    return { deleted: false, deattributedReports: 0, deletedConfirmations: 0, deattributedCorrections: 0 };
  }

  const attributed = await d1
    .prepare("SELECT COUNT(*) AS n FROM cameras WHERE contributor_id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  const deattributedReports = Number(attributed?.n ?? 0);
  const confirmations = await d1
    .prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE contributor_id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  // ADR 0021 §13.1: the contributor's community actions are their own data
  // (art. 17) — all types (confirm/like/gone/problem/privacy) are hard
  // deleted. The response field keeps the legacy name `deletedConfirmations`
  // for API compatibility; it now counts every deleted action row.
  const deletedConfirmations = Number(confirmations?.n ?? 0);
  const corrections = await d1
    .prepare("SELECT COUNT(*) AS n FROM correction_requests WHERE contributor_id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  const deattributedCorrections = Number(corrections?.n ?? 0);

  await d1.batch([
    // Community actions (ADR 0021 §13.1) are the contributor's own data
    // (art. 17): the rows are hard-deleted. Their influence on thresholds
    // and counts ends immediately — counts are recomputed live. Transitions
    // that already happened stay in history (aggregate, unattributed — no
    // personal data in camera_lifecycle_events).
    d1.prepare("DELETE FROM camera_community_actions WHERE contributor_id = ?").bind(contributorId),
    // Contribution-edit requests: SET NULL, never delete — the edit request
    // (and its moderation trail) survives, unlinked (audit, ADR 0018 §6.2).
    d1.prepare("UPDATE camera_edit_requests SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    // Correction reports: SET NULL, never delete (same rule as cameras).
    d1.prepare("UPDATE correction_requests SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    d1.prepare("UPDATE cameras SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    // Role-identity link (audit t_5ca60ab2, P2): sever the explicit
    // users.contributor_id mapping so the users row (an independently
    // provisioned role identity) survives, but can no longer attribute
    // appeals to the erased contributor.
    d1.prepare("UPDATE users SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    // Explicit auth-artifact deletion, mirroring the session rule below:
    // every table that references contributors with ON DELETE CASCADE is
    // deleted HERE, in the app layer, because the test harness does not
    // enforce FKs (real D1 would cascade on the contributor delete). Left
    // to the cascade alone, the in-memory harness leaves orphan rows and
    // the erasure contract is not actually exercised (P2-2, t_adfc121b).
    // Passkeys: the authenticator credential is the contributor's own
    // data (art. 17) — after erasure no ceremony may resolve it.
    d1.prepare("DELETE FROM passkeys WHERE contributor_id = ?").bind(contributorId),
    // Recovery codes: hashed single-use codes, own data — hard-deleted.
    d1.prepare("DELETE FROM recovery_codes WHERE contributor_id = ?").bind(contributorId),
    // Verification tokens: hashed, single-use — own data, hard-deleted.
    d1.prepare("DELETE FROM email_verification_tokens WHERE contributor_id = ?").bind(contributorId),
    // Transactional-email send log: rate-limit rows (no content, no
    // recipient) — own data, hard-deleted.
    d1.prepare("DELETE FROM email_send_log WHERE contributor_id = ?").bind(contributorId),
    // WebAuthn ceremony challenges: hashed challenges, own data. The
    // column is nullable, so the WHERE also covers challenge rows whose
    // contributor was never linked (no-op).
    d1.prepare("DELETE FROM webauthn_challenges WHERE contributor_id = ?").bind(contributorId),
    // Pending OIDC merge requests: single-use merge tokens bound to the
    // account — own data, hard-deleted (an unmergeable account must not
    // leave a live token behind).
    d1.prepare("DELETE FROM oidc_merge_requests WHERE contributor_id = ?").bind(contributorId),
    // API keys (EPIC api-keys, D9): the contributor's private write keys are
    // their own data (art. 17) — SHA-256 hashes and display prefixes are
    // hard-deleted so no ceremony or gate can ever resolve them after
    // erasure. Mirrors the ON DELETE CASCADE on api_keys.contributor_id
    // (same no-FK harness rule as the rows above).
    d1.prepare("DELETE FROM api_keys WHERE contributor_id = ?").bind(contributorId),
    // Explicit session revocation, mirroring logout: after erasure no
    // session of this contributor may resolve, in every environment
    // (real D1 would cascade on contributor delete, but the test harness
    // does not enforce FKs, so the app layer must be the source of truth).
    d1.prepare("DELETE FROM sessions WHERE contributor_id = ?").bind(contributorId),
    d1.prepare("DELETE FROM contributors WHERE id = ?").bind(contributorId),
  ]);

  return { deleted: true, deattributedReports, deletedConfirmations, deattributedCorrections };
}
