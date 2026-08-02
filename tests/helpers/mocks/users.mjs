// Mock of db/users as seen by the transpiled route handlers and the authz
// lib (app/lib/authz.ts imports getUserByEmail + roleAtLeast at runtime).
//
// The coarse role helpers (userRoles, roleRank, roleAtLeast) are pure values
// the route/authz code imports — they must mirror the real allowlist exactly,
// like the moderation mock mirrors moderationReasonCodes. The async user /
// reviewer lookups are stubs the tests control via mock-state: unstubbed
// calls throw, so no test can accidentally pass against default behaviour.

import { makeMock } from "../mock-state.mjs";

export const userRoles = ["contributor", "moderator", "admin"];

export const roleRank = {
  contributor: 1,
  moderator: 2,
  admin: 3,
};

export function roleAtLeast(role, minimum) {
  return roleRank[role] >= roleRank[minimum];
}

export const {
  getUserByEmail,
  getUserByContributorId,
  getUserById,
  listUsers,
  setUserActive,
  setUserRole,
  getReviewerByUserId,
} = makeMock({
  getUserByEmail: "getUserByEmail",
  getUserByContributorId: "getUserByContributorId",
  getUserById: "getUserById",
  listUsers: "listUsers",
  setUserActive: "setUserActive",
  setUserRole: "setUserRole",
  getReviewerByUserId: "getReviewerByUserId",
});
