// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Contributor = {
  id: number;
  email: string;
  displayName: string | null;
  passwordHash: string;
  emailVerifiedAt: string | null;
  authProvider: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * What the API ever returns: the password hash never leaves the db layer.
 * `emailVerifiedAt` (migration 0027, Fase B) tells the client whether the
 * account can write yet — NULL until the address is verified, ISO timestamp
 * after. The write gate (Fase E1) enforces the same column server-side.
 */
export type PublicContributor = Omit<Contributor, "passwordHash">;

export type Session = {
  id: number;
  contributorId: number;
  tokenHash: string;
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type SessionWithContributor = Session & { contributor: PublicContributor };

export type ContributorSubmission = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
};
