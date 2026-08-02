import { getD1 } from "./cameras";

/**
 * Coarse authorization roles enforced on every protected route (STATUS gap
 * #2, docs/decisions/0014-auth-roles-appeals.md):
 *
 *   - `contributor`: submit camera reports / corrections and file appeals;
 *   - `moderator`: operate the moderation queue and review appeals;
 *   - `admin`: everything a moderator can do, plus user/reviewer management
 *     (activate/deactivate accounts, change coarse roles).
 *
 * The granular DATA_TRUST reviewer roles (db/moderation.ts `reviewerRoles`)
 * live on the linked `reviewers` row and are enforced for moderation
 * *actions*; the coarse role gates the *route*. A user may have at most one
 * reviewer profile (`reviewers.user_id`), which the moderation PATCH derives
 * server-side instead of trusting a client-supplied actor id.
 */

export const userRoles = ["contributor", "moderator", "admin"] as const;
export type UserRole = (typeof userRoles)[number];

export const roleRank: Record<UserRole, number> = {
  contributor: 1,
  moderator: 2,
  admin: 3,
};

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return roleRank[role] >= roleRank[minimum];
}

export type UserRecord = {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  active: number;
  mfaEnabled: number;
  createdAt: string;
  updatedAt: string;
};

const userColumns =
  "id, email, display_name AS displayName, role, active, mfa_enabled AS mfaEnabled, created_at AS createdAt, updated_at AS updatedAt";

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const d1 = await getD1();
  return d1
    .prepare(`SELECT ${userColumns} FROM users WHERE email = ?`)
    .bind(email)
    .first<UserRecord>();
}

/**
 * Resolve the users identity linked to a contributor account via the
 * explicit `users.contributor_id` mapping (audit t_5ca60ab2, P2). This is
 * the ONLY acceptable bridge from a contributor session to a role identity:
 * email equality between `contributors` and `users` is never trusted, because
 * a contributor could register with an email matching any users row and
 * inherit that identity's role (spoofable attribution).
 */
export async function getUserByContributorId(contributorId: number): Promise<UserRecord | null> {
  const d1 = await getD1();
  return d1
    .prepare(`SELECT ${userColumns} FROM users WHERE contributor_id = ?`)
    .bind(contributorId)
    .first<UserRecord>();
}

export async function getUserById(id: number): Promise<UserRecord | null> {
  const d1 = await getD1();
  return d1
    .prepare(`SELECT ${userColumns} FROM users WHERE id = ?`)
    .bind(id)
    .first<UserRecord>();
}

export async function listUsers(): Promise<UserRecord[]> {
  const d1 = await getD1();
  const result = await d1
    .prepare(`SELECT ${userColumns} FROM users ORDER BY role, display_name`)
    .all<UserRecord>();
  return result.results;
}

export async function setUserActive(id: number, active: boolean): Promise<UserRecord | null> {
  const d1 = await getD1();
  const now = new Date().toISOString();
  const result = await d1
    .prepare(
      `UPDATE users SET active = ?, updated_at = ? WHERE id = ? RETURNING ${userColumns}`,
    )
    .bind(active ? 1 : 0, now, id)
    .first<UserRecord>();
  return result ?? null;
}

export async function setUserRole(id: number, role: UserRole): Promise<UserRecord | null> {
  const d1 = await getD1();
  const now = new Date().toISOString();
  const result = await d1
    .prepare(`UPDATE users SET role = ?, updated_at = ? WHERE id = ? RETURNING ${userColumns}`)
    .bind(role, now, id)
    .first<UserRecord>();
  return result ?? null;
}

/**
 * The reviewer profile linked to a user account, if any. The moderation PATCH
 * uses this to derive the acting reviewer server-side: a `moderator`-role
 * user acts as their own linked reviewer, an `admin` may act as any active
 * reviewer (stepping in for the demo actor selector).
 */
export async function getReviewerByUserId(userId: number): Promise<{
  id: number;
  displayName: string;
  role: string;
  active: number;
} | null> {
  const d1 = await getD1();
  return d1
    .prepare(
      "SELECT id, display_name AS displayName, role, active FROM reviewers WHERE user_id = ?",
    )
    .bind(userId)
    .first<{ id: number; displayName: string; role: string; active: number }>();
}
