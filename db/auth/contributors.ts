import { getD1 } from "../cameras";
import { hashPassword, verifyPassword, verifyPasswordDummy } from "./password";
import type { Contributor, PublicContributor } from "./types";

// ---------------------------------------------------------------------------
// Contributors
// ---------------------------------------------------------------------------

const contributorColumns =
  "id, email, display_name AS displayName, password_hash AS passwordHash, email_verified_at AS emailVerifiedAt, auth_provider AS authProvider, created_at AS createdAt, updated_at AS updatedAt";

export const publicContributorColumns =
  "id, email, display_name AS displayName, email_verified_at AS emailVerifiedAt, auth_provider AS authProvider, created_at AS createdAt, updated_at AS updatedAt";

/**
 * Create a contributor and return the public profile. The unique email index
 * (`contributors_email_unique`) is the last line of defence: a race between
 * two registrations with the same email fails here with a constraint error,
 * which the route maps to 409.
 */
export async function createContributor(input: {
  email: string;
  displayName: string | null;
  password: string;
}): Promise<PublicContributor> {
  const d1 = await getD1();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(input.password);
  const result = await d1
    .prepare(
      `INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       RETURNING ${publicContributorColumns}`,
    )
    .bind(input.email, input.displayName, passwordHash, now, now)
    .first<PublicContributor>();
  if (!result) throw new Error("Contributor could not be created");
  return result;
}

/** Full row including the password hash — used only by the login verifier. */
export async function findContributorByEmail(email: string): Promise<Contributor | null> {
  const d1 = await getD1();
  return d1
    .prepare(`SELECT ${contributorColumns} FROM contributors WHERE email = ?`)
    .bind(email)
    .first<Contributor>();
}

export async function getContributorById(id: number): Promise<PublicContributor | null> {
  const d1 = await getD1();
  return d1
    .prepare(`SELECT ${publicContributorColumns} FROM contributors WHERE id = ?`)
    .bind(id)
    .first<PublicContributor>();
}

/**
 * Update the contributor's own display name (profile field, C6/C8 — the only
 * inline-editable profile field; editing is reserved to the profile, never to
 * contribution records). Returns the refreshed public profile, or null when
 * the account no longer exists (erased between the session read and this
 * update). `now` is injectable for deterministic tests.
 */
export async function updateContributorDisplayName(
  id: number,
  displayName: string | null,
  now: string = new Date().toISOString(),
): Promise<PublicContributor | null> {
  const d1 = await getD1();
  return d1
    .prepare(
      `UPDATE contributors SET display_name = ?, updated_at = ? WHERE id = ? RETURNING ${publicContributorColumns}`,
    )
    .bind(displayName, now, id)
    .first<PublicContributor>();
}

/**
 * Verify an email/password pair against the stored PBKDF2 hash. Returns the
 * public profile on success, null on unknown email or wrong password — the
 * route maps both to the same generic 401 so responses do not reveal which
 * part was wrong.
 *
 * QA#3 F1 (t_63e0d13c): an unknown email used to return immediately while a
 * registered email paid the full PBKDF2 cost — a response-TIME oracle that
 * enumerated accounts. The unknown-email branch now pays the same derivation
 * cost via verifyPasswordDummy, so the only remaining difference is the
 * lookup itself (a single indexed SELECT, no measurable signal).
 */
export async function authenticateContributor(
  email: string,
  password: string,
): Promise<PublicContributor | null> {
  const contributor = await findContributorByEmail(email);
  if (!contributor) {
    // Same 401, same cost: pay the PBKDF2 derivation so the response time
    // cannot distinguish "no such email" from "wrong password" (QA#3 F1).
    await verifyPasswordDummy(password);
    return null;
  }
  const valid = await verifyPassword(password, contributor.passwordHash);
  if (!valid) return null;
  return {
    id: contributor.id,
    email: contributor.email,
    displayName: contributor.displayName,
    emailVerifiedAt: contributor.emailVerifiedAt,
    authProvider: contributor.authProvider,
    createdAt: contributor.createdAt,
    updatedAt: contributor.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Write gate (multi-method auth Fase E1): contributor verification state
// ---------------------------------------------------------------------------

/**
 * The verification state the write gate checks (migration 0027,
 * multi-method auth Fase A). `email_verified_at` is the SINGLE source of
 * truth for "can this account write?": NULL means the account is not yet
 * verified and every state-changing write is refused, no matter how the
 * account was created (password, passkey or OIDC — Fase C/D set the same
 * column once the external identity is accepted).
 */
export type ContributorVerification = {
  id: number;
  emailVerifiedAt: string | null;
  /** Registration method: 'password' | 'passkey' | 'github' | 'google'. */
  authProvider: string;
};

/**
 * Read a contributor's verification state for the write gate
 * (app/lib/write-gate.ts). Returns null when the account no longer exists
 * (erased between the session read and this check) — the caller treats
 * that exactly like an anonymous request.
 */
export async function getContributorVerification(
  contributorId: number,
): Promise<ContributorVerification | null> {
  const d1 = await getD1();
  return d1
    .prepare(
      "SELECT id, email_verified_at AS emailVerifiedAt, auth_provider AS authProvider FROM contributors WHERE id = ?",
    )
    .bind(contributorId)
    .first<ContributorVerification>();
}
